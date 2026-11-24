"""从带历史成绩的首页进入独立歼灭关。键鼠事件和指针锁仅作用于无头测试页面。"""
import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from playwright.sync_api import sync_playwright
from campaign_browser import ROOT
from campaign_play import open_campaign

CASES = {
    'orbital-brood-ring': ('休眠舱日志','休眠舱',[-17,-17],[24,29]),
    'moonlit-stained-glass-keep': ('月桂银胸针','月桂花园',[-5,-25],[20,28]),
}


def play(browser,url,stage,out,collect):
    page,errors,before=open_campaign(browser,url,stage)
    reward,room,at,numbers=CASES[stage]
    page.add_script_tag(content=(ROOT/'level-kit/tests/annihilation_play.js').read_text(encoding='utf8'))
    page.evaluate("opts=>window.walk=playAnnihilation(opts)",{'rewardName':reward,'roomName':room,'roomAt':at,'takeReward':collect})
    def capture(name):
        page.evaluate("""name => {
          const g=run.game;
          if(name==='entry')g.step(.016);
          if(name==='combat' || name==='boss'){
            // 两次点射之间取景，让枪口焰退去，保留 HUD、前排怪和后方驻防。
            document.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));
            for(let i=0;i<5 && g.phase==='play';i++)g.step(.025);
            document.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}));
          }
          while(g.phase==='play' && g.time<g.attackPauseUntil)g.step(.008);
          if(name==='entry' || name==='transition'){
            g.story.marker(null,g);
            document.querySelector('#task-panel').style.visibility='hidden';
            document.querySelector('#map').style.visibility='hidden';
          }
          window.drawPlayFrame(1000);
        }""",name)
        page.screenshot(path=out/(stage+'-'+name+'.png'))
        page.evaluate("""() => {
          for(const id of ['task-panel','map'])document.getElementById(id).style.removeProperty('visibility');
        }""")
    capture('entry')
    while True:
        result=page.evaluate('walk.advance()')
        if 'shot' in result:
            capture(result['shot'])
        if 'done' in result:break
    report=result['done']
    print(stage,report,flush=True)
    (out/(stage+'-play.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    assert report['phase']=='win' and (reward in report['loot'])==collect,report
    assert [m['count'] for m in report['peaks'].values()]==numbers,report
    page.wait_for_function("document.querySelector('#menu-status').textContent.includes('已保存')",polling=100)
    saved=page.request.get(url+'/api/progress').json()
    assert saved['battleCount']==len(before)+1 and all(l['cleared'] for l in saved['levels'][:len(before)+1])
    if len(saved['levels'])>len(before)+1:assert saved['levels'][len(before)+1]['unlocked']
    assert not errors,errors
    page.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('stage',choices=CASES)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--collect',action='store_true')
    args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    with TemporaryDirectory() as storage:
        server=subprocess.Popen([sys.executable,'-X','utf8','-u','server.py','--port','0','--db',str(Path(storage)/'play.sqlite')],
                                cwd=ROOT,stdout=subprocess.PIPE,encoding='utf8')
        try:
            url=re.search(r'http://127\.0\.0\.1:\d+',server.stdout.readline()).group()
            with sync_playwright() as pw:
                browser=pw.chromium.launch(channel=os.getenv('GAME_TEST_BROWSER','chrome'),headless=True)
                try: play(browser,url,args.stage,args.output,args.collect)
                finally: browser.close()
        finally:
            server.terminate()
            server.wait(timeout=10)
