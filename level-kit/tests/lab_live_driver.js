() => {
  const {game:g, input, camera, config} = run, p = g.player, w = g.weapon;
  let seed=617;
  Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const distance = (a,b) => Math.hypot(a.x-b.x, a.z-b.z);
  const ammo = () => [w.ammo,w.reserve];
  const report = { groups:[], gunBreaks:0, pulseBreaks:0, missed:false, sideRooms:false };
  const ray = camera.position.clone(), eye = ray.clone();
  let firstWindow = 0, reloads = 0, bossShots = 0, lastGroup = null, previous = '', stale = 0;
  const log = [];
  const reload = w.reload.bind(w);
  w.reload = game => { const before = w.reloadLeft; reload(game); if (!before && w.reloadLeft) reloads++; };
  function route(t) {
    if (!t) return null;
    const info = g.story.navigation({target:t}, {player:{x:p.x,y:p.y,z:p.z,lastHurt:-Infinity},time:g.time,beasts:{pool:[]}});
    return info.waypoint;
  }
  function move(t) {
    if (!t || distance(p,t)<.15) return;
    let dx=t.x-p.x,dz=t.z-p.z;
    const yaw=p.look.rotation.y;
    // 和玩家绕过紫色掉落一样，按左右平移从拾取半径外侧经过。
    for (const item of g.pickups.objects) {
      if (!item.active || item.style!=='precious' || distance(p,item)>config.pickups.grab+1.1) continue;
      const ox=p.x-item.x, oz=p.z-item.z, d=Math.max(.001,Math.hypot(ox,oz));
      if(dx*ox+dz*oz>=0)continue;
      const side=dx*oz-dz*ox>=0?1:-1;
      dx=(oz*side+ox*.45)/d;dz=(-ox*side+oz*.45)/d;
    }
    const forward = -dx*Math.sin(yaw)-dz*Math.cos(yaw);
    const right = dx*Math.cos(yaw)-dz*Math.sin(yaw);
    if (Math.abs(forward) > Math.abs(right)*.42) input.down.add(forward>0?'KeyW':'KeyS');
    if (Math.abs(right) > Math.abs(forward)*.42) input.down.add(right>0?'KeyD':'KeyA');
  }
  function visible(b) {
    eye.set(p.x,p.y+p.eye,p.z);
    ray.set(b.x-eye.x,b.y+b.height*.70-eye.y,b.z-eye.z);
    const d=ray.length();
    return g.level.visible(eye,ray.divideScalar(Math.max(.001,d)),d);
  }
  let escape = null;
  function strafe(threats, step) {
    if (step % 5 && escape && distance(p,escape)>1) return escape;
    let best=-Infinity;
    for(let i=0;i<20;i++) {
      const angle=2*Math.PI*i/20, dx=Math.cos(angle),dz=Math.sin(angle);
      let span=0;
      for(let j=.4;j<=6;j+=.4) {
        if(g.level.blocked(p.x+j*dx,p.z+j*dz,p.y,p.radius,p.height)) break;
        span=j;
      }
      if(span<1)continue;
      const q={x:p.x+dx*Math.min(span,3),y:p.y,z:p.z+dz*Math.min(span,3)};
      const score=Math.min(10,...threats.map(b=>distance(b,q))) + span*.6 +
        (escape ? .12*(dx*(escape.x-p.x)+dz*(escape.z-p.z)) : 0);
      if(score>best){best=score;escape=q;}
    }
    return escape;
  }
  for(let step=0; step<32000 && g.phase==='play'; step++) {
    const s=g.story, target=s.target, state=s.stage, b=g.beasts.boss;
    const raw = s.guide(g,{keyItem:'核心'});
    if ([[-17.5,15],[19,11.5]].some(([x,z])=>Math.abs(p.x-x)<2.4 && Math.abs(p.z-z)<2.1)) report.sideRooms=true;
    const creatures = g.beasts.pool.filter(e=>e.active && visible(e)).sort((a,b)=>distance(a,p)-distance(b,p));
    let enemy=creatures[0], dest=null;
    const group=s.encounters.at(-1);
    if(group!==lastGroup && group) {
      lastGroup=group;
      report.groups.push({name:group.name,enterShots:g.performance.shots,enterReloads:reloads});
    }
    if(group?.clearedAt && report.groups.at(-1).shots===undefined) {
      const record=report.groups.at(-1);
      record.shots=g.performance.shots-record.enterShots;record.reloads=reloads-record.enterReloads;
    }
    if(raw?.stage!==previous) {
      previous=raw?.stage; stale=g.time;
      log.push([previous, Math.round(g.time),Math.round(p.x),Math.round(p.z),Math.round(p.hp),...ammo()]);
    }
    if(g.time-stale>225) break;
    input.down.clear();input.fire=false;
    if(state==='boss' && b) {
      const f=b.fight, device=g.field.device;
      if(!report.doorAmmo) { report.doorAmmo=ammo();bossShots=g.performance.shots; }
      if(!report.enterAmmo && p.z<9.3 && Math.abs(p.x)<11) report.enterAmmo=ammo();
      if (!firstWindow && f.weakUntil>g.time) firstWindow=f.weakUntil;
      report.missed=Boolean(firstWindow && g.time>=firstWindow);
      if (p.z>9 || !report.pulseBreaks && distance(p,device)>1.8) dest=route(device);
      else if (report.missed && !report.pulseBreaks && distance(b,device)<6.9 && distance(p,device)<2.45 &&
               f.brokenUntil<=g.time && f.transitionUntil<=g.time) input.interact=true;
      if (f.winding && Math.hypot(p.x-f.aimX,p.z-f.aimZ)<3.7) dest=route({x:p.x>6?2:9,y:0,z:2.5});
      if (enemy===b && (!report.missed || f.transitionUntil>g.time)) enemy=null;
      if (!enemy && !dest && !visible(b)) dest=route(b);
    } else if(state==='boss' && g.pickups.keyItem) {
      const key=g.pickups.keyItem;
      dest=route(key);
      if(!dest && visible({...key,height:1}))dest=key;
      input.interact=g.pickups.nearKey(p);
    } else if (state==='fight' && raw.stage.endsWith('-combat')) {
      if (!enemy) dest=route(raw.target);
      const index=s.encounters.length;
      // 用主路上的横向空间拉开距离，保留敌人过门和换弹的余地。
      const lane = index===1 ? [{x:16,z:26},{x:-16,z:26}] :
        index===2 ? [{x:-21,z:8},{x:-32,z:8}] : [{x:27,z:10},{x:35,z:9}];
      const anchor=lane[Math.floor(g.time/4)%lane.length];
      if(enemy) dest=route({...anchor,y:0});
    } else {
      dest=route(raw?.target ?? target);
      if (state==='use' && target && distance(p,target)<2.55 || g.pickups.nearKey(p)) input.interact=true;
    }
    if(enemy) {
      const d=distance(p,enemy);
      p.look.rotation.set(Math.atan2(enemy.y+enemy.height*(enemy===b ? .86 : .68)-p.y-p.eye,d)-p.recoil,
        Math.atan2(p.x-enemy.x,p.z-enemy.z),0,'YXZ');
      input.fire=true;
      if(!dest) dest=strafe(creatures,step);
    } else if(dest) p.look.rotation.set(0,Math.atan2(p.x-dest.x,p.z-dest.z),0,'YXZ');
    const med=g.pickups.objects.filter(i=>i.active && i.permanent && i.kind==='health' && distance(p,i)<16)
      .sort((a,b)=>distance(p,a)-distance(p,b))[0];
    if(p.hp<45 && med) dest=route(med);
    if (!enemy && !g.beasts.live && state!=='fight' && w.ammo<config.weapon.magazine) input.reload=true;
    if (p.hp<65 && distance(p,enemy ?? p)>4) g.kit.use(2,g);
    if (state!=='use' || p.hp>=99 || g.beasts.live) move(dest);
    const beforeBreaks=b?.fight.breaks, cooldown=g.field.deviceAt;
    g.step(.04);
    if(b && b.fight.breaks>beforeBreaks) {
      if(g.field.deviceAt>cooldown)report.pulseBreaks++;else report.gunBreaks++;
    }
    if(b && !b.active) {
      report.bossShots=g.performance.shots-bossShots;
      report.afterBoss=ammo();
    }
  }
  return {...report,phase:g.phase,stage:g.story.stage,kills:g.kills,remaining:g.story.remaining,
    hp:p.hp,position:[p.x,p.y,p.z], boss:g.beasts.boss?.hp,ammo:ammo(),
    optional:g.loot.filter(i=>i.value>=config.pickups.preciousValue || ['secret','vault','legendary'].includes(i.origin)),
    spawned:g.story.encounters.map(e=>e.spawned), ...(g.phase==='win'?{}:{log,task:g.story.guide(g,{keyItem:'核心'})?.title})};
}
