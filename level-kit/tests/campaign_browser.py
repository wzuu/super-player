"""用本机 Chrome 验证打包入口、空仓换弹、解锁与跨关佩戴。

需要开发机安装 Python Playwright；运行游戏本身只需要标准库。
"""

import json
import os
from pathlib import Path
import re
import subprocess
import sys
from tempfile import TemporaryDirectory
import time
from uuid import uuid4

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[2]
LEVELS = json.loads((ROOT / "campaign/levels.json").read_text(encoding="utf-8"))
NEW_STAGES = ["sakura-night-town", "brass-factory", "haunted-midway"]


def capture_frames(html):
    # 仅接管游戏绘制。浏览器和测试工具保留原生动画帧。
    schedule = "requested = requestAnimationFrame(animate);"
    assert html.count(schedule) >= 1
    return html.replace(schedule, "requested = 1; window.clientFrame = animate;")


def expose_game(route, *, render=True, manual_steps=False, with_input=False, manual_paint=False):
    if route.request.method == "HEAD":
        return route.continue_()
    # startLevel 已返回运行状态，只在测试浏览器中保留引用以布置边界局面。
    response = route.fetch()
    entry = "    startLevel(definition, campaign, campaignStage);"
    html = response.text()
    if manual_paint:
        html = capture_frames(html)
    if with_input:
        fields = 'return { game, scene, camera, renderer, config:'
        assert html.count(fields) == 1
        html = html.replace(fields, 'return { game, input, scene, camera, renderer, config:')
    if manual_steps:
        # 此类用例从键鼠驱动器按固定步长调用 game.step；截图只画当前画面。
        advance = "pendingTime += dt;\n      advanceSimulation();"
        html = html.replace("\r\n","\n")
        assert html.count(advance)==1
        html = html.replace(advance,"pendingTime = 0;")
    if not render:
        # 合成帧在一次 JS 调用中推进，只测时钟。真实战役用例保留每一帧的 WebGL 绘制。
        draw = "composer.render(dt);"
        assert html.count(draw) == 1
        html = html.replace(draw, "void 0;")
    assert html.count(entry) == 1, "关卡入口已变更"
    route.fulfill(response=response, body=html.replace(entry, entry.replace("startLevel(", "window.run = startLevel(")))


def check_reload(page):
    page.evaluate("""() => {
        const g = run.game, w = g.weapon;
        // 开阔地图的两批守卫已在场，让静止换弹、停表与恢复只受按键影响。
        g.player.hurtDelay = Infinity;
        w.ammo = 1; w.reserve = 4; w.cooldown = 0;
        // 在实际输入前订阅 HUD，低帧率机器上两次 Playwright 调用之间可能已经完成换弹。
        const node=document.querySelector('#weapon-state');
        window.autoReloadShown=false;
        const observer=new MutationObserver(records=>{
            if (records.some(record=>[...record.addedNodes].some(n=>n.textContent.includes('换弹中')))) {
                window.autoReloadShown=true;
                observer.disconnect();
            }
        });
        observer.observe(node,{childList:true,subtree:true});
    }""")
    page.mouse.down()
    try:
        page.wait_for_function("window.autoReloadShown")
        page.wait_for_function("run.game.weapon.reserve === 0 && run.game.weapon.ammo === 0")
        page.wait_for_function("document.querySelector('#weapon-state').textContent === '弹药耗尽'")
        assert page.evaluate("run.game.weapon.reloadLeft") == 0
    finally:
        page.mouse.up()
    page.evaluate("Object.assign(run.game.weapon, {ammo: 3, reserve: 2})")
    page.keyboard.press("r")
    page.wait_for_function("run.game.weapon.reloadLeft > 0")
    page.keyboard.press("Escape")
    page.wait_for_function("run.game.phase === 'pause'")
    remaining = page.evaluate("run.game.weapon.reloadLeft")
    page.wait_for_timeout(120)
    assert page.evaluate("run.game.weapon.reloadLeft") == remaining
    page.locator("#start").click()
    page.wait_for_function("run.game.weapon.ammo === 5 && run.game.weapon.reserve === 0")
    page.evaluate("run.game.player.hurtDelay = 0")


def finish_at_gate(page):
    name, interact = page.evaluate("""() => {
        const {game:g,nav}=run, s=g.story;
        const at=t=>{Object.assign(g.player,{x:t.x,y:t.y,z:t.z});nav.rebuild(t.x,t.z);};
        const treasure=g.pickups.objects.find(i=>i.active && i.kind==='rare');
        const treasureName=treasure.name;
        at(treasure);g.pickups.update(.05,g.player,g);
        if(treasure.manual && !g.pickups.takeNearbyReward(g.player,g))throw Error('手动拾取战利品失败');
        const tick=()=>{g.time+=.5;g.beasts.releaseSplits(g);g.objective.step(.5,g);s.step(.5,g);};
        for(let n=0;n<2400 && g.phase==='play' && s.stage!=='complete';n++) {
            const state=s.stage,t=s.target;
            if(state==='rifts'){
                const task=s.rifts.guide(g,'F');
                at(task.target);
                if(task.stage==='collect'||task.stage==='plant')s.interact(g);
                tick();continue;
            }
            if(s.defense && (state==='signal'||state==='fortify')){
                at(s.defense.target);
                if(!s.defense.started || s.defense.boardable)s.interact(g);
                tick();continue;
            }
            if(state==='convoy'){
                const o=g.objective,v=o.drone.position;
                at({x:v.x,y:v.y-1,z:v.z});
                if(o.convoy.dock)s.interact(g);
                g.time+=.1;g.encounter.update(g,.1);o.step(.1,g);s.step(.1,g);
                continue;
            }
            if(t)at(t);
            if(state==='rescue')return [treasureName,true];
            if(state==='boss') {
                const b=g.beasts.boss;
                if(b) {
                    at(b);
                    for(let phase=0;phase<3;phase++) {
                        g.time+=2;g.beasts.damage(b,1e7,g,'weapon');
                        if(phase<2 && (!b.active || b.fight.stage!==phase+1))throw Error('首领未逐阶段转场');
                    }
                    if(!g.bossDead)throw Error('首领仍在场');
                    if(s.actionName==='歼灭'){
                        if(g.phase!=='win' || g.pickups.keyItem?.active) throw Error('歼灭行动未在首领死亡时结算');
                        return [treasureName,false];
                    }
                    at(g.pickups.keyItem);
                    if(!g.pickups.takeKey(g.player,g))throw Error('核心无法拾取');
                }
            }else if(state==='use'||state==='beacon') {
                if(!s.interact(g))throw Error('任务目标不能交互 '+state);
            }else {
                if(g.objective.mode==='escort' && t)g.objective.drone.position.set(t.x,t.y+1,t.z);
                for(const b of g.beasts.pool)if(b.active && b.type!==3)g.beasts.damage(b,1e7,g,'weapon');
            }
            tick();
        }
        if(g.phase==='win')return [treasureName,false];
        if(s.stage!=='complete')throw Error('分区未完成 '+s.stage);
        const gate=g.level.gate;
        if(g.objective.mode==='escort'){
            const d=g.objective.drone.position,start={x:d.x,y:d.y-1,z:d.z};
            for(let i=0;i<=200;i++){
                const t=i/200;
                at({x:start.x+(gate.x-start.x)*t,y:start.y+(gate.y-start.y)*t,z:start.z+(gate.z-start.z)*t});
                g.objective.step(.2,g);
            }
        }
        at(gate);
        if(!g.ready())throw Error('撤离条件未满足 '+g.objective.label(g));
        return [treasureName,true];
    }""")
    if interact:
        page.keyboard.press("f")
    page.wait_for_function("run.game.phase === 'win'")
    page.wait_for_function("document.querySelector('#menu-status').textContent.includes('已保存')")
    return name


def check_exit(page, url, level_id):
    name = finish_at_gate(page)
    progress = page.request.get(url + "/api/progress").json()
    assert any(row["level"] == level_id and row["name"] == name for row in progress["loot"])
    assert next(level for level in progress["levels"] if level["id"] == level_id)["cleared"]


def check_frost_immunity(page, url):
    page.goto(url + "/polar-station/")
    page.wait_for_function("!!window.run")
    page.locator("#start").click()
    page.wait_for_function("run.game.phase === 'play'")
    result = page.evaluate("""() => {
        const g = run.game, combat = g.weapon.combat;
        const b = g.beasts.spawn(0, g.player.x + 2, g.player.z);
        const hit = () => combat.hit(b, {damage: 1}, g);
        for (let i = 0; i < 5; i++) hit();
        g.time += 2;
        g.beasts.update(.016, g.player, g);
        for (let i = 0; i < 4; i++) hit();
        g.beasts.update(.016, g.player, g);
        const before = b.perkMoveScale;
        hit();
        g.beasts.update(.016, g.player, g);
        return [before, b.statusEffects.size, b.perkMoveScale];
    }""")
    assert abs(result[0] - .68) < 1e-6 and result[1:] == [0, 1], result


def check_fatal_steam(page, url):
    kills = page.evaluate("""() => {
        const g = run.game, b = g.beasts.spawn(0, g.player.x + 2, g.player.z);
        const atVent = {x: 29, y: 0, z: 5};
        Object.assign(g.player, atVent, {hp: 1, hurtDelay: 0, escaped: true});
        Object.assign(b, atVent, {hp: 1});
        g.encounter.active.set(1, g.time + 6);
        g.encounter.tick = 0;
        const before = g.kills;
        g.step(.016);
        return [g.phase, before, g.kills];
    }""")
    page.wait_for_function("document.querySelector('#menu-status').textContent.includes('已保存')")
    latest = page.request.get(url + "/api/progress").json()["battles"][0]
    assert latest["level"] == "brass-factory" and not latest["won"], latest
    assert kills[0] == "fail" and kills[1] == kills[2] == latest["kills"], (kills, latest)
    page.locator("#start").click()
    page.wait_for_function("run.game.phase === 'play'")


def check_pending_saves(browser, url):
    page = browser.new_page()
    first, second = LEVELS[:2]
    battles = [dict(id=str(uuid4()), level=first["id"], won=True, kills=0,
                    endedAt=1000 + i, durationMs=100, loot=[]) for i in range(3)]
    page.goto(url + "/")
    page.locator("#continue").wait_for()
    page.evaluate("""rows => {
        rows.forEach(b => localStorage.setItem('super-player:pending:' + b.id, JSON.stringify(b)));
        localStorage.removeItem('super-player:first-entry:v1');
    }""", battles)
    held = []

    def hold_write(route):
        held.append(route)
        page.evaluate("count => window.pendingWrites = count", len(held))
        if len(held) == 3:
            route.continue_()

    page.route("**/api/battles", hold_write)
    with page.expect_request("**/api/battles"):
        page.reload()
    page.wait_for_function("id => document.querySelector('#continue').getAttribute('href') === './' + id + '/'",
                           arg=first["id"], timeout=3000)
    assert page.locator("#continue").is_visible()
    page.wait_for_function("window.pendingWrites === 1")
    held[0].continue_()
    page.wait_for_function("id => document.querySelector('#continue').getAttribute('href') === './' + id + '/'",
                           arg=second["id"], timeout=3000)
    page.wait_for_function("window.pendingWrites === 2")
    held[1].fulfill(status=503, body="{}")
    page.locator("#retry").wait_for()
    assert page.evaluate("Object.keys(localStorage).filter(k => k.startsWith('super-player:pending:')).length") == 1
    page.unroute("**/api/battles", hold_write)
    page.locator("#retry").click()
    page.locator("#retry").wait_for(state="hidden")
    assert page.request.get(url + "/api/progress").json()["battleCount"] == 3
    page.close()


def check_frame_timing(browser, url, fps):
    page = browser.new_page(viewport={"width": 480, "height": 320})
    stage = "shanhai-secret-realm"
    page.route(url + "/" + stage + "/", lambda route: expose_game(route, render=False))
    page.add_init_script("""const nativeFrame = requestAnimationFrame.bind(window);
        window.requestAnimationFrame = fn => {
            if (fn.name !== 'animate') return nativeFrame(fn);
            window.gameFrame = fn;
            return 0;
        };""")
    page.goto(url + "/" + stage + "/")
    page.wait_for_function("!!window.run && !!window.gameFrame")
    page.locator("#start").click()
    page.wait_for_function("run.game.phase === 'play'")
    with page.expect_response("**/api/battles") as saved:
        timings = page.evaluate("""fps => {
            const g = run.game, w = g.weapon;
            const start = performance.now();
            // 结清点击开始到注入首帧之间的前台时间，再从同一个时刻采样。
            let previous;
            do { previous = g.time; gameFrame(start); } while (g.time > previous && g.phase === 'play');
            g.time = 119;
            w.ammo = 0;
            w.reload(g);
            let moonAt, reloadAt;
            for (let frame = 1; frame <= fps * 2; frame++) {
                gameFrame(start + frame * 1000 / fps);
                if (g.encounter.phase === 'active') moonAt ??= frame / fps;
                if (w.ammo > 0) reloadAt ??= frame / fps;
            }
            g.finish(false);
            return [moonAt, reloadAt, g.time];
        }""", fps)
    assert saved.value.ok
    moon, reload_time, elapsed = timings
    assert abs(moon - 1) <= 1 / fps + 1e-8, timings
    assert abs(reload_time - 1.8) <= 1 / fps + 1e-8, timings
    assert abs(elapsed - 121) < 1e-8, timings
    assert saved.value.request.post_data_json["durationMs"] == 121000
    page.wait_for_function("document.querySelector('#menu-status').textContent.includes('已保存')")
    page.locator("#start").click()
    page.wait_for_function("run.game.phase === 'play'")
    page.evaluate("""() => {
        gameFrame(performance.now());
        Object.defineProperty(document, 'hidden', {configurable:true, value:true});
        document.dispatchEvent(new Event('visibilitychange'));
        gameFrame(performance.now() + 60000);
    }""")
    assert page.evaluate("run.game.phase") == "pause"
    paused = page.evaluate("run.game.time")
    page.evaluate("""() => {
        delete document.hidden;
        document.dispatchEvent(new Event('visibilitychange'));
        gameFrame(performance.now() + 60000);
    }""")
    assert page.evaluate("run.game.time") == paused
    page.locator("#start").click()
    page.wait_for_function("run.game.phase === 'play'")
    page.evaluate("window.resumedFrame = performance.now() + 20; gameFrame(resumedFrame)")
    resumed = page.evaluate("run.game.time")
    assert 0 < resumed - paused < 1
    page.evaluate("""() => {
        gameFrame(resumedFrame + 800);
        // 首批 320 毫秒推进后，在补算定时器执行前切入后台。
        Object.defineProperty(document, 'hidden', {configurable:true, value:true});
        document.dispatchEvent(new Event('visibilitychange'));
    }""")
    assert abs(page.evaluate("run.game.time") - resumed - .32) < 1e-8
    page.wait_for_function("!document.pointerLockElement")
    page.evaluate("""() => {
        delete document.hidden;
        document.dispatchEvent(new Event('visibilitychange'));
    }""")
    page.locator("#start").click()
    page.wait_for_function("run.game.phase === 'play'")
    page.evaluate("gameFrame(performance.now())")
    page.wait_for_function("t => run.game.time >= t - 1e-8", arg=resumed + .8, timeout=3000)
    page.close()


def check_history_pages(page, url):
    # 多页记录中有同一毫秒结束的对战，且旧局可在新局之后补写。
    rows = []
    newest = int(time.time() * 1000) + 1000
    for i in range(46):
        battle = dict(id=str(uuid4()), level=LEVELS[0]["id"], won=False, kills=0,
                      endedAt=newest + (i * 7 % 3), durationMs=100, loot=[])
        assert page.request.post(url + "/api/battles", headers={"Origin": url}, data=battle).ok
        rows.append(battle)
    expected = [b["id"] for b in sorted(reversed(rows), key=lambda b: b["endedAt"], reverse=True)]
    history = page.request.get(url + "/api/progress").json()
    ids = [row["id"] for row in history["battles"]]
    while history["nextBefore"]:
        history = page.request.get(url + "/api/battles?before=" + str(history["nextBefore"])).json()
        ids.extend(row["id"] for row in history["battles"])
    assert ids[:len(expected)] == expected
    assert len(ids) == len(set(ids))

    # 部分补存失败时，历史翻页不能覆盖战役重试入口。
    pending = dict(rows[0], id=str(uuid4()))
    page.goto(url + "/#history")
    page.evaluate("b => localStorage.setItem('super-player:pending:' + b.id, JSON.stringify(b))", pending)
    page.route("**/api/battles", lambda route: route.fulfill(status=503))
    page.reload()
    page.locator("#retry").wait_for()
    page.route("**/api/battles?before=*", lambda route: route.fulfill(status=503))
    page.locator("#more-battles").click()
    page.locator("#history-error").wait_for()
    assert page.locator("#retry").is_visible()
    page.unroute("**/api/battles?before=*")
    page.locator("#more-battles").click()
    page.wait_for_function("document.querySelectorAll('#battle-list tr').length > 20")
    assert page.locator("#history-error").is_hidden() and page.locator("#retry").is_visible()
    page.unroute("**/api/battles")
    page.locator("#retry").click()
    page.locator("#retry").wait_for(state="hidden")


def check_loadout_during_replay(page, url):
    page.goto(url + "/#collection")
    page.locator("#rifle-default").wait_for()
    battle = dict(id=str(uuid4()), level=LEVELS[0]["id"], won=False, kills=0,
                  endedAt=int(time.time() * 1000), durationMs=100, loot=[])
    page.evaluate("b => localStorage.setItem('super-player:pending:' + b.id, JSON.stringify(b))", battle)
    snapshots = []

    def read_progress(route):
        response = route.fetch()
        snapshots.append((route, response))
        if len(snapshots) == 1:
            route.fulfill(response=response)
        else:
            page.evaluate("window.waitingForProgress = true")

    page.route("**/api/progress", read_progress)
    page.reload()
    page.wait_for_function("window.waitingForProgress")
    page.locator("#rifle-default").click()
    page.locator("#rifle-default").wait_for(state="hidden")
    route, response = snapshots[-1]
    route.fulfill(response=response)
    count = response.json()["battleCount"]
    page.wait_for_function("n => document.querySelector('#battle-count').textContent.includes(n + ' 局')", arg=count)
    assert page.locator("#rifle-default").is_hidden()
    assert page.request.get(url + "/api/loadout").json()["equippedSkin"] is None
    page.unroute("**/api/progress", read_progress)


def verify(browser, url):
    check_pending_saves(browser, url)
    for fps in (20, 60):
        check_frame_timing(browser, url, fps)
    page = browser.new_page(viewport={"width": 960, "height": 600})
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    for level in LEVELS:
        page.route(url + "/" + level["id"] + "/", expose_game)
    # 建立一个已完成旧关的临时存档，三个新关均经过真实页面结算。
    first_new = next(i for i, row in enumerate(LEVELS) if row["id"] == NEW_STAGES[0])
    for level in LEVELS[:first_new]:
        response = page.request.post(url + "/api/battles", headers={"Origin": url}, data={
            "id": str(uuid4()), "level": level["id"], "won": True, "kills": 150,
            "endedAt": int(time.time() * 1000), "durationMs": 90000, "loot": [],
        })
        assert response.ok, response.text()

    check_frost_immunity(page, url)
    equipped = None
    for stage in NEW_STAGES:
        page.goto(f"{url}/{stage}/")
        page.wait_for_function("!!window.run")
        assert page.evaluate("run.game.weapon.combat.stage") == stage
        assert page.evaluate("run.game.weapon.combat.skin") == (equipped or stage)
        page.locator("#start").click()
        page.wait_for_function("run.game.phase === 'play' && !!document.pointerLockElement")
        if equipped is None:
            check_reload(page)
        if stage == "brass-factory":
            check_fatal_steam(page, url)
        check_exit(page, url, stage)
        page.goto(url + "/#collection")
        page.locator(f'.rifle-option[data-weapon-id="{stage}"]').click()
        page.locator("#rifle-equip").click()
        page.wait_for_function("document.querySelector('#rifle-equip').textContent === '已佩戴'")
        assert page.request.get(url + "/api/loadout").json()["equippedSkin"] == stage
        equipped = stage
    page.goto(f"{url}/{LEVELS[0]['id']}/")
    page.wait_for_function("!!window.run")
    assert page.evaluate("run.game.weapon.combat.skin") == NEW_STAGES[-1]
    check_history_pages(page, url)
    check_loadout_during_replay(page, url)
    assert not errors, errors
    page.close()


if __name__ == "__main__":
    with TemporaryDirectory() as storage:
        server = subprocess.Popen(
            [sys.executable, "-X", "utf8", "-u", "server.py", "--port", "0",
             "--db", str(Path(storage) / "campaign.sqlite")],
            cwd=ROOT, stdout=subprocess.PIPE, encoding="utf-8",
        )
        try:
            url = re.search(r"http://127\.0\.0\.1:\d+", server.stdout.readline()).group()
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER", "chrome"))
                try:
                    verify(browser, url)
                finally:
                    browser.close()
            print("PASS campaign_browser")
        finally:
            server.terminate()
            server.wait(timeout=10)
