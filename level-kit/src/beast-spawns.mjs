import {SpatialHash} from '@level-kit/world.mjs';

function footprint(model, radius, height, scale, angle) {
  const c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle));
  return {rx:Math.max(radius, (model.x*c + model.z*s)*scale),
    rz:Math.max(radius, (model.x*s + model.z*c)*scale), height};
}

function box(x, y, z, shape) {
  return {x0:x-shape.rx, x1:x+shape.rx, y0:y, y1:y+shape.height,
    z0:z-shape.rz, z1:z+shape.rz, mark:0};
}

function overlaps(a, b) {
  return b.active !== false && a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1-.025 &&
    a.y1 > b.y0+.025 && a.z0 < b.z1 && a.z1 > b.z0;
}

// 每个锚点共享一份依距离排序的网格。拥挤时沿当前可达区域扩展，玩家净距始终固定。
function orderedCells(field, anchor) {
  const cells = Array.from({length:field.dist.length}, (_, i) => i);
  if (anchor) {
    const distance = Float32Array.from(cells, i => (field.x(i)-anchor.x)**2 + (field.z(i)-anchor.z)**2);
    cells.sort((a,b) => distance[a]-distance[b]);
  } else {
    for (let i=cells.length-1; i>0; i--) {
      const j = Math.floor(Math.random()*(i+1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
  }
  return cells;
}

function reachableField(field, target, playerProfile, required) {
  field.rebuild(target.x,target.z);
  const floor=field.level.foot(target.x,target.z,(target.y ?? field.level.base(target.x,target.z))+.47,playerProfile.radius);
  const start={x:target.x,y:floor,z:target.z};
  const canApproach = i => field.canWalk(start,{x:field.x(i),y:field.floors[i],z:field.z(i)},playerProfile);
  if (field.connected>=required && canApproach(field.target)) return true;
  // 玩家可能站在重甲体型进不去的窄门里。选玩家确实能从门内走到的接敌点，避免投到隔墙另一侧。
  let chosen=field.connected && canApproach(field.target) ? field.target : -1;
  let best=chosen<0 ? 0 : field.connected;
  for (let r=1;r<=3;r++) for(let dz=-r;dz<=r;dz++) for(let dx=-r;dx<=r;dx++) {
    if (Math.max(Math.abs(dx),Math.abs(dz))!==r) continue;
    const i=field.index(start.x+dx*field.cell,start.z+dz*field.cell);
    if (!field.routes[i] || !canApproach(i)) continue;
    field.rebuild(field.x(i),field.z(i));
    if (field.connected>best) {chosen=i;best=field.connected;}
    if (best>=required) {field.rebuild(field.x(chosen),field.z(chosen));return true;}
  }
  if (chosen<0) return false;
  field.rebuild(field.x(chosen),field.z(chosen));
  return true;
}

export function planBeastGroup(manager, entries, options, config, allowSite) {
  if (!entries.length || entries.length > manager.pool.length-manager.live) return [];
  const {level,footprints} = manager, player = manager.currentGame.player;
  const {anchors=[], target=player, accept, safeDistance=config.beasts.safeSpawnGap} = options;
  const occupied = new SpatialHash(config.map.hash), near = [];
  for (const b of manager.pool) if (b.active) {
    const model = footprints[b.rage && b.type===3 ? manager.rageBatch : b.type];
    occupied.insert(box(b.x,b.y,b.z,footprint(model,b.radius,b.height,b.scale,b.yaw)));
  }
  const orders = new Map(), fields = new Map(), sites = [];
  const travelFields=manager.spawnTravelFields ??= new Map();
  let bossApproach;
  for (const [index, entry] of entries.entries()) {
    const type = entry.type, stats = config.beasts.types[type];
    const anchor = entry.anchor ?? anchors[index%anchors.length];
    const scale = entry.traits?.affixes ? 1.25 : 1;
    const key = type+':'+scale;
    let field = fields.get(key);
    if (!field) {
      field = manager.spawnFields.get(key);
      if (!field) {
        field = manager.nav.routeFor(type,true,scale);
        manager.spawnFields.set(key,field);
      }
      let destination=target;
      if (type===3 && anchor) {
        // 环站等低舱室的母体只在高厅战斗：玩家必须能亲自步行到厅内，首领只须在该厅可通行。
        bossApproach=manager.spawnPlayerRoute ??= manager.nav.playerRoute();
        // 普通开局的气闸可由玩家打开，已配置的门外集结点只用于这个开局。
        const from=options.bossApproachFrom ?? player;
        if (!reachableField(bossApproach,from,config.player,24)) return [];
        const i=bossApproach.index(anchor.x,anchor.z);
        if (bossApproach.dist[i]>=0)
          destination=anchor;
      }
      if (!reachableField(field,destination,config.player,Math.max(entries.length,24))) return [];
      // 出生使用按实际大小验证过每条边的图；寻路还须能从该格进入正式 AI 所用的方向场。
      let travel=travelFields.get(type);
      if (!travel) {
        travel=manager.nav.routeFor(type);
        travelFields.set(type,travel);
      }
      travel.rebuild(destination.x,destination.z);
      field.spawnTravel=travel;
      fields.set(key,field);
    }
    let angle = entry.angle ?? Math.random()*2*Math.PI;
    let shape = footprint(footprints[type],stats.radius*scale,stats.height*scale,scale,angle);
    function trySite(x,z,i,ceiling) {
      if (field.dist[i]<0 || field.spawnTravel.dist[i]<0 || (allowSite && !allowSite(x,z)) ||
          level.inSafeZone(x,z,Math.max(shape.rx,shape.rz))) return false;
      if (type===3 && bossApproach && bossApproach.dist[i]<0) return false;
      const gap = Math.hypot(Math.max(0,Math.abs(x-player.x)-shape.rx), Math.max(0,Math.abs(z-player.z)-shape.rz));
      if (gap < safeDistance+player.radius) return false;
      const cx=field.x(i), cz=field.z(i), ground=field.floors[i];
      const y = ceiling===undefined ? ground : level.foot(x,z,ceiling+.47,field.body.radius);
      const site = {x,y,z,type,angle,traits:entry.traits};
      if (accept && !accept(site,index)) return false;
      const bounds = box(x,y,z,shape);
      const halfX = -field.x(0)+field.cell/2, halfZ = -field.z(0)+field.cell/2;
      if (bounds.x0<=-halfX || bounds.x1>=halfX || bounds.z0<=-halfZ || bounds.z1>=halfZ) return false;
      if (level.hash.query(bounds.x0,bounds.z0,bounds.x1,bounds.z1,near).some(b=>overlaps(bounds,b))) return false;
      if (occupied.query(bounds.x0,bounds.z0,bounds.x1,bounds.z1,near).some(b=>overlaps(bounds,b))) return false;
      if (ceiling!==undefined && !field.canWalk({x:cx,y:ground,z:cz},site) &&
          !(Math.abs(target.y-y)<.65 && field.canWalk(target,site))) return false;
      if (type===3 && bossApproach && !bossApproach.canWalk({x:cx,y:bossApproach.floors[i],z:cz},site)) return false;
      occupied.insert(bounds);
      sites.push(site);
      return true;
    }
    if (anchor && trySite(anchor.x,anchor.z,field.index(anchor.x,anchor.z),anchor.y ?? level.base(anchor.x,anchor.z))) continue;
    let order = orders.get(anchor);
    if (!order) {
      order = orderedCells(field,anchor);
      orders.set(anchor,order);
    }
    let found=false;
    for (const i of order) {
      if (trySite(field.x(i),field.z(i),i)) {found=true;break;}
    }
    // 窄道还可沿墙朝向、在相邻格心之间排布；仍须通过相同的足底、门禁和净距校验。
    if (!found) {
      const d = field.cell*.34;
      for (const yaw of entry.angle===undefined ? [0,Math.PI/2] : [entry.angle]) {
        angle=yaw;
        shape=footprint(footprints[type],stats.radius*scale,stats.height*scale,scale,yaw);
        for (const i of order) {
          if (field.dist[i]<0) continue;
          const x=field.x(i),z=field.z(i);
          if (trySite(x,z,i) || trySite(x-d,z,i,field.floors[i]) || trySite(x+d,z,i,field.floors[i]) ||
              trySite(x,z-d,i,field.floors[i]) || trySite(x,z+d,i,field.floors[i])) {found=true;break;}
        }
        if (found) break;
      }
    }
    if (!found) return []; // 完整规划之前没有写入池、任务标记、击杀和收益。
  }
  return sites;
}
