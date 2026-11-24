async function verifyLabLayout({ offsets, extract }) {
  const { game: g, nav, config: c } = run,
    s = g.story,
    p = g.player,
    m = g.beasts;
  const reports = [],
    rooms = [],
    optional = {};
  const routes = new Map();
  function walk(q) {
    let steps = 0,
      min = Infinity;
    while (Math.hypot(p.x - q.x, p.z - q.z) > 0.65 && steps++ < 2400) {
      const task = s.navigation(
        { target: q },
        { player: { x: p.x, z: p.z, y: p.y, lastHurt: -Infinity }, time: g.time, beasts: { pool: [] } },
      );
      const t = task.waypoint ?? q,
        d = Math.max(0.001, Math.hypot(t.x - p.x, t.z - p.z));
      const x = p.x,
        z = p.z,
        amount = Math.min(d, 0.11);
      g.level.move(p, (amount * (t.x - p.x)) / d, (amount * (t.z - p.z)) / d, c.player.step);
      p.y = g.level.foot(p.x, p.z, p.y + 0.06, p.radius);
      if (Math.hypot(p.x - x, p.z - z) < 0.001)
        throw Error('实际位移受阻 ' + JSON.stringify({ x, pz: z, target: q, t }));
    }
    if (steps >= 2400) throw Error('绕行失败 ' + JSON.stringify(q));
    return steps * 0.11;
  }
  function claim(item) {
    g.pickups.update(0,p,g);
    if (!item.manual || !item.active) throw Error('清房奖励未按手动取回规则进入场地 '+item.name);
    const dx=item.x-p.x,dz=item.z-p.z;
    p.look.rotation.set(Math.atan2(item.y+.4-p.y-p.eye,Math.hypot(dx,dz)),Math.atan2(-dx,-dz),0,'YXZ');
    p.positionCamera(0);
    if(!g.pickups.takeAimed(p,g)) throw Error('手动瞄准领取奖励失败 '+item.name);
  }
  function clearGroup(find) {
    for (let i = 0; i < 4; i++) {
      for (const b of m.pool.filter((b) => b.active && find(b))) m.damage(b, 1e7, g, 'weapon');
      g.time += 0.1;
      m.releaseSplits(g);
      s.step(0.1, g);
      g.encounter.update(g, 0.1);
    }
  }
  for (const offset of offsets) {
    document.querySelector('#mission-mode').value = 'classic';
    g.reset();
    g.phase = 'play';
    g.encounter?.update(g, 0.1);
    for (let j = 0; j < 3; j++) {
      const z = 52 - j * 32;
      Object.assign(p, { x: offset, y: 0, z: z + 1.1 });
      nav.rebuild(p.x, p.z);
      const id = ['security', 'samples', 'power'][j];
      if (offset === 0 && j === 0) {
        const prev = m.spawnGroup;
        m.spawnGroup = () => [];
        try {
          if (!s.interact(g) || s.doorStates[id] !== true || m.pool.some((b) => b.active && b.storyWave))
            throw Error('failed formation revealed empty room');
        } finally {
          m.spawnGroup = prev;
        }
        g.time += 1;
      }
      if (s.doorStates[id] !== true || !s.interact(g))
        throw Error('door not closed/recognized ' + [j, JSON.stringify(s.doorStates), s.stage]);
      if (s.doorStates[id] !== false) throw Error('door did not open');
      const team = m.pool.filter((b) => b.active && b.storyWave);
      const homes = {};
      nav.rebuild(p.x, p.z);
      for (const b of team) {
        homes[b.sectionRoom] = (homes[b.sectionRoom] ?? 0) + 1;
        const [left, back, right, front] = b.roomBounds;
        if (b.x < left || b.x > right || b.z < back || b.z > front)
          throw Error('驻敌实际位置超出所属分区 ' + b.sectionRoom);
        const key = b.type + ':' + b.scale;
        if (!routes.has(key)) routes.set(key, nav.routeFor(b.type, true, b.scale));
        const bodyRoute = routes.get(key),
          aiRoute = nav.fields[b.type];
        bodyRoute.rebuild(p.x, p.z);
        if (bodyRoute.dist[bodyRoute.index(b.x, b.z)] < 0 || aiRoute.dist[aiRoute.index(b.x, b.z)] < 0)
          throw Error('分区守卫缺乏按实际体型可到达玩家的路线 ' + b.sectionRoom);
      }
      const distances = team.map((b) => Math.hypot(b.x - p.x, b.z - p.z) - b.radius - p.radius);
      const closedBefore = j < 2 ? s.doorStates[['samples', 'power'][j]] : s.doorStates.reactor;
      const blocked = team.filter((b) => g.level.blocked(b.x, b.z, b.y, b.radius, b.height)).length;
      const overlap = team.some((b, i) =>
        team.slice(0, i).some((a) => Math.hypot(a.x - b.x, a.z - b.z) + 0.001 < a.radius + b.radius),
      );
      reports.push({
        offset,
        j,
        size: team.length,
        homes,
        gap: Math.min(...distances),
        blocked,
        overlap,
        closedBefore,
      });
      if (team.length !== 100) return { error: s.guide(g, { keyItem: '核心' }), reports };
      if (offset === 0) {
        const left = team[48].sectionRoom;
        clearGroup((b) => b.sectionRoom === left && b.storyWave === team[0].storyWave);
        const roomLoot = g.pickups.objects.find((o) => o.active && o.name === left + '查获记录');
        const liveElsewhere = m.pool.filter((b) => b.active && b.storyWave).length;
        if (!roomLoot || liveElsewhere !== 74)
          throw Error('local clear wrongly mixed with other rooms ' + liveElsewhere);
        const meters = walk(roomLoot);
        claim(roomLoot);
        if (!g.loot.some((i) => i.name === roomLoot.name)) throw Error('room loot not carried');
        rooms.push({ j, left, meters, liveElsewhere });
        if (j === 2) {
          walk({ x: 22.05, z: -27, y: 0 });
          const coll = g.level.serviceHatch;
          if (!coll.active) throw Error('side barrier opened without interaction');
          g.encounter.interact(g);
          g.encounter.update(g, 1);
          const guard = m.pool.filter((b) => b.active && b.archiveTag);
          optional.guard = guard.length;
          optional.mainBefore = liveElsewhere;
          if (guard.length !== 100 || m.pool.filter((b) => b.active && b.storyWave).length !== 74)
            throw Error(
              'optional group ' +
                [
                  guard.length,
                  p.x,
                  p.z,
                  g.encounter.interactionHint(g),
                  g.encounter.hatchOpen,
                  g.level.serviceHatch.active,
                ],
            );
          const secret = g.field.secret;
          if (!secret || secret.center.x < 23 || secret.center.z < -42 || secret.center.z > -12)
            throw Error('档案区证物柜放置错误 ' + JSON.stringify(secret?.center));
          walk({ ...secret.front, z: secret.front.z + 1 });
          g.field.interact(g);
          if (g.field.secretOpen) throw Error('未清除守卫就能打开证物柜');
          clearGroup((b) => Boolean(b.archiveTag));
          const bonus = g.pickups.objects.find((o) => o.active && o.name === '冷藏疫株研究档案');
          if (!bonus || m.pool.filter((b) => b.active && b.storyWave).length !== 74)
            throw Error('missing optional loot or main membership conflict');
          optional.walk = walk(bonus);
          claim(bonus);
          if (!g.loot.some((i) => i.name === '冷藏疫株研究档案' && i.origin === 'vault'))
            throw Error('did not actually obtain archive loot');
          optional.reward = bonus.value;
          walk({ ...secret.front, z: secret.front.z + 1 });
          g.field.interact(g);
          if (!g.field.secretOpen) throw Error('清场后证物柜未解锁');
          const evidence = () => g.pickups.objects.find((o) => o.active && o.origin === 'secret');
          for (let retry = 0; !evidence() && retry < 150; retry++)
            await new Promise((resolve) => setTimeout(resolve, 20));
          const record = evidence();
          if (!record) throw Error('档案区证物未入场');
          walk(record);
          g.pickups.update(0, p, g);
          if (!g.loot.some((o) => o.name === record.name)) throw Error('证物不能实际带离');
        }
        const right = team[74].sectionRoom,
          tag = team[0].storyWave;
        clearGroup((b) => b.sectionRoom === right && b.storyWave === tag);
        const lootR = g.pickups.objects.find((o) => o.active && o.name === right + '查获记录'),
          rest = m.pool.filter((b) => b.active && b.storyWave).length;
        if (!lootR || rest !== 48) throw Error('right room rewards blocked ' + [right, rest]);
        const d = walk(lootR);
        claim(lootR);
        if (!g.loot.some((i) => i.name === lootR.name)) throw Error('right room loot not carried');
        rooms.push({ j, right, meters: d, liveElsewhere: rest });
      }
      for (const b of team) m.damage(b, 1000000, g, 'weapon');
      for (let i = 0; i < 50; i++) {
        g.time += 0.15;
        m.releaseSplits(g);
        for (const b of m.pool.filter((x) => x.active && x.storyWave)) m.damage(b, 1e6, g, 'weapon');
        s.step(0.15, g);
      }
      Object.assign(p, { x: 0, y: 0, z: z - 32 + 2.4 });
      if (!s.interact(g))
        throw Error('objective not advanced ' + [j, s.stage, s.guide(g, { keyItem: '核心' }).title]);
    }
    g.ui.update(1, g);
    if (s.roomTreasureCount !== 6 || !g.ui.nodes.loot.textContent.includes('/ 9'))
      throw Error('房间战利品计数错误');
    if (!extract) continue;
    walk(s.target);
    if (!s.interact(g)) throw Error('reactor door interaction failed');
    if (!m.boss) throw Error('missing boss');
    for (let phase = 0; m.boss?.active && phase < 6; phase++) {
      g.time += 3;
      m.damage(m.boss, 1e7, g, 'weapon');
    }
    const key = g.pickups.keyItem;
    if (!key?.active) throw Error('missing boss key');
    walk(key);
    if (!g.pickups.takeKey(p, g)) throw Error('uncollected boss key');
    s.step(0.04, g);
    walk(s.target);
    if (!s.interact(g)) throw Error('withdrawal door interaction failed');
    walk(s.target);
    s.step(0.04, g);
    if (g.phase !== 'win') throw Error('mission exit blocked ' + g.phase);
  }
  return { reports, rooms, optional, device: g.field.device, vault: g.field.vault?.front };
}
