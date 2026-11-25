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
    page.get_by_role("link",name="战役大厅").click()
    cards = page.locator(".mission-option")
    listing = page.locator("#mission-list")
    assert cards.locator("strong").all_text_contents() == [level["title"] for level in LEVELS]
    for width, height in [(1280,720),(1920,1080),(2560,1080),(960,540),(320,720),(390,720),(768,720)]:
        page.set_viewport_size({"width":width,"height":height})
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight"), (width,height)
        preview = page.locator(".lobby .mission-art").bounding_box()
        listing.hover()
        page.mouse.wheel(0, 6000)
        page.wait_for_function("el=>el.scrollTop+el.clientHeight >= el.scrollHeight-1",arg=listing.element_handle())
        assert page.locator(".lobby .mission-art").bounding_box() == preview
        assert page.locator("#game-title").inner_text() == LEVELS[0]["title"]
        page.mouse.wheel(0,-6000)
        page.wait_for_function("el=>el.scrollTop===0",arg=listing.element_handle())
        if path := os.environ.get("GAME_TEST_SCREENSHOTS"):
            page.screenshot(path=str(Path(path)/f"dashboard-{width}.png"))
    cards.first.focus()
    page.keyboard.press("ArrowDown")
    assert page.locator("#game-title").inner_text() == LEVELS[1]["title"]
    page.keyboard.press("Enter")
    assert page.locator("#prepare-mission").is_disabled()
    for _ in LEVELS[2:]:
        page.keyboard.press("ArrowDown")
    assert cards.last.evaluate("el=>el===document.activeElement && el.getBoundingClientRect().bottom<=document.querySelector('#mission-list').getBoundingClientRect().bottom+1")
    page.keyboard.press("ArrowDown")
    assert page.locator("#prepare-mission").is_enabled()
    page.set_viewport_size({"width":1280,"height":720})
    page.get_by_role("link",name="返回主菜单").click()
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
    page.locator("#history-empty").wait_for()
    page.get_by_role("link",name="返回主菜单").click()
    for name, content in (("战场图鉴", "战利品图鉴"), ("成就与统计", "累计对战")):
        page.get_by_role("link", name=name, exact=True).click()
        page.get_by_role("heading", name=name).wait_for()
        page.locator("#function-body").get_by_text(content,exact=False).first.wait_for()
        page.get_by_role("link", name="返回主菜单", exact=True).click()
    assert page.locator('nav a[href="#history"]').is_visible()
    assert not vendor, vendor
    page.goto(url + "/#collection")
    page.wait_for_function("document.querySelector('#rifle-canvas').width>300 && !document.querySelector('#rifle-canvas').hidden")
    page.get_by_role("link",name="返回主菜单").click()
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
    returning = context.new_page()
    def advanced_save(route):
        response = route.fetch()
        snapshot = response.json()
        for i, level in enumerate(snapshot["levels"]):
            level.update(unlocked=True, cleared=i < len(LEVELS) - 1)
        route.fulfill(response=response, json=snapshot)
    returning.route("**/api/progress", advanced_save)
    returning.goto(url)
    returning.get_by_role("link",name="继续战役").wait_for()
    assert returning.locator("#continue").get_attribute("href") == "./" + LEVELS[-1]["id"] + "/"
    returning.get_by_role("link",name="战役大厅").click()
    assert returning.locator(".mission-card").last.evaluate("card=>card.parentNode.scrollTop>0 && card.getBoundingClientRect().bottom<=card.parentNode.getBoundingClientRect().bottom+1")
    returning.locator(".mission-option").first.click()
    assert returning.locator("#prepare-mission").is_enabled() and "再次挑战" in returning.locator("#current-mission").inner_text()
    returning.close()
    print("PASS 1280/1920 independent wheel, keyboard preview, 320/390/768 navigation and first-use Three.js", flush=True)
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
    page.wait_for_function("document.querySelectorAll('#kit-preview > div').length===4")
    assert "Z" in page.locator("#kit-preview kbd").first.inner_text()
    assert "冷却 6 秒" in page.locator("#kit-preview").inner_text()
    assert "空槽" in page.locator("#kit-preview").inner_text()
    page.select_option("#mission-mode","endless")
    assert "没有撤离" in page.locator("#mission-rule").inner_text()
    page.select_option("#mission-mode","classic")
    assert "歼灭" in page.locator("#mission-rule").inner_text()
    page.set_viewport_size({"width":390,"height":560})
    before = page.locator("#start").bounding_box()
    page.locator("#preparation summary").click()
    after = page.locator("#start").bounding_box()
    assert before and after and abs(before["y"]-after["y"])<2 and after["y"]+after["height"]<=560
    assert page.evaluate("document.querySelector('.brief-body').scrollWidth<=document.querySelector('.brief-body').clientWidth")
    page.set_viewport_size({"width":1280,"height":720})
    page.locator("#kit-slots select").nth(1).select_option("pulse")
    assert "冲击波" in page.locator("#kit-preview").inner_text()
    assert page.locator("#shop-item optgroup").count()==2
    for item in ("magazine","reload","recovery","grenade"):
        with page.expect_response(lambda r: r.url.endswith("/api/gear") and r.request.method=="POST"):
            page.select_option("#shop-item", item)
            page.click("#shop-buy")
        page.wait_for_function("!document.querySelector('#shop-item').disabled")
    page.click("#start")
    page.wait_for_function("run.game.phase==='play'")
    assert page.evaluate("run.game.weapon.ammo") == 150
    page.wait_for_function("document.querySelector('#ammo').textContent === '150'")
    assert page.evaluate("Math.abs(run.config.weapon.reloadTime - 1.8*1.16) < .0001 && Math.abs(run.config.weapon.fireRate-8.8)<.0001")
    assert page.evaluate("run.config.graphics.particleScale") == .3
    assert page.evaluate("[run.config.feedback.hitShake, run.config.feedback.directionIndicators]") == [.4, False]
    for width, height in [(1024,650),(768,520)]:
        page.set_viewport_size({"width":width,"height":height})
        assert page.evaluate("""() => {
            const kit=document.querySelector('#equipment-hud').getBoundingClientRect();
            return kit.height>0 && kit.bottom<document.querySelector('#hp').getBoundingClientRect().top;
        }"""), "装备栏遮挡生命读数"
    page.set_viewport_size({"width":1920,"height":1080})
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
        const rounds = pickups.add('ammo', player.x, player.z, player.y, '弹药', 1);
        return !slot.active && rounds !== slot && rounds?.active && rounds.kind === 'ammo' &&
            pickups.keyItem === null && !pickups.takeKey(player, run.game);
    }""")
    refresh = []
    page.route("**/api/gear", lambda route: refresh.append(route))
    page.evaluate("run.game.finish(true)")
    page.wait_for_function("document.querySelector('#menu-status').textContent.includes('已保存')")
    page.locator("#rematch-options").click()
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
      return g.objective.wave===1 && !g.ready();
    }""")
    page.evaluate("run.game.finish(false)")
    page.wait_for_function("document.querySelector('#menu-status').textContent.includes('已保存')")
    assert page.request.get(url+"/api/gear").json()["state"]["stock"]["grenade"] == 0
    page.goto(url)
    previous = page.context.new_page()
    previous.goto(url)
    previous.wait_for_function("document.querySelector('#battle-count').textContent.includes('4 局')")
    page.click("#save-open")
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
    stage="haunted-midway"
    page.route(url+"/"+stage+"/",expose_game)
    page.set_viewport_size({"width":960,"height":540})
    page.goto(url+"/"+stage+"/")
    page.wait_for_selector("#mission-mode option[value='endless']",state="attached")
    page.select_option("#mission-mode","endless")
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
    practice=browser.new_page()
    practice.goto((ROOT/LEVELS[0]["id"]/"index.html").as_uri())
    practice.wait_for_function("document.querySelectorAll('#kit-preview > div').length===4")
    assert practice.locator("#preparation").is_hidden()
    assert "练习" in practice.locator("#loadout-state").inner_text()
    practice.close()
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
