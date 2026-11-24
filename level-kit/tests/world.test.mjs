import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createGrid, createWorld } from '../src/world.mjs';
import { createMissionNavigation } from '../src/mission-navigation.mjs';
import { makeConfig } from '../src/config.mjs';

// 使用与浏览器 importmap 相同的公共模块别名。
registerHooks({ resolve(id, context, next) {
  return next(id.startsWith('@level-kit/') ? new URL('../src/' + id.slice(11), import.meta.url).href : id, context);
} });
const { createBeastClasses } = await import('../src/beasts.mjs');

test('远距巡逻分频保持巡视方向与次数，接近、隔墙枪声和脚步会立即唤醒', () => {
  const config = makeConfig({beasts:{simulation:{profile:true}}});
  const {BeastAI, BeastManager} = createBeastClasses({CONFIG:config, V3:Vector, colors:{}, definition:{}});
  const manager = Object.create(BeastManager.prototype);
  manager.resetSimulationStats();
  const level = new Level(), nav = new Navigation(level);
  level.box(0, 0, .25, 6, 0, 4);
  const ai = new BeastAI(level, nav, manager);
  const p = {x:-36, y:0, z:0, protected:()=>true};
  const g = {time:1, shotAt:-Infinity, shotHearingScale:1, footstep:{at:-Infinity}};
  const b = {id:0, type:0, x:2, y:0, z:0, fx:1, fz:0, patrol:1, alert:0, mode:'move',
    cooldown:0, wakeUntil:-Infinity, heardAt:-Infinity, statusEffects:new Map()};
  const measure = enabled => {
    manager.resetSimulationStats();
    config.beasts.simulation.farCadence = enabled;
    for (let frame=1; frame<=36; frame++) ai.updatePerception(b,p,g,frame,38,false);
    return [manager.simulationStats.perceptions,manager.simulationStats.deferred,b.dx,b.dz];
  };
  assert.deepEqual(measure(false),[6,0,.23,0]);
  assert.deepEqual(measure(true),[2,4,.23,0]);
  p.x = -.8;
  ai.updatePerception(b,p,g,37,2.8,false);
  assert.equal(manager.simulationStats.perceptions,3);
  assert.equal(b.alert,0); // 墙后靠近会检查视野，仍不能看穿墙。
  p.x = -36;
  ai.updatePerception(b,p,g,42,38,false);
  Object.assign(g,{shotAt:g.time,shotX:-1,shotY:0,shotZ:0});
  ai.updatePerception(b,p,g,43,38,false);
  assert.equal(b.alert,config.beasts.memory);

  g.shotAt = -Infinity;
  g.encounter = {hearingOnly:true,shotHearing:24,memory:6};
  b.alert = 0;
  ai.updatePerception(b,p,g,48,38,false);
  Object.assign(g.footstep,{at:g.time,x:-1,y:0,z:0,radius:6});
  ai.updatePerception(b,p,g,49,38,false);
  assert.deepEqual([b.heardX,b.heardZ,b.alert],[-1,0,6]);
});

test('处于任务、特殊动作、伤害持续期的远敌始终走原感知节奏', () => {
  const config=makeConfig({beasts:{simulation:{profile:true}}});
  const {BeastAI,BeastManager}=createBeastClasses({CONFIG:config,V3:Vector,colors:{},definition:{}});
  const manager=Object.create(BeastManager.prototype);
  manager.resetSimulationStats();
  const ai=new BeastAI(null,null,manager);
  let checks=0;
  ai.perceive=()=>{checks++;};
  for (const field of [{type:3},{role:'brood'},{affixes:['swift']},{storyWave:{}},{fieldGroup:'deep'},
    {hunted:true},{droneRaider:true},{climbRoute:[]},{clinging:true},{stairLeg:{}},{alert:1},
    {wakeUntil:2},{statusEffects:new Map([['burn',{}]])}]) {
    const b={id:0,type:0,statusEffects:new Map(),alert:0,wakeUntil:-Infinity, ...field};
    const before=checks;
    ai.updatePerception(b,{}, {time:1,shotAt:-Infinity},6,45,false);
    assert.equal(checks,before+1);
  }
  assert.equal(manager.simulationStats.deferred,0);
});

test('实验池可设 192，战役原有补兵量、遭遇总数和难度参数维持不变', () => {
  for (const stage of [1,8,15]) {
    const baseline = makeConfig({},stage).beasts;
    const experiment = makeConfig({beasts:{capacity:192}},stage).beasts;
    assert.equal(experiment.capacity,192);
    assert.deepEqual({...experiment,capacity:baseline.capacity},baseline);
    assert.ok(baseline.capacity<192);
  }
});

class Vector {
  set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  divideScalar(n) { return this.set(this.x / n, this.y / n, this.z / n); }
}
const CONFIG = makeConfig({ map: { cell: 2, navCell: 2 } });
const GRID = createGrid(Array(7).fill('.......'), 2);
const { Level, Navigation } = createWorld({ CONFIG, GRID, V3: Vector, definition: {},
  clamp: (v, min, max) => Math.min(max, Math.max(min, v)) });

test('涨潮时玩家路标绕过禁行低沟，退潮后恢复直接路线', () => {
  let flooded = false;
  const inside = (x,z) => flooded && x >= -1 && x <= 1 && z >= -2.5 && z <= 2.5;
  const terrain = {
    routeOpen: (x,z) => !inside(x,z),
    canEnter: (body,x,z) => !inside(x,z) || inside(body.x,body.z),
  };
  const world = createWorld({ CONFIG, GRID, V3: Vector, definition:{terrain},
    clamp:(v,min,max)=>Math.min(max,Math.max(min,v)) });
  const level = new world.Level(), nav = new world.Navigation(level);
  const route=createMissionNavigation(nav), start={x:-4,y:0,z:2}, target={x:4,y:0,z:-2};
  assert.deepEqual(route(start,target),[target]);
  flooded=true;level.terrainChanged();
  const path=route(start,target);
  assert.ok(path.length>1);
  let previous=start;
  for(const turn of path) {
    for(let i=0;i<=100;i++) {
      const x=previous.x+(turn.x-previous.x)*i/100, z=previous.z+(turn.z-previous.z)*i/100;
      assert.ok(!inside(x,z));
    }
    previous=turn;
  }
  assert.deepEqual(previous,target);
  flooded=false;level.terrainChanged();
  assert.deepEqual(route(start,target),[target]);
});

test('有地形规则的玩家寻路只重查局部门边，全局事件仍重查全图', () => {
  const world=createWorld({ CONFIG, GRID, V3:Vector, definition:{terrain:{routeOpen:()=>true}},
    clamp:(v,min,max)=>Math.min(max,Math.max(min,v)) });
  const level=new world.Level(), door=level.box(0,0,.2,2,0,3);
  const field=new world.Navigation(level).playerRoute();
  const canWalk=field.canWalk.bind(field);
  let calls=0;
  field.canWalk=(a,b)=>{calls++;return canWalk(a,b);};
  field.rebuild(4,0);
  const all=calls;
  calls=0;level.setBarrier(door,null,false);field.rebuild(4,0);
  assert.ok(calls>0 && calls<all/2);
  calls=0;level.terrainChanged();level.setBarrier(door,null,true);field.rebuild(4,0);
  assert.equal(calls,all);
});

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

test('不同体型按自身宽高选择窄门或绕路', () => {
  const level = new Level();
  // 1.34 米窄门，群袭体可以通过，冲锋体要从墙的外侧绕行。
  level.box(-2.335, 0, 3.33, .35, 0, 4);
  level.box(2.335, 0, 3.33, .35, 0, 4);
  const nav = new Navigation(level);
  nav.rebuild(0,4);
  const door = nav.index(0,0), from = nav.index(0,-4);
  assert.equal(nav.fields[0].walkable[door], 1);
  assert.equal(nav.fields[1].walkable[door], 0);
  assert.ok(nav.fields[1].dist[from] > nav.fields[0].dist[from]);
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

test('冲锋前摇锁定方向、发出一次提示，地面预警在掩体前结束', () => {
  const level = new Level();
  level.box(0, 5.6, 3, .3, 0, 4);
  const { BeastAI } = createBeastClasses({ CONFIG, V3: Vector, colors: {}, definition: {} });
  const ai = new BeastAI(level, null, null);
  const stats = CONFIG.beasts.types[1];
  const beast = { type: 1, x: 0, y: 0, z: 0, fx: 0, fz: 1, alert: 1, mode: 'move', cooldown: 0,
    height: stats.height, radius: stats.radius, perkMoveScale: 1, statusEffects: new Map() };
  const player = { x: 0, y: 0, z: 4, protected: () => false };
  const calls = [], game = { time: 1, shotAt: -Infinity, sound: {spatialCue: (...args) => calls.push(args)} };
  ai.perceive(beast, player, game);
  assert.equal(beast.mode, 'windup');
  assert.equal(beast.phaseTime, CONFIG.feedback.chargeWindup);
  assert.deepEqual([beast.fx, beast.fz], [0, 1]);
  assert.deepEqual(calls, [[beast, player, 'charge']]);
  assert.ok(beast.chargeMarkCount >= 1);
  assert.ok(beast.chargeMarkCount * beast.chargeMarkLength + beast.radius < 5.6);
});
