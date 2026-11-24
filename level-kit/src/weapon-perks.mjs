// 特性按实际佩戴的步枪选择；事件与敌人阵营始终读取当前战场。
const effectTitles = {
  corrosion: '∴ 酸蚀',
  thunder: 'ϟ 雷印',
  wet: '≈ 潮湿',
  sand: '≋ 流沙',
  frost: '✳ 寒霜',
  burn: '△ 灼烧',
  rooted: '⊠ 定身',
  frozen: '✳ 冻结',
  stunned: 'ϟ 麻痹',
  hover: '↑ 悬浮',
  stone: '◆ 石化',
  stopped: '∥ 停机',
  confused: '⟳ 混乱',
  slowed: '↓ 减速',
  bossSlow: '↓ 抗性减速',
  marked: '◎ 标记',
  poison: '∴ 中毒',
  seal: '◇ 符咒',
  scald: '△ 烫伤',
  gear: '⊗ 齿轮卡滞',
  ribbon: '∞ 彩带',
  grounded: '↓ 击落',
};
const controlKinds = new Set(['rooted', 'frozen', 'stunned', 'hover', 'stone', 'stopped']);
const machineStages = new Set(['neon-undercity', 'brass-factory']);
const beastStages = new Set([
  'shanhai-secret-realm',
  'rain-city',
  'buried-tomb',
  'polar-station',
  'drowned-city',
  'ember-fortress',
  'jungle-temple',
]);
const waterStages = new Set(['drowned-city', 'jungle-temple']);
const coefficients = new Map();
export const reactionCatalog = [
  {id:'toxic',name:'毒爆',rule:'中毒目标被火焰击中时消耗全部毒层，伤害附近敌人。毒镖步枪可接手雷。',tint:'fire',radius:4,scale:.7,limit:5},
  {id:'conduct',name:'导电',rule:'潮湿、积水或蒸汽中的目标遭电击时，依次传到附近最多三个敌人。',tint:'arc',radius:4.5,scale:.50,limit:3},
  {id:'shatter',name:'碎冰',rule:'冻结目标遭重击或近距霰弹时碎裂。贴身释放减速力场可短时冻结。',tint:'ice',radius:0,scale:1.3,limit:0},
  {id:'vapor',name:'蒸爆',rule:'寒霜命中烫伤目标或活跃蒸汽喷口中的敌人时，产生蒸汽团并伤害邻近敌人。',tint:'steam',radius:3.5,scale:.6,limit:4},
];

// 连续未触发时线性增加机会；求出系数，使长期平均触发率仍等于配置值。
function chanceCoefficient(rate) {
  if (coefficients.has(rate)) return coefficients.get(rate);
  let low = 0,
    high = rate;
  for (let i = 0; i < 32; i++) {
    const c = (low + high) / 2;
    let survival = 1,
      average = 0;
    for (let k = 1; survival > 1e-10; k++) {
      average += survival;
      survival *= Math.max(0, 1 - c * k);
    }
    if (1 / average < rate) low = c;
    else high = c;
  }
  coefficients.set(rate, high);
  return high;
}

function put(target, kind, time, seconds, limit = 1, amount = 1) {
  let effect = target.statusEffects.get(kind);
  if (!effect || effect.until <= time) {
    effect = { type: kind, stacks: 0, until: 0, tickAt: time + 0.5 };
    target.statusEffects.set(kind, effect);
  }
  effect.stacks = Math.min(limit, effect.stacks + amount);
  effect.until = time + seconds;
  return effect;
}

function active(target, kind, now) {
  const effect = target.statusEffects.get(kind);
  return effect?.until > now ? effect : null;
}

function push(target, origin, speed) {
  const x = target.x - origin.x,
    z = target.z - origin.z;
  const distance = Math.hypot(x, z) || 1;
  const strength = target.type === 3 ? speed * 0.4 : speed;
  target.perkPushX += (x / distance) * strength;
  target.perkPushZ += (z / distance) * strength;
}

function drop(target, game, kind, name, value) {
  const y = game.beasts.dropHeight(target);
  game.pickups.add(kind, target.x - 0.19, target.z + 0.23, y, name, value);
}

function bloodMoon(combat, game) {
  return (
    (combat.stage === 'bloodmoon-castle' || combat.stage === 'shanhai-secret-realm') &&
    game.encounter?.phase === 'active'
  );
}

function inVacuum(combat, game) {
  const sector = game.encounter?.panel?.data;
  const p = game.player;
  return (
    combat.stage === 'derelict-station' &&
    game.encounter.phase === 'open' &&
    sector &&
    p.x >= sector.x0 &&
    p.x <= sector.x1 &&
    p.z >= sector.z0 &&
    p.z <= sector.z1
  );
}

function timedControl(c, target, kind, duration, game) {
  if (target.controlReady > game.time) return false;
  target.controlReady = game.time + 5;
  const effect = put(target, target.type === 3 ? 'bossSlow' : kind, game.time, duration);
  if (target.type === 3) effect.scale = 0.6;
  else {
    if (kind === 'confused') {
      effect.angle = (c.random() * 0.75 + 0.125) * Math.PI * (c.random() < 0.5 ? -1 : 1);
    } else {
      target.mode = 'move';
      target.cooldown = Math.max(target.cooldown, duration);
    }
  }
  c.visual(target, game, kind === 'stone' ? 'stone' : 'ice');
  return true;
}

function slow(target, time, duration, scale) {
  const previous = active(target, 'slowed', time);
  const effect = put(target, 'slowed', time, duration);
  effect.scale = Math.min(previous?.scale ?? 1, scale);
}

function area(c, center, radius, game, visitor, maximum = Infinity,exclude = null) {
  // 在同一帧内，死亡特效可能再次调用空间查询。保持各次查询的候选列表独立。
  const nearby = game.beasts.hash.query(
    center.x - radius,
    center.z - radius,
    center.x + radius,
    center.z + radius,
    [],
  );
  nearby.sort(
    (a, b) => (a.x - center.x) ** 2 + (a.z - center.z) ** 2 - (b.x - center.x) ** 2 - (b.z - center.z) ** 2,
  );
  for (const other of nearby) {
    if (
      other === center || exclude?.has(other) ||
      !other.active ||
      Math.hypot(other.x - center.x, other.y - center.y, other.z - center.z) > radius
    )
      continue;
    if (!c.visible(center, other, game)) continue;
    visitor(other);
    if (--maximum === 0) break;
  }
}

const NONE = () => {};
function perk(onHit = NONE, onKill = NONE, passive = NONE) {
  return {
    onHit(target, hitInfo, game) {
      onHit(this, target, hitInfo, game);
    },
    onKill(target, hitInfo, game) {
      onKill(this, target, hitInfo, game);
    },
    passive(dt, game) {
      passive(this, dt, game);
    },
  };
}

export const weaponPerks = {
  'paris-tower': perk(),
  'shotgun-pump': perk(),
  'shotgun-forge': perk(NONE,(c,b,h,g)=>{c.fastLoadUntil=g.time+3;}),
  'underground-lab': perk(
    (c, b, h, g) => {
      put(b, 'corrosion', g.time, 6, 5);
    },
    (c, b, h, g) => {
      if (c.roll('sample', 0.01)) drop(b, g, 'sample', '样本管', 1);
    },
    (c, dt, g) => {
      if (c.stage === 'underground-lab' && g.encounter?.active) c.fireRate = 1.15;
    },
  ),
  'shanhai-secret-realm': perk((c, b, h, g) => {
    if (beastStages.has(c.stage)) h.damage *= 1.1;
    if (put(b, 'thunder', g.time, 6, 3, bloodMoon(c, g) ? 2 : 1).stacks < 3) return;
    b.statusEffects.delete('thunder');
    c.visual(b, g, 'arc');
    timedControl(c, b, 'stunned', 1, g);
    h.electric = true;
    h.damage += c.baseDamage * 0.4;
    area(c, b, 5, g, (other) => {
      timedControl(c, other, 'stunned', 1, g);
      g.beasts.damage(other, c.baseDamage * 0.6, g, 'electric');
    });
  }),
  'rain-city': perk((c, b, h, g) => {
    put(b, 'wet', g.time, 5);
    if (c.roll('heavy', 0.05)) {h.heavy=true;push(b, g.player, b.type === 1 ? 4 : 8);}
    if (c.roll('luck', 0.01)) {
      h.damage *= 2;
      drop(b, g, 'ammo', '街头补给', 14);
    }
  }),
  'buried-tomb': perk((c, b, h, g) => {
    slow(b, g.time, 2, 0.7);
    if (c.consecutive >= 4) {
      timedControl(c, b, 'rooted', 1.5, g);
      c.consecutive = 0;
    }
    if (h.headshot && c.roll('eye', 0.01)) {
      h.damage *= 2;
      put(b, 'marked', g.time, 5);
    }
  }),
  'polar-station': perk(
    (c, b, h, g) => {
      if (h.headshot && active(b, 'frozen', g.time)) h.damage *= 1.5;
      if (put(b, 'frost', g.time, 4, 5).stacks === 5) {
        b.statusEffects.delete('frost');
        if(timedControl(c, b, 'frozen', 1.5, g) && b.type===3) put(b,'brittle',g.time,1.5);
      }
    },
    (c, b, h, g) => {
      if (c.stage === 'polar-station' && g.encounter)
        g.encounter.temperature = Math.min(100, g.encounter.temperature + 4);
    },
  ),
  'drowned-city': perk((c, b, h, g) => {
    h.electric=true;
    if (c.roll('tidePush', 0.1)) push(b, g.player, 7);
    area(
      c,
      b,
      6,
      g,
      (other) => {
        c.arc(b, other, g);
        timedControl(c, other, 'stunned', 0.5, g);
        g.beasts.damage(other, c.baseDamage * 0.4, g, 'electric');
      },
      2,
    );
  }),
  'ember-fortress': perk((c, b, h, g) => {
    if (
      active(b, 'burn', g.time) &&
      c.roll('obsidian', 0.03) &&
      timedControl(c, b, 'stone', 2, g) &&
      b.type !== 3
    ) {
      b.statusEffects.get('stone').damageBonus = 0.3;
    }
    put(b, 'burn', g.time, 4);
    c.visual(b, g, 'fire');
  }),
  'derelict-station': perk((c, b, h, g) => {
    if (inVacuum(c, g)) h.damage *= 1.2;
    if (b.clinging) {
      h.damage *= 1.35;
      b.clinging = false;
      put(b, 'grounded', g.time, 1.25);
    }
    if (c.roll('zeroG', 0.08)) {
      push(b, g.player, 8);
      timedControl(c, b, 'hover', 1, g);
    }
  }),
  'neon-undercity': perk((c, b, h, g) => {
    if (machineStages.has(c.stage) && b.empReady <= g.time && timedControl(c, b, 'stopped', 1, g))
      b.empReady = g.time + 8;
    put(b, 'marked', g.time, 5).damageBonus = 0.1;
    if (c.roll('overload', 0.01)) {
      h.damage *= 2;
      c.penetration = true;
    }
  }),
  'jungle-temple': perk(
    (c, b, h, g) => {
      if (c.chargedShot) timedControl(c, b, 'stone', 1.5, g);
      put(b, 'poison', g.time, 4, 3);
      c.charge = Math.min(12, c.charge + 1);
    },
    (c, b, h, g) => {
      c.speedUntil = g.time + 4;
    },
    (c, dt, g) => {
      if (g.time < c.speedUntil) c.moveSpeed = 1.15;
    },
  ),
  'bloodmoon-castle': perk(
    (c, b, h, g) => {
      if (c.stage === 'bloodmoon-castle') {
        h.damage *= 1.15;
        if (c.roll('holy', 0.05)) push(b, g.player, 8);
      }
      h.lifeSteal = bloodMoon(c, g) ? 0.06 : 0.03;
      if (c.roll('sacrifice', 0.01)) {
        h.damage *= 2;
        h.dew = true;
      }
    },
    (c, b, h, g) => {
      if (h?.dew) drop(b, g, 'health', '圣露', 9);
    },
  ),
  'sakura-night-town': perk(
    (c, b, h, g) => {
      if (c.stage === 'sakura-night-town') h.damage *= 1.1;
      if (put(b, 'seal', g.time, 5, 3).stacks === 3) {
        b.statusEffects.delete('seal');
        timedControl(c, b, 'rooted', 1.5, g);
      }
      if (c.roll('bell', 0.05)) {
        g.sound.tone(840, 510, 0.24, 0.16, 'sine');
        const interrupt = (target) => {
          push(target, g.player, 7);
          if (target.type !== 3) {
            target.mode = 'move';
            target.cooldown = Math.max(0.45, target.cooldown);
          }
        };
        area(c, g.player, 6, g, interrupt);
      }
      if (c.roll('blossom', 0.01)) {
        h.damage *= 2;
        c.visual(b, g, 'petal');
        area(c, b, 5, g, (other) => slow(other, g.time, 2, 0.8));
      }
    },
    (c, b, h, g) => {
      if (!g.encounter?.isLantern?.(b)) return;
      drop(b, g, 'ammo', '灯笼回响', 14);
      if (c.roll('lantern', 0.01)) drop(b, g, 'health', '灯火圣露', 9);
    },
  ),
  'brass-factory': perk(
    (c, b, h, g) => {
      put(b, 'scald', g.time, 3);
      if (machineStages.has(c.stage) && put(b, 'gear', g.time, 5, 4).stacks === 4) {
        b.statusEffects.delete('gear');
        timedControl(c, b, 'stopped', 1.5, g);
      }
      if (c.chargedShot) {
        push(b, g.player, 10);
        c.visual(b, g, 'steam');
        area(c, b, 5, g, (other) => g.beasts.damage(other, c.baseDamage * 0.65, g, 'weapon'));
      }
      if (c.roll('piston', 0.01)) h.damage *= 2;
      c.charge = Math.min(15, c.charge + 1);
    },
    (c, b, h, g) => {
      c.fireUntil = g.time + 4;
    },
    (c, dt, g) => {
      if (g.time < c.fireUntil) c.fireRate = 1.15;
    },
  ),
  'haunted-midway': perk((c, b, h, g) => {
    slow(b, g.time, 2, 0.75);
    if (c.consecutive >= 5) {
      timedControl(c, b, 'rooted', 1.5, g);
      c.consecutive = 0;
    }
    if (c.stage === 'haunted-midway' && b.type === 2) h.damage *= 1.3;
    if (c.roll('music', 0.08)) timedControl(c, b, 'confused', 1, g);
    if (c.roll('ticket', 0.01)) {
      h.damage *= 2;
      drop(b, g, 'ammo', '幸运门票', 14);
    }
    if (c.roll('ridePush', g.encounter?.rideActive ? 0.1 : 0.05)) push(b, g.player, 7);
  }),
};

export function resetTargetEffects(target) {
  target.statusEffects ??= new Map();
  target.statusEffects.clear();
  target.controlReady = target.empReady = -Infinity;
  target.reactionReady=-Infinity;
  target.perkPushX = target.perkPushZ = 0;
  target.perkMoveScale = 1;
  target.spawnGeneration = (target.spawnGeneration ?? 0) + 1;
}

export class WeaponCombat {
  constructor(skin, stage, baseDamage, random = Math.random) {
    this.skin = skin;
    this.stage = stage;
    this.baseDamage = baseDamage;
    this.random = random;
    this.hooks = weaponPerks[skin] ?? perk();
    this.reset();
  }
  reset() {
    this.misses = new Map();
    this.charge = this.consecutive = 0;
    this.tracked = null;
    this.chargedShot = this.penetration = false;
    this.samplePending = this.sampleActive = false;
    this.speedUntil = this.fireUntil = -Infinity;
    this.fastLoadUntil = -Infinity;
    this.mistUntil = 0;
    this.fireRate = this.moveSpeed = 1;
  }
  roll(kind, rate) {
    const failures = this.misses.get(kind) ?? 0;
    const hit = this.random() < chanceCoefficient(rate) * (failures + 1);
    this.misses.set(kind, hit ? 0 : failures + 1);
    return hit;
  }
  beginShot() {
    const threshold = this.skin === 'brass-factory' ? 15 : this.skin === 'jungle-temple' ? 12 : Infinity;
    this.chargedShot = this.charge >= threshold;
    if (this.chargedShot) this.charge = 0;
    const penetrate = this.penetration;
    this.penetration = false;
    return penetrate;
  }
  reloaded() {
    this.sampleActive = this.samplePending;
    this.samplePending = false;
  }
  passive(dt, game) {
    this.moveSpeed = this.fireRate = 1;
    this.hooks.passive.call(this, dt, game);
  }
  hearingScale(player) {
    return this.skin === 'buried-tomb' && player.crouched ? 0.6 : 1;
  }
  terrainScale(scale) {
    return this.skin === 'drowned-city' && waterStages.has(this.stage) ? 1 : scale;
  }
  miss() {
    this.consecutive = 0;
  }
  hit(target, info, game) {
    // 武器先于敌人更新。按旧层数结清已到时的伤害，再刷新或叠加效果。
    if (target.statusEffects.size) {
      this.updateTarget(target, game);
      if (!target.active) return;
    }
    const same = this.tracked === target && this.generation === target.spawnGeneration;
    this.consecutive = same ? this.consecutive + 1 : 1;
    this.tracked = target;
    this.generation = target.spawnGeneration;
    if (this.sampleActive) info.damage *= 1.3;
    this.hooks.onHit.call(this, target, info, game);
    const element=info.heavy ? 'heavy' : info.electric ? 'electric' :
      this.skin==='ember-fortress' ? 'fire' : this.skin==='polar-station' ? 'ice' : '';
    if(element) this.react(target,element,game,'weapon');
  }
  element(target,element,game,source='equipment',impact) {
    // 先结清旧层已到期的持续伤害，再读取或消耗状态。
    if(target.statusEffects.size) this.updateTarget(target,game);
    if(target.active) this.react(target,element,game,source,impact);
  }
  react(target,element,game,source,impact) {
    const now=game.time, effects=target.statusEffects;
    const steam=()=>game.encounter?.inSteam?.(target.x,target.z,target.y,game);
    let rule,stacks=1;
    if(element==='fire' && active(target,'poison',now)) {
      rule=reactionCatalog[0];stacks=effects.get('poison').stacks;effects.delete('poison');
    } else if(element==='electric' && (active(target,'wet',now) || steam() ||
      (waterStages.has(this.stage) && game.level?.movementScale?.(target.x,target.z,target.y,game)<.99))) {
      rule=reactionCatalog[1];
    } else if(element==='heavy' && (active(target,'frozen',now) || active(target,'brittle',now))) {
      rule=reactionCatalog[2];effects.delete('frozen');effects.delete('brittle');
    } else if(element==='ice' && (active(target,'scald',now) || steam())) {
      rule=reactionCatalog[3];effects.delete('scald');
    } else return;
    if (target.reactionReady>now && (rule.id==='conduct' || rule.id==='vapor')) return;
    target.reactionReady=now+.5;
    this.visual(target,game,rule.tint);
    const amount=this.baseDamage*rule.scale*stacks;
    if(rule.id==='conduct') {
      const visited=new Set([target]);
      let previous=target;
      for(let hop=0;hop<rule.limit;hop++) {
        let next;
        area(this,previous,rule.radius,game,b=>{next=b;},1,visited);
        if(!next) break;
        this.arc(previous,next,game);visited.add(next);
        game.beasts.damage(next,amount*(next.type===3 ? .6 : 1),game,source);
        previous=next;
      }
    } else if(rule.radius) {
      area(this,target,rule.radius,game,b=>game.beasts.damage(b,amount*(b.type===3 ? .6 : 1),game,source,impact),rule.limit);
      if(rule.id==='vapor' && Math.hypot(game.player.x-target.x,game.player.z-target.z)<3.5) this.mistUntil=now+.65;
    }
    game.beasts.damage(target,amount*(target.type===3 ? .6 : 1),game,source,impact);
    this.announceReaction?.(rule,game);
  }
  onKill(target, hit, game) {
    this.hooks.onKill.call(this, target, hit, game);
  }
  splash(target,damage,game) {
    area(this,target,3.5,game,other=>{
      this.arc(target,other,game);
      game.beasts.damage(other,damage*.45,game,'weapon');
    },3);
  }
  damageScale(target, source, time) {
    const corrosion = active(target, 'corrosion', time);
    // 敌人原有耐久已包含护甲。以原有效伤害为 1，仅计算被削掉的护甲带来的增量。
    const armor = target.type === 1 ? 0.4 : target.type === 3 ? 0.25 : 0;
    const erosion = (armor / (1 - armor)) * 0.05 * (corrosion?.stacks ?? 0);
    const mark = active(target, 'marked', time)?.damageBonus ?? 0;
    const stone = active(target, 'stone', time)?.damageBonus ?? 0;
    const electric = source === 'electric' || source === 'electric-environment';
    const wet = electric && active(target, 'wet', time) ? 0.25 : 0;
    return (1 + erosion) * (1 + mark) * (1 + stone) * (1 + wet);
  }
  updateTarget(b, game) {
    const time = game.time;
    b.perkMoveScale = 1;
    if (!b.statusEffects.size) return false;
    let controlled = false;
    for (const [kind, effect] of b.statusEffects) {
      if (kind === 'burn' || kind === 'poison' || kind === 'scald') {
        const tide =
          this.stage === 'ember-fortress' && ['rise', 'high', 'retreat'].includes(game.encounter?.phase);
        const steam = kind === 'scald' && game.encounter?.inSteam?.(b.x, b.z, b.y, game);
        const perSecond =
          kind === 'burn'
            ? 0.08 * (tide ? 2 : 1)
            : kind === 'poison'
              ? 0.08 * effect.stacks
              : 0.12 * (steam ? 2 : 1);
        while (effect.tickAt <= Math.min(effect.until, time) + 1e-9) {
          effect.tickAt += 0.5;
          game.beasts.damage(b, this.baseDamage * perSecond * 0.5, game, 'weapon');
          if (!b.active) return true;
        }
      }
      if (effect.until <= time) {
        b.statusEffects.delete(kind);
        continue;
      }
      if (controlKinds.has(kind)) controlled = true;
      if (kind === 'slowed' || kind === 'bossSlow') b.perkMoveScale = Math.min(b.perkMoveScale, effect.scale);
      if (kind === 'frost') b.perkMoveScale = Math.min(b.perkMoveScale, 1 - 0.08 * effect.stacks);
    }
    if (controlled) b.perkMoveScale = 0;
    return controlled;
  }
  status(game) {
    const b = this.tracked;
    if (!b?.active || b.spawnGeneration !== this.generation || !b.statusEffects.size) return '';
    const labels = [];
    for (const effect of b.statusEffects.values()) {
      const name = effectTitles[effect.type];
      if (!name || effect.until <= game.time) continue;
      labels.push(
        name + (effect.stacks > 1 ? '×' + effect.stacks : '') + ' ' + Math.ceil(effect.until - game.time) + '秒',
      );
    }
    return labels.slice(-2).join(' / ');
  }
}
