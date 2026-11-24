function sampleEncounterDrops({name, opts: options, n: sampleCount, seed}) {
  const {game: game, config} = run,
    beasts = game.beasts,
    pickups = game.pickups;
  const originalRandom = Math.random,
    add = pickups.add.bind(pickups),
    originalCombat = game.weapon.combat;
  let state = seed >>> 0;
  const random = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
  Math.random = random;
  const counts = {},
    names = {},
    amounts = {};
  game.reset();
  pickups.add = (kind, x, z, y, name, value, ...rest) => {
    const item = add(kind, x, z, y, name, value, ...rest);
    if (item) {
      counts[kind] = (counts[kind] ?? 0) + 1;
      names[name] = (names[name] ?? 0) + 1;
      amounts[kind] = (amounts[kind] ?? 0) + value;
      // 每个真正生成的实例均记录一次，随后回收，排除堆叠、容量和回收时机干扰。
      item.active = false;
    }
    return item;
  };
  try {
    const combat = new originalCombat.constructor(
      options.weapon ?? (options.perk ? name : 'paris-tower'),
      name,
      config.weapon.damage,
      random,
    );
    combat.visual = () => {};
    combat.arc = () => {};
    combat.visible = originalCombat.visible;
    game.weapon.combat = combat;
    game.variation = options.plenty ? {ammo: 1.5} : null;
    game.weapon.reserve = options.low ? 0 : config.weapon.maxReserve;
    game.kills = 0;
    game.phase = 'play';
    game.time = 200;
    game.bossDead = false;
    game.core = false;
    beasts.boss = null;
    beasts.live = 0;
    beasts.pool.forEach((beast) => (beast.active = false));
    beasts.refreshHash();
    for (const item of pickups.objects) item.active = false;
    pickups.deepSupplies = !!options.deep;
    if (options.moon) game.encounter.phase = 'active';
    else if ('phase' in (game.encounter ?? {})) game.encounter.phase = 'calm';
    if (options.alarm) game.encounter.setAlarm(true);
    let eventState = null;
    if (options.event) {
      const event = game.encounter;
      event.reset?.();
      const at = (t) => {
        game.time = t;
        event.update(game, 0.02);
      };
      if (options.event === 'cold') {
        event.temperature = 55;
        at(10);
      } else if (options.event === 'sandstorm') at(config.storm.interval + 1);
      else if (options.event === 'lava') at(130);
      else {
        const start = event.opens ?? event.nextRain ?? event.next;
        at(start - 0.5);
        at(start + 0.2);
        if (options.event === 'rising-water') at(start + 3);
      }
      eventState = event.status?.title ?? event.phase ?? event.status?.label;
      for (const beast of beasts.pool) beast.active = false;
      beasts.live = 0;
      beasts.boss = null;
      beasts.refreshHash();
    }
    const type = options.boss ? 3 : (options.type ?? 0),
      body = config.beasts.types[type],
      level = game.level,
      nav = run.nav;
    const site = level.sites
      .map((i) => ({x: nav.x(i), z: nav.z(i)}))
      .find(
        (item) =>
          Math.hypot(item.x - game.player.x, item.z - game.player.z) > 8 &&
          !level.blocked(item.x, item.z, level.base(item.x, item.z), body.radius, body.height),
      );
    if (!site) throw Error('找不到符合体型与玩家距离的测试位置');
    for (let i = 0; i < sampleCount; i++) {
      const parent = {x: site.x, y: level.base(site.x, site.z), z: site.z};
      let beast;
      if (options.child) {
        beasts.traits.offspring(parent, game, 1);
        beast = beasts.pool.find((v) => v.active);
      } else if (options.egg) {
        const event = game.encounter;
        event.phase = 'calm';
        event.opens = Infinity;
        const staged = event.stage(parent, 1, game);
        if (!staged) throw Error('no eggs');
        game.time = Math.max(...event.eggs.filter((o) => o.active).map((o) => o.hatch)) + 0.001;
        event.update(game, 0);
        beast = beasts.pool.find((v) => v.active);
      } else beast = beasts.spawn(type, site.x, site.z, parent.y, 1);
      if (!beast) throw Error('fixture was rejected');
      if (options.elite) beast.affixes = ['swift'];
      if (options.lantern) game.encounter.script.set(beast, i);
      game.time += 2;
      if (options.eject) {
        beasts.eject(beast, game);
        continue;
      }
      const hit = {damage: 1e6};
      if (options.perk || options.dot) combat.hit(beast, hit, game);
      if (options.dot) {
        beast.hp = 0.01;
        game.time += 1;
        combat.updateTarget(beast, game);
        if (beast.active) throw Error('dot did not kill');
      }
      for (let k = 0; beast.active && k < 4; k++) {
        game.time += 2;
        beasts.damage(beast, 1e9, game, options.source ?? 'weapon', hit);
      }
      if (beast.active) throw Error('incomplete kill');
    }
    if (game.kills !== sampleCount) throw Error('wrong sample count ' + game.kills);
    return {n: sampleCount, kinds: counts, names, amounts, eventState};
  } finally {
    Math.random = originalRandom;
    game.weapon.combat = originalCombat;
    pickups.add = add;
    pickups.deepSupplies = false;
    if (options.alarm) game.encounter.setAlarm(false);
  }
}
