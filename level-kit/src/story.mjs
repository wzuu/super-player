import {assignGuardTypes} from '@level-kit/story-sectors.mjs';
import { createMissionNavigation } from '@level-kit/mission-navigation.mjs';
import { createGroundDirections } from '@level-kit/ground-directions.mjs';

// 每次主线遭遇只集结一次。限时目标切换时，保留已经入场的敌群。
export function createStory({ THREE, scene, level, nav, CONFIG, definition, colors }, rules) {
  const spec = definition.story;
  let route;
  const groundDirections=createGroundDirections(THREE,scene,level);
  const point = ([x, z]) => new THREE.Vector3(x, level.surface(x, z, level.base(x, z) + 0.5), z);
  const xyz = (a) => new THREE.Vector3(...a);
  const separation = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const near = (p, t, r = 2.6) => Math.abs(p.y - t.y) < 2 && separation(p, t) < r;
  const sign = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.37),
    new THREE.MeshBasicMaterial({ color: 0x85ffce, depthTest: false, transparent: true, opacity: 0.82 }),
  );
  sign.renderOrder = 7;
  sign.visible = false;
  scene.add(sign);
  const pulse = new THREE.MeshBasicMaterial({
    color: 0xff9438,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  const beacons = Array.from({ length: 4 }, () => {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.52, 0.72, 20), pulse);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  });
  const panels = new Map();
  const demolition = spec?.type === 'rain' ? new THREE.Group() : null;
  let blastAge = Infinity,
    blastPoint = null;
  if (demolition) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.06, 6, 48),
      new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true }),
    );
    ring.rotation.x = -Math.PI / 2;
    demolition.add(ring);
    const mesh = new THREE.BoxGeometry(0.28, 0.16, 0.37),
      material = new THREE.MeshLambertMaterial({ color: 0xa17042 });
    for (let i = 0; i < 12; i++) demolition.add(new THREE.Mesh(mesh, material));
    scene.add(demolition);
    demolition.visible = false;
  }
  const consoles = (spec?.terminals ?? []).map((station) => {
    const group = new THREE.Group(),
      p = point(Array.isArray(station) ? station : station.at);
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.78, 0.82, 0.45),
      new THREE.MeshLambertMaterial({ color: 0x394e62 }),
    );
    const breaker = station.kind==='breaker';
    const control = new THREE.Mesh(
      breaker ? new THREE.BoxGeometry(.16,.52,.16) : new THREE.BoxGeometry(.45,.08,.29),
      new THREE.MeshBasicMaterial({color:breaker ? 0xffa449 : station.kind==='card' ? 0xffdb76 : 0x95ffe1}),
    );
    base.position.y = .41;
    control.position.y = breaker ? 1.02 : .9;
    group.add(base,control);
    group.position.copy(p);
    scene.add(group);
    group.visible = false;
    const activate = used => {
      if (breaker) control.rotation.x = used ? -.7 : .7;
      control.visible = breaker || !used;
    };
    activate(false);
    return {group,activate};
  });
  for (const wall of spec?.walls ?? []) {
    const [id, x, z, width, depth, height, glass] = wall;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshLambertMaterial({
        color: glass ? 0x68aac1 : id ? 0xa56137 : 0x384e60,
        emissive: id ? 0x442008 : 0x09202a,
        transparent: Boolean(glass),
        opacity: glass ? 0.39 : 1,
      }),
    );
    mesh.position.set(x, height / 2, z);
    scene.add(mesh);
    const barrier = level.box(x, z, width, depth, 0, height);
    if (definition.weaponSkin === 'underground-lab' && !glass) level.viewOccluders.push(barrier);
    level.setBarrier(barrier, mesh, false);
    if (!panels.has(id)) panels.set(id, []);
    panels.get(id).push({ barrier, mesh });
  }
  function close(id, closed) {
    for (const entry of panels.get(id) ?? []) level.setBarrier(entry.barrier, entry.mesh, closed);
  }
  const trace = new THREE.Vector3(),
    origin = new THREE.Vector3();
  function clearLine(a, b) {
    origin.set(a.x, a.y + 0.8, a.z);
    trace.set(b.x - origin.x, b.y + 0.5 - origin.y, b.z - origin.z);
    const d = trace.length();
    return d < 0.01 || level.visible(origin, trace.divideScalar(d), d);
  }
  function ordinarySectors() {
    return spec.sectors.map((zone, i) => ({
      ...zone,
      kind: 'fight',
      label: '清理' + zone.name,
      lead: '前往' + zone.name,
      range: 13,
      mix: i ? [0, 1, 0, 2, 0] : [0, 0, 1, 0, 2],
    }));
  }
  let stages = [],
    index = 0,
    item = null,
    group = null,
    stageTime = 0,
    countdownSecond = 0,
    retryAt = 0;
  const asPoint = (a) => (a?.isVector3 ? a : a.length === 3 ? xyz(a) : point(a));
  const openFight = stage => stage.kind==='fight' && stage.parts && spec.type!=='lab';
  function enter(g, continuing = null) {
    item = stages[index] ?? null;
    group = continuing;
    stageTime = 0;
    countdownSecond = 0;
    retryAt = 0;
    director.stage = item?.id ?? item?.kind ?? 'complete';
    if (!item) {
      director.blocksExit = false;
      return;
    }
    if (item.open) close(item.open, false);
    if (item.kind === 'boss') startBoss(g);
    if (openFight(item) && !item.escort) startGroup(g);
    if (item.kind === 'countdown' || item.kind === 'defend') startGroup(g);
    if (item.alarm && g.encounter) {
      g.encounter.setAlarm(true);
      g.encounter.alarmUntil = g.time + 14;
      g.encounter.sirenAt = g.time;
    }
    if (item.kind === 'rescue') director.rescueTime = g.time;
  }
  function advance(g) {
    g.journal?.complete(g, item?.label ?? item?.name);
    if (item?.kind === 'hold') g.sound.stageEvent?.('clear', g, item.target);
    const continuing = item.encounter && item.encounter === stages[index + 1]?.encounter;
    index++;
    enter(g, continuing ? group : null);
  }
  function waitForSpace(g) {
    // 只在整群可入场时开始计时和清场。临时通道被关卡机关封闭时仍能恢复。
    if (!retryAt) g.ui.notify('集结通道暂时受阻，移开入口或等候通道开放', 3);
    retryAt = g.time + 0.5;
    return false;
  }
  function startBoss(g) {
    if (g.time < retryAt) return;
    // 大型首领应能在专属战斗区行动；环站母体无需穿过通往上一房间的矮舱门。
    const site = level.bossSpawn;
    const [boss] = g.beasts.spawnGroup([3], {anchors: [site], target: site,
      accept: p => Math.abs(p.y - site.y) < 1.5 && separation(p, site) <= 14});
    if (!boss) return waitForSpace(g);
    boss.alert = CONFIG.beasts.memory;
    retryAt = 0;
  }
  function deploy(g, stage) {
    if (stage.roster) return stage.roster;
    const entrances = (stage.climbs ? stage.climbs.map(route => route[0]) : stage.entries).map(asPoint);
    const parts = stage.parts?.flatMap(part => Array(part.count).fill(part));
    const anchorsByRoom = stage.parts && new Map(stage.parts.map(part => [part, asPoint(part.anchor)]));
    if (parts && parts.length !== stage.count) throw Error('分区合计与战区守卫数不符：' + stage.name);
    const mix = stage.mix ?? [0, 0, 1, 2];
    const types = assignGuardTypes(Array.from({length: stage.count}, (_, i) => mix[i % mix.length]), parts);
    const entries = Array.from({length: stage.count}, (_, i) => ({
      type: types[i],
      anchor: anchorsByRoom?.get(parts[i]),
      // 从通道纵向列队，保留四足模型头尾之间的通行净空。
      angle: entrances[i % entrances.length].z < g.player.z ? 0 : Math.PI,
    }));
    // 允许向同一战区的通道展开，不占用撤离口、出生保护区或之后清场房间的集结区域。
    const later = stages.slice(stages.indexOf(stage) + 1).filter(stage => stage.kind === 'fight');
    const laterSites = later.flatMap(stage => stage.entries.map(asPoint));
    const clearForPlayers = site => !level.inSafeZone(site.x, site.z, 1.4) &&
      !(Math.abs(site.y - level.gate.y) < 2 && separation(site, level.gate) < 3) &&
      !stage.clearLanes?.some(([x0,z0,x1,z1]) => site.x >= x0 && site.x <= x1 && site.z >= z0 && site.z <= z1);
    const withinSector = site => {
      if (!clearForPlayers(site)) return false;
      let distance = Infinity;
      for (const p of entrances) distance = Math.min(distance, separation(p, site));
      if (distance > 27 || laterSites.some(p => separation(p, site) < distance + 1)) return false;
      return !stage.bounds || stage.bounds.some(([x0,z0,x1,z1]) =>
        site.x >= x0 && site.x <= x1 && site.z >= z0 && site.z <= z1);
    };
    const options = {anchors: entrances, accept: withinSector, acceptGroup:i=>i%entrances.length};
    if (parts) {
      const sideRooms = spec.type==='lab' ? [] : stage.parts.slice(1);
      options.acceptGroup = index => parts[index].name;
      options.accept = (site, index) => {
        const [left, back, right, front] = parts[index].bounds;
        if (parts[index]===stage.parts[0] && sideRooms.some(({bounds:[x0,z0,x1,z1]}) =>
            site.x>=x0 && site.x<=x1 && site.z>=z0 && site.z<=z1)) return false;
        return clearForPlayers(site) && site.x >= left && site.x <= right && site.z >= back && site.z <= front;
      };
    }
    if (stage.climbs) {
      // 攀登前先在可步行的塔脚集结；其后的斜梁是独立于地面寻路的路线。
      options.target = entrances[0];
      options.accept = (site, i) => {
        if (!withinSector(site)) return false;
        const foot = entrances[i % entrances.length], stats = CONFIG.beasts.types[entries[i].type];
        const dx = foot.x - site.x, dz = foot.z - site.z;
        const steps = Math.ceil(Math.hypot(dx, dz) / 0.65);
        if (Math.abs(site.y - foot.y) > 0.35 || steps > 30) return false;
        for (let j = 1; j <= steps; j++) {
          const x = site.x + dx * j / steps, z = site.z + dz * j / steps;
          if (level.blocked(x, z, foot.y, stats.radius, stats.height)) return false;
        }
        return true;
      };
    }
    const creatures = g.beasts.spawnGroup(entries, options);
    if (creatures.length !== entries.length) return null;
    const group = stage.roster = {tag: {cap: stage.count}, entrances, deployedAt: g.time};
    for (const [i, beast] of creatures.entries()) {
      beast.storyWave = group.tag;
      beast.sectionRoom=parts?.[i].name;
      beast.roomBounds=parts?.[i].bounds;
      beast.roomAlert = !parts || (!spec.watchRooms && stage===item && parts[i]===stage.parts[0]);
      beast.guardPost = parts && spec.watchRooms ? {x:beast.x, z:beast.z, yaw:beast.yaw} : null;
      beast.alert = beast.guardPost ? 0 : CONFIG.beasts.memory + 6;
      beast.droneRaider = Boolean(stage.escort && i % 2 === 0);
      if (stage.climbs) {
        beast.climbRoute = stage.climbs[i % entrances.length];
        beast.climbPoint = 0;
      }
    }
    if (parts) group.rooms = stage.parts.filter(part => part.reward).map(part => ({part, cleared:false}));
    return group;
  }
  function startGroup(g) {
    if (group) return true;
    if (g.time < retryAt) return false;
    group = deploy(g, item);
    if (!group) return waitForSpace(g);
    retryAt = 0;
    group.markedUntil = g.time + 1.25;
    if (!spec.watchRooms) {
      for (const b of members(g)) if (b.sectionRoom===item.parts?.[0].name) b.roomAlert = true;
    }
    if (item.kind === 'fight') {
      director.droneDocked = Boolean(item.escort);
      group.record = {name:item.name, deployedAt:group.deployedAt, enteredAt:g.time, spawned:item.count};
      director.encounters.push(group.record);
    }
    if (spec.type !== 'lab') {
      const t = item.target;
      const site = level.pickupSite(t.x, t.z, t.y, g.player, nav);
      if (site) g.pickups.add('ammo', site.x, site.z, site.y, '战区入口弹药',
        g.pickups.cacheAmount(item.count * CONFIG.pickups.roundsPerGuard), true);
    }
    g.ui.notify((item.warning ?? item.name ?? '通道') + '的敌群已集结，留意橙色入口', 2);
    for (const entrance of group.entrances) g.sound.stageEvent?.('warning', g, entrance);
    return true;
  }
  function members(g) {
    return group ? g.beasts.pool.filter(b => b.active && b.storyWave === group.tag) : [];
  }
  function grantRoomRewards(g) {
    for (const stage of stages) {
      const wave = stage.roster;
      if (!wave) continue;
      for (const room of wave.rooms ?? []) {
        if (room.cleared || g.beasts.pool.some(beast => beast.active && beast.storyWave===wave.tag && beast.sectionRoom === room.part.name) ||
            g.beasts.traits.splits.some(child => child.storyWave === wave.tag && child.sectionRoom === room.part.name)) continue;
        const {at: [x,z], name, value} = room.part.reward;
        const treasure = g.pickups.add('rare', x, z, level.surface(x,z,level.base(x,z)+0.5), name, value, true);
        if (treasure) { treasure.origin = 'main'; treasure.manual = true; room.cleared = true; }
      }
    }
  }
  function build(g) {
    const mode = g.objective.mode,
      type = spec.type;
    if (type === 'lab' && mode === 'classic') return spec.route;
    if (type === 'rain' && mode === 'hold') return spec.route;
    if (type === 'tower' && mode === 'rescue') {
      const p = spec.platform,
        climbs = spec.climbs;
      return [
        spec.ascent,
        {
          kind: 'reach',
          id: 'approach',
          at: spec.approach ?? spec.beacon,
          label: '登上铁塔观景台',
          range: 3.2,
        },
        { kind: 'use', id: 'beacon', at: spec.beacon, label: '启动观景台救援信标' },
        { kind: 'defend', encounter: 'tower-rescue', at: spec.beacon, label: '守住观景台，等待直升机', platform: p, climbs },
        { kind: 'rescue', encounter: 'tower-rescue', at: spec.rescue, label: '登上塔侧救援直升机', climbs },
      ];
    }
    if (type === 'escort' && mode === 'escort') return spec.route;
    return [...ordinarySectors(), { kind: 'boss', label: '击败' + definition.text.bossName }];
  }
  const director = {
    managed: false,
    blocksExit: false,
    droneDocked: false,
    stage: 'complete',
    elapsed: 0,
    rescueTime: 0,
    rescueDuration: rules.rescueSeconds,
    supports(mode) {
      return Boolean(spec && ['classic', 'timed', 'hold', 'escort', 'rescue'].includes(mode));
    },
    bossDefeated(g) {
      if (!this.managed || item?.kind !== 'boss' || !item.victory) return false;
      g.journal?.complete(g,item.label);
      g.finish(true,item.victory);
      return true;
    },
    get cap() { return group?.tag.cap ?? CONFIG.beasts.capacity; },
    prepare(mode) {
      this.managed = this.supports(mode);
      const closed =
        this.managed &&
        ((spec.type === 'lab' && mode === 'classic') || (spec.type === 'rain' && mode === 'hold'));
      for (const id of panels.keys()) close(id, closed);
      for (const { group, activate } of consoles) {
        group.visible = closed;
        activate(false);
      }
    },
    reset(g) {
      this.blocksExit = this.managed;
      this.droneDocked = false;
      this.elapsed = 0;
      this.rescueTime = 0;
      this.encounters = [];
      stages = this.managed ? build(g).map((s) => ({
        ...s,
        count: ['fight', 'hold', 'countdown', 'breakout', 'defend', 'rescue'].includes(s.kind)
          ? (s.count ?? CONFIG.beasts.encounterSize) : 0,
        target: s.at ? asPoint(s.at) : undefined,
      })) : [];
      this.detonated = stages.some((stage) => stage.kind === 'countdown') ? false : null;
      // 只以必清场次估算击杀评分，倒计时和突围的残敌不计入撤离门槛。
      g.stageKillTarget = stages.reduce((sum, s) => sum + (s.kind === 'fight'
        ? (s.passage ? 0 : s.parts?.find(part => part.name === s.requiredRoom)?.count ?? s.count)
        : Number(s.kind === 'boss')), 0)
        || CONFIG.beasts.encounterSize;
      blastAge = Infinity;
      if (demolition) demolition.visible = false;
      this.roomTreasureCount = stages.reduce((count, stage) => count + (stage.parts?.filter(part => part.reward).length ?? 0), 0);
      index = 0;
      for (const stage of stages) if (openFight(stage)) deploy(g,stage);
      sign.visible = false;
      enter(g);
      beacons.forEach((b) => (b.visible = false));
    },
    get target() {
      return item?.target;
    },
    isCurrentGuard(b) { return Boolean(group && b.storyWave === group.tag); },
    get recoveryStage() { return index; },
    get recoveryEntry() {
      // 上一步已经完成的站点才可作本阶段入口，当前和未来的交互目标都不能用作传送点。
      for (let i=index-1; i>=0; i--) if (stages[i].target) return stages[i].target;
      return level.spawn;
    },
    recoveryUnsafe(site) {
      if (item?.kind === 'reach') return near(site,item.target,item.range ?? 2.7);
      if (item?.kind === 'breakout') return near(site,item.target,2.8);
      return item?.kind === 'countdown' && separation(site,asPoint(item.charge)) < 4.5;
    },
    get remaining() { return 0; },
    get doorStates() {
      return Object.fromEntries(
        [...panels].filter(([id]) => id).map(([id, entries]) => [id, entries[0].barrier.active !== false]),
      );
    },
    step(dt, g) {
      for (const [i, b] of beacons.entries()) {
        const p = group?.entrances[i];
        b.visible = Boolean(p && g.time < group.markedUntil);
        if (b.visible) {
          b.position.set(p.x, p.y + 0.1, p.z);
          b.scale.setScalar(1 + 0.55 * Math.abs(Math.sin((group.markedUntil - g.time) * 8)));
        }
      }
      if (demolition && blastAge < 1.25) {
        blastAge += dt;
        demolition.visible = blastAge < 1.25;
        demolition.position.copy(blastPoint);
        demolition.children.forEach((part, i) => {
          if (!i) {
            part.scale.setScalar(1 + blastAge * 8);
            part.material.opacity = Math.max(0, 1 - blastAge);
            return;
          }
          const a = i * 2.39996,
            r = blastAge * (2 + (i % 4));
          part.position.set(
            Math.cos(a) * r,
            Math.max(0.08, 1 + blastAge * (2 + (i % 3)) - 5 * blastAge ** 2),
            Math.sin(a) * r,
          );
          part.rotation.set(blastAge * i, blastAge * 2, 0);
        });
      }
      if (!item) return;
      grantRoomRewards(g);
      stageTime += dt;
      const p = g.player,
        t = item.target;
      switch (item.kind) {
        case 'fight':
          if (
            !group &&
            (openFight(item) || near(p, t, item.range ?? 13)) &&
            (!item.escort || near(g.objective.drone.position, t, 10))
          ) {
            startGroup(g);
          }
          if (!group) break;
          const roomCleared = item.passage ? near(p,t,2.8) : item.requiredRoom
            ? group.rooms.find(room => room.part.name === item.requiredRoom)?.cleared
            : !members(g).length && (!group.rooms || (group.rooms.every(room => room.cleared) &&
                !g.beasts.traits.splits.some(child => child.storyWave === group.tag)));
          if (roomCleared) {
            group.record.clearedAt = g.time;
            this.droneDocked = false;
            advance(g);
          }
          break;
        case 'reach':
          if (near(p, t, item.range ?? 2.7)) {
            if (item.win) {
              g.journal?.complete(g, item.label);
              g.finish(true, '你已从检修气闸撤离。');
            } else advance(g);
          }
          break;
        case 'boss':
          if (!g.beasts.boss && !g.bossDead) startBoss(g);
          if (g.bossDead && g.core) advance(g);
          break;
        case 'hold':
          if (!group && near(p, t, 11)) startGroup(g);
          if (group && g.objective.held >= rules.holdSeconds) advance(g);
          break;
        case 'countdown': {
          if (!startGroup(g)) { stageTime = 0; break; }
          const sec = Math.ceil(rules.demolitionSeconds - stageTime);
          if (sec > 0 && countdownSecond !== sec) {
            countdownSecond = sec;
            g.sound.tone(820, 640, 0.09, 0.18, 'square');
          }
          if (stageTime >= rules.demolitionSeconds) {
            this.detonated = true;
            close(item.door, false);
            g.sound.blast();
            const charge = asPoint(item.charge);
            blastPoint = charge;
            blastAge = 0;
            g.effects.spray(charge, colors.spark, 75, 9, 0.11, 'spark');
            g.effects.spray(charge, colors.coreTint, 34, 6, 0.19, 'mist');
            if (separation(p, charge) < 4.2) p.hurt(34, g, 0.7, charge);
            if (g.phase === 'play') advance(g);
          }
          break;
        }
        case 'breakout':
          if (near(p, t, 2.8)) {
            g.journal?.complete(g, item.label);
            g.finish(true, '你穿过封锁线，带着物资抵达高架接应点。');
          }
          break;
        case 'defend':
        case 'rescue': {
          const pl = spec.platform;
          const onDeck =
            p.x >= pl.x0 && p.x <= pl.x1 && p.z >= pl.z0 && p.z <= pl.z1 && Math.abs(p.y - pl.y) < 2.6;
          if (!startGroup(g)) break;
          if (item.kind === 'defend' && onDeck)
            this.elapsed = Math.min(rules.rescueSeconds, this.elapsed + dt);
          if (item.kind === 'defend' && this.elapsed >= rules.rescueSeconds) {
            advance(g);
            g.sound.tone(430, 700, 0.5, 0.24, 'triangle');
          }
          break;
        }
      }
    },
    interact(g) {
      if (!item) return false;
      const t = item.target,
        p = g.player;
      if (['use', 'rescue'].includes(item.kind) && near(p, t, 2.8) && clearLine(p, t)) {
        if (item.door && stages[index+1]?.parts) {
          const gate=item;
          close(gate.door,false);
          item=stages[++index];
          if(!startGroup(g)){
            index--;item=gate;close(gate.door,true);return true;
          }
          g.journal?.complete(g,gate.label);
          enter(g,group);
          g.sound.tone(440,720,.23,.16,'sine');
          for(const station of consoles)
            if(separation(station.group.position,t)<1.1)station.activate(true);
          return true;
        }
        g.sound.tone(440, 720, 0.23, 0.16, 'sine');
        for (const station of consoles)
          if (separation(station.group.position, t) < 1.1) station.activate(true);
        if (item.door) close(item.door, false);
        if (item.kind === 'rescue') {
          this.stage = 'boarded';
          g.journal?.complete(g, item.label);
          g.finish(true, '你已登上救援直升机，成功撤离铁塔。');
        } else advance(g);
        return true;
      }
      for (const gate of spec.locks ?? []) {
        if (panels.get(gate.id)?.[0].barrier.active !== false && near(p, point(gate.at), 3.8)) {
          g.sound.tone(140, 78, 0.14, 0.18, 'triangle');
          g.ui.notify(gate.why, 1.9);
          return true;
        }
      }
      return false;
    },
    guide(g, text) {
      if (!item) return null;
      const t = item.target;
      let target = t,
        title = item.label,
        detail = '';
      switch (item.kind) {
        case 'boss':
          if (g.bossDead) {
            if (g.core) return null;
            title = (g.pickups.nearKey(g.player) ? '按 F 拾取任务物品 · ' : '前往拾取任务物品 · ') + text.keyItem;
            target = g.pickups.keyItem;
          } else {
            target = g.beasts.boss ?? level.bossAnchor;
            if (spec.pulseAt) {
              detail = '青色脉冲柱可破甲 · 核心亮起时射击';
              if (g.weapon.ammo + g.weapon.reserve < CONFIG.weapon.magazine) {
                const supply = g.pickups.objects.filter(i => i.active && i.kind === 'ammo' && i.permanent &&
                  spec.bossSupplies?.some(([x,z]) => x===i.x && z===i.z))
                  .sort((a,b) => separation(a,g.player) - separation(b,g.player))[0];
                if (supply) {
                  target = supply;
                  detail = '弹药不足 · 跟随补给标记领取弹药';
                }
              }
            }
          }
          break;
        case 'fight':
          if (!group) title = item.lead ?? '前往' + item.name;
          else if (item.passage) detail='配电已恢复 · 抵达梯口即可开门';
          else {
            const living = members(g).filter(beast => !item.requiredRoom || beast.sectionRoom === item.requiredRoom);
            target =
              living.reduce(
                (n, b) => (!n || separation(g.player, b) < separation(g.player, n) ? b : n),
                null,
              ) ?? t;
            detail =
              '剩余 ' +
              living.length +
              ' 只' +
              (this.droneDocked ? ' · 无人机停靠，拦截袭击者' : '');
            if (group.rooms && target.sectionRoom) detail += ' · 最近驻敌在' + target.sectionRoom;
          }
          break;
        case 'hold':
          detail = '坚守 ' + Math.floor(g.objective.held) + ' / ' + rules.holdSeconds + ' 秒';
          break;
        case 'use':
        case 'rescue':
          title = (near(g.player, t, 2.8) ? '按 F ' : '前往') + title;
          break;
        case 'countdown':
          detail = '爆破倒计时 ' + Math.max(0, Math.ceil(rules.demolitionSeconds - stageTime)) + ' 秒';
          break;
        case 'defend':
          detail =
            '救援到达 ' + Math.max(0, Math.ceil(rules.rescueSeconds - this.elapsed)) + ' 秒 · 在观景台内坚守';
          break;
      }
      return {
        stage: 'route-' + index + (item.kind === 'fight' && group ? '-combat' : ''),
        title,
        target,
        detail,
      };
    },
    navigation(task, g) {
      if (!this.managed || !task.target) return task;
      const p = g.player;
      const engaged = g.time - p.lastHurt < 1.2 || g.beasts.pool.some(b =>
        b.active && b.playerVisible && b.alert > 0 && Math.hypot(b.x-p.x,b.y-p.y,b.z-p.z) <= 13);
      // 交战区的浮标仍可提示当前威胁；地面的路线指向房间或大厅，不在每只移动敌人间跳动。
      let target=task.target;
      if (engaged && target.storyWave && item?.kind==='fight') {
        const room = item.parts?.find(part => part.name === target.sectionRoom);
        target = room ? asPoint(room.anchor) : item.target;
      }
      if (engaged && target.fight && item?.kind==='boss') target=level.bossAnchor;
      route ??= createMissionNavigation(nav);
      const path=route(p,definition.navigationApproach?.(p,target,level) ?? target,task.stage);
      const guidance={...task,engaged:engaged && target.kind!=='ammo'};
      return path.length || spec.turnDirections ? {...guidance,path,waypoint:path[0]} : guidance;
    },
    marker(task, g) {
      const t = task?.path ? task.waypoint : task?.target;
      groundDirections(g.phase==='play' && !g.encounter?.hudOffline ? task?.path : null,g);
      sign.visible = Boolean(t && !task.engaged && !g.encounter?.hudOffline && g.phase === 'play');
      if (sign.visible) {
        sign.position.set(t.x, t.y + (t.height ?? 1.3) + 0.45, t.z);
        sign.rotation.y = g.time * 1.5;
      }
    },
    stepBeast(b, g, dt) {
      if (b.storyWave && b.guardPost && !b.roomAlert) {
        if (spec.watchRooms(b, g, dt, clearLine, CONFIG)) return true;
        b.roomAlert = true;
        b.alert = CONFIG.beasts.memory;
      } else if(b.storyWave && b.roomBounds && !b.roomAlert){
        const [left,back,right,front]=b.roomBounds, p=g.player;
        const distance=Math.hypot(p.x-b.x,p.z-b.z);
        const nearRoom=p.z>=back && p.z<=front && p.x>=left-2 && p.x<=right+2;
        // 驻防会跳过移动 AI；从侧面接近时，守卫仍须自己检查玩家是否出现在门洞里。
        const look=(g.beasts.frame+b.id)%6===0 && !g.encounter?.hearingOnly;
        b.roomAlert=b.hp<b.maxHP || (nearRoom && distance<19) || (distance<15 && look && clearLine(b,p));
        if(!b.roomAlert){b.stride=0;return true;}
      }
      if (b.climbRoute) {
        const dst = b.climbRoute[b.climbPoint],
          dx = dst[0] - b.x,
          dy = dst[1] - b.y,
          dz = dst[2] - b.z;
        const d = Math.hypot(dx, dy, dz),
          step = Math.min(1, (dt * 3.5) / Math.max(0.001, d));
        b.x += dx * step;
        b.y += dy * step;
        b.z += dz * step;
        b.yaw = Math.atan2(dx, dz);
        b.surfaceRoll = 0.35 * Math.sign(dx);
        b.stride = 1;
        if (d < 0.22 && ++b.climbPoint >= b.climbRoute.length) {
          b.climbRoute = null;
          b.surfaceRoll = 0;
        }
        return true;
      }
      if (!b.droneRaider || !this.isCurrentGuard(b) || !this.droneDocked || b.stun > 0) return false;
      const drone = g.objective.drone.position,
        target = { x: drone.x, y: drone.y - 1, z: drone.z };
      const dx = target.x - b.x,
        dz = target.z - b.z,
        d = Math.hypot(dx, dz);
      if (!clearLine(b, target)) return false;
      const player = g.player;
      const along = ((player.x - b.x) * dx + (player.z - b.z) * dz) / Math.max(0.01, d * d);
      if (
        along >= 0 &&
        along <= 1 &&
        Math.abs(player.y - b.y) < 1.5 &&
        Math.hypot(player.x - b.x - dx * along, player.z - b.z - dz * along) < 0.95
      ) {
        b.droneAttack = 0;
        return false;
      }
      b.yaw = Math.atan2(dx, dz);
      if (d < 2.1 && Math.abs(b.y - target.y) < 1.4) {
        if (!b.droneAttack) {
          b.droneAttack = g.time + 0.85;
          g.ui.notify('袭击者锁定无人机，挡住它的去路', 1.4);
        }
        if (g.time >= b.droneAttack) {
          g.objective.damageDrone(9, g);
          b.droneAttack = g.time + 1.7;
        }
      } else {
        b.droneAttack = 0;
        const step = dt * CONFIG.beasts.types[b.type].speed;
        level.move(b, (dx / Math.max(0.01, d)) * step, (dz / Math.max(0.01, d)) * step, 0.47);
        b.stride = 1;
      }
      return true;
    },
  };
  return director;
}
