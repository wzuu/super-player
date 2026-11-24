"""用 SQLite / IndexedDB 的旧军需存档进入战役，验证霰弹装填、视角、遮挡与计数。"""
import os
import re
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4
from playwright.sync_api import sync_playwright
from campaign_browser import ROOT, LEVELS, expose_game
from controls_browser import check_weapon_model


def sample_volley(page):
    return page.evaluate("""() => {
      const g=run.game,p=g.player,fx=g.effects,graphics=run.config.graphics;
      Object.assign(p,{x:20,y:45,z:0,thirdPerson:false});p.look.rotation.set(0,0,0,'YXZ');
      p.positionCamera(0);g.weapon.render(0,p,g);
      g.beasts.pool.forEach(b=>{b.active=false;});g.beasts.live=0;g.beasts.refreshHash();
      g.level.box(20,-20,12,.3,44,52);
      function sample(scale){
        graphics.particleScale=scale;fx.reset();g.weapon.shoot(g);fx.update(.012);
        const mesh=fx.traceMesh,matrices=mesh.instanceMatrix.array;
        const lengths=Array.from({length:mesh.count},(_,i)=>Math.hypot(...matrices.slice(i*16+4,i*16+7)));
        const traces=fx.traces.filter(p=>p.life>0);
        const spread=traces.reduce((max,trace)=>Math.max(max,trace.b.distanceTo(traces[0].b)),0);
        return {lengths,tint:Array.from(mesh.instanceColor.array.slice(0,3)),
          spread,sparks:fx.dots.filter(p=>p.life>0).map(p=>p.style)};
      }
      const scale=graphics.particleScale, high=sample(1),low=sample(.3);
      graphics.particleScale=scale;
      return {high,low};
    }""")


def compare_ammo_branches(page):
    return page.evaluate("""async () => {
      const {applyBranches}=await import('/level-kit/src/gear.mjs');
      const g=run.game,p=g.player,b=g.beasts,w=g.weapon,cfg=run.config.weapon,base={...cfg};
      Object.assign(p,{x:-20,y:45,z:0,thirdPerson:false});p.look.rotation.set(0,0,0,'YXZ');p.positionCamera(0);
      function shot(branch,formation) {
        b.pool.forEach(x=>{x.active=false;});b.live=0;b.hash.clear();
        const positions=formation==='column'?[[0,-5],[0,-10],[0,-14]]:[[0,-5],[-1.4,-5],[1.4,-5],[2.3,-6]];
        const targets=positions.map(([x,z])=>{
          const t=b.spawn(0,p.x+x,z,p.y);t.hp=1000;t.height=2.4;return t;
        });
        b.refreshHash();applyBranches(cfg,base,{[branch]:true});w.heat=0;w.shoot(g);
        return targets.map(t=>Math.round(1000-t.hp));
      }
      const scores={};
      for (const f of ['column','group']) for (const branch of ['pierce','split']) scores[f+branch]=shot(branch,f);
      Object.assign(cfg,base);
      return scores;
    }""")


def live_shake(page,url):
    peer=page.context.new_page()
    peer.goto(url)
    def setting(attack,hit,steady):
        prefs={"attackShake":attack,"hitShake":hit,"steady":steady}
        peer.evaluate("""async fields=>{
          const {preferences,storePreferences}=await import('/level-kit/src/preferences.mjs');
          storePreferences({...preferences(),...fields});
        }""",prefs)
        page.wait_for_function("""p=>run.config.feedback.attackShake===p.attackShake &&
          run.config.feedback.hitShake===p.hitShake && run.config.player.steady===p.steady""",arg=prefs)
        return page.evaluate("""()=>{
          const g=run.game,p=g.player,c=run.config;
          Object.assign(p,{recoil:0,recoilRoll:0,sway:0,shake:0,attackKick:0,ads:0,aiming:false,impactLeft:0});
          g.weapon.lastImpact=-Infinity;g.weapon.impact(4,g);
          const random=Math.random;
          try {
            Math.random=()=>.8;p.positionCamera(0);
            const attack=Math.abs(p.visual.y);
            p.impactLeft=c.feedback.impactDuration;p.impactStrength=1;p.positionCamera(0);
            return [attack,p.baseFov-run.camera.fov];
          } finally { Math.random=random; }
        }""")
    full=setting(1,1,False)
    quarter=setting(.25,0,False)
    disabled=setting(0,1,False)
    steady=setting(1,1,True)
    restored=setting(1,1,False)
    assert full[0]>0 and full[1]>0 and restored==full
    assert abs(quarter[0]/full[0]-.25)<.001 and quarter[1]==0
    assert disabled==[0,full[1]] and steady==[0,0]
    peer.close()
    print("PASS live camera preferences: attack 100% / 25% / off, independent damage, steady off/on",flush=True)


def run(browser,url):
    context=browser.new_context(viewport={"width":1024,"height":720})
    page=context.new_page()
    errors=[]
    page.on("pageerror",lambda error:errors.append(str(error)))
    page.goto(url+"/")
    page.wait_for_selector(".mission-card")
    page.get_by_role("button",name="直接开始").click()
    req=page.request
    def post(api,data):
        return req.post(url+"/api/"+api,headers={"Origin":url},data=data)
    assert not post("loadout",{"skin":"shotgun-pump"}).ok
    for stage in LEVELS[:3]:
        assert post("battles",{"id":str(uuid4()),"level":stage["id"],"won":True,"kills":1,"durationMs":1000,
                 "endedAt":1000,"loot":[{"name":"校验","value":500}]}).ok
    assert post("loadout",{"skin":"shotgun-pump"}).ok
    old={"spent":730,"mods":{"magazine":True,"reload":True,"recovery":True}}
    assert post("gear",{"revision":0,"state":old}).ok
    page.goto(url+"/#collection")
    page.locator(".rifle-option",has_text="雨巷破阵").click()
    page.locator("#weapon-customize summary").click()
    page.locator("#weapon-mod-slots button",has_text="快换弹匣 · 已选").wait_for()
    page.get_by_role("button",name="扩容弹匣 · 免费切换").click()
    page.locator("#weapon-mod-slots button",has_text="扩容弹匣 · 已选").wait_for()
    assert req.get(url+"/api/gear").json()["state"]["spent"]==730
    idb=page.evaluate("""async ({old,levels})=>{
      const {openBrowserStore}=await import('/campaign/browser-store.mjs');
      const {defaultGear,packKit,chooseBranch,supplies,updateGear}=await import('/level-kit/src/gear.mjs');
      const store=await openBrowserStore(levels,'weapon-system-test');
      await store.writeGear({revision:0,state:old});
      const first=packKit(defaultGear((await store.gear()).state),supplies,'shotgun-pump');
      await updateGear(store,state=>chooseBranch(state,'shotgun-pump','magazine'));
      const snapshot=await store.gear();
      return [first.mods.reload,packKit(defaultGear(snapshot.state),supplies,'shotgun-pump').mods.magazine,snapshot.state.spent];
    }""",{"old":old,"levels":LEVELS})
    assert idb==[True,True,730]
    path="/rain-city/"
    page.route(url+path,expose_game)
    page.goto(url+path)
    page.wait_for_function("document.querySelector('#weapon-build').textContent.includes('扩容弹匣')")
    assert "扩容弹匣" in page.locator("#weapon-build").inner_text()
    page.click("#start")
    page.wait_for_function("run?.game.phase==='play'")
    check_weapon_model(page)
    page.keyboard.down("v")
    page.wait_for_function("run.game.player.thirdPerson && !run.game.weapon.group.visible")
    page.keyboard.down("v")
    page.keyboard.up("v")
    assert page.evaluate("run.game.player.thirdPerson")
    page.mouse.down(button="right")
    fov=page.evaluate("""()=>{
      const p=run.game.player; p.impactLeft=0; p.positionCamera(.3);
      const normal=run.camera.fov;p.impactLeft=run.config.feedback.impactDuration;p.impactStrength=1;
      p.positionCamera(0);const hurt=run.camera.fov;p.impactLeft=0;p.positionCamera(0);
      return {normal,hurt,recovered:run.camera.fov,base:p.baseFov};
    }""")
    assert fov["normal"]==fov["base"]==fov["recovered"] and fov["hurt"]+.1<fov["normal"],fov
    page.mouse.up(button="right")
    assert page.evaluate("!run.game.player.aimRequested && run.game.ui.aimDot.hidden && !run.game.weapon.group.visible")
    page.evaluate("Object.assign(run.game.weapon,{ammo:1,reserve:4})")
    page.keyboard.press("r")
    page.wait_for_function("!document.querySelector('#reload-ring').hidden")
    page.mouse.down()
    page.wait_for_function("run.game.performance.shots===1")
    page.mouse.up()
    page.wait_for_function("run.game.weapon.ammo>=1")
    page.keyboard.press("Escape")
    page.wait_for_function("run.game.phase==='pause'")
    frozen=page.evaluate("run.game.weapon.reloadLeft")
    page.wait_for_timeout(120)
    assert page.evaluate("run.game.weapon.reloadLeft")==frozen
    page.click("#start")
    page.wait_for_function("run.game.phase==='play' && run.game.player.thirdPerson")
    result=page.evaluate("""() => {
      const g=run.game,p=g.player,w=g.weapon,b=g.beasts,level=g.level;
      p.look.rotation.set(0,0,0,'YXZ');p.positionCamera(0);
      // 固定无地形的高处，不受本关随机刷怪或地面结构影响。
      Object.assign(p,{x:0,y:40,z:0});p.positionCamera(0);
      const eye=run.camera.position.clone();
      const wall=level.box(0,.53,3,.2,40,44);
      w.render(0,p,g);
      const wallDistance=run.camera.position.distanceTo(eye);
      wall.active=false;p.positionCamera(0);w.render(0,p,g);
      const openDistance=run.camera.position.distanceTo(eye);
      const spawn=()=>{const enemy=b.spawn(1,0,-3.6,40);enemy.height=2.3;enemy.hp=1;return enemy;};
      b.pool.forEach(b=>b.active=false);b.live=0;b.hash.clear();
      const first=spawn(),second=spawn();b.refreshHash();
      const cover=level.box(0,-.46,5,.2,40,44);
      const kills=g.performance.weaponKills, shots=g.performance.shots, hits=g.performance.hits;
      p.positionCamera(0);w.shoot(g);
      const blocked=first.active && second.active;
      cover.active=false;w.shoot(g);
      return {wallDistance,openDistance,blocked,kills:g.performance.weaponKills-kills,
        shots:g.performance.shots-shots,hits:g.performance.hits-hits};
    }""")
    assert result["wallDistance"]<.65 and result["openDistance"]>2.4 and result["blocked"],result
    assert [result[k] for k in ["kills","shots","hits"]]==[2,2,1],result
    page.evaluate("""()=>{
      const g=run.game,p=g.player,b=g.beasts;
      Object.assign(p,{x:0,y:40,z:0,vy:0,thirdPerson:true});p.look.rotation.set(0,0,0,'YXZ');
      p.positionCamera(0);b.pool.forEach(x=>x.active=false);b.live=0;
      window.practiceEnemy=b.spawn(1,0,-3.2,40);practiceEnemy.hp=1;practiceEnemy.height=2.4;b.refreshHash();
      window.practiceCover=g.level.box(0,-1.4,3,.27,36,44);
      Object.assign(g.weapon,{ammo:6,cooldown:0,reloadLeft:0});
      window.initialShots=g.performance.shots;
    }""")
    page.mouse.down()
    page.wait_for_function("run.game.performance.shots>initialShots")
    page.mouse.up()
    assert page.evaluate("practiceEnemy.active"),"第三人称实际输入穿过了掩体"
    page.evaluate("""()=>{practiceCover.active=false;const p=run.game.player;
      Object.assign(p,{x:0,y:40,z:0,vy:0,recoil:0,shake:0});
      Object.assign(practiceEnemy,{x:0,y:40,z:-3.2,height:2.4,stun:2});
      run.game.beasts.refreshHash();run.game.weapon.cooldown=0;}""")
    page.mouse.down()
    page.wait_for_function("!practiceEnemy.active")
    page.mouse.up()
    page.add_script_tag(content=Path(__file__).with_name("shotgun_stress.js").read_text(encoding="utf-8"))
    stress=page.evaluate("shotgunStress")
    assert stress["actors"]==96 and "conduct" in stress["firstDiscovery"],stress
    print("PASS 96 actors with shotgun baseline and positional warning / conductive chain frame median and p95",stress,flush=True)
    pellet=sample_volley(page)
    assert len(pellet["high"]["lengths"])==3 and len(pellet["low"]["lengths"])==2,pellet
    assert all(7.9<length<8.1 for length in pellet["high"]["lengths"]),pellet
    assert pellet["high"]["spread"]>.3 and set(pellet["high"]["sparks"])=={"pellet"},pellet
    page.evaluate("document.exitPointerLock()")
    assert post("loadout",{"skin":"rain-city"}).ok
    page.goto(url+path)
    page.click("#start")
    page.wait_for_function("run.game.phase==='play'")
    # 这把步枪继承旧档快换分支。空仓自动换弹，重复按 R 不延长圆环。
    page.mouse.down(button="right")
    timer=page.evaluate("""()=>{const g=run.game,w=g.weapon,ring=document.querySelector('#reload-ring');
      Object.assign(w,{ammo:0,reserve:6,cooldown:0,reloadLeft:0});g.step(.016);g.step(.2);
      const before=w.reloadLeft;
      document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyR',bubbles:true}));
      g.step(.016);document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyR',bubbles:true}));
      return {duration:w.reloadTotal,before,after:w.reloadLeft,visible:!ring.hidden&&g.ui.aimDot.hidden&&!g.player.aimRequested,
        ratio:parseFloat(ring.style.getPropertyValue('--remaining')),actual:w.reloadLeft/w.reloadTotal};
    }""")
    assert abs(timer["duration"]-1.8*.78)<.001 and timer["visible"],timer
    assert timer["after"]<timer["before"] and abs(timer["ratio"]-timer["actual"])<.001,timer
    page.wait_for_function("run.game.weapon.ammo===6 && run.game.ui.ring.hidden && run.game.ui.aimDot.hidden")
    page.mouse.up(button="right")
    assert page.evaluate("!run.game.player.aiming && run.game.player.ads===0")
    rifle=sample_volley(page)
    assert len(rifle["high"]["lengths"])==1 and rifle["high"]["lengths"][0]>15,rifle
    assert set(rifle["high"]["sparks"])=={"spark"} and rifle["high"]["tint"]!=pellet["high"]["tint"],rifle
    print("PASS native meshes and impacts, high/low shotgun rays 3/2, rifle single full-length ray",flush=True)
    branches=compare_ammo_branches(page)
    assert branches["columnpierce"][1]>0 and branches["columnpierce"][2]==branches["columnsplit"][1]==0,branches
    assert all(damage>0 for damage in branches["groupsplit"]) and not any(branches["grouppierce"][1:]),branches
    print("PASS exclusive ammunition branches against a column and a cluster, damage per target",branches,flush=True)
    page.evaluate("document.exitPointerLock()")
    live_shake(page,url)
    page.route(url+"/practice/?*",expose_game)
    for mode in ["range","tutorial"]:
        page.goto(url+"/practice/?mode="+mode+"&weapon=shotgun-pump")
        page.wait_for_function("document.querySelector('#practice-weapon').value==='shotgun-pump'")
        page.click("#start")
        page.wait_for_function("!document.querySelector('#hud').hidden")
        assert "雨巷破阵" in page.locator("#rifle-label").inner_text()
        check_weapon_model(page)
        page.keyboard.press("v")
        page.wait_for_function("run.game.player.thirdPerson && !run.game.weapon.group.visible")
        assert page.evaluate("getComputedStyle(run.game.ui.nodes.cross).visibility === 'visible'")
        page.evaluate("document.exitPointerLock()")
    assert not errors,errors
    print("PASS SQLite / IndexedDB legacy purchases, free per-gun switch, hip fire, reload and camera obstruction",result,flush=True)
    context.close()


if __name__=="__main__":
    with TemporaryDirectory() as tmp:
        proc=subprocess.Popen([sys.executable,"-X","utf8","-u","server.py","--port","0","--db",str(Path(tmp)/"test.sqlite")],
                              cwd=ROOT,stdout=subprocess.PIPE,encoding="utf-8")
        try:
            url=re.search(r"http://127\.0\.0\.1:\d+",proc.stdout.readline()).group()
            with sync_playwright() as pw:
                browser=pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER","chrome"))
                try: run(browser,url)
                finally: browser.close()
        finally:
            proc.terminate();proc.wait(timeout=10)
