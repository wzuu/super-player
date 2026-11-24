"""雨城实际 Player/BeastAI 与关卡碰撞，逐帧验证首领截路、冲击波与挥砍。"""


def check_boss_attacks(page):
    return page.evaluate("""() => {
      const {game:g}=run,p=g.player,m=g.beasts,l=g.level,dt=1/60;
      g.reset();g.phase='play';
      m.pool.forEach(e=>e.active=false);m.live=0;m.refreshHash();
      // 已知尺寸的实心平台与窄门隔离地图随机物资，保留正式高度、移动、跳跃、门体及射线。
      l.box(0,0,36,36,29.8,30,true);
      const gate=l.box(0,1.8,4,.10,30,36), upper=l.box(0,3.8,3,2,32.8,33,true);
      l.setBarrier(gate,null,false); l.setBarrier(upper,null,false);
      const b=m.spawn(3,0,0,30), f=b.fight;
      const check=(ok,why)=>{if(!ok)throw Error(why)};
      const reset=(turn,dist=4)=>{
        g.time=10; p.reset(); Object.assign(p,{x:0,y:30,z:dist,hp:100,escaped:true,fallPeak:30});
        Object.assign(b,{x:0,y:30,z:0,fx:0,fz:1,dx:0,dz:0,mode:'move',stun:0,alert:20,playerVisible:true});
        Object.assign(f,{turn,next:g.time,started:true,winding:false,ground:null,stage:0,transitionUntil:0,
          weakUntil:0,brokenUntil:0,vx:0,vz:0,lastSeen:undefined});
        l.setBarrier(gate,null,false); l.setBarrier(upper,null,false); m.refreshHash();
        return {jump:false, held:()=>false};
      };
      const test=(kind,mode)=>{
        const controls=reset(kind==='slam'?1:2,kind==='slam'?5:3.8);
        if (mode==='wall') l.setBarrier(gate,null,true);
        if (mode==='upper') {l.setBarrier(upper,null,true);p.y=p.fallPeak=33;}
        let jumpAt=mode==='jump' ? f.rules.windup+(kind==='slam'?.28:-.28) : mode==='early' ? f.rules.windup-.34 : Infinity;
        let groundMarks=0,peakFeet=0,weak=false,previousHp=p.hp,hitAt=null;
        const paint=[];
        const begin=g.time;
        for(let i=0;i<190;i++) {
          const elapsed=g.time-begin;
          if(elapsed>=jumpAt) {controls.jump=true;jumpAt=Infinity;}
          controls.held=key=>mode==='leave' && elapsed>.22 && key==='KeyD';
          p.update(dt,controls,g);peakFeet=Math.max(peakFeet,p.y-30);
          g.time+=dt; m.ai.update(b,p,g,dt,i);
          if(f.winding || f.ground?.live) {
            p.look.rotation.set(-.24,0,0,'YXZ'); p.positionCamera(0);
            b.flash=.18; // 连射反馈与红白高亮下也必须提交独立的地面预警。
            const ts=performance.now(); m.render(dt,g.time); paint.push(performance.now()-ts);
            groundMarks=Math.max(groundMarks,m.groundMarks.count);
            if(!f.winding) check(f.ground.radius>=0,'反向波纹');
          }
          if(p.hp<previousHp && hitAt===null) hitAt=+(g.time-begin).toFixed(3);
          previousHp=p.hp; weak ||= f.weakUntil>g.time;
        }
        check(f.attack===kind && weak,'共享招式或反击窗口未到达');
        if(mode!=='wall' && mode!=='upper') check(groundMarks>3,'无可见地面提示 '+kind);
        paint.sort((a,b)=>a-b);
        return {hitAt,peakFeet:+peakFeet.toFixed(3),marks:groundMarks,
          paintP95Ms:+paint[Math.floor(.95*paint.length)].toFixed(2),paintMaxMs:+paint.at(-1).toFixed(2)};
      };
      const outcomes={};
      for(const kind of ['slam','sweep']) for(const mode of ['stand','jump','wall','upper',...(kind==='slam'?['early']:['leave'])]){
        const value=test(kind,mode);outcomes[kind+'-'+mode]=value;
        const hit=mode==='stand' || mode==='early' || mode==='jump' && kind==='sweep';
        check((value.hitAt!==null)===hit,kind+' '+mode+' '+JSON.stringify(value));
        if(mode==='jump')check(value.peakFeet>.65,'真实跳跃未升高');
      }
      const movement=reset(0,11); f.next=g.time+4;
      const mins=[]; let best=Infinity, predicted=false,clipped=false,hits=0,health=p.hp;
      for(let i=0;i<1800;i++){
        const before=Math.hypot(b.x-p.x,b.z-p.z);
        // 固定顺时针绕中央点横移；前方截击和实际物理接近都必须发生。
        p.look.rotation.set(0,Math.atan2(p.x,p.z),0,'YXZ');
        movement.held=key=>key==='KeyD'; p.update(dt,movement,g); g.time+=dt;
        m.ai.update(b,p,g,dt,i);
        const after=Math.hypot(b.x-p.x,b.z-p.z);
        best=Math.min(best,after);if(i%120===0) mins.push(+after.toFixed(2));
        const dx=(p.x-b.x)/after,dz=(p.z-b.z)/after;
        if(!f.winding && before>5 && Math.abs(dx*b.dz-dz*b.dx)>.12 && Math.hypot(f.vx,f.vz)>2) predicted=true;
        if(p.hp<health)hits++;health=p.hp;
        clipped ||= l.blocked(b.x,b.z,b.y,b.radius,b.height);
      }
      check(best<4 && predicted && !clipped && hits>0,'绕圈压迫 '+JSON.stringify({best,predicted,clipped,hits,mins}));
      outcomes.circle={best:+best.toFixed(2),touches:hits,distances:mins};
      reset(1,4);
      const stages=[];
      for(let stage=0;stage<3;stage++){
        f.turn=1;f.next=g.time; f.started=true; b.playerVisible=true;
        m.ai.update(b,p,g,dt,0); check(f.winding && f.attack==='slam','转场后共用前摇');
        g.time=f.next+.002;m.ai.update(b,p,g,dt,1);check(f.ground.live && f.weakUntil>g.time,'冲击波或弱点缺失');
        const before=b.hp;
        if(stage<2){
          m.damage(b,1e7,g,'weapon');
          check(f.stage===stage+1 && !f.ground.live && !f.winding && Math.abs(b.hp-b.maxHP*[.70,.35][stage])<.01,'伤害跨阶段');
          const bound=b.hp;m.damage(b,1e7,g,'weapon');
          check(b.hp===bound && bound<before,'转场保护失效');g.time=f.transitionUntil+.1;
        }
        stages.push([stage,Math.round(b.hp),b.summon]);
      }
      outcomes.transitions=stages;
      return outcomes;
    }""")


if __name__=="__main__":
    import os
    from playwright.sync_api import sync_playwright
    from combat_expansion import level_page
    with sync_playwright() as pw, pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER","chrome")) as browser:
        page=level_page(browser,"rain-city")
        print(check_boss_attacks(page),flush=True)
