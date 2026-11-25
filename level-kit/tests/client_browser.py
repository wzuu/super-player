"""用页面虚拟锁验证桌面菜单、战报和返回路径，可从同一局生成六张交付图。"""
import argparse
import os
import re
from shutil import copyfile
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from playwright.sync_api import sync_playwright
from campaign_browser import ROOT, capture_frames, expose_game
from lab_pressure_browser import LOCK
from hit_feedback import check_emp_feedback


def check_frame(page, selectors):
    for width, height in [(1280,720),(1920,1080),(2560,1080),(960,540),(1440,900)]:
        page.set_viewport_size({"width":width,"height":height})
        page.evaluate("new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))")
        outside = page.evaluate("""selectors=>selectors.filter(selector=>{
          const el=document.querySelector(selector);
          if(!el || getComputedStyle(el).visibility==='hidden')return true;
          const r=el.getBoundingClientRect();
          return !r.width || !r.height || r.left<0 || r.top<0 || r.right>innerWidth+1 ||
            r.bottom>innerHeight+1 || document.documentElement.scrollWidth>innerWidth;
        })""",selectors)
        assert not outside,(width,height,outside)


def check(browser, url, output, offline):
    page=browser.new_page(viewport={"width":1440,"height":900}, reduced_motion="reduce")
    errors=[]
    page.on("pageerror",lambda error:errors.append(str(error)))
    page.add_init_script(LOCK + """
      localStorage.setItem('super-player:variation:1',JSON.stringify({pending:'quiet'}));
    """)
    def capture(name):
        page.evaluate("window.clientFrame?.(performance.now())")
        print("PASS",name,flush=True)
        if output:
            page.screenshot(path=output/(name+".jpg"),quality=92)

    lab=url+"/underground-lab/"
    page.route(lab,lambda route:expose_game(route,manual_steps=True,with_input=True,manual_paint=True))
    page.goto(url)
    page.locator("#continue").wait_for()
    check_frame(page,["#continue","#save-open"])
    assert page.locator("#continue").inner_text()=="开始战役"
    capture("main-menu")
    page.locator("#continue").focus()
    page.keyboard.press("ArrowDown")
    page.keyboard.press("Enter")
    page.locator("#prepare-mission").wait_for()
    check_frame(page,["#view-missions .back","#prepare-mission",".mission-info"])
    capture("campaign-lobby")
    cards=page.locator(".mission-option")
    cards.first.focus()
    page.keyboard.press("ArrowDown")
    page.keyboard.press("Enter")
    assert page.locator("#prepare-mission").is_disabled()
    page.keyboard.press("ArrowUp")
    page.keyboard.press("Escape")
    page.wait_for_function("document.activeElement.getAttribute('href')==='#missions'")
    page.keyboard.press("ArrowDown")
    page.keyboard.press("ArrowDown")
    page.keyboard.press("Enter")
    page.locator("#view-collection h1").wait_for()
    page.keyboard.press("Escape")
    page.wait_for_function("document.activeElement.getAttribute('href')==='#collection'")
    page.keyboard.press("ArrowUp")
    page.keyboard.press("ArrowUp")
    page.keyboard.press("ArrowUp")
    page.keyboard.press("ArrowUp")
    page.keyboard.press("Enter")
    page.get_by_role("dialog",name="游戏设置").wait_for()
    page.keyboard.press("Escape")
    assert page.locator("#settings-open").evaluate("el=>el===document.activeElement")
    if page.locator("#fullscreen").is_visible():
        page.click("#fullscreen")
        page.wait_for_function("!!document.fullscreenElement")
        page.click("#fullscreen")
        page.wait_for_function("!document.fullscreenElement")
    assert page.evaluate("matchMedia('(prefers-reduced-motion:reduce)').matches")
    # 首次打开资源失败，返回保留当前菜单，重试走同一关。
    def unavailable(route):
        route.fulfill(status=503)
    page.route(lab,unavailable)
    page.click("#continue")
    page.locator("#retry-load").wait_for()
    page.click("#cancel-load")
    page.click("#continue")
    page.locator("#retry-load").wait_for()
    page.unroute(lab,unavailable)
    page.click("#retry-load")
    page.wait_for_function("!!window.run")
    check_frame(page,["#campaign-home","#start","#mission-difficulty","#kit-title"])
    capture("briefing")
    page.select_option("#mission-mode","endless")
    assert "无尽" in page.locator("#ration").inner_text()
    page.select_option("#mission-mode","classic")
    page.select_option("#mission-difficulty","hard")
    assert page.evaluate("run.config.player.incoming")==1.35
    page.select_option("#mission-difficulty","standard")
    page.click("#start")
    page.wait_for_function("run.game.phase==='play'")
    page.add_script_tag(path=ROOT/"level-kit/tests/lab_live_driver.js")
    page.evaluate("""()=>{window.fight=playLaboratoryCampaign(null,g=>g.beasts.boss && g.beasts.boss.hp<g.beasts.boss.maxHP*.9 && !g.weapon.flash && !window.captured);
      if(fight.next().done)throw Error('未到实战截图位置');window.captured=true;}""")
    check_frame(page,["#task-panel","#map",".bottom-left",".bottom-right","#cross i:first-child"])
    capture("combat")
    page.evaluate("document.exitPointerLock()")
    page.locator("#unstuck").wait_for()
    check_frame(page,["#campaign-home","#start","#unstuck"])
    capture("pause")
    page.once("dialog",lambda dialog:dialog.dismiss())
    page.click("#campaign-home")
    assert page.evaluate("run.game.phase")== "pause"
    page.click("#start")
    page.wait_for_function("run.game.phase==='play'")
    page.route("**/api/battles",unavailable)
    result=page.evaluate("fight.next().value")
    assert result["phase"]=="win",result
    page.locator("#retry-save").wait_for()
    assert page.locator("#next-level").is_hidden()
    page.unroute("**/api/battles",unavailable)
    page.click("#retry-save")
    page.locator("#next-level").wait_for()
    check_frame(page,["#campaign-home","#next-level","#menu-status","#summary"])
    capture("battle-report")
    page.click("#campaign-home")
    page.locator('#game-title',has_text="地下实验室").wait_for()
    page.reload()
    page.locator("#prepare-mission").wait_for()
    page.locator('#game-title',has_text="地下实验室").wait_for()
    snapshot=page.request.get(url+"/api/progress").json()
    assert snapshot["battleCount"]==1 and snapshot["levels"][1]["unlocked"]
    page.get_by_role("link",name="返回主菜单").click()
    assert page.locator("#continue").inner_text()=="继续战役"
    page.click("#continue")
    page.locator("#start").wait_for()
    assert "/shanhai-secret-realm/" in page.url
    page.goto(url)
    page.click("#save-open")
    page.click("#new-campaign")
    page.route(lab,unavailable)
    page.get_by_role("button",name="创建存档并开始").click()
    page.locator("#retry-load").wait_for()
    page.click("#cancel-load")
    page.get_by_role("link",name="开始战役",exact=True).wait_for()
    assert page.locator("#current-title").inner_text()=="地下实验室"
    assert "初始战役" not in page.locator("#save-open").inner_text()
    page.unroute(lab,unavailable)
    # 无存档服务的直接文件也使用同一 HUD。第三关用武器状态和首领同时读取上栏。
    for stage in ("rain-city","neon-undercity"):
        directory=offline/stage
        directory.mkdir()
        entry="    startLevel(definition, campaign, campaignStage);"
        original=capture_frames((ROOT/stage/"index.html").read_text(encoding="utf8"))
        assert original.count(entry)==1
        path=directory/"index.html"
        path.write_text(original.replace(entry,entry.replace("startLevel(","window.run=startLevel(")),encoding="utf8")
        page.goto(path.as_uri())
        if stage=="rain-city":
            page.select_option("#mission-mode","endless")
        page.click("#start")
        page.wait_for_function("run.game.phase==='play'")
        if stage=="neon-undercity":
            check_emp_feedback(page)
        else:
            page.evaluate("""()=>{const g=run.game,p=g.player;
              const b=g.beasts.boss;p.x=b.x+4;p.z=b.z;p.hurtDelay=Infinity;
              g.weapon.combat.tracked=b;g.weapon.combat.generation=b.spawnGeneration;
              b.statusEffects.set('burn',{type:'burn',until:g.time+60,stacks:1});
              g.ui.update(1,g);}""")
            page.keyboard.press("v")
            page.wait_for_function("run.game.player.thirdPerson")
            page.keyboard.press("v")
            page.wait_for_function("!run.game.player.thirdPerson")
            check_frame(page,["#boss","#condition","#task-panel","#map"])
            assert page.locator("#boss").bounding_box()["y"] < page.locator("#condition").bounding_box()["y"]
    assert not errors,errors
    page.close()
    print("PASS 桌面菜单、四档视口、键盘与全屏、实战六画面、保存失败重试、返回大厅、下一关和离线 HUD",flush=True)


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--screenshots",type=Path)
    output=parser.parse_args().screenshots
    if output: output.mkdir(parents=True,exist_ok=True)
    with TemporaryDirectory() as tmp:
        service=subprocess.Popen([sys.executable,"-X","utf8","-u","server.py","--port","0","--db",str(Path(tmp)/"qa.sqlite")],
                                 cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,encoding="utf8")
        try:
            url=re.search(r"http://127.0.0.1:[0-9]+",service.stdout.readline()).group()
            with sync_playwright() as pw:
                browser=pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER","chrome"))
                vendor=Path(tmp)/"level-kit/vendor"
                vendor.mkdir(parents=True)
                copyfile(ROOT/"level-kit/vendor/three-r160.js",vendor/"three-r160.js")
                try: check(browser,url,output,Path(tmp))
                finally: browser.close()
        finally:
            service.terminate()
            service.wait()
