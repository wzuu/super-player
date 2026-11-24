export const supplies = {
  roll: { name: '翻滚', skill: true, cooldown: 6, stage: 0, detail: '向前翻滚 5 米，短暂无敌' },
  pulse: { name: '冲击波', skill: true, cooldown: 15, stage: 2, detail: '推开附近目标，首领位移减半' },
  slow: { name: '减速力场', skill: true, cooldown: 18, stage: 4, detail: '附近目标短暂减速' },
  decoy: { name: '诱饵', skill: true, cooldown: 18, stage: 6, detail: '干扰附近目标的攻击方向' },
  shield: { name: '护盾', skill: true, cooldown: 22, stage: 10, detail: '短时间抵挡伤害' },
  grenade: { name: '手雷', price: 60, limit: 3, stage: 0, detail: '朝瞄准方向投出，延时爆炸，对无遮挡的凶兽造成范围伤害' },
  medkit: { name: '急救包', price: 40, limit: 2, stage: 0, detail: '治疗 30%，使用期间受伤会中断' },
  ammo: { name: '弹药包', price: 35, limit: 2, stage: 0, detail: '补充两个弹匣的备弹' },
  mine: { name: '地雷', price: 90, limit: 2, stage: 8, detail: '放置后由靠近的凶兽触发' },
};
export const modifications = {
  pierce: {slot:'弹药',name:'穿透弹',price:250,detail:'每枚弹丸可再命中后方一个目标，适合走廊，无溅射'},
  split: {slot:'弹药',name:'分裂弹',price:250,detail:'每次开火首次命中向周围最多三敌溅射，适合密集敌群，覆盖武器自带穿透'},
  recovery: {slot:'枪管',name:'长枪管',price:230,detail:'射程 +25%，散布 −22%，射速 −12%，适合远距'},
  short: {slot:'枪管',name:'短枪管',price:230,detail:'射速 +12%，移动 +6%，射程 −25%，适合突围'},
  magazine: {slot:'供弹',name:'扩容弹匣',price:240,detail:'弹匣增加 25%，装填慢 16%，适合持续射击'},
  reload: {slot:'供弹',name:'快换弹匣',price:260,detail:'装填时间 −22%，弹容不变，适合短促交火'},
};
export function selectedBranches(state,weapon) {
  return {...state.builds?.['*'],...state.builds?.[weapon]};
}
export function chooseBranch(state,weapon,id) {
  const branch=modifications[id];
  if (!branch || !state.mods[id]) throw Error('请先兑换此分支');
  state.builds[weapon]={...state.builds[weapon],[branch.slot]:id};
}
export function applyBranches(weapon,base,mods) {
  Object.assign(weapon,base);
  weapon.pierce=Boolean(mods.pierce); weapon.split=Boolean(mods.split);
  weapon.magazine = mods.magazine ? Math.ceil(base.magazine*1.25) : base.magazine;
  weapon.reloadTime = base.reloadTime * (mods.magazine ? 1.16 : mods.reload ? .78 : 1);
  weapon.range = base.range * (mods.recovery ? 1.25 : mods.short ? .75 : 1);
  weapon.baseSpread = base.baseSpread * (mods.recovery ? .78 : 1);
  weapon.maxSpread = base.maxSpread * (mods.recovery ? .78 : 1);
  weapon.fireRate = base.fireRate * (mods.recovery ? .88 : mods.short ? 1.12 : 1);
  weapon.mobility=mods.short?1.06:1;
}
export function catalog(levels) {
  const items = { ...supplies };
  levels.forEach((level, i) => {
    items['cache-' + level.id] = {
      name: level.title + '战备箱',
      stage: i + 1,
      price: 65,
      limit: 2,
      detail: '恢复少量生命与备弹',
    };
  });
  return items;
}
export function defaultGear(state = {}) {
  const gear={ spent: 0, stock: {}, mods: {}, skills: ['roll', null], items: ['medkit', 'grenade'], ...state };
  if (!gear.builds) {
    const inherited={};
    for (const id of ['magazine','reload','recovery']) if (gear.mods[id]) inherited[modifications[id].slot]=id;
    gear.builds={'*':inherited};
  }
  return gear;
}
export function isUnlocked(item, levels, cleared) {
  return item.stage === 0 || cleared.includes(levels[item.stage - 1]?.id);
}
export function requisition(state, id, earned, items, weapon='*') {
  const item = items[id] ?? modifications[id];
  if (!item?.price) throw Error('请选择可兑换的物品');
  if (modifications[id] && state.mods[id]) throw Error('已安装此组件');
  if (earned - state.spent < item.price) throw Error('军需点不足');
  state.spent += item.price;
  if (modifications[id]) {
    state.mods[id] = true;
    if (!selectedBranches(state,weapon)[modifications[id].slot]) chooseBranch(state,weapon,id);
  }
  else state.stock[id] = (state.stock[id] ?? 0) + 1;
}
export function packKit(state, items, weapon='*') {
  const counts = {};
  for (const id of state.items.filter(Boolean)) {
    const free = Number(id === 'medkit' || id === 'grenade');
    const fromStock = Math.min(state.stock[id] ?? 0, items[id].limit - free);
    state.stock[id] = (state.stock[id] ?? 0) - fromStock;
    counts[id] = fromStock + free;
  }
  const build=selectedBranches(state,weapon);
  return { skills: [...state.skills], items: [...state.items], counts, build,
    mods:Object.fromEntries(Object.values(build).filter(id=>state.mods[id] && modifications[id]).map(id=>[id,true])) };
}
export async function updateGear(store, mutate, purchase) {
  for (let attempt = 0; attempt < 8; attempt++) {
    // 回执丢失时原样重发同一修订。后端先认收据，再检查版本和余额。
    if (purchase?.request) {
      if ((await store.writeGear(purchase.request)).saved) return purchase.value;
      purchase.request = null;
    }
    const snapshot = await store.gear();
    const state = defaultGear(snapshot.state);
    const value = mutate(state, snapshot);
    const request = { revision: snapshot.revision, state };
    if (purchase) {
      request.purchaseId = purchase.token;
      purchase.request = request;
      purchase.value = value;
    }
    if ((await store.writeGear(request)).saved) return value;
    if (purchase) purchase.request = null;
  }
  throw Error('存档正在其他窗口使用，请重试');
}
