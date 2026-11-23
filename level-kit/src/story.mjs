// 主线使用关卡指定的位置和有限队列。无尽使用原持续增援。
export function createStory({ THREE, scene, level, nav, CONFIG, definition, colors }, rules) {
  const spec = definition.story;
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
  const consoles = (spec?.terminals ?? []).map((a) => {
    const group = new THREE.Group(),
      p = point(a);
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.78, 0.82, 0.45),
      new THREE.MeshLambertMaterial({ color: 0x394e62 }),
    );
    const card = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.08, 0.29),
      new THREE.MeshBasicMaterial({ color: 0x95ffe1 }),
    );
    base.position.y = 0.41;
    card.position.y = 0.9;
    group.add(base, card);
    group.position.copy(p);
    scene.add(group);
    group.visible = false;
    return { group, card };
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
  function ordinarySectors(g) {
    const authored = spec.sectors.map((zone) => ({ ...zone, center: point(zone.at) }));
    const classic = g.objective.mode === 'classic';
    return authored.map((zone, i) => ({
      ...zone,
      kind: 'fight',
      count: classic ? Math.ceil(CONFIG.beasts.killsToWin / authored.length) : (zone.count ?? 6),
      cap: zone.cap ?? Math.round(9 * Math.sqrt(CONFIG.player.incoming)),
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
    waveNumber = 0,
    nextBatch = 0;
  const asPoint = (a) => (a?.isVector3 ? a : a.length === 3 ? xyz(a) : point(a));
  function enter(g) {
    item = stages[index] ?? null;
    group = null;
    waveNumber = 0;
    stageTime = 0;
    nextBatch = 0;
    director.stage = item?.id ?? item?.kind ?? 'complete';
    if (!item) {
      director.blocksExit = false;
      return;
    }
    if (item.open) close(item.open, false);
    if (item.kind === 'boss') {
      const site = level.bossSpawn;
      const boss = g.beasts.spawn(3, site.x, site.z, site.y);
      if (!boss) throw new Error('首领出生点被封锁');
      boss.alert = CONFIG.beasts.memory;
    }
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
    index++;
    enter(g);
  }
  function startGroup(g, n, entrances, cap, mix, escort = false) {
    group = {
      left: n,
      total: n,
      cap,
      mix,
      deployed: 0,
      entrance: entrances.map(asPoint),
      escort,
      tag: { cap },
      warning: g.time + 1.35,
      timer: 0,
      tickets: 0,
    };
    g.ui.notify((item.warning ?? item.name ?? '通道') + '出现动静，留意橙色入口', 2);
    for (const entrance of group.entrance) g.sound.stageEvent?.('warning', g, entrance);
  }
  function members(g) {
    return group ? g.beasts.pool.filter((b) => b.active && b.storyWave === group.tag) : [];
  }
  function spawnAt(g, k, type, entry) {
    const field = nav.fields[type],
      stats = CONFIG.beasts.types[type];
    // 环绕入口按确定顺序找有空间且连通的落点。同批次不会共用一个位置。
    for (let j = 0; j < 74; j++) {
      const radius = 0.65 * Math.sqrt(j),
        angle = (j + k * 3) * 2.39996;
      const x = entry.x + radius * Math.cos(angle),
        z = entry.z + radius * Math.sin(angle);
      const y = level.surface(x, z, entry.y + 0.5);
      if (
        level.blocked(x, z, y, stats.radius, stats.height) ||
        (item.kind !== 'defend' && field.dist[field.index(x, z)] < 0) ||
        Math.hypot(g.player.x - x, g.player.y - y, g.player.z - z) < 3.3 ||
        g.beasts.pool.some(
          (b) =>
            b.active &&
            Math.abs(b.y - y) < 1.6 &&
            Math.hypot(b.x - x, b.z - z) < b.radius + stats.radius + 0.25,
        )
      )
        continue;
      const b = g.beasts.spawnRegular(type, x, z, y);
      if (b) {
        b.alert = CONFIG.beasts.memory + 6;
        return b;
      }
    }
    return null;
  }
  function deploy(g, dt) {
    if (!group) return;
    const alive = members(g);
    const warning = group.warning - g.time;
    if (warning > 0) {
      group.entrance.slice(0, beacons.length).forEach((p, i) => {
        const b = beacons[i];
        b.visible = true;
        b.position.set(p.x, p.y + 0.1, p.z);
        b.scale.setScalar(1 + 0.55 * Math.abs(Math.sin(warning * 8)));
      });
      return;
    }
    group.timer -= dt;
    if (
      group.timer > 0 ||
      !group.left ||
      alive.length >= group.cap ||
      g.beasts.pool.filter((b) => b.active && b.storyWave).length >= group.cap
    )
      return;
    const type = group.mix[group.deployed % group.mix.length];
    const entryIndex = group.tickets++ % group.entrance.length,
      entry = group.entrance[entryIndex];
    const creature = spawnAt(g, group.tickets, type, entry);
    group.timer = creature ? 0.32 : 0.22;
    if (!creature) return;
    creature.storyWave = group.tag;
    creature.droneRaider = group.escort && group.deployed % 2 === 0;
    if (item.climbs) {
      creature.climbRoute = item.climbs[entryIndex];
      creature.climbPoint = 0;
    }
    group.left--;
    group.deployed++;
    if (group.deployed % group.cap === 0 && group.left) {
      group.warning = g.time + 1.35;
      g.sound.tone(240, 460, 0.23, 0.1, 'triangle');
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
        { kind: 'defend', at: spec.beacon, label: '守住观景台，等待直升机', platform: p, climbs },
        { kind: 'rescue', at: spec.rescue, label: '登上塔侧救援直升机', climbs },
      ];
    }
    if (type === 'escort' && mode === 'escort') return spec.route;
    return [...ordinarySectors(g), { kind: 'boss', label: '击败' + definition.text.bossName }];
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
    get cap() {
      return this.managed ? (item?.kind === 'boss' ? 9 : (group?.cap ?? 14)) : CONFIG.beasts.capacity;
    },
    prepare(mode) {
      this.managed = this.supports(mode);
      const closed =
        this.managed &&
        ((spec.type === 'lab' && mode === 'classic') || (spec.type === 'rain' && mode === 'hold'));
      for (const id of panels.keys()) close(id, closed);
      for (const { group, card } of consoles) {
        group.visible = closed;
        card.visible = true;
      }
    },
    reset(g) {
      this.blocksExit = this.managed;
      this.droneDocked = false;
      this.elapsed = 0;
      this.rescueTime = 0;
      this.encounters = [];
      stages = this.managed ? build(g).map((s) => ({ ...s, target: s.at ? asPoint(s.at) : s.center })) : [];
      this.detonated = stages.some((stage) => stage.kind === 'countdown') ? false : null;
      g.stageKillTarget =
        (spec?.type === 'lab' && g.objective.mode === 'classic') ||
        ['hold', 'rescue', 'escort', 'timed'].includes(g.objective.mode)
          ? Math.max(
              1,
              stages.reduce((sum, s) => sum + (s.count ?? 0) + (s.kind === 'boss' ? 1 : 0), 0),
            )
          : CONFIG.beasts.killsToWin;
      blastAge = Infinity;
      if (demolition) demolition.visible = false;
      index = 0;
      sign.visible = false;
      enter(g);
      beacons.forEach((b) => (b.visible = false));
    },
    get target() {
      return item?.target;
    },
    get remaining() {
      return group?.left ?? 0;
    },
    get doorStates() {
      return Object.fromEntries(
        [...panels].filter(([id]) => id).map(([id, entries]) => [id, entries[0].barrier.active !== false]),
      );
    },
    step(dt, g) {
      for (const b of beacons) b.visible = false;
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
      stageTime += dt;
      const p = g.player,
        t = item.target;
      switch (item.kind) {
        case 'fight':
          if (
            !group &&
            near(p, t, item.range ?? 13) &&
            (!item.escort || near(g.objective.drone.position, t, 10))
          ) {
            this.droneDocked = Boolean(item.escort);
            startGroup(g, item.count, item.entries, item.cap ?? 6, item.mix ?? [0, 0, 1, 2], item.escort);
            this.encounters.push({ name: item.name, enteredAt: g.time, spawned: 0 });
          }
          if (group) {
            deploy(g, dt);
            this.encounters.at(-1).spawned = group.deployed;
            if (!group.left && !members(g).length) {
              this.encounters.at(-1).clearedAt = g.time;
              this.droneDocked = false;
              advance(g);
            }
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
          if (g.bossDead && g.core) advance(g);
          break;
        case 'hold':
          if (!group || (!group.left && !members(g).length && g.time >= nextBatch)) {
            if (near(p, t, 11) && waveNumber < 4) {
              startGroup(g, 5 + waveNumber, item.entries, 7, [0, 0, 2, 1]);
              waveNumber++;
              nextBatch = g.time + 8;
            }
          }
          deploy(g, dt);
          if (g.objective.held >= rules.holdSeconds) advance(g);
          break;
        case 'countdown': {
          if (!group) startGroup(g, 7, item.entries, 7, [0, 0, 2]);
          deploy(g, dt);
          const sec = Math.ceil(rules.demolitionSeconds - stageTime);
          if (sec > 0 && nextBatch !== sec) {
            nextBatch = sec;
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
          if (!group) startGroup(g, item.count, item.entries, item.cap, item.mix);
          deploy(g, dt);
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
          if (item.kind === 'defend' && onDeck)
            this.elapsed = Math.min(rules.rescueSeconds, this.elapsed + dt);
          if ((!group || !group.left) && g.time >= nextBatch) {
            const routes = this.elapsed < 30 ? item.climbs.slice(0, 2) : item.climbs;
            const cap = this.elapsed < 30 ? 8 : 14,
              total = g.beasts.pool.filter((b) => b.active && b.storyWave).length;
            if (total < cap) {
              startGroup(
                g,
                Math.min(6, cap - total),
                routes.map((r) => r[0]),
                cap,
                this.elapsed < 30 ? [0, 0, 2] : [0, 1, 0, 2],
              );
              nextBatch = g.time + 7;
            }
          }
          deploy(g, dt);
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
        g.sound.tone(440, 720, 0.23, 0.16, 'sine');
        for (const station of consoles)
          if (separation(station.group.position, t) < 1.1) station.card.visible = false;
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
            title = (g.pickups.nearKey(g.player) ? '按 F 拾取' : '前往拾取') + text.keyItem;
            target = g.pickups.keyItem;
          } else target = g.beasts.boss ?? level.bossAnchor;
          break;
        case 'fight':
          if (!group) title = item.lead ?? '前往' + item.name;
          else {
            const living = members(g);
            target =
              living.reduce(
                (n, b) => (!n || separation(g.player, b) < separation(g.player, n) ? b : n),
                null,
              ) ?? t;
            detail =
              '剩余 ' +
              (living.length + group.left) +
              ' 只' +
              (this.droneDocked ? ' · 无人机停靠，拦截袭击者' : '');
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
    marker(task, g) {
      sign.visible = Boolean(task?.target && !g.encounter?.hudOffline && g.phase === 'play');
      if (sign.visible) {
        const t = task.target;
        sign.position.set(t.x, t.y + (t.height ?? 1.3) + 0.45, t.z);
        sign.rotation.y = g.time * 1.5;
      }
    },
    stepBeast(b, g, dt) {
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
      if (!b.droneRaider || !this.droneDocked || b.stun > 0) return false;
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
