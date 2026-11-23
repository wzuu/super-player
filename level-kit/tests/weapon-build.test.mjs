import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultGear, applyBranches, packKit, chooseBranch, requisition, supplies } from '../src/gear.mjs';
import { shotgunRules, pelletDamage } from '../src/weapon-classes.mjs';
import { stageVoice } from '../src/stage-voice.mjs';
import { makeConfig } from '../src/config.mjs';
import { readFileSync } from 'node:fs';

test('已购改装迁移后两个供弹分支均保留，按枪免费切换且不会重复购买', () => {
  const old = { spent: 730, mods: { magazine: true, reload: true, recovery: true } };
  const g = defaultGear(JSON.parse(JSON.stringify(old)));
  assert.deepEqual(packKit(g, supplies, 'a').mods, { reload: true, recovery: true });
  chooseBranch(g, 'a', 'magazine');
  const copy = defaultGear(JSON.parse(JSON.stringify(g)));
  assert.deepEqual(packKit(copy, supplies, 'a').mods, { magazine: true, recovery: true });
  assert.deepEqual(packKit(copy, supplies, 'b').mods, { reload: true, recovery: true });
  assert.throws(() => requisition(copy, 'magazine', 1000, {}, 'a'), /已安装/);
  assert.equal(g.spent, 730);
});
test('三个分支位互斥，霰弹近远距离、装填与枪管改动使用实际参数', () => {
  const g = defaultGear();
  for (const id of ['pierce', 'split', 'recovery', 'short', 'magazine', 'reload'])
    requisition(g, id, 2000, {}, 's');
  for (const id of ['split', 'short', 'reload']) chooseBranch(g, 's', id);
  const kit = packKit(g, supplies, 's'),
    w = {};
  applyBranches(w, shotgunRules, kit.mods);
  assert.deepEqual(Object.keys(kit.mods), ['split', 'short', 'reload']);
  assert.equal(w.pierce, false);
  assert.equal(w.reloadTime, shotgunRules.reloadTime * 0.78);
  assert.ok(w.range < shotgunRules.range && w.mobility > 1 && w.fireRate > shotgunRules.fireRate);
  assert.ok(pelletDamage(3, w) * w.pellets > 100 && pelletDamage(22, w) * w.pellets < 18);
});
test('所有关卡均有独立环境、危险、解封声音，预警与触发各不相同', () => {
  const levels = JSON.parse(readFileSync(new URL('../../campaign/levels.json', import.meta.url)));
  const scores = new Set();
  for (const { id } of levels) {
    const s = stageVoice(id),
      tracks = [];
    for (const kind of ['ambient', 'warning', 'danger', 'clear']) {
      const voices = [];
      s.play(
        { tone: (...p) => voices.push(['tone', ...p]), hiss: (...p) => voices.push(['noise', ...p]) },
        kind,
      );
      tracks.push(JSON.stringify(voices));
    }
    assert.equal(new Set(tracks).size, 4, id);
    scores.add(tracks.join('/'));
  }
  assert.equal(scores.size, levels.length);
});
test('霰弹每轮近距爆发与持续伤害高于步枪，远距全部命中仍迅速衰减', () => {
  const rifle = makeConfig().weapon;
  function sustained(w, distance) {
    const volley = pelletDamage(distance, w) * (w.pellets ?? 1);
    const cycle = w.magazine / w.fireRate + w.reloadTime * (w.pellets ? w.magazine : 1);
    return (w.magazine * volley) / cycle;
  }
  assert.ok(sustained(shotgunRules, 3) > 1.08 * sustained(rifle, 3));
  assert.ok(sustained(shotgunRules, 21) < 0.15 * sustained(rifle, 21));
});
