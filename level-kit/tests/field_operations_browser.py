"""检查全部战场支线落位及三类样板互动。冻结渲染帧，保留真实地图和碰撞。"""
import os
import re
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4
from campaign_browser import ROOT, LEVELS, expose_game, sync_playwright


def verify_restart_doors(page):
    page.evaluate("""() => {
      const g=run.game, m=g.beasts, f=g.field;
      for(const target of [f.secret.front,f.lever]) {
        Object.assign(g.player,{x:target.x,y:target.y,z:target.z});
        if(!f.interact(g))throw Error('上一局未能通过玩家交互开门');
      }
      const doors=[f.secret.door.box,f.vault.shortcut.box];
      if(doors.some(door=>door.active))throw Error('重开前应保留开门状态');
      const plan=m.planGroup, random=Math.random;
      let seed=7, checked=false;
      Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
      m.planGroup=function(...args) {
        if(!doors.every(door=>door.active))throw Error('无尽首波仍在使用上一局的开门状态');
        checked=true;
        return plan.apply(this,args);
      };
      try {g.reset();} finally {m.planGroup=plan;Math.random=random;}
      if(!checked || m.live!==run.config.beasts.population)throw Error('重开未部署完整无尽首波');
      for(const b of m.pool)if(b.active && doors.some(door=>
        b.x0<door.x1 && b.x1>door.x0 && b.z0<door.z1 && b.z1>door.z0 &&
        b.y0<door.y1-.025 && b.y1>door.y0+.025))throw Error('重开后新敌人与关闭门体重叠');
      g.phase='play';
    }""")


def verify(browser):
    page=browser.new_page(viewport={"width":960,"height":640})
    page.add_init_script("""window.requestAnimationFrame = () => 1;
        Element.prototype.requestPointerLock=()=>{throw Error('支线检查无需锁定鼠标')};""")
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
        if level['id']=='underground-lab':
            page.add_script_tag(content=(ROOT/'level-kit/tests/player_doors.js').read_text(encoding='utf-8'))
            doors=page.evaluate('() => verifyPlayerDoors()')
            print('PASS closed pursuit, player opening, traversable enemy routes and projectile rays',doors,flush=True)
        result=page.evaluate("""() => {
          const {game:g,nav}=run,f=g.field;
          document.querySelector('#mission-mode').value='endless';g.reset();g.phase='play';
          const p=g.player,door=g.level.entryDoor;
          if(door){
            if(!door.active)throw Error('出生时实验室气闸应关闭');
            const outside=door.z0-2;
            for(let i=0;i<180 && p.z>outside;i++){
              g.time+=.02;
              g.encounter.update(g,.02);
              g.level.move(p,0,-.09,run.config.player.step);
            }
            if(door.active || p.z>outside)throw Error('从出生点未能穿过自动气闸');
          }
          if(location.pathname.includes('/underground-lab/')){
            const spawn={x:p.x,y:p.y,z:p.z};
            clearLabArchive(g);Object.assign(p,spawn);g.encounter.update(g,1);
          }
          window.fieldAnchor={x:p.x,z:p.z};
          nav.rebuild(p.x,p.z);
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
        if level['id'] in ('rain-city','paris-tower'):
            verify_restart_doors(page)
            print("PASS closed vault and secret doors before endless restart",level['id'],flush=True)
        if level['id'] in ('underground-lab','buried-tomb','shanhai-secret-realm','sakura-night-town','jungle-temple','derelict-station'):
            events=page.evaluate("""stage=>{
              const {game:g,config}=run,m=g.beasts,e=g.encounter,p=g.player;
              // 在非主线模式保留已有普通群，让事件为同批成员和现有角色都预留空间。
              if(stage==='underground-lab'){
                g.reset();g.phase='play';
                const door=g.level.entryDoor;
                Object.assign(p,{x:0,y:0,z:door.z1+1});e.update(g,1);
                Object.assign(p,fieldAnchor);run.nav.rebuild(p.x,p.z);
              }
              const spawned=[],spawn=m.spawnGroup.bind(m);
              m.spawnGroup=(entries,opts)=>{
                const group=spawn(entries,opts);
                if(group.length)spawned.push(group);
                return group;
              };
              const move=(x,z)=>Object.assign(p,{x,y:g.level.base(x,z),z});
              const at=t=>{g.time=t;e.update(g,.02);};
              const assert=(v,s)=>{if(!v)throw Error(stage+' '+s);};
              const verify=(count,gap=config.beasts.safeSpawnGap)=>{
                const group=spawned.at(-1);
                assert(group?.length===count,'expected '+count+' bodies, got '+group?.length);
                for(const b of group){
                  assert(Math.hypot(b.x-p.x,b.z-p.z)-p.radius-b.radius>=gap,'spawn too close');
                  assert(!g.level.blocked(b.x,b.z,b.y,b.radius,b.height),'blocked');
                  assert(m.pool.every(a=>!a.active || a===b || a.y+a.height<=b.y || b.y+b.height<=a.y ||
                    Math.hypot(a.x-b.x,a.z-b.z)>=a.radius+b.radius),'overlap');
                }
                return group;
              };
              try{
                if(stage==='underground-lab'){
                  g.kills=config.alarm.streakKills;at(4);verify(18);
                }else if(stage==='buried-tomb'){
                  at(config.storm.interval);verify(18);
                }else if(stage==='shanhai-secret-realm'){
                  move(-11.3,23.8);at(1);
                  const guards=verify(4);
                  assert(guards.map(b=>b.type).join()==='1,2,1,2','grave composition');
                }else if(stage==='jungle-temple'){
                  move(-37,-11.7);at(e.nextRain);at(e.nextRain+2);
                  const hunters=verify(10,8);
                  assert(hunters.every(b=>e.ambushers.has(b)),'wetland group');
                }else if(stage==='sakura-night-town'){
                  move(24.8,31);at(e.next);
                  const parade=verify(16);
                  assert(parade.filter(b=>e.isLantern(b)).length===8,'lantern count');
                }else{
                  const boss=m.boss, n=config.beasts.types[3].summonCount;
                  assert(boss && e.stage(boss,n,g),'eggs not staged');
                  const eggs=e.eggs.filter(egg=>egg.active);
                  assert(eggs.length===n && eggs.every(egg=>egg.hatch===eggs[0].hatch),'egg count/deadline');
                  move(eggs[0].x,eggs[0].z);at(eggs[0].hatch-.01);
                  assert(!spawned.length,'early hatch');
                  at(eggs[0].hatch);verify(n);
                  assert(!e.eggs.some(egg=>egg.active),'unhatched eggs');
                }
                assert(spawned.length===1,'more than one batch');
                const group=spawned[0];
                m.damage(group[0],1e6,g,'weapon');at(g.time+.5);
                assert(spawned.length===1,'replenished after a kill');
                if(stage==='derelict-station'){
                  const nav=run.nav;
                  at(e.opens-1);nav.rebuild(p.x,p.z);
                  const closed=nav.walkable.slice(), box=e.panel.collider;
                  const ray={x:(box.x0+box.x1)/2-.75,y:(box.y0+box.y1)/2,z:(box.z0+box.z1)/2};
                  const visible=()=>g.level.visible(ray,{x:1,y:0,z:0},1.5);
                  assert(!visible(),'预警中的舷窗未挡住射线');
                  at(e.opens);nav.rebuild(p.x,p.z);
                  assert(visible() && nav.walkable.some((v,i)=>v&&!closed[i]),'舷窗破裂后弹道或寻路仍封闭');
                  at(e.seals);nav.rebuild(p.x,p.z);
                  assert(!visible() && nav.walkable.every((v,i)=>v===closed[i]),'舷窗密封后弹道或寻路仍开放');
                }
                return group.length;
              }finally{m.spawnGroup=spawn;}
            }""",level['id'])
            print("PASS complete map event",level['id'],events,flush=True)
        if level['id'] in ['underground-lab','rain-city','ember-fortress','buried-tomb','haunted-midway',
                           'shanhai-secret-realm','sakura-night-town']:
            details=page.evaluate("""() => {
              const {game:g,nav,config}=run,f=g.field;
              const check=(ok,msg)=>{if(!ok)throw Error(msg)};
              const move=p=>{Object.assign(g.player,{x:p.x,y:p.y,z:p.z});nav.rebuild(p.x,p.z);};
              const clear=()=>{for(const b of g.beasts.pool)b.active=false;g.beasts.live=0;g.beasts.boss=null;g.beasts.refreshHash();};
              const reset=mode=>{document.querySelector('#mission-mode').value=mode;g.reset();g.phase='play';g.time=20;};
              const beat=b=>{for(let i=0;b.active && i<9;i++)g.beasts.damage(b,1e7,g,'weapon');check(!b.active,'guard survived');};
              const tick=(s=.4)=>{g.time+=s;f.step(s,g);};
              const group=(members,n)=>{
                check(members.length===n,'incomplete group '+members.length+'/'+n);
                for(const [i,b] of members.entries()){
                  const gap=Math.hypot(b.x-g.player.x,b.z-g.player.z)-b.radius-g.player.radius;
                  check(gap>=config.beasts.safeSpawnGap && !g.level.blocked(b.x,b.z,b.y,b.radius,b.height),'unsafe guard '+i);
                  check(members.slice(0,i).every(a=>a.y+a.height<=b.y || b.y+b.height<=a.y ||
                    Math.hypot(a.x-b.x,a.z-b.z)>=a.radius+b.radius),'overlapping guards');
                }
              };
              const wave=(tag,n)=>{
                group(f.guards,n);
                beat(f.guards[0]); tick(.5);
                check(f.guards.filter(b=>b.active&&b.fieldGroup===tag).length===n-1,'guard replaced after one kill');
                for(let i=0;i<150;i++){
                for(const b of [...f.guards])if(b.active && b.fieldGroup===tag)beat(b);
                tick();
                if(!f.guards.some(b=>b.active&&b.fieldGroup===tag))break;
              }};
              if (run.config.beasts && g.beasts.boss) {
                const drops=g.pickups, boss=g.beasts.boss, poolSize=drops.objects.length;
                for(let i=0;i<poolSize+5;i++) drops.add('rare',1,1,0,'稀有掉落',200);
                for(let phase=0;boss.active && phase<3;phase++){g.time+=2;g.beasts.damage(boss,1e7,g,'weapon');}
                check(drops.keyItem?.active && drops.objects.length===poolSize,'full pool blocked core');
                for(let i=0;i<8;i++) drops.add('ammo',i,1,0,'固定弹箱',26,true);
                const rewards=['宝库甲','宝库乙','秘藏','传奇'].map(name=>drops.add('rare',1,1,0,name,200,true));
                check(rewards.every(item=>item?.active) && new Set([...rewards,drops.keyItem]).size===5,
                  'core displaced a protected reward');
                move(drops.keyItem);check(drops.takeKey(g.player,g),'full pool core unreachable');
                reset('endless');
              }
              clear();move(f.vault.front);check(f.hint(g).includes('可选'),'vault hint');
              const drops=g.pickups, front=f.vault.front;
              const carried=drops.add('rare',front.x,front.z,front.y,'已领取的随机稀有',73);
              drops.update(0,g.player,g);
              check(!carried.active && g.loot.some(i=>i.name==='已领取的随机稀有'),'rare not collected');
              const core=drops.add('core',g.level.spawn.x,g.level.spawn.z,g.level.spawn.y,'任务核心',1,true);
              const protectedItems=drops.objects.filter(i=>i.active && i.permanent).map(i=>[i,i.name]);
              const floorLoot=[];
              for(let i=0;i<drops.objects.length;i++){
                drops.age+=.1;
                const item=drops.add('rare',g.level.spawn.x,g.level.spawn.z,g.level.spawn.y,'未领取稀有'+i,80);
                if(!item)break;
                floorLoot.push(item);
              }
              check(floorLoot.length>150 && !drops.add('rare',0,0,0,'已满',80),'普通拾取池未满');
              check(f.interact(g),'start vault');tick(2);wave('vault',f.cfg.guards);
              tick(3);wave('vault',f.cfg.reinforcements);
              check(f.vaultStage==='clear','vault unfinished');
              const vaultAmmo=g.pickups.objects.filter(i=>i.active && i.permanent && i.name==='宝库入口弹药');
              check(vaultAmmo.length===2 && vaultAmmo.reduce((n,i)=>n+i.value,0)===
                g.pickups.cacheAmount(f.cfg.guards*run.config.pickups.roundsPerGuard)+
                g.pickups.cacheAmount(f.cfg.reinforcements*run.config.pickups.roundsPerGuard),'vault entry supplies');
              check(vaultAmmo.includes(floorLoot[0]) && vaultAmmo.includes(floorLoot[1]) &&
                protectedItems.every(([i,name])=>i.active && i.name===name) && core===drops.keyItem &&
                g.loot.some(i=>i.name==='已领取的随机稀有'),'回收顺序或保护对象有误');
              const issued=vaultAmmo.reduce((n,i)=>n+i.value,0);
              g.weapon.reserve=0;move(front);drops.update(0,g.player,g);
              check(g.weapon.reserve===issued && vaultAmmo.every(i=>!i.active),'满池开宝库后的两批弹药无法领取');
              const reward=g.pickups.objects.find(x=>x.active&&x.origin==='vault');
              check(reward?.value===f.cfg.value,'missing vault reward');move(reward);g.pickups.collect(reward,g.player,g);
              move(f.lever);check(f.vault.shortcut.box.active!==false && f.interact(g),'switch blocked');
              check(f.vault.shortcut.box.active===false && !f.vault.shortcut.mesh.visible,'open mismatch');
              check(!f.interact(g),'one-shot mechanism reused');
              nav.rebuild(fieldAnchor.x,fieldAnchor.z);
              check(nav.dist[nav.index(f.vault.center.x,f.vault.center.z)]>=0,'vault disconnected');
              if(location.pathname.includes('/underground-lab/'))clearLabArchive(g);
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
                group([prey,...f.escorts],3);
                move(prey);prey.hp--; for(let i=0;i<90;i++){g.time+=.05;f.huntStep(prey,g,.05);}
                check(Math.hypot(old.x-prey.x,old.z-prey.z)>.3,'prey stuck');
                move({x:prey.x+30,y:prey.y,z:prey.z});f.huntStep(prey,g,.025);
                check(!f.guide(g).target,'hunter reveals exact location');
                beat(prey);check(g.ready()&&g.loot.some(i=>i.origin==='hunt'),'hunt failed');
                move(g.level.gate);g.trigger();check(g.blast>0,'hunt cannot evacuate');
                reset('hunt');g.time=f.huntLimit;f.step(0,g);check(g.phase==='fail','hunt time limit');
              }
              if(f.cfg.deep){
                const unlock=()=>{reset('classic');clear();g.story.blocksExit=false;g.kills=0;g.core=g.bossDead=true;move(g.level.gate);};
                unlock();
                check(g.ready()&&f.deepRoom.door.box.active,'base gate or deep lock');f.deepen(g);check(!f.deep,'missing confirmation');f.deepen(g);
                check(f.deep==='guards'&&!g.ready()&&f.interact(g),'base gate still open');
                const deepBoxes=g.pickups.objects.filter(i=>i.active && i.kind==='ammo');
                check(deepBoxes.length===1 && deepBoxes[0].name==='深入配给' && deepBoxes[0].permanent &&
                  deepBoxes[0].value===g.pickups.cacheAmount(f.cfg.deepGuards*run.config.pickups.roundsPerGuard),'deep entry supplies');
                nav.rebuild(g.player.x,g.player.z);
                const gateRoute=nav.dist[nav.index(f.deepRoom.center.x,f.deepRoom.center.z)];
                if(gateRoute<0)nav.rebuild(g.level.spawn.x,g.level.spawn.z);
                check(!f.deepRoom.door.box.active && nav.dist[nav.index(f.deepRoom.center.x,f.deepRoom.center.z)]>=0,
                  'deep entry disconnected '+JSON.stringify({gate:g.level.gate,front:f.deepRoom.front,spawn:g.level.spawn}));
                g.objective.step(300,g);check(g.phase==='play','deep has hard deadline');
                check(!g.pickups.add('ammo',g.player.x,g.player.z,g.player.y,'通常掉落',22),'deep sources leaked');
                wave('deep',f.cfg.deepGuards);check(f.deep==='reward'&&f.legend?.active,'missing legendary');
                move(f.legend);g.pickups.collect(f.legend,g.player,g);
                // 拾取和下一帧之间死亡掉落可重新使用刚释放的槽。
                const reused=g.pickups.add('rare',g.player.x,g.player.z,g.player.y,'新掉落',20,true);
                check(reused===f.legend,'legend slot was not reused');tick();check(f.deep==='exit','legendary collection lost');
                move(f.deepExit);check(f.interact(g)&&g.phase==='win'&&f.deepFinished,'deep extraction');
                unlock();f.deepen(g);f.deepen(g);g.finish(false);
                check(g.phase==='fail'&&!g.loot.length&&g.value===0,'deep failure retained rewards');
              }
              return [f.cfg.name,'vault/secret/switch/rays/attribution',f.cfg.hunt?'hunt':'',f.cfg.deep?'deep':''];
            }""")
            print("PASS",level['id'],details,flush=True)
        # 在实际地图初始敌群仍占位时，从宝库门口同时投入两波守卫。
        counts=page.evaluate("""()=>{
          const {game:g}=run,m=g.beasts,f=g.field;
          document.querySelector('#mission-mode').value='endless';g.reset();g.phase='play';
          const {x,y,z}=f.vault.front;Object.assign(g.player,{x,y,z});
          if(!f.interact(g))throw Error('未触发宝库');
          const counts=[];
          for(const size of [f.cfg.guards,f.cfg.reinforcements]){
            g.time+=3;f.step(3,g);
            const guards=m.pool.filter(b=>b.active&&b.fieldGroup==='vault');
            if(guards.length!==size)throw Error('未完整投放宝库守卫 '+guards.length+'/'+size);
            counts.push(guards.length);
            for(const b of guards) m.damage(b,1e7,g,'weapon');
            f.step(0,g);
          }
          if(f.vaultStage!=='clear')throw Error('宝库未正常解锁');
          return counts;
        }""")
        print("PASS populated vault",level['id'],counts,flush=True)
        if level['id']=='ember-fortress':
            routes=page.evaluate("""() => {
              const {game:g,config}=run, p=g.player;
              document.getElementById('mission-mode').value='classic';g.reset();g.phase='play';
              function traverse(time,x,z) {
                Object.assign(p,{x:-4,y:0,z:30,lastHurt:-Infinity});
                g.time=time;g.encounter.update(g);
                const target={x,y:0,z}, task=g.story.navigation({target},{player:p,time,beasts:{pool:[]}});
                if(!task.path?.length)throw Error('没有通往目标的路线');
                for(const turn of task.path) {
                  const dx=turn.x-p.x,dz=turn.z-p.z,steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.08));
                  for(let i=0;i<steps;i++) {
                    g.level.move(p,dx/steps,dz/steps,config.player.step);
                    p.y=g.level.foot(p.x,p.z,p.y+config.player.step,p.radius);
                  }
                  if(Math.hypot(p.x-turn.x,p.z-turn.z)>.01)throw Error('推荐路线被真实移动规则拦下');
                }
                if(Math.hypot(p.x-x,p.z-z)>.01)throw Error('未到达标记');
                return task.path.length;
              }
              return [traverse(20,-4,20),traverse(130,-4,20),traverse(130,17,10),traverse(170,-4,20)];
            }""")
            assert routes[0]==routes[3]==1 and min(routes[1:3])>1,routes
            print("PASS 低潮、涨潮绕行及退潮后的实际移动",routes,flush=True)
    assert not errors,errors
    page.close()

def verify_kill_loot(page,url):
    page.route("**/underground-lab/",expose_game)
    page.add_init_script("""window.requestAnimationFrame=()=>1;
        Element.prototype.requestPointerLock=()=>{throw Error('掉落存档测试无需锁定鼠标')};""")
    page.goto(url+"/underground-lab/")
    page.wait_for_function("!!window.run",polling=100)
    page.evaluate("async()=>{window.store=await (await import('../campaign/store.mjs')).campaignStore()}")
    for battle_number,(won,picked) in enumerate([(True,'精英徽记'),(False,'精英改装材料·穿透弹芯'),
                                                 (True,'精英改装材料·穿透弹芯')],1):
        page.evaluate("""([won,picked])=>{
          const {game:g}=run, m=g.beasts, pickups=g.pickups, p=g.player;
          g.reset();g.phase='play';g.variation=null;
          // 两只精英分别产出徽记与材料，只走近其中之一。重复伤害、重复拿取都不应重复入账。
          const afterKill=(x,roll)=>{
            const b=m.spawn(0,x,0,30);b.affixes=['swift'];
            const random=Math.random;
            try {
              Math.random=()=>roll;
              if(!m.damage(b,1e8,g,'environment') || m.damage(b,1e8,g,'environment'))
                throw Error('同次死亡重复结算');
            } finally {Math.random=random;}
          };
          afterKill(-8,.005);afterKill(8,.04);
          const drops=pickups.objects.filter(i=>i.active && i.origin==='drop');
          const take=drops.find(i=>i.name===picked);
          if(drops.length!==2 || !take || g.loot.length)throw Error('未拾取的击杀掉落已入账');
          Object.assign(p,{x:take.x,y:take.y,z:take.z});
          let grants=0;
          const supply=g.kit.supply;
          g.kit.supply=function(...args){grants++;return supply.apply(this,args)};
          try {pickups.update(.05,p,g);} finally {g.kit.supply=supply;}
          if(grants || take.active || pickups.collect(take,p,g) || g.loot.length!==1 ||
             g.loot[0].name!==picked || !drops.some(i=>i.active))throw Error('拾取重复或附送补给');
          g.finish(won,'掉落验收');
        }""",[won,picked])
        page.wait_for_function("document.querySelector('#menu-status').textContent.startsWith('对战已保存')",polling=100)
        progress=page.evaluate("()=>store.progress()")
        assert progress['battleCount']==battle_number,progress
        gear=page.evaluate("()=>store.gear()")
        expected={'精英徽记':1}
        if battle_number==3: expected['精英改装材料·穿透弹芯']=1
        assert {i['name']:i['count'] for i in progress['loot']}==expected,progress
        assert bool(gear['state'].get('mods',{}).get('pierce'))==(battle_number==3),gear


def verify_delayed_secret(page,url):
    # 让真实 SQLite 先登记秘藏，再把查询响应留到深入或重开之后送达。
    for level in LEVELS[1:4]:
        loot=[{'name':'秘藏·测试藏品','value':400}] if level['id']=='buried-tomb' else []
        battle=dict(id=str(uuid4()),level=level['id'],won=True,kills=1,durationMs=1000,endedAt=1001,loot=loot)
        page.evaluate("b=>store.save(b)",battle)
    page.route("**/buried-tomb/",expose_game)
    page.add_init_script("""const readJson=Response.prototype.json;
      window.discoveriesRead=0;
      Response.prototype.json=async function(){
        const data=await readJson.call(this);
        if(this.url.endsWith('/api/discovery')){
          window.alreadyClaimed=data.claimed;
          await new Promise(resolve=>window.releaseDiscovery=resolve);
          window.releaseDiscovery=null;
          setTimeout(()=>window.discoveriesRead++,0);
        }
        return data;
      };""")
    page.goto(url+"/buried-tomb/")
    page.wait_for_function("!!window.run",polling=100)
    for number,when in enumerate(['ordinary','inside','enter','restart'],1):
        page.evaluate("""()=>{
          const {game:g}=run,f=g.field;
          window.resetRoom=()=>{g.reset();g.phase='play';g.story.blocksExit=false;g.core=g.bossDead=true;};
          window.enterDeep=()=>{
            const {x,y,z}=g.level.gate;Object.assign(g.player,{x,y,z});f.deepen(g);f.deepen(g);
            if(!g.pickups.deepSupplies)throw Error('未进入深入阶段');
          };
          resetRoom();
        }""")
        if when=='inside': page.evaluate("enterDeep()")
        page.evaluate("""()=>{
          const {game:g}=run,f=g.field;Object.assign(g.player,f.secret.front);
          if(!f.interact(g)||!f.secretOpen)throw Error('未打开密室');
        }""")
        page.wait_for_function("typeof window.releaseDiscovery==='function'",polling=100)
        assert page.evaluate("window.alreadyClaimed")
        if when=='enter': page.evaluate("enterDeep()")
        if when=='restart': page.evaluate("resetRoom()")
        page.evaluate("releaseDiscovery()")
        # JSON 返回后的下一轮事件循环，正式 discover/award 已处理完毕。
        page.wait_for_function("n=>discoveriesRead===n",arg=number,polling=100)
        actual=page.evaluate("run.game.pickups.objects.filter(i=>i.active && i.name==='密室补给').map(i=>[i.value,i.permanent])")
        expected=page.evaluate("[[run.game.pickups.cacheAmount(24),true]]") if when=='ordinary' else []
        assert actual==expected,(when,actual,expected)
    print('PASS previously claimed secret, response after deep entry and restart',flush=True)


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
    verify_kill_loot(first,url)
    if not static: verify_delayed_secret(first,url)
    context.close()
    print("PASS discovery, duplicate death/pickup, collected-only extraction, loss, two tabs and retry",
          "IndexedDB" if static else "SQLite",flush=True)


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
