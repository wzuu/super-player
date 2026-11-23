"""持续开火时记录视锥中的目标数、GPU、FPS 和 P95。可传入另一份已构建的源码树对照。"""
import functools
import os
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def measure(page, url, stage, count):
    path = f"{url}/{stage}/"

    def practice(route):
        response = route.fetch()
        html = response.text().replace("data-campaign-level=", "data-practice-level=")
        entry = "    startLevel(definition, campaign, campaignStage);"
        assert html.count(entry) == 1
        route.fulfill(response=response, body=html.replace(entry, "    window.run = " + entry.strip()))

    page.route(path, practice)
    page.goto(path)
    page.click("#start")
    page.wait_for_function("window.run && run.game.phase==='play' && !!document.pointerLockElement")
    page.mouse.down()
    try:
        result = page.evaluate("""async count => {
          const T=await import('three'), {game:g,camera,renderer}=run, b=g.beasts;
          g.player.hurtDelay=1000;
          // 固定观察点，保留 AI、枪械、射线、HUD、空间音频和关卡事件的正常步进。
          camera.position.set(2,24,39);camera.lookAt(0,0,7);camera.updateMatrixWorld(true);
          g.player.positionCamera=()=>{};
          const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(
            camera.projectionMatrix,camera.matrixWorldInverse));
          const point=new T.Vector3();
          const visible=actor=>frustum.containsPoint(point.set(actor.x,actor.y+actor.height/2,actor.z));
          const sites=run.config.beasts.types.map(({radius,height})=>{
            const allowed=[];
            for(let z=-8;z<23;z+=1.7)for(let x=-15;x<=15;x+=2){
              const y=g.level.base(x,z);
              if(!g.level.blocked(x,z,y,radius,height) && frustum.containsPoint(point.set(x,y+height/2,z)))
                allowed.push({x,y,z});
            }
            if(!allowed.length)throw Error('视锥内没有适合此体型的布阵点');
            return allowed;
          });
          function place(actor,i){
            const type=actor?.type ?? i%3, valid=sites[type], pos=valid[(i*17)%valid.length];
            if(actor)Object.assign(actor,pos);
            else if(!b.spawn(type,pos.x,pos.z,pos.y))throw Error('无法补充场内样本');
          }
          while(b.live<count){
            place(null,b.live);
          }
          b.pool.filter(a=>a.active).forEach(place); b.refreshHash();
          const gl=renderer.getContext(), info=gl.getExtension('WEBGL_debug_renderer_info');
          const gpu=gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
          const frame=()=>new Promise(requestAnimationFrame);
          const start=await frame();let previous=start, minVisible=Infinity;
          const times=[];const initialAmmo=g.weapon.ammo+g.weapon.reserve;
          while(previous-start<8100){
            const now=await frame();
            const live=b.pool.filter(a=>a.active), outside=live.filter(a=>!visible(a));
            let shown=live.length-outside.length;
            while(shown<count){
              place(outside.pop(),shown++);
            }
            if(now-start>1600){times.push(now-previous);minVisible=Math.min(minVisible,b.pool.filter(a=>a.active&&visible(a)).length);}
            previous=now;
          }
          const fps=1000*times.length/times.reduce((a,v)=>a+v,0);
          times.sort((a,b)=>a-b);
          return {gpu,frames:times.length,minVisible,fps:+fps.toFixed(1),
            p95:+times[Math.floor(times.length*.95)].toFixed(1),shots:initialAmmo-g.weapon.ammo-g.weapon.reserve,
            phase:g.phase,ratio:renderer.getPixelRatio()};
        }""", count)
        print(stage, result, flush=True)
        assert result["minVisible"] >= count and result["phase"] == "play" and result["shots"] > 20, result
    finally:
        page.mouse.up()
        page.close()


if __name__ == "__main__":
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2]
    with ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=root)) as server:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as pw:
                browser = pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER", "chrome"))
                for stage, count, width, height in [
                    ("rain-city", 84, 1440, 900), ("sakura-night-town", 96, 1280, 720),
                    ("brass-factory", 96, 1280, 720), ("haunted-midway", 96, 1440, 900),
                ]:
                    page=browser.new_page(viewport={"width":width,"height":height})
                    measure(page, f"http://127.0.0.1:{server.server_port}", stage, count)
                browser.close()
        finally:
            server.shutdown()
