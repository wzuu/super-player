"""用实验室内四米机位检查四种近模，并对照前摇、受击、倒地和高光图。"""
import argparse
import os
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright
from campaign_browser import ROOT


SETUP = """type => {
  const {game:g,camera}=run,p=g.player,m=g.beasts,level=g.level;
  g.reset();g.phase='play';m.pool.forEach(b=>b.active=false);m.live=0;m.boss=null;
  const a=level.bossSpawn,b=m.spawn(type,a.x,a.z,a.y,-.52);
  if(!b) throw Error('首领房样板出生失败');
  // 从真实可通行的四米环带取一处无遮挡机位，用正式站姿眼高与相机。
  let found=false;
  for(let i=0;i<16;i++){
    const angle=.40+Math.PI*i/8, x=b.x+4*Math.sin(angle),z=b.z+4*Math.cos(angle);
    const y=level.surface(x,z,b.y+.47);
    if(Math.abs(y-b.y)>.5 || level.blocked(x,z,y,p.radius,p.height))continue;
    const from=camera.position.clone().set(x,y+p.eye,z),dir=from.clone().set(b.x,b.y+b.height*.57,b.z).sub(from);
    const length=dir.length();
    if(!level.visible(from,dir.divideScalar(length),length))continue;
    Object.assign(p,{x,y,z});p.look.position.copy(from);p.look.lookAt(b.x,b.y+b.height*.57,b.z);
    p.positionCamera(0); found=true;break;
  }
  if(!found)throw Error('找不到房内无遮挡机位');
  window.subject=b;window.coords=[b.x0,b.x1,b.z0,b.z1,b.radius,b.height];
  const menu=document.querySelector('#menu');if(menu.open)menu.close();
  document.querySelector('#hud').hidden=false;
  m.visualQuality='medium';
}"""

POSE = """pose=>{
  const {game:g,camera,composer,weaponPass}=run,b=subject,m=g.beasts;
  const t=4,fall=pose==='fall';
  run.config.beasts.appearance.detailSpecular=pose!=='plain';
  b.mode=pose==='windup'?'windup':'move';b.flash=pose==='hit'?.025:0;
  b.stride=1.3;b.blink=.6;
  if(fall) {
    if(b.fight)b.fight.stage=2;
    b.hp=1; m.damage(b,1e7,g);
    const c=m.corpses.find(c=>c.until>0);
    if(!c)throw Error('未产生倒地表现');
    c.until=t+run.config.beasts.appearance.fallTime*.45;
  }
  camera.updateMatrixWorld(true);m.render(.016,t,false);
  g.ui.update(0,g);g.weapon.render(0,g.player,g);weaponPass.enabled=true;composer.render(0);
  if(!fall && (!b.nearLOD || m.lodCounts.near!==1))throw Error('四米目标应选近模');
  m.bodyBounds(b);
  if(JSON.stringify(coords)!==JSON.stringify([b.x0,b.x1,b.z0,b.z1,b.radius,b.height]))throw Error('绘制改变碰撞');
  const form=b.type, parts=m.detailParts.joints[form], matrix=camera.matrix.clone();
  parts.head.getMatrixAt(0,matrix);
  return matrix.toArray();
}"""


def review(output):
    file=ROOT/'underground-lab/index.html'
    html=file.read_text(encoding='utf-8')
    entry='    startLevel(definition, campaign, campaignStage);'
    fields='return { game, scene, camera, renderer, config: CONFIG, grid: GRID, nav };'
    assert html.count(entry)==html.count(fields)==1
    html=html.replace(entry,'    window.run=startLevel(definition, campaign, campaignStage);').replace(
        fields,'return {game,camera,composer,weaponPass,config:CONFIG};')
    with sync_playwright() as pw, pw.chromium.launch(channel=os.environ.get('GAME_TEST_BROWSER','chrome'),headless=True) as browser:
        page=browser.new_page(viewport={'width':640,'height':400},device_scale_factor=1)
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('console',lambda msg:errors.append(msg.text) if msg.type=='error' else None)
        page.add_init_script("""window.requestAnimationFrame=()=>1;
          Element.prototype.requestPointerLock=()=>{throw Error('近模检查不使用系统鼠标');};
          let seed=76;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
          localStorage.setItem('super-player:preferences:v1',JSON.stringify({quality:'medium',steady:true,muted:true}));""")
        page.route(file.as_uri(),lambda route:route.fulfill(body=html,content_type='text/html'))
        page.goto(file.as_uri())
        page.wait_for_function('!!window.run',polling=50)
        poses=['rest','plain','windup','hit','fall']
        names=['Swarm','Charger','Spitter','Boss']
        columns=poses
        for candidate in ('msyh.ttc','NotoSansCJK-Regular.ttc'):
            try:
                font=ImageFont.truetype(candidate,15)
                names=['群袭体','冲撞体','喷吐体','首领']
                columns=['常态','关闭细节高光','攻击前摇','受击','倒地']
                break
            except OSError:
                font=ImageFont.load_default()
        sheet=Image.new('RGB',(400*len(poses),272*4),'#151922')
        draw=ImageDraw.Draw(sheet)
        for index,name in enumerate(names):
            page.evaluate(SETUP,index)
            for col,pose in enumerate(poses):
                matrix=page.evaluate(POSE,pose)
                frame=Image.open(BytesIO(page.screenshot())).convert('RGB')
                if pose=='rest':
                    rest=frame;rest_matrix=matrix
                elif pose=='plain':
                    delta=ImageChops.difference(rest,frame)
                    assert delta.getbbox(),(name,'细节高光无变化')
                else:
                    assert matrix!=rest_matrix,(name,pose,'头部姿势未变化')
                frame.thumbnail((400,250));sheet.paste(frame,(col*400,index*272))
                draw.text((col*400+5,index*272+251),name+' / '+columns[col],font=font,fill='#ffffff')
            print('PASS 4 m',name,'rest / specular / windup / hurt / fall',flush=True)
        assert not errors,errors
        sheet.save(output,quality=91)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output',type=Path)
    review(parser.parse_args().output)
