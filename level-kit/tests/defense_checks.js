// 离线逐侧验证栏体。固定对照只清除指定方向，留给另一侧守卫实际靠近、攻击与穿入。
function checkDefense(){
  const {game:g}=run,{player:p,level:l,story:s}=g,d=s.defense;
  const mode=document.querySelector('#mission-mode'),at=t=>Object.assign(p,{x:t.x,y:t.y,z:t.z});
  const assert=(value,msg)=>{if(!value)throw Error(msg);};
  const reset=selected=>{mode.value=selected;g.reset();g.phase='play';};
  const seed=()=>{let r=207;Math.random=()=>((r=(Math.imul(r,1664525)+1013904223)>>>0)/4294967296);};
  const alive=()=>g.beasts.pool.filter(b=>b.active);
  assert(mode.value==='hold','默认行动不是坚守');
  reset('endless');assert(!s.managed && g.beasts.boss,'无尽首波异常');
  const results=[];
  if(location.pathname.includes('waterfall-temple-defense')){
    const crossings=[];
    for(const offset of [20,7]){
      seed();reset('hold');at(d.target);g.time=offset;s.interact(g);
      const team=alive().filter(b=>b.sectionRoom==='东瀑木栏');
      const crossed=new Map(),phases=[];
      for(let i=0;i<850;i++){
        const dt=.04;g.time+=dt;g.encounter.update(g,dt);s.step(dt,g);g.beasts.refreshHash();
        if(Math.abs(d.elapsed-10)<.03)phases.push(g.encounter.phase);
        for(const b of team){
          s.stepBeast(b,g,dt);
          if(b.z< -9 && !crossed.has(b))crossed.set(b,b.x);
        }
      }
      assert(crossed.size>=4,'东瀑守卫未抵达水磨池南界');
      const xs=[...crossed.values()].sort((a,b)=>a-b);
      crossings.push({phase:phases[0],median:xs[Math.floor(xs.length/2)]});
    }
    assert(crossings[0].phase==='calm' && crossings[1].phase==='flood' &&
      crossings[1].median>crossings[0].median+1,'水位未改变实际进攻线 '+JSON.stringify(crossings));
    const a=run.camera.position.clone().set(33,l.base(33,-14)+.65,-14);
    const ray=a.clone().set(-24,l.base(-24,-16)+.85,-16).sub(a),length=ray.length();
    assert(!l.visible(a,ray.normalize(),length),'低地射线穿透祭台');
    results.push({crossings});
  }
  for(const breach of [false,true]){
    seed();reset('hold');
    const stage=s.stage,signal=d.target;
    assert(stage==='signal' && !d.started && !d.boardable && d.elapsed===0,'重开后信标状态');
    const loot=g.pickups.objects.filter(i=>i.active && i.kind==='rare');
    assert(loot.length===10 && loot.every(i=>!l.blocked(i.x,i.z,i.y,p.radius,p.height)),'战利品位置');
    const initial=alive().length;
    if(location.pathname.includes('dune-signal-terrace')){
      g.time=14;g.encounter.update(g,.01);assert(g.encounter.phase==='warning','缺少沙暴预警');
      const clearFog=run.scene.fog.density;
      g.time=19;g.encounter.update(g,.01);assert(run.scene.fog.density>clearFog,'沙暴未降低能见度');
    }
    if(signal.x!==l.gate.x || signal.z!==l.gate.z){
      at(l.gate);assert(!s.interact(g) && g.phase==='play','提前登机');
    }
    for(const b of alive())g.beasts.damage(b,1e6,g);
    at(signal);assert(s.interact(g) && d.started,'信标未激活');
    const tower=location.pathname.includes('tower-observation-defense');
    if(tower){
      at(l.gate);
      assert(!s.interact(g) && l.blocked(18,-25,l.base(18,-25),p.radius,p.height),'救援抵达前登机闸失效');
      at(signal);
    }
    const lane=d.lanes[0],waves=s.encounters.map(w=>w.spawned);
    function collides(lane){
      const {x,z,y}=lane.point,ray=run.camera.position.clone();
      const origin=ray.clone().set(x+(lane.alongX?0:1),y+.28,z+(lane.alongX?1:0));
      ray.set(lane.alongX?0:-1,0,lane.alongX?-1:0);
      return [l.blocked(x,z,y,.38,1.7),!l.visible(origin,ray,2)];
    }
    assert(d.lanes.every(k=>collides(k).every(Boolean)),'完整栏未同步阻挡角色与子弹');
    for(const b of alive())if(!breach || b.sectionRoom!==lane.name)g.beasts.damage(b,1e6,g);
    let crossed=false,openedAt=null;
    for(let i=0;i<3500 && g.phase==='play';i++){
      const dt=.04;g.time+=dt;g.encounter.update(g,dt);s.step(dt,g);
      g.beasts.refreshHash();
      for(const b of alive())if(s.isCurrentGuard(b)){
        const scripted=s.stepBeast(b,g,dt);
        if(!scripted && !lane.hp && Math.hypot(b.x-lane.inside[0],b.z-lane.inside[1])<6)crossed=true;
      }
      if(!lane.hp && openedAt===null){
        openedAt=d.elapsed;assert(collides(lane).every(v=>!v),'破口仍阻挡角色或弹道');
        assert(d.lanes.slice(1).every(k=>collides(k).every(Boolean)),'独立挡栏意外打开');
      }
      if(d.boardable){
        assert(d.elapsed===90 && !l.blocked(18,-25,l.base(18,-25),p.radius,p.height),'登机时间或闸门错误');
        at(d.target);assert(s.interact(g),'登机失败');
      }
    }
    assert(g.phase==='win' && d.lanes.slice(1).every(k=>k.hp===k.strength),'防守结算');
    assert(breach===crossed && (breach || lane.hp===lane.strength),'未实测破口敌人进入 '+JSON.stringify({breach,crossed,openedAt,hp:lane.hp}));
    results.push({initial,waves,openedAt,crossed,seconds:d.elapsed});
  }
  reset('hold');at(d.target);g.time=15;p.hurtDelay=0;p.hurt(10000,g);
  assert(g.phase==='fail','玩家阵亡应失败');reset('hold');assert(d.elapsed===0 && !d.started,'阵亡重开');
  return results;
}
