"""用独立离线入口核对门禁、环境周期与最大普通战区的真实呈现时间。"""
import json
import os
from playwright.sync_api import sync_playwright
from campaign_routes_browser import ROOT, scenario_page


def verify(browser,stage):
    with scenario_page(browser,ROOT,stage,6107) as page:
        result=page.evaluate("""async id=>{
          const {game:g,definition,nav,config,renderer,scene}=run;
          const {story:s,player:p,level:l}=g,station=id==='orbital-brood-ring';
          const locks=definition.story.walls, route=definition.story.route;
          const move=([x,z])=>{Object.assign(p,{x,z,y:l.base(x,z)});nav.rebuild(x,z);};
          const tick=(dt=.05)=>{g.time+=dt;g.beasts.releaseSplits(g);s.step(dt,g);};
          g.reset();g.phase='play';
          // 初始、缺钥匙和缺联锁时实际门体挡住玩家胶囊和弹道。
          for(const [id,x,z,w] of locks) {
            if(!s.doorStates[id] || !l.blocked(x,z,l.base(x,z),p.radius,p.height))
              throw Error('门体缺少碰撞 '+id);
            const dir=run.camera.position.clone().set(w<1?1:0,0,w<1?0:1);
            const origin=dir.clone().multiplyScalar(-1).add(run.camera.position.clone().set(x,l.base(x,z)+1,z));
            if(l.visible(origin,dir,2))throw Error('关闭的门漏过射线 '+id);
          }
          for(const station of route.filter(t=>t.terminalKind)) {
            move(station.at);s.interact(g);
            if(s.recoveryStage!==0 || g.beasts.boss)throw Error('能绕过任务前置');
          }
          const e=g.encounter, events=[];
          if(station) {
            for(const [t,x,z] of [[28,-40,-3],[78,-60,-13]]) {
              move([x,z]);g.time=t;e.update(g,.2);
              if(e.phase!=='open' || Math.hypot(x-p.x,z-p.z)<.1)throw Error('泄压缺少实际位移');
              const entry=[p.x,p.z];
              // 从破口一侧沿连通甲板逆着吸力走回内侧。碰撞和吸力同时作用。
              for(let i=0;i<50;i++){l.move(p,.11,0,.46);e.update(g,.02);}
              if(p.x-entry[0]<2.5)throw Error('泄压期间无法撤向内侧');
              events.push([e.status.title,+(p.x-entry[0]).toFixed(2)]);
            }
          } else {
            const floor=at=>l.surface(...at,l.base(...at)+.46);
            const low=floor([-60,18]),high=floor([50,-28]);
            if(low!==-3.6 || high<2)throw Error('上下层高程异常');
            for(const t of [65,72,86]){
              g.time=t;e.update(g);
              events.push([e.phase,e.beastSpeedScale,e.beastDamageScale]);
            }
            if(events.map(a=>a[0]).join()!=='warning,active,calm' || events[1][1]<=1 || events[1][2]<=1)
              throw Error('血月未按期切换');
          }
          g.reset();g.phase='play';
          for(let i=0;i<240 && s.encounters.length<2;i++) {
            if(s.target)move([s.target.x,s.target.z]);
            if(s.stage==='use')s.interact(g);
            else if(s.stage==='fight'){
              const wanted=route.find(t=>t.kind==='fight').requiredRoom;
              for(const b of g.beasts.pool)if(b.active && b.sectionRoom===wanted)g.beasts.damage(b,1e7,g);
            }
            tick(.2);
          }
          const second=route.filter(t=>t.kind==='fight')[1];
          const team=g.beasts.pool.filter(b=>b.active && s.isCurrentGuard(b));
          if(team.length!==second.count || g.beasts.boss)throw Error('最大战区未集结');
          const site=station?[-42,3]:[27,-6];move(site);p.look.rotation.set(-.06,0,0,'YXZ');
          const samples=[],frame=()=>new Promise(requestAnimationFrame);
          const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
          const initial=g.beasts.live;
          for(let i=0;i<42;i++){
            const begin=performance.now();
            g.step(.025);window.renderScenarioFrame(0);
            await frame();
            if(i>=6)samples.push(performance.now()-begin);
          }
          samples.sort((a,b)=>a-b);
          g.time+=20;p.hurtDelay=0;p.hurt(10000,g);
          if(g.phase!=='fail')throw Error('受致死伤害后未失败');
          g.reset();
          if(s.recoveryStage!==0 || !Object.values(s.doorStates).every(Boolean) || g.kills!==0 || g.loot.length)
            throw Error('失败重开后门禁或掉落残留');
          return {events,initial,spawned:team.length,p50:samples[18],p95:samples[34],frames:samples.length,
                  viewport:[innerWidth,innerHeight],buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],
                  gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
        }""",stage)
        print(browser.version,stage,json.dumps(result,ensure_ascii=False),flush=True)


if __name__=='__main__':
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel=os.getenv('GAME_TEST_BROWSER','chrome'),headless=True)
        try:
            for stage in ('orbital-brood-ring','moonlit-stained-glass-keep'):verify(browser,stage)
        finally:browser.close()
