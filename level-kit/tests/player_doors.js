// 从封锁侧操作真正的门；清场后同一证物柜仍按首次发现规则发放证物。
function clearLabArchive(g) {
  const {encounter,beasts,level,player} = g;
  if(encounter.archiveLoot)return;
  const door=level.serviceHatch, x=(door.x0+door.x1)/2,z=(door.z0+door.z1)/2;
  Object.assign(player,{x:x-1,y:0,z});
  encounter.interact(g);
  if(!encounter.hatchOpen)throw Error('档案区守卫未就位');
  for(let tick=0;tick<30&&!encounter.archiveLoot;tick++){
    for(const b of beasts.pool)if(b.active && b.archiveTag)beasts.damage(b,1e7,g);
    g.time+=.2;beasts.releaseSplits(g);encounter.update(g,.2);
  }
  if(!encounter.archiveLoot)throw Error('档案区清场后没有解锁证物柜');
}

// 通过正式碰撞、射线、寻路和敌人追击验证各门。全部输入留在测试页面内。
function verifyPlayerDoors() {
  const {game:g,nav,config}=run, {level,player:p,beasts:m}=g;
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  const pos=(actor,q)=>Object.assign(actor,{x:q.x,y:q.y,z:q.z});
  const field=nav.routeFor(0,true), passed=[];
  function reset(){
    document.querySelector('#mission-mode').value='classic';
    g.reset();g.phase='play';p.escaped=true;
  }
  function exercise(label,door,axis,sign,open,{holdOpen=false,approach=1.15,exit=1.15}={}) {
    const x=(door.x0+door.x1)/2,z=(door.z0+door.z1)/2;
    const normal={x:axis==='x'?sign:0,y:0,z:axis==='z'?sign:0};
    const point=n=>({x:x+n*normal.x,y:door.y0,z:z+n*normal.z});
    const inside=point(-approach),across=point(exit);
    const ray={...inside,y:inside.y+.8};
    const corridor=open=>{
      field.rebuild(across.x,across.z);
      check(door.active!==open && level.visible(ray,normal,approach+exit)===open &&
        !level.blocked(x,z,door.y0,config.player.radius,config.player.height)===open &&
        field.canWalk(inside,across)===open,label+'：门态、弹道、玩家碰撞或追击通路有分歧');
    };
    corridor(false);
    const b=m.spawn(0,inside.x,inside.z,inside.y,0);
    check(b,label+'：测试追兵无法在门前落脚');
    const move=(n)=>level.move(b,normal.x*n,normal.z*n,.47);
    pos(p,point(5.6));p.escaped=true;nav.rebuild(p.x,p.z);
    for(let i=0;i<100;i++){
      const previous={x:b.x,z:b.z};
      g.time+=.02;b.alert=8;b.cooldown=10;
      m.ai.update(b,p,g,.02,i);
      move(.09);g.encounter.update(g,.02);
      // 小型证物柜容许绕侧；只有穿过门叶的有效横向范围才属于穿门。
      const plane=axis==='x'?x:z, was=(previous[axis]-plane)*sign, now=(b[axis]-plane)*sign;
      if(was<=0 && now>0){
        const lateral=axis==='x'?'z':'x',t=was/(was-now);
        const cross=previous[lateral]+t*(b[lateral]-previous[lateral]);
        check(cross+b.radius<=door[lateral+'0'] || cross-b.radius>=door[lateral+'1'],label+'：追击穿过了门叶');
      }
      check(door.active,label+'：追击时推开了门');

    }
    pos(b,inside);open();corridor(true);
    pos(b,inside);pos(p,across);p.escaped=true;nav.rebuild(p.x,p.z);
    let crossed=false;
    for(let i=0;i<180;i++){
      g.time+=.02;b.alert=8;b.cooldown=10;
      m.ai.update(b,p,g,.02,i);
      if((b[axis]-(axis==='x'?x:z))*sign>.3){crossed=true;break;}
    }
    check(crossed,label+'：开门后追兵未能走过门洞');
    if(holdOpen){
      pos(b,point(0));pos(p,point(6));
      for(let i=0;i<60;i++)g.encounter.update(g,.02);
      corridor(true);
      pos(b,point(-2));
      for(let i=0;i<60;i++)g.encounter.update(g,.02);
      corridor(false);
      // 门上方的凶兽也不能触发防夹感应。
      pos(p,point(2));g.encounter.update(g,1);
      pos(p,point(6));pos(b,{...point(0),y:door.y1+.5});g.encounter.update(g,1);
      corridor(false);
    }
    passed.push(label);
  }
  reset();
  exercise('入口自动气闸',level.entryDoor,'z',1,()=>{
    pos(p,{x:0,y:0,z:61.65});
    g.encounter.update(g,.1);
    check(level.entryDoor.active,'开门动画刚开始即允许穿越');
    g.encounter.update(g,.55);
  },{holdOpen:true});
  reset();
  exercise('可选档案室面板',level.serviceHatch,'x',1,()=>{
    pos(p,{x:22,y:0,z:-27});g.encounter.interact(g);g.encounter.update(g,1);
  },{exit:.65}); // 机房外墙位于维修面板后方，过门后沿走廊转弯。
  reset();
  const gate=level.solids.find(w=>Math.abs((w.z0+w.z1)/2-52)<.001 && w.x0<0 && w.x1>0);
  exercise('安检走廊隔离门',gate,'z',-1,()=>{
    const s=g.story;
    pos(p,s.target);
    check(s.interact(g) && s.stage==='fight' && s.encounters[0]?.spawned===4 &&
      m.pool.filter(b=>b.active && s.isCurrentGuard(b)).length===4,
      '玩家开门时守卫必须全部就位');
  });
  reset(); clearLabArchive(g);
  const f=g.field;
  exercise('密室侧门',f.secret.door.box,'z',-1,()=>{
    pos(p,f.secret.front);check(f.interact(g),'密室玩家交互未响应');
  },{approach:.65}); // 密室门口的真实通道紧靠安检隔墙。
  reset();pos(p,level.gate);
  nav.rebuild(p.x,p.z);const closed=nav.walkable.slice();
  g.trigger();check(!g.blast,'未取得核心时不应打开撤离屏障');
  g.core=g.bossDead=true;g.story.blocksExit=false;g.trigger();nav.rebuild(p.x,p.z);
  check(g.blast && nav.walkable.some((v,i)=>v&&!closed[i]),'玩家起爆后撤离屏障未向导航开放');
  passed.push('撤离屏障');
  return passed;
}
