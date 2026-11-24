"""记录 Chromium 锁定鼠标的相对位移、逻辑瞄准与渲染镜头。"""
import json
import math
import os
import re
import sys

from playwright.sync_api import sync_playwright

from campaign_browser import ROOT


def motion_page(browser, stage, mode, pad):
    context = browser.new_context(viewport={"width": 800, "height": 600})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.add_init_script("""
        localStorage.setItem('super-player:preferences:v1',JSON.stringify({
          steady:true, muted:true, quality:'low', gamepad:PAD, sensitivity:1.2
        }));
        window.padReads=0;
        const stationary={id:'静置手柄测试输入',mapping:'standard',connected:true,axes:[0,0,0,0],
          buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
        Object.defineProperty(navigator,'getGamepads',{value:()=>{
          padReads++;return [stationary,null,null,null];
        }});
    """.replace("PAD", json.dumps(pad)))
    html = (ROOT / stage / "index.html").read_text(encoding="utf-8")
    entry = "    startLevel(definition, campaign, campaignStage);"
    assert html.count(entry) == 1
    page.route(re.compile(r"/index\.html(?:\?.*)?$"), lambda route: route.fulfill(
        content_type="text/html", body=html.replace(entry, entry.replace("startLevel(", "window.run=startLevel("))))
    url = (ROOT / stage / "index.html").as_uri()
    page.goto(url + ("?mode=" + mode if mode else ""))
    page.wait_for_function("!!window.run")
    page.evaluate("""() => {
      window.mouseRows=[];
      document.addEventListener('mousemove',e=>{
        if (e.isTrusted && document.pointerLockElement && run.game.phase==='play') {
          const rotation=run.game.player.look.rotation;
          mouseRows.push([e.movementX,e.movementY,rotation.y,rotation.x]);
        }
      });
      window.cameraSample=()=>{
        const p=run.game.player, c=run.camera, v=p.look.rotation.clone().setFromQuaternion(c.quaternion,'YXZ');
        return {look:[p.look.rotation.y,p.look.rotation.x],camera:[v.y,v.x],
          q:c.quaternion.toArray(),error:c.quaternion.angleTo(p.look.quaternion)};
      };
      window.afterRender=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    }""")
    return page, errors


def start(page):
    page.locator("#start").click()
    page.wait_for_function("run.game.phase==='play' && document.pointerLockElement?.tagName==='CANVAS'")
    page.evaluate("afterRender()")


def move(page, x, y, steps, direction, origin=None):
    before = page.evaluate("mouseRows.length=0; cameraSample().look")
    if origin:
        # 慢移分布在不同画面帧，和单次快速转向形成可重复的对照。
        for i in range(1, steps + 1):
            page.mouse.move(origin[0] + (x-origin[0])*i/steps, origin[1] + (y-origin[1])*i/steps)
            page.evaluate("new Promise(resolve=>requestAnimationFrame(resolve))")
    else:
        page.mouse.move(x, y, steps=steps)
    page.evaluate("afterRender()")
    rows, after, speed = page.evaluate("[mouseRows.slice(),cameraSample(),run.config.player.mouseSpeed]")
    events = [row[:2] for row in rows]
    assert events and all(math.isfinite(v) and abs(v) < 900 for e in events for v in e), events
    dx, dy = (sum(row[i] for row in events) for i in range(2))
    assert dx or dy, events
    if direction:
        assert dx * direction > 0 and dy * direction > 0, (direction, events)
    expected = list(before)
    limit = math.pi / 2 - .04
    for mx, my, yaw, pitch in rows:
        expected[0] -= mx * .002 * speed
        expected[1] = max(-limit, min(limit, expected[1] - my * .002 * speed))
        assert abs(yaw-expected[0]) < 1e-8 and abs(pitch-expected[1]) < 1e-8, (rows, before)
    assert max(abs(a-b) for a, b in zip(expected, after["look"])) < 1e-8, (events, before, after)
    assert after["error"] < 1e-7, after
    return {"deltas": events, "px": [dx, dy], "look": [round(v, 6) for v in after["look"]],
            "camera": [round(v, 6) for v in after["camera"]]}


def rest(page):
    data = page.evaluate("""() => new Promise(resolve=>{
      const start=cameraSample(), t0=performance.now(), g0=run.game.time;
      let frames=0, peakLook=0, peakCamera=0;
      mouseRows.length=0;
      function frame(now){
        const s=cameraSample();
        peakLook=Math.max(peakLook,...s.look.map((v,i)=>Math.abs(v-start.look[i])));
        const dot=Math.abs(s.q.reduce((sum,v,i)=>sum+v*start.q[i],0));
        peakCamera=Math.max(peakCamera,2*Math.acos(Math.min(1,dot)));
        frames++;
        if(now-t0<2000)requestAnimationFrame(frame);
        else resolve({ms:Math.round(now-t0),frames,gameSeconds:run.game.time-g0,events:mouseRows.length,
          movingEvents:mouseRows.filter(([dx,dy])=>dx||dy).length,
          peakLook,peakCamera,locked:Boolean(document.pointerLockElement),padReads});
      }
      requestAnimationFrame(frame);
    })""")
    assert data["locked"] and data["frames"] >= 2 and data["gameSeconds"] > 0 and data["movingEvents"] == 0, data
    assert data["peakLook"] < 1e-8 and data["peakCamera"] < 1e-7, data
    return data


def unlock(page, switch):
    old = page.evaluate("cameraSample().look")
    if switch:
        other = page.context.new_page()
        try:
            other.bring_to_front()
            switched = page.evaluate("document.hidden || run.game.phase==='pause'")
            if not switched:
                # 无头 Chromium 可同时保持多个页面可见，走浏览器隐藏通知的同一处理器。
                page.evaluate("""() => {
                  Object.defineProperty(document,'hidden',{configurable:true,value:true});
                  document.dispatchEvent(new Event('visibilitychange'));
                }""")
            page.wait_for_function("run.game.phase==='pause' && !document.pointerLockElement", polling=50)
        finally:
            other.close()
            page.bring_to_front()
        if not switched:
            page.evaluate("delete document.hidden; document.dispatchEvent(new Event('visibilitychange'))")
        reason = "tab" if switched else "visibility-event"
    else:
        page.keyboard.press("Escape")
        page.wait_for_function("run.game.phase==='pause' && !document.pointerLockElement", polling=50)
        reason = "Escape"
    page.mouse.move(185, 145, steps=3)
    assert page.evaluate("cameraSample().look") == old
    start(page)
    assert page.evaluate("cameraSample().look") == old
    return reason


def check_mouse_motion(browser):
    for stage, mode in [("practice", "tutorial"), ("underground-lab", ""), ("practice", "range")]:
        for pad in [False, True]:
            page, errors = motion_page(browser, stage, mode, pad)
            try:
                setup = page.evaluate("""() => ({os:navigator.platform, browser:navigator.userAgent,
                  lock:Object.hasOwn(document,'pointerLockElement')?'in-memory':'native',input:'Chromium automation mouse',
                  sensitivity:run.config.player.mouseSpeed})""")
                if sys.platform == "linux" and os.environ.get("GITHUB_ACTIONS") == "true":
                    assert setup["lock"] == "native", setup
                print("TRACE mouse setup", stage, mode, json.dumps(setup), flush=True)
                start(page)
                for shoulder in [False, True]:
                    if shoulder:
                        page.keyboard.press("v")
                    page.wait_for_function("value=>run.game.weapon.shoulder.body.visible===value", arg=shoulder)
                    move(page, 394, 296, 1, 0)
                    move(page, 400, 300, 1, 1)
                    initial = page.evaluate("cameraSample().look")
                    slow = move(page, 424, 316, 8, 1, origin=(400, 300))
                    fast = move(page, 554, 366, 1, 1)
                    back = move(page, 400, 300, 4, -1)
                    assert len(slow["deltas"]) >= 4 and max(abs(x) for x,_ in slow["deltas"]) < 12, slow
                    assert max(abs(x) for x,_ in fast["deltas"]) >= 100, fast
                    assert all(s+f+b == 0 for s,f,b in zip(slow["px"],fast["px"],back["px"])), (slow,fast,back)
                    assert max(abs(a-b) for a,b in zip(page.evaluate("cameraSample().look"), initial)) < 1e-8
                    stopped = rest(page)
                    assert (stopped["padReads"] > 0) == pad, stopped
                    reason = unlock(page, shoulder)
                    first = move(page, 430, 278, 1, 0)
                    print("PASS mouse", stage, mode, "shoulder" if shoulder else "first-person", "idle-pad" if pad else "pad-off",
                          json.dumps({"slow":slow,"fast":fast,"reverse":back,"stop":stopped,"relock":reason,"first":first}),flush=True)
                assert not errors, errors
            finally:
                page.context.close()


if __name__ == "__main__":
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER", "chrome"))
        try:
            check_mouse_motion(browser)
        finally:
            browser.close()
