function playLaboratoryCampaign() {
  const { game: g, input, camera, config } = run,
    p = g.player,
    w = g.weapon;
  let seed = 617;
  Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const ammo = () => [w.ammo, w.reserve];
  const report = { groups: [], gunBreaks: 0, pulseBreaks: 0, missed: false, sideRooms: false };
  const startingAmmo = ammo(), boxes = new Map();
  const collect = g.pickups.collect.bind(g.pickups);
  g.pickups.collect = (item, player, game) => {
    const before = w.reserve;
    const ok = collect(item, player, game);
    if (ok && item.kind === 'ammo') {
      const key = [item.name, item.x, item.z].join(' ');
      if (!boxes.has(key)) boxes.set(key, {name:item.name, at:[item.x,item.z], fixed:item.permanent, taken:0});
      boxes.get(key).taken += w.reserve - before;
    }
    return ok;
  };
  const ray = camera.position.clone(),
    eye = ray.clone();
  let firstWindow = 0,
    reloads = 0,
    bossShots = 0,
    lastGroup = null,
    previous = '',
    stale = 0, nextRoll = 0, rollingUntil = 0, rollAim = 0;
  const log = [];
  let lastKills = g.kills;
  const reload = w.reload.bind(w);
  w.reload = (game) => {
    const before = w.reloadLeft;
    reload(game);
    if (!before && w.reloadLeft) reloads++;
  };
  function route(t) {
    if (!t) return null;
    const info = g.story.navigation(
      { target: t },
      { player: { x: p.x, y: p.y, z: p.z, lastHurt: -Infinity }, time: g.time, beasts: { pool: [] } },
    );
    return info.waypoint;
  }
  function move(t) {
    if (!t || distance(p, t) < 0.15) return;
    let dx = t.x - p.x,
      dz = t.z - p.z;
    const yaw = p.look.rotation.y;
    // 和玩家绕过紫色掉落一样，按左右平移从拾取半径外侧经过。
    for (const item of g.pickups.objects) {
      if (!item.active || item.style !== 'precious' || distance(p, item) > config.pickups.grab + 1.1)
        continue;
      const ox = p.x - item.x,
        oz = p.z - item.z,
        d = Math.max(0.001, Math.hypot(ox, oz));
      if (dx * ox + dz * oz >= 0) continue;
      const side = dx * oz - dz * ox >= 0 ? 1 : -1;
      dx = (oz * side + ox * 0.45) / d;
      dz = (-ox * side + oz * 0.45) / d;
    }
    const forward = -dx * Math.sin(yaw) - dz * Math.cos(yaw);
    const right = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    if (Math.abs(forward) > Math.abs(right) * 0.42) input.down.add(forward > 0 ? 'KeyW' : 'KeyS');
    if (Math.abs(right) > Math.abs(forward) * 0.42) input.down.add(right > 0 ? 'KeyD' : 'KeyA');
  }
  function visible(b) {
    eye.set(p.x, p.y + p.eye, p.z);
    ray.set(b.x - eye.x, b.y + b.height * 0.7 - eye.y, b.z - eye.z);
    const d = ray.length();
    return g.level.visible(eye, ray.divideScalar(Math.max(0.001, d)), d);
  }
  let escape = null;
  function strafe(threats, step) {
    if (step % 5 && escape && distance(p, escape) > 1) return escape;
    let best = -Infinity, next = null;
    const old = escape;
    for (let i = 0; i < 24; i++) {
      const angle = 2 * Math.PI * i / 24, dx = Math.cos(angle), dz = Math.sin(angle);
      let span = 0;
      for (let j = 0.4; j <= 10; j += 0.4) {
        const x=p.x+j*dx, z=p.z+j*dz;
        if (g.level.blocked(x,z,p.y,p.radius,p.height)) break;
        span = j;
      }
      if (span < 1) continue;
      const q = {x:p.x+dx*Math.min(span,5), y:p.y, z:p.z+dz*Math.min(span,5)};
      let gap=16, pressure=0;
      for (const threat of threats) {
        const d=distance(threat,q);
        gap=Math.min(gap,d);
        if(d<12)pressure+=(12-d)*(12-d)/80;
      }
      // 留出转身空间，绕开可见酸池。仅靠眼前距离容易把玩家逼进墙角。
      const segment=g.story.encounters.length-1;
      const front=52-32*segment, back=front-32;
      const arena=g.story.stage==='boss';
      const outward=Math.max(0,Math.abs(q.x)-19)+
        Math.max(0,q.z-(arena?-46:front+4))*2+Math.max(0,(arena?-74:back)-q.z);
      const acid=g.projectiles.puddles.some(pool=>pool.life>0 && distance(pool.pos,q)<2.4);
      const score=gap + .8*span - 1.1*pressure - 1.3*outward - (acid?5:0) +
        (old ? .1*(dx*(old.x-p.x)+dz*(old.z-p.z)) : 0);
      if (score>best) {best=score;next=q;}
    }
    escape=next;
    return escape;
  }
  for (let step = 0; step < 32000 && g.phase === 'play'; step++) {
    const s = g.story,
      target = s.target,
      state = s.stage,
      b = g.beasts.boss;
    const raw = s.guide(g, { keyItem: '核心' });
    if(g.encounter.hatchOpen || (p.x>23 && p.z< -12 && p.z> -42))report.sideRooms=true;
    const creatures = g.beasts.pool
      .filter((e) => e.active && visible(e))
      .sort((a, b) => distance(a, p) - distance(b, p));
    let enemy = creatures[0],
      dest = null;
    const group = s.encounters.at(-1);
    if (group !== lastGroup && group) {
      lastGroup = group;
      report.groups.push({ name: group.name, enterAmmo:ammo(), enterShots: g.performance.shots, enterReloads: reloads });
    }
    if (group?.clearedAt && report.groups.at(-1).shots === undefined) {
      const record = report.groups.at(-1);
      record.shots = g.performance.shots - record.enterShots;
      record.reloads = reloads - record.enterReloads;
      record.exitAmmo = ammo();
    }
    if (raw?.stage !== previous) {
      previous = raw?.stage;
      stale = g.time;
      log.push([
        previous,
        Math.round(g.time),
        Math.round(p.x),
        Math.round(p.z),
        Math.round(p.hp),
        ...ammo(),
      ]);
    }
    if (g.kills !== lastKills) {
      lastKills = g.kills;
      stale = g.time;
    }
    if (g.time - stale > 225) {
      const pick = o => o && [o.name,o.sectionRoom,o.x,o.y,o.z,o.hp];
      report.blocked={target:pick(raw.target), waypoint:pick(route(raw.target)), nearest:pick(creatures[0]),
        alive:g.beasts.pool.filter(e=>e.active).length,left:g.beasts.pool.filter(e=>e.active).slice(0,5).map(pick),
        items:g.pickups.objects.filter(o=>o.active&&distance(p,o)<5).map(pick)};
      break;
    }
    input.down.clear();
    input.fire = false;
    if (state === 'boss' && b) {
      const f = b.fight,
        device = g.field.device;
      if (!report.doorAmmo) {
        report.doorAmmo = ammo();
        bossShots = g.performance.shots;
      }
      if (!report.enterAmmo && p.z < -44.3 && Math.abs(p.x) < 11) report.enterAmmo = ammo();
      if (!firstWindow && f.weakUntil > g.time) firstWindow = f.weakUntil;
      report.missed = Boolean(firstWindow && g.time >= firstWindow);
      if (p.z > -44 || (!report.pulseBreaks && distance(p, device) > 1.8)) dest = route(device);
      else if (
        report.missed &&
        !report.pulseBreaks &&
        distance(b, device) < 6.9 &&
        distance(p, device) < 2.45 &&
        f.brokenUntil <= g.time &&
        f.transitionUntil <= g.time
      )
        input.interact = true;
      if (f.winding && Math.hypot(p.x - f.aimX, p.z - f.aimZ) < 3.7)
        dest = route({ x: p.x > 6 ? 2 : 9, y: 0, z: -59.5 });
      if (enemy === b && (!report.missed || f.transitionUntil > g.time)) enemy = null;
      if (!enemy && !dest && !visible(b)) dest = route(b);
    } else if (state === 'boss' && g.pickups.keyItem) {
      const key = g.pickups.keyItem;
      dest = route(key);
      if (!dest && visible({ ...key, height: 1 })) dest = key;
      input.interact = g.pickups.nearKey(p);
    } else if (state === 'fight' && raw.stage.endsWith('-combat')) {
      if (!enemy) dest = route(raw.target);
      if (enemy) {
        const close = distance(p,enemy);
        dest = creatures.length < 4 && close > 11 && p.hp >= 65 ? route(enemy) : strafe(creatures,step);
      }
    } else {
      dest = route(raw?.target ?? target);
      if ((state === 'use' && target && distance(p, target) < 2.55) || g.pickups.nearKey(p))
        input.interact = true;
    }
    if (enemy) {
      const d = distance(p, enemy);
      p.look.rotation.set(
        Math.atan2(enemy.y + enemy.height * 0.86 - p.y - p.eye, d) - p.recoil,
        Math.atan2(p.x - enemy.x, p.z - enemy.z),
        0,
        'YXZ',
      );
      input.fire = true;
      if (!dest) dest = strafe(creatures, step);
    } else if (dest) p.look.rotation.set(0, Math.atan2(p.x - dest.x, p.z - dest.z), 0, 'YXZ');
    const med = g.pickups.objects
      .filter((i) => i.active && i.permanent && i.kind === 'health' && distance(p, i) < 16)
      .sort((a, b) => distance(p, a) - distance(p, b))[0];
    // 备弹低于两个弹匣时，沿当前战区寻找地图上标出的固定弹箱。
    if(state==='fight' && w.ammo+w.reserve<3*config.weapon.magazine && (!enemy||distance(p,enemy)>6)){
      const segment=g.story.encounters.length-1,front=52-segment*32;
      const boxes=g.pickups.objects.filter(i=>i.active&&i.permanent&&i.kind==='ammo'&&i.z>=front-31&&i.z<=front+3);
      const supply=boxes.sort((a,b)=>distance(p,a)-distance(p,b))[0];
      if(supply)dest=route(supply)??supply;
    }
    if (state==='boss' && b && w.ammo+w.reserve<2*config.weapon.magazine) {
      const supply=g.pickups.objects.filter(i=>i.active && i.permanent && i.kind==='ammo' &&
        Math.abs(i.x)<13 && i.z< -43).sort((a,b)=>distance(p,a)-distance(p,b))[0];
      if (supply) dest=route(supply)??supply;
    }
    if (p.hp < 60 && med && (!enemy || distance(p,enemy)>8)) dest = route(med);
    if (!enemy && !g.beasts.live && state !== 'fight' && w.ammo < config.weapon.magazine)
      input.reload = true;
    const stock=g.kit.remaining();
    if (stock.medkit && p.hp < 70 && (!enemy || distance(p,enemy)>5)) g.kit.use(2,g);
    if (stock.grenade && enemy && state === 'fight' && distance(p,enemy)>6 &&
        creatures.filter(a=>distance(a,enemy)<4.5).length>=7) g.kit.use(3,g);
    if (enemy && dest && (state==='fight'||state==='boss') && g.time>=nextRoll && distance(p,enemy)<4.8 &&
        distance(p,dest)>2.6) {
      rollAim=Math.atan2(p.x-dest.x,p.z-dest.z);
      rollingUntil=g.time+.32;
      nextRoll=g.time+6.1;
      g.kit.use(0,g);
    }
    if (g.time<rollingUntil) {
      p.look.rotation.set(0,rollAim,0,'YXZ');
      input.fire=false;
      input.down.add('ShiftLeft');
    } else if (enemy && dest && (state === 'fight' || state === 'boss') && distance(p,enemy)<6 &&
        !p.tired && (!w.ammo || g.time-p.lastHurt<2 || p.hp<65)) {
      p.look.rotation.set(0,Math.atan2(p.x-dest.x,p.z-dest.z),0,'YXZ');
      input.fire=false;
      input.down.add('ShiftLeft');
    }
    if (state !== 'use' || p.hp >= 99 || g.beasts.live) move(dest);
    const beforeBreaks = b?.fight.breaks,
      cooldown = g.field.deviceAt;
    const lastX=p.x, lastZ=p.z;
    g.step(0.04);
    if(g.core)report.exitMetres=(report.exitMetres??0)+Math.hypot(p.x-lastX,p.z-lastZ);
    if (b && b.fight.breaks > beforeBreaks) {
      if (g.field.deviceAt > cooldown) report.pulseBreaks++;
      else report.gunBreaks++;
    }
    if (b && !b.active) {
      report.bossShots = g.performance.shots - bossShots;
      report.afterBoss = ammo();
    }
  }
  return {
    ...report,
    startingAmmo, boxes:[...boxes.values()], shots:g.performance.shots, core:g.core,
    phase: g.phase,
    stage: g.story.stage,
    kills: g.kills,
    remaining: g.story.remaining,
    hp: p.hp,
    position: [p.x, p.y, p.z],
    boss: g.beasts.boss?.hp,
    ammo: ammo(),
    optional: g.loot.filter(
      (i) =>
        i.value >= config.pickups.preciousValue || ['secret', 'vault', 'legendary'].includes(i.origin),
    ),
    spawned: g.story.encounters.map((e) => e.spawned),
    ...(g.phase === 'win' ? {} : { log, task: g.story.guide(g, { keyItem: '核心' })?.title }),
  };
}
