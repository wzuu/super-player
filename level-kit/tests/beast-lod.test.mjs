import test from 'node:test';
import assert from 'node:assert/strict';
import {makeConfig} from '../src/config.mjs';
import {BeastDetailBudget} from '../src/beast-lod.mjs';

const camera={position:{x:0,y:0,z:0},near:.05,projectionMatrix:{elements:[1,0,0,0,0,1.4]},
  matrixWorldInverse:{elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}};
const appearance=makeConfig().beasts.appearance;
function actor(id,distance,type=0) {
  return {id,x:0,y:0,z:-distance,height:type===3?4:1.5,type,mode:'move',active:true,submitBody:true};
}

test('三档模型保持距离滞回；同距离接敌者优先，镜头外实例不占近模名额',()=>{
  const budget=new BeastDetailBudget(), pool=[actor(0,4)];
  const select=()=>budget.select(pool,camera,appearance,'low');
  select();assert.equal(pool[0].nearLOD,true);
  for(const d of [8,9.4,8.6]) {pool[0].z=-d;select();assert.equal(pool[0].nearLOD,true);}
  pool[0].z=-11;select();assert.equal(pool[0].nearLOD,false);
  pool[0].z=-18.1;select();assert.equal(pool[0].farLOD,true);
  for(const d of [16.5,15,16]){pool[0].z=-d;select();assert.equal(pool[0].farLOD,true);}
  pool[0].z=-13.9;select();assert.equal(pool[0].farLOD,false);
  pool.length=0;
  for(let i=0;i<12;i++)pool.push(actor(i,3));
  pool[0].submitBody=false;
  pool[10].mode='windup';
  const boss=actor(12,7,3);pool.push(boss);
  select();assert.equal(pool.filter(b=>b.nearLOD&&b.type!==3).length,3);
  assert.equal(boss.nearLOD,true);assert.equal(pool[10].nearLOD,true);assert.ok(!pool[0].nearLOD);
  budget.select(pool,camera,{...appearance,detailEnabled:false},'low');
  assert.equal(pool.filter(b=>b.nearLOD).length,0);
});

test('镜后高威胁仍提交身体，主视野的目标获得近模名额',()=>{
  const mirror=actor(0,-2), visible=actor(1,6), side=actor(2,2);
  mirror.mode='windup';mirror.nearLOD=true;side.x=5;
  const budget=new BeastDetailBudget(), pool=[mirror,side,visible];
  budget.select(pool,camera,{...appearance,nearBudgets:{low:1}},'low');
  assert.ok(mirror.submitBody && !mirror.nearLOD && !mirror.farLOD);
  assert.ok(side.submitBody && !side.nearLOD);
  assert.ok(visible.nearLOD);
});

test('160 只贴近镜头时按画质缩减近模，狂暴首领保留独立展示',()=>{
  const budget=new BeastDetailBudget(), pool=Array.from({length:159},(_,i)=>actor(i,4));
  const boss=actor(159,6,3);boss.rage=true;pool.push(boss);
  for(const [tier,cap] of [['high',12],['medium',8],['low',3]]) {
    budget.select(pool,camera,appearance,tier);
    assert.equal(pool.filter(b=>b.nearLOD&&b!==boss).length,cap);
    assert.equal(budget.counts.bossNear,1);assert.equal(boss.nearLOD,true);
  }
});
