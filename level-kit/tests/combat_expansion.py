"""在独立关卡的正式运行时验证掉落、职能、词缀、首领输出窗口及连杀归因。"""
import json
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright
from campaign_browser import ROOT


def level_page(browser, stage, variation=None, quality=None):
    page = browser.new_page(viewport={"width": 960, "height": 620})
    page.add_init_script("window.requestAnimationFrame=()=>1")
    if quality:
        value=json.dumps(json.dumps({"quality":quality}))
        page.add_init_script(f"localStorage.setItem('super-player:preferences:v1',{value})")
    if variation:
        levels = json.loads((ROOT/"campaign"/"levels.json").read_text(encoding="utf-8"))
        number = next(index for index, level in enumerate(levels, 1) if level["id"] == stage)
        page.add_init_script(f"localStorage.setItem('super-player:variation:{number}',JSON.stringify({{pending:'{variation}'}}));")
    def expose(route):
        source = (ROOT/stage/"index.html").read_text(encoding="utf-8")
        source = source.replace("    startLevel(definition, campaign, campaignStage);",
                                "    window.run=startLevel(definition,campaign,campaignStage);")
        source = source.replace("return { game, scene, camera, renderer, config:", "return { game, scene, camera, renderer, composer, environment, config:")
        route.fulfill(body=source, content_type="text/html")
    page.route(re.compile(r"/index\.html$"), expose)
    page.goto((ROOT/stage/"index.html").as_uri())
    page.wait_for_function("!!window.run", polling=100)
    return page


def pickup_views(page, stage, out=None):
    for angle in ('front','side','low'):
        page.evaluate("""angle=>{
          const {game:g,camera,composer,scene}=run, p=g.level.spawn;
          g.phase='pause';g.pickups.objects.forEach(i=>i.active=false);
          const sideways=angle==='side', dx=sideways?0:.5, dz=sideways?.5:0;
          g.pickups.add('health',p.x-dx,p.z-dz,p.y,'生命',15,true);
          g.pickups.add('ammo',p.x+dx,p.z+dz,p.y,'弹药',21,true);
          camera.position.set(p.x+(sideways?2.0:0),p.y+(angle==='low'?.19:1.1),p.z+(sideways?0:2.1));
          camera.lookAt(p.x,p.y+.42,p.z);camera.updateMatrixWorld();
          g.pickups.render(2.2);
          const bodies=scene.children.filter(n=>n.isInstancedMesh && n.count===1 && n.geometry.getAttribute('color') && n.material.vertexColors && n.material.isMeshBasicMaterial);
          if(bodies.length<2)throw Error('相邻两类掉落未按实际角度渲染');
          for(const n of scene.children){
            if(n.isSprite || n.isInstancedMesh && n.geometry.type==='PlaneGeometry' && n.material.map) n.visible=false;
          }
          document.querySelectorAll('body > :not(canvas):not(script):not(style)').forEach(n=>n.style.display='none');
          composer.render(0);
        }""",angle)
        if out:
            page.screenshot(path=str(Path(out)/(stage+'-'+angle+'.png')),clip={"x":230,"y":186,"width":500,"height":242})


def boss_measure(page, burst):
    return page.evaluate("""burst=>{
      const g=run.game, config=run.config, m=g.beasts, p=g.player;
      document.querySelector('#mission-mode').value='endless';g.reset();g.phase='play';
      for (const e of m.pool)e.active=false;
      m.live=0;m.boss=null;
      const center=g.level.bossSpawn;
      const b=m.spawn(3,center.x,center.z,center.y), hp=b.hp;
      Object.assign(p,{x:center.x,y:center.y,z:center.z+12,escaped:true});
      const seen=new Set(), windows=new Set(), armorHits=[];
      let rounds=0,next=0,weakTime=0;
      // 保留正式首领的生命、护甲、破甲、攻击和转阶段逻辑。固定同一机位与弹匣节奏比较输出。
      for(let i=0;i<6000&&b.active;i++){
        g.time=i*.04;
        p.x=b.x;p.z=b.z+12;p.y=b.y;
        p.hp=100;p.lastHurt=g.time;
        b.playerVisible=true;
        m.ai.update(b,p,g,.04,i);
        seen.add(b.fight.stage);
        if(b.fight.weakUntil>g.time || b.fight.brokenUntil>g.time)weakTime+=.04;
        if(g.time>=next){
          rounds++;const h={headshot:b.fight.weakUntil>g.time};
          const old=b.hp; m.damage(b,config.weapon.damage*(burst?1.35:1),g,'weapon',h);
          if(h.weak)windows.add(b.fight.stage);
          if(b.fight.transitionUntil>g.time)armorHits.push(old-b.hp);
          next+=.1;
          if(rounds%config.weapon.magazine===0) next+=config.weapon.reloadTime;
        }
      }
      if(b.active || seen.size!==3 || !b.fight.breaks || !windows.size || !armorHits.includes(0))throw Error('首领未完整经过阶段、转场保护与易伤');
      return {seconds:g.time,weakSeconds:+weakTime.toFixed(1),breaks:b.fight.breaks,hp,rounds};
    }""", burst)


def verify_simulation_cadence(page):
    def measure(enabled):
        return page.evaluate("""enabled=>{
          const {game:g,config}=run, m=g.beasts, p=g.player, combat=g.weapon.combat;
          let seed=8347;
          const random=Math.random;
          Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
          try {
            document.querySelector('#mission-mode').value='endless';
            g.reset();g.phase='play';g.variation=null;
            for(const b of m.pool)b.active=false;
            m.live=0;m.boss=null;m.spawnTime=Infinity;
            Object.assign(p,{x:-22,y:40,z:0});
            const rules=config.beasts.simulation;rules.farCadence=enabled;rules.profile=true;
            m.resetSimulationStats();
            const spawn=(type,x,z)=>m.spawn(type,x,z,40,0);
            const idle=spawn(0,22,0), afflicted=spawn(0,22,5), hazard=spawn(0,22,9);
            idle.waveMember = afflicted.waveMember = hazard.waveMember = true;
            const hp=afflicted.hp;
            afflicted.statusEffects.set('burn',{until:1,tickAt:.5});
            afflicted.statusEffects.set('poison',{until:1,tickAt:.5,stacks:2});
            afflicted.statusEffects.set('scald',{until:1,tickAt:.5});
            for(let frame=1;frame<=72;frame++){
              g.time=frame/60;
              // 同一帧先由武器入口结清三个到期效果，再推进凶兽步。
              if(frame===30)combat.hit(afflicted,{damage:1},g);
              if(frame===40)m.damage(hazard,hazard.hp+1,g,'environment');
              m.update(1/60,p,g);
            }
            const actual=hp-afflicted.hp, expected=combat.baseDamage*(.08+.16+.12);
            if(Math.abs(actual-expected)>1e-6 || ['burn','poison','scald'].some(k=>afflicted.statusEffects.has(k)))
              throw Error('跨步持续伤害累计错误 '+actual);
            const counts={...m.simulationStats};
            if(enabled!==Boolean(counts.deferred))throw Error('远距分频样本未覆盖实际跳频');
            const state=[g.kills,g.performance.environmentKills,g.performance.weaponKills,m.live,
              idle.x,idle.y,idle.z,afflicted.hp,afflicted.x,afflicted.z];
            const report=g.performance.result(g,false), ready=g.ready();
            // 在同一个实际对象池填满、击退并复用，取装包中原有的容量。
            while(m.live<m.pool.length){
              if(!spawn(0,20,5))throw Error('未满时无法生成');
            }
            if(spawn(0,20,5)!==null)throw Error('池满后数量溢出');
            const generation=idle.spawnGeneration;
            if(!m.eject(idle,g))throw Error('环境移除失败');
            const next=spawn(0,20,5);
            if(next!==idle || next.spawnGeneration===generation || next.idlePerception ||
               next.wakeUntil!==-Infinity || next.statusEffects.size)throw Error('池复用遗留模拟状态');
            g.reset();g.phase='play';const opening=m.live;
            // 本波击退一只不会补位；最后一只普通成员离场后应一次开启完整下一波。
            Object.assign(p,{x:0,y:0,z:28,escaped:true});m.nav.rebuild(p.x,p.z);p.positionCamera(0);
            const victim=m.pool.find(b=>b.active && b.type!==3);
            if(!victim || !m.eject(victim,g))throw Error('重开后无尽开场失败');
            const after=m.live;
            for(let i=0;i<12;i++){g.time+=.04;m.update(.04,p,g);g.objective.step(.04,g);}
            if(m.live!==after || g.objective.wave!==1)throw Error('无尽击退一只后提前补位');
            for(const b of m.pool)if(b.active && b.type!==3)m.eject(b,g);
            for(let i=0;i<120 && g.objective.wave===1;i++){g.time+=.04;m.update(.04,p,g);g.objective.step(.04,g);}
            if(g.objective.wave!==2 || m.live<opening)throw Error('清空首波后未开启完整下一波');
            return {state,report,ready,opening,refilled:m.live,perceptions:counts.perceptions,deferred:counts.deferred};
          } finally {
            Math.random=random;config.beasts.simulation.farCadence=true;config.beasts.simulation.profile=false;
          }
        }""",enabled)
    original, reduced = measure(False), measure(True)
    assert original["state"] == reduced["state"] and original["state"][:4] == [1,1,0,2], (original,reduced)
    assert original["report"] == reduced["report"] and original["ready"] == reduced["ready"], (original,reduced)
    assert original["opening"] == reduced["opening"] and original["refilled"] == reduced["refilled"], (original,reduced)
    assert reduced["perceptions"] < original["perceptions"], (original,reduced)
    print("PASS far simulation A/B, damage ticks, environment kill, exhausted pool and endless refill",reduced,flush=True)
    return reduced


def verify_boss_feedback(page):
    page.evaluate("""() => {
      const {game:g,camera}=run, w=g.weapon;
      document.querySelector('#mission-mode').value='endless';g.reset();g.phase='play';
      const b=g.beasts.boss, f=b.fight;
      w.origin.set(b.x,b.y+1,b.z+5);
      w.end.set(b.x,b.y+b.height*.86,b.z);w.dir.set(0,0,-1);
      if(w.hitTarget(b,g)!==1 || f.charge)throw Error('装甲命中误报弱点');
      const m=g.beasts,mark=m.contactMark;
      camera.position.set(b.x,b.y+1,b.z+7);camera.lookAt(b.x,b.y+1,b.z);camera.updateMatrixWorld(true);
      m.render(0,g.time);
      const index=m.bodyBatch(3,b.nearLOD,b.farLOD), flash=m.modelBatches[index][0].geometry.attributes.beastFlash;
      if(!mark.visible || mark.count!==1 || mark.material.color.getHex()!==0xb78c66 || flash.getX(0)!==0)
        throw Error('有效命中缺少局部反馈或整个首领闪白');
      const first=Array.from(mark.instanceMatrix.array.slice(12,15));
      w.end.x+=.19;
      w.hitTarget(b,g);m.render(0,g.time);
      if(first.some((v,i)=>v!==mark.instanceMatrix.array[12+i]))throw Error('同次多弹丸叠加命中标记');
      w.end.x-=.19;
      g.time+=.1;m.render(0,g.time);
      if(mark.visible)throw Error('局部标记未在下一次步枪射击前消退');
      f.transitionUntil=g.time+.4;
      const protectedHP=b.hp;
      w.hitTarget(b,g);m.render(0,g.time);
      if(b.hp!==protectedHP || !mark.visible || mark.material.color.getHex()!==0x80878b)
        throw Error('免伤反馈与实际扣血不一致');
      g.time=f.transitionUntil;
      f.weakUntil=g.time+3;
      if(w.hitTarget(b,g)!==2 || f.charge!==1)throw Error('发光核心未计入破甲');
      const device=g.field.device;
      Object.assign(g.player,device);
      Object.assign(b,{x:device.x+7.5,z:device.z,y:device.y});
      g.field.interact(g);
      if(g.field.deviceAt || f.breaks)throw Error('范围外消耗破甲脉冲');
      Object.assign(b,{x:device.x-1,z:device.z});
      for(let i=0;i<f.rules.breakHits && !f.breaks;i++)g.beasts.damage(b,1,g,'weapon',{headshot:true});
      if(f.breaks!==1 || !g.field.hint(g).includes('已破甲'))throw Error('枪械破甲后仍提示释放脉冲');
      if(!g.field.interact(g) || g.field.deviceAt || f.breaks!==1)throw Error('已破甲时消耗脉冲');
      g.beasts.damage(b,1e6,g,'weapon');
      if(f.transitionUntil<=g.time || !g.field.hint(g).includes('正在转阶段'))throw Error('转阶段仍提示释放脉冲');
      if(!g.field.interact(g) || g.field.deviceAt || f.breaks!==1)throw Error('转阶段时消耗脉冲');
      g.time=f.transitionUntil;
      if(!g.field.hint(g).includes('释放脉冲') || !g.field.interact(g) || f.breaks!==2 || g.field.deviceAt<=g.time)
        throw Error('范围内脉冲未破甲');
      g.reset();
      if(g.field.deviceAt || g.beasts.boss.fight.breaks)throw Error('重开留下脉冲冷却或破甲状态');
    }""")


def verify_roles(page):
    page.evaluate("""()=>{
      const g=run.game,m=g.beasts,p=g.player;
      document.querySelector('#mission-mode').value='endless';g.reset();g.phase='play';g.time=15;
      for(const b of m.pool)b.active=false;
      m.live=0;m.boss=null;m.hash.clear();
      Object.assign(p,{x:8,y:25,z:0,escaped:true,hurtDelay:0});
      const spawn=(type,x,z)=>m.spawn(type,x,z,25);
      const shield=spawn(1,0,0), ordinary=spawn(0,1,0), brood=spawn(2,4,0);
      shield.role='shield';shield.shield=105;brood.role='brood';brood.playerVisible=true;brood.traitAt=g.time;
      m.refreshHash();
      const hp=ordinary.hp;m.damage(ordinary,12,g,'weapon');
      if(ordinary.hp!==hp || shield.shield!==93)throw Error('邻近普通体应消耗护盾');
      m.damage(shield,1000,g,'weapon',{headshot:true});
      m.damage(ordinary,12,g,'weapon');if(ordinary.hp>=hp)throw Error('核心击破后仍免伤');
      m.traits.step(brood,g,.02);if(!brood.charging)throw Error('孵化前摇');
      m.damage(brood,2,g,'weapon');if(brood.charging)throw Error('孵化无法打断');
      g.time=brood.traitAt+.1;m.traits.step(brood,g,.01);g.time=brood.traitAt+.1;
      m.traits.step(brood,g,.01);if(brood.broods!==1)throw Error('孵化或治疗上限');
      const boom=spawn(0,p.x-2,0);boom.role='volatile';boom.playerVisible=true;
      m.refreshHash();m.traits.step(boom,g,.02);if(!boom.charging)throw Error('自爆预警');
      const before=p.hp;m.damage(boom,900,g,'weapon');
      if(p.hp!==before)throw Error('引爆前击倒仍伤及玩家');
      const next=spawn(0,p.x-2,0); next.role='volatile';next.playerVisible=true;m.refreshHash();
      const neighbor=spawn(0,next.x,.75);neighbor.hp=1;m.refreshHash();
      m.traits.step(next,g,.02);g.time=next.traitAt+.05;m.traits.step(next,g,.02);
      if(next.active || p.hp>=before)throw Error('延时引爆未伤及近处玩家');
      const debris=m.corpses.find(c=>c.x===neighbor.x && c.z===neighbor.z && c.until>g.time);
      if(neighbor.active || !debris || debris.lift<=0 || debris.slideZ<=0)throw Error('爆炸残影未沿爆心方向击飞');
      const elite=spawn(1,-5,0);elite.affixes=['split','armor'];const old=elite.hp;
      p.z=3;p.x=-5;elite.fx=0;elite.fz=1;m.damage(elite,10,g,'weapon');
      if(Math.abs(old-elite.hp-4.6)>.01)throw Error('精英正面装甲');
      m.damage(elite,1e5,g,'equipment');if(!m.traits.splits.length || !g.performance.eliteKills)throw Error('精英死亡归类或分裂');
      for(const e of m.pool)e.active=false;
      m.live=0;m.hash.clear();
      g.performance.reset();
      for(let i=0;i<10;i++){g.time+=.1;const b=spawn(0,2,1);m.damage(b,1e5,g,i<5?'weapon':i===5?'equipment':'environment',{headshot:i===4});}
      const s=g.performance;
      if(s.maxCombo!==10||s.weaponKills!==5||s.equipmentKills!==1||s.environmentKills!==4||!s.notice.includes('10 连杀'))throw Error('连杀或归因');
      if(m.damage(m.pool[0],1e5,g) || s.maxCombo!==10)throw Error('重复死亡计数');
      s.hurt(7);if(s.combo||s.hurtCount!==1)throw Error('受伤应中断连杀');
      for(const [rank,kind] of ['hit','weak','kill','critical-kill'].entries()){
        g.weapon.impact(rank+1,g);if(g.ui.nodes.cross.dataset.hit!==kind)throw Error('进攻标记 '+kind);
      }
    }""")


def verify_event_loot(page,stage):
    result=page.evaluate("""stage=>{
      const {game:g,config}=run, m=g.beasts, e=g.encounter;
      document.querySelector('#mission-mode').value='endless';g.reset();g.phase='play';
      const kills=[];
      function kill(b,elite,roll,expected){
        b.affixes=elite?['swift']:null;
        const random=Math.random;
        try {
          Math.random=()=>roll;
          if(!m.damage(b,1e7,g,'environment') || m.damage(b,1e7,g,'environment'))
            throw Error('同次死亡多次结算');
          const drops=g.pickups.objects.filter(i=>i.active && !i.permanent);
          if(drops.length!==(expected?1:0) || expected && drops[0].name!==expected)
            throw Error('击杀掉落 '+[roll,expected,drops.map(i=>i.name)]);
          if(drops[0])drops[0].active=false;
          kills.push(expected || '无');
        } finally {Math.random=random;}
      }
      const spawn=()=>m.spawn(0,0,0,30);
      kill(spawn(),false,0,null);  // 平时普通怪及子体无随机物资。
      const lantern=stage==='sakura-night-town';
      g.time=lantern?e.next:120;e.update(g,0);
      const eventMember=()=>lantern?e.script.keys().next().value:spawn();
      if(lantern)kill(spawn(),false,0,null);  // 游行期间也只有灯笼妖进入活动池。
      const {eliteBadge,eliteMaterial,eventHealing}=config.pickups.killDrops;
      const rare=eliteMaterial+eliteBadge;
      kill(eventMember(),true,eliteMaterial*.5,'精英改装材料·穿透弹芯');
      kill(eventMember(),true,eliteMaterial+eliteBadge*.5,'精英徽记');
      kill(eventMember(),true,rare+eventHealing*.5,'圣露');
      kill(eventMember(),true,rare+eventHealing+.01,null);
      kill(eventMember(),false,eventHealing*.5,'圣露');
      kill(eventMember(),false,eventHealing+.01,null);
      g.time+=30;e.update(g,0);
      kill(spawn(),false,0,null);
      return kills;
    }""",stage)
    print("PASS optional event drops, single death and mutually exclusive elite rewards",stage,result,flush=True)


def verify_lift(page):
    page.evaluate("""()=>{
      const g=run.game,p=g.player,l=g.lifts.lifts[0];
      document.querySelector('#mission-mode').value='rescue';g.reset();g.phase='play';
      Object.assign(p,{x:l.x,y:l.low,z:l.z,vy:0,escaped:true});g.lifts.interact(g);
      for(let i=0;i<270;i++)g.lifts.step(.02,g);
      if(l.y!==l.high || Math.abs(p.y-l.high)>.02)throw Error('观景台升降行程 '+[l.y,p.y]);
      g.lifts.interact(g);
      for(let i=0;i<270;i++)g.lifts.step(.02,g);
      if(l.y!==l.low || Math.abs(p.y-l.low)>.02)throw Error('升降台返回广场');
      p.hp=100;p.hurtDelay=0;p.fallPeak=9;p.vy=0;
      const input={held:()=>false,jump:false};
      p.update(.02,input,g);
      if(p.hp>=100)throw Error('高处落地未产生坠落伤害');
    }""")


def verify_endless_deployment(page):
    result=page.evaluate("""()=>{
      const {game:g,config}=run, m=g.beasts, base=config.beasts.population;
      document.querySelector('#mission-mode').value='endless';
      const wave=()=>m.pool.filter(b=>b.active && b.waveMember);
      const spawn=m.spawnGroup;
      for(const blockBoss of [true,false]){
        m.spawnGroup=function(entries,options){
          return (entries[0]?.type===3)===blockBoss ? [] : spawn.call(this,entries,options);
        };
        try { g.reset(); } finally { delete m.spawnGroup; }
        g.phase='play';
        if(Boolean(m.boss)===blockBoss || wave().length!==(blockBoss ? base-1 : 0))
          throw Error('首领与普通波的失败互相阻塞');
        g.time+=.6;m.deployPopulation(g);
        if(!m.boss?.active || wave().length!==base-1 || m.live!==base)throw Error('独立重试没有完成');
      }
      const boss=m.boss;
      for(let stage=0;stage<3;stage++){g.time+=2;m.damage(boss,1e7,g,'environment');}
      g.step(.04);
      if(!g.bossDead || m.boss || m.live!==base-1 || g.objective.wave!==1)
        throw Error('提前击倒首领后出现补位或提前换波');

      const boxes=[...g.pickups.ammoStations],box=boxes[0],full=box.value;
      const visit=()=>{Object.assign(g.player,{x:box.x,y:box.y,z:box.z});g.pickups.update(.04,g.player,g);};
      g.weapon.reserve=config.weapon.maxReserve-3;
      visit();
      if(!box.active||box.value!==full-3||g.weapon.reserve!==config.weapon.maxReserve)throw Error('弹箱未保留剩余弹药');
      g.weapon.reserve=0; visit();
      if(box.active||g.weapon.reserve!==full-3)throw Error('未实际领取固定弹箱');
      Object.assign(g.player,{x:g.level.spawn.x,y:g.level.spawn.y,z:g.level.spawn.z});
      for(let i=0;i<g.pickups.objects.length;i++)g.pickups.add('rare',2,2,0,'未领取的战利品',50);
      for(const b of wave())m.eject(b,g);
      m.deployPopulation(g);
      if(g.objective.wave!==2||!box.active||box.value!==full||g.weapon.reserve!==full-3||
        boxes.some(i=>i.value!==full)||g.pickups.ammoStations.size!==boxes.length)
        throw Error('换波应在原位补满有限配给，不向背包直接发放');
      g.weapon.reserve=0;visit();
      if(box.active||g.weapon.reserve!==full)throw Error('新一波的原位弹箱无法领取');

      g.reset();g.phase='play';
      const {x,y,z}=g.field.vault.front;Object.assign(g.player,{x,y,z});
      if(!g.field.interact(g))throw Error('未触发巴黎宝库');
      g.time+=3;g.field.step(3,g);
      const guards=g.field.guards.slice();
      if(guards.length!==40)throw Error('宝库守卫未到齐');
      for(let i=1;i<69;i++)g.objective.advanceWave(g,Math.min(base+2*i,config.beasts.endlessWaveCap));
      for(const b of wave())m.eject(b,g);
      m.deployPopulation(g);
      if(g.objective.wave!==70 || wave().length!==116 || !m.boss?.active ||
         !guards.every(b=>b.active && b.fieldGroup==='vault') || m.live!==157)
        throw Error('巴黎高波与首领、宝库守卫不能共存 '+[g.objective.wave,wave().length,m.live]);
      return [g.objective.wave,wave().length,guards.length,m.live];
    }""")
    print("PASS independent opening boss and wave retries, boss-first kill, Paris wave/vault coexistence",result,flush=True)


def verify_variation(browser, name):
    page=level_page(browser,'rain-city',name)
    page.evaluate("""name=>{
      const {game:g,scene,renderer,config}=run, menu=document.querySelector('#mission-mode');
      const fog=scene.fog.density,light=renderer.toneMappingExposure;
      if(!document.querySelector('#run-variation').textContent)throw Error('出发前缺少变奏说明');
      g.reset();g.phase='play';
      const v=g.variation;
      if(v?.id!==name)throw Error('战前和实际抽签不一致');
      if(name==='fog' && (scene.fog.density<=fog || config.pickups.beamScale<=1))throw Error('浓雾');
      if(name==='blackout' && renderer.toneMappingExposure>=light)throw Error('停电');
      if(name==='patrol'){
        const b=g.beasts.spawnRegular(0,1,0,30);if(!b.affixes?.length||g.patrolRemaining!==1)throw Error('精英巡逻');
      }
      if(name==='plenty'||name==='fury'){
        const boxes=g.pickups.objects.filter(i=>i.active && i.permanent && i.name==='补给弹药');
        if(!boxes.length||!boxes.every(i=>i.value===Math.ceil(config.pickups.ammoCache*(v.ammo??1))))
          throw Error('变奏未影响实际固定箱');
        const item=g.pickups.add('rare',2,0,30,'测试宝物',100,true);
        g.pickups.collect(item,g.player,g);
        if(g.value!==Math.round(v.value*100))throw Error('变奏战利品倍率');
      }
      if(name==='quiet'){g.weapon.shoot(g);if(g.shotHearingScale>=1)throw Error('静默枪声');}
      g.finish(false,'测试退出');
      menu.value='endless';menu.dispatchEvent(new Event('change'));g.reset();
      if(g.variation||config.pickups.beamScale!==1||renderer.toneMappingExposure!==light)throw Error('无尽或重开未清理变奏');
    }""",name)
    page.close()


def main():
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER","chrome"))
        try:
            for stage in ["underground-lab","rain-city"]:
                page=level_page(browser,stage,quality="high" if stage=="underground-lab" else None)
                if stage=="underground-lab":
                    high=verify_simulation_cadence(page)
                    low=level_page(browser,stage,quality="low")
                    assert low.evaluate("run.config.graphics.particleScale") < page.evaluate("run.config.graphics.particleScale")
                    assert verify_simulation_cadence(low)==high, "画质改变了真实战斗或远距感知调度"
                    low.close()
                    verify_boss_feedback(page)
                pickup_views(page,stage,os.environ.get('PICKUP_CAPTURE'))
                for burst in [False,True]:
                    result=boss_measure(page,burst)
                    print(stage,'高爆发' if burst else '默认火力',result,flush=True)
                    low, high = (45,60) if stage == 'underground-lab' and burst else (60,90)
                    assert low <= result['seconds'] <= high, (stage,burst,result)
                if stage=="rain-city": verify_roles(page)
                page.close()
            page=level_page(browser,'paris-tower')
            verify_endless_deployment(page)
            verify_lift(page)
            page.close()
            for variant in ['fog','blackout','fury','patrol','plenty','quiet']:
                verify_variation(browser,variant)
            for stage in ['shanhai-secret-realm','bloodmoon-castle','sakura-night-town']:
                page=level_page(browser,stage)
                verify_event_loot(page,stage)
                page.close()
            for stage in ['shanhai-secret-realm','buried-tomb','drowned-city','jungle-temple','brass-factory']:
                page = level_page(browser,stage,'fog')
                page.evaluate("""()=>{
                  const {game:g,environment,scene}=run;
                  g.reset(); g.phase='play'; environment.update(1,true,g);
                  const withFog=scene.fog.density;
                  const variation=g.variation; g.variation=null; environment.update(1,true,g);
                  if(Math.abs(withFog-scene.fog.density*variation.fog)>.00001)throw Error('场景更新覆盖浓雾');
                }""")
                page.close()
        finally:
            browser.close()

if __name__=="__main__": main()
