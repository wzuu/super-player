import assert from 'node:assert/strict';
import test from 'node:test';
import { makeConfig } from '../src/config.mjs';
import { createSoundClass } from '../src/audio.mjs';

const CONFIG = makeConfig();
const Sound = createSoundClass({ CONFIG });

test('四种受击音型不同，危险血量在 EMP 期间仍有双心跳和环境低通', () => {
  const sound = new Sound(), tones = [], cutoffs = [];
  sound.ctx = {currentTime: 1};
  sound.ambientFilter = {frequency: {setTargetAtTime: value => cutoffs.push(value)}};
  sound.tone = (...args) => tones.push(args);
  for (let type = 0; type < 4; type++) sound.hurt(type);
  assert.equal(new Set(tones.map(t => t.join('/'))).size, 4);
  tones.length = 0;
  const g = {phase: 'play', player: {hp: 29}, encounter: {beastsDisabled: true}};
  sound.updateThreats(g);
  sound.updateThreats(g);
  assert.deepEqual(cutoffs, [680]);
  assert.deepEqual(tones.map(t => t[5]), [0, .16]);
  g.player.hp = 30;
  sound.updateThreats(g);
  assert.deepEqual(cutoffs, [680, 20000]);
});

test('玩家转身后空间声源左右互换，短音结束时断开 PannerNode', () => {
  const sound = new Sound(), positions = [];
  let released = 0;
  const voice = {};
  sound.ctx = {createPanner: () => ({
    connect() {}, disconnect() { released++; }, setPosition(x,y,z) { positions.push([x,y,z]); },
  })};
  sound.tone = () => voice;
  const p = {x: 0, y: 0, z: 0, eye: 1.7, look: {rotation: {y: 0}}};
  const b = {x: 3, y: 0, z: 0, height: 1, type: 0};
  for (const yaw of [0, Math.PI]) {
    p.look.rotation.y = yaw;
    sound.spatialCue(b,p,'step'); voice.onended();
  }
  assert.deepEqual(positions.map(v=>v[0]), [3,-3]);
  assert.equal(released, 2);
});
