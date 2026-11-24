// 仅对显式登记的不透明平面证明遮挡。玻璃、坡道与通行网格不参与。
const cellSize = 4;
const cellKey = (x, z) => (x + 32768) * 65536 + z + 32768;

function coveredInterval(eye, center, half, near, far, min, max) {
  const lo = center - half - eye, hi = center + half - eye;
  return eye + Math.min(lo * near, lo * far) > min + .025 &&
    eye + Math.max(hi * near, hi * far) < max - .025;
}

// 把目标包围盒透视投到一面墙上。只有整个投影落在同一实体面内部才可以省去绘制。
export function wallCovers(wall, eye, x, y, z, rx, ry, rz) {
  if (wall.active === false) return false;
  const alongX = wall.x1 - wall.x0 < wall.z1 - wall.z0;
  const eyeAxis = alongX ? eye.x : eye.z;
  const plane = alongX ? (wall.x0 + wall.x1) * .5 : (wall.z0 + wall.z1) * .5;
  const depth = plane - eyeAxis, direction = Math.sign(depth);
  const target = direction * ((alongX ? x : z) - eyeAxis), half = alongX ? rx : rz;
  const thickness = alongX ? wall.x1 - wall.x0 : wall.z1 - wall.z0;
  if (Math.abs(depth) < thickness*.5+.12 || target - half <= Math.abs(depth) + .05) return false;
  const near = Math.abs(depth) / (target + half), far = Math.abs(depth) / (target - half);
  return coveredInterval(eye.y, y, ry, near, far, wall.y0, wall.y1) &&
    (alongX
      ? coveredInterval(eye.z, z, rz, near, far, wall.z0, wall.z1)
      : coveredInterval(eye.x, x, rx, near, far, wall.x0, wall.x1));
}

export class BeastVisibility {
  constructor(THREE, options, level) {
    this.THREE = THREE;
    this.options = options;
    this.level = level;
    this.frustum = new THREE.Frustum();
    this.matrix = new THREE.Matrix4();
    this.point = new THREE.Vector3();
    this.sphere = new THREE.Sphere();
    this.eye = new THREE.Vector3();
    this.mirrors = [];
    this.cells = new Map();
    this.stats = {active:0, bodies:0, frustumRejected:0, occluded:0, reflectionKept:0, gridRebuildMs:0};
  }
  setReflectors(meshes) {
    const T = this.THREE;
    this.mirrors = meshes.map(mesh => ({
      mesh, plane:new T.Plane(), edges:Array.from({length:4}, () => new T.Plane()),
      corners:Array.from({length:4}, () => new T.Vector3()),
      normal:new T.Vector3(), center:new T.Vector3(), eye:new T.Vector3(), active:false,
    }));
  }
  begin(camera) {
    camera.updateWorldMatrix(true, false);
    this.eye.setFromMatrixPosition(camera.matrixWorld);
    this.frustum.setFromProjectionMatrix(this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    this.stats.gridRebuildMs = 0;
    this.stats.active = this.stats.bodies = this.stats.frustumRejected = this.stats.occluded = this.stats.reflectionKept = 0;
    if (!this.options.enabled) return;
    const cx = Math.floor(this.eye.x / cellSize), cz = Math.floor(this.eye.z / cellSize);
    if (cx !== this.cx || cz !== this.cz || this.revision !== this.level.terrainRevision) {
      this.cx = cx; this.cz = cz; this.revision = this.level.terrainRevision;
      this.cells.clear();
    }
    // 镜中可见、主视图外的物体也要保留。根据当前视点重新建立镜面开口的四个侧面。
    for (const m of this.mirrors) {
      const mesh = m.mesh;
      m.active = false;
      if (!mesh.visible) continue;
      mesh.updateWorldMatrix(true, false);
      if (!this.frustum.intersectsObject(mesh)) continue;
      m.center.setFromMatrixPosition(mesh.matrixWorld);
      m.normal.set(0, 0, 1).transformDirection(mesh.matrixWorld);
      m.plane.setFromNormalAndCoplanarPoint(m.normal, m.center);
      const distance = m.plane.distanceToPoint(this.eye);
      if (distance <= 0) continue;
      m.active = true;
      m.eye.copy(this.eye).addScaledVector(m.normal, -2 * distance);
      const g = mesh.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const { min, max } = g.boundingBox;
      for (let i = 0; i < 4; i++)
        m.corners[i].set(i === 1 || i === 2 ? max.x : min.x, i < 2 ? min.y : max.y, 0).applyMatrix4(mesh.matrixWorld);
      for (let i = 0; i < 4; i++) {
        const side = m.edges[i].setFromCoplanarPoints(m.eye, m.corners[i], m.corners[(i+1)%4]);
        if (side.distanceToPoint(m.center) < 0) side.negate();
      }
    }
  }
  candidates(x, z) {
    const tx = Math.floor(x / cellSize), tz = Math.floor(z / cellSize);
    const key = cellKey(tx, tz);
    let walls = this.cells.get(key);
    if (!walls) {
      const start = performance.now();
      const x0 = Math.min(tx, this.cx) * cellSize, x1 = (Math.max(tx, this.cx) + 1) * cellSize;
      const z0 = Math.min(tz, this.cz) * cellSize, z1 = (Math.max(tz, this.cz) + 1) * cellSize;
      walls = this.level.viewOccluders.filter(w => w.x1 >= x0 && w.x0 <= x1 && w.z1 >= z0 && w.z0 <= z1);
      this.cells.set(key, walls);
      this.stats.gridRebuildMs += performance.now() - start;
    }
    return walls;
  }
  visible(x, y, z, rx, ry, rz, body = false) {
    if (!this.options.enabled) return true;
    const s = this.sphere;
    s.center.set(x, y, z);
    s.radius = Math.sqrt(rx*rx + ry*ry + rz*rz);
    const inView = this.frustum.intersectsSphere(s);
    if (inView) {
      const range = s.center.distanceToSquared(this.eye);
      if (!this.options.occlusion || !this.level.viewOccluders.length ||
        range <= (3+s.radius)**2 || range >= this.options.occlusionRange**2) return true;
      let blocked = false;
      for (const wall of this.candidates(x, z)) {
        if (wallCovers(wall, this.eye, x, y, z, rx, ry, rz)) { blocked = true; break; }
      }
      if (!blocked) return true;
    }
    for (const m of this.mirrors) {
      if (!m.active) continue;
      this.point.set(x,y,z);
      const d = m.plane.distanceToPoint(this.point);
      if (d < -s.radius || m.edges[0].distanceToPoint(this.point) < -s.radius ||
        m.edges[1].distanceToPoint(this.point) < -s.radius || m.edges[2].distanceToPoint(this.point) < -s.radius ||
        m.edges[3].distanceToPoint(this.point) < -s.radius) continue;
      s.center.copy(this.point).addScaledVector(m.normal, -2*d);
      if (this.frustum.intersectsSphere(s)) {
        if (body) this.stats.reflectionKept++;
        return true;
      }
    }
    if (body) {
      if (inView) this.stats.occluded++;
      else this.stats.frustumRejected++;
    }
    return false;
  }
  prepareBodies(pool, footprints) {
    for (const b of pool) {
      if (!b.active) continue;
      this.stats.active++;
      b.submitBody = true;
      if (this.options.enabled && b.type !== 3) {
        const f = footprints[b.type];
        // 包含转身、呼吸、前摇和头尾附件，攀壁时再给侧翻留足空间。
        const r = (f.radialExtent ??= Math.hypot(f.x, f.z)) * b.scale;
        const lean = Math.abs(Math.sin(b.surfaceRoll)) * b.height;
        const padding = .65 * b.scale + lean;
        const width = r + b.height * .24 + padding;
        b.submitBody = this.visible(b.x, b.y+b.height*.5, b.z,
          width, b.height*.53 + r*.3 + padding, width, true);
      }
      if (b.submitBody) this.stats.bodies++;
    }
  }
}
