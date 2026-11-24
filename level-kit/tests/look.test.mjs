import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotateLook, StickLook } from '../src/look.mjs';

test('isolated pointer discontinuity preserves pitch and horizontal tracking', () => {
  const rotation = { x: -Math.PI / 2 + 0.04, y: 0 };
  const original = rotation.x;
  rotateLook(rotation, 20, -1800, 1);
  assert.equal(rotation.x, original);
  assert.equal(rotation.y, -0.04);
  rotateLook(rotation, 0, -750, 3);
  assert.equal(rotation.x, original);
  for (let i = 0; i < 8; i++) rotateLook(rotation, 240, -240, 1);
  assert.ok(rotation.y < -Math.PI);
  assert.equal(rotation.x, -original);
});

test('right stick rejects resting jitter, starts continuously, and stops on return', () => {
  const stick = new StickLook();
  const turn = (x, y = 0) => {
    const rotation = {x: 0, y: 0};
    stick.turn(rotation, x, y, 1/60, 1);
    return rotation;
  };
  const zero = {x: 0, y: 0};
  assert.deepEqual(turn(.151, -.151), zero);
  assert.deepEqual(turn(.24), zero);
  assert.ok(Math.abs(turn(.240001).y) < 1e-7);
  const fine = turn(.25).y;
  assert.ok(fine < 0 && Math.abs(fine) < .001);
  const full = turn(1).y;
  assert.ok(Math.abs(full + .002 * 850 / 60) < 1e-12);
  const returning = turn(.23).y;
  assert.ok(full < returning && returning < 0);
  assert.deepEqual(turn(.151, .151), zero);
  assert.deepEqual(turn(.23), zero);
  const diagonal = turn(1, 1);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) + full) < 1e-12);
  assert.equal(diagonal.x, diagonal.y);
  stick.reset();
  assert.deepEqual(turn(.23), zero);
  assert.deepEqual(turn(NaN, 1), zero);
});
