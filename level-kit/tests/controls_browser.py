"""通过打包后的离线入口验证右键停用、低顶蹲伏和战前/暂停说明。"""
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
    else:
        page.add_init_script("localStorage.setItem('super-player:preferences:v1', JSON.stringify({aimMode:'toggle'}))")
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
    instructions = page.locator("#menu").inner_text()
    assert "右键" not in instructions and "开镜" not in instructions, instructions
    assert "射击" in instructions
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


def right_button_checks(page, shoulder):
    # 记录相机相对于玩家的位移和朝向，可检测未改变视角标志的镜头跳变。
    offset = """() => {
      const {game:{player:p}, camera:c} = run;
      return [c.position.x-p.x, c.position.y-p.y-p.eye, c.position.z-p.z, ...c.quaternion.toArray()];
    }"""
    initial = page.evaluate(offset)

    def verify():
        state = page.evaluate("""() => {
          const {game, camera} = run, p = game.player;
          return [p.aimRequested, p.aiming, p.ads, camera.fov-p.baseFov, p.thirdPerson,
                  game.weapon.group.visible, game.ui.aimDot.hidden,
                  getComputedStyle(game.ui.nodes.cross).visibility];
        }""")
        assert state == [False, False, 0, 0, shoulder, not shoulder, True, "visible"], state
        current = page.evaluate(offset)
        assert max(abs(x-y) for x,y in zip(current, initial)) < .04, (initial, current)

    page.mouse.down(button="right")
    page.mouse.up(button="right")
    verify()
    page.mouse.down(button="right")
    # 跨过完整的镜头过渡，用游戏时钟保证慢速渲染时也走过实际帧。
    until = page.evaluate("run.game.time + .35")
    page.wait_for_function("until => run.game.time >= until", arg=until)
    verify()
    page.mouse.up(button="right")
    verify()


def weapon_controls(page, custom):
    view,inspect = ("b","k") if custom else ("v","i")
    right_button_checks(page, False)
    page.keyboard.press(view)
    page.wait_for_function("run.game.player.thirdPerson && !run.game.weapon.group.visible")
    right_button_checks(page, True)
    page.keyboard.press(view)
    page.wait_for_function("!run.game.player.thirdPerson && run.game.weapon.group.visible")
    page.keyboard.press(inspect)
    page.wait_for_function("run.game.weapon.inspectTime>0")
    before = page.evaluate("run.game.performance.shots")
    page.mouse.down()
    page.wait_for_function("before => run.game.performance.shots > before && !run.game.weapon.inspectTime", arg=before)
    page.mouse.up()
    page.keyboard.press("r")
    page.wait_for_function("run.game.weapon.reloadLeft>0 && !run.game.ui.ring.hidden")
    page.wait_for_function("!run.game.weapon.reloadLeft && run.game.ui.ring.hidden")


def mute_checks(page, custom):
    mute = "y" if custom else "m"
    before=page.locator("#message").text_content()
    page.keyboard.press(mute)
    page.wait_for_function("!run.game.sound.enabled && run.game.sound.main.gain.value<.002")
    assert page.locator("#message").text_content() == before
    page.keyboard.press(mute)
    page.wait_for_function("run.game.sound.enabled && Math.abs(run.game.sound.main.gain.value-run.config.audio.volume*.65)<.003")


def check_sight_line(page):
    result=page.evaluate("""() => {
      const {game:g,config,camera}=run,p=g.player,w=g.weapon,m=g.beasts;
      // 在场景上方加一扇窄门，去掉随机散布，以便测量光轴本身。
      Object.assign(p,{x:-20,y:45,z:0,thirdPerson:false});
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
    print("PASS hip-fire eye ray, closed cover / open door",result,flush=True)


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
            if stage!="neon-undercity":
                weapon_controls(page,custom)
            if stage=="practice":
                mute_checks(page,custom)
            page.keyboard.press("Escape")
            page.wait_for_function("run.game.phase==='pause'")
            menu(page,crouch,deep,custom)
            start(page)
            right_button_checks(page, False)
            assert page.evaluate("!run.game.player.aiming && run.camera.matrixWorld.elements.every(Number.isFinite)")
            if stage=="underground-lab":
                check_sight_line(page)
                check_sound_storage(page)
            if stage=="neon-undercity": check_emp_feedback(page)
            page.evaluate("run.game.finish(false)")
            page.wait_for_function("run.game.phase==='fail'")
            assert page.locator("#sound, #sound-state").count()==0
            start(page)
            right_button_checks(page, False)
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
