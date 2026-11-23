"""在独立关卡的正式运行时验证掉落、职能、词缀、首领输出窗口及连杀归因。"""
import json
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright
from campaign_browser import ROOT


def level_page(browser, stage, variation=None):
    page = browser.new_page(viewport={"width": 960, "height": 620})
    page.add_init_script("window.requestAnimationFrame=()=>1")
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
      m.traits.step(next,g,.02);g.time=next.traitAt+.05;m.traits.step(next,g,.02);
      if(next.active || p.hp>=before)throw Error('延时引爆未伤及近处玩家');
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
                page=level_page(browser,stage)
                pickup_views(page,stage,os.environ.get('PICKUP_CAPTURE'))
                for burst in [False,True]:
                    result=boss_measure(page,burst)
                    print(stage,'高爆发' if burst else '默认火力',result,flush=True)
                    assert 60 <= result['seconds'] <= 90, (stage,burst,result)
                if stage=="rain-city": verify_roles(page)
                page.close()
            page=level_page(browser,'paris-tower')
            verify_lift(page)
            page.close()
            for variant in ['fog','blackout','fury','patrol','plenty','quiet']:
                verify_variation(browser,variant)
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
