"""离线文件入口验证错误出口、上下层、阶段与失败重开。"""
import os
from playwright.sync_api import sync_playwright
from campaign_routes_browser import ROOT, scenario_page
from breakout_browser import CASES


def check(browser,stage,seed):
    with scenario_page(browser,ROOT,stage,seed) as page:
        result=page.evaluate("""stage=>{
          const {game:g}=run,{player:p,level:l,story:s}=g;
          const start=()=>{g.reset();g.phase='play';g.step(.03);};
          const move=(x,y,z)=>Object.assign(p,{x,y,z});
          start();
          const live=g.beasts.live, t=s.target, e=g.encounter;
          if(s.stage!=='breakout' || g.beasts.boss || s.actionName!=='突围')throw Error('开局行动错误');
          const items=g.pickups.objects.filter(i=>i.active && i.kind==='rare');
          if(items.length!==10)throw Error('地图收藏品应有十件');
          for(const item of items){
            if(l.blocked(item.x,item.z,item.y,p.radius,p.height))throw Error('收藏品落点被挡 '+item.name);
            if(item.name==='接应电签' && item.y!==6)throw Error('接应电签落在了桥下');
          }
          if(stage==='neon-northline-escape'){
            move(t.x,l.base(t.x,t.z),t.z);
            if(l.blocked(p.x,p.z,p.y,p.radius,p.height))throw Error('接应车正下方无法落脚');
            for(const time of [8,11,17]){
              g.time=time;g.step(.033);g.ui.update(.12,g);
              const hidden=getComputedStyle(document.querySelector('#task-panel')).visibility==='hidden';
              if(e.hudOffline!==(time===11) || hidden!==e.hudOffline)throw Error('EMP HUD 恢复错误');
              if(time===11){
                const robots=g.beasts.pool.filter(b=>b.active),old=robots.map(b=>[b.x,b.z]);
                for(let i=0;i<12;i++)g.step(.033);
                if(robots.some((b,i)=>b.x!==old[i][0] || b.z!==old[i][1]))throw Error('断电时还在追击');
              }
            }
          }else if(stage==='lantern-shrine-escape'){
            move(-21,l.base(-21,-36),-36);
            const marchers=g.beasts.pool.filter(b=>b.active && b.sectionRoom==='低街巡游');
            const old=marchers.map(b=>[b.x,b.z]);
            g.time=5;
            for(let i=0;i<45;i++)g.step(.033);
            if(!e.parading || !marchers.some((b,i)=>Math.hypot(b.x-old[i][0],b.z-old[i][1])>1))throw Error('巡游队未实际前进');
          }else{move(17,l.base(17,-4),-4);g.step(.033);}
          if(g.phase!=='play')throw Error('出口外误胜');
          g.time+=20;p.hurtDelay=0;p.hurt(10000,g);
          if(g.phase!=='fail')throw Error('失败未结算');
          start();
          if(g.kills || g.loot.length || g.beasts.live!==live || s.encounters.length!==1)throw Error('重开残留');
          const saved=g.finish.bind(g);let wins=0;
          g.finish=(won,reason)=>{if(won)wins++;saved(won,reason);};
          move(t.x,t.y,t.z);g.step(.033);
          if(g.phase!=='win'||wins!==1||g.beasts.live!==live)throw Error('残敌撤离失败');
          return {live,wins};
        }""",stage)
        assert result['live']==sum(CASES[stage][3]),(stage,result)
        print(stage,seed,result,flush=True)


if __name__=='__main__':
    with sync_playwright() as pw,pw.chromium.launch(channel=os.getenv('GAME_TEST_BROWSER','chrome'),headless=True) as browser:
        for stage in CASES:
            for seed in (23,8787):check(browser,stage,seed)
