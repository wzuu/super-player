"""使用真实打包入口核对玩家转向、攻击来源、EMP 和近身预警。"""


def check_hit_feedback(page):
    page.evaluate("""() => {
      const {game:g,config,camera}=run, {player:p,ui}=g, cfg=config.feedback;
      const expect=(value,message)=>{if(!value)throw Error(message)};
      g.phase='play';g.time=30;p.x=0;p.y=30;p.z=0;p.escaped=true;
      cfg.directionIndicators=true;cfg.hitShake=1;config.player.steady=false;
      p.look.rotation.set(0,1.1,0,'YXZ');
      const bearing=(node)=>Number(node.dataset.angle);
      const error=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
      const visibleArcs=()=>[...document.querySelectorAll('.damage-arc')].filter(n=>!n.hidden);
      for(let degrees=0;degrees<360;degrees+=15){
        p.hitDirections.fill(-Infinity);p.hp=config.player.health;p.hurtDelay=0;
        const angle=degrees*Math.PI/180;
        const source={x:p.x+Math.sin(angle)*4,z:p.z-Math.cos(angle)*4,type:2};
        expect(p.hurt(8,g,0,source),'四周受击');
        ui.updateDirections(g);
        const arcs=visibleArcs();
        expect(arcs.length===1 && error(bearing(arcs[0]),angle+p.look.rotation.y)<=Math.PI/8+1e-7,'转身后的攻击方位 '+degrees);
      }
      const saved=p.look.quaternion.clone(), base=p.baseFov;
      p.positionCamera(0);
      expect(camera.fov<base && g.hitStop>=.03 && g.hitStop<=.05,'受击视野与顿帧');
      p.positionCamera(cfg.impactDuration);
      expect(camera.fov===base && saved.equals(p.look.quaternion),'镜头归位并保留玩家朝向');
      p.hitDirections.fill(-Infinity);p.hurtDelay=0;
      g.projectiles.reset();
      const shooter={type:2,x:-4,y:30,z:0,height:config.beasts.types[2].height};
      g.projectiles.launch(shooter,p);shooter.x=4;
      for(let i=0;i<36 && !Number.isFinite(p.hitDirections[6]);i++)g.projectiles.update(.015,p,g);
      expect(p.hitDirections[6]===g.time && !Number.isFinite(p.hitDirections[2]),'弹丸保留发射位置');
      p.hurtDelay=0;
      p.hitDirections.fill(-Infinity);
      const right={x:4,z:0,type:0};
      p.hurt(1,g,0,right);g.time+=cfg.mergeWindow/2;p.hurt(1,g,0,right);
      expect(p.hitDirections[2]===30,'同方向短间隔合并');
      p.hp=config.player.health*.25;
      p.damageVignette=0;ui.update(.1,g);
      expect(ui.nodes.hud.hasAttribute('data-critical') && +ui.nodes.injury.style.opacity>0,'低生命暗角与血量');
      g.time+=cfg.arcDuration;ui.updateDirections(g);
      expect(visibleArcs().length===0,'伤害弧线退场');
      for(const beast of g.beasts.pool)beast.active=false;
      for(const z of [-1,-2,-3,-4,-4.5,8])g.beasts.spawn(0,p.x,p.z+z,p.y,0);
      g.level.box(-.3,0,.12,1,30,35);
      expect(g.beasts.spawn(0,-1.3,0,30,0),'遮挡测试需生成墙后的凶兽');
      ui.updateDirections(g);
      expect(ui.nearWarnings.filter(n=>!n.hidden).length===cfg.warningCount,'近身预警上限');
      expect(ui.nearest[0].range2===1 && ui.nearest.at(-1).range2===16,'只保留最近四只');
      cfg.directionIndicators=false;p.hurt(1,g,0,right);
      ui.updateDirections(g);
      expect(!visibleArcs().length && !ui.directions.hidden && !ui.nearWarnings[0].hidden,'关闭受击方向保留近身预警');
      cfg.hitShake=0;p.hurt(1,g,0,right);p.positionCamera(0);
      expect(camera.fov===base,'零震动保留基础视野');
      g.phase='pause';
    }""")
    print("PASS 24 个攻击方位、合并与淡出、血量、镜头归位、近身预警与遮挡", flush=True)


def check_emp_feedback(page):
    page.evaluate("""() => {
      const {game:g,config}=run, {encounter:emp,ui,player:p,sound}=g;
      p.aimRequested=p.aiming=true;p.ads=1;
      g.time=emp.next;emp.update(g,0);ui.update(.1,g);
      if(!emp.hudOffline || !ui.directions.hidden)throw Error('真实 EMP 未中断方向提示');
      if(getComputedStyle(ui.aimDot).visibility!=='hidden' || getComputedStyle(ui.ring).visibility!=='hidden')throw Error('EMP 应隐藏开镜红点与换弹环');
      const heard=[],hurt=sound.hurt;
      sound.hurt=function(type){heard.push(type);return hurt.call(this,type)};
      p.escaped=true;p.hurtDelay=0;p.hp=config.player.health*.31;
      g.time=emp.ends-.05;
      p.hurt(6,g,0,{x:p.x+2,z:p.z,type:1});
      ui.update(.1,g);
      if(heard[0]!==1 || !ui.nodes.hud.hasAttribute('data-critical') || !ui.directions.hidden)throw Error('EMP 受击反馈');
      sound.hurt=hurt;
      g.time=emp.ends+.01;emp.update(g,0);ui.update(.1,g);
      if(emp.hudOffline || ui.directions.hidden || ui.damageArcs.some(node=>!node.hidden))throw Error('恢复供电时不补播断电期间的受击');
      if(ui.aimDot.hidden || getComputedStyle(ui.aimDot).visibility==='hidden')throw Error('EMP 恢复后应看见当前瞄准红点');
    }""")
    print("PASS 霓雨下城 EMP 期间方向隐藏、受击声音、危血与供电恢复", flush=True)
