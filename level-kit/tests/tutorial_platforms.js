// 在教程的实际几何上按 60 Hz 推进 Player.update，第一条路线从出生点开始。
function checkTutorialPlatforms() {
  const {game:g,config}=run, p=g.player, level=g.level;
  const oldPhase=g.phase, dt=1/60;
  function step(n,walk=false,jump=false) {
    const input={jump,held:key=>walk && key==='KeyW'};
    for(let i=0;i<n;i++){g.time+=dt;p.update(dt,input,g);}
  }
  function face(x,z) {p.look.rotation.set(0,Math.atan2(-x,-z),0,'YXZ');}
  const paths=[
    {name:'出生点',dir:[0,-1],spawn:true},
    {name:'北',dir:[0,1]}, {name:'南',dir:[0,-1]}, {name:'东',dir:[-1,0]}, {name:'西',dir:[1,0]},
    {name:'南沿',dir:[0,-1],at:[0,20.59]},
    {name:'东南角',dir:[-1,-1],at:[1.13,20.60]}, {name:'西北角',dir:[1,1],at:[-1.13,19.4]},
    {name:'内墙旁窄道',dir:[0,-1],at:[-24,20],wall:true},
  ];
  try {
    g.reset();g.phase='play';
    for(const {name,dir,at=[0,20],spawn,wall} of paths){
      p.reset();
      const length=Math.hypot(...dir), dx=dir[0]/length,dz=dir[1]/length;
      face(dx,dz);
      if(spawn)step(68,true);
      else Object.assign(p,{x:at[0]-1.75*dx,z:at[1]-1.75*dz});
      if(level.blocked(p.x,p.z,p.y,p.radius,p.height))throw Error(name+' 起跳位置没有净空');
      step(20,true,true);step(90);
      if(!p.grounded || Math.abs(p.y-.9)>.005 || level.blocked(p.x,p.z,p.y,p.radius,p.height))
        throw Error(name+' 落地后陷入实体 '+[p.x,p.y,p.z]);
      const start={x:p.x,y:p.y,z:p.z};
      for(const jump of [false,true]){
        Object.assign(p,start,{grounded:true,vy:0});
        face(dx,dz);step(65,true,jump);step(30);
        if(!p.grounded || Math.abs(p.y)>.005 || level.blocked(p.x,p.z,p.y,p.radius,p.height) ||
          Math.hypot(p.x-start.x,p.z-start.z)<.8)throw Error(name+' 无法'+(jump?'跳下':'走下')+'平台');
        if(wall){
          if(p.z<18.005+config.player.radius-.001 || p.z>18.55)throw Error('未在内墙前正常着地');
          const x=p.x;face(1,0);step(48,true);
          if(p.x-x<3)throw Error('贴墙落地后不能侧移离开');
        }
      }
    }
    return paths.map(path=>path.name);
  } finally {
    g.reset();g.phase=oldPhase;
  }
}
