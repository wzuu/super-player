import test from 'node:test';
import assert from 'node:assert/strict';
import { WeaponCombat, resetTargetEffects, weaponPerks } from '../src/weapon-perks.mjs';
import { SpatialHash } from '../src/world.mjs';

function beast(type = 0, x = 2) {
  const b = { type, x, y: 0, z: 1, active: true, cooldown: 0, hp: 500 };
  resetTargetEffects(b);
  return b;
}

function setup(skin, { stage = skin, force = [] } = {}) {
  const c = new WeaponCombat(skin, stage, 20);
  const b = beast(),
    a = beast(0, 3),
    d = beast(0, 4);
  const drops = [],
    damage = [],
    visuals = [];
  const game = {
    time: 0,
    encounter: {},
    player: { x: 0, y: 0, z: 0, hp: 50 },
    sound: { tone() {} },
    pickups: {
      add(...args) {
        drops.push(args);
      },
    },
    beasts: {
      hash: {
        query() {
          return [b, a, d];
        },
      },
      dropHeight() {
        return 0;
      },
      damage(target, amount, g, source) {
        damage.push([target, amount, source]);
        target.hp -= amount;
      },
    },
  };
  c.visual = (target, g, kind) => visuals.push(kind);
  c.arc = () => visuals.push('arc');
  c.visible = () => true;
  c.roll = (key) => force.includes(key);
  function hit(target = b, headshot = false) {
    c.beginShot();
    const h = { damage: 20, headshot };
    c.hit(target, h, game);
    return h;
  }
  return { c, game, b, a, d, hit, drops, damage, visuals };
}

for (const [skin, kind, duration] of [
  ['ember-fortress', 'burn', 4], ['jungle-temple', 'poison', 4], ['brass-factory', 'scald', 3],
]) {
  test(kind + ' 到期同帧刷新，完整结清两轮伤害', () => {
    const { c, game, b, hit, damage } = setup(skin);
    hit();
    for (let tick = 1; tick <= duration * 4; tick++) {
      game.time = tick / 2;
      if (game.time === duration) hit();
      c.updateTarget(b, game);
      assert.equal(damage.length, tick);
    }
    assert.ok(damage.every(([, amount]) => amount === (kind === 'scald' ? 1.2 : 0.8)));
    assert.equal(b.statusEffects.has(kind), false);
  });
}

test('末次毒伤致死时不会向已退场敌人重新施加特性', () => {
  const { c, game, b, hit } = setup('jungle-temple');
  hit();
  game.time = 3.5;
  c.updateTarget(b, game);
  game.beasts.damage = target => { target.active = false; };
  game.time = 4;
  hit();
  assert.equal(c.charge, 1);
  assert.equal(b.statusEffects.get('poison').until, 4);
});

test('防护型腐蚀封顶、样本在下次换弹生效，警报仅在所属场景加速', () => {
  const { c, b, hit, game, drops } = setup('underground-lab', { force: ['sample'] });
  b.type = 1;
  for (let i = 0; i < 6; i++) hit();
  assert.equal(b.statusEffects.get('corrosion').stacks, 5);
  assert.ok(c.damageScale(b, 'weapon', 0) > 1);
  assert.equal(c.damageScale(b, 'weapon', 6), 1);
  c.onKill(b, {}, game);
  assert.equal(drops[0][0], 'sample');
  c.samplePending = true;
  c.reloaded();
  assert.equal(hit().damage, 26);
  c.reloaded();
  assert.equal(hit().damage, 20);
  game.encounter.active = true;
  c.passive(0.1, game);
  assert.equal(c.fireRate, 1.15);
  c.stage = 'brass-factory';
  c.passive(0.1, game);
  assert.equal(c.fireRate, 1);
});

test('雷火印记范围、麻痹与血月叠层', () => {
  const { c, b, hit, game, damage } = setup('shanhai-secret-realm');
  game.encounter.phase = 'active';
  assert.equal(hit().damage, 22);
  hit();
  assert.equal(b.statusEffects.has('thunder'), false);
  assert.equal(damage.length, 2);
  assert.equal(damage[0][2], 'electric');
  c.updateTarget(b, game);
  assert.equal(b.perkMoveScale, 0);
  game.time = 1.1;
  c.updateTarget(b, game);
  assert.equal(b.perkMoveScale, 1);
  hit();
  hit();
  assert.equal(b.statusEffects.has('stunned'), false);
});

test('街头湿身、电伤加成与重甲击退减半', () => {
  const { c, b, a, hit, drops } = setup('rain-city', { force: ['heavy', 'luck'] });
  a.x = b.x;
  a.type = 1;
  assert.equal(hit().damage, 40);
  hit(a);
  assert.equal(a.perkPushX, b.perkPushX / 2);
  assert.equal(c.damageScale(b, 'electric', 0), 1.25);
  assert.equal(c.damageScale(b, 'electric-environment', 0), 1.25);
  assert.equal(c.damageScale(b, 'weapon', 0), 1);
  assert.equal(drops[0][0], 'ammo');
});

test('金沙连续四中、脱靶中断、爆头标记与蹲伏听距', () => {
  const { c, b, hit, game } = setup('buried-tomb', { force: ['eye'] });
  hit();
  hit();
  c.miss();
  hit();
  hit();
  hit();
  assert.equal(b.statusEffects.has('rooted'), false);
  hit();
  assert.ok(b.statusEffects.has('rooted'));
  assert.equal(hit(b, true).damage, 40);
  assert.ok(b.statusEffects.has('marked'));
  assert.equal(c.hearingScale({ crouched: true }), 0.6);
  assert.match(c.status(game), /标记/);
});

test('极地五层冻结、爆头碎冰、首领降级、体温恢复与目标复用', () => {
  const { c, b, a, hit, game } = setup('polar-station');
  hit();
  c.updateTarget(b, game);
  assert.equal(b.perkMoveScale, 0.92);
  for (let i = 1; i < 5; i++) hit();
  assert.ok(b.statusEffects.has('frozen'));
  assert.equal(hit(b, true).damage, 30);
  a.type = 3;
  for (let i = 0; i < 5; i++) hit(a);
  c.updateTarget(a, game);
  assert.equal(a.perkMoveScale, 0.6);
  game.encounter.temperature = 65;
  c.onKill(b, {}, game);
  assert.equal(game.encounter.temperature, 69);
  resetTargetEffects(a);
  assert.equal(c.status(game), '');
  assert.equal(a.controlReady, -Infinity);
});

test('珍珠引弧上限为两只，保留视线与水域边界', () => {
  const { c, b, a, d, hit, damage } = setup('drowned-city', { force: ['tidePush'] });
  hit();
  assert.equal(damage.length, 2);
  assert.equal(damage[0][1], 8);
  assert.ok(b.perkPushX > 0);
  assert.ok(a.statusEffects.has('stunned') && d.statusEffects.has('stunned'));
  c.visible = () => false;
  hit();
  assert.equal(damage.length, 2);
  assert.equal(c.terrainScale(0.43), 1);
  c.stage = 'ember-fortress';
  assert.equal(c.terrainScale(0.43), 0.43);
});

test('熔铸灼烧持续四秒、潮汐加倍、石化增加受到的伤害', () => {
  const { c, b, hit, game, damage } = setup('ember-fortress', { force: ['obsidian'] });
  hit();
  hit();
  assert.equal(c.damageScale(b, 'environment', 0), 1.3);
  game.encounter.phase = 'high';
  game.time = 4;
  c.updateTarget(b, game);
  assert.equal(damage.length, 8);
  assert.ok(Math.abs(damage.reduce((sum, entry) => sum + entry[1], 0) - 12.8) < 1e-8);
  assert.equal(b.statusEffects.size, 0);
});

test('太空工业悬浮、壁面击落、失压舱内增伤', () => {
  const { b, hit, game } = setup('derelict-station', { force: ['zeroG'] });
  game.encounter = { phase: 'open', panel: { data: { x0: -2, z0: -2, x1: 2, z1: 2 } } };
  b.clinging = true;
  const h = hit();
  assert.ok(Math.abs(h.damage - 32.4) < 1e-9);
  assert.equal(b.clinging, false);
  assert.ok(b.statusEffects.has('hover'));
  game.player.z = 4;
  assert.equal(hit().damage, 20);
});

test('赛博停机冷却、跨关机械识别、过载穿透只消费一发', () => {
  const { c, b, hit, game } = setup('neon-undercity', { stage: 'brass-factory', force: ['overload'] });
  assert.equal(hit().damage, 40);
  assert.equal(b.empReady, 8);
  assert.equal(c.beginShot(), true);
  assert.equal(c.beginShot(), false);
  assert.equal(c.damageScale(b, 'environment', 0), 1.1);
  game.time = 6;
  c.updateTarget(b, game);
  hit();
  assert.equal(b.statusEffects.has('stopped'), false);
  game.time = 8;
  hit();
  assert.ok(b.statusEffects.has('stopped'));
});

test('玉石十二发蓄能、毒素封顶与击杀移速', () => {
  const { c, b, hit, game } = setup('jungle-temple');
  for (let i = 0; i < 12; i++) hit();
  assert.equal(c.charge, 12);
  assert.equal(b.statusEffects.has('stone'), false);
  hit();
  assert.ok(b.statusEffects.has('stone'));
  assert.equal(b.statusEffects.get('poison').stacks, 3);
  assert.equal(c.damageScale(b, 'environment', 0), 1);
  c.onKill(b, {}, game);
  c.passive(0.1, game);
  assert.equal(c.moveSpeed, 1.15);
  game.time = 4;
  c.passive(0.1, game);
  assert.equal(c.moveSpeed, 1);
});

test('哥特跨关吸血、亡灵圣击及致死献祭', () => {
  const { c, b, hit, game, drops } = setup('bloodmoon-castle', { force: ['holy', 'sacrifice'] });
  game.encounter.phase = 'active';
  const h = hit();
  assert.equal(h.lifeSteal, 0.06);
  assert.equal(h.damage, 46);
  c.onKill(b, h, game);
  assert.equal(drops[0][0], 'health');
  c.onKill(b, null, game);
  assert.equal(drops.length, 1);
  c.stage = 'brass-factory';
  assert.equal(hit().lifeSteal, 0.03);
});

test('百鬼封印、花瓣范围减速、铜铃与灯笼掉落', () => {
  const { c, b, a, game, hit, drops, visuals } = setup('sakura-night-town', {
    force: ['bell', 'lantern', 'blossom'],
  });
  game.encounter.isLantern = (t) => t === b;
  hit();
  hit();
  assert.equal(hit().damage, 44);
  assert.ok(b.statusEffects.has('rooted'));
  assert.ok(visuals.includes('petal'));
  assert.ok(a.perkPushX > 0);
  c.updateTarget(a, game);
  assert.equal(a.perkMoveScale, 0.8);
  c.onKill(a, {}, game);
  assert.equal(drops.length, 0);
  c.onKill(b, {}, game);
  assert.deepEqual(
    drops.map((d) => d[0]),
    ['ammo', 'health'],
  );
});

test('蒸汽十五中后下一发释放、机械四层停机、蒸汽区域灼伤及击杀射速', () => {
  const { c, b, hit, game, damage } = setup('brass-factory', { force: ['piston'] });
  for (let i = 0; i < 15; i++) hit();
  assert.equal(b.statusEffects.has('stopped'), true);
  assert.equal(c.charge, 15);
  assert.equal(hit().damage, 40);
  assert.equal(c.charge, 1);
  assert.ok(b.perkPushX > 0);
  assert.equal(damage.length, 2);
  game.encounter.inSteam = () => true;
  game.time = 0.5;
  c.updateTarget(b, game);
  assert.equal(damage.at(-1)[1], 2.4);
  c.onKill(b, {}, game);
  c.passive(0.1, game);
  assert.equal(c.fireRate, 1.15);
  game.time = 5;
  c.passive(0.1, game);
  assert.equal(c.fireRate, 1);
});

test('狂欢连续命中、气球弱点、八音盒、幸运门票及设施共鸣', () => {
  const { c, b, hit, game, drops } = setup('haunted-midway', { force: ['ticket'] });
  b.type = 2;
  for (let i = 0; i < 4; i++) hit();
  assert.equal(hit().damage, 52);
  assert.ok(b.statusEffects.has('rooted'));
  assert.equal(drops.length, 5);
  game.time = 6;
  game.encounter.rideActive = true;
  let probability;
  c.roll = (k, r) => {
    if (k === 'ridePush') probability = r;
    return k === 'music';
  };
  hit();
  assert.ok(b.statusEffects.has('confused'));
  assert.equal(probability, 0.1);
});

test('游园枪持续命中首领时，普通减速无法延长控制降级的 40% 减速', () => {
  const { c, b, hit, game } = setup('haunted-midway');
  b.type = 3;
  for (let i = 0; i < 5; i++) hit();
  c.updateTarget(b, game);
  assert.equal(b.perkMoveScale, 0.6);
  game.time = 1.4;
  hit();
  game.time = 1.6;
  c.updateTarget(b, game);
  assert.equal(b.perkMoveScale, 0.75);
});

test('穿透跳过第一个目标且仍受掩体射程限制', () => {
  const hash = new SpatialHash(2),
    origin = { x: 0, y: 1, z: 0 },
    direction = { x: 1, y: 0, z: 0 };
  const front = { x0: 2, x1: 3, z0: -1, z1: 1, y0: 0, y1: 2 },
    back = { ...front, x0: 5, x1: 6 };
  hash.insert(front);
  hash.insert(back);
  assert.equal(hash.ray(origin, direction, 9), front);
  assert.equal(hash.ray(origin, direction, 4, front), null);
  assert.equal(hash.ray(origin, direction, 9, front), back);
});

test('十四组钩子齐全，低概率特性长时间模拟接近目标概率且连续失败有上限', () => {
  assert.equal(Object.keys(weaponPerks).length, 14);
  let seed = 7;
  const random = () => (seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296;
  const c = new WeaponCombat('rain-city', 'rain-city', 20, random);
  let count = 0,
    longest = 0,
    gap = 0;
  for (let i = 0; i < 200000; i++) {
    if (c.roll('luck', 0.01)) {
      count++;
      longest = Math.max(longest, gap);
      gap = 0;
    } else gap++;
  }
  assert.ok(count > 1860 && count < 2140);
  assert.ok(longest < 600);
});
