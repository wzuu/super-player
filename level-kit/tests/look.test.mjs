import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotateLook, applyMouseLook, requestMouseLock, StickLook } from '../src/look.mjs';

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


test('locked pointer integrates ordered device samples once, with per-axis jump protection',()=>{
  const look={x:0,y:0}, rows=[];
  const samples=[{timeStamp:11,movementX:400,movementY:5},{timeStamp:12,movementX:400,movementY:-1800},
    {timeStamp:13,movementX:400,movementY:-3}];
  applyMouseLook(look,{timeStamp:14,movementX:1200,movementY:-1798,getCoalescedEvents:()=>samples},
    1,10,(...row)=>rows.push(row));
  assert.ok(Math.abs(look.y+2.4)<1e-12);
  assert.equal(look.x,-.004);
  assert.deepEqual(rows,[[400,5,11],[400,-1800,12],[400,-3,13]]);
  const original={...look};
  applyMouseLook(look,{timeStamp:14,movementX:1200,movementY:0},1,10);
  assert.deepEqual(look,original);
});

test('relock discards stale subsamples; axes missing relative deltas use their parent once',()=>{
  const run=(samples,movementX,movementY)=>{
    const look={x:0,y:0};
    applyMouseLook(look,{timeStamp:12,movementX,movementY,getCoalescedEvents:()=>samples},1,10);
    return look;
  };
  assert.deepEqual(run([{timeStamp:9,movementX:200,movementY:-80},{timeStamp:11,movementX:20,movementY:0}],220,-80),
    {x:0,y:-.04});
  assert.deepEqual(run([{timeStamp:10,movementX:0,movementY:4},{timeStamp:11,movementX:0,movementY:6}],20,10),
    {x:-.02,y:-.04});
  assert.deepEqual(run([],20,10),{x:-.02,y:-.04});
});

test('request unadjusted input first; only unsupported options retry the ordinary lock',async()=>{
  const calls=[],modes=[];
  const ask=fn=>requestMouseLock({requestPointerLock(options){calls.push(options);return fn(options);}},mode=>modes.push(mode));
  await ask(()=>Promise.resolve());
  await ask(options=>options ? Promise.reject(new DOMException('raw','NotSupportedError')) : Promise.resolve());
  await ask(options=>{if(options)throw new TypeError('options');});
  await ask(()=>undefined);
  await assert.rejects(ask(()=>Promise.reject(new DOMException('focus','NotAllowedError'))),{name:'NotAllowedError'});
  const raw={unadjustedMovement:true};
  assert.deepEqual(calls,[raw,raw,undefined,raw,undefined,raw,raw]);
  assert.deepEqual(modes,['unadjusted','default','default','unconfirmed']);
});
