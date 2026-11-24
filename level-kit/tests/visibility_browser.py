"""固定相机验证遮挡、倒影、预警与实际命中；后台运行，无需锁鼠或系统输入。"""
import os
import re
import sys

from campaign_browser import ROOT, sync_playwright
from herd_performance import FIXTURE, SEED


def stage(browser, name, indoor_count=None):
    page = browser.new_page(viewport={"width": 960, "height": 540})
    page.add_init_script("""requestAnimationFrame=()=>0;
      Element.prototype.requestPointerLock=()=>{throw Error('此测试不使用锁鼠');};""")
    path = ROOT / name / "index.html"
    entry = "    startLevel(definition, campaign, campaignStage);"
    html = path.read_text(encoding="utf-8")
    assert html.count(entry) == 1
    start = entry.replace("startLevel(", "window.run=startLevel(")
    if indoor_count:
        page.add_init_script(SEED)
        start = start.replace("startLevel(definition,", "startLevel({...definition,config:{...definition.config,beasts:{...definition.config?.beasts,capacity:192}}},")
        original = "return { game, scene, camera, renderer, config: CONFIG, grid: GRID, nav };"
        assert html.count(original) == 1
        html = html.replace(original,original.replace("nav };","nav, input };"))
    page.route(re.compile(r"/index\.html$"), lambda route: route.fulfill(
        body=html.replace(entry,start),content_type="text/html"))
    page.goto(path.as_uri())
    page.wait_for_function("!!window.run", polling=50)
    if indoor_count:
        page.add_script_tag(content=FIXTURE)
        page.evaluate("herdSetup", ["cull","indoor",indoor_count])
        return page
    page.evaluate("""() => {
      const {game:g,camera,config}=run;
      g.reset();g.phase='play';
      window.check=(value,why)=>{if(!value)throw Error(why)};
      window.frame=(eye,target)=>{
        camera.position.set(...eye);camera.lookAt(...target);
        g.beasts.render(0,g.time);return g.beasts.visibility;
      };
      window.clearActors=()=>{
        for(const b of g.beasts.pool)b.active=false;
        g.beasts.boss=null;g.beasts.live=0;g.beasts.refreshHash();
      };
    }""")
    return page


def lab(page):
    page.evaluate("""() => {
      const g=run.game,{level,beasts:m}=g;
      const mirrors=m.visibility.mirrors.map(m=>m.mesh);
      for(const mirror of mirrors)mirror.visible=false;
      const eye=[0,1.5,55], target=[0,1.5,49];
      const visible=()=>frame(eye,target).visible(...target,.25,.25,.25);
      const gate=level.viewOccluders.find(w=>w.x0<0 && w.x1>0 && Math.abs((w.z0+w.z1)/2-52)<.01);
      check(gate && gate.active && !visible(),'安检门闭合时遮挡');
      level.setBarrier(gate,null,false);check(visible(),'安检门打开后同格立即可见');
      level.setBarrier(gate,null,true);
      check(frame([4,1.7,37],[11,1.7,37]).visible(11,1.7,37,.4,.4,.4),'安检玻璃透视');
      check(frame([0,7,55],[0,7,49]).visible(0,7,49,.25,.25,.25),'从门顶上方可见');
      check(frame([-3.4,1.5,56],[-4,1.5,50]).visible(-4,1.5,50,3,.6,1),'贴墙探头时边缘保留');
      const at=[1.6,1.5,63.5], across=[1.6,1.5,56.5];
      check(!frame(at,across).visible(...across,.2,.3,.2),'气闸门叶闭合');
      Object.assign(g.player,{x:0,z:61,y:0});g.encounter.update(g,.03);
      check(level.entryDoor.active && frame(at,across).visible(...across,.2,.3,.2),'门叶开始滑动即保守放行');
      for(const mirror of mirrors)mirror.visible=true;
      clearActors();
    }""")
    print("PASS lab solid walls, glass, overhead, corner and moving door",flush=True)


def combat(page):
    result=page.evaluate("""() => {
      const {game:g,camera,config}=run,m=g.beasts,p=g.player;
      function play(enabled, renders) {
        let seed=124;const random=Math.random;
        Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
        try {
          config.beasts.visibility.enabled=enabled;
          g.reset();g.phase='play';clearActors();m.spawnTime=20;
          Object.assign(p,{x:0,y:0,z:58});p.positionCamera(0);
          const b=m.spawn(1,0,54,levelFloor(),Math.PI*.6);
          function levelFloor(){return g.level.surface(0,54,.5)}
          m.refreshHash();const steps=[];
          for(let i=0;i<6;i++){
            g.time+=.04;m.update(.04,p,g);
            camera.position.set(0,1.6,58);camera.lookAt(0,1.6,65);
            for(let j=0;j<renders;j++)m.render(.02,g.time);
            steps.push([b.yaw,b.x0,b.x1,b.mode,b.x,b.z]);
          }
          const mid=p.look.rotation, dy=b.y+b.height*.5-p.eye;
          mid.set(Math.atan2(dy,p.z-b.z),0,0,'YXZ');p.positionCamera(0);
          config.weapon.baseSpread=config.weapon.maxSpread=0;
          g.weapon.shoot(g);
          const hp=b.hp,end=g.weapon.end.toArray();
          check(hp < b.maxHP,'实际武器射线应命中');
          for(let i=0;i<24 && b.active;i++)g.weapon.shoot(g);
          check(!b.active && g.kills===1,'实际射击应完成击杀');
          return [steps,hp,end,g.performance.shots,g.performance.hits,g.kills,g.story.remaining];
        }finally{Math.random=random}
      }
      const baseline=play(false,1),culled=play(true,3);
      check(JSON.stringify(baseline)===JSON.stringify(culled),'不同摄像机提交次数改变模拟、命中或统计');
      return {ticks:culled[0].length,firstHit:culled[2],shots:culled[3],kills:culled[5]};
    }""")
    print("PASS facing, hit position, kill and encounter parity",result,flush=True)


def cold_grid(browser):
    for target in (96,160):
        page=stage(browser,"underground-lab",target)
        try:
            result=page.evaluate("""() => {
              const {game:g,camera}=run,m=g.beasts,v=m.visibility,centers=[];
              // 在安检走廊内从南向北看 z=20 隔墙的实体段，保留门洞和观察玻璃的可见性。
              camera.position.set(-7,1.65,25);camera.lookAt(-7,1.65,-15);
              // 记录一次真实提交中首次触达的每个格子，计时只重复原版候选墙列表的构建。
              v.cells.clear();
              const candidates=v.candidates;
              v.candidates=function(x,z){
                const size=this.cells.size,walls=candidates.call(this,x,z);
                if(this.cells.size!==size)centers.push([x,z]);
                return walls;
              };
              try{m.render(0,g.time)}finally{delete v.candidates}
              if(!centers.length || centers.length!==v.cells.size || !v.stats.occluded)
                throw Error('样板必须实际查询遮挡并形成冷缓存 '+JSON.stringify({keys:centers.length,...v.stats}));
              const references=[...v.cells.values()].reduce((total,walls)=>total+walls.length,0);
              const fill=()=>{for(const [x,z] of centers)v.candidates(x,z)};
              const rebuild=()=>{v.cells.clear();fill()};
              let tick=Infinity,prior=performance.now();
              for(let i=0;i<32;i++){
                let now=prior;
                while(now===prior)now=performance.now();
                tick=Math.min(tick,now-prior);prior=now;
              }
              for(let i=0;i<32;i++)rebuild();
              const singles=[],batches=[];
              for(let trial=0;trial<32;trial++){
                v.cells.clear();
                let start=performance.now();fill();singles.push(performance.now()-start);
                // 低于浏览器时钟量化间隔时，同时给出 128 次完整清空与重建的均摊值。
                start=performance.now();
                for(let i=0;i<128;i++)rebuild();
                batches.push((performance.now()-start)/128);
              }
              const round=value=>+value.toFixed(4);
              const stats=times=>{
                times.sort((a,b)=>a-b);
                return {median:round((times[15]+times[16])/2),p95:round(times[30])};
              };
              return {seed:750077,actors:m.live,occluded:m.visibility.stats.occluded,
                cells:centers.length,occluders:g.level.viewOccluders.length,references,
                tickMs:round(tick),singleMs:stats(singles),perRebuildBatchMs:stats(batches)};
            }""")
            assert result["actors"]==target,result
            print("PASS lab cold occlusion grid (32 single rebuilds; 32 means of 128)",result,flush=True)
        finally:
            page.close()


def mirror(page):
    page.evaluate("""() => {
      const {game:g,camera}=run,v=g.beasts.visibility;
      const mesh=v.mirrors[0].mesh;
      mesh.visible=true;mesh.updateWorldMatrix(true,false);
      const center=mesh.position.clone().setFromMatrixPosition(mesh.matrixWorld);
      const normal=center.clone().set(0,0,1).transformDirection(mesh.matrixWorld);
      camera.position.copy(center).addScaledVector(normal,3);camera.lookAt(center);
      const behind=center.clone().addScaledVector(normal,7);
      v.begin(camera);
      check(v.visible(behind.x,behind.y,behind.z,.15,.15,.15,true) && v.stats.reflectionKept===1,'主视野外倒影');
      mesh.visible=false;v.begin(camera);
      check(!v.visible(behind.x,behind.y,behind.z,.15,.15,.15),'关闭反射后恢复主视锥');
    }""")


def tower(page):
    page.evaluate("""() => {
      const {game:g,camera}=run,m=g.beasts;clearActors();
      const b=m.spawn(1,0,8,18,0);
      Object.assign(b,{mode:'windup',fx:0,fz:-1,chargeMarkLength:2,chargeMarkCount:8,chargeHeights:new Float32Array(9).fill(18)});
      frame([0,19,0],[0,19,-10]);
      check(!b.submitBody && m.chargeMarks.count>0,'冲锋者在身后，跨入当前视野的危险线应保留');
      b.climbRoute=[[-12.6,4.8,11],[-9.8,9,7.7]];b.climbPoint=0;
      Object.assign(b,{x:-16,y:2.4,z:14});
      frame([-5,13,10],[-16,3,14]);check(b.submitBody,'塔上能看到斜梁的攀爬者');
      g.time+=.04;m.update(.04,g.player,g);
      check(b.y>2.4 && Number.isFinite(b.yaw),'跨层移动应继续');
    }""")
    print("PASS tower climbing and charge telegraph independent of body visibility",flush=True)


if __name__ == "__main__":
    grid_only="--grid-only" in sys.argv
    with sync_playwright() as pw:
        args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] if grid_only else []
        browser=pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER","chrome"),headless=True,args=args)
        try:
            for name in (() if grid_only else ("underground-lab","rain-city","haunted-midway","paris-tower")):
                page=stage(browser,name)
                try:
                    if name=="underground-lab":
                        lab(page);combat(page)
                    elif name=="paris-tower": tower(page)
                    else:
                        mirror(page)
                        print("PASS reflected-only target",name,flush=True)
                finally: page.close()
                if name=="underground-lab": cold_grid(browser)
            if grid_only: cold_grid(browser)
        finally: browser.close()
