// 霰弹的总伤害集中在近处，远处即便全部命中也只有很小的伤害。
export const shotgunRules = {
  pellets: 8, damage: 25, falloffStart: 5, falloffEnd: 18, minimumDamage: .08,
  range: 27, fireRate: 2.15, magazine: 6, reserve: 48, maxReserve: 96, reloadTime: .40,
  baseSpread: .066, maxSpread: .10, recoil: .033, heatPerShot: .22, heatRecovery: .88,
};
export function pelletDamage(distance, weapon) {
  if (!weapon.pellets) return weapon.damage;
  const fraction=Math.max(0,Math.min(1,(distance-weapon.falloffStart)/(weapon.falloffEnd-weapon.falloffStart)));
  return weapon.damage*(1-(1-weapon.minimumDamage)*fraction);
}
