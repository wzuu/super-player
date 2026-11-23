import test from 'node:test';
import assert from 'node:assert/strict';
import {createObjective, missionRules} from '../src/objectives.mjs';
import {FoeTraits} from '../src/foe-traits.mjs';

function fixture() {
  class Vector {
    constructor(x=0,y=0,z=0){this.set(x,y,z);}
    set(x,y,z){Object.assign(this,{x,y,z});}
    distanceTo(p){return Math.hypot(this.x-p.x,this.y-p.y,this.z-p.z);}
    lerp(p,t){this.set(this.x+(p.x-this.x)*t,this.y+(p.y-this.y)*t,this.z+(p.z-this.z)*t);}
  }
  const THREE={Mesh:class {position=new Vector()},OctahedronGeometry:class {},MeshBasicMaterial:class {},Vector3:Vector};
  const goal=createObjective(1,{THREE,scene:{add(){}}},{beasts:{killsToWin:7}});
  const text={bossName:'首领甲',keyItem:'通行证',enemy:'守卫',portal:'屋顶',exitObjective:'前往屋顶',detonating:'引爆中'};
  const g={player:new Vector(),beasts:{boss:new Vector(4,1,2)},level:{spawn:new Vector(),gate:new Vector(20,4,0)},
    pickups:{keyItem:new Vector(),nearKey:()=>false},ui:{notify(){}},nearGate:()=>false,kills:0,time:0};
  return {goal,g,text,guide:()=>goal.guide(g,text)};
}
test('经典行动遵循实际首领、掉落、击杀门槛与可交互位置',()=>{
  const {goal,g,guide}=fixture();goal.reset('classic',g);
  assert.equal(guide().target,g.beasts.boss);g.bossDead=true;
  assert.equal(guide().target,g.pickups.keyItem);g.pickups.nearKey=()=>true;
  assert.equal(guide().stage,'collect');g.core=true;g.kills=6;
  assert.match(guide().detail,/1 只/);g.kills=7;
  assert.equal(guide().target,g.level.gate);g.nearGate=()=>true;
  assert.equal(guide().stage,'interact');g.blast=.1;assert.equal(guide().stage,'blast');
});
test('坚守、护送、限时和无尽分别显示可执行的指引',()=>{
  const {goal,g,guide}=fixture();goal.reset('hold',g);assert.equal(guide().stage,'approach');
  g.nearGate=()=>true;goal.step(3,g);assert.match(guide().detail,/3 \/ 45/);
  goal.step(missionRules.holdSeconds,g);assert.equal(guide().stage,'interact');
  goal.reset('escort',g);g.player.x=12;goal.step(.1,g);
  assert.equal(guide().stage,'regroup');assert.equal(guide().target.x,0);
  g.player.x=0;goal.step(.1,g);assert.equal(guide().stage,'escort');
  goal.reset('timed',g);g.core=g.bossDead=true;goal.step(.1,g);g.time+=15;
  assert.match(guide().detail,/75 秒/);goal.reset('endless',g);g.time=46;goal.step(.1,g);
  assert.equal(guide().stage,'wave-2');
});
test('漏过护送伏击直达屋顶后仍可带无人机返回任务区',()=>{
  const {goal,g}=fixture();
  goal.reset('escort',g);
  g.story={blocksExit:true,managed:true};
  const gate=g.level.gate;
  g.player.set(gate.x,gate.y,gate.z);
  goal.drone.position.set(gate.x,gate.y+1,gate.z);
  goal.step(.1,g);
  assert.equal(goal.result(g).escorted,false);
  g.player.x-=1;goal.step(.2,g);
  assert.ok(goal.drone.position.x<gate.x);
  g.story.blocksExit=false;goal.step(.1,g);
  assert.equal(goal.ready(g),true);
});
test('孵化与延时分裂继承小队和宝库守卫身份，并遵守两种人数上限',()=>{
  const traits=new FoeTraits(13,{beasts:{population:55}}),group={cap:2};
  const b={x:0,y:0,z:0,active:true,storyWave:group,fieldGroup:'vault',affixes:['split']};
  const pool=[b],g={beasts:{pool,live:1,dropHeight:()=>0,spawn(){
    const child={active:true};pool.push(child);this.live++;return child;
  }},field:{guards:[b],guardCount:2},story:{cap:2},pickups:{add(){}},
    level:{surface:()=>0},player:{x:10,y:0,z:0}};
  // 对象池容量与当前存活数分开。
  pool.push(...Array.from({length:6},()=>({active:false})));
  traits.offspring(b,g,3);
  assert.equal(g.field.guards.length,2);assert.equal(pool.at(-1).storyWave,group);
  b.active=false;g.beasts.live--;traits.defeated(b,g);const [deferred]=traits.splits;
  traits.offspring(deferred,g,2);
  assert.equal(pool.filter(v=>v.active && v.storyWave===group).length,2);
  assert.equal(pool.filter(v=>v.active && v.fieldGroup==='vault').length,2);
});
