// 用正式对象检查单独到达、掉队会合、拦截、损毁重开及两次独立行进。
function checkConvoy(){
  const {game:g}=run,{objective:o,story:s,player:p,level:l}=g,convoy=o.convoy,v=o.drone.position;
  const modes=document.querySelector('#mission-mode'),at=(x,y,z)=>Object.assign(p,{x,y,z});
  const start=mode=>{modes.value=mode;g.reset();g.phase='play';};
  const tick=dt=>{g.time+=dt;g.encounter.update(g,dt);o.step(dt,g);s.step(dt,g);};
  const join=()=>at(v.x,v.y-1,v.z);
  const require=(condition,message)=>{if(!condition)throw Error(message);};
  require(modes.value==='escort','默认行动');
  start('endless');
  require(!s.managed && g.beasts.boss && g.beasts.live>=35,'无尽首波');
  start('escort');
  const count=g.beasts.live;
  const env=g.encounter;
  if(o.escortName==='技术员'){
    env.temperature=61;at(-22,l.base(-22,16),16);g.time=16;env.update(g,1);
    require(env.temperature>61 && env.beastSpeedScale>1,'暴雪时室内回温及室外压力');
  }else if(o.escortName==='检修车'){
    at(4,l.base(4,19),19);const z=p.z;env.update(g,.1);
    require(p.z<z,'侧路传送带未移动玩家');
  }
  for(const item of g.pickups.objects.filter(i=>i.kind==='rare' && i.active)){
    require(!l.blocked(item.x,item.z,item.y,p.radius,p.height),'战利品不可达 '+item.name);
  }
  at(l.gate.x,l.gate.y,l.gate.z);
  const initial=v.clone();
  tick(.1);tick(.2);
  require(convoy.waiting && g.phase==='play' && v.equals(initial),'玩家单独抵达时对象应停等');
  join();tick(.1);
  require(!convoy.waiting && !v.equals(initial),'会合后未恢复');
  const b=g.beasts.pool.find(b=>b.active && b.droneRaider);
  Object.assign(b,{x:v.x,y:v.y-1,z:v.z+1.8,roomAlert:true,stun:0});
  at(v.x,v.y-1,v.z+.9);
  require(!s.stepBeast(b,g,.03) && !b.droneAttack,'玩家未能拦截');
  at(v.x+3,v.y-1,v.z+.9);
  const barrier=l.box(v.x,v.z+.9,1.4,.25,b.y,b.y+3);
  s.stepBeast(b,g,.03);
  require(!b.droneAttack,'袭击穿过实体遮挡');
  l.setBarrier(barrier,null,false);
  s.stepBeast(b,g,.03);g.time+=1;s.stepBeast(b,g,.03);
  require(o.escortHealth===91,'有视线的突袭未造成伤害');
  o.damageDrone(100,g);
  require(g.phase==='fail' && document.querySelector('#menu-text').textContent.includes(o.escortName),'护送对象损毁原因');
  start('escort');at(l.gate.x,l.gate.y,l.gate.z);g.time+=20;p.hurtDelay=0;p.hurt(10000,g);
  require(g.phase==='fail','玩家死亡未结算');
  const finish=g.finish.bind(g);let wins=0;
  g.finish=(won,reason)=>{if(won)wins++;return finish(won,reason);};
  const reports=[];
  for(const offset of [0,23]){
    start('escort');g.time=offset;
    require(o.escortHealth===100 && g.kills===0 && g.beasts.live===count,'失败重开');
    const docks=[],phases=new Set();
    for(let i=0;i<3000 && g.phase==='play';i++){
      join();
      if(convoy.dock){
        const dock=convoy.dock,saved=v.clone();tick(.1);
        require(convoy.dock===dock && v.equals(saved),'等待交接时移动');
        if(dock.door)require(s.doorStates[dock.door],'闸门提前开启');
        require(s.interact(g),'交接未响应');
        if(dock.door)require(!s.doorStates[dock.door],'闸门未开启');
        docks.push(dock.name);
      }
      tick(.05);phases.add(g.encounter.phase);
    }
    require(g.phase==='win' && convoy.finished && o.result(g).escorted && docks.length===2,'存活抵达验收');
    reports.push({docks,phases:[...phases],live:count});
  }
  require(wins===2,'胜利应每局只结算一次');
  return reports;
}
