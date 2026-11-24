"""地下实验室走廊、驻敌小房、反应堆的 Chromium 实际画面和 RAF 样本。"""
import argparse, json, os
from pathlib import Path
from playwright.sync_api import sync_playwright

from campaign_browser import ROOT as root
args = argparse.ArgumentParser()
args.add_argument('--screenshots', type=Path, help='将三个取景点的正常游戏画面保存到指定目录')
opts = args.parse_args()
setup = """name => {
  const {game:g,nav}=run,{story:s,player:p,beasts:m}=g;
  document.querySelector('#mission-mode').value='classic';g.reset();g.phase='play';
  const at=q=>{Object.assign(p,{x:q.x,y:q.y,z:q.z});nav.rebuild(p.x,p.z);};
  let cold=0;
  for(let turn=0;turn<90;turn++){
    if(s.stage==='boss' && name==='reactor')break;
    if(s.stage==='fight' && (['hall','room'].includes(name) ||
        (name==='overlap' && s.encounters.length===3)))break;
    if(s.target)at(s.target);
    if(s.stage==='use'){const begin=performance.now();s.interact(g);cold=Math.max(cold,performance.now()-begin);}
    else for(const b of m.pool)if(b.active && b.storyWave &&
        (name!=='overlap' || ['安保室','配电房'].includes(b.sectionRoom)))m.damage(b,1e7,g);
    g.time+=.3;m.releaseSplits(g);s.step(.3,g);
  }
  if(name==='overlap'){
    at({x:22.05,y:0,z:-27});g.encounter.interact(g);g.encounter.update(g,1);
    if(m.live<337)throw Error('三场残敌与可选档案室未全部进场 '+m.live);
  }
  const coords = {overlap:[22,-27,38,-27],hall:[0,51,0,34],room:[-9,32,-20,33],reactor:[1,-57,1.5,-65]}[name];
  at({x:coords[0],y:g.level.base(coords[0],coords[1]),z:coords[1]});
  p.look.rotation.set(-.025,Math.atan2(p.x-coords[2],p.z-coords[3]),0,'YXZ');p.positionCamera(0);
  document.querySelector('#menu').hidden=true;g.ui.nodes.hud.hidden=true;
  const gl=run.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
  run.frame(performance.now());
  return {browser:navigator.userAgent,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
    stage:s.stage,live:m.live,coldMs:+cold.toFixed(2),visible:m.visibility.stats.bodies};
}"""
sample="""()=>new Promise(resolve=>{
  const deltas=[],visible=[];let last=0,warm=30;
  const step=now=>{
    run.frame(now);
    if(warm>0)warm--;else if(last){deltas.push(now-last);visible.push(run.game.beasts.visibility.stats.bodies);}
    last=now;
    if(deltas.length<150){requestAnimationFrame(step);return;}
    deltas.sort((a,b)=>a-b);visible.sort((a,b)=>a-b);
    resolve({frames:deltas.length,fps:+(1000*deltas.length/deltas.reduce((a,b)=>a+b,0)).toFixed(2),
       medianMs:+deltas[75].toFixed(2),p95Ms:+deltas[142].toFixed(2),p99Ms:+deltas[148].toFixed(2),visibleMedian:visible[75]});
  };requestAnimationFrame(step);
})"""
file=root/'underground-lab/index.html'
html=file.read_text(encoding='utf8').replace('    startLevel(definition, campaign, campaignStage);',
        '    window.run=startLevel(definition,campaign,campaignStage);').replace(
        'return { game, scene, camera, renderer, config: CONFIG, grid: GRID, nav };',
        'return {game,scene,camera,renderer,config:CONFIG,grid:GRID,nav,frame:animate};').replace(
        'requested = requestAnimationFrame(animate);','requested = 0;')
with sync_playwright() as pw,pw.chromium.launch(channel=os.getenv('GAME_TEST_BROWSER','chrome'),headless=True) as browser:
  for mode in ['hall','room','overlap','reactor']:
    page=browser.new_page(viewport={'width':960,'height':540},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.add_init_script("""localStorage.setItem('super-player:preferences:v1',JSON.stringify({quality:'medium',steady:true,muted:true}));
      let seed=5381;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
      Element.prototype.requestPointerLock=()=>{throw Error('画面采样无需锁定鼠标')};""")
    page.route(file.as_uri(),lambda route:route.fulfill(body=html,content_type='text/html'))
    page.goto(file.as_uri());page.wait_for_function('!!window.run')
    info=page.evaluate(setup,mode)
    if opts.screenshots:
      opts.screenshots.mkdir(parents=True,exist_ok=True)
      page.screenshot(path=opts.screenshots/(mode+'.png'))
    info.update(page.evaluate(sample))
    assert not errors,errors
    print(mode,json.dumps(info,ensure_ascii=False),flush=True)
    page.close()
