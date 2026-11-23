import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createGrid, createWorld } from '../src/world.mjs';
import { makeConfig } from '../src/config.mjs';

// 使用与浏览器 importmap 相同的公共模块别名。
registerHooks({ resolve(id, context, next) {
  return next(id.startsWith('@level-kit/') ? new URL('../src/' + id.slice(11), import.meta.url).href : id, context);
} });
const { createBeastClasses } = await import('../src/beasts.mjs');

class Vector {
  set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  divideScalar(n) { return this.set(this.x / n, this.y / n, this.z / n); }
}
const CONFIG = makeConfig({ map: { cell: 2, navCell: 2 } });
const GRID = createGrid(Array(7).fill('.......'), 2);
const { Level, Navigation } = createWorld({ CONFIG, GRID, V3: Vector, definition: {},
  clamp: (v, min, max) => Math.min(max, Math.max(min, v)) });

test('贴墙滑动时阻挡法向移动，开放墙体后可通过', () => {
  const level = new Level();
  const wall = level.box(0, 0, 1, 4, 0, 3);
  const p = { x: -1, y: 0, z: 0, radius: .3, height: 1.7 };
  level.move(p, 1, .5, .2);
  assert.deepEqual([p.x, p.z], [-1, .5]);
  wall.active = false;
  level.move(p, 1, 0, .2);
  assert.equal(p.x, 0);
});

test('寻路绕过实体墙并到达目标格', () => {
  const level = new Level();
  level.box(0, 0, 1, 5, 0, 3);
  const nav = new Navigation(level);
  nav.rebuild(4, 0);
  let i = nav.index(-4, 0);
  const target = nav.index(4, 0);
  assert.ok(nav.dist[i] > 4);
  while (i !== target) {
    const next = nav.next(nav.x(i), nav.z(i));
    assert.equal(nav.dist[next], nav.dist[i] - 1);
    assert.ok(nav.walkable[next]);
    i = next;
  }
});

test('近战敌人被掩体遮挡时巡逻，获得视线后进入攻击前摇', () => {
  const level = new Level();
  const wall = level.box(0, .6, 2, .2, 0, 3);
  const { BeastAI } = createBeastClasses({ CONFIG, V3: Vector, colors: {}, definition: {} });
  const ai = new BeastAI(level, null, null);
  const b = { type: 0, x: 0, y: 0, z: 0, fx: 0, fz: 1, patrol: 1, alert: 0,
    mode: 'move', cooldown: 0 };
  const p = { x: 0, y: 0, z: 1, protected: () => false };
  const game = { time: 1, shotAt: -Infinity };
  ai.perceive(b, p, game);
  assert.equal(b.alert, 0);
  assert.equal(b.mode, 'move');
  wall.active = false;
  ai.perceive(b, p, game);
  assert.equal(b.alert, CONFIG.beasts.memory);
  assert.equal(b.mode, 'windup');
});
