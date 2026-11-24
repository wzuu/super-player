"""用内存指针锁和 DOM PointerEvent 验收合并输入、原始输入回退与停手。"""
import argparse
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright
from campaign_browser import ROOT

LOCK = """() => {
  let owner=null;
  const signal=node=>{owner=node;document.dispatchEvent(new Event('pointerlockchange'));};
  Object.defineProperty(document,'pointerLockElement',{get:()=>owner});
  window.lockCalls=[];
  Element.prototype.requestPointerLock=function(options){
    lockCalls.push(options?.unadjustedMovement===true?'raw':'default');
    if(window.rejectRaw && options)return Promise.reject(new DOMException('fixture','NotSupportedError'));
    signal(this);return Promise.resolve();
  };
  document.exitPointerLock=()=>signal(null);
  window.requestAnimationFrame=()=>1;
  localStorage.setItem('super-player:preferences:v1',JSON.stringify({muted:true,quality:'low',steady:true}));
}"""
PACKETS = """() => {
  const r=run.game.player.look.rotation,s=run.config.player.mouseSpeed,origin=r.y;
  function move(type,x,y,children,pointerType='mouse',time) {
    const event=type==='pointermove'?new PointerEvent(type,{pointerType,movementX:x,movementY:y}):
      new MouseEvent(type,{movementX:x,movementY:y});
    if(time!==undefined)Object.defineProperty(event,'timeStamp',{value:time});
    if(children)Object.defineProperty(event,'getCoalescedEvents',{value:()=>children.map(([dx,dy,stale])=>{
      const part=new PointerEvent(type,{pointerType,movementX:dx,movementY:dy});
      if(stale)Object.defineProperty(part,'timeStamp',{value:0});return part;
    })});
    document.dispatchEvent(event);return event.timeStamp;
  }
  // 与浏览器的顺序一致，先派发指针包，再派发兼容鼠标包。
  function pair(dx,dy,parts){
    const time=move('pointermove',dx,dy,parts);move('mousemove',dx,dy,undefined,'mouse',time);
  }
  const pixels=()=>Math.round((origin-r.y)/(.002*s)*1000)/1000;
  pair(1200,0,Array.from({length:4},()=>[300,0]));const fast=pixels();
  pair(-1200,0,Array.from({length:4},()=>[-300,0]));const returned=pixels();
  const pitch=r.x;
  pair(25,-1800,[[25,-1800]]);const isolated=[pixels(),r.x===pitch];
  move('pointermove',100,80,[], 'pen');const pen=pixels();
  document.exitPointerLock();move('mousemove',50,50);const unlocked=pixels();
  return {fast,returned,isolated,pen,unlocked};
}"""
RELOCK="""async ()=>{
  const r=run.game.player.look.rotation,s=run.config.player.mouseSpeed,origin=r.y,startPitch=r.x;
  const send=(kind,dx,dy,parts,time)=>{
    const event=kind==='pointermove'?new PointerEvent(kind,{pointerType:'mouse',movementX:dx,movementY:dy}):
      new MouseEvent(kind,{movementX:dx,movementY:dy});
    if(time!==undefined)Object.defineProperty(event,'timeStamp',{value:time});
    if(parts)Object.defineProperty(event,'getCoalescedEvents',{value:()=>parts});
    document.dispatchEvent(event);return event.timeStamp;
  };
  // 若设备在新锁开始时只提供 mousemove，该通路仍按原来的灵敏度运作。
  send('mousemove',18,0);
  const part=(dx,dy,stamp)=>({movementX:dx,movementY:dy,timeStamp:stamp});
  const mixed=send('pointermove',210,-120,[part(200,-120,0),part(10,0,performance.now())]);
  send('mousemove',210,-120,undefined,mixed);
  send('mousemove',7,0);
  const plain=send('pointermove',12,0,[]);send('mousemove',12,0,undefined,plain);
  send('pointermove',9,0,[]);
  await new Promise(resolve=>setTimeout(resolve,40));
  send('mousemove',9,0);
  const distinct=send('pointermove',3,0,[]);send('mousemove',4,0,undefined,distinct);
  let stop=r.y;
  for(let i=0;i<60;i++)run.game.step(1/60);
  return {pixels:Math.round((origin-r.y)/(.002*s)),pitchPreserved:r.x===startPitch,drift:r.y-stop};
}"""


def trusted_pair(page):
    # 在隔离浏览器内通过 CDP 输入，不接管桌面鼠标。检查浏览器自己生成的兼容事件和游戏实际转角。
    page.mouse.move(128,100)
    page.evaluate("""() => {
      const r=run.game.player.look.rotation;
      window.pairStart=[r.y,r.x]; window.pairEvents=[];
      for(const type of ['pointermove','mousemove'])document.addEventListener(type,e=>{
        if(e.isTrusted)pairEvents.push([e.type,e.timeStamp,e.movementX,e.movementY]);
      },{once:true});
    }""")
    page.mouse.move(151,93)
    events,delta=page.evaluate("""() => {
      const r=run.game.player.look.rotation, unit=.002*run.config.player.mouseSpeed;
      return [pairEvents,[Math.round((pairStart[0]-r.y)/unit),Math.round((pairStart[1]-r.x)/unit)]];
    }""")
    assert [e[0] for e in events]==['pointermove','mousemove'] and events[0][1:]==events[1][1:], events
    assert delta==events[0][2:]==[23,-7], (events,delta)
    return events


def verify(browser, root, legacy=False):
    file = root.resolve() / 'underground-lab/index.html'
    entry = '    startLevel(definition, campaign, campaignStage);'
    html = file.read_text(encoding='utf8')
    assert html.count(entry) == 1
    html = html.replace(entry, '    window.run=startLevel(definition,campaign,campaignStage);')
    for reject in [False, True]:
        page = browser.new_page(viewport={'width':640,'height':400})
        errors = []
        page.on('pageerror',lambda exc:errors.append(str(exc)))
        try:
            page.add_init_script('('+LOCK+')();window.rejectRaw='+json.dumps(reject)+';')
            page.route(file.as_uri(),lambda route:route.fulfill(body=html,content_type='text/html'))
            page.goto(file.as_uri())
            page.wait_for_function('!!window.run',polling=50)
            def start():
                page.eval_on_selector('#start','button=>button.click()')
                page.wait_for_function("run.game.phase==='play'",polling=50)
            start()
            trusted=trusted_pair(page)
            packets=page.evaluate(PACKETS)
            start()
            relock=page.evaluate(RELOCK)
            calls=page.evaluate('lockCalls')
            if legacy:
                assert packets['fast']==0 and calls==['default','default'],(packets,calls)
            else:
                assert packets=={'fast':1200,'returned':0,'isolated':[25,True],'pen':25,'unlocked':25},packets
                assert relock=={'pixels':72,'pitchPreserved':True,'drift':0},relock
                assert calls==(['raw','default']*2 if reject else ['raw']*2),calls
            assert not errors,errors
            print(json.dumps(dict(legacy=legacy,browser=browser.version,rawUnsupported=reject,calls=calls,
                                  packets=packets,relock=relock,trusted=trusted),ensure_ascii=False),flush=True)
        finally:
            page.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,default=ROOT)
    parser.add_argument('--baseline',type=Path)
    args=parser.parse_args()
    with sync_playwright() as pw,pw.chromium.launch(channel=os.getenv('GAME_TEST_BROWSER','chrome'),headless=True,
                                                     args=['--use-angle=swiftshader','--enable-unsafe-swiftshader']) as browser:
        if args.baseline:verify(browser,args.baseline,True)
        verify(browser,args.root)
