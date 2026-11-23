export const supplies = {
  roll: { name: '翻滚', skill: true, cooldown: 6, stage: 0, detail: '向前翻滚 5 米，短暂无敌' },
  pulse: { name: '冲击波', skill: true, cooldown: 15, stage: 2, detail: '推开附近目标，首领位移减半' },
  slow: { name: '减速力场', skill: true, cooldown: 18, stage: 4, detail: '附近目标短暂减速' },
  decoy: { name: '诱饵', skill: true, cooldown: 18, stage: 6, detail: '干扰附近目标的攻击方向' },
  shield: { name: '护盾', skill: true, cooldown: 22, stage: 10, detail: '短时间抵挡伤害' },
  grenade: { name: '手雷', price: 60, limit: 3, stage: 0, detail: '对前方区域造成范围伤害' },
  medkit: { name: '急救包', price: 40, limit: 2, stage: 0, detail: '治疗 30%，使用期间受伤会中断' },
  ammo: { name: '弹药包', price: 35, limit: 2, stage: 0, detail: '补充两个弹匣的备弹' },
  mine: { name: '地雷', price: 90, limit: 2, stage: 8, detail: '放置后由靠近的凶兽触发' },
};
export const modifications = {
  magazine: { name: '扩容弹匣', price: 240, detail: '弹匣容量 +6' },
  reload: { name: '快换组件', price: 260, detail: '换弹时间 −8%' },
  recovery: { name: '稳定组件', price: 230, detail: '散布恢复 +10%' },
};
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
  return { spent: 0, stock: {}, mods: {}, skills: ['roll', null], items: ['medkit', 'grenade'], ...state };
}
export function isUnlocked(item, levels, cleared) {
  return item.stage === 0 || cleared.includes(levels[item.stage - 1]?.id);
}
export function requisition(state, id, earned, items) {
  const item = items[id] ?? modifications[id];
  if (!item?.price) throw Error('请选择可兑换的物品');
  if (modifications[id] && state.mods[id]) throw Error('已安装此组件');
  if (earned - state.spent < item.price) throw Error('军需点不足');
  state.spent += item.price;
  if (modifications[id]) state.mods[id] = true;
  else state.stock[id] = (state.stock[id] ?? 0) + 1;
}
export function packKit(state, items) {
  const counts = {};
  for (const id of state.items.filter(Boolean)) {
    const free = Number(id === 'medkit' || id === 'grenade');
    const fromStock = Math.min(state.stock[id] ?? 0, items[id].limit - free);
    state.stock[id] = (state.stock[id] ?? 0) - fromStock;
    counts[id] = fromStock + free;
  }
  return { skills: [...state.skills], items: [...state.items], counts, mods: { ...state.mods } };
}
export async function updateGear(store, mutate) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const snapshot = await store.gear();
    const state = defaultGear(snapshot.state);
    const value = mutate(state, snapshot);
    if ((await store.writeGear({ revision: snapshot.revision, state })).saved) return value;
  }
  throw Error('存档正在其他窗口使用，请重试');
}
