"""逐关用真实 Web Audio 节点验证环境、危险阶段、拾取和混战方向。"""
from functools import partial
from http.server import ThreadingHTTPServer
from threading import Thread
import os
from playwright.sync_api import sync_playwright
from static_campaign import StaticFiles
from campaign_browser import LEVELS,ROOT


def verify(page,address,stage):
    def fixture(route):
        response=route.fetch()
        src=response.text().replace('    startLevel(definition, campaign, campaignStage);',
            '    window.run=startLevel(definition,campaign,campaignStage);')
        src=src.replace('data-campaign-level="'+stage+'"','')
        route.fulfill(response=response,body=src)
    page.route(address,fixture)
    page.goto(address)
    page.wait_for_function("!!window.run")
    page.click("#start")
    page.wait_for_function("run.game.phase==='play'")
    data=page.evaluate("""async id=>{
      const g=run.game,s=g.sound,e=g.encounter,p=g.player;
      const events=[],points=[],tones=[];
      const voice=s.stageEvent.bind(s),pan=s.ctx.createPanner.bind(s.ctx),tone=s.tone.bind(s);
      s.stageEvent=(kind,game,pos)=>{events.push([kind,pos?.x,pos?.z]);return voice(kind,game,pos);};
      s.tone=(...args)=>{tones.push(args.slice(0,5));return tone(...args);};
      s.ctx.createPanner=()=>{const n=pan(),set=n.setPosition.bind(n);
        n.setPosition=(x,y,z)=>{points.push([x,y,z]);set(x,y,z);};return n;};
      s.resetStage();s.stopVoices();
      // 开放战区在开局已经驻防。监听器装好后重开整局，连同对象池一起复位并接收开局预警。
      if(id==='rain-city'||id==='paris-tower')g.reset();
      const tick=(t)=>{g.time=t;e?.update?.(g,.02);s.updateThreats(g);};
      const begin=g.time+.25;
      tick(begin);
      const startShots=g.performance.shots;
      g.weapon.shoot(g);
      if(id==='underground-lab') {
        e.setAlarm(true);e.alarmUntil=begin+4;tick(begin+1);tick(begin+4.2);
      } else if(['bloodmoon-castle','shanhai-secret-realm','ember-fortress'].includes(id)) {
        tick(116);tick(121);tick(175);
      } else if(id==='buried-tomb') {tick(88);tick(91);tick(109);}
      else if(id==='polar-station') {
        e.temperature=60;tick(begin+1);e.temperature=92;tick(begin+2);
      } else if(id==='drowned-city'||id==='derelict-station') {
        const t=e.opens;tick(t-2);tick(t+.1);tick(e.seals+.2);tick(e.seals+16);
      } else if(id==='jungle-temple') {
        const t=e.nextRain;tick(t-2);tick(t+.2);tick(t+35);tick(t+46);
      } else if(['sakura-night-town','brass-factory','haunted-midway','neon-undercity'].includes(id)) {
        const t=e.next;tick(t-.5);tick(t+.05);tick(t+(id==='sakura-night-town'?22:18));
      } else {
        const t=g.story.target;Object.assign(p,{x:t.x,y:t.y,z:t.z});
        g.story.step(.1,g);g.time+=1.6;g.story.step(.1,g);s.updateThreats(g);
      }
      const danger=events.filter(([k])=>['warning','danger'].includes(k));
      const beforeKey=events.length;
      g.time+=1;g.pickups.add('core',p.x,p.z,p.y,'测试核心',0);
      const got=g.pickups.takeKey(p,g);
      const keyEvent=events.slice(beforeKey).some(e=>e[0]==='clear');
      // 同一只实际凶兽进入冲锋前摇，玩家转身后空间声道左右应当翻转。
      const b=g.beasts.pool.find(b=>b.active&&b.type===1) ?? g.beasts.spawn(1,p.x+3,p.z,35);
      const pos={x:p.x,y:p.y,z:p.z};
      Object.assign(p,{x:b.x-3,y:b.y,z:b.z});
      p.look.rotation.y=0;g.beasts.ai.chargeWindup(b,p,g,-1,0);const a=points.at(-1);
      p.look.rotation.y=Math.PI;g.beasts.ai.chargeWindup(b,p,g,-1,0);const z=points.at(-1);
      Object.assign(p,pos);
      const voices=s.voices.size;s.active(false);
      return {danger:danger.map(v=>v[0]),key:got&&keyEvent,bed:events.some(e=>e[0]==='ambient'),
        transitions:events.slice(0,beforeKey).map(e=>e[0]).filter(k=>k!=='ambient'),
        direction:[Math.round(a[0]),Math.round(z[0])],voices,cleared:s.voices.size===0,shot:g.performance.shots>startShots};
    }""",stage)
    assert data["danger"] and data["key"] and data["bed"] and data["cleared"] and data["shot"] and data["voices"]>=4,data
    assert data["direction"]==[3,-3],data
    if stage not in ("rain-city","paris-tower","polar-station"):
        assert {"warning","danger"}<=set(data["transitions"]),data
    if stage not in ("rain-city","paris-tower","brass-factory","haunted-midway"):
        assert "clear" in data["transitions"],data
    print("PASS",stage,data,flush=True)


if __name__=="__main__":
    with ThreadingHTTPServer(("127.0.0.1",0),partial(StaticFiles,directory=ROOT)) as server:
        Thread(target=server.serve_forever,daemon=True).start()
        try:
            with sync_playwright() as pw:
                browser=pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER","chrome"))
                for level in LEVELS:
                    page=browser.new_page(viewport={"width":720,"height":480})
                    try: verify(page,f"http://127.0.0.1:{server.server_port}/"+level["id"]+"/",level["id"])
                    finally: page.close()
                browser.close()
        finally: server.shutdown()
