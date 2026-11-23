"""四个跨层样板使用真实地形、体型、碰撞和 AI 验证双向楼梯与占位。"""
import os
import re
from campaign_browser import ROOT,sync_playwright


def verify(browser):
    page=browser.new_page()
    page.add_init_script("window.requestAnimationFrame=()=>1")
    def expose(route):
        path=ROOT/route.request.url.split('/')[-2]/'index.html'
        html=path.read_text(encoding='utf8').replace('    startLevel(definition, campaign, campaignStage);',
            '    window.run=startLevel(definition,campaign,campaignStage);')
        route.fulfill(body=html,content_type='text/html')
    page.route(re.compile(r"/[a-z-]+/index\.html$"),expose)
    for stage in ['drowned-city','ember-fortress','sakura-night-town','paris-tower']:
        page.goto((ROOT/stage/'index.html').as_uri())
        page.wait_for_function('!!window.run',polling=100)
        result=page.evaluate("""()=>{
          const {game:g,nav}=run,level=g.level,q=level.stairs;
          if(!q)throw Error('缺少双端连接');
          g.reset();g.phase='play';
          const traces=[];
          for(let type=0;type<4;type++){
            g.beasts.pool.forEach(b=>b.active=false);g.beasts.live=0;g.beasts.hash.clear();
            const end=q.deckLength/2+q.run;
            const b=g.beasts.spawn(type,q.x+.18,q.z+end+2,q.baseY);
            if(!b)throw Error('坡脚不可站立 '+type+' '+JSON.stringify(q));
            const p=g.player;
            const travel=(target,done)=>{
              Object.assign(p,target);nav.rebuild(p.x,p.z);
              for(let frame=0;frame<2800;frame++){
                b.alert=10;b.cooldown=100;g.shotAt=g.time;
                g.time+=.025;g.beasts.ai.update(b,p,g,.025,frame);
                if(done())return true;
              }
              return false;
            };
            const up=travel({x:q.x+.3,y:q.topY,z:q.z},()=>b.y>=q.topY-.15 && Math.abs(b.z-q.z)<=q.deckLength/2);
            const top=[b.x,b.y,b.z];
            const down=up && travel({x:q.x,y:q.baseY,z:q.z-Math.max(25,end+6)},()=>b.y<=q.baseY+.26 && b.z<=q.z-end+.5);
            traces.push({type,up,down,top,end:[b.x,b.y,b.z]});
          }
          return traces;
        }""")
        print(stage,result,flush=True)
        assert all(row['up'] and row['down'] for row in result),stage
    page.close()


if __name__=='__main__':
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel=os.environ.get('GAME_TEST_BROWSER','chrome'))
        try:verify(browser)
        finally:browser.close()
