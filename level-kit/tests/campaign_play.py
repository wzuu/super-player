"""在隔离的存档和页面中从正式首页启动一场标准战役。"""
from uuid import uuid4
import re
from campaign_browser import ROOT, LEVELS, expose_game
from lab_live_browser import watch_page
from lab_pressure_browser import LOCK


def open_campaign(browser,url,stage):
    page=browser.new_page(viewport={'width':1280,'height':720})
    errors=[]
    watch_page(page,errors,False)
    page.add_init_script(LOCK+"""
      if(document.location.pathname!=='/') {
        window.testRefresh=window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame=cb=>{window.drawPlayFrame=cb;return 1;};
        let seed=6107;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
      }
      localStorage.setItem('super-player:preferences:v1',JSON.stringify({muted:true,difficulty:'standard'}));
    """)
    page.route(re.compile('/'+stage+r'/(?:index\.html)?(?:\?.*)?$'),lambda route:expose_game(route,manual_steps=True))
    page.goto(url+'/')
    page.locator('#continue').wait_for()
    # 只预置前置关卡通关记录。本关通过正常首页、战斗和战报写入。
    before=[]
    for level in LEVELS:
        if level['id']==stage: break
        before.append(level['id'])
        entry={'id':str(uuid4()),'level':level['id'],'won':True,'kills':1,'endedAt':1000+len(before),'durationMs':1000,'loot':[]}
        r=page.request.post(url+'/api/battles',headers={'Origin':url},data=entry)
        assert r.ok,r.text()
    page.reload()
    page.get_by_role('link',name='选择关卡').click()
    page.locator('.mission-option[data-level="'+stage+'"]').click()
    page.locator('#prepare-mission').click()
    page.wait_for_function('!!window.run',polling=100)
    page.locator('#start').click()
    page.wait_for_function("run.game.phase==='play'",polling=100)
    page.keyboard.press('Escape')
    assert page.evaluate("run.game.phase")== 'pause'
    page.locator('#start').click()
    page.add_script_tag(path=ROOT/"level-kit/tests/play_inputs.js")
    return page,errors,before
