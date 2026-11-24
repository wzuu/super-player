// 只观察正式模拟和实际视锥；所有玩家动作由外层浏览器键鼠完成。
function laboratoryPressure(path='cover') {
  const {game:g,camera,config}=run, p=g.player, groups=[], stages=new Map();
  const input={down:new Set(),fire:false}, taps=new Set(), samples=new Map(), owners=new WeakMap();
  let stage=null, mode='approach', yaw=0, pitch=0;
  const round=n=>Math.round(n*100)/100, gap=b=>Math.hypot(p.x-b.x,p.z-b.z);
  const origin=camera.position.clone(), ray=origin.clone(), point=origin.clone();
  function line(b){
    origin.set(p.x,p.y+p.eye,p.z);
    point.set(b.x,b.y+b.height*.65,b.z);
    ray.subVectors(point,origin);
    const length=ray.length();
    return g.level.visible(origin,ray.divideScalar(Math.max(.001,length)),length);
  }
  function field(b){
    if(!line(b))return false;
    point.project(camera);
    return Math.abs(point.x)<=1 && Math.abs(point.y)<=1 && point.z>=-1 && point.z<=1;
  }
  function event(b) {
    const bearing=Math.atan2(b.x-p.x,p.z-b.z),view=bearing+p.look.rotation.y;
    return {t:round(g.time-stage.open),d:round(gap(b)),type:b.type,id:b.id,action:mode,
      bearing:Math.round(bearing*180/Math.PI),view:Math.round(Math.atan2(Math.sin(view),Math.cos(view))*180/Math.PI)};
  }
  function first(o,k,b){if(!o[k])o[k]=event(b);}
  function sideOf(b) {return stage?.sides[b.sectionRoom?.replace(/(门卫|巡逻岗)$/, '')];}
  function trial(b) {
    const room=sideOf(b);
    if(!room)return null;
    let life=samples.get(b);
    if(!life || life.stage!==stage){life={stage}; samples.set(b,life);}
    return {room,life};
  }
  function actualDamage(b) {
    const pair=trial(b);
    if(pair)first(pair.room,'hurtPlayer',b);
  }
  const hurt=p.hurt.bind(p);
  p.hurt=(amount,game,cooldown,source,kind)=>{
    const before=p.hp, result=hurt(amount,game,cooldown,source,kind);
    if(stage && p.hp<before){
      stage.hits++;
      if(source)actualDamage(owners.get(source)??source);
    }
    return result;
  };
  const shoot=g.projectiles.launch.bind(g.projectiles);
  g.projectiles.launch=(b,...args)=>{
    const pair=trial(b);if(pair){first(pair.room,'attack',b);first(pair.room,'projectile',b);}
    const projectiles=g.projectiles, result=shoot(b,...args);
    const shot=projectiles.shots[(projectiles.shotCursor-1)%projectiles.shots.length];
    owners.set(shot.origin,{sectionRoom:b.sectionRoom,id:b.id,type:b.type,x:b.x,z:b.z});
    return result;
  };
  const splat=g.projectiles.splat.bind(g.projectiles);
  g.projectiles.splat=(shot,...args)=>{
    const projectiles=g.projectiles, before=projectiles.puddleCursor, result=splat(shot,...args);
    if(before!==projectiles.puddleCursor && owners.has(shot.origin))
      owners.set(projectiles.puddles[before%projectiles.puddles.length].pos,owners.get(shot.origin));
    return result;
  };
  const hit=g.beasts.damage.bind(g.beasts);
  g.beasts.damage=(b,...args)=>{
    const pair=trial(b),before=b.hp,was=b.active,result=hit(b,...args);
    if(pair && b.hp<before)first(pair.room,'hitGuard',b);
    if(pair && was && !b.active){
      first(pair.room,'firstKill',b);
      if(!pair.life.contact)first(pair.room,'killBeforeContact',b);
      samples.delete(b);
    }
    return result;
  };
  const names=[['安检折廊','安保室','防疫站'],['弯折运输廊','培养室','配电房'],['检修运输廊','梯井值班室','机柜室']];
  const part=['front','left','right'];
  const closeDistances=[2,2,2];
  function observe(){
    const record=g.story.encounters.at(-1);
    if(!record)return;
    if(!stages.has(record)){
      const n=groups.length;if(n>2)return;
      stage={name:record.name,open:record.enteredAt,hits:0,sides:{},bearings:{},types:[{},{},{}],phases:{},shots:g.performance.shots};
      for(let i=0;i<3;i++)stage.sides[names[n][i]]={side:part[i]};
      groups.push(stage);stages.set(record,stage);
    }
    if(record.clearedAt || stage!==stages.get(record))return;
    camera.updateMatrixWorld(true);
    if(!stage.phases[mode])stage.phases[mode]={t:round(g.time-stage.open),at:[round(p.x),round(p.z)],hp:round(p.hp)};
    if(g.performance.shots>stage.shots && stage.firstShot==null)stage.firstShot=round(g.time-stage.open);
    for(const b of g.beasts.pool){
      if(!b.active || b.type>2)continue;
      const pair=trial(b);if(!pair)continue;
      const {room,life}=pair,d=gap(b),typed=stage.types[b.type];
      const seen=field(b);
      if(seen) {first(room,'visible',b); life.visible??=g.time;}
      const heard=b.heardAt>=stage.open && b.heardAt<=g.time;
      if(heard)first(room,'heardShot',b);
      if(heard && !b.roomAlert && life.yaw!==undefined){
        const target=Math.atan2(b.heardX-b.x,b.heardZ-b.z);
        const err=a=>Math.abs(Math.atan2(Math.sin(a-target),Math.cos(a-target)));
        if(err(life.yaw)-err(b.yaw)>.012)first(room,'turnedToShot',b);
      }
      if(b.roomAlert && b.playerVisible && line(b))first(room,'sawPlayer',b);
      const dx=b.x-(life.x??b.x),dz=b.z-(life.z??b.z);
      if(!b.roomAlert && life.yaw!==undefined && !heard){
        if(Math.hypot(dx,dz)>.005)first(room,'patrol',b);
        if(Math.abs(Math.sin(life.yaw-b.yaw))>.005)first(room,'scan',b);
      }
      const toward=(dx*(p.x-b.x)+dz*(p.z-b.z))/Math.max(.001,d);
      if(b.roomAlert && b.alert>0 && toward>.006 && line(b))first(room,'pursued',b);
      if(life.yaw!==undefined && b.roomAlert && b.playerVisible && line(b)){
        const target=Math.atan2(p.x-b.x,p.z-b.z);
        const error=a=>Math.abs(Math.atan2(Math.sin(a-target),Math.cos(a-target)));
        if(error(life.yaw)-error(b.yaw)>.012)first(room,'turned',b);
      }
      if(life.visible!==undefined && d<=closeDistances[b.type] && line(b) && !life.contact) {
        life.contact=true;
        const elapsed=round(g.time-life.visible);
        if(!typed.contact)typed.contact={...event(b),visibleToContact:elapsed};
        (typed.contactTimes??=[]).push(elapsed);
      }
      if(b.type===1 && b.mode==='charge' && life.visible!==undefined && d<=2 && line(b) && !typed.chargeContact)
        typed.chargeContact={...event(b),afterSight:round(g.time-life.visible),afterWarning:round(g.time-life.warning)};
      if(b.mode==='windup' && life.mode!=='windup' && line(b)){
        first(room,'threat',b);
        const bearing=event(b).bearing,arc=Math.abs(bearing)>145?'rear':bearing< -35?'left':bearing>35?'right':'front';
        first(stage.bearings,arc,b);
        if(life.visible!==undefined && !typed.windup)typed.windup={...event(b),afterSight:round(g.time-life.visible)};
        if(b.type===1 && b.chargeMarkLength>0 && life.mode!=='windup')life.warning=g.time;
      }
      if(b.mode==='charge' && life.mode!=='charge' && life.warning!==undefined){
        first(room,'attack',b);
        if(life.visible!==undefined && !typed.charge)typed.charge={...event(b),warning:round(g.time-life.warning),afterSight:round(g.time-life.visible)};
      }
      if(b.type===1 && life.mode==='charge' && b.mode!=='charge' && !b.chargeHit && !typed.evaded)typed.evaded=event(b);
      if(b.type!==2 && life.mode==='windup' && b.mode==='move' && d<config.beasts.types[b.type].reach+.2 && line(b))first(room,'attack',b);
      life.mode=b.mode;life.yaw=b.yaw;life.x=b.x;life.z=b.z;
    }
    if(mode==='retreat' && stage.coverTarget!=null){
      const b=g.beasts.pool.find(e=>e.id===stage.coverTarget && e.active && sideOf(e));
      if(b && !line(b) && !stage.cover)stage.cover={...event(b),hp:round(p.hp),at:[round(p.x),round(p.z)]};
    }
  }
  // 每段先观察门口、推进，接着打一个短点射，再退到原门框西侧；整局另记录实际侧房接近。
  function probe({group,route,move}) {
    if(!group || group.clearedAt || !stage || stage!==stages.get(group)){mode='route';return;}
    const n=groups.indexOf(stage), front=52-32*n, t=g.time-stage.open;
    const side=Math.abs(p.x)>8 && p.z>front-31 && p.z<front-1;
    if(side){
      const name=p.x<0?'left':'right';
      (stage.sideApproach??={})[name]??={t:round(t),at:[round(p.x),round(p.z)],shots:g.performance.shots-stage.shots};
    }
    const hold=path==='contact' && t<7 && p.hp>58 && !stage.endedHold;
    if(path==='contact' && !hold)stage.endedHold=true;
    if(hold){
      input.down.clear();taps.clear();input.fire=false;
      pitch=0;yaw=0;
      if(t<.8)mode='door-watch';
      else if(p.z>front-6.5){mode='advance';input.down.add('KeyW');}
      else mode='watch-contact';
      return;
    }
    if(t>4.4 || path==='contact'){
      if(path==='cover' && !stage.retreatEnd)stage.retreatEnd={t:round(t),hp:round(p.hp),at:[round(p.x),round(p.z)]};
      mode=side?'side-entry':'fight';return;
    }
    input.down.clear();taps.clear();input.fire=false;
    pitch=0;yaw=0;
    if(t<.8)mode='door-watch';
    else if(t<1.65){mode='advance';input.down.add('KeyW');}
    else if(t<2.05){mode='fire';
      const b=g.beasts.pool.filter(e=>e.active && sideOf(e)?.side==='front' && line(e)).sort((a,b)=>gap(a)-gap(b))[0];
      if(b){yaw=Math.atan2(p.x-b.x,p.z-b.z);pitch=Math.atan2(b.y+b.height*.8-p.y-p.eye,gap(b))-p.recoil;stage.coverTarget=b.id;}
      input.fire=true;
    }else {mode='retreat';const enemy=g.beasts.pool.filter(e=>e.active && sideOf(e)?.side==='front' && line(e)).sort((a,b)=>gap(a)-gap(b))[0];
      if(!stage.retreatStart && enemy){
        stage.coverTarget=enemy.id;
        stage.coverSide=Math.sign(enemy.x || p.x) || -1;
        stage.retreatStart={...event(enemy),hp:round(p.hp),at:[round(p.x),round(p.z)]};
      }
      const target={x:(stage.coverSide??-1)*6.4,y:0,z:front+2.5};
      const via=route(target)??target;
      move(via);
    }
  }
  function report(){
    return groups.map(s=>({...s,types:s.types.map(({contactTimes=[],...type})=>{
      contactTimes.sort((a,b)=>a-b);
      const n=contactTimes.length;
      return {...type,contactCount:n,medianSightToContact:n?round((contactTimes[(n-1)>>1]+contactTimes[n>>1])/2):null};
    })}));
  }
  return {input,observe,probe,report,get yaw(){return yaw;},
    begin(){taps.clear();input.reload=false;input.interact=false;yaw=p.look.rotation.y;pitch=p.look.rotation.x;},
    aim(x,y){pitch=x;yaw=y;},tap(k){taps.add(k);},
    command(){
      if(input.reload)taps.add('KeyR');if(input.interact)taps.add('KeyF');
      const unit=.002*config.player.mouseSpeed;
      const angle=yaw-p.look.rotation.y;
      return {keys:[...input.down],taps:[...taps],fire:input.fire,dx:Math.round(-Math.atan2(Math.sin(angle),Math.cos(angle))/unit),dy:Math.round((p.look.rotation.x-pitch)/unit)};
    }};
}
