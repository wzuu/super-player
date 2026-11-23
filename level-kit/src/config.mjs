const DEFAULT_CONFIG = {
  audio: { ambient: null },
  map: { cell: 4, fog: 0.021, hash: 4, navCell: 1.25 },
  graphics: { maxPixelRatio: 1.25, bloomScale: 0.72 },
  player: {
    eye: 1.7, height: 1.77, radius: 0.33, health: 100, walk: 5.25, backward: 0.81,
    sprint: 8.1, stamina: 100, sprintUse: 24, staminaRegen: 17, sprintResume: 19,
    jump: 5.75, gravity: 16.5, step: 0.46, healDelay: 5, healRate: 4.5, safeTime: 9, safeRadius: 6,
    hurtCooldown: 0.24, mouseSpeed: 0.86, crouch: null,
  },
  weapon: {
    fireRate: 10, magazine: 60, reserve: 300, maxReserve: 540, reloadTime: 1.8,
    damage: 24, range: 92, baseSpread: 0.0045, maxSpread: 0.033, recoil: 0.012,
    heatPerShot: 0.061, heatRecovery: 1.1, hitStop: 0.03, hearingRadius: 32,
  },
  beasts: {
    population: 64, capacity: 96, killsToWin: 150, spawnEvery: 0.50, spawnBurst: 2,
    spawnDistance: 21, farDistance: 30, farUpdateFrames: 6, sight: 25, sightDot: 0.18,
    memory: 7, separation: 1.35,
    types: [
      { hp: 62, speed: 7.29, radius: 0.39, height: 1.11, damage: 8, reach: 1.08, recovery: 0.92 },
      { hp: 150, speed: 3.75, radius: 0.58, height: 2.08, damage: 17, reach: 1.45, recovery: 1.55, windup: 0.70, chargeSpeed: 13.8, chargeTime: 0.73 },
      { hp: 95, speed: 4.6, radius: 0.49, height: 1.75, damage: 11, reach: 19, recovery: 2.15, projectileSpeed: 13.4, hazardLife: 0 },
      { hp: 760, speed: 3.4, rageSpeed: 5.3, radius: 0.93, height: 3.92, damage: 24, reach: 2.25, recovery: 1.25, windup: 0.65, summonCount: 6 },
    ],
  },
  pickups: { pool: 220, grab: 1.18, ammoDrop: 14, ammoCache: 65 },
  effects: { particles: 680, tracers: 32, projectiles: 40, pools: 32, gateDuration: 2.25 },
};

const CAMPAIGN_DIFFICULTY = {
  firstPopulation: 56,
  populationStep: 2,
  reserveCapacity: 32,
  firstSpeedScale: 0.5,
  speedStepFromBase: 0.05,
};

function merge(base, patch) {
  if (patch === undefined) return structuredClone(base);
  if (Array.isArray(base) && Array.isArray(patch)) {
    return Array.from({ length: Math.max(base.length, patch.length) }, (_, i) => merge(base[i], patch[i]));
  }
  if (base && typeof base === 'object' && patch && typeof patch === 'object') {
    return Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(patch)])]
      .map(key => [key, merge(base[key], patch[key])]));
  }
  return structuredClone(patch);
}

// 每个关卡得到独立配置，避免场景间共享数组或对象。
export function makeConfig(overrides = {}, campaignStage = 0) {
  const config = merge(DEFAULT_CONFIG, overrides);
  if (campaignStage > 0) {
    const rules = CAMPAIGN_DIFFICULTY;
    const steps = campaignStage - 1;
    const beasts = config.beasts;
    beasts.population = rules.firstPopulation + steps * rules.populationStep;
    beasts.capacity = Math.max(beasts.capacity, beasts.population + rules.reserveCapacity);

    // 关卡只填写原速。追击、冲撞和狂暴统一缩放，弹丸和事件倍率沿用各自配置。
    const speedScale = Math.min(1, rules.firstSpeedScale * (1 + steps * rules.speedStepFromBase));
    for (const type of beasts.types) {
      for (const key of ['speed', 'chargeSpeed', 'rageSpeed']) {
        if (type[key] !== undefined) type[key] *= speedScale;
      }
    }
  }
  for (const [name, value, min] of [
    ['map.cell', config.map.cell, 0.1],
    ['map.hash', config.map.hash, 0.1],
    ['map.navCell', config.map.navCell, 0.1],
    ['weapon.fireRate', config.weapon.fireRate, 0.1],
    ['weapon.reloadTime', config.weapon.reloadTime, 0.01],
    ['weapon.magazine', config.weapon.magazine, 1],
    ['beasts.population', config.beasts.population, 1],
    ['beasts.capacity', config.beasts.capacity, config.beasts.population],
    ['beasts.killsToWin', config.beasts.killsToWin, 1],
    ['beasts.farUpdateFrames', config.beasts.farUpdateFrames, 1],
    ['effects.particles', config.effects.particles, 1],
    ['effects.tracers', config.effects.tracers, 1],
    ['effects.projectiles', config.effects.projectiles, 1],
    ['effects.pools', config.effects.pools, 1],
    ['pickups.pool', config.pickups.pool, 1],
  ]) {
    if (!Number.isFinite(value) || value < min) throw new RangeError(name + ' 必须大于或等于 ' + min);
  }
  if (config.beasts.types.length !== 4) throw new RangeError('关卡需要定义四类凶兽参数');
  return config;
}
