"""核对打包后的真实关卡内的驻防、开门失败/重试、侧路、冲刺、折返及重开。
--root 指定含独立入口及 vendor 的构建根目录。新实验室第一扇隔离门以 --stages long-door 验证。
"""
import argparse
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from campaign_browser import ROOT
from deployment_performance import BEFORE
from herd_performance import FIXTURE, SEED


CHECK = """([stage,mode])=>{
  const {game:g,nav,camera,input}=run,{story:s,beasts:m,player:p,level:l}=g,door=stage!=='rain-city';
  const last=window.lastGuard,oldKills=g.kills;
  const waiting=door?[]:m.pool.filter(b=>b.active && b.storyWave && b.storyWave!==last.storyWave);
  const old=s.encounters.length, target=door?s.target:roomTarget;
  // 面向任务入口，侧路从不同的可通行方位进入，同一片玻璃不会因玩家转向而成为遮挡。
  const route=nav.playerRoute(),firstAngle=mode==='side'?Math.PI/2:0;
  let from=null,yaw=0;
  for(let i=0;i<48;i++){
    const angle=firstAngle+i*Math.PI/24,dx=Math.sin(angle),dz=Math.cos(angle);
    const radius=door?1.7:13.25;
    const pos={x:target.x+dx*radius,z:target.z+dz*radius};
    pos.y=l.foot(pos.x,pos.z,target.y+.46,p.radius);
    const toward={x:pos.x-dx*.65,y:pos.y,z:pos.z-dz*.65};
    if(!l.blocked(pos.x,pos.z,pos.y,p.radius,p.height) && route.canWalk(pos,toward)){
      from=pos;yaw=angle;break;
    }
  }
  if(!from)throw Error('入口找不到可行走的测试位置 '+mode);
  Object.assign(p,from,{fallPeak:from.y});p.look.rotation.set(-.025,yaw,0,'YXZ');
  p.positionCamera(0);camera.updateMatrixWorld();nav.rebuild(p.x,p.z);
  input.clear();p.hurtDelay=Infinity;
  const eye=camera.position.clone(), point=eye.clone(), ray=eye.clone();
  const previousView=camera.projectionMatrix.clone();let occluders;
  function capture(){
    p.positionCamera(0);camera.updateMatrixWorld();eye.copy(camera.position);
    previousView.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    occluders=l.viewOccluders.filter(b=>b.active!==false);
  }
  capture();
  // 投影只使用前帧实际相机。遮挡只取登记过的不透明盒，不把观察玻璃当成视觉遮挡。
  function oldSight(x,y,z){
    point.set(x,y,z);ray.copy(point).sub(eye);point.applyMatrix4(previousView);
    if(Math.abs(point.x)>1 || Math.abs(point.y)>1 || Math.abs(point.z)>1)return false;
    return !occluders.some(box=>{
      let lo=0,hi=1;
      for(const axis of ['x','y','z']){
        const o=eye[axis], d=ray[axis], a=box[axis+'0'],e=box[axis+'1'];
        if(Math.abs(d)<1e-9){if(o<a||o>e)return false;continue;}
        const t=(a-o)/d,u=(e-o)/d;
        lo=Math.max(lo,Math.min(t,u));hi=Math.min(hi,Math.max(t,u));
        if(lo>=hi)return false;
      }return true;
    });
  }
  const current=m.spawnGroup.bind(m);let births=0,batch=null,near=Infinity,priorView=null,exposedBodies=null;
  m.spawnGroup=(entries,options)=>{
    const team=current(entries,options);
    if(entries.length===window.batchSize && team.length){
      births++;batch=team;
      priorView=team.filter(b=>oldSight(b.x,b.y+b.height*.55,b.z)).length;
      // 检查头部、底部和四面外缘，防止中心点已被挡住但角色仍在门缝处弹出。
      exposedBodies=team.filter(b=>[b.x0,b.x,b.x1].some(x=>[b.z0,b.z,b.z1].some(z=>
        [b.y0,b.y+b.height*.55,b.y1].some(y=>oldSight(x,y,z))))).length;
      for(const [i,b] of team.entries()){
        near=Math.min(near,Math.hypot(Math.max(0,b.x0-p.x,p.x-b.x1),Math.max(0,b.z0-p.z,p.z-b.z1))-p.radius);
        if(l.blocked(b.x,b.z,b.y,b.radius,b.height))throw Error('出生实体碰墙');
        if(team.slice(0,i).some(c=>b.x0<c.x1&&b.x1>c.x0&&b.z0<c.z1&&b.z1>c.z0&&
          b.y0<c.y1-.025&&b.y1>c.y0+.025))throw Error('房间成员初始重叠');
      }
    }
    return team;
  };
  try{
    if(door){
      if(mode==='retry'){
        const names=Object.keys(s.doorStates).filter(k=>s.doorStates[k]),journal=s.encounters.length,original=m.spawnGroup;
        m.spawnGroup=(entries,opts)=>entries.length===window.batchSize ? [] : original(entries,opts);
        input.interact=true;g.step(1/60);m.spawnGroup=original;
        if(s.encounters.length!==journal || !names.every(k=>s.doorStates[k]) || s.stage!=='use')
          throw Error('摆不下一队时已开门或推进任务');
        g.time+=.55;
      }
      input.down.add('KeyW');if(mode==='sprint')input.down.add('ShiftLeft');
      for(let i=0;i<5;i++)g.step(1/60);
      if(Math.hypot(p.x-from.x,p.z-from.z)<.05)throw Error('玩家未真正走近隔离门');
      input.down.clear();capture();
      input.interact=true;g.step(1/60);
      if(!batch || births!==1 || near<run.config.beasts.safeSpawnGap-.001)throw Error('开门同一输入未安全部署整群');
    }else{
      if(waiting.length!==100)throw Error('街区后段在广场清场前未驻防 '+waiting.length);
      const victim=waiting.find(b=>!b.affixes?.includes('split'));m.damage(victim,1e8,g,'weapon');
      m.damage(last,1e8,g,'weapon');
      if(mode==='sprint'){input.down.add('KeyW');input.down.add('ShiftLeft');}
      g.step(1/60);
      if(births || waiting.filter(b=>b.active).length!==99 || g.kills!==oldKills+2)
        throw Error('阶段切换时未来驻军提前击杀的成员被重生或重复计数');
      batch=waiting;priorView=waiting.filter(b=>oldSight(b.x,b.y+b.height*.55,b.z)).length;
    }
    const record=s.encounters[old];
    if(!record || record.spawned!==window.batchSize)throw Error('战区登记人数与配置不符');
    if(mode==='return'){
      const surviving=batch.filter(b=>b.active);
      for(const turn of [yaw+Math.PI,yaw]){
        p.look.rotation.y=turn;input.down.clear();input.down.add('KeyW');
        for(let i=0;i<16;i++)g.step(1/60);
      }
      if(s.encounters.length!==old+1 || surviving.some(b=>!b.active))throw Error('返身重新触发或清掉驻军');
    }
    if(mode==='restart'){
      const fresh=s.encounters;m.spawnGroup=current;
      g.reset();g.phase='play';
      if(s.encounters===fresh || (door && s.encounters.some(e=>e.name===room)) ||
        (door && !Object.values(s.doorStates).some(Boolean)))throw Error('重开保留上一局的遭遇或已开的门');
      if(!door && m.pool.filter(b=>b.active && b.storyWave).length!==200)throw Error('重开没有重新驻防两街');
    }
    if(door && fixtureCourse.find(a=>a.kind==='fight' && a.name===room)?.parts && exposedBodies)
      throw Error('开门前可见新成员的身体外缘 '+exposedBodies);
    return {mode,births:door?births:0,original:batch.length,priorViewCentres:priorView,priorViewBodies:exposedBodies,
      minGap:door?Math.round(near*100)/100:null};
  }finally{m.spawnGroup=current;}
}"""


def verify(browser,root,stage):
    file=root.resolve()/('underground-lab' if stage=='long-door' else stage)/'index.html'
    old='    startLevel(definition, campaign, campaignStage);'
    data=file.read_text(encoding='utf8').replace(old,'    window.fixtureCourse=definition.story.route;window.run=startLevel(definition,campaign,campaignStage);')
    data=data.replace('return { game, scene, camera, renderer, config: CONFIG, grid: GRID, nav };',
                      'return {game,scene,camera,renderer,config:CONFIG,grid:GRID,nav,input};')
    page=browser.new_page()
    try:
        page.add_init_script(SEED+'\nwindow.requestAnimationFrame=()=>0;')
        page.route(file.as_uri(),lambda route:route.fulfill(body=data,content_type='text/html'))
        page.goto(file.as_uri());page.wait_for_function('!!window.run',polling=100)
        page.add_script_tag(content=FIXTURE)
        for path in ['walk','sprint','side','return','retry','restart']:
            page.evaluate('herdSetup',['final','street' if stage=='rain-city' else 'machine-room',100])
            page.evaluate(BEFORE,stage)
            print(stage,page.evaluate(CHECK,[stage,path]),flush=True)
    finally:
        page.close()


if __name__=='__main__':
    args=argparse.ArgumentParser(description=__doc__)
    args.add_argument('--root',type=Path,default=ROOT)
    args.add_argument('--stages',nargs='+',default=['underground-lab','rain-city'])
    opts=args.parse_args()
    with sync_playwright() as pw,pw.chromium.launch(channel=os.getenv('GAME_TEST_BROWSER','chrome'),headless=True) as b:
        for stage in opts.stages:verify(b,opts.root,stage)
