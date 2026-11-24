"""首次选择、逐步教程、无限火力与正式存档隔离。"""
import os
import re
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from campaign_browser import ROOT, expose_game, sync_playwright


def check(browser, url, static=False):
    page=browser.new_page(viewport={"width":960,"height":640})
    errors=[]
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    if static:
        def manifest(route):
            r=route.fetch()
            route.fulfill(status=200,headers={k:v for k,v in r.headers.items() if k.lower()!='x-super-player-store'},body=r.body())
        page.route("**/campaign/levels.json",manifest)
    page.route("**/practice/index.html*",expose_game)
    page.goto(url)
    choice=page.get_by_role("dialog",name="首次进入战役")
    choice.wait_for()
    page.keyboard.press("Escape")
    assert choice.is_visible()
    page.mouse.click(2,2)
    assert choice.is_visible()
    page.get_by_role("button",name="开始新手教程").click()
    page.wait_for_function("!!window.run")
    assert page.evaluate("run.game.training.kind")=="tutorial"
    page.click("#start")
    page.wait_for_function("run.game.phase==='play'")
    def step(name):
        page.wait_for_function("name=>run.game.training.guide(run.game).stage==='tutorial-'+name",arg=name,timeout=6000)
    step("look")
    # 玩家可能在看到道具指引前就已用完练习手雷。
    for _ in range(3): page.keyboard.press("2")
    assert page.evaluate("run.game.kit.remaining().grenade") == 0
    page.mouse.move(520,320)
    page.mouse.move(580,341)
    step("walk")
    def hold(key,ms=200):
        page.keyboard.down(key); page.wait_for_timeout(ms); page.keyboard.up(key)
    for key in ["w","a","s","d"]: hold(key)
    step("sprint")
    page.keyboard.down("Shift"); hold("w"); page.keyboard.up("Shift")
    step("jump"); hold("Space")
    step("crouch"); hold("c")
    step("pause"); page.evaluate("document.exitPointerLock()")
    page.wait_for_function("run.game.phase==='pause'");page.click("#start")
    step("shoot"); page.mouse.down();page.wait_for_timeout(200);page.mouse.up()
    step("reload"); hold("r")
    step("empty"); page.mouse.down();step("pickup");page.mouse.up()
    # 跳过路程，拾取、伤害、核心和撤离仍走与正式游玩相同的入口。
    page.evaluate("""() => {const g=run.game,t=g.training.guide(g).target;Object.assign(g.player,{x:t.x,y:t.y,z:t.z});}""")
    for i,key in enumerate(["q","e","1","2"]):
        step("slot"+str(i))
        if i==3:
            assert page.evaluate("run.game.kit.remaining().grenade") == 1
        hold(key)
    for name in ["kill","boss"]:
        step(name)
        page.evaluate("""() => { const g=run.game;g.beasts.damage(g.training.guide(g).target,10000,g,'weapon'); }""")
    step("core")
    page.evaluate("""() => { const g=run.game,t=g.pickups.keyItem;Object.assign(g.player,{x:t.x,y:t.y,z:t.z});}""")
    hold("f");step("gate")
    page.evaluate("""() => { const g=run.game,t=g.level.gate; Object.assign(g.player,{x:t.x,y:t.y,z:t.z});}""")
    hold("f"); page.wait_for_function("run.game.phase==='win'")
    assert page.get_by_role("link",name="开始战役").is_visible()
    page.click("#campaign-home")
    page.locator("#continue").wait_for()
    assert not choice.count()
    assert page.locator("#progress-count").inner_text().startswith("0 /")
    page.get_by_role("link",name="火力试验场").click()
    page.wait_for_function("!!window.run")
    page.click("#start");page.wait_for_function("run.game.phase==='play'")
    page.mouse.down()
    page.wait_for_function("run.game.performance.shots >= 54",timeout=20000)
    page.mouse.up()
    assert page.evaluate("run.game.weapon.reserve === Infinity")
    page.evaluate("run.game.time=58")
    page.wait_for_function("document.querySelector('#objective').textContent.includes('第 4 波')")
    assert page.evaluate("run.game.beasts.live <= run.config.beasts.capacity")
    page.evaluate("document.exitPointerLock()"); page.click("#practice-restart")
    page.wait_for_function("run.game.phase==='play' && run.game.time<5")
    page.evaluate("document.exitPointerLock()"); page.click("#campaign-home")
    page.locator("#continue").wait_for()
    assert "0 局" in page.locator("#battle-count").text_content()
    assert not errors, errors
    page.close()


if __name__ == "__main__":
    with TemporaryDirectory() as tmp:
        proc=subprocess.Popen([sys.executable,"-X","utf8","-u","server.py","--port","0","--db",str(Path(tmp)/"test.sqlite")],
                              cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,encoding="utf-8")
        try:
            url=re.search(r"http://127\.0\.0\.1:\d+",proc.stdout.readline()).group()
            with sync_playwright() as pw:
                browser=pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER","chrome"))
                try:
                    for static in (False,True):
                        check(browser,url,static)
                        print("PASS first choice, tutorial, range, isolated progress","IndexedDB" if static else "SQLite",flush=True)
                finally:
                    browser.close()
        finally:
            proc.terminate(); proc.wait()
