async function verifyLabLayout({ offsets, extract }) {
  const { game: g, nav, config: c } = run,
    s = g.story,
    p = g.player,
    m = g.beasts;
  const reports = [],
    rooms = [],
    approaches = [],
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
      if (offsets.length > 1) {
        // 从门口的左、中、右三个站位出发，分别实际走到左右侧房，开门时只能直接迎击走廊驻敌。
        const start = {x:p.x, y:p.y, z:p.z};
        const visible = team.filter(b => {
          const eye=m.air.set(p.x,p.y+p.eye,p.z);
          const ray=m.line.set(b.x-eye.x,b.y+b.height*.65-eye.y,b.z-eye.z), range=ray.length();
          return g.level.visible(eye,ray.divideScalar(range),range);
        });
        if (!visible.length || visible.some(b => b.roomBounds[0]>0 || b.roomBounds[2]<0))
          throw Error('开门时的射界未与侧房错开 '+JSON.stringify({j,offset,names:visible.map(b=>b.sectionRoom)}));
        const metres=[];
        for (const side of [-1,1]) {
          Object.assign(p,start);
          nav.rebuild(p.x,p.z);
          metres.push(walk({x:side*15.35,y:0,z:z-26.3}));
        }
        const [near,far]=j===1 ? [metres[1],metres[0]] : metres;
        if (far<=near) throw Error('后侧房间没有错开推进距离 '+JSON.stringify({j,offset,metres}));
        approaches.push({j,offset,visible:visible.length,near,far});
        Object.assign(p,start);
        nav.rebuild(p.x,p.z);
      }
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
  return { reports, rooms, approaches, optional, device: g.field.device, vault: g.field.vault?.front };
}

function verifyLabWatch() {
  const {game:g, nav, config} = run, p=g.player, m=g.beasts, l=g.level;
  const dt=.04;
  const check=(ok,why) => { if (!ok) throw Error(why); };
  const at=(x,z) => { Object.assign(p,{x,y:0,z}); nav.rebuild(x,z); };
  function tick(n) {
    for(let i=0;i<n;i++){g.time+=dt; m.update(dt,p,g);}
  }
  function sees(b,x,z) {
    const eye=m.air.set(b.x,b.y+.8,b.z);
    const ray=m.line.set(x-eye.x,.5-eye.y,z-eye.z), range=ray.length();
    return l.visible(eye,ray.divideScalar(range),range);
  }
  document.querySelector('#mission-mode').value='classic';
  g.reset(); g.phase='play'; p.hurtDelay=Infinity; g.encounter.update(g,.1);
  at(0,53.1); g.story.interact(g);
  const guards=m.pool.filter(b=>b.active && b.guardPost);
  check(guards.length===100,'首次开门未部署100个带驻点的守卫');
  const identity=guards.map(b=>[b.spawnGeneration,b.storyWave,b.sectionRoom]);
  at(0,-70);
  const before=guards.map(b=>[b.x,b.z,b.yaw]);
  tick(110);
  const patrolling=guards.filter((b,i)=>Math.hypot(b.x-before[i][0],b.z-before[i][1])>.15).length;
  const watching=guards.filter((b,i)=>Math.abs(Math.sin(b.yaw-before[i][2]))>.12).length;
  check(patrolling>0 && watching>0 && guards.every(b=>!b.roomAlert),'隔门守卫没有巡逻/警戒，或隔墙追击');
  check(!guards.some((b,i)=>guards.slice(i+1).some(a=>Math.hypot(a.x-b.x,a.z-b.z)+.02<a.radius+b.radius)),'警戒巡视中守卫互相挤入');
  check(guards.every(b=>!l.blocked(b.x,b.z,b.y,b.radius,b.height) && Math.abs(b.y-l.foot(b.x,b.z,b.y+.05,b.radius))<.08),'巡逻撞墙或离地');
  const source={x:0,z:39};
  at(source.x,source.z);
  const hidden=guards.filter(b=>!b.roomAlert && b.sectionRoom!=='安检走廊' && !sees(b,p.x,p.z) &&
    Math.hypot(b.x-p.x,b.z-p.z)<config.weapon.hearingRadius-1);
  check(hidden.length>=2,'射程内没有隔墙驻守者');
  Object.assign(g,{shotAt:g.time,shotX:p.x,shotY:p.y,shotZ:p.z,shotHearingScale:1});
  tick(1);
  const heard=hidden.filter(b=>!b.roomAlert && b.heardAt===g.shotAt);
  check(heard.length>=2,'墙后守卫未听到枪声，或直接锁定了玩家');
  at(0,-70);
  const gaps=heard.map(b=>Math.hypot(b.x-source.x,b.z-source.z));
  tick(45);
  const pursuer=heard.find((b,i)=>!b.roomAlert && gaps[i]-Math.hypot(b.x-source.x,b.z-source.z)>.16);
  check(pursuer && heard.every(b=>!b.roomAlert && b.heardX===source.x && b.heardZ===source.z),
    '守卫未调查最后一次开火的位置或隔墙改跟了玩家');
  const investigated=gaps[heard.indexOf(pursuer)]-Math.hypot(pursuer.x-source.x,pursuer.z-source.z);
  const target=heard.find(b=>b!==pursuer);
  m.damage(target,4,g,'weapon'); tick(1);
  check(target.roomAlert,'守卫被命中后未立即接战');
  let exposed=null;
  for(let radius=5; radius<=12 && !exposed; radius++)
    for(let i=0;i<16 && !exposed;i++){
      const angle=i*Math.PI/8, x=pursuer.x+Math.cos(angle)*radius, z=pursuer.z+Math.sin(angle)*radius;
      if (!l.blocked(x,z,0,p.radius,p.height) && sees(pursuer,x,z)) exposed={x,z};
    }
  check(exposed,'没有可站立的守卫正面视点');
  at(exposed.x,exposed.z); tick(6);
  check(pursuer.roomAlert,'六帧观察内可见玩家未触发追击');
  at(0,22.3); tick(120);
  check(g.story.doorStates.samples && guards.some(b=>b.roomAlert && Math.hypot(b.x,b.z-20)<6),'已接战守卫没有抵达关闭的下一段门前');
  // 把玩家定位到下一扇实门后面。当前段已追到门前的守卫仍受实体碰撞，未激活者没有隔门视野。
  at(0,18.1);
  const unalerted=guards.filter(b=>!b.roomAlert);
  tick(140);
  check(unalerted.length>0 && guards.every(b=>b.z>20) && unalerted.every(b=>!b.roomAlert),'追击穿过了关门，或在关门后看到了玩家');
  check(guards.every((b,i)=>b.active && b.spawnGeneration===identity[i][0] && b.storyWave===identity[i][1] && b.sectionRoom===identity[i][2]),
    '巡逻、调查或追击改变了整批驻敌的房间归属');
  return {patrolling,watching,heard:heard.length,investigated:+investigated.toFixed(2),behindDoor:unalerted.length};
}
