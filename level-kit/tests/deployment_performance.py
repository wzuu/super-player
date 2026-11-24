"""测量真实 F 开门或街区接敌的 RAF。运行前在目标工作目录执行 npm run build。
默认测试当前机房和钟楼街；--stages long-door 用于有分区隔离门的新实验室首门。
--root 可指向另一次独立构建；原地图基线为 b1b8605（PR #92）。
每格先运行 --repeat 次无探针采样，再运行一次分项探针。--warm 1 检查几乎没有准备时间的冷开门。
"""
import argparse
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from campaign_browser import ROOT
from encounter_performance import ROOMS
from herd_performance import FIXTURE, SEED

OPEN = """async ([stage,warm,profile])=>{
  const raf=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve(performance.now())));
  window.deployTick=0;window.deployFrame=()=>run.frame(++window.deployTick*1000/60);
  // 战前页也是玩家实际可以停留的准备时间；冷开门复测只给一帧。
  for(let i=0;i<warm;i++){await raf();deployFrame();}
  const m=run.game.beasts,spawn=m.spawnGroup.bind(m),batches=[];
  m.spawnGroup=(...args)=>{
    const start=performance.now();let creatures;
    window.deploymentProbe=profile && args[0].length===100;
    try{creatures=spawn(...args);}finally{window.deploymentProbe=false;}
    if(creatures.length)batches.push({count:creatures.length,ms:+(performance.now()-start).toFixed(1)});
    return creatures;
  };
  const began=await raf();
  deploymentSeed(750077);
  herdSetup(['final',stage==='rain-city'?'street':'machine-room',100]);
  run.input.fire=false;deployFrame();
  const cpu=performance.now()-began,frame=await raf()-began;
  m.spawnGroup=spawn;
  const parts=profile?{...deployProfile}:undefined;
  if(profile)for(const key of Object.keys(deployProfile))delete deployProfile[key];
  return {cpu:+cpu.toFixed(1),frame:+frame.toFixed(1),batches,parts};
}"""
BEFORE = """stage=>{
  const {game:g,nav}=run,s=g.story,m=g.beasts,p=g.player;
  const move=q=>{Object.assign(p,{x:q.x,y:q.y,z:q.z});nav.rebuild(p.x,p.z);};
  const course=window.fixtureCourse,street=stage==='rain-city';
  const room=stage==='transport-door'?course.filter(a=>a.kind==='fight')[1]:
    stage==='long-door'?course.find(a=>a.kind==='fight'):
    course.find(a=>a.kind==='fight' && (street?a.name==='钟楼南街':(a.passage || a.name.startsWith('服务器'))));
  if(!room)throw Error('场景没有目标战区 '+stage);
  const door=course[course.indexOf(room)-1], [rx,rz]=[room.at[0],room.at.at(-1)];
  const ry=room.at.length===3?room.at[1]:g.level.surface(rx,rz,g.level.base(rx,rz)+.5);
  const isGate=()=>!street && s.stage==='use' && s.target && door?.door &&
    s.target.x===door.at[0] && s.target.z===door.at.at(-1);
  window.room=room.name;window.batchSize=room.count??100;window.roomTarget={x:rx,y:ry,z:rz};
  for(let i=0;i<2000;i++){
    if(s.target)move(s.target);
    if(isGate())return;
    if(stage==='rain-city' && s.encounters.length===1){
      s.step(.016,g);
      const first=s.guide(g,{}).target?.storyWave;
      if(first){
        const living=m.pool.filter(b=>b.active && b.storyWave===first);
        const last=living.find(b=>!b.affixes?.includes('split'));
        if(!last)throw Error('缺少最后一名普通广场守卫');
        for(const b of living)if(b!==last)m.damage(b,1e8,g);
        // 已击倒的分裂精英也应归属前场。它们生成以后清掉，然后留下可实测的最后一击。
        for(let n=0;n<8;n++){g.time+=.25;m.releaseSplits(g);
          for(const b of m.pool)if(b.active && b.storyWave===first && b!==last)m.damage(b,1e8,g);}
        window.lastGuard=last;return;
      }
    }
    for(const b of m.pool)if(b.active&&b.storyWave)m.damage(b,1e8,g);
    g.time+=.3;m.releaseSplits(g);g.objective.step(.3,g);s.step(.3,g);
    if(s.stage==='use' && !isGate()){
      move(s.target);s.interact(g);
    }
  }
  throw Error('未到实测前置阶段 '+stage+' '+s.stage);
}"""
# 分项仅在一个百只 spawnGroup 内开启；稳定交战帧、之前的热身与残敌不进入统计。
PROBE = """() => {
  const m=run.game.beasts, s=window.deployProfile={};
  window.deploymentProbe=false;
  window.deploymentPart=(key,fn)=>{
    if(!window.deploymentProbe)return fn();
    const start=performance.now();
    try{return fn();}finally{s[key]=(s[key]??0)+performance.now()-start;}
  };
  const watch=(obj,name,key)=>{
    const old=obj[name];obj[name]=function(...args){return deploymentPart(key,()=>old.apply(this,args));};
  };
  watch(Object.getPrototypeOf(run.nav.fields[1]),'rebuild','route');
  watch(run.nav,'routeFor','fieldCreate');
  watch(m,'planGroup','plan');
  watch(m,'spawn','activate');watch(m,'refreshHash','instanceBounds');
}"""
RECORD = """async ([sample,residual,profile,warm]) => {
  const {game:g,input}=run, m=g.beasts, s=g.story,p=g.player,l=g.level;
  const door=sample!=='rain-city';
  const raf=()=>new Promise(resolve=>requestAnimationFrame(stamp=>resolve({time:performance.now(),stamp})));
  const t=door?s.target:roomTarget;
  const render=deployFrame;
  input.fire=false;input.down.clear();p.hurtDelay=Infinity;
  let angle=0;
  if(!door){
    // 在实际触发圈外找到一段可走入房间的路；正式玩家运动、剧情阶段与按键负责触发。
    const field=run.nav.playerRoute();
    let found=false;
    for(let i=0;i<48;i++){
      angle=i*Math.PI/24;
      const dx=Math.sin(angle),dz=Math.cos(angle),pos={x:t.x+dx*13.3,y:t.y,z:t.z+dz*13.3};
      if(!l.blocked(pos.x,pos.z,pos.y,p.radius,p.height) &&
        field.canWalk(pos,{x:t.x+dx*12.5,y:t.y,z:t.z+dz*12.5})){
        Object.assign(p,pos);found=true;break;
      }
    }
    if(!found)throw Error('找不到可跨入的触发边界 '+sample);
  }
  p.look.rotation.set(-.04,angle,0,'YXZ');p.positionCamera(0);run.nav.rebuild(p.x,p.z);
  if(residual){
    for(let wave=0;wave<2;wave++){
      const group=m.spawnGroup(Array.from({length:10},()=>({type:0,regular:false,angle:0})));
      if(group.length!==10)throw Error('残留敌群未集结');
    }
  }
  const warmMs=[];
  for(let i=0;i<warm;i++){await raf();const a=performance.now();render();warmMs.push(performance.now()-a);}
  if(!door && s.encounters.some(e=>e.name===window.room))throw Error('预热提前触发了目标房间');
  const aliveBefore=m.pool.filter(b=>b.active && !b.storyWave).length;
  // 基准的投放种子独立于驱动纹理分配和浏览器内部的暖机活动。
  window.deploymentSeed(910077);
  const original=m.spawnGroup.bind(m),originalRender=m.render.bind(m);
  let frameProfile;
  if(profile){
    for(const [owner,name,key] of [[g,'step','gameStep'],[m,'update','beastStep'],[s,'step','storyStep'],
      [g.ui,'update','hud'],[run.renderer,'render','draw']]){
      const fn=owner[name];owner[name]=function(...args){
        const begin=performance.now(),v=fn.apply(this,args);
        frameProfile[key]=(frameProfile[key]||0)+performance.now()-begin;
        return v;
      };
    }
  }
  let batch,instanceMs=0,frameNo=0,trigger=-1,work=0,triggerSim=0;
  m.spawnGroup=(...args)=>{
    if(args[0].length!==window.batchSize)return original(...args);
    window.deploymentProbe=profile;
    const start=performance.now();let actors;
    try {actors=original(...args);}finally{window.deploymentProbe=false;}
    const elapsed=performance.now()-start;
    if(actors.length===window.batchSize && !batch){
      const sites=actors.map(b=>[b.type,b.x,b.y,b.z].map(n=>Math.round(n*100)).join(',')).join(';');
      const hash=Array.from(sites).reduce((v,c)=>Math.imul(v^c.charCodeAt(0),16777619)>>>0,2166136261);
      batch={count:actors.length,ms:elapsed,placements:hash};trigger=frameNo;
    } return actors;
  };
  m.render=(...args)=>{
    if(frameNo!==trigger || !profile)return originalRender(...args);
    const a=performance.now(),v=originalRender(...args);instanceMs+=performance.now()-a;return v;
  };
  const beforeGap=[],early=[],stamps=[],stable=[];
  if(door)input.interact=true;
  else {
    input.down.add('KeyW');
    const step=g.step.bind(g);
    g.step=dt=>{g.step=step;m.damage(window.lastGuard,1e8,g);step(dt);};
  }
  let last=await raf();
  for(;frameNo<110;frameNo++){
    frameProfile={};
    const a=performance.now(), sim=g.time;render();const cpu=performance.now()-a;
    if(!batch && !door && s.encounters.some(e=>e.name===window.room)){
      const tag=s.guide(g,{}).target?.storyWave ?? m.pool.find(b=>b.active && b.storyWave)?.storyWave;
      const roster=m.pool.filter(b=>b.active && b.storyWave===tag);
      if(roster.length!==100)throw Error('阶段未认领开局原队 '+roster.length);
      batch={count:roster.length,ms:0,placements:null,stationed:true};trigger=frameNo;
    }
    const now=await raf(),interval=now.time-last.time,rafInterval=now.stamp-last.stamp;last=now;
    if(!batch) {beforeGap.push(interval);if(frameNo>12)throw Error('未走入部署范围 '+[sample,p.x,p.z]);continue;}
    if(frameNo===trigger){work=cpu;triggerSim=g.time-sim;batch.frameProfile=frameProfile;input.down.clear();input.fire=true;}
    (frameNo-trigger<10?early:stable).push(interval);
    if(frameNo-trigger<10)stamps.push(rafInterval);
    if(stable.length===80)break;
  }
  if(!batch || !s.encounters.some(e=>e.spawned===window.batchSize && (door || e.name===window.room)))throw Error('没有整群');
  const q=(a,n)=>[...a].sort((a,b)=>a-b)[Math.ceil(n*a.length)-1];
  const round=n=>Math.round(n*10)/10;
  return {sample,residual:aliveBefore,gpu:herdGPU(),count:batch.count,placements:batch.placements,stationed:!!batch.stationed,
    warm:warmMs.length,warmCpuP95:round(q(warmMs,.95)),crossFrames:beforeGap.length,triggerSimMs:round(triggerSim*1000),
    deploy:round(batch.ms),triggerCPU:round(work),triggerFrame:round(early[0]),early:early.map(round),
    rafTimeline:stamps.map(round),warmCpuMax:round(Math.max(...warmMs)),
    earlyOver25:early.filter(x=>x>25).length,p50:round(q(stable,.5)),p95:round(q(stable,.95)),
    profile:profile?{...deployProfile,firstInstanceRender:instanceMs}:undefined,frameProfile:profile?batch.frameProfile:undefined};
}"""



def measure(browser, root, stage, residual, profile, warm):
    entry = root.resolve() / ('underground-lab' if stage in ('long-door','transport-door') else stage) / 'index.html'
    html = entry.read_text(encoding='utf-8')
    old_return = 'return { game, scene, camera, renderer, config: CONFIG, grid: GRID, nav };'
    old_entry = '    startLevel(definition, campaign, campaignStage);'
    old_frame = 'requested = requestAnimationFrame(animate);'
    assert html.count(old_return)==html.count(old_entry)==1 and old_frame in html
    html = html.replace(old_return, 'return {game,scene,camera,renderer,config:CONFIG,grid:GRID,nav,frame:animate,input};')
    html = html.replace(old_entry,'window.fixtureCourse=definition.story.route;window.run=startLevel(definition,campaign,campaignStage);').replace(old_frame,'requested=0;')
    if profile:
        hooks={
          'function trySite(x,z,i,ceiling) {':'function trySite(x,z,i,ceiling) {if(window.deploymentProbe)deployProfile.candidates=(deployProfile.candidates||0)+1;',
          'previous!==Infinity)extend();':'previous!==Infinity)deploymentPart("order",extend);',
          'order = orderedCells(field,anchor)':'order = deploymentPart("order",()=>orderedCells(field,anchor))',
          'cells:orderedCells(field,anchor)':'cells:deploymentPart("order",()=>orderedCells(field,anchor))',
          'level.hash.query(bounds.x0,bounds.z0,bounds.x1,bounds.z1,near).some(b=>overlaps(bounds,b))':'deploymentPart("collision",()=>level.hash.query(bounds.x0,bounds.z0,bounds.x1,bounds.z1,near).some(b=>overlaps(bounds,b)))',
          'occupied.query(bounds.x0,bounds.z0,bounds.x1,bounds.z1,near).some(b=>overlaps(bounds,b))':'deploymentPart("spacing",()=>occupied.query(bounds.x0,bounds.z0,bounds.x1,bounds.z1,near).some(b=>overlaps(bounds,b)))',
        }
        for before,after in hooks.items():
            html=html.replace(before,after)
    page=browser.new_page(viewport={'width':960,'height':540},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda err:errors.append(str(err)))
    try:
        page.add_init_script(SEED + '''\nwindow.deploymentPart=(k,fn)=>fn();
          window.deploymentSeed=n=>{Math.random=()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296);};''')
        page.route(entry.as_uri(),lambda route:route.fulfill(body=html,content_type='text/html'))
        page.goto(entry.as_uri())
        page.wait_for_function('!!window.run')
        page.add_script_tag(content=FIXTURE)
        page.evaluate('deploymentSeed(750077)')
        if profile: page.evaluate(PROBE)
        startup=page.evaluate(OPEN,[stage,warm,profile])
        page.evaluate(BEFORE,stage)
        result=page.evaluate(RECORD,[stage,residual,profile,warm])
        assert not errors,errors
        return dict(browser=browser.version,startup=startup,**result)
    finally:
        page.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,default=ROOT)
    parser.add_argument('--gpu',choices=['integrated','discrete'],default='integrated')
    parser.add_argument('--repeat',type=int,default=3)
    parser.add_argument('--stages',nargs='+',choices=[*ROOMS,'long-door','transport-door'],default=list(ROOMS))
    parser.add_argument('--warm',type=int,default=60)
    parser.add_argument('--residual',nargs='+',type=int,choices=(0,20),default=(0,20))
    args=parser.parse_args()
    flag='--force_low_power_gpu' if args.gpu=='integrated' else '--force_high_performance_gpu'
    with sync_playwright() as pw, pw.chromium.launch(channel=os.environ.get('GAME_TEST_BROWSER','chrome'),headless=True,args=[flag]) as browser:
        for stage in args.stages:
            for residual in args.residual:
                for i in range(args.repeat+1):
                    print(json.dumps(measure(browser,args.root,stage,residual,i==args.repeat,args.warm),ensure_ascii=False),flush=True)
