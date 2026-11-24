// 守卫在自己的驻点巡视。枪声只给出开火位置，看到玩家或被击中才交给追击 AI。
const guardNeighbors = [];
export function watchRooms(b, g, dt, canSee, config) {
  const post = b.guardPost, p = g.player;
  const sense = (g.beasts.frame + b.id) % 6 === 0;
  if (b.hp < b.maxHP || b.stun > 0 || (sense && Math.hypot(p.x-b.x,p.z-b.z) < config.beasts.sight && canSee(b,p))) return false;
  if (g.time - g.shotAt < .35 && b.heardAt !== g.shotAt &&
      Math.hypot(g.shotX-b.x,g.shotZ-b.z) < config.weapon.hearingRadius * g.shotHearingScale) {
    b.heardAt = g.shotAt; b.heardX = g.shotX; b.heardZ = g.shotZ;
  }
  const listening = g.time - b.heardAt < config.beasts.memory;
  const angle = post.yaw + .9 * Math.sin(g.time * .65 + b.id);
  const heading = listening ? Math.atan2(b.heardX-post.x,b.heardZ-post.z) : angle;
  const pace = listening ? 2.4 : (b.id % 3 === 0 ? 1.15 * Math.sin(g.time * .48 + b.id) : 0);
  const [left,back,right,front] = b.roomBounds;
  const x = Math.max(left,Math.min(right,post.x + Math.sin(heading)*pace));
  const z = Math.max(back,Math.min(front,post.z + Math.cos(heading)*pace));
  const dx = x-b.x, dz = z-b.z, gap = Math.hypot(dx,dz);
  const step = Math.min(gap,dt * (listening ? .95 : .55) * b.perkMoveScale);
  b.stride = 0;
  if (gap > .08 && step > 0) {
    const mx = dx/gap*step, mz = dz/gap*step, range = b.radius + 1.5;
    const near = g.beasts.hash.query(b.x-range,b.z-range,b.x+range,b.z+range,guardNeighbors);
    const blocked = near.some(other => other !== b && Math.abs(other.y-b.y)<1.3 &&
      Math.hypot(b.x+mx-other.x,b.z+mz-other.z) < b.radius+other.radius+.08 &&
      (other.x-b.x)*mx + (other.z-b.z)*mz > 0);
    if (!blocked) b.stride = g.level.move(b,mx,mz,.47)/dt;
  }
  const facing = listening ? Math.atan2(b.heardX-b.x,b.heardZ-b.z) : angle;
  b.fx = Math.sin(facing); b.fz = Math.cos(facing); b.yaw = facing;
  return true;
}
