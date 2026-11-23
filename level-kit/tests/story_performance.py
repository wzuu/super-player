"""在正式画面和实弹射击下测量钟楼突围与巴黎救援，可传入 main 构建目录作同机比较。"""
import json
import os
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright
from campaign_browser import ROOT


def measure(browser,root,stage,baseline=None):
    page=browser.new_page(viewport={'width':960,'height':540},device_scale_factor=1)
    page.add_init_script("""localStorage.setItem('super-player:preferences:v1',JSON.stringify({quality:'medium'}))""")
    file=root/stage/'index.html'
    html=file.read_text(encoding='utf-8').replace('    startLevel(definition, campaign, campaignStage);',
        '    window.run=startLevel(definition,campaign,campaignStage);')
    page.route(file.as_uri(),lambda r:r.fulfill(body=html,content_type='text/html'))
    page.goto(file.as_uri())
    page.locator('#start').click()
    page.wait_for_function("window.run?.game.phase==='play'")
    spawn=page.evaluate("""([stage,previous])=>{
      const g=run.game,s=g.story;
      function move(t){Object.assign(g.player,{x:t.x,y:t.y,z:t.z});run.nav.rebuild(t.x,t.z);}
      function tick(dt){g.time+=dt;g.objective.step(dt,g);s.step(dt,g);}
      if(previous){
        for(const b of g.beasts.pool)b.active=false;
        g.beasts.live=0;g.beasts.boss=null;g.beasts.spawnTime=300;
        for(const b of previous)if(!g.beasts.spawn(...b))throw Error('基线布置失败');
      }else {
        for(let i=0;i<1000;i++) {
          const t=s.target, target=stage==='paris-tower'?'defend':'breakout';
          if(t && s.stage!==target)move(t);
          if(s.stage===target){
            if(target==='defend')move({x:0,y:7.2,z:6.8});
            else move({x:8,y:0,z:-15});
            if((target==='defend' ? s.elapsed>32 && g.beasts.live===14 : g.beasts.live===9))break;
          }else if(['use','beacon'].includes(s.stage))s.interact(g);
          else for(const b of g.beasts.pool) if(b.active)g.beasts.damage(b,1e7,g);
          tick(.5);
          for(const b of g.beasts.pool)if(b.active && b.climbRoute)s.stepBeast(b,g,.48);
          if(i===999)throw Error('峰值队列未到位 '+s.stage+' '+g.beasts.live);
        }
      }
      move(stage==='paris-tower'?{x:0,y:7.2,z:6.8}:{x:8,y:0,z:-15});
      g.player.look.rotation.set(-.03,stage==='paris-tower'?-.18:.48,0,'YXZ');
      g.player.hurtDelay=60;g.weapon.reserve=300;
      g.beasts.refreshHash();
      return g.beasts.pool.filter(b=>b.active).map(b=>[b.type,b.x,b.z,b.y,b.yaw]);
    }""",[stage,baseline])
    page.mouse.down()
    try:
        stats=page.evaluate("""async()=>{
          const g=run.game, frame=()=>new Promise(requestAnimationFrame);
          for(let i=0;i<20;i++)await frame();
          const before=g.weapon.ammo, samples=[];let last=await frame(),min=g.beasts.live,max=min;
          for(let i=0;i<120;i++){
            const now=await frame();samples.push(now-last);last=now;
            min=Math.min(min,g.beasts.live);max=Math.max(max,g.beasts.live);
          }
          const gl=run.renderer.getContext(), ext=gl.getExtension('WEBGL_debug_renderer_info');
          samples.sort((a,b)=>a-b);
          return {fps:+(1000*samples.length/samples.reduce((a,b)=>a+b,0)).toFixed(1),p50:samples[60],p95:samples[114],
              peak:max,min,ammo:[before,g.weapon.ammo],phase:g.phase,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
        }""")
    finally:
        page.mouse.up()
        page.close()
    assert stats['phase']=='play' and stats['ammo'][0]!=stats['ammo'][1],stats
    print(browser.version,stage,'基线' if baseline else '本版',json.dumps(stats,ensure_ascii=False),flush=True)
    return spawn


if __name__=='__main__':
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel=os.environ.get('GAME_TEST_BROWSER','chrome'))
        try:
            placements=measure(browser,ROOT,'rain-city')
            if sys.argv[1:]:measure(browser,Path(sys.argv[1]),'rain-city',placements)
            measure(browser,ROOT,'paris-tower')
        finally:browser.close()
