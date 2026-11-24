"""对照两个已打包的版本，在相同机位测量开镜枪模对中央画面的遮挡，并导出截图。"""
import argparse
import os
import re
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright
from campaign_browser import ROOT


def capture(browser, root, stage, weapon, size):
    width, height = size
    page = browser.new_page(viewport={"width": width, "height": height})
    page.add_init_script("""window.requestAnimationFrame=()=>1;
      let seed=319;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);""")
    source = (root / stage / "index.html").read_text(encoding="utf-8")
    for old, new in [
        ("    startLevel(definition, campaign, campaignStage);", "    window.run=startLevel(definition,campaign,campaignStage);"),
        ("return { game, scene, camera, renderer, config:", "return { game, scene, camera, renderer, composer, environment, weaponPass, weaponCamera, config:"),
        ("resolveRifleSkin(practiceWeapon || campaign?.equippedSkin,", f"resolveRifleSkin('{weapon}',"),
    ]:
        assert source.count(old) == 1, old
        source = source.replace(old, new)
    page.route(re.compile(r"/index\.html$"), lambda route: route.fulfill(body=source, content_type="text/html"))
    try:
        page.goto((root / stage / "index.html").as_uri())
        page.wait_for_function("!!window.run", polling=100)
        page.evaluate("""stage => {
          const {game:g,camera,environment,weaponCamera}=run,w=g.weapon,p=g.player,m=g.beasts;
          g.reset();g.phase='play';
          m.pool.forEach(b=>b.active=false);m.live=0;m.hash.clear();
          if(stage==='underground-lab') Object.assign(p,{x:0,y:0,z:-16});
          p.look.rotation.set(-.055,0,0,'YXZ');
          Object.assign(p,{aiming:true,aimRequested:true,ads:1});
          p.positionCamera(0);
          for (const [type,x,z] of [[0,-1.30,-4.5],[1,0,-6],[0,1.32,-4.4]]) {
            m.spawn(type,p.x+x,p.z+z,g.level.base(p.x+x,p.z+z),Math.PI);
          }
          m.render(0,3);g.pickups.render(3);environment?.update(3,true,g);
          document.querySelector('#menu').close();
          const hud=document.querySelector('#hud');hud.hidden=false;hud.dataset.aim='true';
          Array.from(hud.children).forEach(n=>{ if(!n.contains(document.querySelector('#aim-dot'))) n.style.display='none'; });
          document.querySelector('#aim-dot').hidden=false;
          w.render(0,p,g);w.group.updateMatrixWorld(true);
          const centre=w.sight.getWorldPosition(camera.position.clone()).project(weaponCamera);
          if(Math.hypot(centre.x,centre.y)>1e-6)throw Error('镜片未与红点对准');
        }""",stage)
        page.evaluate("run.weaponPass.enabled=true;run.composer.render(0)")
        image = Image.open(BytesIO(page.screenshot())).convert("RGB")
        page.evaluate("run.game.weapon.shoot(run.game);run.game.weapon.render(0,run.game.player,run.game);run.composer.render(0)")
        shot = Image.open(BytesIO(page.screenshot())).convert("RGB")
        # 取红点周边边长为视口高度 2.4% 的方形，计入火光的实际泛光。
        ring = (int(width/2-height*.012), int(height*.488), int(width/2+height*.012), int(height*.512))
        channels = ImageChops.difference(image.crop(ring), shot.crop(ring)).split()
        histogram = ImageChops.lighter(ImageChops.lighter(*channels[:2]), channels[2]).histogram()
        flash = 100 * sum(histogram[12:]) / sum(histogram)
        # 在独立武器相机内用同一纯色材质绘制实体轮廓，排除背景亮度、镜片和泛光。
        covered = page.evaluate("""() => {
          const {game:g,weaponPass,weaponCamera,renderer}=run,w=g.weapon,scene=weaponPass.scene;
          const white=w.flashGroup.children[0].material.clone();
          white.color.setHex(0xffffff);white.transparent=false;white.toneMapped=false;
          scene.overrideMaterial=white;renderer.setRenderTarget(null);renderer.setClearColor(0);
          const canvas=document.createElement('canvas'), actual=renderer.domElement;
          canvas.width=actual.width;canvas.height=actual.height;
          const c=canvas.getContext('2d',{willReadFrequently:true}),W=canvas.width,H=canvas.height;
          function mask(x,y,width,height){
            renderer.clear();renderer.render(scene,weaponCamera);
            c.drawImage(actual,0,0);
            const data=c.getImageData(x,y,width,height).data;
            let count=0;for(let i=0;i<data.length;i+=4)if(data[i]>127)count++;
            return count*400/data.length;
          }
          w.flashGroup.visible=false;w.sight.children[1].visible=false;
          const gun=mask(W*.27,H*.46,W*.46,H*.34);
          white.dispose();
          return gun;
        }""")
        return shot if weapon == "shotgun-pump" else image, covered, flash
    finally:
        page.close()


def compare(browser, baseline, output):
    card = (360, 214)
    sheet = Image.new("RGB", (4*card[0], 4*card[1]+33), "#121820")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 14)
    except OSError:
        font = ImageFont.load_default()
    for index,stage in enumerate(["underground-lab","buried-tomb"]):
        for gun,weapon in enumerate(["underground-lab","shotgun-pump"]):
            row = index*2+gun
            for compact,size in enumerate([(1280,720),(800,580)]):
                results = []
                for version,root in enumerate([baseline,ROOT]):
                    image,covered,flash = capture(browser, root,stage,weapon,size)
                    results.append((round(covered,2),round(flash,2)))
                    col = 2*compact+version
                    x,y = card[0]*col,33+card[1]*row
                    image.thumbnail((card[0],card[1]-23))
                    sheet.paste(image,(x+(card[0]-image.width)//2,y))
                    draw.text((x+8,y+card[1]-22),f"{stage} | {'shotgun firing' if gun else 'rifle'} | mask {covered:.1f}%",font=font,fill="#f1f4f7")
                    if row == 0:
                        draw.text((x+8,7),f"{size[0]} x {size[1]}  {'AFTER' if version else 'BEFORE'}",font=font,fill="#d5e8f7")
                print(stage,weapon,size,"gun mask %, centre pixels changed by firing %",results,flush=True)
                assert results[1][0] < results[0][0]*.75, results
                assert results[1][1] < 3, results
    sheet.save(output,quality=88)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline",type=Path)
    parser.add_argument("output",type=Path)
    args = parser.parse_args()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER","chrome"))
        try:
            compare(browser,args.baseline.resolve(),args.output)
        finally:
            browser.close()
