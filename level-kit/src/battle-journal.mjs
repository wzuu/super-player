// 路线采样仅在出发时开启录制后分配。普通战报只保存一次性任务节点。
export class BattleJournal {
  start(game, prefs, packed) {
    this.loadout = structuredClone(packed ?? {});
    this.difficulty = prefs.difficulty;
    this.events = [];
    this.lastCompleted = null;
    this.seen = new Set();
    this.samples = prefs.recordReplay ? [] : null;
    this.interval = .5;
    this.nextSample = 0;
    this.mark(game, '出发');
    this.sample(game);
  }
  mark(game, label) {
    if (this.seen.has(label) || this.events.length >= 64) return;
    this.seen.add(label);
    this.events.push({ time: Math.round(game.time * 1000), label });
  }
  complete(game,label) {
    if(!label) return;
    this.lastCompleted=label;
    this.mark(game,'完成 · '+label);
  }
  sample(game, force = false) {
    if (!this.samples || !force && game.time < this.nextSample) return;
    const {x, y, z, look, hp} = game.player;
    const t = Math.round(game.time * 1000);
    const round = n => Math.round(n * 100) / 100;
    const value = [t, round(x), round(y), round(z), round(look.rotation.y), round(hp)];
    if (this.samples.at(-1)?.[0] === t) this.samples.pop();
    this.samples.push(value);
    if (this.samples.length > 2048) {
      this.samples = this.samples.filter((_, index) => index % 2 === 0);
      this.interval *= 2;
    }
    this.nextSample = game.time + this.interval;
  }
  update(g) {
    if (g.bossDead) this.mark(g, '击败首领');
    if (g.core) this.mark(g, '取得关键物');
    if (g.ready() && g.nearGate()) this.mark(g, '抵达撤离区');
    if (g.blast) this.mark(g, '启动撤离装置');
    this.sample(g);
  }
  finish(g, won, reason) {
    this.update(g);
    const lastStage = this.lastCompleted ?? this.events.at(-1)?.label;
    const end = reason || (won ? '成功撤离' : g.player.hp <= 0 ? '阵亡' : '行动失败');
    this.mark(g, end);
    this.sample(g, true);
    return {
      report: {
        mode: g.objective.mode, difficulty: this.difficulty, weapon: g.weapon.skinId,
        loadout: this.loadout, reason: end, lastStage, events: this.events,
        pickedCount: g.loot.length, pickedValue: g.value, variation: g.variation?.name ?? null,
        vaultValue: won ? g.loot.filter(item=>item.origin==='vault').reduce((sum,item)=>sum+item.value,0) : 0,
        mainValue: won ? g.loot.filter(item=>!item.origin||item.origin==='main').reduce((sum,item)=>sum+item.value,0) : 0,
        scores: g.objective.result?.(g) ?? {}, ...g.performance?.result?.(g, won),
      },
      replay: this.samples ? {samples: this.samples, events: this.events} : null,
    };
  }
}
