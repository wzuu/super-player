// 每次出发独立计数。战报快照只含可序列化的实际观测值。
const weights = {
  classic: [32, 18, 16],
  hold: [18, 32, 14],
  escort: [18, 30, 16],
  timed: [14, 16, 34],
  hunt: [16, 23, 25],
  rescue: [18, 32, 14],
};
const thresholds = [
  ['S', 88],
  ['A', 70],
  ['B', 46],
  ['C', 0],
];
const unit = (value) => Math.max(0, Math.min(1, value));

export function battleGrade(game, won, stats) {
  const mode = game.objective.mode;
  const goal = Math.max(1, game.stageKillTarget ?? 150);
  let score;
  if (mode === 'endless') {
    const waves = 1 + Math.floor(game.time / 45);
    score =
      40 * unit(waves / 8) +
      30 * unit(game.time / 360) +
      20 * unit(game.kills / goal) +
      10 * unit(stats.maxCombo / 15);
  } else {
    const [kills, safety, pace] = weights[mode] ?? weights.classic;
    const bonusLoot = won && game.loot.some((item) => ['vault', 'legendary'].includes(item.origin));
    const scores = game.objective.result?.(game) ?? {};
    const progress =
      mode === 'hold'
        ? unit((scores.holdSeconds ?? 0) / 45)
        : mode === 'rescue'
          ? unit((scores.holdSeconds ?? 0) / 90)
          : mode === 'escort'
            ? unit((scores.escortHealth ?? 0) / 100) * (scores.escorted ? 1 : 0.5)
            : mode === 'timed'
              ? unit((scores.escapeSeconds ?? 0) / 90)
              : mode === 'hunt'
                ? Number(Boolean(scores.huntWon))
                : Number(won);
    score =
      (won ? 16 : 0) +
      8 * progress +
      kills * unit(game.kills / goal) +
      safety * unit(1 - stats.hurtCount / 24) +
      pace * unit(1 - game.time / 900) +
      12 * unit(stats.maxCombo / 12) +
      (bonusLoot ? 5 : 0);
    if (!won) score = Math.min(60, score * unit(game.time / 90));
  }
  return thresholds.find(([, minimum]) => score >= minimum)[0];
}

export class BattlePerformance {
  constructor() {
    this.reset();
  }
  reset() {
    Object.assign(this, {
      shots: 0,
      hits: 0,
      damageTaken: 0,
      hurtCount: 0,
      combo: 0,
      maxCombo: 0,
      weaponKills: 0,
      equipmentKills: 0,
      environmentKills: 0,
      eliteKills: 0,
      expires: -Infinity,
      notice: '',
      noticeUntil: 0,
    });
  }
  shot(hit) {
    this.shots++;
    if (hit) this.hits++;
  }
  step(time) {
    if (time > this.expires) this.combo = 0;
  }
  hurt(damage) {
    this.damageTaken += damage;
    this.hurtCount++;
    this.combo = 0;
    this.notice = '';
  }
  kill(game, beast, source, hit) {
    const weapon = source === 'weapon' || source === 'electric';
    if (weapon) this.weaponKills++;
    else if (source === 'equipment') this.equipmentKills++;
    else this.environmentKills++;
    if (beast.affixes?.length) this.eliteKills++;
    if (game.time > this.expires) this.combo = 0;
    this.combo++;
    this.maxCombo = Math.max(this.combo, this.maxCombo);
    this.expires = game.time + 2.2 + Math.min(1.3, this.combo * 0.09);
    if (this.combo < 5 || (this.combo > 5 && this.combo % 5)) return;
    const kind = hit?.headshot ? '爆头' : weapon ? '火力' : source === 'equipment' ? '装备' : '环境';
    this.notice = this.combo + ' 连杀 · ' + kind;
    this.noticeUntil = game.time + 1.4;
    if (!game.encounter?.hudOffline && this.combo >= 10) game.sound.tone(420, 780, 0.13, 0.14, 'sine');
  }
  result(game, won) {
    const {
      shots,
      hits,
      damageTaken,
      hurtCount,
      maxCombo,
      weaponKills,
      equipmentKills,
      environmentKills,
      eliteKills,
    } = this;
    return {
      shots,
      hits,
      damageTaken: Math.round(damageTaken),
      hurtCount,
      maxCombo,
      weaponKills,
      equipmentKills,
      environmentKills,
      eliteKills,
      grade: battleGrade(game, won, this),
    };
  }
}
