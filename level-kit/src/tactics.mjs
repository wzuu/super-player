// 只调整已发现玩家、处于移动状态的敌人。绕障、场景脚本和寻声状态继续优先。
const tactics = {
  'underground-lab': (b, g, d) => (b.type === 0 && g.encounter?.active && d > 3 ? b.lane * 0.7 : 0),
  'shanhai-secret-realm': (b, g, d) => (b.type === 0 && d < 9 ? Math.sin(g.time * 2 + b.id) * 0.75 : 0),
  'rain-city': (b, g, d) => (b.type === 2 && g.time - g.shotAt < 0.7 && d < 15 ? b.lane * 1.35 : 0),
  'buried-tomb': (b, g, d) => (b.type === 1 && !g.encounter?.hearingOnly && d > 4 ? b.lane * 0.45 : 0),
  'polar-station': (b, g, d) => (b.type === 2 && d < 5 ? Math.PI : 0),
  'drowned-city': (b, g, d) => (b.type === 0 && g.player.y > b.y + 1 && d > 3 ? b.lane * 0.95 : 0),
  'ember-fortress': (b, g, d) => (b.type === 1 && g.encounter?.phase === 'high' && d > 3 ? -b.lane * 0.7 : 0),
  'derelict-station': (b, g, d) => (b.type === 0 && g.player.grounded === false && d < 10 ? b.lane * 1.2 : 0),
  'neon-undercity': (b, g, d) => (b.type === 2 && d > 6 && g.weapon.reloadLeft > 0 ? -b.lane * 0.8 : 0),
  'jungle-temple': (b, g, d) =>
    b.type === 0 && g.encounter?.phase === 'rain' && d > 2 ? Math.sin(g.time * 3 + b.id) * 0.95 : 0,
  'bloodmoon-castle': (b, g, d) => (b.type === 0 && b.hp < 32 && d < 4 ? Math.PI : 0),
  'sakura-night-town': (b, g, d) => (b.type === 1 && d > 5 ? Math.sin(g.time + b.id) * 0.55 : 0),
  'brass-factory': (b, g, d) => (b.type === 2 && g.encounter?.inSteam?.(b.x, b.z, b.y, g) ? b.lane * 1.4 : 0),
  'haunted-midway': (b, g, d) =>
    b.type === 0 && d > 2 && d < 6 ? b.lane * (g.time % 3 < 1 ? 1.35 : 0.15) : 0,
};
export const stageTactic = (stage) => tactics[stage];
