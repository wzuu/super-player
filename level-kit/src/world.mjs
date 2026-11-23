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
  ray(origin, direction, limit) {
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
          if (item.mark === mark || item.active === false) continue;
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
      this.near = [];
      this.spawn = new V3();
      this.gate = new V3();
      this.bossAnchor = new V3();
      this.bossSpawn = new V3();
      this.spawnYaw = definition.spawnYaw ?? 0;
      this.spawnPitch = definition.spawnPitch ?? -0.012;
      this.sites = [];
      this.terrainRevision = 0;
    }
    box(x, z, width, depth, low, high, climb = false) {
      const b = { x0: x - width / 2, x1: x + width / 2, z0: z - depth / 2, z1: z + depth / 2,
        y0: low, y1: high, climb, mark: 0 };
      this.solids.push(b);
      this.hash.insert(b);
      return b;
    }
    base(x, z) { return definition.terrain?.ground?.(x, z) ?? 0; }
    ramp(x, z) { return definition.terrain?.ramp?.(x, z) ?? 0; }
    movementScale(x, z, y, game) { return definition.terrain?.moveScale?.(x, z, y, game) ?? 1; }
    inSafeZone(x, z, margin = 0) {
      return definition.inSafeZone?.(x, z, this.spawn, margin) ??
        Math.hypot(x - this.spawn.x, z - this.spawn.z) < CONFIG.player.safeRadius + margin;
    }
    surface(x, z, ceiling = Infinity) {
      let floor = this.base(x, z);
      const ramp = this.ramp(x, z);
      if (ramp && ramp <= ceiling) floor = Math.max(floor, ramp);
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
    foot(x, z, ceiling, radius) {
      let floor = this.surface(x, z, ceiling);
      const edge = radius + 0.021;
      floor = Math.max(floor, this.surface(x - edge, z, ceiling), this.surface(x + edge, z, ceiling));
      return Math.max(floor, this.surface(x, z - edge, ceiling), this.surface(x, z + edge, ceiling));
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

  class Navigation {
    constructor(level) {
      this.level = level;
      this.cell = CONFIG.map.navCell;
      this.width = Math.ceil(GRID.halfX * 2 / this.cell);
      this.height = Math.ceil(GRID.halfZ * 2 / this.cell);
      const count = this.width * this.height;
      this.walkable = new Uint8Array(count);
      this.dist = new Int32Array(count);
      this.queue = new Int32Array(count);
      for (let i = 0; i < count; i++) {
        const x = this.x(i), z = this.z(i);
        const y = level.surface(x, z, level.base(x, z) + 0.50);
        this.walkable[i] = !level.blocked(x, z, y, 0.52, 1.64);
        if (this.walkable[i] && i % 7 === 2) level.sites.push(i);
      }
      this.target = -1;
      this.terrainRevision = -1;
      this.routes = definition.terrain?.routeOpen ? new Uint8Array(count) : this.walkable;
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
      if (routes !== this.walkable && this.terrainRevision !== this.level.terrainRevision) {
        this.terrainRevision = this.level.terrainRevision;
        this.target = -1;
        for (let i = 0; i < routes.length; i++) {
          routes[i] = this.walkable[i] && definition.terrain.routeOpen(this.x(i), this.z(i), this.level);
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
        if (routes[left] && this.dist[left] < 0) { this.dist[left] = d; this.queue[count++] = left; }
        if (routes[right] && this.dist[right] < 0) { this.dist[right] = d; this.queue[count++] = right; }
        if (routes[up] && this.dist[up] < 0) { this.dist[up] = d; this.queue[count++] = up; }
        if (routes[down] && this.dist[down] < 0) { this.dist[down] = d; this.queue[count++] = down; }
      }
    }
    next(x, z) {
      const i = this.index(x, z), n = this.width;
      let best = i, cost = this.dist[i] < 0 ? Infinity : this.dist[i];
      const left = i % n > 0 ? i - 1 : -1;
      const right = i % n < n - 1 ? i + 1 : -1;
      for (const candidate of [left, right, i - n, i + n]) {
        const d = this.dist[candidate];
        if (d >= 0 && d < cost) { best = candidate; cost = d; }
      }
      return best;
    }
  }

  return { Level, Navigation };
}
