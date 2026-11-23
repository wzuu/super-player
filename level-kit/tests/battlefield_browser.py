"""在同一机位布置凶兽与掉落物，比较两个版本的画面、绘制量与帧时间。"""
import os
import re
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from playwright.sync_api import sync_playwright
from campaign_browser import ROOT, LEVELS, expose_game
from uuid import uuid4
import base64


def probe(page, url):
    path = url + "/underground-lab/"
    page.route(path, expose_game)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(path)
    page.click("#start")
    page.wait_for_function("window.run && run.game.phase==='play'")
    page.evaluate("""() => {
      const {game:g, camera}=run, beasts=g.beasts;
      g.phase='pause';
      document.querySelector('#hud').hidden=true;g.weapon.group.visible=false;
      document.querySelector('#equipment-hud').hidden=true;
      for(const b of beasts.pool) b.active=false;
      beasts.live=0;
      for(const item of g.pickups.objects) item.active=false;
      g.pickups.keyItem=null;
      camera.position.set(0,32,6); camera.lookAt(0,31,-12); camera.updateMatrixWorld();
      for(let i=0;i<82;i++){
        const type=i===81?3:i%7<4?0:i%7<6?1:2;
        const b=beasts.spawn(type,(i%9-4)*1.05,-Math.floor(i/9)*3.2,30,0);
        b.blink=0;
      }
      for(let i=0;i<100;i++){
        g.pickups.add(i%4===0?'health':'ammo',(i%10-4.5)*1.8,-2-Math.floor(i/10)*2.8,30,'测试补给',14);
      }
    }""")
    stats = page.evaluate("""async () => {
      const frame=()=>new Promise(requestAnimationFrame);
      for(let i=0;i<25;i++)await frame();
      const times=[];let last=await frame();
      for(let i=0;i<90;i++){const now=await frame();times.push(now-last);last=now}
      times.sort((a,b)=>a-b);
      return {actors:run.game.beasts.live,drops:run.game.pickups.objects.filter(x=>x.active).length,
        medianMs:times[45],p95Ms:times[85],...run.renderer.info.render};
    }""")
    assert stats["actors"] == 82 and stats["drops"] == 100 and not errors, (stats, errors)
    print(stats, flush=True)
    if output := os.environ.get("BATTLEFIELD_CAPTURE"):
        page.screenshot(path=output)
    if "--baseline" not in sys.argv:
        check_features(page)
    page.close()


def check_features(page):
    page.evaluate("""() => {
      const g=run.game, {pickups:p,beasts:b,player:q}=g, cfg=run.config.pickups;
      const expect=(ok,why)=>{if(!ok) throw Error(why)};
      const farCount=b.counts.slice(b.farStart).reduce((a,v)=>a+v,0);
      expect(farCount>0 && farCount<b.live,'远近分批');
      const beast=b.pool.find(a=>a.active && a.type===0), hp=beast.hp;
      const live=b.live, kills=g.kills;
      g.phase='play'; b.damage(beast,hp+100,g);
      expect(!beast.active && b.live===live-1 && g.kills===kills+1,'击杀判定');
      expect(!b.damage(beast,9999,g) && b.corpses.some(c=>c.until>g.time),'尸体与战斗对象分离');
      b.render(0,g.time); expect(b.counts.reduce((a,v)=>a+v,0)===live,'倒地绘制');
      b.render(0,g.time+1);expect(b.counts.reduce((a,v)=>a+v,0)===live-1,'倒地回收');
      g.phase='pause';
      for(const obj of p.objects)obj.active=false;
      q.x=0;q.y=30;q.z=0;
      const a=p.add('ammo',0,0,30,'弹药',8);
      p.level.box(.2,0,.08,1,30,31);
      expect(p.add('ammo',.4,0,30,'弹药',3)!==a,'遮挡两侧独立');
      const aimed=p.add('ammo',0,-3,30,'瞄准补给',7);
      run.camera.position.set(0,31.7,0);run.camera.lookAt(0,30.4,-3);
      g.weapon.reserve=0;expect(p.takeAimed(q,g) && !aimed.active && g.weapon.reserve===7,'瞄准手动拾取');
      run.camera.position.y=30.4;run.camera.lookAt(0,30.4,-3);
      const full=p.add('ammo',0,-2,30,'满仓弹药',7);
      const treasure=p.add('rare',.08,-3,30,'瞄准宝物',100);
      g.weapon.reserve=run.config.weapon.maxReserve;
      expect(p.takeAimed(q,g) && full.active && !treasure.active,'满仓弹药旁仍可瞄准拾取宝物');
      full.active=false;
      expect(p.add('ammo',0,0,30,'弹药',6)===a && a.value===14,'同类数量合并');
      const upper=p.add('ammo',0,0,32,'弹药',4);
      expect(upper!==a,'楼层独立');
      g.weapon.reserve=run.config.weapon.maxReserve-5;
      p.update(0,q,g);expect(a.active && a.value===9,'部分拾取保留余额');
      const key=p.add('core',.4,0,30,'核心',0);
      expect(!p.nearKey(q) && !p.takeKey(q,g) && key.active,'墙后显示信标但不能穿墙领取核心');
      const chest=p.add('rare',1,0,37,'珍宝',350,true);
      const grenade=p.add('grenade',0,0,30,'手雷',1);
      const count=g.kit.remaining().grenade;
      p.update(.01,q,g);expect(!grenade.active && g.kit.remaining().grenade===count+1,'手雷入库');
      p.update(cfg.lifetime+1,q,g);
      expect(!a.active && !upper.active && chest.active && key.active && !g.core,'普通过期、核心手动');
      q.x=.5;
      expect(chest.style==='precious' && p.takeKey(q,g) && g.core,'宝物稀有度与核心交互');
    }""")
    print("PASS 分批/倒地、堆叠/障碍/跨层、部分补给、手雷、核心与过期", flush=True)


def audit(browser, url):
    # 每关用独立页面释放 WebGL 资源，以相同角度把四种原型绘成纯色剪影。
    for index, level in enumerate(LEVELS):
        page=browser.new_page()
        path=url+"/"+level["id"]+"/"
        page.route(path,expose_game)
        page.goto(path)
        page.wait_for_function("!!window.run")
        result=page.evaluate("""async () => {
          const T=await import('three'), {renderer:r,game}=run, b=game.beasts;
          const s=new T.Scene();s.background=new T.Color(0xe6edf1);
          const material=new T.MeshBasicMaterial({color:0x243442});
          const camera=new T.OrthographicCamera(-4.2,4.2,1.3,-1.3,.01,30);
          camera.position.set(0,1.65,10);camera.lookAt(0,1.05,0);
          const counts=[];
          for(let i=0;i<4;i++){
            const group=new T.Group(), pair=b.modelBatches[i];
            for(const mesh of pair)group.add(new T.Mesh(mesh.geometry,material));
            group.rotation.y=-.65;
            const box=new T.Box3().setFromObject(group), size=box.getSize(new T.Vector3());
            const scale=Math.min(1.9/size.y,1.55/size.x);
            group.scale.setScalar(scale);
            group.position.set(-3.12+i*2.08,.10-box.min.y*scale,0);s.add(group);
            const triangles=pair[0].geometry.attributes.position.count/3;
            const far=i<3 && b.farStart ? b.modelBatches[b.farStart+i][0].geometry.attributes.position.count/3 : 0;
            if(b.farStart && i<3 && !(far>0 && far<triangles)) throw Error('LOD '+i);
            counts.push([triangles,far]);
          }
          const w=420,h=130, target=new T.WebGLRenderTarget(w,h);
          r.setRenderTarget(target);r.render(s,camera);
          const pixels=new Uint8Array(w*h*4);r.readRenderTargetPixels(target,0,0,w,h,pixels);
          r.setRenderTarget(null);target.dispose();
          const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
          const ctx=canvas.getContext('2d'), img=ctx.createImageData(w,h);
          for(let y=0;y<h;y++)img.data.set(pixels.subarray((h-y-1)*w*4,(h-y)*w*4),y*w*4);
          ctx.putImageData(img,0,0);return {counts,png:canvas.toDataURL()};
        }""")
        print(level["id"],result["counts"], flush=True)
        if level["id"] == "neon-undercity" and "--baseline" not in sys.argv:
            page.click("#start")
            page.wait_for_function("run.game.phase==='play'")
            assert page.evaluate("""() => {
              const g=run.game, manager=g.beasts;
              const drone=manager.spawn(2,g.player.x+4,g.player.z,g.player.y+2);
              const kills=g.kills, slot=manager.nextCorpse;
              return manager.damage(drone,drone.hp+100,g) && g.kills===kills+1 &&
                manager.nextCorpse===slot && g.encounter.wrecks.some(w=>w.active && w.x===drone.x && w.z===drone.z);
            }"""), "无人机应只生成关卡坠毁残骸"
        if output:=os.environ.get("BATTLEFIELD_AUDIT"):
            Path(output,f"{index+1:02}-{level['id']}.png").write_bytes(base64.b64decode(result["png"].split(",")[1]))
        response=page.request.post(url+"/api/battles",headers={"Origin":url},data={
            "id":str(uuid4()),"level":level["id"],"won":True,"kills":1,"durationMs":5000,"endedAt":index+1,"loot":[]})
        assert response.ok
        page.close()


if __name__ == "__main__":
    with TemporaryDirectory() as tmp:
        proc = subprocess.Popen([sys.executable, "-X", "utf8", "-u", "server.py", "--port", "0", "--db", str(Path(tmp)/"db")],
                                cwd=os.environ.get("BATTLEFIELD_ROOT", ROOT), stdout=subprocess.PIPE, encoding="utf-8")
        try:
            url = re.search(r"http://127\.0\.0\.1:\d+", proc.stdout.readline()).group()
            with sync_playwright() as pw:
                browser = pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER", "chrome"))
                probe(browser.new_page(viewport={"width": 960, "height": 540}), url)
                if "--audit" in sys.argv:
                    audit(browser,url)
                browser.close()
        finally:
            proc.terminate()
            proc.wait(timeout=10)
