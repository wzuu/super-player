// 驱动浏览器的键盘、鼠标事件。瞄准和移动均经正式输入监听器，生命、弹药与门态只读。
function playAnnihilation({rewardName,roomName,roomAt,takeReward}) {
  const {game:g,camera}=run, p=g.player, story=g.story;
  const {ray,distance,tap,buttons,aim,see}=playInputs(run),captured=new Set();
  const report={groups:[],shots:0,peaks:{},log:[]};
  let lastStage=-1,extrasDone=false,latest=null;
  // 观察墙边和酸池，选择仍有侧移空间的方向，避免一直后退到来路死角。
  function bossFootwork(enemy){
    const home=g.level.bossAnchor, pools=g.projectiles.puddles;
    let best=null,score=-Infinity;
    for(let i=0;i<16;i++){
      const a=i*Math.PI/8,dx=Math.cos(a),dz=Math.sin(a);
      let clear=0;
      for(let d=.5;d<=5;d+=.5){
        const x=p.x+dx*d,z=p.z+dz*d,y=g.level.base(x,z);
        if(g.level.blocked(x,z,y,p.radius,p.height))break;
        clear=d;
      }
      if(clear<1.5)continue;
      const dest={x:p.x+dx*clear,z:p.z+dz*clear};
      const pressure=pools.some(o=>o.life>0 && distance(o.pos,dest)<3.5);
      const value=-Math.abs(distance(dest,enemy)-13)+clear*.6-Math.max(0,distance(dest,home)-11)*2-(pressure?12:0);
      if(value>score){score=value;best=dest;}
    }
    return best;
  }
  function step() {
    const goal=story.guide(g,{}), enemies=g.beasts.pool.filter(b=>b.active);
    const visible=enemies.filter(see).sort((a,b)=>distance(p,a)-distance(p,b));
    const enemy=visible[0];
    const want=new Set();
    let target=goal.target;
    if(story.stage==='use' && takeReward && !extrasDone && story.encounters.length===2 &&
       story.encounters[1].clearedAt) {
      const loot=g.pickups.objects.find(item=>item.active && item.name===rewardName);
      target=enemies.find(b=>b.sectionRoom===roomName)??loot??{x:roomAt[0],y:g.level.base(...roomAt),z:roomAt[1]};
      if(loot && distance(p,loot)<1.4)tap('KeyF');
      if(g.loot.some(item=>item.name===rewardName)){extrasDone=true;target=goal.target;}
    }
    let dest=target && (story.navigation({...goal,target},g).waypoint??target);
    const gap=enemy?distance(p,enemy):Infinity;
    if(enemy){
      const yaw=Math.atan2(p.x-enemy.x,p.z-enemy.z);
      const faceDistance=enemy.type===3?Math.max(.45,gap-enemy.radius):gap;
      aim(Math.atan2(enemy.y+enemy.height*.84-p.y-p.eye,faceDistance)-p.recoil,yaw);
      if(gap<(enemy.type===3?10:5.5))want.add('KeyS');
      if(enemy.type===3 || gap<4.2)want.add(Math.sin(g.time*.57)>0?'KeyA':'KeyD');
      if(enemy.type===3 && enemy.fight?.winding)tap('Space');
      if(gap<24 && g.weapon.ammo+g.weapon.reserve>0)dest=null;
      if(enemy.type===3){want.clear();dest=bossFootwork(enemy);}
    } else if(dest)aim(0,Math.atan2(p.x-dest.x,p.z-dest.z));
    if(story.stage==='boss' && g.weapon.ammo+g.weapon.reserve<170) {
      const supply=g.pickups.objects.filter(i=>i.active && i.permanent && i.kind==='ammo' &&
        distance(i,g.level.bossAnchor)<25).sort((a,b)=>distance(a,p)-distance(b,p))[0];
      if(supply){
        dest=story.navigation({target:supply,stage:'resupply'},g).waypoint??supply;
        want.clear();
      }
    }
    if(dest && distance(p,dest)>.015) {
      const dx=dest.x-p.x,dz=dest.z-p.z,yaw=p.look.rotation.y;
      const front=-dx*Math.sin(yaw)-dz*Math.cos(yaw), right=dx*Math.cos(yaw)-dz*Math.sin(yaw);
      if(Math.abs(front)>Math.abs(right)*.45)want.add(front>0?'KeyW':'KeyS');
      if(Math.abs(right)>Math.abs(front)*.45)want.add(right>0?'KeyD':'KeyA');
    }
    if(story.stage==='use' && story.target===target && distance(p,target)<2.35)tap('KeyF');
    if(p.hp<63 && g.kit.remaining().medkit)tap('Digit1');
    if(!enemy && g.weapon.ammo<60 && g.weapon.reserve)tap('KeyR');
    buttons(want,Boolean(enemy));
    latest={to:dest && [dest.x,dest.y,dest.z],keys:[...want],yaw:p.look.rotation.y,enemy:enemy?.sectionRoom};
    const stage=story.recoveryStage;
    if(stage!==lastStage) {lastStage=stage;report.log.push([stage,Math.round(g.time),Math.round(p.hp)]);}
    const before=performance.now();g.step(.033);
    const cost=performance.now()-before;
    if(enemy?.type===3 && enemy.fight?.started && gap>4 && gap<18 && !captured.has('boss'))return 'boss';
    const group=story.encounters.at(-1);
    if(group && !report.groups.includes(group.name)){
      report.groups.push(group.name);report.peaks[group.name]={count:group.spawned,deploymentMs:cost,visible:0,threats:0,melee:0};
    }
    if(group && !group.clearedAt){
      const peak=report.peaks[group.name];
      const onScreen=visible.filter(b=>{
        ray.set(b.x,b.y+b.height*.55,b.z).project(camera);
        return Math.abs(ray.x)<=1 && Math.abs(ray.y)<=1 && ray.z>=-1 && ray.z<=1;
      });
      peak.visible=Math.max(peak.visible,onScreen.length);
      peak.threats=Math.max(peak.threats,visible.filter(b=>b.alert>0 && distance(b,p)<(b.type===2?16:5)).length);
      peak.melee=Math.max(peak.melee,visible.filter(b=>b.type!==2 && b.mode==='windup').length);
      if(onScreen.length>=2 && gap>=3 && gap<16 && !captured.has('combat'))return 'combat';
    }
    const turning=roomName==='月桂花园' ? p.y< -2.8 && stage<4 : p.x< -31 && p.z>-6 && stage===4;
    if(turning && !captured.has('transition'))return 'transition';
    return null;
  }
  return {
    advance() {
      for(let i=0;i<120 && g.phase==='play' && g.time<720;i++) {
        const shot=step();
        if(shot){captured.add(shot);return {shot};}
      }
      if(g.phase==='play' && g.time<720)return {};
      buttons(new Set(),false);
      return {done:{...report,phase:g.phase,time:g.time,kills:g.kills,ammo:[g.weapon.ammo,g.weapon.reserve],
        shots:g.performance.shots,hits:g.performance.hits,hp:p.hp,loot:g.loot.map(i=>i.name),at:[p.x,p.y,p.z],
        boss:g.beasts.boss && [g.beasts.boss.hp,g.beasts.boss.maxHP,g.beasts.boss.fight.breaks,g.beasts.boss.fight.stage],
        latest,task:story.guide(g,{})?.title}};
    }
  };
}
