"""从首页用页面键鼠实走突围、护送与坚守。每次出发使用独立存档。"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from tempfile import TemporaryDirectory

from playwright.sync_api import sync_playwright
from campaign_browser import ROOT
from campaign_play import open_campaign

CASES={
    'storm-city-overpass': (
        [[0,26],[1,7],[0,-4],[20,-4],[38,-13],[38,-35]],
        [[-3,26],[-31,26],[-34,7],[-31,-4],[18,-4],[38,-13],[38,-35]],
        '修表匠的怀表',[4,8,5,6,9,6]),
    'lantern-shrine-escape': (
        [[-23,40],[9,40],[9,26],[25,26],[26,5],[9,4],[9,-21],[-22,-23],[-22,-50],[14,-52]],
        [[-23,40],[-16,36],[-15,20],[-16,29],[-15,18],[7,17],[9,-21],[-22,-23],[-22,-50],[14,-52]],
        '织坊锦样',[3,9,4,4,7,6,4]),
    'neon-northline-escape': (
        [[3,35],[26,34],[27,5],[4,1],[-21,-3],[-22,-17],[-22,-35],[-22,-42]],
        [[-4,33],[-24,33],[-24,15],[-24,3],[-20,-7],[-22,-17],[-22,-35],[-22,-42]],
        '义肢校准盒',[4,5,8,8,5,7]),
}


ESCORT={
    'sunken-rooftop-recovery': ('珊瑚祭器',[5,8,5,7,5,4],'drowned-city','escort'),
    'frost-sample-escort': ('封存冰藻',[4,6,3,7,6,6],'polar-station','classic'),
    'steam-service-rail': ('黄铜校准规',[4,6,4,7,7,5],'brass-factory','classic'),
}

DEFENSE={
    'dune-signal-terrace': ('绿洲星盘',[4,4,5,10,9],'buried-tomb','classic'),
    'waterfall-temple-defense': ('翡翠雨神像',[5,4,4,8,7,7],'jungle-temple','classic'),
    'tower-observation-defense': ('铜版首日票',[4,4,5,7,7,8,7],'paris-tower','rescue'),
}

RIFTS={
    'rift-temple-valley': ('竹简星图',[4,5,6,4],'shanhai-secret-realm','classic'),
    'caldera-rift-works': ('蓝釉测温杯',[4,5,5,6],'ember-fortress','classic'),
    'midnight-midway-backstage': ('釉面木马徽章',[4,5,5,6],'haunted-midway','classic'),
}


def play(browser,url,stage,out,collect):
    page,errors,before=open_campaign(browser,url,stage)
    escort=ESCORT.get(stage)
    defense=DEFENSE.get(stage)
    rifts=RIFTS.get(stage)
    if escort or defense or rifts:
        reward,counts,*original=escort or defense or rifts
        direct=side=[]
    else:
        direct,side,reward,counts=CASES[stage]
    page.add_script_tag(path=ROOT/'level-kit/tests/armed_route_play.js')
    page.evaluate('opts=>window.walk=playArmedRoute(opts)',{'via':side if collect else direct,'reward':reward if collect else None,'stage':stage})
    perf={}
    def capture(name):
        if defense and name=='combat':
            page.keyboard.press('Escape')
            state="() => [run.game.story.defense.elapsed,...run.game.story.defense.lanes.map(l=>l.hp)]"
            frozen=page.evaluate(state)
            page.wait_for_timeout(130)
            assert page.evaluate('run.game.phase')=='pause' and page.evaluate(state)==frozen
            page.locator('#start').click()
            page.wait_for_function("run.game.phase==='play'",polling=100)
        page.evaluate("""name=>{
            const g=run.game;
            for(let i=0;i<(name==='entry'?1:5);i++)g.step(.025);
            while(g.phase==='play' && g.time<g.attackPauseUntil)g.step(.008);
            if(name!=='combat'){
                g.story.marker(null,g);
                for(const id of ['task-panel','map'])document.getElementById(id).style.visibility='hidden';
            }
            window.drawPlayFrame(1000+g.time*1000);
        }""",name)
        page.screenshot(path=out/(stage+'-'+name+'.png'))
        if name=='combat':
            perf.update(page.evaluate("""async ()=>{
              const {game,renderer}=run,gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
              const intervals=[],live=game.beasts.live;
              for(let i=0;i<33;i++){
                const t=performance.now();game.step(.008);
                window.drawPlayFrame(1000+game.time*1000);
                await new Promise(window.testRefresh);
                if(i>=3)intervals.push(performance.now()-t);
              }
              intervals.sort((a,b)=>a-b);
              return {live,p50:intervals[15],p95:intervals[28],frames:intervals.length,viewport:[innerWidth,innerHeight],
                gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
            }"""))
        page.evaluate("()=>{for(const id of ['task-panel','map'])document.getElementById(id).style.removeProperty('visibility')}")
    capture('entry')
    while True:
        result=page.evaluate('walk.advance()')
        if 'pauseFuse' in result:
            page.keyboard.press('Escape')
            state='run.game.story.rifts.gates.map(g=>[g.state,g.fuse,g.spawned])'
            frozen=page.evaluate(state)
            page.wait_for_timeout(140)
            assert page.evaluate('run.game.phase')=='pause' and page.evaluate(state)==frozen
            page.locator('#start').click()
            page.wait_for_function("run.game.phase==='play'",polling=100)
        if 'shot' in result:capture(result['shot'])
        if 'done' in result:break
    report=result['done']
    report['performance']={**perf,'browser':browser.version}
    print(stage,json.dumps(report,ensure_ascii=False),flush=True)
    (out/(stage+'-play.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    assert report['phase']=='win' and (escort or defense or rifts or report['live']>0) and report['shots']>0,report
    if escort:assert len(report['docks'])==2 and report['escort']['escorted'] and report['escort']['escortHealth']>0,report
    assert perf.get('frames')==30 and (out/(stage+'-transition.png')).exists(),report
    assert (reward in report['loot'])==collect and [v['deployed'] for v in report['peaks'].values()]==counts,report
    page.wait_for_function("document.querySelector('#menu-status').textContent.includes('已保存')",polling=100)
    page.goto(url+'/')
    page.reload()
    saved=page.request.get(url+'/api/progress').json()
    assert saved['battleCount']==len(before)+1 and all(l['cleared'] for l in saved['levels'][:len(before)+1])
    if len(saved['levels'])>len(before)+1:assert saved['levels'][len(before)+1]['unlocked']
    record=page.request.get(url+'/api/battles').json()['battles'][0]
    detail=page.request.get(url+'/api/report',params={'id':record['id']}).json()
    assert record['level']==stage and record['won'] and detail['report']['actionName']==('爆破' if rifts else '坚守' if defense else '护送' if escort else '突围'),detail
    if rifts:
        assert {'transition','combat','pauseFuse'}<=set(report['captured']),report
        assert report['vault']=='idle',report
        assert report['gateOrder']==([2,1,0] if collect else [0,1,2]),report
        assert detail['report']['scores']['riftsDestroyed']==3 and detail['report']['scores']['chargesCollected']==3
    if defense:
        scores=detail['report']['scores']
        assert scores['holdSeconds']=={'dune-signal-terrace':50,'waterfall-temple-defense':55,'tower-observation-defense':90}[stage]
        if stage=='tower-observation-defense':assert scores['boarded']
    if not escort and not defense and not rifts:original={'storm-city-overpass':('rain-city','hold'),'lantern-shrine-escape':('sakura-night-town','classic'),
              'neon-northline-escape':('neon-undercity','timed')}[stage]
    page.get_by_role('link',name='战役大厅').click()
    page.locator('.mission-option[data-level="'+original[0]+'"]').click()
    page.locator('#prepare-mission').click()
    page.wait_for_function("mode=>document.querySelector('#mission-mode')?.value===mode",arg=original[1],polling=100)
    assert not errors,errors
    page.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('stage',choices=[*CASES,*ESCORT,*DEFENSE,*RIFTS])
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--collect',action='store_true')
    args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    with TemporaryDirectory() as storage:
        server=subprocess.Popen([sys.executable,'-X','utf8','-u','server.py','--port','0','--db',str(Path(storage)/'play.sqlite')],
                                cwd=ROOT,stdout=subprocess.PIPE,encoding='utf8')
        try:
            url=re.search(r'http://127\.0\.0\.1:\d+',server.stdout.readline()).group()
            with sync_playwright() as pw, pw.chromium.launch(channel=os.getenv('GAME_TEST_BROWSER','chrome'),headless=True) as browser:
                play(browser,url,args.stage,args.output,args.collect)
        finally:
            server.terminate()
            server.wait(timeout=10)
