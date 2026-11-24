"""使用实际战前与暂停动画核对模型分档、首领名额和游玩帧内准备。"""
import argparse
import os
from pathlib import Path

from playwright.sync_api import sync_playwright
from campaign_browser import ROOT
from herd_performance import SEED

CHECK="""()=>{
  const {game:g,renderer,frame}=run,m=g.beasts,appearance=run.config.beasts.appearance;
  const {midStart,nearStart,legacyFarStart,farStart}=m,joints=m.detailParts.joints;
  const draws=[],navCalls=[],mainFrames=[];let menuWarm=false,t=0;
  const oldPrepare=m.detailParts.prepareMaterial.bind(m.detailParts);
  const oldNav=m.prepareSpawnRoutes.bind(m),draw=renderer.render.bind(renderer);
  m.detailParts.prepareMaterial=(...args)=>{menuWarm=true;try{return oldPrepare(...args);}finally{menuWarm=false;}};
  m.prepareSpawnRoutes=(...args)=>{navCalls.push(g.phase); return oldNav(...args);};
  renderer.render=(scene,...args)=>{
    if(menuWarm){const mesh=scene.children.find(n=>n.isInstancedMesh);
      if(!mesh||mesh.count)throw Error('虚拟队列未零实例');
      draws.push(mesh);
    }else if(scene===run.scene)mainFrames.push(g.phase);
    return draw(scene,...args);
  };
  function menuFrames(n){for(let i=0;i<n;i++)frame(t+=1000/60);}
  const groups=m.modelBatches;
  function check(name,enter,allowed){
    draws.length=0;enter();menuFrames(44);
    const got=new Set(draws),want=new Set(allowed);
    if(got.size!==want.size||draws.length!==want.size||[...got].some(x=>!want.has(x)))
      throw Error('菜单预热队列错误 '+[name,draws.length,want.size]);
    return draws.length;
  }
  if(g.phase!=='ready')throw Error('预热并非来自真实战前页');
  const legacy=check('原型',()=>{appearance.detailEnabled=false;},
    [...groups.slice(0,midStart),...groups.slice(legacyFarStart,farStart)].flat());
  const boss=check('仅首领近模',()=>{appearance.detailEnabled=true;appearance.nearBudgets[m.visualQuality]=0;appearance.detailSpecular=false;},
    [...groups.slice(midStart,nearStart),...groups.slice(nearStart+3,legacyFarStart),...groups.slice(farStart),
     ...joints.slice(3).map(j=>[j.head,j.tail])].flat());
  if(groups[nearStart+3][0].material.specularMap)throw Error('禁用的高光仍进入着色器');
  g.reset();g.phase='play';draws.length=0;
  appearance.nearBudgets[m.visualQuality]=4;appearance.detailSpecular=true;
  const playNav=navCalls.length;menuFrames(3);
  if(draws.length || navCalls.length-playNav!==3)throw Error('游玩期模型预热仍占用主动绘制或取消了寻路预算');
  g.phase='pause';
  const full=check('暂停精细',()=>{},
    [...groups.slice(midStart,legacyFarStart),...groups.slice(farStart),...joints.map(j=>[j.head,j.tail])].flat());
  if(!groups[nearStart+3][0].material.specularMap || !mainFrames.includes('ready') || !mainFrames.includes('pause'))
    throw Error('战前或暂停未运行真实场景绘制');
  return {legacy,boss,full,playNav:navCalls.slice(playNav,playNav+3),ready:mainFrames.filter(k=>k==='ready').length};
}"""

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    entry = args.root.resolve() / "underground-lab/index.html"
    html = entry.read_text(encoding="utf-8").replace(
        "    startLevel(definition, campaign, campaignStage);",
        "    window.run=startLevel(definition,campaign,campaignStage);",
    ).replace(
        "return { game, scene, camera, renderer, config: CONFIG, grid: GRID, nav };",
        "return {game,scene,camera,renderer,config:CONFIG,grid:GRID,nav,frame:animate,input};",
    )
    with sync_playwright() as pw, pw.chromium.launch(channel=os.getenv("GAME_TEST_BROWSER", "chrome")) as browser:
        page = browser.new_page(viewport={"width": 640, "height": 400})
        page.add_init_script(SEED + "\nwindow.requestAnimationFrame=()=>0;")
        page.route(entry.as_uri(), lambda route: route.fulfill(body=html, content_type="text/html"))
        page.goto(entry.as_uri())
        page.wait_for_function("!!window.run", polling=100)
        print(page.evaluate(CHECK), flush=True)
