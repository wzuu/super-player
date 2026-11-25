"""在 SQLite、静态产物及断网文件首页使用浏览器虚拟输入验收展示厅。"""
import json
import os
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from threading import Thread
from playwright.sync_api import sync_playwright
from campaign_browser import ROOT
from static_campaign import StaticFiles

IDS = ['taotie', 'hydra', 'chaos', 'taowu', 'bone', 'lava', 'mech', 'shadow']
# 仅在验收页观察实际渲染器，不向发布入口暴露调试对象。
OBSERVE = """() => {
  const T=levelThreeExports.three;
  T.Scene.prototype.onBeforeRender=function(renderer,scene,camera,target){
    if(renderer.domElement.id==='rifle-canvas')window.weaponSeen=true;
    if(renderer.domElement.id!=='gallery-canvas' || renderer.getRenderTarget()) return;
    window.framesSeen=(window.framesSeen||0)+1;
    window.probe={renderer,scene,camera};
  };
}"""
POSE = 'probe.camera.position.toArray().map(v=>Number(v.toFixed(3)))'
MEMORY = '({...probe.renderer.info.memory})'


def open_gallery(page):
    page.locator('#gallery-open').click()
    page.locator('#gallery-catalog button').first.wait_for()
    assert page.locator('#gallery-catalog button').count() == 8


def selection(page, part):
    button = page.locator(f'[data-part="{part}"]')
    button.focus()
    page.keyboard.press('Enter')
    assert button.get_attribute('aria-pressed') == 'true'
    assert button.inner_text() in page.locator('#gallery-note').inner_text()


def verify(browser, url, mode, out=None):
    mobile = mode == 'file'
    ctx = browser.new_context(viewport={'width':390 if mobile else 1280,'height':844 if mobile else 800},
                              has_touch=mobile, reduced_motion='reduce' if mobile else 'no-preference')
    if mobile:
        ctx.set_offline(True)
    page = ctx.new_page()
    errors, requests = [], []
    page.on('pageerror', lambda err: errors.append(str(err)))
    page.on('console', lambda msg: errors.append(msg.text) if 'Shader Error' in msg.text else None)
    page.on('request', lambda req: requests.append(req.url))
    page.goto(url)
    assert not any('three-r160' in req or '/gallery/' in req for req in requests)
    page.get_by_role('link',name='战场图鉴',exact=True).click()
    page.get_by_role('link',name='凶兽图鉴',exact=True).click()
    open_gallery(page)
    page.evaluate(OBSERVE)
    page.wait_for_function('window.probe')
    memories, timings = {}, {}
    closed_memory = None
    for cycle in range(3):
        for exhibit in IDS:
            page.locator(f'[data-id="{exhibit}"]').click()
            # 只比较待机绘制后的同一状态。喷吐中每个首次可见的头会再上传六个几何体。
            frame = page.evaluate('framesSeen')
            page.wait_for_function('previous => framesSeen > previous', arg=frame)
            memory = page.evaluate(MEMORY)
            if cycle == 2:
                assert memory == memories[exhibit], (exhibit, memory, memories[exhibit])
            elif cycle == 1:
                memories[exhibit] = memory
            assert not page.locator('[data-part][aria-pressed=true]').count()
            if not cycle and out and mode=='local':
                page.locator('.gallery-stage').screenshot(path=out / (exhibit+'.png'))
            if mobile:
                assert page.locator('.gallery-stage').is_visible()
                assert page.locator('.gallery-stage').bounding_box()['y'] < page.locator('.gallery-catalog').bounding_box()['y']
                assert page.locator('#gallery-shake').is_disabled()
                assert page.locator('#gallery-pause').inner_text() == '继续动作'
            selection(page, page.locator('[data-part]').last.get_attribute('data-part'))
            page.locator('#gallery-replay').click()
            if exhibit == 'hydra' and cycle == 1:
                # 故意让第二个头也完成上传，再切换和关闭，检查已用过的特效确实释放。
                page.wait_for_function("""() => {
                  let heads;
                  probe.scene.traverse(node => { if (node.userData.part === 'heads') heads = node; });
                  return heads.children.slice(1).some(head => head.userData.breath.visible);
                }""")
            page.locator('#gallery-pause').click()
            assert page.locator('#gallery-pause').inner_text() == '继续动作'
            page.locator('#gallery-reset').click()
            if mode=='local' and not cycle and exhibit in ('hydra','chaos','taowu','lava','shadow'):
                page.locator('#gallery-pause').click()
                timings[exhibit]=page.evaluate("""async () => {
                  let prev=await new Promise(requestAnimationFrame), times=[];
                  for(let i=0;i<36;i++){let now=await new Promise(requestAnimationFrame);times.push(now-prev);prev=now;}
                  times.sort((a,b)=>a-b);return [times[17],times[34]].map(x=>Math.round(x*10)/10);
                }""")
        if cycle<2:
            page.evaluate("""() => {
              Object.defineProperty(document,'hidden',{value:true,configurable:true});
              document.dispatchEvent(new Event('visibilitychange'));
            }""")
            frame=page.evaluate('framesSeen')
            page.wait_for_timeout(100)
            assert page.evaluate('framesSeen')==frame
            page.evaluate("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))")
            page.wait_for_function('n=>framesSeen>n',arg=frame)
            page.keyboard.press('Escape')
            page.wait_for_function("document.activeElement.id==='gallery-open'")
            frame=page.evaluate('framesSeen')
            page.wait_for_timeout(100)
            assert page.evaluate('framesSeen')==frame
            released = page.evaluate(MEMORY)
            if closed_memory is not None:
                assert released == closed_memory, (released, closed_memory)
            closed_memory = released
            open_gallery(page)
    page.locator('[data-id=lava]').click()
    for name in ['冲锋','咆哮','召唤','受击','狂暴','受击']:
        page.locator('#gallery-states').get_by_role('button',name=name).click()
    assert page.locator('#gallery-hp').evaluate('e=>e.value')==50
    page.get_by_role('button',name='重置生命').click()
    assert page.locator('#gallery-hp').evaluate('e=>e.value')==100
    for part in ['left','right','crown']:
        selection(page,part)
    # 镜头投影到额心的外露晶体，点击后应与键盘选择完全相同。
    page.locator('#gallery-reset').click()
    page.locator('#gallery-replay').click()
    page.locator('#gallery-pause').click()
    selection(page,'left')
    page.locator('#gallery-canvas').scroll_into_view_if_needed()
    point=page.evaluate("""() => {
      let crystal;probe.scene.traverse(n=>{if(n.userData.part==='crown') crystal=n.children[1];});
      const p=crystal.getWorldPosition(new levelThreeExports.three.Vector3()).project(probe.camera);
      const b=document.querySelector('#gallery-canvas').getBoundingClientRect();
      return [b.x+(p.x+1)*b.width/2,b.y+(1-p.y)*b.height/2];
    }""")
    if mobile:
        page.touchscreen.tap(*point)
    else:
        page.mouse.click(*point)
    assert page.locator('[data-part=crown]').get_attribute('aria-pressed')=='true'
    canvas=page.locator('#gallery-canvas').bounding_box()
    x,y=canvas['x']+canvas['width']/2,canvas['y']+canvas['height']/2
    initial=page.evaluate(POSE)
    if mobile:
        session=ctx.new_cdp_session(page)
        for kind, points in [('touchStart',[(x,y)]),('touchMove',[(x+32,y+8)]),('touchEnd',[])]:
            session.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[{'x':a,'y':b} for a,b in points]})
    else:
        page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+52,y+12,steps=4);page.mouse.up()
    assert page.evaluate(POSE)!=initial
    distance='probe.camera.position.distanceTo(new levelThreeExports.three.Vector3(0,2.85*.42,0))'
    before=page.evaluate(distance)
    if mobile:
        for kind, spacing in [('touchStart',20),('touchMove',45),('touchEnd',0)]:
            points=[{'x':x+s*spacing,'y':y,'id':i} for i,s in enumerate((-1,1))] if spacing else []
            session.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':points})
    else:
        page.mouse.wheel(0,-120)
    page.wait_for_function('v=>Math.abs('+distance+'-v)>.001',arg=before)
    page.locator('#gallery-reset').click()
    assert page.evaluate(POSE)==initial
    page.locator('#gallery .back').click()
    page.wait_for_function("document.activeElement.id==='gallery-open'")
    page.get_by_role('link',name='返回战场图鉴').click()
    page.get_by_role('link',name='返回主菜单').click()
    page.locator('nav a[href="#collection"]').click()
    page.wait_for_function("window.weaponSeen")
    assert not errors, errors
    if mobile:
        assert not [r for r in requests if r.startswith(('http:', 'https:'))]
    print(mode, json.dumps({'memory':memories,'closed_memory':closed_memory,'frame_ms_p50_p95':timings}),flush=True)
    ctx.close()


def run(site, out):
    with TemporaryDirectory() as tmp, ThreadingHTTPServer(('127.0.0.1',0),partial(StaticFiles,directory=site)) as static:
        Thread(target=static.serve_forever,daemon=True).start()
        service=subprocess.Popen([sys.executable,'-u',str(ROOT/'server.py'),'--port','0','--db',str(Path(tmp)/'test.sqlite3')],
                                 stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,encoding='utf-8',errors='replace')
        try:
            local=service.stdout.readline().split('http://')[-1].strip()
            with sync_playwright() as pw:
                browser=pw.chromium.launch(channel=os.environ.get('GAME_TEST_BROWSER','chrome'))
                for mode,url in [('local','http://'+local),('static',f'http://127.0.0.1:{static.server_port}/'),('file',(site/'index.html').as_uri())]:
                    verify(browser,url,mode,out)
                page=browser.new_page()
                page.add_init_script("""const get=HTMLCanvasElement.prototype.getContext;
                  HTMLCanvasElement.prototype.getContext=function(id,...args){return id.includes('webgl')?null:get.call(this,id,...args);};""")
                page.goto('http://'+local)
                page.get_by_role('link',name='战场图鉴',exact=True).click()
                page.get_by_role('link',name='凶兽图鉴',exact=True).click()
                page.locator('#gallery-open').click()
                page.get_by_text('无法显示三维展品',exact=False).wait_for()
                page.keyboard.press('Escape')
                page.wait_for_function("document.activeElement.id==='gallery-open'")
                browser.close()
        finally:
            service.terminate();service.wait()
            static.shutdown()


if __name__=='__main__':
    run(Path(sys.argv[1]).resolve(), Path(sys.argv[2]) if len(sys.argv)>2 else None)
