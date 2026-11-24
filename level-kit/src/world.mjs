// xz 空间哈希。静态掩体和每帧更新的凶兽使用同一套桶与射线遍历。
export class SpatialHash {
  constructor(size) {
    this.size = size;
    this.buckets = new Map();
    this.visited = 0;
    this.used = [];
  }
  key(x, z) { return x + z * 4096; }
  insert(item) {
    const s = this.size;
    for (let z = Math.floor(item.z0 / s); z <= Math.floor(item.z1 / s); z++) {
      for (let x = Math.floor(item.x0 / s); x <= Math.floor(item.x1 / s); x++) {
        const k = this.key(x, z);
        let list = this.buckets.get(k);
        if (!list) this.buckets.set(k, list = []);
        if (!list.length) this.used.push(list);
        list.push(item);
      }
    }
  }
  clear() {
    for (const list of this.used) list.length = 0;
    this.used.length = 0;
  }
  query(x0, z0, x1, z1, out) {
    out.length = 0;
    const mark = ++this.visited;
    const s = this.size;
    for (let z = Math.floor(z0 / s); z <= Math.floor(z1 / s); z++) {
      for (let x = Math.floor(x0 / s); x <= Math.floor(x1 / s); x++) {
        const list = this.buckets.get(this.key(x, z));
        if (!list) continue;
        for (const item of list) {
          if (item.mark === mark) continue;
          item.mark = mark;
          out.push(item);
        }
      }
    }
    return out;
  }
  ray(origin, direction, limit, ignore = null) {
    const s = this.size;
    let x = Math.floor(origin.x / s), z = Math.floor(origin.z / s);
    const sx = Math.sign(direction.x), sz = Math.sign(direction.z);
    let tx = sx ? ((x + (sx > 0 ? 1 : 0)) * s - origin.x) / direction.x : Infinity;
    let tz = sz ? ((z + (sz > 0 ? 1 : 0)) * s - origin.z) / direction.z : Infinity;
    const dx = sx ? Math.abs(s / direction.x) : Infinity;
    const dz = sz ? Math.abs(s / direction.z) : Infinity;
    const mark = ++this.visited;
    let hit = null, depth = limit, entered = 0;
    while (entered <= depth) {
      const list = this.buckets.get(this.key(x, z));
      if (list) {
        for (const item of list) {
          if (item === ignore || item.mark === mark || item.active === false) continue;
          item.mark = mark;
          const distance = rayBox(origin, direction, item);
          if (distance < depth) { depth = distance; hit = item; }
        }
      }
      if (tx < tz) { entered = tx; tx += dx; x += sx; }
      else { entered = tz; tz += dz; z += sz; }
    }
    this.depth = depth;
    return hit;
  }
}

export function rayBox(o, d, box) {
  let near = 0, far = Infinity;
  if (Math.abs(d.x) < 1e-8) {
    if (o.x < box.x0 || o.x > box.x1) return Infinity;
  } else {
    const a = (box.x0 - o.x) / d.x, b = (box.x1 - o.x) / d.x;
    near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
  }
  if (Math.abs(d.y) < 1e-8) {
    if (o.y < box.y0 || o.y > box.y1) return Infinity;
  } else {
    const a = (box.y0 - o.y) / d.y, b = (box.y1 - o.y) / d.y;
    near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
  }
  if (Math.abs(d.z) < 1e-8) {
    if (o.z < box.z0 || o.z > box.z1) return Infinity;
  } else {
    const a = (box.z0 - o.z) / d.z, b = (box.z1 - o.z) / d.z;
    near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
  }
  return far >= near ? near : Infinity;
}

// 二维地图允许矩形。原点始终位于场景中央，行号沿 z 轴递增。
export function createGrid(source, cell) {
  if (!Array.isArray(source) || !source.length) throw new TypeError('关卡需要二维地图');
  const cells = source.map(row => typeof row === 'string' ? Array.from(row) : [...row]);
  const rows = cells.length, columns = cells[0].length;
  if (!columns || cells.some(row => row.length !== columns)) throw new RangeError('地图每行必须等宽');
  const halfX = columns * cell / 2, halfZ = rows * cell / 2;
  return {
    cells, rows, columns, halfX, halfZ, cell,
    x: column => (column + 0.5) * cell - halfX,
    z: row => (row + 0.5) * cell - halfZ,
  };
}

export function createWorld({ CONFIG, GRID, V3, clamp, definition }) {
  class Level {
    constructor() {
      this.hash = new SpatialHash(CONFIG.map.hash);
      this.solids = [];
      this.viewOccluders = [];
      this.near = [];
      this.spawn = new V3();
      this.gate = new V3();
      this.bossAnchor = new V3();
      this.bossSpawn = new V3();
      this.spawnYaw = definition.spawnYaw ?? 0;
      this.spawnPitch = definition.spawnPitch ?? -0.012;
      this.sites = [];
      this.terrainRevision = 0;
      this.globalTerrainRevision = 0;
      this.barrierChanges = new Map();
    }
    box(x, z, width, depth, low, high, climb = false) {
      const b = { x0: x - width / 2, x1: x + width / 2, z0: z - depth / 2, z1: z + depth / 2,
        y0: low, y1: high, climb, mark: 0 };
      this.solids.push(b);
      this.hash.insert(b);
      return b;
    }
    setBarrier(barrier, mesh, closed) {
      if (mesh) mesh.visible = closed;
      if ((barrier.active !== false) === closed) return;
      barrier.active = closed;
      this.terrainRevision++;
      this.barrierChanges.set(barrier,this.terrainRevision);
    }
    terrainChanged() {
      this.globalTerrainRevision = ++this.terrainRevision;
    }
    base(x, z) {
      const base=definition.terrain?.ground?.(x,z)??0;
      const extra=this.extraGround?.(x,z);
      return extra>0 ? Math.max(base,extra) : base;
    }
    ramp(x, z) { return definition.terrain?.ramp?.(x, z) ?? 0; }
    movementScale(x, z, y, game) { return definition.terrain?.moveScale?.(x, z, y, game) ?? 1; }
    inSafeZone(x, z, margin = 0) {
      return definition.inSafeZone?.(x, z, this.spawn, margin) ??
        Math.hypot(x - this.spawn.x, z - this.spawn.z) < CONFIG.player.safeRadius + margin;
    }
    terrainFloor(x, z, ceiling) {
      const floor = this.base(x, z);
      const ramp = this.ramp(x, z);
      return ramp && ramp <= ceiling ? Math.max(floor, ramp) : floor;
    }
    surface(x, z, ceiling = Infinity) {
      let floor = this.terrainFloor(x, z, ceiling);
      const list = this.hash.query(x, z, x, z, this.near);
      for (const b of list) {
        if (b.active !== false && b.climb && b.y1 <= ceiling && b.y1 > floor && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) floor = b.y1;
      }
      return floor;
    }
    blocked(x, z, y, radius, height) {
      if (x - radius <= -GRID.halfX || z - radius <= -GRID.halfZ || x + radius >= GRID.halfX || z + radius >= GRID.halfZ) return true;
      const list = this.hash.query(x - radius, z - radius, x + radius, z + radius, this.near);
      for (const b of list) {
        if (b.active === false) continue;
        if (x + radius > b.x0 && x - radius < b.x1 && z + radius > b.z0 && z - radius < b.z1 &&
            y + height > b.y0 + 0.025 && y < b.y1 - 0.025) return true;
      }
      return false;
    }
    pickupSite(x,z,y,player,nav) {
      nav.rebuild(player.x,player.z);
      for (let i=0;i<113;i++) {
        const r=.48*Math.sqrt(i),a=i*2.399963;
        const px=x+r*Math.cos(a),pz=z+r*Math.sin(a),top=this.surface(px,pz,y+.48);
        const ground=this.surface(px,pz,this.base(px,pz)+.5);
        // 双层通道的二维路径场只证明地面连通。高台先检查玩家能否沿当前层直接走到落点。
        if(top>ground+.5 && Math.abs(top-player.y)<.65) {
          const n=Math.max(1,Math.ceil(Math.hypot(px-player.x,pz-player.z)/.45));
          let accessible=true;
          for(let j=1;j<=n;j++) {
            const tx=player.x+(px-player.x)*j/n,tz=player.z+(pz-player.z)*j/n;
            if(Math.abs(this.surface(tx,tz,top+.46)-top)>.46 || this.blocked(tx,tz,top,CONFIG.player.radius,CONFIG.player.height)) {accessible=false;break;}
          }
          if(accessible)return {x:px,y:top,z:pz};
        }
        if(nav.dist[nav.index(px,pz)]>=0 && !this.blocked(px,pz,ground,CONFIG.player.radius,CONFIG.player.height))
          return {x:px,y:ground,z:pz};
      }
      return {x:player.x,y:this.surface(player.x,player.z,player.y+.48),z:player.z};
    }
    foot(x, z, ceiling, radius) {
      let floor = this.surface(x, z, ceiling);
      const edge = radius + 0.021;
      floor = Math.max(floor, this.surface(x - edge, z, ceiling), this.surface(x + edge, z, ceiling));
      return Math.max(floor, this.surface(x, z - edge, ceiling), this.surface(x, z + edge, ceiling));
    }
    playerFloor(x, z, ceiling, radius, solidCeiling) {
      const edge = radius + 0.021;
      let floor = Math.max(this.terrainFloor(x,z,ceiling), this.terrainFloor(x-edge,z,ceiling),
        this.terrainFloor(x+edge,z,ceiling), this.terrainFloor(x,z-edge,ceiling), this.terrainFloor(x,z+edge,ceiling));
      // 与水平碰撞共用矩形足迹。只取十字上的点会让斜角悬空，落进实体后四个方向都不能动。
      const list = this.hash.query(x-edge,z-edge,x+edge,z+edge,this.near);
      for (const b of list) {
        if (b.active === false || b.y1 <= floor || b.y1 > (b.climb ? ceiling : solidCeiling)) continue;
        if (x+edge > b.x0 && x-edge < b.x1 && z+edge > b.z0 && z-edge < b.z1) floor = b.y1;
      }
      return floor;
    }
    canEnter(body, x, z, y) {
      return definition.terrain?.canEnter?.(body, x, z, y, this) ?? true;
    }
    move(body, dx, dz, step) {
      const startX = body.x, startZ = body.z;
      // 先沿 x 再沿 z，墙角阻止其中一轴时仍可沿另一轴滑动。
      const nextX = body.x + dx;
      const fx = this.foot(nextX, body.z, body.y + step, body.radius);
      const moveY = Math.max(body.y, fx);
      if (fx <= body.y + step + 0.025 && !this.blocked(nextX, body.z, moveY, body.radius, body.height) &&
          this.canEnter(body, nextX, body.z, moveY)) {
        body.x = nextX;
        body.y = moveY;
      }
      const nextZ = body.z + dz;
      const fz = this.foot(body.x, nextZ, body.y + step, body.radius);
      const moveY2 = Math.max(body.y, fz);
      if (fz <= body.y + step + 0.025 && !this.blocked(body.x, nextZ, moveY2, body.radius, body.height) &&
          this.canEnter(body, body.x, nextZ, moveY2)) {
        body.z = nextZ;
        body.y = moveY2;
      }
      return Math.abs(startX - body.x) + Math.abs(startZ - body.z);
    }
    visible(origin, direction, distance) {
      return !this.hash.ray(origin, direction, distance);
    }
    area(x, z, y = 0) { return definition.area?.(x, z, this, y) ?? '探索区域'; }
  }

  class RouteField {
    constructor(level, body, collectSites, checkEdges = false) {
      this.level = level;
      this.body = body;
      this.cell = CONFIG.map.navCell;
      this.width = Math.ceil(GRID.halfX * 2 / this.cell);
      this.height = Math.ceil(GRID.halfZ * 2 / this.cell);
      const count = this.width * this.height;
      this.walkable = new Uint8Array(count);
      this.floors = checkEdges ? new Float32Array(count) : null;
      this.dist = new Int32Array(count);
      this.queue = new Int32Array(count);
      for (let i = 0; i < count; i++) {
        const x = this.x(i), z = this.z(i);
        const y = this.ground(x, z, i);
        this.walkable[i] = !level.blocked(x, z, y, body.radius, body.height);
        if (collectSites && i % 7 === 2 && (definition.allowSpawnSite?.(x, z) ?? true)) level.sites.push(i);
      }
      this.target = -1;
      this.terrainRevision = -1;
      this.routes = definition.terrain?.routeOpen ? new Uint8Array(count) : this.walkable;
      this.edges = checkEdges ? new Uint8Array(count) : null;
    }
    ground(x, z, i) {
      const ceiling = this.level.base(x,z) + .50;
      // 移动按四足支撑高度站在矮台边缘；AI 路线和出生净空必须使用同一落脚高度。
      const floor=this.level.foot(x,z,ceiling,this.body.radius);
      if (this.floors) this.floors[i]=floor;
      return floor;
    }
    canWalk(a,b,profile=this.body) {
      const samples = Math.max(1, Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/(profile.radius*.8)));
      const body = { x:a.x, y:a.y, z:a.z, radius:profile.radius, height:profile.height };
      const allowed = definition.terrain?.routeOpen;
      let open = allowed?.(a.x,a.z,this.level) ?? true;
      for (let j=1; j<=samples; j++) {
        const x=a.x+(b.x-a.x)*j/samples, z=a.z+(b.z-a.z)*j/samples;
        const floor=this.level.foot(x,z,body.y+profile.step,body.radius);
        const nextOpen = allowed?.(x,z,this.level) ?? true;
        // 玩家可以走出脚下刚刚上涨的岩浆，但导航不能把开放路段拉直成穿越禁行带的近路。
        // 水平移动逐轴结算。斜线掠过沟道拐角时，两个端点都可能在干地上。
        if ((open && !nextOpen) || (definition.terrain?.canEnter &&
            (!this.level.canEnter(body,x,z,floor) || !this.level.canEnter(body,x,body.z,floor) ||
             !this.level.canEnter(body,body.x,z,floor))) ||
            Math.abs(floor-body.y)>profile.step+.025 || this.level.blocked(x,z,floor,body.radius,body.height)) return false;
        body.x=x;body.z=z;body.y=floor;
        open=nextOpen;
      }
      return Math.abs(body.y-b.y)<.65;
    }
    x(i) { return (i % this.width + 0.5) * this.cell - GRID.halfX; }
    z(i) { return (Math.floor(i / this.width) + 0.5) * this.cell - GRID.halfZ; }
    index(x, z) {
      const row = clamp(Math.floor((z + GRID.halfZ) / this.cell), 0, this.height - 1);
      const column = clamp(Math.floor((x + GRID.halfX) / this.cell), 0, this.width - 1);
      return row * this.width + column;
    }
    rebuild(x, z) {
      const routes = this.routes;
      if (this.terrainRevision !== this.level.terrainRevision) {
        const dirty = this.edges && this.terrainRevision >= this.level.globalTerrainRevision ? new Set() : null;
        const changed = i => {
          if (!dirty) return;
          dirty.add(i);
          if (i % this.width) dirty.add(i-1);
          if (i >= this.width) dirty.add(i-this.width);
        };
        // 门体可能在寻路场创建之后加入。只重新采样门体周边各体型能通过的格子。
        for (const [box, revision] of this.level.barrierChanges) {
          if (revision <= this.terrainRevision) continue;
          const {radius,height}=this.body, a=this.index(box.x0-radius,box.z0-radius), b=this.index(box.x1+radius,box.z1+radius);
          const width=b%this.width-a%this.width;
          for(let row=a;row<=b;row+=this.width) for(let col=0;col<=width;col++) {
            const i=row+col, x=this.x(i), z=this.z(i);
            const y=this.ground(x,z,i);
            this.walkable[i]=!this.level.blocked(x,z,y,radius,height);
            changed(i);
          }
        }
        this.target = -1;
        this.terrainRevision = this.level.terrainRevision;
        if (routes !== this.walkable) for (let i = 0; i < routes.length; i++) {
          const open = Number(Boolean(this.walkable[i] && definition.terrain.routeOpen(this.x(i), this.z(i), this.level)));
          if (routes[i] !== open) changed(i);
          routes[i] = open;
        }
        if (this.edges) {
          // 隔墙可能正好横跨两个可站立格之间。玩家路标同时检查边界处的净空。
          for (const i of dirty ?? routes.keys()) {
            const x = this.x(i), z = this.z(i);
            for (const [j, bit, reverse] of [[i + 1, 2, 1], [i + this.width, 8, 4]]) {
              if (j >= routes.length || (bit === 2 && j % this.width === 0)) continue;
              this.edges[i] &= ~bit;
              this.edges[j] &= ~reverse;
              if (!routes[i] || !routes[j]) continue;
              if (this.canWalk({x,y:this.floors[i],z}, {x:this.x(j),y:this.floors[j],z:this.z(j)})) {
                this.edges[i] |= bit;
                this.edges[j] |= reverse;
              }
            }
          }
        }
      }
      let start = this.index(x, z);
      if (!routes[start]) {
        let best = Infinity;
        for (let dz = -3; dz <= 3; dz++) {
          for (let dx = -3; dx <= 3; dx++) {
            const i = this.index(x + dx * this.cell, z + dz * this.cell);
            if (routes[i] && dx * dx + dz * dz < best) { best = dx * dx + dz * dz; start = i; }
          }
        }
      }
      if (this.target === start) return;
      this.target = start;
      this.dist.fill(-1);
      this.connected = 0;
      if (!routes[start]) return;
      this.dist[start] = 0;
      this.queue[0] = start;
      let head = 0, count = 1;
      const n = this.width;
      while (head < count) {
        const i = this.queue[head++], d = this.dist[i] + 1;
        const left = i % n > 0 ? i - 1 : -1;
        const right = i % n < n - 1 ? i + 1 : -1;
        const up = i - n, down = i + n;
        const edges = this.edges ? this.edges[i] : 15;
        if ((edges & 1) && routes[left] && this.dist[left] < 0) { this.dist[left] = d; this.queue[count++] = left; }
        if ((edges & 2) && routes[right] && this.dist[right] < 0) { this.dist[right] = d; this.queue[count++] = right; }
        if ((edges & 4) && routes[up] && this.dist[up] < 0) { this.dist[up] = d; this.queue[count++] = up; }
        if ((edges & 8) && routes[down] && this.dist[down] < 0) { this.dist[down] = d; this.queue[count++] = down; }
      }
      this.connected = count;
    }
    next(x, z) {
      const i = this.index(x, z), n = this.width;
      let best = i, cost = this.dist[i] < 0 ? Infinity : this.dist[i];
      const left = i % n > 0 ? i - 1 : -1;
      const right = i % n < n - 1 ? i + 1 : -1;
      const edges = this.edges ? this.edges[i] : 15;
      for (const candidate of [(edges & 1) ? left : -1, (edges & 2) ? right : -1, (edges & 4) ? i-n : -1, (edges & 8) ? i+n : -1]) {
        const d = this.dist[candidate];
        if (d >= 0 && d < cost) { best = candidate; cost = d; }
      }
      return best;
    }
  }

  // 每种体型共享自己的目标距离场。同一格内移动不会重复计算路径。
  class Navigation extends RouteField {
    playerRoute() { return new RouteField(this.level, CONFIG.player, false, true); }
    routeFor(type, checked = false, scale = 1) {
      const stats = CONFIG.beasts.types[type];
      const body = checked ? {radius:stats.radius*scale,height:stats.height*scale,step:.47} : stats;
      return new RouteField(this.level, body, false, checked);
    }
    constructor(level) {
      const types = CONFIG.beasts.types;
      super(level, types[0], true);
      this.fields = [this, ...types.slice(1).map(body => new RouteField(level, body, false))];
    }
    rebuild(x, z) {
      super.rebuild(x, z);
      for (let type = 1; type < this.fields.length; type++) this.fields[type].rebuild(x, z);
    }
  }

  return { Level, Navigation };
}
