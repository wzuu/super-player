import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleJournal } from '../src/battle-journal.mjs';
import { summarize } from '../../campaign/reports.mjs';

test('战报保存实际完成的关卡阶段，关闭录制不创建回放', () => {
  const journal = new BattleJournal();
  const g = {
    time: 0,
    player: { x: 0, y: 0, z: 0, hp: 100, look: { rotation: { y: 0 } } },
    objective: { mode: 'classic' },
    ready: () => false,
    nearGate: () => false,
    weapon: { skinId: 'rain-city' },
    loot: [],
    value: 0,
  };
  journal.start(g, { recordReplay: false, difficulty: 'standard' }, { mods: { pierce: true } });
  g.time = 12;
  journal.complete(g, '解除东区门禁');
  g.time = 13;
  g.player.hp = 0;
  const snapshot = journal.finish(g, false);
  assert.equal(snapshot.replay, null);
  assert.equal(snapshot.report.lastStage, '解除东区门禁');
  assert.equal(snapshot.report.reason, '阵亡');
  assert.equal(snapshot.report.events[1].time, 12000);
});
test('两种存档模式成绩的布尔值与计分保留各自语义', () => {
  const rows = [
    { kills: 4, won: true, mode: 'escort', scores: { escorted: true, escortHealth: 68 } },
    { kills: 12, won: false, mode: 'escort', scores: { escorted: false, escortHealth: 0 } },
  ];
  assert.deepEqual(summarize(rows).modesPlayed.get('escort').best, { escorted: true, escortHealth: 68 });
});
test('猎杀和深入用时取成功局的最快值，保留失败尝试', () => {
  const make = (won, deep, seconds) => ({
    kills: 1,
    won,
    mode: 'hunt',
    scores: { deepCompleted: deep, deepSeconds: seconds, huntWon: won, huntSeconds: seconds + 8 },
  });
  const { modesPlayed } = summarize([make(false, false, 1), make(true, true, 26), make(true, true, 14)]);
  assert.deepEqual(modesPlayed.get('hunt'), {
    count: 3,
    wins: 2,
    best: { deepCompleted: true, deepSeconds: 14, huntWon: true, huntSeconds: 22 },
  });
});
