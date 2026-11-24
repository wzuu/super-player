"""用浏览器鼠标事件核对按住、转向、自动换弹和重新锁定。"""
import re
from campaign_browser import ROOT


def check_held_fire(browser):
    for stage, query in [('underground-lab', ''), ('practice', '?mode=range')]:
        page = browser.new_page(viewport={'width': 960, 'height': 620})
        try:
            def expose(route):
                html = (ROOT/stage/'index.html').read_text('utf8').replace(
                    '    startLevel(definition, campaign, campaignStage);',
                    '    window.run=startLevel(definition, campaign, campaignStage);')
                route.fulfill(body=html,content_type='text/html')
            page.add_init_script('window.requestAnimationFrame=()=>1;')
            page.route(re.compile(r'/index\.html'),expose)
            page.goto((ROOT/stage/'index.html').as_uri()+query)
            page.locator('#start').click()
            page.wait_for_function("!!document.pointerLockElement && run.game.phase==='play'",polling=100)
            page.evaluate("""() => {
              const g=run.game,w=g.weapon;
              g.player.hurtDelay=Infinity;
              const sound=g.sound.shoot.bind(g.sound);
              window.fireEvents={sounds:0,flashes:0,shots:[],reloads:[],buttons:[]};
              g.sound.shoot=(...args)=>{fireEvents.sounds++; return sound(...args);};
              for(const type of ['mousedown','mouseup']) document.addEventListener(type,e=>{
                if(e.isTrusted)fireEvents.buttons.push([type,e.button,e.buttons,g.time]);
              });
              window.frames=n=>{
                for(let i=0;i<n;i++){
                  const shots=g.performance.shots,reload=w.reloadLeft;
                  g.step(1/60);
                  if(g.performance.shots>shots){
                    fireEvents.shots.push(g.time);
                    if(w.flash>0)fireEvents.flashes++;
                  }
                  if(!reload && w.reloadLeft>0)fireEvents.reloads.push(g.time);
                }
                return {shots:g.performance.shots,ammo:w.ammo,reserve:w.reserve,time:g.time,
                  magazine:run.config.weapon.magazine,rate:run.config.weapon.fireRate};
              };
            }""")
            page.mouse.down()
            still=page.evaluate('frames(60)')
            assert abs(still['shots']-still['rate'])<=1,still
            page.keyboard.down('w')
            for x,y in [(470,300),(500,319),(490,307)]:
                page.mouse.move(x,y)
                page.evaluate('frames(20)')
            page.keyboard.up('w')
            moving=page.evaluate('frames(0)')
            assert abs(moving['shots']-still['shots']-still['rate'])<=1,(still,moving)
            # 向已锁定的同一画布再次请求原生锁，并记录浏览器是否又发来了通知。
            repeated=page.evaluate('''async () => {
              let changes=0;
              const count=()=>changes++;
              document.addEventListener('pointerlockchange',count);
              try {
                await document.pointerLockElement.requestPointerLock();
                await new Promise(resolve=>setTimeout(resolve,50));
                return changes;
              } finally {document.removeEventListener('pointerlockchange',count);}
            }''')
            # 即使当前浏览器省略通知，也需覆盖这个事件顺序。

            page.evaluate("document.dispatchEvent(new Event('pointerlockchange'))")
            after=page.evaluate('frames(12)')
            assert after['shots']>moving['shots'] and after['time']>moving['time'],(moving,after)
            cycle=page.evaluate("""() => {
              let s=frames(0);
              for(let i=0;i<1800 && s.shots<s.magazine+3;i++)s=frames(1);
              return {s,events:fireEvents,reloadTime:run.config.weapon.reloadTime};
            }""")
            s,events=cycle['s'],cycle['events']
            assert s['shots']==s['magazine']+3 and s['ammo']==s['magazine']-3,cycle
            intervals=[b-a for a,b in zip(events['shots'],events['shots'][1:])]
            assert len(events['reloads'])==1 and intervals[s['magazine']-1]>=cycle['reloadTime']-.02,cycle
            assert all(abs(d-1/s['rate'])<.019 for i,d in enumerate(intervals) if i!=s['magazine']-1),intervals
            assert events['flashes']==events['sounds']==s['shots'],cycle
            assert events['buttons'] and all(e[0]=='mousedown' for e in events['buttons']),events['buttons']
            page.mouse.up()
            assert page.evaluate('frames(30).shots')==s['shots']
            page.mouse.down()
            assert page.evaluate('frames(30).shots')>s['shots']
            page.evaluate('document.exitPointerLock()')
            page.wait_for_function("run.game.phase==='pause' && !document.pointerLockElement",polling=100)
            page.mouse.up()
            page.get_by_role('button',name='继续游戏').click()
            try:
                page.wait_for_function("run.game.phase==='play' && !!document.pointerLockElement",polling=100,timeout=6000)
            except Exception:
                print('恢复时浏览器状态',page.evaluate('''() => ({phase:run.game.phase,locked:!!document.pointerLockElement,focused:document.hasFocus(),status:document.querySelector('#menu-status').textContent,events:fireEvents.buttons})'''),flush=True)
                raise
            stopped=page.evaluate('frames(0).shots')
            assert page.evaluate('frames(60).shots')==stopped
            page.mouse.down()
            assert page.evaluate('frames(30).shots')>stopped
            if stage!='practice':  # 火力试验场按练习规则持续补充备弹。
                dry=page.evaluate("""()=>{run.game.weapon.reserve=0;const start=frames(0);
                  const end=frames(Math.ceil((start.ammo/start.rate+1)*60));
                  return [start.ammo,end.ammo,end.shots-start.shots,frames(60).shots-end.shots];
                }""")
                assert dry[0]>0 and dry[1:]==[0,dry[0],0],dry
            page.mouse.up()
            print(f"PASS {stage} 同目标再请求收到 {repeated} 次锁定通知，持续射击 {s['shots']} 发，自动换弹间隔 {intervals[s['magazine']-1]:.2f} 秒，音效与枪口闪光逐发对应",flush=True)
        finally:
            page.close()
