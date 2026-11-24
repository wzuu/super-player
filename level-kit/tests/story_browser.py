"""用正式地图碰撞、敌人池与行动状态机验收分区遭遇、门禁、计时与撤离。"""
import os
import re
import sys

from campaign_browser import ROOT, LEVELS
from playwright.sync_api import sync_playwright


def timed_encounters(page, stage):
    """同一场的一百只全部在计时开始时入场，切换目标不补刷。"""
    result=page.evaluate("""tower=>{
      const g=run.game,s=g.story,p=g.player,m=g.beasts;
      const first=tower?'defend':'countdown',last=tower?'rescue':'breakout';
      function at(t){Object.assign(p,{x:t.x,y:t.y,z:t.z});run.nav.rebuild(p.x,p.z);}
      function tick(dt){g.time+=dt;m.releaseSplits(g);g.objective.step(dt,g);s.step(dt,g);}
      const alive=()=>m.pool.filter(b=>b.active && b.storyWave);
      const runs=[];
      for(const leave of [true,false]){
        g.reset();g.phase='play';
        const before=new Set();let hold=[];
        let groups=0;
        const spawn=m.spawnGroup.bind(m);
        m.spawnGroup=(entries,options)=>{
          const result=spawn(entries,options);
          if(result.length===100)groups++;
          return result;
        };
        for(let i=0;i<460 && s.stage!==first;i++){
          if(s.target)at(s.target);
          if(s.stage==='fight'||s.stage==='approach')for(const b of alive())m.damage(b,1e7,g);
          if(s.stage==='use'||s.stage==='beacon'){
            for(const b of alive())before.add(b);
            s.interact(g);
          }
          if(s.stage!==first)tick(.5);
          if(s.stage==='hold' && alive().length)hold=alive();
        }
        if(s.stage!==first)throw Error('前置阶段未完成 '+[s.stage,g.beasts.live]);
        if(!tower && (hold.length!==100 || g.objective.held!==45 || hold.some(b=>!b.active)))
          throw Error('坚守残敌或时间异常 '+[hold.length,g.objective.held]);
        const team=alive().filter(b=>!before.has(b)), tag=team[0]?.storyWave;
        if(team.length!==100 || team.some(b=>b.storyWave!==tag) || s.remaining)
          throw Error('计时任务触发时未完整集结 '+[s.stage,team.length,alive().length]);
        if(tower && new Set(team.map(b=>b.climbRoute[0].join(','))).size!==4)
          throw Error('救援防守应在开启时向四面集结');
        at(s.target);
        const began=g.time, initialGroups=groups, remove=leave?6:100;
        for(const b of team.slice(0,remove))m.damage(b,1e7,g);
        const generations=team.slice(remove).map(b=>b.spawnGeneration);
        for(let i=0;i<370 && s.stage===first;i++)tick(.25);
        const seconds=g.time-began;
        if(s.stage!==last || seconds!==(tower?90:10) || (!tower && (!s.detonated||s.doorStates.barricade)))
          throw Error('计时或出口异常 '+[s.stage,seconds]);
        if(team.slice(remove).some((b,i)=>!b.active||b.storyWave!==tag||b.spawnGeneration!==generations[i]))
          throw Error('阶段切换清除了原队伍');
        if(groups!==initialGroups || alive().some(b=>b.storyWave!==tag && !before.has(b)))
          throw Error('击杀或阶段切换创建了另一场敌群');
        m.spawnGroup=spawn;
        at(s.target);
        if(tower)s.interact(g);else tick(.04);
        if(g.phase!=='win')throw Error('撤离不应受残敌影响');
        runs.push({leave,initial:team.length,previous:hold.length,seconds});
      }
      return runs;
    }""", stage=='paris-tower')
    print('PASS timed encounters',stage,result,flush=True)


def check_trigger_edges(page, stage):
    result=page.evaluate("""isLab=>{
      const g=run.game,p=g.player,s=g.story,m=g.beasts;
      const coordinates=isLab?[[0,29.88],[-2.1,29.8],[1.1,28.2]]:[[-6,24],[6,24],[0,29]];
      const reports=[];
      for(const [cx,cz] of coordinates){
        g.reset();g.phase='play';
        const t=s.target;
        const initial=m.pool.filter(b=>b.active && s.isCurrentGuard(b));
        if(initial.length!==100)throw Error('冲刺或绕入之前应已部署全部守卫');
        const originGap=Math.min(...initial.map(b=>Math.hypot(b.x-p.x,b.z-p.z)-b.radius-p.radius));
        const generations=initial.map(b=>b.spawnGeneration);
        if(originGap<6)throw Error('开局出生安全间距不足 '+originGap);
        let position;
        for(const [dx,dz] of [[0,0],[0,.4],[-.4,0],[.4,0],[0,-.4],[0,.9],[-.9,0],[.9,0],[0,-.9]]){
          const x=cx+dx,z=cz+dz,y=g.level.foot(x,z,t.y+1,p.radius);
          if(!g.level.blocked(x,z,y,p.radius,p.height)){position={x,y,z};break;}
        }
        if(!position)throw Error('测试入口周围缺少可站立地点 '+[cx,cz]);
        Object.assign(p,position);
        const {x,z}=position;
        // 模拟玩家在一个模拟步内逼近入口；上一次寻路终点仍是出生点。
        s.step(.016,g);
        const team=m.pool.filter(b=>b.active && s.isCurrentGuard(b)), tag=team[0]?.storyWave;
        if(team.length!==100||s.encounters[0]?.spawned!==100)throw Error('入口未一次集结 '+[x,z,team.length]);
        const victims=team.filter(b=>!b.affixes?.includes('split')).slice(0,4);
        if(victims.length!==4)throw Error('缺少可验证的普通守卫');
        for(const b of victims)m.damage(b,1e7,g);
        for(let i=0;i<48;i++){g.time+=.25;m.releaseSplits(g);s.step(.25,g);}
        if(m.pool.filter(b=>b.active && b.storyWave===tag).length!==96 || s.remaining)
          throw Error('击杀普通守卫后本场又生出敌人');
        if(team.some((b,i)=>b!==initial[i] || b.spawnGeneration!==generations[i]))
          throw Error('靠近已有队列后发生重刷');
        reports.push({x,z,gapBeforeApproach:+originGap.toFixed(2),unchanged:team.length});
      }
      return reports;
    }""",stage=='underground-lab')
    print('PASS immediate formation at entrance and edges',stage,result,flush=True)


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
    page.add_init_script("""window.requestAnimationFrame=()=>1;
      Element.prototype.requestPointerLock=()=>{throw Error('任务验收不使用系统鼠标')};""")
    for stage in ids:
        page.goto((ROOT/stage/'index.html').as_uri())
        page.wait_for_function("!!window.run",polling=100)
        expected = {
            'underground-lab': {'objectiveCounts':[43,43], 'encounters':[100,100,100]},
            'orbital-brood-ring': {'objectiveCounts':[10,12], 'encounters':[24,29]},
            'moonlit-stained-glass-keep': {'objectiveCounts':[9,11], 'encounters':[20,28]},
        }.get(stage)
        result=page.evaluate("""expected => {
          const {game:g,nav,config:c}=run, choose=document.getElementById('mission-mode');
          const start=(mode)=>{choose.value=mode;g.reset();g.phase='play';};
          const at=(t)=>{Object.assign(g.player,{x:t.x,y:t.y,z:t.z});nav.rebuild(t.x,t.z);};
          const report={},defaultMode=choose.value;
          start('endless');
          if (g.story.managed || !g.beasts.boss || g.beasts.live<35) throw Error('无尽增援未保留 '+[g.story.managed,Boolean(g.beasts.boss),g.beasts.live]);
          const stations=[...g.pickups.ammoStations];
          if(stations.length<2||stations.some(box=>!box.active||!box.permanent||box.value!==g.pickups.cacheAmount()))
            throw Error('无尽地图缺少开局固定弹箱');
          if(!stations.some(box=>nav.dist[nav.index(box.x,box.z)]>=0 && !g.level.blocked(box.x,box.z,box.y,c.player.radius,c.player.height)))
            throw Error('出生区不能走到任何固定弹箱');
          const tick=(dt)=>{g.time+=dt;g.beasts.releaseSplits(g);g.objective.step(dt,g);g.story.step(dt,g);};
          const manager=g.beasts, spawn=manager.spawnGroup.bind(manager);
          let deployed=0;
          manager.spawnGroup=(entries,options)=>{
            const group=spawn(entries,options);
            if(entries.length!==100)return group;
            if(group.length!==100)throw Error('当前交战区未能一次部署百只 '+JSON.stringify({stage:g.story.stage,mode:g.objective.mode,player:[g.player.x,g.player.z],live:manager.live,anchors:options?.anchors,types:entries.reduce((n,e)=>(n[e.type]=(n[e.type]??0)+1,n),{})}));
            deployed++;
            for(const [i,b] of group.entries()){
              if(g.level.blocked(b.x,b.z,b.y,b.radius,b.height)||g.level.inSafeZone(b.x,b.z)||
                 Math.hypot(b.x-g.player.x,b.z-g.player.z)<6)throw Error('出生净空或距离异常 '+[b.type,b.x,b.z]);
              if(group.slice(0,i).some(other=>b.y<other.y+other.height && other.y<b.y+b.height &&
                 Math.hypot(b.x-other.x,b.z-other.z)+.001<b.radius+other.radius))
                throw Error('同一群出生碰撞 '+[b.type,b.x,b.z]);
            }
            return group;
          };
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
                if(expected && defaultMode==='classic'){if(g.phase!=='win' || !g.bossDead || g.core)throw Error('首领歼灭结算错误');break;}
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
              const raider=g.beasts.pool.find(b=>b.active&&b.droneRaider&&s.isCurrentGuard(b));
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
              for(const b of g.beasts.pool)if(b.active && s.isCurrentGuard(b))g.beasts.damage(b,1e7,g);
            }
            tick(.5);
          }
          if(turns>=2000)throw Error('推进停滞 '+g.story.stage+' '+JSON.stringify(g.story.target)+' '+g.story.remaining+' '+g.beasts.live);
          if(defaultMode==='hold' && (!waveAlive || g.phase!=='win'))throw Error('突围需在尚有敌人时到达出口');
          if(defaultMode==='rescue' && (g.phase!=='win'||g.story.elapsed!==90||climbs.size<2||!hitClimber))throw Error('高塔救援或登台射线失败 '+[g.phase,g.story.elapsed,climbs.size,hitClimber]);
          if(defaultMode==='escort' && (!escortGuarded||!escortDamaged))throw Error('护送未能拦截或承伤');
          if(defaultMode==='classic' && !g.core && g.phase!=='win')throw Error('缺少核心');
          const mandatory=expected && defaultMode==='classic' ? expected.objectiveCounts.reduce((a,b)=>a+b,0) : g.story.encounters.reduce((n,e)=>n+e.spawned,0);
          if(g.stageKillTarget!==mandatory+Number(Boolean(g.bossDead)))throw Error('限时或撤离增援被计入必清评分');
          if(!expected){
            const boxes=g.pickups.objects.filter(i=>i.active && i.permanent && i.name==='战区入口弹药');
            if(boxes.length!==deployed || boxes.some(i=>i.value!==g.pickups.cacheAmount(100*c.pickups.roundsPerGuard)))
              throw Error('每个实际战区应有一份入口配给 '+[deployed,boxes.length]);
          }
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
          if(defaultMode==='classic' && location.pathname.includes('/underground-lab/')){
            for(const id of ['security','samples','power','reactor'])if(!g.story.doorStates[id])throw Error('重开门禁 '+id);
            const door={x:0,y:0,z:20},from={x:0,y:1,z:21.5},dir={x:0,y:0,z:-1};
            if(!g.level.blocked(door.x,door.z,0,.33,1.77)||g.level.visible(from,dir,3))throw Error('封锁门穿过玩家或弹道');
            at({x:0,y:0,z:21.5});
            if(!g.story.interact(g)||!g.story.doorStates.samples||!g.ui.notice.includes('需完成'))throw Error('门禁未说明缺失权限');
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
        }""", expected)
        print(stage,result,flush=True)
        groups=result['groups']
        assert groups and all(g['clearedAt'] > g['enteredAt'] for g in groups), (stage, groups)
        assert [g['spawned'] for g in groups] == (expected['encounters'] if expected else [100]*len(groups)), (stage, groups)
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
                  if(l.entryDoor?.active && p.z>l.entryDoor.z1 && target.z<l.entryDoor.z0)target=s.navigation({target},g).waypoint??target;
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
                let t=detour??guide().target;
                let metres=0, corners=new Set();
                for(let k=0;k<900;k++){
                  const task=detour?s.navigation({target:detour},g):guide(),w=task.waypoint;
                  t=detour??task.target;
                  if(Math.hypot(p.x-t.x,p.z-t.z)<(t.storyWave ? 2.0 : .42))return {metres,corners:corners.size};
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
                for(const b of g.beasts.pool)if(b.active && s.isCurrentGuard(b))g.beasts.damage(b,1e7,g);
                g.time+=.5;g.beasts.releaseSplits(g);s.step(.5,g);
              }
              if(s.encounters[0]?.spawned!==100||s.encounters[1]?.name!=='钟楼南街')throw Error('钟楼南街未开放');
              const kiosk=g.pickups.objects.find(o=>o.active&&o.name==='夜视模组');
              const side=follow(kiosk),second=follow(s.target);
              if(!second.metres||Math.max(side.corners,second.corners)<2)throw Error('南街缺少绕行转角 '+JSON.stringify([side,second]));
              g.time+=1;s.step(1,g);g.time+=1;s.step(1,g);
              const guard=guide().target;
              if(!guard?.active || !s.isCurrentGuard(guard))throw Error('街区交战尚未开始');
              guard.alert=6;guard.playerVisible=true;
              if(!guide().engaged)throw Error('南街近敌未进入交战状态');
              guard.x=p.x+19;
              if(guide().engaged||!guide().waypoint)throw Error('南街远敌阻止导航');
              return {metres:Math.round(first.metres+side.metres+second.metres),detourCorners:side.corners,streetCorners:second.corners};
            }""")
            print('PASS rain-city ground guidance and combat',streets,flush=True)
        if stage == 'underground-lab':
            page.add_script_tag(content=(ROOT/'level-kit/tests/lab_layout.js').read_text(encoding='utf8'))
            layout = page.evaluate('() => verifyLabLayout({offsets:[-1.9,0,1.9],extract:false})')
            assert len(layout['approaches']) == 9, layout
            assert len(layout['reports']) == 9 and len(layout['rooms']) == 6, layout
            for sample in layout['reports']:
                assert sorted(sample['homes'].values()) == [2,23,32,43] and sample['gap'] >= 6, sample
                assert sample['closedBefore'] and not sample['blocked'] and not sample['overlap'], sample
            print('PASS laboratory formation, approach and room rewards',layout,flush=True)
            print('PASS laboratory watch, hearing, pursuit and closed gate', page.evaluate('() => verifyLabWatch()'), flush=True)
            route_guard = page.evaluate("""()=>{
              const g=run.game,s=g.story,p=g.player,l=g.level;
              const pos=(x,z)=>({x,y:0,z}), go=target=>{
                for(let i=0;i<1600;i++){
                  if(Math.hypot(p.x-target.x,p.z-target.z)<.28)return;
                  const task=s.navigation({target},g),wp=task.waypoint;
                  if(!wp)throw Error('不可到达实验室导向测试点 '+JSON.stringify(target));
                  const dx=wp.x-p.x,dz=wp.z-p.z,factor=Math.min(1,.19/Math.max(.001,Math.hypot(dx,dz)));
                  l.move(p,dx*factor,dz*factor,run.config.player.step);
                  p.y=l.foot(p.x,p.z,p.y+.06,p.radius);g.encounter.update(g,.04);
                }
                throw Error('实验室方向绕行超时');
              };
              g.reset();g.phase='play';go(s.target);s.interact(g);
              for(let i=0;i<50 && s.stage==='fight';i++){
                for(const b of g.beasts.pool)if(b.active && b.storyWave)g.beasts.damage(b,1e7,g);
                g.time+=.2;g.beasts.releaseSplits(g);s.step(.2,g);
              }
              const guide=()=>s.navigation(g.objective.guide(g,{keyItem:'核心'}),g);
              const direct=guide().path.map(q=>[q.x,q.z]);
              go(pos(13,40));const fromSide=guide().path.map(q=>[q.x,q.z]);
              if(!direct.length||!fromSide.length||JSON.stringify(direct)===JSON.stringify(fromSide))
                throw Error('从防疫站折返主路时未重算路线');
              const threat=g.beasts.spawn(0,p.x-2,p.z,p.y);
              if(!threat)throw Error('侧房门口没有可用测试点');
              const sentry={...threat,storyWave:{},roomAlert:false,roomBounds:[p.x-8,p.z-3,p.x-1,p.z-1]};
              sentry.id=(6-g.beasts.frame%6)%6;
              const shutter=l.box(p.x-1,p.z,.20,1.5,p.y,p.y+2);
              s.stepBeast(sentry,g,1/60);
              if(sentry.roomAlert)throw Error('未接敌的房内守卫透过实墙看到侧路玩家');
              l.setBarrier(shutter,null,false);
              s.stepBeast(sentry,g,1/60);
              if(!sentry.roomAlert)throw Error('房内守卫看不到从开放侧路接近的玩家');
              threat.playerVisible=true;threat.alert=8;
              const arrows=run.scene.getObjectByName('ground-directions');
              function markers(){
                const task=guide();s.marker(task,g);
                return Array.from({length:arrows.count},(_,i)=>{
                  const matrix=arrows.instanceMatrix.array.subarray(i*16,i*16+16);
                  const [x,y,z]=matrix.subarray(12,15);
                  if(Math.abs(l.surface(x,z,y+.2)+.046-y)>.022 || l.blocked(x,z,y-.046,.39,.15))
                    throw Error('地面箭头悬空或穿入障碍 '+[x,y,z]);
                  return [x,y,z];
                });
              }
              if(!guide().engaged || !markers().length)throw Error('近身交战丢失地面指引');
              const [x,y,z]=markers()[0];
              g.projectiles.pool(x,y-.046,z,1);
              if(markers().some(a=>Math.hypot(a[0]-x,a[2]-z)<1.85))throw Error('地面路线覆盖酸池');
              g.projectiles.reset();
              const coversMarker=()=>markers().some(a=>Math.hypot(a[0]-x,a[2]-z)<.1);
              const hazard={p:pos(x,z),falling:g.time+.4,data:{radius:2}};
              g.field.traps.push(hazard);
              if(coversMarker())throw Error('地面路线覆盖坠落物预警');
              g.field.traps.pop();
              const charge={active:true,type:1,mode:'windup',x:x-1,z,fx:1,fz:0,
                chargeMarkCount:1,chargeMarkLength:2,chargeHeights:[y,y]};
              g.beasts.pool.push(charge);
              if(coversMarker())throw Error('地面路线覆盖冲锋带');
              charge.chargeHeights=[y+4,y+4];
              if(!coversMarker())throw Error('楼上冲锋带遮住楼下路线');
              g.beasts.pool.pop();
              p.lastHurt=g.time;
              threat.x=p.x-19;
              if(!guide().engaged || !markers().length)throw Error('刚刚受击后地面路线消失');
              p.lastHurt=-Infinity;
              if(guide().engaged||!guide().waypoint)throw Error('远敌压住了导航');
              g.phase='pause';s.marker(guide(),g);
              if(arrows.visible || arrows.count)throw Error('暂停还在绘制导航');
              g.phase='play';
              g.beasts.damage(threat,1e7,g);
              return true;
            }""")
            assert route_guard
        if stage == 'rain-city':

            check_trigger_edges(page,stage)
        if stage in ('rain-city','paris-tower'):
            timed_encounters(page,stage)
        assert not errors,errors
    page.close()


if __name__=="__main__":
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER","chrome"))
        try: verify(browser,sys.argv[1:] or [item["id"] for item in LEVELS])
        finally: browser.close()
