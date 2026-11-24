"""在正式画面和实弹射击下测量钟楼突围与巴黎救援，可传入 main 构建目录作同机比较。"""
import argparse
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from campaign_browser import ROOT


def control(browser):
    page=browser.new_page(viewport={'width':960,'height':540},device_scale_factor=1)
    samples=page.evaluate("""async()=>{
      const frame=()=>new Promise(requestAnimationFrame);
      const canvas=document.createElement('canvas');canvas.width=816;canvas.height=459;
      document.body.append(canvas);
      const gl=canvas.getContext('webgl2',{powerPreference:'high-performance'});
      if(!gl)throw Error('WebGL 2 control unavailable');
      const ext=gl.getExtension('WEBGL_debug_renderer_info');
      const gpu=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
      const result={gpu};
      for(const name of ['idle','clear']){
        for(let i=0;i<20;i++)await frame();
        let first=await frame(),last=first;
        for(let i=0;i<120;i++){
          if(name==='clear'){gl.clearColor((i%2)/20,.05,.06,1);gl.clear(gl.COLOR_BUFFER_BIT);}
          last=await frame();
        }
        result[name]=Math.round(1200000/(last-first))/10;
      }
      return result;
    }""")
    page.close()
    print(browser.version,'呈现对照 FPS',json.dumps(samples,ensure_ascii=False),flush=True)


def measure(browser,root,stage,label='本版',gpu_sync=False):
    page=browser.new_page(viewport={'width':960,'height':540},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('console',lambda message:errors.append(message.text) if 'Shader Error' in message.text else None)
    page.add_init_script("""localStorage.setItem('super-player:preferences:v1',JSON.stringify({quality:'medium'}));
        let seed=4515; Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);""")
    file=root/stage/'index.html'
    html=file.read_text(encoding='utf-8').replace('    startLevel(definition, campaign, campaignStage);',
        '    window.run=startLevel(definition,campaign,campaignStage);')
    page.route(file.as_uri(),lambda r:r.fulfill(body=html,content_type='text/html'))
    page.goto(file.as_uri())
    page.locator('#start').click()
    page.wait_for_function("window.run?.game.phase==='play'")
    spawn=page.evaluate("""stage=>{
      const g=run.game,s=g.story;
      function move(t){Object.assign(g.player,{x:t.x,y:t.y,z:t.z});run.nav.rebuild(t.x,t.z);}
      function tick(dt){g.time+=dt;g.objective.step(dt,g);s.step(dt,g);}
      for(let i=0;i<1000;i++) {
        const t=s.target, target=stage==='paris-tower'?'defend':'breakout';
        if(t && s.stage!==target)move(t);
        if(s.stage===target){
          if(target==='defend')move({x:0,y:7.2,z:6.8});
          else move({x:8,y:0,z:-15});
          const expected = g.beasts.spawnGroup ? run.config.beasts.encounterSize : (target==='defend' ? 14 : 9);
          if(g.beasts.live===expected && (target!=='defend' || s.elapsed>32))break;
        }else if(['use','beacon'].includes(s.stage))s.interact(g);
        else if(s.stage!=='countdown')for(const b of g.beasts.pool) if(b.active)g.beasts.damage(b,1e7,g);
        tick(.5);
        for(const b of g.beasts.pool)if(b.active && b.climbRoute)s.stepBeast(b,g,.48);
        if(i===999)throw Error('峰值队列未到位 '+s.stage+' '+g.beasts.live);
      }
      move(stage==='paris-tower'?{x:0,y:7.2,z:6.8}:{x:8,y:0,z:-15});
      g.player.look.rotation.set(-.03,stage==='paris-tower'?-.18:.48,0,'YXZ');
      g.player.hurtDelay=60;g.weapon.reserve=300;
      g.beasts.refreshHash();
      const alive=g.beasts.pool.filter(b=>b.active);
      window.sampleWave=alive.find(b=>b.storyWave)?.storyWave;
      return alive.filter(b=>b.storyWave===window.sampleWave).length;
    }""",stage)
    page.mouse.down()
    try:
        stats=page.evaluate("""async gpuSync=>{
          const g=run.game, gl=run.renderer.getContext(), frame=()=>new Promise(requestAnimationFrame);
          for(let i=0;i<20;i++)await frame();
          const crowd=run.scene.children.find(m=>m.isInstancedMesh && m.material.color?.getHex()===0x373448);
          const matrixVersion=crowd?.instanceMatrix.version;
          const before=g.weapon.ammo, samples=[], calls=[],triangles=[];let last=await frame(),min=g.beasts.live,max=min,missionPeak=0;
          const first=last;
          while(samples.length<120 || (gpuSync && last-first<2500)){
            const now=await frame();samples.push(now-last);last=now;
            if(gpuSync)gl.finish();
            min=Math.min(min,g.beasts.live);max=Math.max(max,g.beasts.live);
            missionPeak=Math.max(missionPeak,g.beasts.pool.filter(b=>b.active&&b.storyWave===window.sampleWave).length);
            calls.push(run.renderer.info.render.calls);triangles.push(run.renderer.info.render.triangles);
          }
          const ext=gl.getExtension('WEBGL_debug_renderer_info');
          samples.sort((a,b)=>a-b);
          return {fps:+(1000*samples.length/(last-first)).toFixed(1),frames:samples.length,
              p50:samples[Math.floor(samples.length*.5)],p95:samples[Math.floor(samples.length*.95)],
              peak:max,min,missionPeak,ammo:[before,g.weapon.ammo],phase:g.phase,buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],
              crowd:crowd?.count,matrixUpdates:crowd?crowd.instanceMatrix.version-matrixVersion:undefined,
              peakDraws:Math.max(...calls),peakTriangles:Math.max(...triangles),
              gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
        }""",gpu_sync)
    finally:
        page.mouse.up()
        page.close()
    assert not errors,errors
    assert stats['phase']=='play' and stats['ammo'][0]!=stats['ammo'][1],stats
    assert 0 < stats['missionPeak'] <= spawn, (stats,spawn)
    if stage=='paris-tower':assert stats['crowd']==96,stats
    print(browser.version,stage,label,json.dumps(stats,ensure_ascii=False),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('main',nargs='?',type=Path)
    parser.add_argument('--tower-before',type=Path,help='含优化前 paris-tower/index.html 的构建根目录')
    parser.add_argument('--control',action='store_true',help='在同一浏览器进程测空闲和 WebGL 清屏的呈现上限')
    parser.add_argument('--headed',action='store_true',help='用有窗口的 Chrome 验证前台呈现')
    parser.add_argument('--gpu-throughput',action='store_true',help='诊断用：解除浏览器帧率限制并逐帧等待 GPU，以区别渲染吞吐与屏幕呈现')
    args=parser.parse_args()
    with sync_playwright() as pw:
        launch_args=['--disable-frame-rate-limit','--disable-gpu-vsync'] if args.gpu_throughput else []
        browser=pw.chromium.launch(channel=os.environ.get('GAME_TEST_BROWSER','chrome'),headless=not args.headed,args=launch_args)
        try:
            if args.gpu_throughput:print('GPU 吞吐诊断（解除同步，不代表显示帧率）',flush=True)
            if args.control:control(browser)
            measure(browser,ROOT,'rain-city',gpu_sync=args.gpu_throughput)
            if args.main:measure(browser,args.main,'rain-city',label='main 基线',gpu_sync=args.gpu_throughput)
            if args.tower_before:measure(browser,args.tower_before,'paris-tower',label='优化前',gpu_sync=args.gpu_throughput)
            measure(browser,ROOT,'paris-tower',gpu_sync=args.gpu_throughput)
        finally:browser.close()
