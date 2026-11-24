"""用正式地图碰撞、敌人池与行动状态机验收分区遭遇、门禁、计时与撤离。"""
import os
import re
import sys

from campaign_browser import ROOT, LEVELS
from playwright.sync_api import sync_playwright


def timed_reinforcements(page, stage):
    """同一组残敌和未入场者随时间目标推进；分别验证立即撤离和留下战斗。"""
    result=page.evaluate("""tower=>{
      const g=run.game,s=g.story,p=g.player,m=g.beasts;
      const first=tower?'defend':'countdown',last=tower?'rescue':'breakout';
      const limits=tower?[8,14]:[7,9];
      function at(t){Object.assign(p,{x:t.x,y:t.y,z:t.z});run.nav.rebuild(p.x,p.z);}
      function tick(dt){g.time+=dt;m.releaseSplits(g);g.objective.step(dt,g);s.step(dt,g);}
      const alive=()=>m.pool.filter(b=>b.active&&b.storyWave);
      const kill=()=>{for(const b of alive())m.damage(b,1e7,g);};
      const runs=[];
      for(const strategy of (tower?['leave','stay','clearEarly']:['leave','stay'])){
        const clearEarly=strategy==='clearEarly';
        g.reset();g.phase='play';
        let deployed=0,holdTotal=0;
        const original=m.spawnRegular;
        m.spawnRegular=function(...args){
          const b=original.apply(this,args);
          if(b&&s.stage==='hold')holdTotal++;
          if(b&&(s.stage===first||s.stage===last))deployed++;
          return b;
        };
        try{
          for(let n=0;n<1800&&s.stage!==first;n++){
            if(s.target)at(s.target);
            kill();
            if(['use','beacon'].includes(s.stage))s.interact(g);
            if(s.stage!==first)tick(s.stage==='hold'?.05:.5);
          }
          if(s.stage!==first||(!tower&&(holdTotal!==100||g.objective.held!==45)))
            throw Error('前置阶段或独立坚守队列未完成 '+[s.stage,holdTotal]);
          at(s.target);
          let before=[],tag,peak=0;
          const began=g.time;
          for(let step=0;step<600&&s.stage===first;step++){
            if(clearEarly)kill();
            before=alive().map(b=>[b,b.spawnGeneration]);
            tick(.25);
            const active=alive();
            peak=Math.max(peak,active.length);
            const limit=tower&&s.elapsed>=30?limits[1]:limits[0];
            if(active.length>limit||(s.stage===first&&s.cap!==limit))throw Error('定时阶段或子体超过活跃上限');
            if(active.length)tag??=active.at(-1).storyWave;
          }
          if(s.stage!==last)throw Error('未能进入撤离阶段');
          if(clearEarly ? deployed!==100 : (deployed<=0||deployed>=100||!before.length))
            throw Error('切换阶段时部署与残敌异常 '+[strategy,deployed,before.length]);
          const seconds=g.time-began;
          if(seconds!==(tower?90:10)||(tower?s.elapsed!==90:!s.detonated||s.doorStates.barricade))
            throw Error('时间或爆破门禁改变 '+seconds);
          if(!before.every(([b,n])=>b.active&&b.spawnGeneration===n))throw Error('切换阶段清掉原有守卫');
          if(s.remaining!==100-deployed)throw Error('切换阶段丢失或重置了待入场者 '+[s.remaining,deployed]);
          const atExit=deployed, routes=new Set();
          if(strategy!=='leave'){
            if(tower)at({x:0,y:7.2,z:2});
            for(let n=0;n<650 && (deployed<100||alive().length);n++){
              kill();tick(.25);const active=alive();
              for(const b of active)if(b.climbRoute)routes.add(b.climbRoute[0].join());
              if(active.length>limits[1]||active.some(b=>b.storyWave!==tag))throw Error('后半段另建队列或突破上限');
            }
            if(tower&&!clearEarly&&routes.size!==4)throw Error('救援到达后攀登方向不足 '+routes.size);
            for(let i=0;i<40;i++)tick(.25);
            if(g.phase!=='play'||deployed!==100||s.remaining||alive().length)throw Error('留下后实际部署异常 '+[deployed,s.remaining,alive().length]);
          }
          at(s.target);
          if(tower)s.interact(g);else tick(.04);
          if(g.phase!=='win')throw Error('撤离不应受残敌和待入场数影响');
          runs.push({strategy,atExit,total:deployed,peak,seconds,routes:routes.size,holdTotal});
        }finally{m.spawnRegular=original;}
      }
      return runs;
    }""", stage=='paris-tower')
    print('PASS finite timed encounters',stage,result,flush=True)


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
          if (g.story.managed || !g.beasts.boss || g.beasts.live<35) throw Error('无尽增援未保留 '+[g.story.managed,Boolean(g.beasts.boss),g.beasts.live]);
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
                const next=s.navigation(task,g).waypoint??t;
                if(nav.dist[nav.index(next.x,next.z)]<0 && ['use','fight','countdown','breakout','reach'].includes(state)) unreachable.push(task.title);
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
          const mandatory=g.story.encounters.reduce((n,e)=>n+e.spawned,0);
          if(g.stageKillTarget!==mandatory+Number(Boolean(g.bossDead)))throw Error('限时或撤离增援被计入必清评分');
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
          if(defaultMode!=='classic'){
            start('classic');
            for(let turn=0;turn<500&&g.story.stage==='fight';turn++){
              if(g.story.target)at(g.story.target);
              for(const b of g.beasts.pool)if(b.active && b.type!==3)g.beasts.damage(b,1e7,g);
              tick(.5);
            }
            if(g.story.stage!=='boss'||!g.beasts.boss||g.story.encounters.some(e=>e.spawned!==100))
              throw Error('切换经典行动后分区或首领异常 '+JSON.stringify({stage:g.story.stage,waves:g.story.encounters,remaining:g.story.remaining,target:g.story.target,p:[g.player.x,g.player.y,g.player.z],pool:g.beasts.live}));
            result.classicGroups=g.story.encounters.length;
            start(defaultMode);
          }
          return result;
        }""")
        print(stage,result,flush=True)
        assert result['groups'] and all(g['spawned'] == 100 and g['clearedAt'] > g['enteredAt'] for g in result['groups']), (stage, result['groups'])
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
                  if(l.entryDoor?.active && p.z>32 && target.z<32)target=s.navigation({target},g).waypoint??target;
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
        if stage == 'rain-city':
            streets=page.evaluate("""()=>{
              const g=run.game,p=g.player,l=g.level,s=g.story;
              g.reset();g.phase='play';
              const guide=()=>s.navigation(g.objective.guide(g,{keyItem:'核心'}),g);
              // 在中途清场和任务切换时检查真实 HUD 所使用的下一个可通行节点。
              function follow(detour){
                const t=detour??s.target;
                let metres=0, corners=new Set();
                for(let k=0;k<900;k++){
                  if(Math.hypot(p.x-t.x,p.z-t.z)<.42)return {metres,corners:corners.size};
                  const task=detour?s.navigation({target:detour},g):guide(),w=task.waypoint;
                  if(!task.path?.length||!w||w!==task.path[0])throw Error('南街路线缺失 '+JSON.stringify({p:[p.x,p.y,p.z],t}));
                  corners.add([w.x,w.z].join());
                  const dx=w.x-p.x,dz=w.z-p.z,d=Math.hypot(dx,dz),speed=Math.min(.2,d)/Math.max(.001,d);
                  const step=l.move(p,dx*speed,dz*speed,.46);
                  if(step<.001)throw Error('南街路标卡墙 '+JSON.stringify({p:[p.x,p.y,p.z],w,t}));
                  metres+=step;p.y=l.foot(p.x,p.z,p.y+.46,p.radius);
                }
                throw Error('南街步行超时');
              }
              const first=follow();
              for(let i=0;i<420 && s.encounters[0]?.clearedAt===undefined;i++){
                run.nav.rebuild(p.x,p.z);
                for(const b of g.beasts.pool)if(b.active)g.beasts.damage(b,1e7,g);
                g.time+=.5;g.beasts.releaseSplits(g);s.step(.5,g);
              }
              if(s.encounters[0]?.spawned!==100||s.target.x!==1)throw Error('钟楼南街未开放');
              const kiosk=g.pickups.objects.find(o=>o.active&&o.name==='夜视模组');
              const side=follow(kiosk),second=follow();
              if(!second.metres||Math.max(side.corners,second.corners)<2)throw Error('南街缺少绕行转角 '+JSON.stringify([side,second]));
              g.time+=1;s.step(1,g);g.time+=1;s.step(1,g);
              const guard=g.beasts.pool.find(b=>b.active&&b.storyWave);
              if(!guard)throw Error('街区交战尚未开始');
              guard.alert=6;guard.playerVisible=true;
              if(!guide().engaged)throw Error('南街近敌仍显示路标');
              guard.x=p.x+19;
              if(guide().engaged||!guide().waypoint)throw Error('南街远敌阻止导航');
              return {metres:Math.round(first.metres+side.metres+second.metres),detourCorners:side.corners,streetCorners:second.corners};
            }""")
            print('PASS rain-city ground guidance and combat',streets,flush=True)
        if stage == 'underground-lab':
            detour = page.evaluate("""()=>{
              const g=run.game,s=g.story,p=g.player,l=g.level;
              g.reset();g.phase='play';
              const go=target=>{
                let length=0;
                for(let step=0;step<1800;step++){
                  if(Math.hypot(p.x-target.x,p.z-target.z)<.28){run.nav.rebuild(p.x,p.z);return length;}
                  const task=s.navigation({target},g),wp=task.waypoint;
                  if(!wp||wp!==task.path[0])throw Error('没有可行主路 '+JSON.stringify({p:[p.x,p.z],target}));
                  const dx=wp.x-p.x,dz=wp.z-p.z,d=Math.hypot(dx,dz);
                  const ratio=Math.min(.2,d)/Math.max(.0001,d);
                  const walked=l.move(p,dx*ratio,dz*ratio,.46);
                  if(walked<.001&&!l.entryDoor?.active)throw Error('转角停滞 '+JSON.stringify({p:[p.x,p.y,p.z],target:[target.x,target.z],wp}));
                  length+=walked;p.y=l.foot(p.x,p.z,p.y+.46,p.radius);
                  g.encounter.update(g,.04);
                }
                throw Error('绕行超时');
              };
              const pos=(x,z)=>({x,y:0,z});
              // 从合法安检门出发，刻意向东走错。途中查看同一个西向任务的转角如何变化。
              go(pos(0,30));
              for(let n=0;n<360 && s.stage==='fight';n++){
                for(const b of g.beasts.pool)if(b.active)g.beasts.damage(b,1e7,g);
                g.time+=.5;g.beasts.releaseSplits(g);s.step(.5,g);
              }
              for(let i=0;i<2;i++){
                if(s.stage!=='use')throw Error('安检门禁顺序失效 '+[s.stage,s.remaining,g.beasts.live,p.x,p.z]);
                go(s.target);if(!s.interact(g))throw Error('安保卡无法开门');
              }
              go(pos(1.6,20.5));
              const main=s.target,guide=()=>s.navigation(g.objective.guide(g,{keyItem:'核心'}),g);
              const direct=guide().path.map(q=>[q.x,q.z]);
              go(pos(12,17));
              const off=guide().path.map(q=>[q.x,q.z]);
              if(!direct.length||!off.length||JSON.stringify(direct)===JSON.stringify(off))throw Error('走错路后没有重算路线');
              const threat=g.beasts.spawn(0,p.x-3,p.z,p.y);
              if(!threat)throw Error('近场测试怪无法生成');
              threat.playerVisible=true;threat.alert=8;
              if(!guide().engaged)throw Error('近身威胁时主线未淡化');
              threat.x=p.x-19;
              if(guide().engaged||!guide().waypoint)throw Error('远敌压住了导航');
              g.beasts.damage(threat,1e7,g);
              const boxes=['封存逆变器样本','零号实验体日志'];
              let sideWalk=0;
              for(const name of boxes){
                const rare=g.pickups.objects.find(o=>o.active&&o.name===name);
                sideWalk+=go(rare);g.pickups.update(.04,p,g);
                if(rare.active||!g.loot.some(o=>o.name===name))throw Error('侧房搜集失败 '+name);
              }
              sideWalk+=go(main);s.step(.05,g);
              if(s.stage!=='fight'||s.encounters.length!==1)throw Error('绕行后没有回到培养室任务');
              return {metres:Math.round(sideWalk),treasure:boxes};
            }""")
            print('PASS optional rooms, wrong turn, alternative route and combat navigation',detour,flush=True)
        if stage in ('rain-city','paris-tower'):
            timed_reinforcements(page,stage)
        assert not errors,errors
    page.close()


if __name__=="__main__":
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER","chrome"))
        try: verify(browser,sys.argv[1:] or [item["id"] for item in LEVELS])
        finally: browser.close()
