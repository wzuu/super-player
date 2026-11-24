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
      g.time+=.02;b.alert=8;b.cooldown=10;
      m.ai.update(b,p,g,.02,i);
      move(.09);g.encounter.update(g,.02);
      check(door.active && (b[axis]-(axis==='x'?x:z))*sign<0,label+'：追击时推开或穿过了门');
    }
    open();corridor(true);
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
    pos(p,{x:0,y:0,z:34});
    g.encounter.update(g,.1);
    check(level.entryDoor.active,'开门动画刚开始即允许穿越');
    g.encounter.update(g,.55);
  },{holdOpen:true});
  reset();
  exercise('维修捷径面板',level.serviceHatch,'x',1,()=>{
    pos(p,{x:-14,y:0,z:-8.5});g.encounter.interact(g);g.encounter.update(g,1);
  },{exit:.65}); // 机房外墙位于维修面板后方，过门后沿走廊转弯。
  reset();
  const gate=level.solids.find(s=>Math.abs(s.x0)<.01 && Math.abs(s.z0-21.76)<.01);
  exercise('安保卡任务门',gate,'z',-1,()=>{
    const s=g.story;
    pos(p,s.target);s.step(.02,g);
    for(const member of m.pool)if(member.active && member.storyWave)m.eject(member,g);
    s.step(.02,g);pos(p,s.target);
    check(s.interact(g) && gate.active,'领取安保卡前后门应保持关闭');
    pos(p,s.target);check(s.interact(g),'刷安保卡失败');
  });
  reset();
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
