// 从玩家位置选择路标和当前可见敌人，所有位移、伤害和结算均由游戏处理。
function playBreakout({via,reward,stage}) {
  const {game:g,camera}=run,p=g.player,story=g.story;
  const {distance,see,buttons,aim,tap,ray}=playInputs(run);
  const points=via.map(([x,z,y])=>({x,z,y:y??g.level.base(x,z)}));
  points.push(story.target);
  let leg=0,lastWaypoint,steps=0;
  const phases=new Set(),captured=new Set(),peaks={};
  for(const b of g.beasts.pool.filter(b=>b.active)){
    const section=peaks[b.sectionRoom]??={deployed:0,visible:0,threats:0,melee:0};
    section.deployed++;
  }
  function advance(){
    for(let i=0;i<90 && g.phase==='play' && g.time<165;i++){
      const target=points[leg],last=leg===points.length-1;
      const loot=reward && g.pickups.objects.find(o=>o.active && o.name===reward);
      if(loot && distance(p,loot)<1.6)tap('KeyF');
      if(!last && distance(p,target)<1.05 && Math.abs(target.y-p.y)<1.2){leg++;continue;}
      const next=story.navigation({stage:'walk-'+leg,target},g).waypoint??target;
      lastWaypoint=[next.x,next.y,next.z];
      const visible=g.beasts.pool.filter(b=>b.active && see(b)).sort((a,b)=>distance(p,a)-distance(p,b));
      const enemy=visible[0],gap=enemy?distance(p,enemy):Infinity;
      const dx=next.x-p.x,dz=next.z-p.z;
      if(gap<17)aim(Math.atan2(enemy.y+enemy.height*.75-p.y-p.eye,gap)-p.recoil,Math.atan2(p.x-enemy.x,p.z-enemy.z));
      else aim(0,Math.atan2(-dx,-dz));
      const yaw=p.look.rotation.y;
      const front=-dx*Math.sin(yaw)-dz*Math.cos(yaw),right=dx*Math.cos(yaw)-dz*Math.sin(yaw);
      const keys=new Set();
      if(Math.abs(front)>Math.abs(right)*.4)keys.add(front>0?'KeyW':'KeyS');
      if(Math.abs(right)>Math.abs(front)*.4)keys.add(right>0?'KeyD':'KeyA');
      if(front>0 && gap>8)keys.add('ShiftLeft');
      if(p.hp<64 && g.kit.remaining().medkit)tap('Digit1');
      buttons(keys,gap<17);
      g.step(.033);
      phases.add(g.encounter?.phase??(g.encounter?.parading?'parade':'calm'));
      if(++steps%3===0){
        camera.updateMatrixWorld(true);
        const counts={};
        for(const b of visible){
          const count=counts[b.sectionRoom]??={visible:0,threats:0,melee:0};
          ray.set(b.x,b.y+b.height*.55,b.z).project(camera);
          if(Math.abs(ray.x)<=1 && Math.abs(ray.y)<=1 && ray.z>=-1 && ray.z<=1)count.visible++;
          if(b.alert>0 && distance(b,p)<(b.type===2?16:5))count.threats++;
          if(b.type!==2 && b.mode==='windup')count.melee++;
        }
        for(const [name,count] of Object.entries(counts)){
          if(!peaks[name])continue;
          for(const k of Object.keys(count))peaks[name][k]=Math.max(count[k],peaks[name][k]);
        }
        const screen=Object.values(counts).reduce((n,c)=>n+c.visible,0);
        if(!captured.has('combat') && screen>=3 && gap>=3 && gap<10 && g.time>1){
          captured.add('combat');buttons(new Set(),false);return {shot:'combat'};
        }
      }
      const landmark=stage==='storm-city-overpass' && p.x>8 && p.x<16 && p.z<0 ? [19,9.5,-16] :
        stage==='lantern-shrine-escape' && p.z<4 && p.z>-4 && p.x<15 ? [9,3.2,-18] :
        stage==='neon-northline-escape' && p.z<-8 && p.z>-16 && p.x<-16 ? [-22,4.2,-28] : null;
      if(!captured.has('transition') && landmark){
        buttons(new Set(),false);
        const [x,y,z]=landmark;
        aim(Math.atan2(y-p.y-p.eye,Math.hypot(x-p.x,z-p.z)),Math.atan2(p.x-x,p.z-z));
        captured.add('transition');return {shot:'transition'};
      }
    }
    if(g.phase==='play' && g.time<165)return {};
    buttons(new Set(),false);
    return {done:{phase:g.phase,leg,lastWaypoint,at:[p.x,p.y,p.z],time:g.time,hp:p.hp,live:g.beasts.live,
      shots:g.performance.shots,kills:g.kills,ammo:[g.weapon.ammo,g.weapon.reserve],phases:[...phases],peaks,
      loot:g.loot.map(o=>o.name)}};
  }
  return {advance};
}
