// 每次场景重开都由正式运行时复位。固定坐标对照用于区分相邻房间、隔墙交互和逐门增援。
function checkRifts(stage){
  const {game:g}=run,{story:s,player:p,level:l}=g,r=s.rifts;
  const assert=(condition,detail)=>{if(!condition)throw Error(stage+' '+detail);};
  const move=({x,y,z})=>Object.assign(p,{x,y,z});
  const point=(x,z)=>({x,y:l.base(x,z),z});
  const start=mode=>{document.querySelector('#mission-mode').value=mode;g.reset();g.phase='play';};
  const step=seconds=>{
    for(let i=0;i<Math.ceil(seconds/.05);i++){g.time+=.05;g.encounter.update(g,.05);s.step(.05,g);}
  };
  start('endless');
  assert(!s.managed && g.beasts.boss && !r.cases.some(c=>c.mesh.visible),'无尽设置');
  start('classic');
  assert(s.actionName==='爆破' && s.encounters.length===1,'开局驻防');
  const live=g.beasts.live,loot=g.pickups.objects.filter(o=>o.active && o.kind==='rare');
  assert(loot.length===10 && loot.every(o=>!l.blocked(o.x,o.z,o.y,p.radius,p.height)),'战利品落点');
  const first=r.cases[0],gate=r.gates[0];
  move(gate.position);assert(!s.interact(g),'空手误安放');
  p.look.rotation.x=-1.35;g.kit.supply('grenade');
  const before=g.kit.remaining().grenade;
  g.kit.use(3,g);
  const grenade=run.scene.getObjectByName('field-grenade');
  assert(grenade.visible && g.kit.remaining().grenade===before-1,'普通手雷未投出');
  for(let i=0;i<45;i++)g.kit.step(.04,g);
  assert(!grenade.visible && gate.state==='open' && !r.result().riftsDestroyed,'普通手雷误计任务爆破');
  move(first.position);
  assert(s.interact(g) && !s.interact(g) && r.result().chargesCollected===1,'取弹重复');
  move(gate.position);
  assert(s.interact(g) && !s.interact(g) && gate.state==='armed','连续安放');
  g.time+=7;p.hurtDelay=0;p.hurt(10000,g);assert(g.phase==='fail','死亡未结算');
  start('classic');
  assert(g.beasts.live===live && r.result().chargesCollected===0 && r.gates.every(gate=>gate.state==='open' && !gate.spawned),'失败重开');
  if(stage==='rift-temple-valley'){
    move(point(16.8,-25));
    assert(l.blocked(18,-25,p.y,p.radius,p.height) && !s.interact(g),'外侧打开内闩');
    move(point(20,-25));assert(s.interact(g) && !l.blocked(18,-25,p.y,p.radius,p.height),'内闩未放行');
    for(let i=0;i<12;i++)l.move(p,-.34,0,.47);
    assert(p.x<17,'闩门仍挡住玩家');
  }
  if(stage==='caldera-rift-works'){
    move(first.position);assert(s.interact(g),'取弹');
    g.time=25;g.encounter.update(g,.01);
    move(point(0,7));g.time=32;g.encounter.update(g,.01);
    assert(g.encounter.flooded,'涨潮');
    const bank=s.navigation({stage:'退出低沟',target:point(4,-44)},g).waypoint;
    assert(bank?.z>=15,'持弹时缺少离沟路线');
    for(let i=0;i<45;i++)l.move(p,0,.25,.47);
    assert(p.z>17,'持弹离不开低沟');
    for(let i=0;i<20;i++){
      l.move(p,0,-.25,.47);p.y=l.foot(p.x,p.z,p.y+.47,p.radius);
    }
    assert(p.z>=15,'高水位仍可重新入沟');
    const guide=s.navigation({stage:'渡桥',target:point(4,-44)},g);
    assert(guide.path?.some(q=>Math.abs(q.x)>19),'高桥路线未找到');
    start('classic');
  }
  const kit=JSON.stringify(g.kit.remaining());
  for(const c of r.cases){move(c.position);assert(s.interact(g),'取三弹');}
  const order=[2,1,0],snapshots=[];
  let wins=0;
  const finish=g.finish.bind(g);
  g.finish=(won,reason)=>{if(won)wins++;finish(won,reason);};
  for(const [i,j] of order.entries()){
    const current=r.gates[j];
    move(current.position);assert(s.interact(g) && !s.interact(g),'跨门重复安放');
    if(stage==='midnight-midway-backstage'){
      g.time=6;g.encounter.update(g,.01);g.ui.tick=0;g.ui.update(.1,g);
      assert(document.querySelector('#objective').textContent.includes('引信') &&
        document.querySelector('#condition-title').textContent.includes('维修车'),'引信提示与设施预警');
    }
    move(l.spawn);step(3.1);
    assert(current.state==='destroyed' && r.result().riftsDestroyed===i+1,'逐门结算');
    if(i===2)break;
    const old=r.gates.map(gate=>gate.spawned);
    for(const gate of r.gates)for(const {beast,generation} of gate.members){
      if(beast.active && beast.spawnGeneration===generation)g.beasts.damage(beast,1e6,g);
    }
    step(54);
    const now=r.gates.map(gate=>gate.spawned);
    for(const [index,gate] of r.gates.entries()){
      assert(gate.state==='destroyed'?now[index]===old[index]:now[index]>old[index],'门的独立增援 '+gate.name);
      assert(gate.members.filter(m=>m.beast.active && m.beast.spawnGeneration===m.generation).length<=gate.cap,'增援上限');
    }
    snapshots.push({old,now});
  }
  r.step(.1,g);
  assert(g.phase==='win' && wins===1 && JSON.stringify(g.kit.remaining())===kit,'任务物与军需或胜利次数');
  return {live,wins,snapshots};
}
