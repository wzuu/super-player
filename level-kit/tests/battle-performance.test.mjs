import test from 'node:test';
import assert from 'node:assert/strict';
import { BattlePerformance } from '../src/battle-performance.mjs';
import { variations, drawVariation } from '../src/variations.mjs';

test('变奏抽取排除上一局和不适用关卡，权重覆盖六种规则',()=>{
  for(const old of variations){
    for(let i=0;i<100;i++){
      assert.notEqual(drawVariation(3,old.id,()=>i/100).id,old.id);
      assert.notEqual(drawVariation(5,old.id,()=>i/100).id,'fog');
    }
  }
  assert.equal(new Set(Array.from({length:100},(_,i)=>drawVariation(3,null,()=>i/100).id)).size,6);
});
test('命中按射击计数，超时和受击截断连杀，失败和无尽分别评分',()=>{
  const s=new BattlePerformance(), g={time:0,stageKillTarget:100,objective:{mode:'classic'},loot:[],kills:100,sound:{tone(){}}};
  for(let i=0;i<12;i++){s.shot(true);s.kill(g,{affixes:['swift']},'electric',{});g.time+=.3;}
  s.shot(false);assert.equal(s.shots,13);assert.equal(s.hits,12);
  const win=s.result(g,true);assert.equal(win.grade,'S');assert.equal(win.maxCombo,12);assert.equal(win.eliteKills,12);
  assert.equal(s.result(g,false).grade,'C');
  g.time+=10;s.kill(g,{},'equipment');assert.equal(s.combo,1);
  s.hurt(11);assert.equal(s.combo,0);assert.equal(s.damageTaken,11);
  g.objective.mode='endless';g.time=400;assert.equal(s.result(g,false).grade,'S');
  s.reset();assert.equal(s.maxCombo,0);assert.equal(s.shots,0);
});
