"""检查全部战场支线落位及三类样板互动。冻结渲染帧，保留真实地图和碰撞。"""
import os
import re
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4
from campaign_browser import ROOT, LEVELS, sync_playwright


def verify(browser):
    page=browser.new_page(viewport={"width":960,"height":640})
    page.add_init_script("window.requestAnimationFrame = () => 1")
    errors=[]
    page.on("pageerror",lambda e:errors.append(str(e)))
    def expose(route):
        stage=route.request.url.split("/")[-2]
        html=(ROOT/stage/"index.html").read_text(encoding="utf8")
        entry="    startLevel(definition, campaign, campaignStage);"
        assert html.count(entry)==1
        route.fulfill(body=html.replace(entry,entry.replace("startLevel(","window.run=startLevel(")),content_type="text/html")
    page.route(re.compile(r"/[a-z-]+/index\.html$"),expose)
    for level in LEVELS:
        page.goto((ROOT/level['id']/'index.html').as_uri())
        page.wait_for_function("!!window.run", polling=100)
        result=page.evaluate("""() => {
          const {game:g,nav}=run,f=g.field;
          document.querySelector('#mission-mode').value='endless';g.reset();g.phase='play';
          nav.rebuild(g.level.spawn.x,g.level.spawn.z);
          const approach=room=>{
            if(!room)return false;
            const {x,y,z}=room.front;
            return [0,.45,-.45].some(dx=>[.6,1,1.4].some(dz=>
                !g.level.blocked(x+dx,z+dz,y,.33,1.77) && nav.dist[nav.index(x+dx,z+dz)]>=0));
          };
          return {vault:approach(f.vault), secret:approach(f.secret), hazards:f.traps.length,
                  device:!!f.device,secretPosition:f.secret?.front,vaultPosition:f.vault?.front};
        }""")
        assert result['vault'] and result['secret'] and result['device'] and result['hazards']==3,(level['id'],result)
        print("PASS accessible sites",level['id'],flush=True)
        if level['id'] in ['underground-lab','rain-city','ember-fortress','buried-tomb','haunted-midway',
                           'shanhai-secret-realm','sakura-night-town']:
            details=page.evaluate("""() => {
              const {game:g,nav,config}=run,f=g.field;
              const check=(ok,msg)=>{if(!ok)throw Error(msg)};
              const move=p=>Object.assign(g.player,{x:p.x,y:p.y,z:p.z});
              const clear=()=>{for(const b of g.beasts.pool)b.active=false;g.beasts.live=0;g.beasts.boss=null;g.beasts.refreshHash();};
              const reset=mode=>{document.querySelector('#mission-mode').value=mode;g.reset();g.phase='play';g.time=20;};
              const beat=b=>{for(let i=0;b.active && i<9;i++)g.beasts.damage(b,1e7,g,'weapon');check(!b.active,'guard survived');};
              const tick=(s=.4)=>{g.time+=s;f.step(s,g);};
              const wave=tag=>{for(let i=0;i<30;i++){
                for(const b of [...f.guards])if(b.active && b.fieldGroup===tag)beat(b);
                tick();
                if(!f.waitingGuards&&!f.guards.some(b=>b.active&&b.fieldGroup===tag))break;
              }};
              clear();move(f.vault.front);check(f.hint(g).includes('可选'),'vault hint');
              check(f.interact(g),'start vault');tick(2);check(f.guards.length>0,'no first wave');wave('vault');
              tick(3);check(f.guards.some(b=>b.active&&b.fieldGroup==='vault'),'no finite reinforcements');wave('vault');
              check(f.vaultStage==='clear','vault unfinished');
              const reward=g.pickups.objects.find(x=>x.active&&x.origin==='vault');
              check(reward?.value===f.cfg.value,'missing vault reward');move(reward);g.pickups.collect(reward,g.player,g);
              move(f.lever);check(f.vault.shortcut.box.active!==false && f.interact(g),'switch blocked');
              check(f.vault.shortcut.box.active===false && !f.vault.shortcut.mesh.visible,'open mismatch');
              check(!f.interact(g),'one-shot mechanism reused');
              nav.rebuild(g.level.spawn.x,g.level.spawn.z);
              check(nav.dist[nav.index(f.vault.center.x,f.vault.center.z)]>=0,'vault disconnected');
              move({...f.secret.front,y:f.secret.front.y+4});check(!f.interact(g)&&!f.secretOpen,'secret opened across floors');
              move(f.secret.front);check(f.interact(g)&&f.secretOpen&&!f.secret.door.box.active,'secret did not open');
              reset('endless');clear();check(!f.secretOpen&&!f.switchUsed&&f.vaultStage==='idle','replay stale state');
              const t=f.traps[0], c=t.p, w=g.weapon;
              // 用正常射线命中场景物，并确认墙前距离截断时不能击中。
              const origin=w.origin.set(c.x,c.y+t.y,c.z+2),dir=w.dir.set(0,0,-1);
              check(f.ray(origin,dir,2)?.trap===t && !f.ray(origin,dir,.5),'hazard ray distance');
              w.trace(g,false,false);check(t.hp<t.data.hp,'shooting missed hazard');
              const a=g.beasts.spawn(0,c.x,c.z,c.y),b=g.beasts.spawn(0,c.x+.25,c.z+.25,c.y);
              check(a&&b,'invalid trap floor');a.hp=b.hp=1;g.beasts.refreshHash();
              move(f.vault.front);const safeHP=g.player.hp;
              f.hit(t,1000,g);check(g.player.hp===safeHP,'unsafe outside blast');
              check(g.performance.environmentKills===2&&g.performance.weaponKills===0,'incorrect environmental attribution');
              const score=g.kills;f.hit(t,1000,g);check(score===g.kills,'duplicate explosion');
              reset('endless');clear();move(c);g.player.hurtDelay=0;f.hit(t,1000,g);
              check(g.player.hp<config.player.health,'blast risk missing');
              const pipe=f.traps[1],fall=f.traps[2];if(pipe.active)f.hit(pipe,1000,g);f.hit(fall,1000,g);
              check(pipe.lingering>g.time&&fall.falling>g.time,'hazard types');move(f.vault.front);tick(1);
              check(!fall.falling && !fall.mesh.visible,'fall incomplete');
              if(f.cfg.hunt){
                reset('hunt');const prey=f.prey,old={x:prey.x,z:prey.z};check(prey.type===0&&prey.hp===f.cfg.huntHP,'prey prototype');
                move(prey);prey.hp--; for(let i=0;i<90;i++){g.time+=.05;f.huntStep(prey,g,.05);}
                check(Math.hypot(old.x-prey.x,old.z-prey.z)>.3,'prey stuck');
                move({x:prey.x+30,y:prey.y,z:prey.z});f.huntStep(prey,g,.025);
                check(!f.guide(g).target,'hunter reveals exact location');
                beat(prey);check(g.ready()&&g.loot.some(i=>i.origin==='hunt'),'hunt failed');
                move(g.level.gate);g.trigger();check(g.blast>0,'hunt cannot evacuate');
                reset('hunt');g.time=f.huntLimit;f.step(0,g);check(g.phase==='fail','hunt time limit');
              }
              if(f.cfg.deep){
                const unlock=()=>{reset('classic');clear();g.story.blocksExit=false;g.kills=config.beasts.killsToWin;g.core=g.bossDead=true;move(g.level.gate);};
                unlock();
                check(g.ready()&&f.deepRoom.door.box.active,'base gate or deep lock');f.deepen(g);check(!f.deep,'missing confirmation');f.deepen(g);
                check(f.deep==='guards'&&!g.ready()&&f.interact(g),'base gate still open');
                nav.rebuild(g.player.x,g.player.z);
                const gateRoute=nav.dist[nav.index(f.deepRoom.center.x,f.deepRoom.center.z)];
                if(gateRoute<0)nav.rebuild(g.level.spawn.x,g.level.spawn.z);
                check(!f.deepRoom.door.box.active && nav.dist[nav.index(f.deepRoom.center.x,f.deepRoom.center.z)]>=0,
                  'deep entry disconnected '+JSON.stringify({gate:g.level.gate,front:f.deepRoom.front,spawn:g.level.spawn}));
                g.objective.step(300,g);check(g.phase==='play','deep has hard deadline');
                check(!g.pickups.add('ammo',g.player.x,g.player.z,g.player.y,'通常掉落',22),'deep sources leaked');
                wave('deep');check(f.deep==='reward'&&f.legend?.active,'missing legendary');
                move(f.legend);g.pickups.collect(f.legend,g.player,g);tick();check(f.deep==='exit','legendary prematurely settled');
                move(f.deepExit);check(f.interact(g)&&g.phase==='win'&&f.deepFinished,'deep extraction');
                unlock();f.deepen(g);f.deepen(g);g.finish(false);
                check(g.phase==='fail'&&!g.loot.length&&g.value===0,'deep failure retained rewards');
              }
              return [f.cfg.name,'vault/secret/switch/rays/attribution',f.cfg.hunt?'hunt':'',f.cfg.deep?'deep':''];
            }""")
            print("PASS",level['id'],details,flush=True)
    assert not errors,errors
    page.close()

def verify_claims(browser,url,static):
    context=browser.new_context()
    if static:
        def manifest(route):
            response=route.fetch()
            headers={k:v for k,v in response.headers.items() if k.lower()!='x-super-player-store'}
            route.fulfill(status=200,headers=headers,body=response.body())
        context.route("**/campaign/levels.json",manifest)
    pages=[context.new_page(),context.new_page()]
    for page in pages:
        page.goto(url)
        page.evaluate("async()=>{window.store=await (await import('./campaign/store.mjs')).campaignStore()}")
    first,second=pages
    level=LEVELS[0]['id']
    assert not first.evaluate("id=>store.discover(id)",level)['claimed']
    assert not second.evaluate("id=>store.discover(id)",level)['claimed']
    old=dict(id=str(uuid4()),level=level,won=False,kills=1,durationMs=500,endedAt=1000,loot=[])
    first.evaluate("b=>store.save(b)",old)
    assert not first.evaluate("id=>store.discover(id)",level)['claimed']
    awards=[dict(old,id=str(uuid4()),won=True,endedAt=2000+i,loot=[{"name":"秘藏·培养罐原始编号","value":475}]) for i in (0,1)]
    for page,battle in zip(pages,awards):
        page.evaluate("b=>{window.saving=store.save(b)}",battle)
    for page,battle in zip(pages,awards):
        page.evaluate("()=>window.saving")
        page.evaluate("b=>store.save(b)",battle)
    state=first.evaluate("()=>store.progress()")
    assert state['battleCount']==3 and state['discoveries']==[level],state
    assert state['loot'][0]['count']==1 and state['loot'][0]['value']==475
    assert first.evaluate("()=>store.gear()")['earned']==475
    assert first.evaluate("id=>store.discover(id)",level)['claimed']
    core = dict(old,id=str(uuid4()),won=True,loot=[{"name":"精英改装材料·穿透弹芯","value":520}])
    first.evaluate("b=>store.save(b)",core)
    gear = first.evaluate("()=>store.gear()")
    assert gear['state']['mods']['pierce'] and gear['earned']==995
    second.evaluate("b=>store.save(b)",core)
    assert second.evaluate("()=>store.gear()")==gear
    # 重新打开首页显示本存档已发现的秘闻，另一存档仍未发现。
    first.reload()
    first.get_by_role("button",name="战场图鉴").click()
    assert "罐底的手写编号" in first.locator("#panel-body").inner_text()
    first.evaluate("async()=>{(await import('./campaign/profiles.mjs')).createProfile()}")
    first.reload()
    new=first.evaluate("async()=> (await (await import('./campaign/store.mjs')).campaignStore()).progress()")
    assert new['discoveries']==[] and new['battleCount']==0
    context.close()
    print("PASS discovery, loss, two tabs, retry and isolated reward","IndexedDB" if static else "SQLite",flush=True)


if __name__=="__main__":
    with sync_playwright() as pw:
        b=pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER","chrome"))
        try:
            verify(b)
            with TemporaryDirectory() as tmp:
                server=subprocess.Popen([sys.executable,"-X","utf8","-u","server.py","--port","0","--db",str(Path(tmp)/"test.sqlite")],
                                        cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,encoding="utf8")
                try:
                    url=re.search(r"http://127\.0\.0\.1:\d+",server.stdout.readline()).group()
                    for static in (False,True): verify_claims(b,url,static)
                finally:
                    server.terminate();server.wait()
        finally: b.close()
