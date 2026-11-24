"""通过打包后的离线入口验证开镜、低顶蹲伏和战前/暂停说明。"""
import os
import re
from playwright.sync_api import sync_playwright
from campaign_browser import ROOT
from hit_feedback import check_emp_feedback


def stage_page(browser, stage, query="", custom=False):
    page = browser.new_page(viewport={"width": 960, "height": 640})
    def expose(route):
        html = (ROOT/stage/"index.html").read_text(encoding="utf-8")
        entry = "    startLevel(definition, campaign, campaignStage);"
        assert html.count(entry) == 1
        route.fulfill(body=html.replace(entry, entry.replace("startLevel(", "window.run=startLevel(")), content_type="text/html")
    page.route(re.compile(r"/index\.html(?:\?.*)?$"), expose)
    if custom:
        page.add_init_script("""localStorage.setItem('super-player:preferences:v1',JSON.stringify({
          aimMode:'hold',volume:47,keys:{KeyC:'KeyX',KeyG:'KeyH',KeyI:'KeyK',KeyM:'KeyY',KeyV:'KeyB'}
        }))""")
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto((ROOT/stage/"index.html").as_uri()+query)
    page.wait_for_function("!!window.run")
    return page, errors


def start(page):
    page.click("#start")
    page.wait_for_function("run.game.phase==='play' && !!document.pointerLockElement")


def menu(page, crouch, deep, custom):
    guide = page.locator("#key-guide")
    if guide.get_attribute("open") is None:
        guide.locator("summary").click()
    assert page.locator("#crouch-help").is_visible() == crouch
    assert page.locator("#deep-help").is_visible() == deep
    keys = {"KeyI":"K","KeyM":"Y","KeyV":"B"} if custom else {"KeyI":"I","KeyM":"M","KeyV":"V"}
    if crouch: keys["KeyC"] = "X" if custom else "C"
    if deep: keys["KeyG"] = "H" if custom else "G"
    for action,key in keys.items():
        assert guide.locator(f'[data-keys="{action}"]').inner_text() == key
    assert ("按住右键" if custom else "单击右键") in page.locator("#aim-help").inner_text()
    assert page.locator("#sound, #sound-state").count() == 0


def crouch_checks(page, key):
    page.keyboard.down(key)
    page.wait_for_function("run.game.player.crouched && Math.abs(run.game.player.eye-run.config.player.crouch.eye)<.03")
    def turn(x,y):
        before=page.evaluate("[run.game.player.look.rotation.x,run.game.player.look.rotation.y]")
        page.mouse.move(x,y)
        page.mouse.move(x+15,y+17,steps=3)
        page.wait_for_function("angles=>Math.abs(run.game.player.look.rotation.x-angles[0])>.001 && Math.abs(run.game.player.look.rotation.y-angles[1])>.001",arg=before)
        assert page.evaluate("run.camera.matrixWorld.elements.every(Number.isFinite)")
    turn(450,310)
    page.evaluate("""() => {const g=run.game,p=g.player;
      window.ceiling=g.level.box(p.x,p.z,1.8,1.8,p.y+1.20,p.y+1.55);
    }""")
    page.keyboard.up(key)
    page.wait_for_timeout(180)
    assert page.evaluate("run.game.player.crouched && run.game.player.height===run.config.player.crouch.height")
    page.evaluate("ceiling.active=false")
    page.wait_for_function("!run.game.player.crouched && Math.abs(run.game.player.eye-run.config.player.eye)<.03")
    turn(475,335)


def aim_checks(page, custom):
    def right():
        page.mouse.down(button="right")
        page.mouse.up(button="right")
    def aimed(value):
        page.wait_for_function(("run.game.player.aiming && run.game.player.ads>.90" if value
                                else "!run.game.player.aiming && run.game.player.ads<.10"))
    view,inspect,mute = ("b","k","y") if custom else ("v","i","m")
    page.keyboard.press(inspect)
    page.wait_for_function("run.game.weapon.inspectTime>0")
    page.keyboard.press(view)
    page.wait_for_function("run.game.player.thirdPerson")
    page.mouse.down(button="right")
    aimed(True)
    # 鼠标仍按着时，重复的按下事件不能再翻转一次。
    page.evaluate("document.dispatchEvent(new MouseEvent('mousedown',{button:2,bubbles:true}))")
    assert page.evaluate("run.game.player.aimRequested && run.game.weapon.group.visible")
    page.mouse.up(button="right")
    if custom:
        aimed(False)
    else:
        aimed(True)
        before=page.evaluate("run.game.player.z")
        page.keyboard.down("w");page.mouse.down()
        page.wait_for_function("z=>run.game.player.z!==z && run.game.performance.shots>0",arg=before)
        page.keyboard.up("w");page.mouse.up()
        assert page.evaluate("run.game.player.aimRequested")
        right();aimed(False)
    page.wait_for_function("!run.game.weapon.group.visible")
    page.mouse.down(button="right");aimed(True)
    page.keyboard.press(view)
    page.mouse.up(button="right");aimed(False)
    assert page.evaluate("!run.game.player.thirdPerson && run.game.weapon.group.visible")
    page.mouse.down(button="right");aimed(True)
    if not custom: page.mouse.up(button="right")
    # 在按 R 前记录整个转场，避免低帧率下漏过实际装填窗口。
    page.evaluate("Object.assign(run.game.weapon,{ammo:1,reserve:20})")
    page.keyboard.press("r")
    page.wait_for_function("run.game.weapon.reloadLeft>0 && !run.game.player.aiming && run.game.player.aimRequested && !document.querySelector('#reload-ring').hidden")
    if custom: page.mouse.up(button="right")
    else: right()
    page.wait_for_function("!run.game.weapon.reloadLeft && !run.game.player.aimRequested")
    aimed(False)
    page.mouse.down(button="right");aimed(True)
    page.evaluate("window.dispatchEvent(new Event('blur'))")
    page.mouse.up(button="right")
    assert page.evaluate("!run.game.player.aimRequested && run.game.player.ads===0 && run.camera.fov===run.game.player.baseFov")
    before=page.locator("#message").text_content()
    page.keyboard.press(mute)
    page.wait_for_function("!run.game.sound.enabled && run.game.sound.main.gain.value<.002")
    assert page.locator("#message").text_content() == before
    page.keyboard.press(mute)
    page.wait_for_function("run.game.sound.enabled && Math.abs(run.game.sound.main.gain.value-run.config.audio.volume*.65)<.003")
    page.mouse.down(button="right");aimed(True)
    page.keyboard.press("Escape");page.mouse.up(button="right")
    page.wait_for_function("run.game.phase==='pause' && !run.game.player.aimRequested && run.game.player.ads===0")


def check_sight_line(page):
    result=page.evaluate("""() => {
      const {game:g,config,camera}=run,p=g.player,w=g.weapon,m=g.beasts;
      // 在场景上方加一扇窄门，去掉随机散布，以便测量光轴本身。
      Object.assign(p,{x:-20,y:45,z:0,aimRequested:true,aiming:true,ads:1,thirdPerson:false});
      p.look.rotation.set(0,0,0,'YXZ');p.positionCamera(0);w.render(0,p,g);
      const rules=config.weapon,spread=[rules.baseSpread,rules.maxSpread];
      rules.baseSpread=rules.maxSpread=0;
      g.level.box(-21.1,-.50,1.5,.2,45,49);
      g.level.box(-18.9,-.50,1.5,.2,45,49);
      const gate=g.level.box(-20,-.5,.72,.2,45,49);
      const hits=[];
      for (const distance of [2,9,17]) {
        m.pool.forEach(b=>{b.active=false});m.live=0;m.hash.clear();
        const target=m.spawn(1,p.x,p.z-distance,p.y);target.height=2.3;target.hp=500;
        m.refreshHash();gate.active=true;w.shoot(g);
        const blocked=target.hp===500;
        gate.active=false;w.shoot(g);
        hits.push([distance,blocked,target.hp<500,w.origin.distanceTo(camera.position)]);
      }
      [rules.baseSpread,rules.maxSpread]=spread;
      return hits;
    }""")
    assert all(blocked and hit and eye < .0001 for _,blocked,hit,eye in result),result
    print("PASS ADS eye ray, closed cover / open door",result,flush=True)


def check_sound_storage(page):
    states=page.evaluate("""() => {
      const sound=run.game.sound, key='super-player:preferences:v1';
      const press=()=>document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyM',bubbles:true}));
      // 模拟存储已更新但事件尚未到达，此次按键必须反转新值。
      localStorage.setItem(key,JSON.stringify({muted:true,volume:37}));
      press();
      const result=[sound.enabled,JSON.parse(localStorage.getItem(key)).muted,run.config.audio.volume];
      const save=Storage.prototype.setItem;
      try {
        Storage.prototype.setItem=()=>{throw new DOMException('quota','QuotaExceededError')};
        press();result.push(sound.enabled);press();result.push(sound.enabled);
      } finally { Storage.prototype.setItem=save; }
      return result;
    }""")
    assert states==[True,False,.37,False,True],states


def check(browser):
    for stage,query,crouch,deep,custom in [
        ("practice","?mode=tutorial",True,False,False),
        ("practice","?mode=range",True,False,True),
        ("buried-tomb","",True,True,True),
        ("underground-lab","",False,False,False),
        ("neon-undercity","",False,False,False),
    ]:
        page,errors=stage_page(browser,stage,query,custom)
        try:
            menu(page,crouch,deep,custom)
            start(page)
            if crouch: crouch_checks(page,"x" if custom else "c")
            if stage=="practice":
                aim_checks(page,custom)
            else:
                page.keyboard.press("Escape");page.wait_for_function("run.game.phase==='pause'")
            menu(page,crouch,deep,custom)
            start(page)
            assert page.evaluate("!run.game.player.aiming && run.camera.matrixWorld.elements.every(Number.isFinite)")
            if stage=="underground-lab":
                check_sight_line(page)
                check_sound_storage(page)
            if stage=="neon-undercity": check_emp_feedback(page)
            page.evaluate("run.game.finish(false)")
            page.wait_for_function("run.game.phase==='fail'")
            assert page.locator("#sound, #sound-state").count()==0
            start(page)
            assert page.evaluate("!run.game.player.aimRequested && run.game.player.ads===0")
            assert not errors,errors
            print("PASS offline",stage,query,"custom" if custom else "default",flush=True)
        finally:
            page.close()


if __name__ == "__main__":
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER","chrome"))
        try:
            check(browser)
        finally:
            browser.close()
