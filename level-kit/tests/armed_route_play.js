// 从玩家位置选择路标和当前可见敌人，所有位移、伤害和结算均由游戏处理。
function playArmedRoute({via,reward,stage}) {
  const {game:g,camera}=run,p=g.player,story=g.story;
  const {distance,see,buttons,aim,tap,ray}=playInputs(run);
  const points=via.map(([x,z,y])=>({x,z,y:y??g.level.base(x,z)}));
  points.push(story.target);
  let leg=0,lastWaypoint,steps=0;
  const convoy=g.objective.convoy,defense=story.defense,docks=new Set();
  const rifts=story.rifts,gateOrder=[];
  let defenseDeployed=false;
  const actor=()=>{const v=g.objective.drone.position;return {x:v.x,y:v.y-1,z:v.z};};
  const phases=new Set(),captured=new Set(),peaks={};
  let combatScore=0;
  function countGuards(){
    for(const b of g.beasts.pool.filter(b=>b.active && story.isCurrentGuard(b))){
      const section=peaks[b.sectionRoom]??={deployed:0,visible:0,threats:0,melee:0};
      section.deployed++;
    }
  }
  countGuards();
  function advance(){
    for(let i=0;i<90 && g.phase==='play' && g.time<165;i++){
      // 第二次火口行动在吊桥等第一轮涨潮，再带着可选收藏走反向路线。
      if(stage==='caldera-rift-works' && reward && g.time<30){g.step(.033);continue;}
      const loot=reward && g.pickups.objects.find(o=>o.active && o.name===reward);
      if(loot && distance(p,loot)<1.6)tap('KeyF');
      let target;
      if(rifts){
        const {chargesCollected,riftsDestroyed}=rifts.result();
        const gate=rifts.gates[reward?2-riftsDestroyed:riftsDestroyed];
        const task=chargesCollected===riftsDestroyed?rifts.cases[riftsDestroyed]:gate;
        target=loot ?? (gate.state==='armed'?gate.retreatPoint:task.position);
        if(!loot && gate.state!=='armed' && distance(p,target)<1.8)tap('KeyF');
        leg=2*riftsDestroyed+Number(chargesCollected>riftsDestroyed);
      }else if(defense){
        const task=defense.target;
        if(!defense.started){
          target=loot||task;
          if(!loot && distance(p,target)<2.15)tap('KeyF');
        }else if(defense.boardable){
          target=task;if(distance(p,task)<2.15)tap('KeyF');
        }else{
          // 沿内侧掩体换位，优先应对最先到达入口的存活敌群。
          const lanes=defense.lanes.map(l=>{
            const guards=g.beasts.pool.filter(b=>b.active && b.sectionRoom===l.name);
            const near=Math.min(...guards.map(b=>distance(b,l.point)));
            return {lane:l,score:near+Math.max(0,l.delay-defense.elapsed)*2};
          }).sort((a,b)=>a.score-b.score);
          const l=lanes[0].lane,[x,z]=l.inside;target={x,y:g.level.base(x,z),z};
        }
        leg=defense.started?1:0;
      }else if(convoy){
        leg=convoy.index;
        target=actor();
        if(convoy.dock){
          docks.add(convoy.dock.name);
          if(docks.size===1 && loot)target=loot;
          else if(distance(p,target)<2.3)tap('KeyF');
        }
      }else{
        target=points[leg];
        if(leg<points.length-1 && distance(p,target)<1.05 && Math.abs(target.y-p.y)<1.2){leg++;continue;}
      }
      const next=story.navigation({stage:'walk-'+leg,target},g).waypoint??target;
      lastWaypoint=[next.x,next.y,next.z];
      const visible=g.beasts.pool.filter(b=>b.active && see(b)).sort((a,b)=>distance(p,a)-distance(p,b));
      const enemy=visible[0],gap=enemy?distance(p,enemy):Infinity;
      const dx=next.x-p.x,dz=next.z-p.z;
      const range=defense?29:17;
      if(gap<range)aim(Math.atan2(enemy.y+enemy.height*.75-p.y-p.eye,gap)-p.recoil,Math.atan2(p.x-enemy.x,p.z-enemy.z));
      else aim(0,Math.atan2(-dx,-dz));
      const yaw=p.look.rotation.y;
      const front=-dx*Math.sin(yaw)-dz*Math.cos(yaw),right=dx*Math.cos(yaw)-dz*Math.sin(yaw);
      const keys=new Set();
      if(Math.abs(front)>Math.abs(right)*.4)keys.add(front>0?'KeyW':'KeyS');
      if(Math.abs(right)>Math.abs(front)*.4)keys.add(right>0?'KeyD':'KeyA');
      if(front>0 && gap>8)keys.add('ShiftLeft');
      if(convoy && distance(p,target)<(target===loot ? .35 : convoy.dock ? 1.6 : 2.5))keys.clear();
      if(defense && distance(p,target)<(target===loot ? .35 : .8))keys.clear();
      if(p.hp<64 && g.kit.remaining().medkit)tap('Digit1');
      buttons(keys,gap<range);
      g.step(.033);
      if(rifts)for(const [j,gate] of rifts.gates.entries()){
        if(gate.state==='destroyed' && !gateOrder.includes(j))gateOrder.push(j);
      }
      if(rifts?.countingDown && !captured.has('pauseFuse')){
        captured.add('pauseFuse');buttons(new Set(),false);return {pauseFuse:true};
      }
      if(defense?.started && !defenseDeployed){countGuards();defenseDeployed=true;}
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
        const midway=convoy && leg>=4;
        const pressure=rifts ? Math.min(screen,6)+Math.max(0,16-gap)*.7 : 0;
        if((!captured.has('combat') || rifts && pressure>combatScore+2) && screen>=3 && gap>=3 && gap<(defense?14:convoy || rifts?17:10) &&
            (defense?defense.elapsed>10:convoy?midway:g.time>1)){
          combatScore=pressure;captured.add('combat');buttons(new Set(),false);return {shot:'combat'};
        }
      }
      const landmark=rifts && leg%2===1 && distance(p,target)>7 && distance(p,target)<12 ? [target.x,target.y+2,target.z] :
        stage==='dune-signal-terrace' && p.z>3 && p.z<10 ? [-6,11.8,-26] :
        stage==='waterfall-temple-defense' && p.z<9 && p.z>2 ? [-25,10,-8] :
        stage==='tower-observation-defense' && p.z<31 && p.z>19 && p.x>12 ? [-1.5,23,-13] :
        stage==='sunken-rooftop-recovery' && leg===7 && p.x>-7 ? [22,8,-25] :
        stage==='frost-sample-escort' && leg===6 && p.x<5 ? [23,3,-4] :
        stage==='steam-service-rail' && leg===7 && p.x>-9 ? [20,9,-23] :
        stage==='storm-city-overpass' && p.x>8 && p.x<16 && p.z<0 ? [19,9.5,-16] :
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
      captured:[...captured],gateOrder,vault:g.field?.vaultStage,portalSpawns:rifts?.gates.map(gate=>gate.spawned),docks:[...docks],escort:g.objective.result(g),actor:convoy && actor(),lanes:defense?.lanes.map(l=>l.hp),shots:g.performance.shots,kills:g.kills,ammo:[g.weapon.ammo,g.weapon.reserve],phases:[...phases],peaks,
      loot:g.loot.map(o=>o.name)}};
  }
  return {advance};
}
