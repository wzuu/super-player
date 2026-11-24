"""从战役入口沿主路通关第一关，检查 SQLite 或静态站点 IndexedDB 的真实结算。"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright
from campaign_browser import ROOT


def watch_page(page, errors, static):
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error"
            and urlsplit(msg.location.get("url", "")).path != "/favicon.ico" else None)
    if static:
        page.on("request", lambda req: errors.append("静态页面请求了 API " + req.url)
                if "api" in urlsplit(req.url).path.split("/") else None)


def recover_at_airlock(page):
    initial = page.evaluate("""() => {
      const g=run.game,door=g.level.entryDoor,p=g.player;
      if(!door.active) throw Error('开局气闸应关闭');
      window.airlockProgress=()=>[g.story.recoveryStage,g.story.doorStates,g.time,g.kills,g.core,
        g.weapon.ammo,g.weapon.reserve,g.loot.length,g.pickups.objects.filter(i=>i.active).length];
      Object.assign(p,{x:(door.x0+door.x1)/2,y:door.y0,z:(door.z0+door.z1)/2});
      if(!g.level.blocked(p.x,p.z,p.y,p.radius,p.height)) throw Error('测试落点须位于关闭门体内');
      return airlockProgress();
    }""")
    page.evaluate("document.exitPointerLock()")
    page.get_by_role("button", name="卡住脱离").click()
    assert "已回到安全位置" in page.locator("#menu-status").inner_text()
    assert page.evaluate("airlockProgress()") == initial
    assert page.evaluate("""() => {const g=run.game,p=g.player,d=g.level.entryDoor;
      return g.phase==='pause' && d.active && p.z>d.z1 && !g.level.blocked(p.x,p.z,p.y,p.radius,p.height);
    }""")
    page.get_by_role("button", name="继续游戏").click()
    page.wait_for_function("run.game.phase==='play'", polling=100)


def verify(browser, url, static=False, rooms=False):
    root = url.rstrip("/") + "/"
    before = None
    page = browser.new_page(viewport={"width": 960, "height": 620})
    page.add_init_script("""let seed=5381; Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
        if(location.pathname.includes('/underground-lab/')) window.requestAnimationFrame=()=>1;
        localStorage.setItem('super-player:preferences:v1',JSON.stringify({muted:true}));
        localStorage.setItem('super-player:variation:1',JSON.stringify({pending:'quiet'}));""")

    def expose(route):
        response = route.fetch()
        entry = "    startLevel(definition, campaign, campaignStage);"
        fields = "return { game, scene, camera, renderer, config:"
        html = response.text()
        assert response.ok and html.count(entry) == html.count(fields) == 1, response.url
        html = html.replace(entry, "    window.run=startLevel(definition,campaign,campaignStage);")
        html = html.replace(fields, "return { game,input,scene,camera,renderer,config:")
        # Playwright 返回解压后的正文。诊断页改写了 HTML，原传输编码和长度随之失效。
        headers = {name:value for name,value in response.headers.items()
                   if name not in {"content-encoding", "content-length", "transfer-encoding"}}
        route.fulfill(status=response.status, headers=headers, body=html)

    page.route(re.compile(r"/underground-lab/(?:index\.html)?(?:\?.*)?$"), expose)
    errors = []
    watch_page(page, errors, static)
    try:
        if rooms:
            before=page.request.get(root+'api/progress').json()['battleCount']
        page.goto(root if static else root + "underground-lab/?campaign")
        if not rooms or before == 0:
            page.get_by_role("button", name="直接开始", exact=True).click(force=True)
        if static:
            page.locator("#continue").click()
            page.wait_for_url(root + "underground-lab/")
        page.wait_for_function("!!window.run", polling=100)
        page.locator("#start").click(force=True)
        page.wait_for_function("run.game.phase==='play'", polling=100)
        recover_at_airlock(page)
        if rooms:
            page.add_script_tag(content=(ROOT/'level-kit/tests/lab_layout.js').read_text(encoding='utf8'))
            result=page.evaluate('() => verifyLabLayout({offsets:[0],extract:true})')
            page.wait_for_function("async count=> (await (await fetch('/api/progress')).json()).battleCount>count", arg=before, polling=100)
            saved=page.request.get(root+'api/progress').json()
            names={item['name'] for item in saved['loot']}
            assert saved['battles'][0]['won'] and saved['levels'][0]['cleared'], saved
            assert '冷藏档案室样本箱' in names and '秘藏·培养罐原始编号' in names and sum('查获记录' in n for n in names)==6, (result,names)
            print('PASS SQLite 逐室战利品',sorted(names),result['optional'],flush=True)
            assert not errors, errors
            return
        result = page.evaluate((ROOT/"level-kit/tests/lab_live_driver.js").read_text(encoding="utf-8"))
        print(json.dumps(result, ensure_ascii=False), flush=True)
        assert result["phase"] == "win" and not result["optional"] and not result["sideRooms"], result
        assert result["missed"] and result["gunBreaks"] and result["pulseBreaks"], result
        assert result["spawned"] == [100,100,100] and result["enterAmmo"] and sum(result["afterBoss"])>0, result
        assert not result["core"] and result["boxes"] and all(b["fixed"] for b in result["boxes"]), result
        assert sum(result["startingAmmo"]) + sum(b["taken"] for b in result["boxes"]) == result["shots"] + sum(result["ammo"]), result
        if static:
            page.wait_for_function("document.querySelector('#menu-status').textContent.includes('已保存')", polling=100)
            page.locator("#campaign-home").click(force=True)
            page.locator("#continue").wait_for()
            page.reload()
            page.wait_for_function("document.querySelector('#continue')?.href.endsWith('/shanhai-secret-realm/')", polling=100)
            saved = page.evaluate("""async () => {
                const store = await (await import('./campaign/store.mjs')).campaignStore();
                const progress = await store.progress(), history = await store.history();
                return {prefix:store.pendingPrefix, count:progress.battleCount, first:progress.levels[0],
                        second:progress.levels[1], battles:history.battles};
            }""")
            assert saved["prefix"].startswith("super-player-static:") and saved["count"] == 1, saved
            assert saved["first"]["cleared"] and saved["second"]["unlocked"], saved
            assert len(saved["battles"]) == 1, saved
            record = saved["battles"][0]
            assert record["level"] == "underground-lab" and record["won"] and record["kills"] == result["kills"], record
            print("PASS IndexedDB 刷新回读同一局胜利与击杀数，第二关已解锁", flush=True)
        else:
            page.wait_for_function("async()=> (await (await fetch('/api/progress')).json()).levels[1].unlocked", polling=100)
            saved = page.request.get(root + "api/progress").json()
            record = saved["battles"][0]
            assert saved["battleCount"] == 1 and saved["levels"][0]["cleared"] and saved["levels"][1]["unlocked"], saved
            assert record["level"] == "underground-lab" and record["won"] and record["kills"] == result["kills"], record
        assert not errors, errors
    finally:
        page.close()


if __name__ == "__main__":
    with TemporaryDirectory() as folder:
        server = subprocess.Popen([sys.executable, "-X", "utf8", "-u", "server.py", "--port", "0",
                                   "--db", str(Path(folder)/"campaign.sqlite")], cwd=ROOT,
                                  stdout=subprocess.PIPE, encoding="utf-8")
        try:
            url = re.search(r"http://127\.0\.0\.1:\d+", server.stdout.readline()).group()
            with sync_playwright() as pw:
                browser = pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER", "chrome"))
                try:
                    verify(browser, url)
                    verify(browser, url, rooms=True)
                finally:
                    browser.close()
        finally:
            server.terminate()
            server.wait(timeout=10)
