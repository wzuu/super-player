// 首领的环与扇都从锁定的脚下位置沿地面展开。窄门、落差和上下层不传递伤害。
const slices = 32, step = .5, halfArc = Math.PI * .34;
const direction = {x:0,y:0,z:0}, origin = {x:0,y:0,z:0};

function nextFloor(level, x, z, y, dx, dz, length) {
  const nx=x+dx*length, nz=z+dz*length;
  const top=level.surface(nx,nz,y+.47);
  if (Math.abs(top-y)>.47 || level.blocked(nx,nz,top+.06,.07,.17)) return NaN;
  origin.x=x; origin.y=Math.max(y,top)+.15; origin.z=z;
  direction.x=dx; direction.z=dz;
  return level.visible(origin,direction,length) ? top : NaN;
}

function groundAt(level, a, dx, dz, distance) {
  let floor=a.y;
  for (let d=0; d<distance; d+=step) {
    floor=nextFloor(level,a.x+dx*d,a.z+dz*d,floor,dx,dz,Math.min(step,distance-d));
    if (!Number.isFinite(floor)) break;
  }
  return floor;
}

export function startGroundAttack(b, p, level, kind) {
  const f=b.fight, sweep=kind==='sweep';
  const a=f.ground ??= {};
  Object.assign(a,{kind,x:b.x,z:b.z,y:level.surface(b.x,b.z,b.y+.48),
    yaw:Math.atan2(p.x-b.x,p.z-b.z), reach:sweep ? 5+f.stage*.35 : 18+f.stage,
    live:false, radius:0, hit:false, revision:-1});
  b.fx=Math.sin(a.yaw); b.fz=Math.cos(a.yaw);
  return a;
}

function onAttackFloor(level,a,x,y,z,distance) {
  const dx=(x-a.x)/Math.max(.001,distance), dz=(z-a.z)/Math.max(.001,distance);
  const floor=groundAt(level,a,dx,dz,distance);
  // 栈桥下方和断崖另一侧可能具有相同的平面距离，却不在这一条地面上。
  const playerFloor=level.surface(x,z,y+.08);
  return Number.isFinite(floor) && Math.abs(floor-playerFloor)<.43 ? floor : NaN;
}

function inSweep(a,dx,dz,distance,margin) {
  if (distance>a.reach+margin) return false;
  if (distance<=margin) return true;
  const angle=Math.atan2(dx,dz)-a.yaw;
  return Math.abs(Math.atan2(Math.sin(angle),Math.cos(angle)))<=halfArc+Math.asin(margin/distance);
}

const warningRadius=t=>1.25+.18*Math.sin(t*11);
const waveHalfWidth=.23;

// 地面方向指引可用同一判定为正在显示的危险区留空。
export function bossDangerAt(f,t,level,x,y,z,margin=0) {
  if (!f) return false;
  if (f.winding && f.attack==='theme') {
    if (Math.abs(y-f.aimY)>1.7) return false;
    return Math.hypot(x-f.aimX,z-f.aimZ)<=2.2+.5*f.stage+margin ||
      f.pattern===2 && f.stage>=1 && Math.hypot(x-f.nextX,z-f.nextZ)<=2.5+margin;
  }
  const a=f.ground;
  if (!a || !(f.winding && f.attack===a.kind || a.live)) return false;
  const dx=x-a.x, dz=z-a.z, distance=Math.hypot(dx,dz);
  const overlaps=a.kind==='sweep' ? inSweep(a,dx,dz,distance,margin) :
    a.live ? Math.abs(distance-a.radius)<=waveHalfWidth+margin : distance<=warningRadius(t)+margin;
  return overlaps && Number.isFinite(onAttackFloor(level,a,x,y,z,distance));
}

export function strikeGround(b, g, p, level) {
  const f=b.fight, a=f.ground, dx=p.x-a.x, dz=p.z-a.z, distance=Math.hypot(dx,dz);
  if (a.kind==='slam') {
    a.live=true; a.started=g.time; a.previousGap=distance;
  } else if (inSweep(a,dx,dz,distance,p.radius)) {
    const floor=onAttackFloor(level,a,p.x,p.y,p.z,distance);
    if (!Number.isFinite(floor) || p.y-floor>b.height+1) return;
    const from=g.beasts.air.set(a.x,a.y+b.height*.5,a.z);
    const ray=g.beasts.line.set(dx,p.y+.8-from.y,dz), length=ray.length();
    if (level.visible(from,ray.divideScalar(Math.max(.001,length)),length)) p.hurt(15+4*f.stage,g,undefined,b);
  }
}

export function stepGroundWave(b, g, p, level) {
  const f=b.fight, a=f.ground;
  if (!a?.live) return;
  const radius=Math.min(a.reach,(g.time-a.started)*11);
  const distance=Math.hypot(p.x-a.x,p.z-a.z), gap=distance-radius;
  const band=waveHalfWidth+p.radius;
  if (!a.hit && Math.min(a.previousGap,gap)<=band && Math.max(a.previousGap,gap)>=-band && distance<=a.reach+p.radius) {
    const floor=onAttackFloor(level,a,p.x,p.y,p.z,distance);
    if (p.y-floor<.38) { p.hurt(14+4*f.stage,g,undefined,b); a.hit=true; }
  }
  a.previousGap=gap; a.radius=radius;
  if (radius>=a.reach) a.live=false;
}

// 每次前摇或门体变化时记录各条半径的通行长度与高度；行进的波纹只读取已算好的地形。
function mapGround(a,level,row) {
  const sweep=a.kind==='sweep';
  a.slices=sweep?16:slices;
  const rows=Math.ceil(a.reach/step)+1;
  const size=(a.slices+1)*rows;
  if (!a.heights || a.heights.length<size) a.heights=new Float32Array(size);
  a.rows=rows;
  if (a.revision!==level.terrainRevision) {
    a.mapped=0; a.revision=level.terrainRevision;
    for(let i=0;i<=a.slices;i++) a.heights[i*rows]=a.y;
  }
  if (row<=a.mapped) return;
  for (let i=0;i<=a.slices;i++) {
    const angle=sweep ? a.yaw-halfArc+2*halfArc*i/a.slices : 2*Math.PI*i/a.slices;
    const dx=Math.sin(angle), dz=Math.cos(angle), index=i*rows;
    let floor=a.heights[index+a.mapped];
    for (let j=a.mapped+1;j<=row;j++) {
      const d=(j-1)*step;
      if (Number.isFinite(floor)) floor=nextFloor(level,a.x+dx*d,a.z+dz*d,floor,dx,dz,Math.min(step,a.reach-d));
      a.heights[index+j]=floor;
    }
  }
  a.mapped=row;
}

// 同一组细条绘制向外扩散的圆周、挥砍外弧及两道边线，动作结束后归零。
export function drawGroundAttack(f, t, level, draw) {
  const a=f?.ground;
  if (!a || !(f.winding && f.attack===a.kind || a.live)) return;
  const sweep=a.kind==='sweep', radius=a.live ? Math.max(.15,a.radius) : sweep ? a.reach : warningRadius(t);
  const color=sweep ? 0xff8a39 : 0x43dfff;
  const row=Math.ceil(radius/step);
  mapGround(a,level,row);
  let previousX=0, previousY=NaN, previousZ=0;
  for (let i=0;i<=a.slices;i++) {
    const angle=sweep ? a.yaw-halfArc+2*halfArc*i/a.slices : 2*Math.PI*i/a.slices;
    const dx=Math.sin(angle), dz=Math.cos(angle);
    const offset=i*a.rows, y=a.heights[offset+row], x=a.x+dx*radius, z=a.z+dz*radius;
    if (Number.isFinite(y) && Number.isFinite(previousY)) draw(previousX,previousY,previousZ,x,y,z,sweep?.13:.20,color);
    previousX=x; previousY=y; previousZ=z;
    if (sweep && (i===0 || i===a.slices))
      for (let j=1;j<=row && Number.isFinite(a.heights[offset+j]);j++) {
        const d=(j-1)*step, end=Math.min(radius,j*step);
        draw(a.x+dx*d,a.heights[offset+j-1],a.z+dz*d,a.x+dx*end,a.heights[offset+j],a.z+dz*end,.13,color);
      }
  }
}
