"""战役首页、镜头、军需经济及局内操作的浏览器回归。测试数据库为临时文件。"""
import os
import re
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

from playwright.sync_api import sync_playwright
from campaign_browser import LEVELS, ROOT, expose_game


def dashboard(browser, url):
    context = browser.new_context(viewport={"width": 1280, "height": 720})
    page = context.new_page()
    vendor = []
    page.on("request", lambda req: vendor.append(req.url) if req.url.endswith("three-r160.js") else None)
    page.goto(url)
    page.locator("#continue").wait_for()
    for width, height in [(1280, 720), (1920, 1080)]:
        page.set_viewport_size({"width": width, "height": height})
        assert page.evaluate("document.documentElement.scrollHeight <= innerHeight"), (width, height)
        assert page.locator(".mission-card").count() == len(LEVELS)
        if path := os.environ.get("GAME_TEST_SCREENSHOTS"):
            page.screenshot(path=str(Path(path) / f"dashboard-{width}.png"))
    page.locator(".mission-card").first.focus()
    page.keyboard.press("ArrowRight")
    assert page.locator("#game-title").inner_text() == LEVELS[1]["title"]
    page.locator("#settings-open").click()
    page.get_by_label("减弱镜头震动").check()
    page.get_by_label("受击震动强度").fill("0.4")
    page.get_by_label("显示受击方向").uncheck()
    page.get_by_label("画质").select_option("low")
    page.get_by_label("显示性能面板").check()
    page.get_by_label("视野角度").fill("85")
    page.get_by_label("技能一", exact=True).click()
    page.keyboard.press("z")
    assert page.get_by_label("技能一", exact=True).evaluate("button => button === document.activeElement")
    page.keyboard.press("Escape")
    page.locator('nav a[href="#history"]').click()
    assert not vendor, vendor
    page.goto(url + "/#collection")
    page.wait_for_function("document.querySelector('#rifle-canvas').width>300 && !document.querySelector('#rifle-canvas').hidden")
    page.locator('nav a[href="#missions"]').click()
    page.locator('nav a[href="#collection"]').click()
    page.locator(".rifle-option").nth(1).click()
    assert len(vendor) == 1, vendor
    direct = browser.new_page()
    cold = []
    direct.on("request",lambda req:cold.append(req.url) if req.url.endswith("three-r160.js") else None)
    direct.goto(url+"/#collection")
    direct.wait_for_function("document.querySelector('#rifle-canvas').width>300 && !document.querySelector('#rifle-canvas').hidden")
    assert len(cold)==1
    direct.close()
    print("PASS desktop layouts and first-use Three.js", flush=True)
    return page


def field(page, url):
    for i in range(2):
        response = page.request.post(url + "/api/battles", headers={"Origin": url}, data={
            "id": str(uuid4()), "level": LEVELS[i]["id"], "won": True, "kills": 1,
            "durationMs": 5000, "endedAt": 2000+i, "loot": [{"name": "测试宝物", "value": 520}],
        })
        assert response.ok
    stage = LEVELS[0]["id"]
    page.route(url + "/" + stage + "/", expose_game)
    page.goto(url + "/" + stage + "/")
    page.locator("#preparation summary").click()
    page.locator("#kit-slots select").nth(1).select_option("pulse")
    for item in ("magazine","reload","recovery","grenade"):
        with page.expect_response(lambda r: r.url.endswith("/api/gear") and r.request.method=="POST"):
            page.select_option("#shop-item", item)
            page.click("#shop-buy")
        page.wait_for_function("!document.querySelector('#shop-buy').disabled")
    page.click("#start")
    page.wait_for_function("run.game.phase==='play'")
    assert page.evaluate("run.game.weapon.ammo") == 66
    assert page.evaluate("Math.abs(run.config.weapon.reloadTime - 1.8*.92) < .0001 && Math.abs(run.config.weapon.heatRecovery - 1.1*1.1) < .0001")
    assert page.evaluate("run.config.graphics.particleScale") == .3
    assert page.evaluate("[run.config.feedback.hitShake, run.config.feedback.directionIndicators]") == [.4, False]
    result = page.evaluate("""() => {
      const g=run.game, r=g.player.look.rotation;
      r.x=-Math.PI/2+.04; const x=r.x, y=r.y;
      document.dispatchEvent(new MouseEvent('mousemove',{movementY:-1800,movementX:12}));
      for(let i=0;i<20;i++) g.encounter.setAlarm(i%2===1);
      return [x===r.x,y!==r.y];
    }""")
    assert result == [True,True]
    assert page.evaluate("run.camera.fov") == 85
    before = page.evaluate("""() => {
      const buttons=Array.from({length:16},()=>({pressed:false}));
      Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[{mapping:'standard',axes:[.8,0,.85,0],buttons}]});
      return run.game.player.look.rotation.y;
    }""")
    page.wait_for_function("yaw => run.game.player.look.rotation.y !== yaw", arg=before)
    page.evaluate("delete navigator.getGamepads")
    page.keyboard.press("z")
    page.wait_for_function("/翻滚 [1-6]s/.test(document.querySelector('#equipment-hud').textContent)")
    page.keyboard.press("e")
    page.wait_for_function("/冲击波 [0-9]+s/.test(document.querySelector('#equipment-hud').textContent)")
    page.keyboard.press("2")
    assert page.evaluate("run.game.kit.remaining().grenade") == 1
    assert page.evaluate("""() => {
        const {pickups, player} = run.game;
        pickups.add('core', player.x, player.z, player.y, '核心', 1);
        const slot = pickups.keyItem;
        if (!pickups.takeKey(player, run.game)) return false;
        pickups.add('ammo', player.x, player.z, player.y, '弹药', 1);
        return slot.kind === 'ammo' && !pickups.takeKey(player, run.game) && slot.active;
    }""")
    refresh = []
    page.route("**/api/gear", lambda route: refresh.append(route))
    page.evaluate("run.game.finish(true)")
    page.wait_for_function("document.querySelector('#menu-status').textContent.includes('已保存')")
    page.locator("#kit-slots select").nth(0).select_option("")
    assert len(refresh) == 1
    refresh[0].fulfill(response=refresh[0].fetch())
    page.unroute("**/api/gear")
    account = page.request.get(url+"/api/gear").json()
    assert account["state"]["spent"] == 790 and account["earned"] == 1040, account
    assert account["state"]["stock"]["grenade"] == 1 and account["state"]["stock"]["medkit"] == 1
    page.select_option("#mission-mode","endless")
    page.click("#start")
    page.wait_for_function("run.game.phase==='play'")
    assert page.request.get(url+"/api/gear").json()["state"]["skills"] == [None, "pulse"]
    assert page.evaluate("""() => {
      const g=run.game;g.time=46;g.objective.step(.02,g);
      g.player.hp=30;
      g.kit.use(2,g);g.kit.step(.9,g);g.player.lastHurt=g.time;g.kit.step(.7,g);
      if(g.player.hp!==30)throw Error('急救未被打断');
      g.kit.use(2,g);g.kit.step(1.51,g);
      if(g.player.hp!==60)throw Error('急救持续时间或回复量错误');
      return g.objective.reinforcements===2 && !g.ready();
    }""")
    page.evaluate("run.game.finish(false)")
    page.wait_for_function("document.querySelector('#menu-status').textContent.includes('已保存')")
    assert page.request.get(url+"/api/gear").json()["state"]["stock"]["grenade"] == 0
    page.goto(url)
    previous = page.context.new_page()
    previous.goto(url)
    previous.wait_for_function("document.querySelector('#battle-count').textContent.includes('4 局')")
    page.click("#new-campaign")
    page.get_by_role("button", name="创建存档并开始").click()
    page.wait_for_function("!!window.run")
    assert page.request.get(url+"/api/progress").json()["battleCount"] == 0
    previous.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted:true}))")
    previous.wait_for_function("document.querySelector('#battle-count').textContent.includes('0 局')")
    previous.close()
    page.goto(url)
    page.click("#save-open")
    page.get_by_label("切换存档").select_option("")
    page.wait_for_function("document.querySelector('#battle-count').textContent.includes('4 局')")
    print("PASS native pointer lock, kit slots, modifications, supplies, defeat and isolated profiles", flush=True)


def performance_probe(page, url):
    for level in LEVELS[2:-1]:
        response=page.request.post(url+"/api/battles",headers={"Origin":url},data={
            "id":str(uuid4()), "level":level["id"], "won":True, "endedAt":4000,
            "kills":1, "durationMs":5000, "loot":[]})
        assert response.ok
    stage=LEVELS[-1]["id"]
    page.route(url+"/"+stage+"/",expose_game)
    page.set_viewport_size({"width":960,"height":540})
    page.goto(url+"/"+stage+"/")
    page.click("#start")
    page.wait_for_function("run.game.phase==='play' && run.game.beasts.live>=80")
    sample=page.evaluate("""async () => {
        const g=run.game;g.player.hurtDelay=1000;
        const frame=()=>new Promise(requestAnimationFrame);
        async function windowStats(use) {
          const frames=[];let last=await frame();
          for(let i=0;i<45;i++){
            if(use && i===5)g.kit.use(1,g);
            if(use && i===25)g.kit.use(3,g);
            const now=await frame();frames.push(now-last);last=now;
          }
          frames.sort((a,b)=>a-b);
          return [Math.round(frames[22]),Math.round(frames[42])];
        }
        return {actors:g.beasts.live,baselineMs:await windowStats(false),kitMs:await windowStats(true),
                calls:run.renderer.info.render.calls, counter:document.querySelector('#performance').textContent};
    }""")
    assert sample["actors"]>=80 and sample["calls"]>0 and "FPS" in sample["counter"], sample
    print("PASS 80+ actors, frame median/p95",sample,flush=True)


def offline(browser):
    page=browser.new_page()
    page.goto((ROOT/"index.html").as_uri())
    page.locator("#continue").wait_for()
    assert page.locator(".mission-card").count()==len(LEVELS)
    page.click("#continue")
    page.locator("#start").click()
    page.wait_for_function("!!document.pointerLockElement && !document.querySelector('#hud').hidden")
    page.close()
    print("PASS direct-file campaign home and first level",flush=True)


if __name__ == "__main__":
    with TemporaryDirectory() as tmp:
        proc=subprocess.Popen([sys.executable,"-X","utf8","-u","server.py","--port","0","--db",str(Path(tmp)/"test.sqlite")],
                              cwd=ROOT,stdout=subprocess.PIPE,encoding="utf-8")
        try:
            url=re.search(r"http://127\.0\.0\.1:\d+",proc.stdout.readline()).group()
            with sync_playwright() as pw:
                browser=pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER","chrome"))
                try:
                    page=dashboard(browser,url)
                    field(page,url)
                    performance_probe(page,url)
                    offline(browser)
                finally:
                    browser.close()
        finally:
            proc.terminate()
            proc.wait(timeout=10)
