// 首帧按房间核对全部驻敌，再从出生点连续走到关卡结算。测试固定击倒速度，
// 保留正式伤害、分裂、碰撞、无人机跟随、收益交互和各行动自身的撤离条件。
function walkCampaignRoute(takeRewards = true) {
  const { game: g, nav, config, camera, definition: def } = run,
    m = g.beasts,
    p = g.player,
    l = g.level,
    s = g.story;
  g.reset();
  g.phase = 'play';
  const mode = g.objective.mode,
    sects =
      mode === 'hold' || mode === 'escort'
        ? def.story.route.filter((v) => v.kind === 'fight')
        : mode === 'rescue'
          ? [def.story.ascent]
          : def.story.sectors;
  const r = nav.playerRoute(),
    trail = [],
    scenes = [],
    waveSizes = [],
    seenRooms = [];
  const v = (x, z) => ({ x, z, y: l.surface(x, z, l.base(x, z) + 0.46) }),
    dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  function tick(dt = 0.1) {
    g.time += dt;
    m.releaseSplits(g);
    g.objective.step(dt, g);
    s.step(dt, g);
    g.pickups.update(dt, p, g);
  }
  function walk(t, label, near = 0.55, direct = false) {
    if (Array.isArray(t)) t = v(...t);
    r.rebuild(t.x, t.z);
    let d = 0;
    for (let n = 0; n < 2200; n++) {
      let delta = dist(p, t);
      if (delta < near && Math.abs(p.y - t.y) < 1.6) {
        trail.push([label, Math.round(d)]);
        return;
      }
      const i = r.index(p.x, p.z),
        j = r.next(p.x, p.z),
        exact = direct || delta < 1.4 || i === j;
      const dx = (exact ? t.x : r.x(j)) - p.x,
        dz = (exact ? t.z : r.z(j)) - p.z,
        step = 0.16 / Math.max(0.16, Math.hypot(dx, dz));
      const made = l.move(p, dx * step, dz * step, 0.46);
      p.y = l.foot(p.x, p.z, p.y + 0.46, p.radius);
      if (made < 0.001)
        throw Error('不能走到 ' + label + ' player ' + [p.x, p.y, p.z] + ' target ' + [t.x, t.y, t.z]);
      d += made;
      tick(0.043);
    }
    throw Error('走路超时 ' + label);
  }
  p.positionCamera(0);
  camera.updateMatrixWorld(true);
  const eye = camera.position,
    ray = eye.clone();
  function currentlyVisible(beast) {
    const center = eye.clone().set(beast.x, beast.y + beast.height * 0.7, beast.z);
    const delta = ray.subVectors(center, eye).length();
    if (!l.visible(eye, ray.divideScalar(delta), delta - 0.1)) return false;
    center.project(camera);
    return Math.max(Math.abs(center.x), Math.abs(center.y), Math.abs(center.z)) <= 1;
  }
  const get = (room) => m.pool.filter((b) => b.active && b.sectionRoom === room),
    original = sects.map((z) => z.parts.map((part) => get(part.name).length));
  for (const [i, zone] of sects.entries()) {
    const mix = zone.mix ?? (i === 0 ? [0, 0, 1, 0, 2] : [0, 1, 0, 2, 0]);
    const groups = zone.parts.map((part) => get(part.name));
    const roster = groups.flat(),
      expected = roster.map((_, i) => mix[i % mix.length]);
    if (
      roster.length !== zone.parts.reduce((sum, part) => sum + part.count, 0) ||
      roster
        .map((b) => b.type)
        .sort()
        .join() !== expected.sort().join()
    )
      throw Error('实际类型或数量偏离正式编组 ' + zone.name);
    for (const [n, part] of zone.parts.entries()) {
      const [left, back, right, front] = part.bounds;
      if (
        groups[n].length !== part.count ||
        groups[n].some(
          (b) =>
            b.x < left ||
            b.x > right ||
            b.z < back ||
            b.z > front ||
            (part.types && !part.types.includes(b.type)),
        )
      )
        throw Error('驻敌房间或类型错误 ' + part.name);
    }
  }
  const visibleAtStart = sects.map(
    (zone) => zone.parts.flatMap((part) => get(part.name)).filter(currentlyVisible).length,
  );
  function clear(name) {
    for (let pass = 0; pass < 15; pass++) {
      for (const b of get(name)) m.damage(b, 1e7, g);
      tick(0.25);
    }
    if (get(name).length) throw Error('清房未完成 ' + name);
  }
  function reunite() {
    if (mode === 'escort') {
      const q = g.objective.drone.position;
      if (dist(p, q) > 1.2) walk({ x: q.x, y: q.y - 1, z: q.z }, '汇合无人机');
      for (let i = 0; i < 10; i++) tick(0.1);
    }
  }
  let fights = 0;

  for (let i = 0; i < 30 && g.phase === 'play'; i++) {
    const stage = s.stage,
      t = s.target;
    scenes.push(stage);
    if (stage === 'fight' || (stage === 'approach' && fights === 0)) {
      const zone = sects[fights++];
      if (!zone) throw Error('重复清场');

      walk(t, zone.name);
      for (let j = 0; j < 80 && mode === 'escort' && !s.droneDocked; j++) tick(0.1);
      if (mode === 'escort' && !s.droneDocked)
        throw Error(
          '无人机未停靠 ' +
            [g.objective.drone.position.x, g.objective.drone.position.z] +
            ' player ' +
            [p.x, p.z],
        );
      for (const room of zone.parts.slice(1)) {
        if (g.pickups.objects.some((it) => it.active && it.name === room.reward.name))
          throw Error('清房前提前发放收益 ' + room.name);
        if (!takeRewards) walk(room.reward.at, room.name);
        clear(room.name);
        if (takeRewards) walk(room.reward.at, room.name);
        if (g.loot.some((o) => o.name === room.reward.name))
          throw Error('玩家尚未按交互键，清房收益却已入包 ' + room.name);
        if (!takeRewards) {
          if (!g.pickups.objects.some((it) => it.active && it.manual && it.name === room.reward.name))
            throw Error('原地清房后缺少可放弃的战利品 ' + room.name);
          continue;
        }
        if (!g.pickups.takeNearbyReward(p, g)) throw Error('玩家在奖励位无法手动领取 ' + room.name);
        if (!g.loot.some((o) => o.name === room.reward.name)) {
          const obj = g.pickups.objects.find((it) => it.active && it.name === room.reward.name);
          throw Error('收益未拾取 ' + room.name + ' ' + JSON.stringify(obj && [obj.x, obj.y, obj.z]));
        }
        seenRooms.push(room.reward.name);
      }
      reunite();
      clear(zone.parts[0].name);
      continue;
    }
    if (stage === 'boss') {
      if (!m.boss) {
        walk(l.bossSpawn, '进入首领战区', 7);
        for (let j = 0; j < 12 && !m.boss; j++) tick(0.1);
      }
      const b = m.boss;
      if (!b) throw Error('首领未就位');
      walk(b, '首领场', 2);
      for (let ph = 0; ph < 3; ph++) {
        g.time += 2;
        m.damage(b, 1e7, g);
      }
      const key = g.pickups.keyItem;
      if (!key) throw Error('缺少核心');
      walk(key, '核心', 0.7);
      if (!g.pickups.takeKey(p, g)) throw Error('未取核心');
      tick();
      continue;
    }
    if (stage === 'complete') {
      if (mode === 'escort') reunite();
      const id = location.pathname.split('/').at(-2);
      // 上下层可占同一 XZ。按正式梯口走上平台，再向实际交互距离内移动。
      const stairs = {
        'derelict-station': [
          [13.3, -8],
          [4.4, -8],
        ],
        'jungle-temple': [
          [18, -3],
          [3.6, -3],
        ],
        'drowned-city': [
          [17, 0],
          [9.1, 0],
        ],
        'buried-tomb': [
          [l.gate.x, l.gate.z + 16],
          [l.gate.x, l.gate.z + 2.5],
        ],
      }[id];
      if (stairs) {
        walk(stairs[0], '楼梯口');
        const high = v(...stairs[1]);
        high.y = l.gate.y;
        walk(high, '上楼', 0.44, true);
      }
      walk(l.gate, '撤离', 2.5, !!stairs);
      for (let j = 0; j < 150 && !g.ready(); j++) tick(0.1);
      g.trigger();
      if (!g.blast) throw Error('撤离未激活 ' + JSON.stringify(g.objective.extra?.(g) ?? {}));
      g.step(config.effects.gateDuration + 0.1);
      continue;
    }
    if (stage === 'hold' || stage === 'defend' || stage === 'countdown') {
      walk(t, stage);
      const attack = m.pool.filter((b) => b.active && b.storyWave);
      const sides =
        stage === 'defend'
          ? new Set(attack.filter((b) => b.climbRoute).map((b) => b.climbRoute[0].join())).size
          : undefined;
      for (let n = 0; n < 1000 && s.stage === stage; n++) tick(0.1);
      waveSizes.push({ stage, count: attack.length, sides, held: g.objective.held, elapsed: s.elapsed });
      if (s.stage === stage) throw Error('计时阶段未结束 ' + stage);
      if (stage === 'hold' && (attack.length !== 100 || g.objective.held !== 45))
        throw Error('雨城未完成百人坚守');
      if (stage === 'countdown' && attack.length !== 200) throw Error('雨城爆破切换未保留百人坚守和百人反扑');
      if (stage === 'defend' && (attack.length !== 100 || sides !== 4 || s.elapsed !== 90))
        throw Error('高塔未保持四路百人防守和 90 秒计时');
      continue;
    }
    if (t) {
      if (mode === 'rescue' && t.y > 4 && p.y < 4) {
        walk([0, 29], '塔南阶');
        walk({ x: 0, z: 8, y: 7.2 }, '登塔', 0.45, true);
      }
      walk(t, stage, stage === 'reach' ? 1.0 : 0.7);
      if (['use', 'beacon', 'rescue'].includes(stage) && s.stage === stage && !s.interact(g))
        throw Error('交互失败 ' + stage);
      tick();
    } else throw Error('未知阶段 ' + stage);
  }
  if (g.phase !== 'win') throw Error('未结算 ' + g.phase);
  if (
    !takeRewards &&
    sects.some((zone) =>
      zone.parts.some((part) => part.reward && g.loot.some((o) => o.name === part.reward.name)),
    )
  )
    throw Error('主动放弃的清房奖励被带出');
  return {
    mode,
    pool: m.pool.length,
    original,
    visibleAtStart,
    scenes,
    trail,
    waveSizes,
    seenRooms,
    phase: g.phase,
  };
}
