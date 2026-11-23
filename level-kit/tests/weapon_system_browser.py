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


def run(browser,url):
    page=browser.new_page(viewport={"width":1024,"height":720})
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
    page.keyboard.press("v")
    page.wait_for_function("run.game.player.thirdPerson && !run.game.weapon.group.visible")
    page.mouse.down(button="right")
    page.wait_for_function("run.game.player.ads>.9 && !document.querySelector('#aim-dot').hidden && run.game.weapon.group.visible")
    assert page.evaluate("run.camera.fov<run.game.player.baseFov")
    page.mouse.up(button="right")
    page.wait_for_function("!run.game.weapon.group.visible")
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
    stress=page.evaluate("""async () => {
      const g=run.game,w=g.weapon,p=g.player,b=g.beasts;
      const step=g.step; g.step=()=>{};p.look.rotation.set(0,0,0,'YXZ');
      p.thirdPerson=false;p.positionCamera(0);w.render(0,p,g);
      b.pool.forEach(x=>x.active=false);b.live=0;b.boss=null;
      for(let i=0;i<96;i++){
        const enemy=b.spawn(0,(i%12-5.5)*.66,-6-Math.floor(i/12)*.62,40);
        enemy.hp=100000;enemy.statusEffects.set('wet',{type:'wet',until:Infinity,stacks:1});
      }
      b.refreshHash();
      const sample=async(active)=>{
        const frames=[];let last=await new Promise(requestAnimationFrame);
        for(let i=0;i<52;i++){
          g.time+=.033;
          if(i%15===0){
            w.shoot(g);
            if(active){
              w.combat.element(b.pool[48],'electric',g,'weapon');
              g.sound.stageEvent('warning',g,b.pool[48]);
            }
          }
          g.effects.update(.033);p.positionCamera(.033);w.render(.033,p,g);
          const now=await new Promise(requestAnimationFrame);
          if(i>=8)frames.push(now-last);last=now;
        }
        frames.sort((a,b)=>a-b);return [Math.round(frames[22]),Math.round(frames[41])];
      };
      const baseline=await sample(false), reactions=await sample(true);
      g.step=step;
      return {actors:b.live,baseline,reactions,firstDiscovery:localStorage.getItem('super-player:reaction-discoveries:v1')};
    }""")
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
    rifle=sample_volley(page)
    assert len(rifle["high"]["lengths"])==1 and rifle["high"]["lengths"][0]>15,rifle
    assert set(rifle["high"]["sparks"])=={"spark"} and rifle["high"]["tint"]!=pellet["high"]["tint"],rifle
    print("PASS native meshes and impacts, high/low shotgun rays 3/2, rifle single full-length ray",flush=True)
    page.evaluate("document.exitPointerLock()")
    for mode in ["range","tutorial"]:
        page.goto(url+"/practice/?mode="+mode+"&weapon=shotgun-pump")
        page.wait_for_function("document.querySelector('#practice-weapon').value==='shotgun-pump'")
        page.click("#start")
        page.wait_for_function("!document.querySelector('#hud').hidden")
        assert "雨巷破阵" in page.locator("#rifle-label").inner_text()
        page.evaluate("document.exitPointerLock()")
    assert not errors,errors
    print("PASS SQLite / IndexedDB legacy purchases, free per-gun switch, ADS, reload and camera obstruction",result,flush=True)
    page.close()


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
