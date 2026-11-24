// 职能和精英修饰既有原型，同一实体沿用原来的移动、命中盒和死亡确认。
export const roleRules = {
  volatile: { title: '自爆体', stage: 2, type: 0, hp: 0.66, speed: 1.28, radius: 3.8, fuse: 1.35 },
  shield: { title: '护盾体', stage: 5, type: 1, hp: 0.77, speed: 0.67, radius: 4, charge: 105 },
  brood: {
    title: '孵化体',
    stage: 8,
    type: 2,
    hp: 1.1,
    speed: 0.83,
    radius: 5,
    interval: 9,
    windup: 1.65,
    limit: 3,
  },
};
export const affixTitles = { swift: '疾行', thorn: '荆棘', split: '分裂', trail: '燃迹', armor: '厚甲' };
const affixes = Object.keys(affixTitles);
const has = (b, trait) => b.affixes?.includes(trait);
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function blastArea(game, center, radius, damage, explosive = true) {
  const { x, y, z } = center,
    { beasts, level, player } = game;
  const candidates = beasts.hash.query(x - radius, z - radius, x + radius, z + radius, []);
  const impact = explosive ? { blastOrigin: center } : null;
  function visible(target) {
    const origin = beasts.air.set(x, y + 0.5, z),
      ray = beasts.line.set(target.x - x, target.y + 0.6 - origin.y, target.z - z);
    const distance = ray.length();
    return distance <= radius && (!distance || level.visible(origin, ray.divideScalar(distance), distance));
  }
  for (const target of candidates) {
    if (!target.active || !visible(target)) continue;
    const distance = Math.max(0.1, Math.hypot(target.x - x, target.z - z));
    target.perkPushX = (5 * (target.x - x)) / distance;
    target.perkPushZ = (5 * (target.z - z)) / distance;
    target.knockX = target.perkPushX;
    target.knockZ = target.perkPushZ;
    beasts.damage(target, damage, game, 'environment', impact);
  }
  if (visible(player)) player.hurt(damage * 0.3, game, undefined, center);
}

export class FoeTraits {
  constructor(stage, config) {
    this.stage = stage;
    this.config = config;
    this.available = Object.keys(roleRules).filter((key) => stage >= roleRules[key].stage);
    this.splits = [];
  }
  roll(type, game, forcedElite = false) {
    const eligible = this.available.find(key => roleRules[key].type === type);
    const role = eligible && Math.random() < .13 ? eligible : null;
    const traits = {role,affixes:null};
    const boss = game.beasts.boss;
    const bossFight = boss?.active && (boss.fight?.started || gap(boss, game.player) < 23);
    const odds = (0.012 + this.stage * 0.0028) * this.config.player.incoming;
    if (!bossFight && (forcedElite || Math.random() < odds)) {
      const choices = affixes.filter((id) => !(id === 'swift' && role === 'volatile'));
      traits.affixes = [choices.splice(Math.floor(Math.random() * choices.length), 1)[0]];
      if (this.stage >= 10 && Math.random() < 0.24)
        traits.affixes.push(choices[Math.floor(Math.random() * choices.length)]);
    }
    return traits;
  }
  assign(beast, game, forcedElite = false, rolled) {
    if (!beast || beast.type === 3 || !this.stage) return;
    const {role,affixes} = rolled ?? this.roll(beast.type, game, forcedElite);
    Object.assign(beast,{role,affixes});
    if (role) {
      beast.hp *= roleRules[role].hp;
      beast.shield = roleRules[role].charge ?? 0;
    }
    if (affixes) {
      const scale = 1.25;
      if (!game.level.blocked(beast.x, beast.z, beast.y, beast.radius * scale, beast.height * scale)) {
        beast.scale = scale;
        beast.radius *= scale;
        beast.height *= scale;
      }
      beast.hp *= 1.85;
    }
    beast.maxHP = beast.hp;
    beast.traitSpeed = (roleRules[beast.role]?.speed ?? 1) * (has(beast, 'swift') ? 1.32 : 1);
  }
  damage(beast, amount, game, source, hit) {
    if (beast.type === 3 || source === 'detonation') return amount;
    const { x, z } = beast,
      radius = roleRules.shield.radius;
    if (beast.role !== 'shield') {
      const nearby = game.beasts.hash.query(x - radius, z - radius, x + radius, z + radius, []);
      const shield = nearby.find(
        (b) => b.active && b.role === 'shield' && b.shield > 0 && gap(b, beast) <= radius,
      );
      if (shield) {
        const blocked = Math.min(amount, shield.shield);
        shield.shield -= blocked;
        amount -= blocked;
        shield.flash = 0.12;
        if (!shield.shield) {
          game.ui.notify('护盾核心已破碎', 1);
          game.sound.tone(760, 220, 0.14, 0.13);
        }
      }
    } else if (hit?.headshot && beast.shield > 0) {
      beast.shield = Math.max(0, beast.shield - amount * 2);
      if (!beast.shield) game.ui.notify('护盾核心已破碎', 1);
    }
    if (beast.role === 'brood' && beast.charging && amount > 0) {
      beast.charging = false;
      beast.traitAt = game.time + roleRules.brood.interval;
    }
    if (source === 'weapon' || source === 'electric') {
      const p = game.player;
      if (has(beast, 'thorn') && gap(beast, p) < 4) p.hurt(Math.min(6, amount * 0.1), game, undefined, beast);
      if (has(beast, 'armor')) amount *= (p.x - x) * beast.fx + (p.z - z) * beast.fz > 0 ? 0.46 : 1.35;
    }
    return amount;
  }
  offspring(parent, game, count) {
    const children = game.beasts.spawnGroup(Array.from({length:count}, () => ({type:0,regular:false})),
      {anchors:[parent]});
    for (const child of children) {
      child.alert = 5;
      child.storyWave = parent.storyWave ?? null;
      child.fieldGroup = parent.fieldGroup ?? null;
      if (['vault', 'deep'].includes(child.fieldGroup)) game.field.guards.push(child);
    }
    return children.length === count;
  }
  step(b, g, dt) {
    if (has(b, 'swift')) b.cooldown -= dt * 0.3;
    if (has(b, 'trail') && g.time >= b.trailAt && b.stride > 0.8) {
      b.trailAt = g.time + 1.15;
      g.projectiles.pool(b.x, b.y, b.z, 2.7);
    }
    if (b.role === 'volatile') {
      if (!b.charging && gap(b, g.player) < roleRules.volatile.radius * 0.85 && b.playerVisible) {
        b.charging = true;
        b.traitAt = g.time + roleRules.volatile.fuse;
        g.sound.tone(360, 820, 0.27, 0.18);
        b.alert = 5;
      }
      if (b.charging && g.time >= b.traitAt) {
        // 先移除自身再广播范围伤害，连锁死亡不会重复引爆。
        const position = { x: b.x, y: b.y, z: b.z };
        g.beasts.damage(b, b.maxHP * 10, g, 'detonation');
        if (!b.active) blastArea(g, position, roleRules.volatile.radius, 70);
      }
    }
    if (b.role === 'brood' && b.broods < roleRules.brood.limit && b.playerVisible && g.time >= b.traitAt) {
      const rules = roleRules.brood;
      if (!b.charging) {
        b.charging = true;
        b.traitAt = g.time + rules.windup;
        g.sound.tone(280, 560, 0.37, 0.12);
      } else {
        b.charging = false;
        b.traitAt = g.time + rules.interval;
        const nearby = g.beasts.hash.query(
          b.x - rules.radius,
          b.z - rules.radius,
          b.x + rules.radius,
          b.z + rules.radius,
          [],
        );
        const hurt = nearby.find(
          (n) => n.active && n.type !== 3 && n.hp < n.maxHP && gap(n, b) <= rules.radius,
        );
        if (hurt) {
          hurt.hp = Math.min(hurt.maxHP, hurt.hp + 28);
          hurt.flash = 0.09;
        }
        if (hurt || this.offspring(b, g, 1)) b.broods++;
      }
    }
  }
  defeated(b) {
    if (has(b, 'split'))
      this.splits.push({ x: b.x, y: b.y, z: b.z, storyWave: b.storyWave, fieldGroup: b.fieldGroup });
  }
}
