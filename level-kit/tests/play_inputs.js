// 在页面内模拟常规键鼠，沿用游戏灵敏度、碰撞、拾取和开火检查。
function playInputs({game:g,config,camera}) {
  const p=g.player;
  const eye=camera.position.clone(),ray=eye.clone(),held=new Set();
  let firing=false;
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
  const key=(code,down)=>document.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true}));
  const tap=code=>{key(code,true);key(code,false);};
  function buttons(want,fire) {
    for(const code of held) if(!want.has(code)){key(code,false);held.delete(code);}
    for(const code of want) if(!held.has(code)){key(code,true);held.add(code);}
    if(fire!==firing){
      document.dispatchEvent(new MouseEvent(fire?'mousedown':'mouseup',{button:0,bubbles:true}));
      firing=fire;
    }
  }
  function aim(pitch,yaw) {
    const unit=.002*config.player.mouseSpeed;
    let dx=Math.round(Math.atan2(Math.sin(p.look.rotation.y-yaw),Math.cos(p.look.rotation.y-yaw))/unit);
    let dy=Math.round((p.look.rotation.x-pitch)/unit);
    while(dx||dy) {
      const x=Math.max(-110,Math.min(110,dx)),y=Math.max(-80,Math.min(80,dy));
      document.dispatchEvent(new MouseEvent('mousemove',{movementX:x,movementY:y,bubbles:true}));
      dx-=x;dy-=y;
    }
  }
  function see(beast) {
    eye.set(p.x,p.y+p.eye,p.z);
    ray.set(beast.x-eye.x,beast.y+beast.height*.72-eye.y,beast.z-eye.z);
    const d=ray.length();
    return g.level.visible(eye,ray.divideScalar(Math.max(.001,d)),d);
  }
  return {ray,distance,tap,buttons,aim,see};
}
