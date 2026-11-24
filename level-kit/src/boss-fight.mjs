// 阶段边界在伤害结算时截断，同一次命中或持续伤害不能跨过多个阶段。
export const bossRules = {
  hpScale: 12.8,
  armor: 0.22,
  thresholds: [0.7, 0.35, 0],
  windup: 1.25,
  cooldown: [7.4, 6.3, 5.6],
  expose: [2.2, 2.6, 3.3],
  breakHits: 6,
  vulnerable: 2.4,
  transition: 1.25,
  summon: [3, 4],
};
const patterns = ['震地冲击', '腐蚀喷涌', '交叉雷击'];

export function createBossFight(b, config, stage) {
  const rules = { ...bossRules, ...config.beasts.bossFight };
  b.maxHP = b.hp = Math.round(
    b.hp * rules.hpScale * (0.92 + Math.min(0.32, stage * 0.018)) * Math.sqrt(config.player.incoming),
  );
  const pattern = stage === 3 ? 2 : stage % 3;
  b.fight = {
    stage: 0,
    pattern,
    started: false,
    next: 0,
    winding: false,
    transitionUntil: 0,
    weakUntil: 0,
    brokenUntil: 0,
    breaks: 0,
    charge: 0,
    aimX: b.x,
    aimZ: b.z,
    rules,
  };
}
function engage(b, game) {
  const f = b.fight;
  if (!f.started) {
    f.started = true;
    f.startedAt = game.time;
    f.next = game.time + 2.6;
    if (game.story?.stage === 'boss' && game.field?.device && f.pattern === 1)
      game.ui.notify('躲开喷涌，核心亮起时射击 · 青色脉冲柱可破甲', 3);
  }
}
export function bossDamage(b, amount, game, hit) {
  const f = b.fight,
    rules = f.rules,
    now = game.time;
  engage(b, game);
  if (now < f.transitionUntil) return 0;
  if (now < f.brokenUntil) amount *= 1.6;
  else if (now < f.weakUntil && hit?.headshot) {
    hit.weak = true;
    amount *= 1.38;
    if (++f.charge >= rules.breakHits) breakBoss(b, game);
  } else {
    amount *= rules.armor;
    if (hit && now >= (f.armorSoundAt ?? 0)) {
      f.armorSoundAt = now + 0.35;
      game.sound.tone(210, 155, 0.045, 0.12, 'square');
    }
  }
  const bound = b.maxHP * rules.thresholds[f.stage];
  if (f.stage < 2 && b.hp - amount <= bound) {
    f.stage++;
    f.transitionUntil = now + rules.transition;
    f.next = f.transitionUntil + 1.4;
    f.winding = false;
    f.weakUntil = f.brokenUntil = f.charge = 0;
    b.summon = Math.min(
      rules.summon[f.stage - 1],
      Math.max(0, (game.story?.cap ?? game.beasts.pool.length) - game.beasts.live),
    );
    game.ui.notify(f.stage === 1 ? '首领破壳 · 第二阶段' : '首领狂暴 · 第三阶段', 1.5);
    game.sound.tone(125, 49, 0.45, 0.28, 'sawtooth');
    return Math.max(0, b.hp - bound);
  }
  return amount;
}
export function breakBoss(b, game) {
  const f = b.fight;
  if (!f || game.time < f.transitionUntil || game.time < f.brokenUntil) return false;
  f.brokenUntil = game.time + f.rules.vulnerable;
  f.charge = 0;
  f.breaks++;
  b.stun = Math.max(b.stun, 1.25);
  b.flash = 0.18;
  game.attackPauseUntil = Math.max(game.attackPauseUntil, game.time + 0.04);
  game.player.attackKick = Math.max(game.player.attackKick, 0.3);
  game.sound.tone(780, 160, 0.18, 0.2, 'triangle');
  game.ui.notify('首领破甲 · 集中攻击', 1.4);
  return true;
}
export function bossStep(b, g, realPlayer, level) {
  const f = b.fight,
    t = g.time,
    p = realPlayer,
    distance = Math.hypot(b.x - p.x, b.z - p.z);
  if (!f.started && (distance > 22 || !b.playerVisible)) return;
  engage(b, g);
  if (t < f.transitionUntil) {
    b.stride = 0;
    return true;
  }
  if (f.winding && t >= f.next) {
    f.winding = false;
    f.weakUntil = t + f.rules.expose[f.stage];
    f.next = f.weakUntil + f.rules.cooldown[f.stage];
    b.stun = Math.max(0.65, b.stun);
    const aimed = { x: f.aimX, y: f.aimY, z: f.aimZ };
    const effect = g.beasts.air.set(aimed.x, aimed.y + 0.15, aimed.z);
    g.effects.spray(effect, g.beasts.bossTint, 22, 5, 0.085, 'spark');
    const ray = g.beasts.line.set(p.x - b.x, p.y + 0.8 - (b.y + 1), p.z - b.z),
      range = ray.length();
    const second = f.pattern === 2 && f.stage >= 1 && Math.hypot(p.x - f.nextX, p.z - f.nextZ) < 2.5;
    if (
      (second || Math.hypot(p.x - aimed.x, p.z - aimed.z) < 2.2 + 0.5 * f.stage) &&
      Math.abs(p.y - aimed.y) < 1.7 &&
      level.visible(g.beasts.air.set(b.x, b.y + 1, b.z), ray.divideScalar(Math.max(0.01, range)), range)
    )
      p.hurt(13 + 4 * f.stage, g, undefined, b);
    if (f.pattern === 1) g.projectiles.pool(aimed.x, aimed.y, aimed.z, 2 + f.stage);
    if (f.pattern === 2 && f.stage >= 1) {
      const origin = g.beasts.air.set(f.nextX, aimed.y + 6, f.nextZ),
        end = g.beasts.line.set(f.nextX, aimed.y + 0.12, f.nextZ);
      g.effects.streak(origin, end);
      g.effects.spray(end, g.beasts.bossTint, 18, 3, 0.065, 'spark');
    }
    if (f.pattern === 0 && f.stage >= 1) {
      const gap = Math.max(1, Math.hypot(f.aimX - b.x, f.aimZ - b.z));
      b.perkPushX = (8 * (f.aimX - b.x)) / gap;
      b.perkPushZ = (8 * (f.aimZ - b.z)) / gap;
    }
    g.sound.tone(150, 50, 0.19, 0.2);
    g.ui.notify('反击窗口 · 瞄准发光核心', 1.1);
  } else if (!f.winding && t >= f.next && distance <= 29) {
    f.winding = true;
    f.next = t + f.rules.windup;
    f.aimX = p.x;
    f.aimY = p.y;
    f.aimZ = p.z;
    f.nextX = p.x + Math.cos(p.look.rotation.y) * 3;
    f.nextZ = p.z - Math.sin(p.look.rotation.y) * 3;
    g.sound.tone(260, 690, 0.27, 0.16, 'triangle');
    g.ui.notify(patterns[f.pattern] + ' · 离开地面警示圈', 1.1);
  }
  if (f.winding) {
    b.stride = 0;
    return true;
  }
  return false;
}
