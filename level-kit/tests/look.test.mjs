import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotateLook } from '../src/look.mjs';

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
