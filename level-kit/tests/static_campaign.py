"""在仓库名子路径挂载 Pages 产物，以无后端浏览器验证完整战役。"""

from collections import Counter
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
from shutil import copytree
import sys
from tempfile import TemporaryDirectory
from threading import Thread

from playwright.sync_api import sync_playwright
from campaign_browser import LEVELS, expose_game, finish_at_gate


class StaticFiles(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".mjs": "text/javascript"}

    def log_message(self, *args):
        pass


def verify(browser, root, site):
    context = browser.new_context(viewport={"width": 760, "height": 480})
    page = context.new_page()
    errors, api_requests = [], []
    page.on("pageerror", lambda err: errors.append(str(err)))
    page.on("request", lambda req: api_requests.append(req.url) if "/api/" in req.url else None)
    for level in LEVELS:
        page.route(root + level["id"] + "/", expose_game)
    page.goto(root)
    page.get_by_role("button",name="直接开始",exact=True).click()
    page.locator("#continue").wait_for()
    page.evaluate("""async first => {
        const store = await (await import('./campaign/store.mjs')).campaignStore();
        const id = crypto.randomUUID();
        localStorage.setItem(store.pendingPrefix + id, JSON.stringify({
            id, level:first, won:true, kills:1, durationMs:3000, endedAt:Date.now()
        }));
    }""", LEVELS[0]["id"])
    page.reload()
    page.locator("#retry").wait_for()
    assert page.locator("#continue").get_attribute("href") == "./" + LEVELS[0]["id"] + "/"
    stored_count = page.evaluate("""async () => {
        const { campaignStore } = await import('./campaign/store.mjs');
        const store = await campaignStore();
        return (await store.progress()).battleCount;
    }""")
    assert stored_count == 0
    page.goto(root + LEVELS[-1]["id"] + "/")
    page.wait_for_url("**/?locked=*")
    page.locator("#continue").click()
    collected = Counter()
    for i, level in enumerate(LEVELS):
        page.wait_for_function("!!window.run")
        assert page.url == root + level["id"] + "/"
        page.locator("#start").click()
        page.wait_for_function("run.game.phase === 'play'")
        assert page.evaluate("run.game.pickups.objects.filter(i => i.active && i.kind === 'rare').length") == 10
        if i == 0:
            page.evaluate("run.game.finish(false)")
            page.wait_for_function("document.querySelector('#menu-status').textContent.includes('已保存')")
            assert page.locator("#next-level").is_hidden()
            page.locator("#start").click()
            page.wait_for_function("run.game.phase === 'play'")
        if i == 1:
            assert page.evaluate("run.game.weapon.combat.skin") == LEVELS[0]["id"]
        picked = finish_at_gate(page)
        loot = page.evaluate("run.game.loot.map(item => item.name)")
        assert picked in loot
        collected.update((level["id"], name) for name in loot)
        if i == 0:
            page.locator("#campaign-home").click()
            page.locator('nav a[href="#collection"]').click()
            page.locator("#rifle-equip").click()
            page.wait_for_function("document.querySelector('#rifle-equip').textContent === '已佩戴'")
            page.reload()
            page.wait_for_function("document.querySelector('#rifle-equip').textContent === '已佩戴'")
            page.locator('nav a[href="#missions"]').click()
            page.locator("#continue").click()
        elif i + 1 < len(LEVELS):
            page.locator("#next-level").click()
        else:
            assert page.locator("#next-level").is_hidden()
    page.goto(root + "#history")
    page.reload()
    total = len(LEVELS) + 1  # 每关一次胜利，另含第一关的一次失败。
    page.wait_for_function("n => document.querySelector('#battle-count').textContent.includes(n + ' 局')", arg=total)
    while page.locator("#more-battles").is_visible():
        previous = page.locator("#battle-list tr").count()
        page.locator("#more-battles").click()
        page.wait_for_function("n => document.querySelectorAll('#battle-list tr').length > n", arg=previous)
    assert page.locator("#battle-list tr").count() == total
    assert page.locator("#battle-list .lost").count() == 1
    snapshot = page.evaluate("""async () => {
        const store = await (await import('./campaign/store.mjs')).campaignStore();
        return store.progress();
    }""")
    assert all(level["cleared"] for level in snapshot["levels"])
    assert snapshot["battleCount"] == total
    assert {(item["level"], item["name"]): item["count"] for item in snapshot["loot"]} == collected
    assert snapshot["equippedSkin"] == LEVELS[0]["id"]
    # 两个标签页同时补写同一局，在同一事务中按对战 ID 去重。
    replay = {"id": "c4b67edd-c778-4d41-8709-0141f43d4510", "level": LEVELS[0]["id"],
              "won": False, "kills": 0, "endedAt": 1000, "durationMs": 100, "loot": []}
    second = context.new_page()
    second.goto(root)
    save = """async row => (await (await import('./campaign/store.mjs')).campaignStore()).save(row)"""
    page.evaluate("row => { window.replaying = (" + save + ")(row); }", replay)
    second.evaluate(save, replay)
    page.evaluate("window.replaying")
    second.reload()
    second.wait_for_function("n => document.querySelector('#battle-count').textContent.includes(n + ' 局')", arg=total + 1)
    second.close()
    # 重放胜利结算，只返还一次库存。两次读取之间的并行改装写入需要检查版本号。
    page.evaluate("""async first => {
        const store = await (await import('./campaign/store.mjs')).campaignStore();
        const baseline = await store.gear();
        const row={id:crypto.randomUUID(),level:first,won:true,kills:1,durationMs:10,
            endedAt:Date.now(),loot:[{name:'军需测试',value:333}],remaining:{grenade:1}};
        await Promise.all([store.save(row),store.save(row)]);
        const result=await store.gear();
        if (result.earned!==baseline.earned+333 || result.state.stock.grenade!==(baseline.state.stock.grenade??0)+1)
            throw Error('重复结算');
        const updates=await Promise.all([store.writeGear(result),store.writeGear(result)]);
        if(updates.filter(value=>value.saved).length!==1) throw Error('存档版本冲突未检出');
    }""", LEVELS[0]["id"])
    assert not api_requests, api_requests
    assert not errors, errors
    # 两种打包依赖组合均从磁盘启动，无存档服务时仍可练习。
    context.set_offline(True)
    for level_id in ("underground-lab", "brass-factory"):
        page.goto((site / level_id / "index.html").as_uri())
        page.locator("#start").click()
        page.wait_for_function("document.pointerLockElement && !document.querySelector('#hud').hidden")
        assert page.locator("#campaign-home").is_hidden()
    context.close()


if __name__ == "__main__":
    with TemporaryDirectory() as tmp:
        site = Path(tmp) / "super-player"
        copytree(sys.argv[1], site)
        with ThreadingHTTPServer(("127.0.0.1", 0), partial(StaticFiles, directory=tmp)) as server:
            Thread(target=server.serve_forever, daemon=True).start()
            try:
                with sync_playwright() as pw:
                    browser = pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER", "chrome"))
                    try:
                        verify(browser, f"http://127.0.0.1:{server.server_port}/super-player/", site)
                    finally:
                        browser.close()
            finally:
                server.shutdown()
    print("PASS static campaign, browser persistence and offline HTML")
