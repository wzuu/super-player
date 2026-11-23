"""用正式地图碰撞、敌人池与行动状态机验收分区遭遇、门禁、计时与撤离。"""
import os
import re
import sys

from campaign_browser import ROOT, LEVELS
from playwright.sync_api import sync_playwright


def verify(browser,ids):
    page=browser.new_page(viewport={"width":960,"height":620})
    errors=[]
    page.on("pageerror",lambda e: errors.append(str(e)))
    def entry(route):
        stage=route.request.url.split('/')[-2]
        html=(ROOT/stage/'index.html').read_text(encoding='utf-8')
        html=html.replace("    startLevel(definition, campaign, campaignStage);","    window.run=startLevel(definition,campaign,campaignStage);")
        route.fulfill(body=html,content_type='text/html')
    page.route(re.compile(r"/[a-z-]+/index\.html$"),entry)
    page.add_init_script("window.requestAnimationFrame=()=>1;")
    for stage in ids:
        page.goto((ROOT/stage/'index.html').as_uri())
        page.wait_for_function("!!window.run",polling=100)
        result=page.evaluate("""() => {
          const {game:g,nav,config:c}=run, choose=document.getElementById('mission-mode');
          const start=(mode)=>{choose.value=mode;g.reset();g.phase='play';};
          const at=(t)=>{Object.assign(g.player,{x:t.x,y:t.y,z:t.z});nav.rebuild(t.x,t.z);};
          const report={},defaultMode=choose.value;
          start('endless');
          if (g.story.managed || !g.beasts.boss || g.beasts.live<35) throw Error('无尽增援未保留');
          const tick=(dt)=>{g.time+=dt;g.beasts.releaseSplits(g);g.objective.step(dt,g);g.story.step(dt,g);};
          start(defaultMode);
          const panel=document.getElementById('task-panel'), note=document.getElementById('objective');
          g.ui.nodes.hud.hidden=false;g.ui.update(.1,g);
          if (!note.textContent || !panel.hasAttribute('data-update'))throw Error('开场未显示任务更新');
          g.time+=3;g.ui.update(.1,g);
          if (panel.hasAttribute('data-update'))throw Error('任务更新未淡出');
          const update=g.ui.taskStage;
          g.ui.menu('pause',g);g.ui.menu('pause',g);
          if(g.ui.taskStage!==update)throw Error('暂停丢失行动进度');
          const seen=new Set(), blocked=[], unreachable=[];
          let turns=0, previous='', waveAlive=false, climbs=new Set(), escortGuarded=false, escortDamaged=false;
          let checkedPlatform=false,hitClimber=false;
          while(g.phase==='play' && g.story.stage!=='complete' && turns++<2000) {
            const s=g.story, state=s.stage, t=s.target;
            const task=g.objective.guide(g,{bossName:'首领',keyItem:'核心'});
            if (previous!==task.stage) {
              seen.add(task.stage);previous=task.stage;
              nav.rebuild(g.player.x,g.player.z);
              if (t && !task.stage.endsWith('combat') && state!=='defend' && state!=='rescue') {
                if(g.level.blocked(t.x,t.z,t.y,c.player.radius,c.player.height)) blocked.push(task.title);
                if(nav.dist[nav.index(t.x,t.z)]<0 && ['use','fight','countdown','breakout','reach'].includes(state)) unreachable.push(task.title);
              }
            }
            if (state==='boss') {
              const b=g.beasts.boss;
              if(b) {
                at(b);
                for(let phase=0;phase<3;phase++){g.time+=2;g.beasts.damage(b,1e7,g);}
                if(!g.bossDead || !g.pickups.keyItem)throw Error('首领未留下核心');
                at(g.pickups.keyItem);
                if(!g.pickups.takeKey(g.player,g))throw Error('核心无法拾取');
              }
              tick(.2);continue;
            }
            if (t) {
              at(t);
              if (defaultMode==='escort')g.objective.drone.position.set(t.x,t.y+1,t.z);
            }
            if(state==='use'||state==='beacon'||state==='rescue') {
              if (!s.interact(g)) throw Error('交互受阻 '+task.title+' '+JSON.stringify(t));
              if(defaultMode==='hold' && s.stage==='countdown' && s.interact(g))throw Error('重复布设');
            }
            if(s.stage==='defend'||s.stage==='rescue') {
              if(!checkedPlatform && s.stage==='defend'){
                checkedPlatform=true;
                const elapsed=s.elapsed;
                at(g.level.spawn);tick(2);
                if(s.elapsed!==elapsed)throw Error('离开观景台仍计时');
                at(s.target);
              }
              for(const b of g.beasts.pool.filter(b=>b.active&&b.climbRoute)){
                climbs.add(b.climbRoute[0].join());
                for(let i=0;i<1200 && b.climbRoute;i++){
                  s.stepBeast(b,g,.02);
                  if(!hitClimber && b.y>3 && b.y<5){
                    g.beasts.refreshHash();
                    const end=b.climbRoute.at(-1), eye=g.beasts.air.set(end[0],end[1]+1.7,end[2]);
                    const dir=g.beasts.line.set(b.x-eye.x,b.y+b.height*.55-eye.y,b.z-eye.z),limit=dir.length();
                    dir.divideScalar(limit);
                    hitClimber=g.level.visible(eye,dir,limit) && g.beasts.hash.ray(eye,dir,limit+1)===b;
                  }
                }
                if(b.y<6 || b.climbRoute)throw Error('攀登中断');
              }
            }
            if (s.stage==='breakout') {
              at({x:8,y:0,z:-15});for(let i=0;i<15;i++)tick(.4);
              waveAlive=g.beasts.live>0;at(s.target);
            }
            if (s.stage==='fight' && s.droneDocked && !escortDamaged) {
              const raider=g.beasts.pool.find(b=>b.active&&b.droneRaider);
              if(raider){
                const d=g.objective.drone.position;
                Object.assign(raider,{x:d.x-1.7,z:d.z,y:d.y-1,stun:0});
                at({x:d.x-.85,y:d.y-1,z:d.z});
                const hp=g.objective.escortHealth;s.stepBeast(raider,g,1);g.time+=2;s.stepBeast(raider,g,.1);
                escortGuarded=g.objective.escortHealth===hp;
                at({x:d.x+2,y:d.y-1,z:d.z});s.stepBeast(raider,g,.1);g.time+=1;s.stepBeast(raider,g,.1);
                escortDamaged=g.objective.escortHealth<hp;
              }
            }
            if((state==='fight' || state==='approach' && task.stage.endsWith('combat')) && (!s.droneDocked || escortDamaged)) {
              for(const b of g.beasts.pool)if(b.active && b.type!==3)g.beasts.damage(b,1e7,g);
            }
            tick(.5);
          }
          if(turns>=2000)throw Error('推进停滞 '+g.story.stage+' '+JSON.stringify(g.story.target)+' '+g.story.remaining+' '+g.beasts.live);
          if(defaultMode==='hold' && (!waveAlive || g.phase!=='win'))throw Error('突围需在尚有敌人时到达出口');
          if(defaultMode==='rescue' && (g.phase!=='win'||g.story.elapsed!==90||climbs.size<2||!hitClimber))throw Error('高塔救援或登台射线失败 '+[g.phase,g.story.elapsed,climbs.size,hitClimber]);
          if(defaultMode==='escort' && (!escortGuarded||!escortDamaged))throw Error('护送未能拦截或承伤');
          if(defaultMode==='classic' && !g.core && g.phase!=='win')throw Error('缺少核心');
          const result={mode:defaultMode,steps:seen.size,kills:g.kills,blocked,unreachable,climbs:climbs.size,groups:g.story.encounters};
          start(defaultMode);
          if(g.kills || g.story.elapsed || g.objective.escortHealth!==100)throw Error('重开状态残留');
          if(defaultMode==='escort'){
            g.objective.damageDrone(100,g);
            if(g.phase!=='fail' || !document.querySelector('#menu-text').textContent.includes('无人机已损毁'))throw Error('缺少护送失败原因');
          }
          if(defaultMode==='hold' && !g.story.doorStates.barricade)throw Error('重开后爆破隔离门未复位');
          if(defaultMode==='timed'){
            g.encounter.hudOffline=true;g.ui.update(.1,g);
            if(getComputedStyle(panel).visibility!=='hidden')throw Error('EMP 未隐藏任务');
            g.encounter.hudOffline=false;g.ui.update(.1,g);
            if(getComputedStyle(panel).visibility!=='visible'||!note.textContent)throw Error('EMP 后未恢复任务');
          }
          if(defaultMode==='classic' && g.story.doorStates.reactor!==undefined){
            for(const id of ['security','power','reactor','service'])if(!g.story.doorStates[id])throw Error('重开门禁 '+id);
            const door={x:1.6,y:0,z:22},from={x:1.6,y:1,z:23.5},dir={x:0,y:0,z:-1};
            if(!g.level.blocked(door.x,door.z,0,.33,1.77)||g.level.visible(from,dir,3))throw Error('封锁门穿过玩家或弹道');
            at({x:1.6,y:0,z:23.5});
            if(!g.story.interact(g)||!g.story.doorStates.security||!g.ui.notice.includes('安保卡'))throw Error('门禁未说明缺失权限');
          }
          return result;
        }""")
        print(stage,result,flush=True)
        assert not result['blocked'], (stage,result['blocked'])
        assert not result['unreachable'], (stage,result['unreachable'])
        if stage in ('underground-lab','rain-city','paris-tower'):
            for width,height in [(1440,900),(640,360)]:
                page.set_viewport_size({'width':width,'height':height})
                assert page.evaluate("""()=>{
                  const g=run.game;g.phase='play';g.ui.nodes.hud.hidden=false;g.ui.update(.1,g);
                  const rect=id=>document.getElementById(id).getBoundingClientRect(),t=rect('task-panel');
                  return t.width>0 && t.height>0 && t.bottom<innerHeight/2-9 && t.right<rect('map').left;
                }"""),(stage,width,height)
        if stage in ('underground-lab','rain-city'):
            walked=page.evaluate("""()=>{
              const g=run.game,s=g.story,p=g.player,l=g.level,r=run.nav.routeFor(0);
              g.reset();g.phase='play';let walked=0,turns=0;
              while(g.phase==='play' && turns++<16000){
                const dt=.04;g.time+=dt;g.encounter?.update(g,dt);
                run.nav.rebuild(p.x,p.z);
                let target=s.target;
                if(s.stage==='boss'){
                  if(g.beasts.boss && Math.hypot(g.beasts.boss.x-p.x,g.beasts.boss.z-p.z)<14){
                    const b=g.beasts.boss;g.beasts.damage(b,1e7,g);
                  }
                  target=g.beasts.boss??g.pickups.keyItem;
                  g.pickups.takeKey(p,g);
                }
                if(target){
                  r.rebuild(target.x,target.z);
                  const i=r.index(p.x,p.z), j=r.next(p.x,p.z);
                  const exact=Math.hypot(p.x-target.x,p.z-target.z)<1.6||i===j;
                  const dx=(exact?target.x:r.x(j))-p.x,dz=(exact?target.z:r.z(j))-p.z;
                  const d=Math.hypot(dx,dz),speed=Math.min(d,.18)/Math.max(.001,d);
                  walked+=l.move(p,dx*speed,dz*speed,.46);
                  p.y=l.foot(p.x,p.z,p.y+.46,p.radius);
                }
                for(const b of g.beasts.pool)if(b.active && b.type!==3)g.beasts.damage(b,1e7,g);
                g.beasts.releaseSplits(g);g.objective.step(dt,g);s.step(dt,g);s.interact(g);
              }
              if(g.phase!=='win')throw Error('步行路线中断 '+s.stage+' '+JSON.stringify(s.target)+' 玩家 '+[p.x,p.y,p.z]);
              return Math.round(walked);
            }""")
            assert walked>40, (stage,walked)
            print('PASS walk',stage,walked,flush=True)
        assert not errors,errors
    page.close()


if __name__=="__main__":
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER","chrome"))
        try: verify(browser,sys.argv[1:] or [item["id"] for item in LEVELS])
        finally: browser.close()
