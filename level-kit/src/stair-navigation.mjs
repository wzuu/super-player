// 双端楼梯只在需要跨层时接管追击方向。每个入口与体型共用一张距离场。
export function stairWaypoint(beast, player, level, nav) {
  const stairs=level.stairs;
  if (!stairs) return null;
  const {x,z,baseY,topY,deckLength,deckWidth,stairWidth,run}=stairs;
  const half=deckLength/2, end=half+run, floor=topY-baseY;
  const onTop=who=>Math.abs(who.x-x)<=deckWidth/2 && Math.abs(who.z-z)<=half-.18 && who.y>=topY-.22;
  const range=Math.hypot(player.x-x,player.z-z);
  // 远程体在能覆盖交战区时争夺制高点；玩家离开交战区后经另一端下楼追击。
  const sniper=beast.type===2 && range<21 && Math.hypot(beast.x-x,beast.z-z)<24;
  const up=onTop(player) || sniper;
  const onStair=Math.abs(beast.x-x)<stairWidth/2 && Math.abs(beast.z-z)<end+.65 && Math.abs(beast.z-z)>half-.4;
  const above=beast.y>baseY+Math.min(.6,floor*.3);
  const descending=beast.stairLeg?.up===false;
  if (!up && !above && !onStair && !descending) {beast.stairLeg=null;return null;}
  if (up && onTop(beast)) {
    beast.stairLeg=null;
    if (sniper && !onTop(player)) return {x:x+.35,z:z+Math.sign(player.z-z)*Math.max(0,half-1)};
    return null;
  }
  if (!up && !onTop(beast) && !onStair && !descending) {beast.stairLeg=null;return null;}
  if (Math.hypot(beast.x-x,beast.z-z)>Math.max(32,end+18)) return null;
  if (!beast.stairLeg || beast.stairLeg.up!==up) {
    const choose=onStair && beast.y<topY-.22 ? beast.z : up?beast.z:player.z;
    beast.stairLeg={up,side:choose<z?-1:1,aligned:false};
  }
  const leg=beast.stairLeg, side=leg.side;
  const lineZ=(beast.z-z)*side, offset=Math.abs(beast.x-x);
  const top={x,z:z+side*(half-.65)}, bottom={x,z:z+side*(end+beast.radius+.55)};
  if (up) {
    if (onStair && offset<Math.max(.3,stairWidth/2-beast.radius-.14) || (lineZ>end-.1 && offset<.55)) leg.aligned=true;
    if (leg.aligned) return top;
    // 先绕过平台侧墙，再对准坡脚。楼梯沿中心线行进时有完整体宽。
    const key=side+':'+beast.type;
    const fields=stairs.routes ??= new Map();
    let route=fields.get(key);
    if(!route){route=nav.routeFor(beast.type);fields.set(key,route);}
    route.rebuild(bottom.x,bottom.z);
    const i=route.index(beast.x,beast.z),next=route.next(beast.x,beast.z);
    if(Math.hypot(beast.x-bottom.x,beast.z-bottom.z)>route.cell*1.4 && next!==i)
      return {x:route.x(next),z:route.z(next)};
    return bottom;
  }
  if (!leg.aligned && (!onStair || offset>.55) && (offset>.45 || lineZ<half-.95)) return top;
  leg.aligned=true;
  if(lineZ>end+beast.radius+.1 && beast.y<=baseY+.15){beast.stairLeg=null;return null;}
  return bottom;
}
