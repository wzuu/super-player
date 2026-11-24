"""同机在正式机房/街区验证整群入场、接敌间隔、入口净空和峰值帧时间。

可选参数为含同版本 vendor 的旧构建根目录。同一房间先按固定击倒节奏跑完，
再从相同种子重进，在该版本战斗峰值采样实际 RAF。固定击倒仅用于控制负载。
"""
import argparse
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright
from campaign_browser import ROOT

ROOMS = {"underground-lab": ("检修运输廊", 0, -11), "rain-city": ("钟楼南街", 1, 8)}
SEED = """
  let lockOwner=null;
  Object.defineProperty(document,'pointerLockElement',{get:()=>lockOwner,configurable:true});
  Element.prototype.requestPointerLock=function(){
    lockOwner=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();
  };
  document.exitPointerLock=()=>{lockOwner=null;document.dispatchEvent(new Event('pointerlockchange'));};
  let seed=680067;
  Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  localStorage.setItem('super-player:preferences:v1',JSON.stringify({quality:'medium'}));
"""
BIRTHS = """()=>{
  const g=run.game,m=g.beasts,s=g.story;
  if(!m.spawnGroup)return;
  // 预驻发生于 reset；剧情给成员赋组后按身份保存当时的计时和玩家位置。
  const original=m.spawnGroup.bind(m),pending=[];
  window.measuredGroups=new Map();
  m.spawnGroup=(...args)=>{
    const x=g.player.x,z=g.player.z,begin=performance.now(),members=original(...args),ms=performance.now()-begin;
    if(members.length===100)pending.push({members,count:members.length,ms,
      gap:Math.min(...members.map(b=>Math.hypot(b.x-x,b.z-z)))});
    return members;
  };
  for(const key of ['reset','step','interact']){
    const fn=s[key].bind(s);s[key]=(...args)=>{
      const result=fn(...args);
      for(const row of pending.splice(0)){const tag=row.members[0].storyWave;
        if(tag)measuredGroups.set(tag,{count:row.count,ms:row.ms,gap:row.gap});}
      return result;
    };
  }
}"""
PREPARE = """([fallbackName,fallbackX,fallbackZ])=>{
  const room=window.fixtureCourse?.find(a=>a.kind==='fight' &&
    (fallbackName.startsWith('服务器')?a.name.startsWith('服务器'):a.name===fallbackName));
  const name=room?.name ?? fallbackName,x=room?.at[0] ?? fallbackX,z=room?.at.at(-1) ?? fallbackZ;
  const g=run.game,s=g.story,p=g.player,nav=run.nav;
  const move=t=>{Object.assign(p,{x:t.x,y:t.y,z:t.z});nav.rebuild(p.x,p.z);};
  for(let i=0;i<1800;i++) {
    if(s.target && !(room?.passage && s.stage==='fight' && s.target.z===z)) move(s.target);
    if(s.stage==='fight' && s.target.x===x && s.target.z===z) {
      p.look.rotation.set(-.04,0,0,'YXZ');
      p.hurtDelay=1000;
      window.room=name;
      const members=g.beasts.pool.filter(b=>b.active&&b.storyWave);
      window.initialGap=members.length?Math.min(...members.map(b=>Math.hypot(b.x-p.x,b.z-p.z))):Infinity;
      return;
    }
    const current=s.guide(g,{keyItem:'核心'})?.target?.storyWave;
    for(const b of g.beasts.pool)if(b.active && (!b.storyWave || current && b.storyWave===current))
      g.beasts.damage(b,1e7,g);
    g.time+=.5;g.beasts.releaseSplits(g);g.objective.step(.5,g);s.step(.5,g);
    if(s.stage==='use' && s.target){move(s.target);s.interact(g);}
  }
  throw Error('到不了样板 '+s.stage);
}"""
EXERCISE = """([expected,peakOnly])=>{
  const g=run.game,s=g.story,p=g.player,l=g.level,nav=run.nav,dt=.04;
  const eye=run.camera.position.clone(),dir=eye.clone(),r=nav.routeFor(0);
  let peak=0, maxGap=0, gap=0, first=null, nextKill=0, activeTime=0, nearestSpawn=Infinity;
  const spawn=g.beasts.spawnRegular.bind(g.beasts);
  g.beasts.spawnRegular=(type,x,z,y,...rest)=>{
    const b=spawn(type,x,z,y,...rest);
    if(b) {
      const f=nav.fields[type];
      if(l.blocked(x,z,y,b.radius,b.height)||f.dist[f.index(x,z)]<0)
        throw Error('入口不可通行 '+JSON.stringify({type,x,y,z,blocked:l.blocked(x,z,y,b.radius,b.height),ai:f.dist[f.index(x,z)],spawn:g.beasts.spawnFields?.get(type+':'+b.scale)?.dist[f.index(x,z)]}));
      nearestSpawn=Math.min(nearestSpawn,Math.hypot(x-p.x,z-p.z,y-p.y));
    }
    return b;
  };
  try {
    for(let t=0;t<270;t+=dt){
      g.step(dt);
      const log=s.encounters.find(e=>e.name===window.room);
      if(log?.clearedAt) {
        if(!Number.isFinite(nearestSpawn))nearestSpawn=window.initialGap;
        if(log.spawned!==expected)throw Error('实际入场数不符 '+log.spawned);
        const earlier=window.measuredGroups?.get(window.measuredTag);
        if(earlier)nearestSpawn=Math.min(nearestSpawn,earlier.gap);
        if(nearestSpawn<3.29)throw Error('在玩家脚下出生 '+nearestSpawn);
        return {spawned:log.spawned,peak,firstSeconds:+first.toFixed(2),
          longestGapSeconds:+maxGap.toFixed(2),durationSeconds:+activeTime.toFixed(2),
          nearestSpawnMetres:+nearestSpawn.toFixed(2)};
      }
      if(!log)continue;
      activeTime+=dt;
      const current=s.guide(g,{keyItem:'核心'})?.target?.storyWave;
      window.measuredTag??=current;
      const alive=g.beasts.pool.filter(b=>b.active&&b.storyWave && (!window.measuredTag||b.storyWave===window.measuredTag));
      peak=Math.max(peak,alive.length);
      eye.set(p.x,p.y+1.55,p.z);
      const visible=alive.filter(b=>{
        dir.set(b.x-eye.x,b.y+b.height*.6-eye.y,b.z-eye.z);
        const d=dir.length();return d>0 && l.visible(eye,dir.divideScalar(d),d);
      }).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z));
      if(!visible.length){
        gap+=dt;
        if(first!==null)maxGap=Math.max(gap,maxGap);
      }else {
        first??=activeTime;gap=0;
      }
      if(peakOnly && alive.length>=expected)return {peak};
      const target=visible[0];
      if(target && t>=nextKill){
        g.beasts.damage(target,1e7,g);
        nextKill=t+.75;
      }
      if(gap>1.5 && alive.length){
        // 向掩体另一侧走出射界，而非隔墙击倒。
        const b=alive[0];r.rebuild(b.x,b.z);const k=r.next(p.x,p.z);
        const dx=r.x(k)-p.x,dz=r.z(k)-p.z,d=Math.hypot(dx,dz)||1;
        l.move(p,dx/d*.12,dz/d*.12,.46);
      }
    }
    throw Error('战斗未完成 '+JSON.stringify({room:window.room,peak,stage:s.stage,remaining:s.remaining,alive:g.beasts.live,x:p.x,z:p.z}));
  }finally{g.beasts.spawnRegular=spawn;}
}"""
FRAMES = """async ()=>{
  const frame=()=>new Promise(requestAnimationFrame), g=run.game,gl=run.renderer.getContext();
  for(let i=0;i<12;i++)await frame();
  const samples=[];let last=await frame(),peak=0;
  for(let i=0;i<60;i++){const now=await frame();samples.push(now-last);last=now;peak=Math.max(peak,g.beasts.live);}
  samples.sort((a,b)=>a-b);
  const ext=gl.getExtension('WEBGL_debug_renderer_info');
  return {frameP50ms:+samples[30].toFixed(1),frameP95ms:+samples[57].toFixed(1),
    renderPeak:peak,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
}"""


def measure(browser, root, stage, expected):
    file = root / stage / "index.html"
    html = file.read_text(encoding="utf-8").replace("    startLevel(definition, campaign, campaignStage);",
        "    window.fixtureCourse=definition.story?.route;window.run=startLevel(definition,campaign,campaignStage);")
    result = {}
    for frames in (False, True):
        page=browser.new_page(viewport={"width":960,"height":540},device_scale_factor=1)
        errors=[]
        page.on("pageerror",lambda error:errors.append(str(error)))
        page.add_init_script(SEED)
        page.route(file.as_uri(),lambda r:r.fulfill(body=html,content_type="text/html"))
        try:
            page.goto(file.as_uri())
            page.wait_for_function("!!window.run")
            page.evaluate(BIRTHS)
            page.locator("#start").click()
            page.wait_for_function("window.run?.game.phase==='play'")
            sample = ROOMS[stage]
            if stage=="underground-lab" and sample[0] not in html:
                sample = ("服务器走廊",0,-11) if "服务器走廊" in html else ("服务器机房",28,-9)
            page.evaluate(PREPARE,sample)
            metrics=page.evaluate(EXERCISE,[result["peak"] if frames else expected,frames])
            if frames:
                result.update(page.evaluate(FRAMES))
            else:
                result.update(metrics)
            assert not errors,errors
        finally:
            page.close()
    print(browser.version,root.name,stage,json.dumps(result,ensure_ascii=False),flush=True)
    return result


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline",type=Path,help="#82 改动前的每场一百只版本构建根目录")
    args=parser.parse_args()
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER","chrome"))
        try:
            for stage in ROOMS:
                if args.baseline:measure(browser,args.baseline,stage,100)
                result=measure(browser,ROOT,stage,100)
                assert result["peak"] == result["spawned"] == 100,result
        finally:
            browser.close()
