import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, defaultGear, isUnlocked, packKit, requisition } from '../src/gear.mjs';
import { qualityMonitor } from '../src/quality.mjs';

test('库存、免费配给、携带上限和一次性改装共享军需点', () => {
  const levels = Array.from({ length: 14 }, (_, i) => ({ id: String(i + 1), title: '关卡' + (i + 1) }));
  const items = catalog(levels),
    state = defaultGear();
  assert.equal(isUnlocked(items.pulse, levels, ['1']), false);
  assert.equal(isUnlocked(items.pulse, levels, ['2']), true);
  for (let i = 0; i < 3; i++) requisition(state, 'grenade', 500, items);
  requisition(state, 'magazine', 500, items);
  assert.throws(() => requisition(state, 'magazine', 500, items), /已安装/);
  assert.throws(() => requisition(state, 'reload', 500, items), /不足/);
  const kit = packKit(state, items);
  assert.deepEqual(kit.counts, { medkit: 1, grenade: 3 });
  assert.equal(state.stock.grenade, 1);
  assert.equal(state.spent, 420);
  assert.ok(kit.mods.magazine);
  assert.equal(Object.keys(items).filter((k) => k.startsWith('cache-')).length, 14);
});
test('持续低帧率逐档降级，稳定恢复后回升，手动档位固定', () => {
  const levels = [],
    sample = qualityMonitor('auto', (tier) => levels.push(tier));
  sample(0.2);
  sample(0.016);
  assert.deepEqual(levels, ['high']);
  for (let i = 0; i < 220; i++) sample(1 / 30);
  assert.deepEqual(levels, ['high', 'medium', 'low']);
  for (let i = 0; i < 1600; i++) sample(1 / 60);
  assert.deepEqual(levels, ['high', 'medium', 'low', 'medium', 'high']);
  const manual = [],
    locked = qualityMonitor('medium', (v) => manual.push(v));
  for (let i = 0; i < 100; i++) locked(0.2);
  assert.deepEqual(manual, ['medium']);
});

test('限时撤离从拿到核心才开始倒计时，坚守计时只在撤离区累计', async () => {
  const { createObjective } = await import('../src/objectives.mjs');
  class Mesh {
    position = { set() {} };
  }
  const THREE = { Mesh, OctahedronGeometry: class {}, MeshBasicMaterial: class {} };
  const objective = createObjective(9, { THREE, scene: { add() {} } }, { beasts: { killsToWin: 150 } });
  const game = {
    player: {},
    level: { spawn: { x: 0, y: 0, z: 0 } },
    time: 100,
    bossDead: true,
    core: false,
    finish(won) {
      this.outcome = won;
    },
  };
  objective.reset('timed', game);
  objective.step(100, game);
  assert.equal(game.outcome, undefined);
  game.core = true;
  objective.step(0.1, game);
  game.time += 89;
  objective.step(0.1, game);
  assert.match(objective.label(game), /1 秒/);
  game.time++;
  objective.step(0.1, game);
  assert.equal(game.outcome, false);
  objective.reset('hold', game);
  game.nearGate = () => false;
  objective.step(60, game);
  assert.equal(objective.ready(game), false);
  game.nearGate = () => true;
  objective.step(44, game);
  assert.equal(objective.ready(game), false);
  objective.step(1, game);
  assert.equal(objective.ready(game), true);
});
