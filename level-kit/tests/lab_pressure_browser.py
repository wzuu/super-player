"""从实际首页以 Chromium 键鼠走完首关，记录门口、前进、射击、退路和逐室压力。"""
import argparse
from functools import partial
from hashlib import sha256
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
from threading import Thread

from playwright.sync_api import sync_playwright
from campaign_browser import ROOT, expose_game
from lab_live_browser import watch_page

HERE=Path(__file__).resolve().parent
LOCK = """
  let lock=null;
  Object.defineProperty(document,'pointerLockElement',{get:()=>lock});
  Element.prototype.requestPointerLock=function(){lock=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();};
  document.exitPointerLock=()=>{lock=null;document.dispatchEvent(new Event('pointerlockchange'));};
  document.addEventListener('pointermove',e=>{
    if(window.recentering)e.stopImmediatePropagation();
  },true);
  document.addEventListener('mousemove',e=>{
    if(window.recentering){window.recentering=false;e.stopImmediatePropagation();}
  },true);
"""
INIT = """
 let seed=5381; Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 if(location.pathname.includes('/underground-lab/'))window.requestAnimationFrame=()=>1;
 localStorage.setItem('super-player:preferences:v1',JSON.stringify({muted:true,difficulty:'standard'}));
 localStorage.setItem('super-player:variation:1',JSON.stringify({pending:'quiet'}));
"""
# 从同一步的正式模拟读取下一份意图，没有键鼠状态变化时可继续推进，仍逐步记录。
ADVANCE="""([keys,fire])=>{
  const keySet=new Set(keys);
  for(let i=0;i<50;i++){
    const result=flow.next();
    if(result.done)return {done:result.value};
    const c=result.value;
    if(c.dx||c.dy||c.fire!==fire||c.taps.length||c.keys.length!==keySet.size||
       c.keys.some(k=>!keySet.has(k)))return {c};
  }
  return {};
}"""

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*args):
        pass

    def copyfile(self,source,output):
        try:
            super().copyfile(source,output)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # 浏览器切换页面时可以取消在途资源请求。

def check(report):
    result=report['run']
    assert result['phase']=='win' and result['spawned']==[100]*3 and report.get('persisted'),result
    assert not result['core'] and not result['optional'] and not result['sideRooms']
    assert all(report['events'].get(e,0)>0 for e in ['mousemove','mousedown','keydown','keyup'])
    measurements=report['measurements']
    assert len(measurements)==3
    for section_index, section in enumerate(measurements):
        sides={r['side']:r for r in section['sides'].values()}
        front=sides['front']
        assert front['sawPlayer']['d']>2 and front['killBeforeContact']['d']>2,section
        for flank in [sides['left'],sides['right']]:
            assert flank['scan'] and flank['patrol'],flank
            # 主路容许绕过非任务房，未进入攻击状态的守卫继续驻防。
            if 'threat' in flank:
                # 接触组刻意延后开火来测前排贴身时间，退掩体组按实际击杀检验转火窗口。
                first_event='threat' if report['path']=='contact' else 'killBeforeContact'
                assert front[first_event]['t'] < flank['threat']['t'],section
        required_side=('left','right',None)[section_index]
        if required_side:
            assert required_side in section.get('sideApproach',{}),section
            assert sides[required_side].get('sawPlayer'),section
        assert section['firstShot']>0,section
        if report['path']=='cover':
            if 'retreatStart' in section:
                assert section['cover']['id']==section['retreatStart']['id'],section
            else:
                # 短点射已清除全部可见前排时，验证击杀时点与实际退回门框的位置。
                probe=section['retreatProbe']
                x,z=section['retreatEnd']['at']
                assert probe['noFront'] and front['killBeforeContact']['t']<=probe['t'],section
                assert abs(x)>3.4 and z>52-32*section_index and section['retreatEnd']['hp']>0,section
            assert any(flank.get('turnedToShot') for flank in [sides['left'],sides['right']]),section
            near, far = ('right','left') if section_index==1 else ('left','right')
            if 'threat' in sides[far] and 'threat' in sides[near]:
                assert sides[near]['threat']['t'] < sides[far]['threat']['t'],section
        else:
            assert section['types'][0]['contact']['visibleToContact']>0,section
    for section in measurements[1:]:
        heavy=section['types'][1]
        assert heavy['charge']['warning']>=.89 and heavy['evaded'],heavy
        if 'chargeContact' in heavy:
            assert heavy['chargeContact']['afterSight']>heavy['charge']['warning'],heavy

def verify(root,output,validate,path):
    build=sha256((root/'underground-lab/index.html').read_bytes()).hexdigest()
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(root)))
    Thread(target=server.serve_forever,daemon=True).start()
    home=f'http://127.0.0.1:{server.server_port}/'
    try:
        with sync_playwright() as pw:
            browser=pw.chromium.launch(channel=os.environ.get('GAME_TEST_BROWSER','chrome'),headless=True,
                                       args=['--use-angle=swiftshader','--disable-frame-rate-limit','--disable-gpu-vsync'])
            page=browser.new_page(viewport={'width':960,'height':620})
            page.add_init_script(LOCK+INIT)
            page.route(re.compile(r'/underground-lab/(?:index\.html)?(?:\?.*)?$'),expose_game)
            errors=[]
            watch_page(page,errors,True)
            page.goto(home)
            page.get_by_role('button',name='直接开始',exact=True).click(force=True)
            page.locator('#continue').click()
            page.wait_for_function('!!window.run',polling=100)
            page.locator('#start').click(force=True)
            page.wait_for_function("run.game.phase==='play' && !!document.pointerLockElement",polling=100)
            page.add_script_tag(content=(HERE/'lab_pressure.js').read_text('utf8'))
            source=(HERE/'lab_live_driver.js').read_text('utf8')
            page.evaluate('path=>{window.control=laboratoryPressure(path);window.flow=('+source+')(control);}',path)
            page.evaluate("""window.trustedEvents={};for(const name of ['mousemove','mousedown','keydown','keyup']) {
               document.addEventListener(name,e=>{if(e.isTrusted)trustedEvents[name]=(trustedEvents[name]??0)+1;});
            }""")
            x,y=480,310
            page.evaluate('window.recentering=true')
            page.mouse.move(x,y)
            held=set();fire=False
            while True:
                response=page.evaluate(ADVANCE,[sorted(held),fire])
                if 'done' in response:
                    result=response['done']
                    break
                c=response.get('c')
                if not c:continue
                dx,dy=c['dx'],c['dy']
                while dx or dy:
                    sx=max(-380,min(380,dx));sy=max(-240,min(240,dy))
                    if not (12 <= x+sx < 948 and 12 <= y+sy < 608):
                        # 虚拟锁不会重置屏幕边缘；丢弃这一条重新居中的事件，实际相对移动仍交给游戏。
                        page.evaluate('window.recentering=true')
                        x,y=480,310
                        page.mouse.move(x,y)
                    x+=sx;y+=sy
                    page.mouse.move(x,y)
                    dx-=sx;dy-=sy
                desired=set(c['keys'])
                for k in sorted(held-desired):page.keyboard.up(k)
                for k in sorted(desired-held):page.keyboard.down(k)
                held=desired
                for k in c['taps']:page.keyboard.press(k)
                if fire!=c['fire']:
                    fire=c['fire']
                    (page.mouse.down if fire else page.mouse.up)()
            report={'path':path,'sha256':build,'measurements':page.evaluate('control.report()'),'run':result,'events':page.evaluate('trustedEvents')}
            if result['phase']=='win':
                page.wait_for_function("document.querySelector('#menu-status').textContent.includes('已保存')",polling=100)
                page.locator('#campaign-home').click(force=True)
                page.reload()
                page.wait_for_function("document.querySelector('#continue')?.href.endsWith('/shanhai-secret-realm/')",polling=100)
                report['persisted']=True
            output.write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf8')
            browser.close()
            assert not errors,errors
            if validate:
                check(report)
            print(output, result['phase'],result['kills'],flush=True)
    finally:
        server.shutdown()
        server.server_close()

if __name__=='__main__':
    arg=argparse.ArgumentParser(description=__doc__)
    arg.add_argument('--root',type=Path,default=ROOT)
    arg.add_argument('--output',type=Path,required=True)
    arg.add_argument('--observe-only',action='store_true')
    arg.add_argument('--path',choices=['cover','contact'],default='cover')
    opts=arg.parse_args()
    verify(opts.root,opts.output,not opts.observe_only,opts.path)
