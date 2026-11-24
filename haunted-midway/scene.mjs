import { Reflector } from 'three/addons/objects/Reflector.js';

const TAU = Math.PI * 2;
const PINK = 0xff5e9e,
  AQUA = 0x59efea,
  GOLD = 0xffc26b,
  IRON = 0x343243;
const CONFIG = {
  map: { cell: 4, fog: 0.014 },
  graphics: { maxPixelRatio: 1.15, mirrorSize: 192 },
  beasts: {
    capacity: 120,
    types: [
      { hp: 62 },
      { hp: 165 },
      { hp: 92, projectileSpeed: 12, projectileGravity: 7.4, hazardLife: 0 },
      { hp: 840, summonCount: 7 },
    ],
  },
  rides: {
    first: 35,
    period: 45,
    warning: 3,
    carouselDuration: 8,
    trainDuration: 5,
    playerDamage: 13,
    enemyDamage: 82,
    cooldown: 1.25,
    rotation: 1.52,
  },
};
const GRID = [
  '#########################',
  '#.......................#',
  '#....B.............B....#',
  '#.........S...S.........#',
  '#.......................#',
  '#.........S...S.........#',
  '#.......................#',
  '#.......................#',
  '#.......................#',
  '#......B................#',
  '#.......................#',
  '#.......................#',
  '#.......................#',
  '#.......................#',
  '#.......................#',
  '#.......................#',
  '#......B.........B......#',
  '#.......................#',
  '#.......C.......C.......#',
  '#.......................#',
  '#...B............B......#',
  '#........C..............#',
  '#.......................#',
  '#.......................#',
  '#########################',
];
const LOOT = [
  [-40, 32, '月票票夹', 180],
  [13, 39, '彩色气球束', 225],
  [-3, 21, '旧玩偶', 260],
  [-27, 2, '黄铜检票钳', 485, 'top'],
  [-36, -18, '过山车纪念章', 340],
  [35, 8, '机械八音盒', 490],
  [38, -10, '碎镜胸针', 410],
  [21, 3, '鬼屋钥匙', 365],
  [0, -37, '团长签名照', 520, 'top'],
  [-11, -25, '走调的手摇琴', 405],
];
const AMMO = [
  [0, 36],
  [-33, 30],
  [20, 28],
  [-32, -16],
  [-38, 4],
  [-12, 10],
  [12, -11],
  [31, 4],
  [10, -27],
  [-14, -36],
];
const TRACK = { x: -27, halfWidth: 3, flat: 11, reach: 23, height: 3 };
const trackHeight = (z) =>
  TRACK.height * Math.max(0, Math.min(1, (TRACK.reach - Math.abs(z)) / (TRACK.reach - TRACK.flat)));
const ramp = (x, z) => (Math.abs(x - TRACK.x) <= TRACK.halfWidth ? trackHeight(z) : 0);
const mirrorHouse = (x, z) => x >= 17 && x <= 43 && z >= -16 && z <= 15;
// 墙段之间的间隙就是入口，同一份数据供实体碰撞、几何与小地图使用。
const WALLS = [
  [17, -10, 0.65, 12],
  [17, 8, 0.65, 12],
  [43, -7, 0.65, 16],
  [43, 10, 0.65, 9],
  [21, -16, 8, 0.65],
  [36, -16, 14, 0.65],
  [21, 15, 8, 0.65],
  [36, 15, 14, 0.65],
  [26, -5, 0.65, 12],
  [34, 6, 0.65, 11],
  [37, -5, 8, 0.65],
  [21, 5, 7, 0.65],
];
function buildMap({
  THREE,
  scene,
  GRID: grid,
  level,
  StaticBatches,
  shapes,
  canvasTexture,
  seededRandom,
  brighter,
  mergeGeometries,
}) {
  const random = seededRandom(14192);
  const metal = new THREE.MeshLambertMaterial();
  const neon = new THREE.MeshBasicMaterial();
  const tentMap = canvasTexture(256, 128, (ctx, w, h) => {
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = i % 2 ? '#8e3755' : '#e9b894';
      ctx.fillRect((i * w) / 16, 0, w / 16, h);
      ctx.fillStyle = '#482b4038';
      ctx.fillRect((i * w) / 16, 0, 3, h);
    }
    for (let i = 0; i < 1100; i++) {
      ctx.fillStyle = '#31233b38';
      ctx.fillRect(random() * w, random() * h, 1, 1 + random() * 7);
    }
  });
  const cloth = new THREE.MeshLambertMaterial({ map: tentMap, side: THREE.DoubleSide });
  const palette = { metal, neon, cloth };
  const batch = new StaticBatches(palette);
  const addBox = (x, y, z, w, h, d, c, kind = 'metal', yaw = 0, pitch = 0, roll = 0) =>
    batch.add('box', kind, x, y, z, w, h, d, c, yaw, pitch, roll);
  function solid(x, z, w, d, h, c, base = 0, climb = false) {
    addBox(x, base + h / 2, z, w, h, d, c);
    level.box(x, z, w, d, base, base + h, climb);
  }
  function sign(text, x, y, z, w, h, tint) {
    const map = canvasTexture(512, 96, (ctx, cw, ch) => {
      ctx.fillStyle = '#23192f';
      ctx.fillRect(0, 0, cw, ch);
      ctx.strokeStyle = tint;
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, cw - 8, ch - 8);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = tint;
      ctx.font = 'bold 52px sans-serif';
      ctx.fillText(text, cw / 2, ch / 2 + 2, cw - 22);
    });
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }),
    );
    plate.position.set(x, y, z);
    scene.add(plate);
  }
  const pavement = canvasTexture(
    160,
    160,
    (ctx, w, h) => {
      ctx.fillStyle = '#4c4159';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < 4; y++)
        for (let x = -1; x < 4; x++) {
          ctx.fillStyle = ['#554958', '#5e515e', '#50475a'][Math.floor(random() * 3)];
          ctx.fillRect(x * 52 + (y % 2) * 26, y * 40, 50, 38);
        }
      for (let i = 0; i < 170; i++) {
        ctx.fillStyle = '#b09a9c36';
        ctx.fillRect(random() * w, random() * h, 2, 1);
      }
    },
    true,
  );
  pavement.repeat.set(26, 26);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshLambertMaterial({ map: pavement }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const lit = (c) => brighter(c, 1.9);
  for (let row = 0; row < grid.rows; row++)
    for (let col = 0; col < grid.columns; col++) {
      const tile = grid.cells[row][col],
        x = grid.x(col),
        z = grid.z(row);
      if (tile === '#') {
        const horizontal = row === 0 || row === 24;
        level.box(x, z, horizontal ? 4 : 0.4, horizontal ? 0.4 : 4, 0, 3.4);
        addBox(x, 1.7, z, 0.22, 3.4, 0.22, IRON);
        for (const h of [0.6, 2.6]) addBox(x, h, z, horizontal ? 4 : 0.09, 0.13, horizontal ? 0.09 : 4, 0x70546a);
        for (let n = -1.5; n < 2; n += 1)
          addBox(x + (horizontal ? n : 0), 1.5, z + (horizontal ? 0 : n), 0.085, 2.9, 0.085, IRON);
      } else if (tile === 'B') {
        solid(x, z, 3.5, 2.5, 2.35, 0x743e55);
        addBox(x, 2.55, z, 4.1, 0.38, 3.15, 0xffffff, 'cloth');
        addBox(x, 1.65, z + 1.27, 2.7, 1.1, 0.08, 0x221c32);
        addBox(x, 0.98, z + 1.4, 3.4, 0.13, 0.45, 0xcb9d79);
        for (let i = 0; i < 5; i++)
          addBox(x - 1.5 + i * 0.75, 2.48, z + 1.55, 0.22, 0.18, 0.09, lit(i % 2 ? AQUA : PINK), 'neon');
      } else if (tile === 'S') {
        solid(x, z, 3.3, 1.15, 0.85, 0x65414f);
        addBox(x, 1.15, z - 0.48, 3.3, 0.68, 0.18, 0x996075);
      } else if (tile === 'C') {
        solid(x, z, 2.35, 1.45, 0.57, 0x4d8595);
        addBox(x, 0.74, z - 0.25, 1.8, 0.32, 0.53, 0xc67375);
        addBox(x, 1.67, z - 0.45, 0.05, 2.15, 0.05, IRON);
      }
    }
  level.spawn.set(0, 0, 40);
  level.bossAnchor.set(0, 0, -31);
  level.bossSpawn.copy(level.bossAnchor);
  level.gate.set(0, 0, -15);
  for (const x of [-8, 8]) solid(x, 43, 0.65, 0.7, 6, 0x915071);
  addBox(0, 5.7, 43, 16.8, 0.54, 0.8, 0xc6a983);
  sign('午夜游园', 0, 5.65, 43.45, 9.3, 1.45, '#ffb7c7');
  sign('售票处', -32, 2.98, 33.58, 3.8, 0.75, '#8ef1dc');
  sign('MIRROR  HOUSE', 30, 4.55, 15.4, 11, 1.24, '#a5f8ee');
  sign('LAST  EXPRESS', -27, 5.7, 12, 7.7, 1.05, '#fbd199');
  for (const [x, z, w, d] of WALLS) {
    solid(x, z, w, d, 4.2, 0x413650);
    addBox(x, 3.95, z, w + 0.07, 0.16, d + 0.07, lit(AQUA), 'neon');
    if (w > d) {
      addBox(x, 2.1, z, w * 0.88, 2.8, d + 0.025, 0x91a3af);
      addBox(x, 1.9, z, w * 0.72, 0.075, d + 0.06, lit(PINK), 'neon');
    } else {
      addBox(x, 2.1, z, w + 0.025, 2.8, d * 0.88, 0x91a3af);
      addBox(x, 1.9, z, w + 0.06, 0.075, d * 0.7, lit(PINK), 'neon');
    }
  }
  const mirror = new Reflector(new THREE.PlaneGeometry(6.4, 2.9), {
    color: 0xb4a7bb,
    textureWidth: CONFIG.graphics.mirrorSize,
    textureHeight: CONFIG.graphics.mirrorSize,
    clipBias: 0.004,
    multisample: 0,
  });
  mirror.position.set(37, 2.1, -4.63);
  scene.add(mirror);
  // 只在镜屋附近更新主镜；其余开间的暗银墙和霓虹条共用实例材质。
  const reflect = mirror.onBeforeRender;
  let lastMirror = -1;
  mirror.onBeforeRender = function (renderer, world, camera) {
    const now = performance.now();
    if (now - lastMirror < 100 || camera.position.distanceToSquared(mirror.position) > 19 ** 2) return;
    lastMirror = now;
    reflect.call(this, renderer, world, camera);
  };
  // 双坡站台兼作东西街与北后台之间的有高差捷径。
  for (let z = -22.75; z < 23; z += 0.5) {
    const h = trackHeight(z);
    addBox(TRACK.x, h - 0.09, z, 6, 0.18, 0.52, 0x81596a);
    for (const offset of [-1.32, 1.32]) addBox(TRACK.x + offset, h + 0.045, z, 0.13, 0.1, 0.53, 0xe3bd8e);
  }
  for (let z = -19; z <= 19; z += 4) {
    for (const side of [-1, 1])
      addBox(TRACK.x + side * 2.55, trackHeight(z) / 2, z, 0.22, trackHeight(z), 0.22, IRON);
  }
  for (let i = 0; i < 4; i++) {
    const y = (i + 1) * 0.19;
    solid(0, -35.2 - i * 0.65, 9, 0.67, y, 0x5a344b, 0, true);
  }
  solid(0, -38.5, 9, 3.8, 0.76, 0x6c3f51, 0, true);
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(14.4, 7, 32, 1, true), cloth);
  canopy.position.set(0, 10, -32);
  scene.add(canopy);
  for (let i = 0; i < 16; i++) {
    const a = (TAU * i) / 16,
      x = Math.cos(a) * 13.8,
      z = -32 + Math.sin(a) * 13.8;
    solid(x, z, 0.27, 0.27, 6.65, 0x9e705d);
    batch.add('stone', 'neon', x, 6.5, z, 0.5, 0.5, 0.5, lit(i % 2 ? PINK : GOLD));
  }
  sign('CIRQUE  MINUIT', 0, 6.15, -18.25, 9.2, 1.1, '#ffafbc');
  const curtain = new THREE.Mesh(
    new THREE.CylinderGeometry(13.9, 14.2, 2.2, 32, 1, true, Math.PI * 0.45, Math.PI * 1.1),
    cloth,
  );
  curtain.position.set(0, 6.15, -32);
  scene.add(curtain);
  // 旋转部分只在初始化时合并几何；每种材质每座设施一个 draw call。
  function assembly(parent, parts) {
    const groups = new Map();
    for (const [geometry, material, tint, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0] of parts) {
      const g = geometry.index ? geometry.toNonIndexed() : geometry.clone(),
        m = new THREE.Object3D();
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.rotation.set(rx, ry, rz);
      m.updateMatrix();
      g.applyMatrix4(m.matrix);
      const color = new THREE.Color(tint),
        attr = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < attr.length; i += 3) {
        attr[i] = color.r;
        attr[i + 1] = color.g;
        attr[i + 2] = color.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(attr, 3));
      if (!groups.has(material)) groups.set(material, []);
      groups.get(material).push(g);
    }
    for (const [mat, geos] of groups) {
      const colored = mat.clone();
      colored.vertexColors = true;
      parent.add(new THREE.Mesh(mergeGeometries(geos), colored));
      geos.forEach((g) => g.dispose());
    }
  }
  const wheel = new THREE.Group();
  wheel.position.set(0, 12.6, -17.8);
  scene.add(wheel);
  const wheelParts = [],
    ring = new THREE.TorusGeometry(1, 0.022, 5, 72);
  wheelParts.push(
    [ring, neon, AQUA, 0, 0, 0, 11.2, 11.2, 3],
    [ring, metal, 0xee9b90, 0, 0, -0.48, 10.55, 10.55, 5],
  );
  for (let i = 0; i < 20; i++) {
    const a = (i * TAU) / 20,
      s = Math.sin(a),
      c = Math.cos(a);
    wheelParts.push([shapes.box, metal, 0xdab5c1, 5.45 * c, 5.45 * s, 0, 10.92, 0.12, 0.17, 0, 0, a]);
    wheelParts.push([shapes.stone, neon, i % 2 ? GOLD : PINK, 11.2 * c, 11.2 * s, 0.15, 0.44, 0.44, 0.36]);
  }
  assembly(wheel, wheelParts);
  const gondolas = new THREE.InstancedMesh(shapes.box, metal, 10);
  for (let i = 0; i < 10; i++) gondolas.setColorAt(i, new THREE.Color(i % 2 ? 0xac416e : 0x4da5a4));
  gondolas.frustumCulled = false;
  scene.add(gondolas);
  for (const side of [-1, 1]) {
    addBox(side * 3, 6.3, -18.2, 0.48, 14, 0.5, 0x70546c, 'metal', 0, 0, side * 0.43);
    solid(side * 5.7, -18.2, 0.85, 0.9, 0.85, IRON);
  }
  const carousel = new THREE.Group();
  scene.add(carousel);
  const top = new THREE.ConeGeometry(1, 0.55, 24, 1, true);
  const carouselParts = [
    [shapes.cylinder, metal, 0x8e5068, 0, 0.1, 0, 14, 0.19, 14],
    [shapes.cylinder, metal, GOLD, 0, 2.25, 0, 1.15, 4.5, 1.15],
    [top, cloth, 0xffffff, 0, 5.35, 0, 8, 4.2, 8],
  ];
  level.box(0, 0, 1.05, 1.05, 0, 5.3);
  for (let i = 0; i < 8; i++) {
    const a = (TAU * i) / 8,
      c = Math.cos(a),
      s = Math.sin(a),
      x = 5.6 * c,
      z = 5.6 * s;
    carouselParts.push(
      [shapes.cylinder, metal, GOLD, x, 2.15, z, 0.12, 4.05, 0.12],
      [shapes.stone, metal, i % 2 ? 0xde90ae : 0x75bfc1, x, 1.24, z, 1.75, 0.95, 0.8, 0, -a, 0],
      [shapes.stone, metal, 0xf1cba9, x + 0.65 * c, 1.78, z + 0.65 * s, 0.65, 0.8, 0.48, 0, -a, 0.14],
      [shapes.box, neon, i % 2 ? PINK : AQUA, 7.55 * c, 4.22, 7.55 * s, 1.18, 0.15, 0.25, 0, -a, 0],
    );
  }
  // 两根可见的对向横臂与实际扫击的方向共用同一个角度。
  carouselParts.push(
    [shapes.box, metal, 0xb07461, 0, 1.05, 0, 15, 0.24, 0.4],
    [shapes.box, neon, GOLD, 0, 1.22, 0, 15, 0.079, 0.32],
  );
  assembly(carousel, carouselParts);
  const train = new THREE.Group();
  train.position.x = TRACK.x;
  scene.add(train);
  assembly(train, [
    [shapes.box, metal, 0xac4564, 0, 0.6, 0, 2.65, 1.05, 3.7],
    [shapes.box, metal, 0xda9b83, 0, 1.25, -1.25, 2.1, 0.45, 0.37],
    [shapes.box, metal, 0xda9b83, 0, 1.25, 0.62, 2.1, 0.45, 0.37],
    [shapes.box, neon, GOLD, 0, 0.74, -1.89, 1.75, 0.27, 0.12],
  ]);
  for (const [x, z] of [
    [-13, 16],
    [13, 16],
    [-12, -11],
    [15, -19],
    [-36, 11],
    [37, 21],
  ]) {
    addBox(x, 2.35, z, 0.16, 4.7, 0.16, IRON);
    addBox(x, 4.65, z, 0.85, 0.22, 0.85, lit(GOLD), 'neon');
  }
  const ribbons = new THREE.Group();
  ribbons.position.copy(level.gate);
  scene.add(ribbons);
  const locks = [];
  for (const side of [-1, 1]) {
    locks.push([
      shapes.box,
      metal,
      side > 0 ? PINK : AQUA,
      0,
      2.4,
      0.08 * side,
      4.5,
      0.22,
      0.12,
      0,
      0,
      side * 0.59,
    ]);
    for (let i = -3; i <= 3; i++)
      locks.push([
        ring,
        metal,
        GOLD,
        i * 0.45,
        2.4 + i * 0.26 * side,
        0.19,
        0.26,
        0.17,
        0.58,
        0,
        (i % 2) * 0.74,
        side * 0.54,
      ]);
  }
  assembly(ribbons, locks);
  batch.flush();
  const key = new THREE.DirectionalLight(0xe0bcff, 1.38);
  key.position.set(-21, 37, 10);
  scene.add(key, new THREE.HemisphereLight(0xe4c7ff, 0x936d71, 1.37));
  const lamps = [];
  for (const [x, y, z, tint] of [
    [0, 5, 0, PINK],
    [0, 5, -32, GOLD],
    [-27, 6, 0, AQUA],
    [30, 4, 8, AQUA],
    [1, 5, 33, GOLD],
  ]) {
    const lamp = new THREE.PointLight(tint, 28, 23, 1.45);
    lamp.position.set(x, y, z);
    scene.add(lamp);
    lamps.push(lamp);
  }
  return { wheel, gondolas, carousel, train, canopy, curtain, lamps, ribbons };
}

const notes = [659.25, 0, 783.99, 622.25, 523.25, 0, 493.88, 554.37];
function createEncounter({ CONFIG: config, level, THREE, brighter, sound }) {
  const rules = config.rides,
    point = new THREE.Vector3(),
    dir = new THREE.Vector3(),
    explosion = new THREE.Vector3();
  const pink = brighter(PINK, 2.5),
    gold = brighter(GOLD, 2.2);
  const drops = Array.from({ length: config.beasts.capacity }, () => ({ active: false, x: 0, y: 0, z: 0, vy: 0 }));
  const nextHit = new Float32Array(config.beasts.capacity);
  const launchVelocity = new Float32Array(config.beasts.capacity);
  const label = (ride) => (ride === 'carousel' ? '旋转木马' : '过山车');
  // 车辆的伤害和位移都使用静态网格移动；怪物依然可以主动走入设施路线。
  function hitBody(body, game, dx, dz, player) {
    const scale = 1 / Math.max(0.005, Math.hypot(dx, dz));
    dx *= scale;
    dz *= scale;
    if (player) {
      if (!body.hurt(rules.playerDamage, game, undefined, { x: body.x - dx, z: body.z - dz })) return;
      body.vy = 5.7;
      body.grounded = false;
      game.encounter.pushX = dx * 9;
      game.encounter.pushZ = dz * 9;
    } else {
      game.beasts.damage(
        body,
        body.type === 3 ? rules.enemyDamage * 0.42 : rules.enemyDamage,
        game,
        'environment',
      );
      if (!body.active) return;
      body.mode = 'move';
      body.stun = 0.56;
      body.knockX = dx * 12;
      body.knockZ = dz * 12;
      launchVelocity[body.id] = 4.6;
    }
    point.set(body.x, body.y + 0.65, body.z);
    game.effects.spray(point, gold, 9, 5, 0.095, 'spark');
  }
  function clearLine(origin, x, y, z, radius) {
    const distance = dir.set(x - origin.x, y - origin.y, z - origin.z).length();
    return (
      distance < radius && (distance < 0.035 || level.visible(origin, dir.multiplyScalar(1 / distance), distance))
    );
  }
  const state = {
    next: 0,
    ride: null,
    rideActive: false,
    status: null,
    angle: 0,
    trainZ: TRACK.reach,
    blackout: 0,
    pushX: 0,
    pushZ: 0,
    drops,
    launchVelocity,
    note: 0,
    nextNote: 0,
    lastPlayerHit: 0,
    reset() {
      this.next = rules.first;
      this.ride = null;
      this.rideActive = false;
      this.status = null;
      this.angle = 0;
      this.trainZ = TRACK.reach;
      this.blackout = this.note = this.nextNote = 0;
      this.pushX = this.pushZ = this.lastPlayerHit = 0;
      nextHit.fill(0);
      launchVelocity.fill(0);
      for (const drop of drops) drop.active = false;
    },
    detonate(pos, game, isCrash = false) {
      if (game.blast || game.phase !== 'play') return;
      explosion.copy(pos);
      explosion.y = Math.max(level.base(pos.x, pos.z) + 0.14, pos.y);
      game.effects.spray(explosion, pink, 25, 6.5, 0.085, 'spark');
      game.effects.spray(explosion, gold, 15, 5, 0.1, 'mist');
      if (Math.hypot(game.player.x - pos.x, game.player.z - pos.z) < 28) {
        sound.hiss(0.13, 3400, 180, 0.22);
        sound.tone(310, 52, 0.22, 0.16, 'triangle');
      }
      const p = game.player;
      if (!isCrash && clearLine(explosion, p.x, p.y + 0.72, p.z, 3.4)) p.hurt(10, game, undefined, explosion, 2);
      if (isCrash)
        for (const b of game.beasts.pool) {
          if (b.active && clearLine(explosion, b.x, b.y + 0.63, b.z, 3.9))
            game.beasts.damage(b, 52, game, 'environment');
        }
    },
    clearBody(id) {
      nextHit[id] = 0;
      launchVelocity[id] = 0;
    },
    stageDrop(b) {
      const drop = drops.find((entry) => !entry.active);
      if (!drop) return false;
      Object.assign(drop, { active: true, x: b.x, y: b.y + 0.65, z: b.z, vy: -0.7 });
      return true;
    },
    update(game, dt) {
      const t = game.time;
      if (game.blast) return;
      this.blackout = Math.max(0, this.blackout - dt);
      if (!this.ride && t >= this.next - rules.warning) {
        this.ride = Math.random() < 0.55 ? 'carousel' : 'train';
        game.ui.notify(label(this.ride) + '亮起警示灯，请撤出标记范围', rules.warning);
        sound.stageEvent('warning',game,this.ride==='train'?{x:TRACK.x,z:this.trainZ}:{x:0,z:0});
      }
      const duration = this.ride === 'carousel' ? rules.carouselDuration : rules.trainDuration;
      if (this.ride && !this.rideActive && t >= this.next) {
        this.rideActive = true;
        game.ui.notify(label(this.ride) + '失控启动', 1.4);
        sound.stageEvent('danger',game,this.ride==='train'?{x:TRACK.x,z:this.trainZ}:{x:0,z:0});
      }
      if (this.rideActive && t >= this.next + duration) {
        this.next += rules.period;
        this.ride = null;
        this.rideActive = false;
        this.trainZ = TRACK.reach;
        this.status = null;
      }
      this.angle = (this.angle + dt * (this.rideActive && this.ride === 'carousel' ? rules.rotation : 0.1)) % TAU;
      if (this.ride) {
        this.status = {
          title: label(this.ride) + (this.rideActive ? '失控' : '即将启动'),
          detail: this.ride === 'carousel' ? '避开金色横臂，广场外环安全' : '撤离双轨与站台中央',
          remaining: this.next + (this.rideActive ? duration : 0) - t,
        };
      }
      if (t >= this.nextNote) {
        const freq = notes[this.note++ % notes.length];
        if (freq) {
          const pitch = this.ride ? 1.19 : 1;
          sound.tone(freq * pitch, freq * pitch * 0.986, 0.34, 0.063, 'sine');
          sound.tone(freq * 2.009 * pitch, freq * 1.992 * pitch, 0.2, 0.024, 'triangle');
        }
        this.nextNote = t + (this.ride ? 0.37 : 0.61);
      }
      if (Math.abs(this.pushX) + Math.abs(this.pushZ) > 0.08) {
        level.move(game.player, this.pushX * dt, this.pushZ * dt, 0.18);
        const drag = Math.exp(-8 * dt);
        this.pushX *= drag;
        this.pushZ *= drag;
      }
      if (this.rideActive) {
        const train = this.ride === 'train';
        if (train) {
          this.trainZ = TRACK.reach * (1 - 2 * Math.min(1, (t - this.next) / duration));
          sound.stageEvent('impact',game,{x:TRACK.x,y:trackHeight(this.trainZ),z:this.trainZ});
        }
        const check = (b, isPlayer) => {
          if (!isPlayer && !b.active) return;
          if ((isPlayer ? this.lastPlayerHit : nextHit[b.id]) > t) return;
          let dx, dz;
          if (train) {
            if (
              Math.abs(b.x - TRACK.x) > 1.55 + b.radius ||
              Math.abs(b.z - this.trainZ) > 1.98 + b.radius ||
              Math.abs(b.y - trackHeight(this.trainZ)) > 1.95
            )
              return;
            dx = (b.x - TRACK.x) * 0.6;
            dz = -1;
          } else {
            const r = Math.hypot(b.x, b.z);
            if (r > 7.65 + b.radius || r < 0.65 || b.y > 1.7) return;
            const a = Math.atan2(b.z, b.x) - this.angle;
            if (Math.abs(Math.sin(a)) * r > 0.32 + b.radius) return;
            dx = b.x / r - (0.7 * b.z) / r;
            dz = b.z / r + (0.7 * b.x) / r;
          }
          if (isPlayer) this.lastPlayerHit = t + rules.cooldown;
          else nextHit[b.id] = t + rules.cooldown;
          hitBody(b, game, dx, dz, isPlayer);
        };
        check(game.player, true);
        if (game.phase === 'play') for (const b of game.beasts.pool) check(b, false);
      }
      for (const drop of drops) {
        if (!drop.active) continue;
        drop.vy -= 10.5 * dt;
        drop.y += drop.vy * dt;
        const ground = level.surface(drop.x, drop.z, drop.y + 0.22);
        if (drop.y > ground + 0.16) continue;
        drop.active = false;
        point.set(drop.x, ground + 0.18, drop.z);
        this.detonate(point, game, true);
      }
    },
  };
  state.reset();
  return state;
}

function createEnvironment({ THREE, scene, mapData, seededRandom, brighter, canvasTexture }) {
  const random = seededRandom(4708),
    dummy = new THREE.Object3D();
  const dustCount = 350,
    colors = new Float32Array(dustCount * 3),
    origins = new Float32Array(dustCount * 3),
    positions = new Float32Array(origins.length);
  for (let i = 0; i < dustCount; i++) {
    origins[3 * i] = (random() - 0.5) * 89;
    origins[3 * i + 1] = random() * 11;
    origins[3 * i + 2] = (random() - 0.5) * 89;
    const color = new THREE.Color([PINK, AQUA, GOLD, 0xad9ac9][i % 4]);
    color.toArray(colors, i * 3);
  }
  const dust = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({
      size: 0.11,
      vertexColors: true,
      transparent: true,
      opacity: 0.79,
      depthWrite: false,
    }),
  );
  dust.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  dust.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  dust.frustumCulled = false;
  scene.add(dust);
  const mistMap = canvasTexture(96, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, h / 2);
    g.addColorStop(0, '#b79ccca0');
    g.addColorStop(1, '#907caa00');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  const mist = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: mistMap,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    24,
  );
  for (let i = 0; i < mist.count; i++) {
    dummy.position.set((random() - 0.5) * 86, 0.22 + random() * 0.35, (random() - 0.5) * 86);
    dummy.rotation.set(-Math.PI / 2, 0, random() * TAU);
    dummy.scale.set(10 + random() * 14, 5 + random() * 6, 1);
    dummy.updateMatrix();
    mist.setMatrixAt(i, dummy.matrix);
  }
  scene.add(mist);
  const debris = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.4, 0),
    new THREE.MeshBasicMaterial({ color: brighter(PINK, 1.8) }),
    CONFIG.beasts.capacity,
  );
  debris.count = 0;
  debris.frustumCulled = false;
  scene.add(debris);
  return {
    update(t, playing, game) {
      const e = game.encounter,
        sim = game.phase === 'ready' ? t : game.time;
      mapData.carousel.rotation.y = -(game.phase === 'ready' ? t * 0.1 : e.angle);
      mapData.train.position.set(TRACK.x, trackHeight(e.trainZ), e.trainZ);
      mapData.wheel.rotation.z = sim * 0.047;
      for (let i = 0; i < 10; i++) {
        const a = mapData.wheel.rotation.z + (i * TAU) / 10;
        dummy.position.set(11.2 * Math.cos(a), 12.04 + 11.2 * Math.sin(a), -17.45);
        dummy.scale.set(1.65, 0.94, 1.15);
        dummy.rotation.set(0, 0, 0.055 * Math.sin(sim * 0.7 + i));
        dummy.updateMatrix();
        mapData.gondolas.setMatrixAt(i, dummy.matrix);
      }
      mapData.gondolas.instanceMatrix.needsUpdate = true;
      const blackout = e.blackout;
      mapData.curtain.position.y = 6.15 - (blackout > 0 ? 1.85 * Math.sin((1 - blackout / 2.4) * Math.PI) : 0);
      for (let i = 0; i < mapData.lamps.length; i++) {
        const alert = e.ride && (e.ride === 'carousel' ? i === 0 : i === 2);
        mapData.lamps[i].intensity =
          blackout > 0
            ? i === 1
              ? 53
              : 0
            : alert
              ? 32 + 28 * Math.sin(sim * 17)
              : 27 + 3 * Math.sin(t * (i + 1) * 1.5 + i);
      }
      mapData.ribbons.visible = !game.blast;
      const position = dust.geometry.attributes.position;
      for (let i = 0; i < dustCount; i++) {
        const j = i * 3,
          burst = game.blast && i < 120;
        if (burst) {
          const a = i * 2.4,
            dist = (3 + origins[j + 1]) * game.blast;
          position.setXYZ(
            i,
            game.level.gate.x + Math.cos(a) * dist,
            2 + game.blast * (5 + origins[j + 1]) - 8 * game.blast ** 2,
            game.level.gate.z + Math.sin(a) * dist,
          );
        } else
          position.setXYZ(
            i,
            origins[j] + Math.sin(t * 0.3 + i) * 0.82,
            11 - ((origins[j + 1] + t * (0.27 + (i % 3) * 0.14)) % 11),
            origins[j + 2] + Math.cos(t * 0.31 + i),
          );
      }
      position.needsUpdate = true;
      let n = 0;
      for (const drop of e.drops)
        if (drop.active) {
          dummy.position.set(drop.x, drop.y, drop.z);
          dummy.scale.set(0.85, 1.3, 0.85);
          dummy.rotation.set(sim * 5, sim * 4, 0);
          dummy.updateMatrix();
          debris.setMatrixAt(n++, dummy.matrix);
        }
      debris.count = n;
      debris.instanceMatrix.needsUpdate = true;
    },
  };
}

function carnivalModel(type, { THREE, shapes, mergeGeometries }, rage = false) {
  const body = [],
    glow = [],
    orb = new THREE.SphereGeometry(0.5, 8, 6),
    cone = new THREE.ConeGeometry(0.5, 1, 8);
  const stamp = new THREE.Object3D();
  function part(shape, color, x, y, z, w, h, d, rz = 0, lit = false) {
    const g = shape.index ? shape.toNonIndexed() : shape.clone();
    stamp.position.set(x, y, z);
    stamp.scale.set(w, h, d);
    stamp.rotation.set(0, 0, rz);
    stamp.updateMatrix();
    g.applyMatrix4(stamp.matrix);
    const rgb = new THREE.Color(color),
      attr = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < attr.length; i += 3) {
      attr[i] = rgb.r;
      attr[i + 1] = rgb.g;
      attr[i + 2] = rgb.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(attr, 3));
    (lit ? glow : body).push(g);
  }
  if (type === 0) {
    part(orb, 0x814d62, 0, 0.48, 0, 0.53, 0.64, 0.47);
    part(orb, 0xc39792, 0, 0.94, 0.06, 0.58, 0.54, 0.52, 0.15);
    for (const s of [-1, 1]) {
      part(orb, 0xc08b90, s * 0.23, 1.16, 0.02, 0.22, 0.22, 0.18);
      part(shapes.box, 0x996a80, s * 0.18, 0.18, -0.02, 0.18, 0.34, 0.22, s * 0.17);
      part(shapes.box, 0xc18e8f, s * 0.32, 0.57, 0.08, 0.16, 0.33, 0.21, s * 0.52);
      part(orb, s > 0 ? PINK : AQUA, s * 0.12, 0.97, 0.294, 0.09, 0.09, 0.055, 0, true);
    }
    part(shapes.box, 0x422f41, 0, 0.82, 0.307, 0.2, 0.035, 0.024, -0.19);
  } else if (type === 1) {
    part(orb, 0x6e465a, 0, 0.98, 0, 1.02, 1.17, 0.88);
    part(orb, 0xeac9b2, 0, 1.8, 0.09, 0.66, 0.63, 0.55);
    part(orb, PINK, 0, 1.76, 0.42, 0.2, 0.2, 0.17, 0, true);
    for (const s of [-1, 1]) {
      part(orb, 0xb65765, s * 0.48, 1.39, 0, 0.57, 0.53, 0.62);
      part(shapes.box, 0x797184, s * 0.59, 1.0, 0.07, 0.35, 0.62, 0.4, -s * 0.12);
      part(orb, 0xd39c79, s * 0.66, 0.79, 0.18, 0.44, 0.34, 0.42);
      part(shapes.box, 0x4d394b, s * 0.24, 0.38, 0, 0.38, 0.64, 0.39);
      part(orb, 0xcb697b, s * 0.26, 0.17, 0.19, 0.48, 0.24, 0.7);
      part(orb, 0xda5675, s * 0.35, 1.92, -0.04, 0.28, 0.42, 0.31);
      part(shapes.box, AQUA, s * 0.14, 1.9, 0.35, 0.13, 0.045, 0.045, s * 0.22, true);
    }
    part(cone, 0x625472, 0, 2.18, -0.03, 0.52, 0.46, 0.5);
  } else if (type === 2) {
    part(shapes.box, 0xbe8969, 0, 0.49, 0, 0.6, 0.46, 0.53);
    part(shapes.cylinder, 0x6e5368, 0, 0.62, 0.4, 0.3, 0.34, 0.53);
    for (const s of [-1, 1]) {
      part(shapes.box, 0xc4aa91, s * 0.22, 0.99, 0, 0.022, 0.8, 0.025, -s * 0.18);
      part(orb, s > 0 ? PINK : AQUA, s * 0.28, 1.4, 0, 0.59, 0.79, 0.57, 0, true);
    }
    part(orb, GOLD, 0, 1.66, -0.12, 0.55, 0.7, 0.54);
    part(orb, 0xdfbcae, 0, 0.83, 0.1, 0.36, 0.36, 0.3);
  } else {
    const scale = rage ? 1.16 : 1;
    part(cone, 0x8e344f, 0, 1.8, 0, 1.68 * scale, 1.9 * scale, 1.02 * scale);
    part(orb, 0xe8c2ae, 0, 3.08, 0.07, 0.91 * scale, 0.96 * scale, 0.77);
    part(shapes.cylinder, 0x292437, 0, 3.55, 0, 1.3, 0.13, 1.13);
    part(shapes.cylinder, 0x533647, 0, 3.82, 0, 0.82, 0.64, 0.76);
    part(shapes.box, GOLD, 0, 3.62, 0.39, 0.72, 0.12, 0.14, 0, true);
    for (const s of [-1, 1]) {
      part(shapes.box, 0x35283e, s * 0.35, 0.66, 0, 0.46, 1.21, 0.54);
      part(shapes.box, 0xc46d76, s * 0.89, 2.11, 0, 0.42, 1.01, 0.49, -s * (rage ? 0.9 : 0.28));
      part(orb, GOLD, s * 0.71, 2.56, 0.04, 0.55, 0.38, 0.47);
      part(shapes.box, rage ? AQUA : PINK, s * 0.19, 3.17, 0.43, 0.17, 0.069, 0.075, -s * 0.19, true);
      if (rage) part(cone, 0xc78495, s * 0.54, 3.39, -0.13, 0.36, 0.92, 0.4, -s * 0.56);
    }
    part(shapes.cylinder, 0xa28261, 1.08, 1.18, 0.18, 0.11, 2.35, 0.11);
    part(orb, AQUA, 1.08, 2.46, 0.18, 0.34, 0.41, 0.32, 0, true);
  }
  const meshes = [mergeGeometries(body), mergeGeometries(glow)];
  for (const g of [...body, ...glow, orb, cone]) g.dispose();
  return meshes;
}

export default {
  story:{type:'regions',sectors:[
    {name:'游园售票亭',cap:12,interval:0.27,at:[-8,27],entries:[[-16,24],[0,19]]},
    {name:'旋转木马广场',cap:14,interval:0.28,at:[16,5],entries:[[24,6],[12,-1]]},
  ]},
  weaponSkin: 'haunted-midway',
  pageTitle: '永夜游园 | 第十四关',
  grid: GRID,
  config: CONFIG,
  loot: LOOT,
  ammo: AMMO,
  background: 0x251332,
  fog: 0x39273e,
  buildMap,
  createEnvironment,
  createEncounter,
  palette: {
    projectile: PINK,
    ichor: 0xba718d,
    spark: GOLD,
    core: AQUA,
    rare: 0xffb58e,
    blast: PINK,
    rift: {
      sealed: [0.78, 0.12, 0.46],
      ready: [0.23, 1.3, 1.2],
      rings: [PINK, AQUA],
      particles: GOLD,
      wave: AQUA,
    },
  },
  terrain: { ramp },
  allowSpawnSite: (x, z) => !mirrorHouse(x, z) && ramp(x, z) === 0,
  area(x, z) {
    if (mirrorHouse(x, z)) return '东园 · 镜屋与鬼屋';
    if (Math.abs(x - TRACK.x) < 4 && Math.abs(z) < TRACK.reach + 2) return '西园 · 最后一班过山车';
    if (z < -20) return '北园 · 午夜马戏团';
    if (z > 27) return '南园 · 碰碰车与美食街';
    return Math.hypot(x, z) < 12 ? '中央 · 旋转木马广场' : '园区外环与后台小径';
  },
  text: {
    tag: '第十四关 / 午夜停业之后',
    title: '永夜游园',
    enter: '穿过检票口',
    enemy: '游园怪物',
    brief: '留意轨道灯与走调的八音盒。将追兵引向失控设施，击败团长并带着怀表返回摩天轮。',
    bossName: '马戏团团长',
    keyItem: '团长的怀表',
    portal: '锁链彩门',
    loot: '游园藏品',
    safe: '南门售票亭安全区',
    rage: '顶幕落下，团长撕裂戏服并召唤扭曲玩偶',
    exitObjective: '到摩天轮底部按 F 引爆锁链彩门',
  },
  buildBeastModel: carnivalModel,
  buildRageModel: (helpers) => carnivalModel(3, helpers, true),
  projectileGeometry(THREE) {
    return new THREE.SphereGeometry(2.25, 10, 8).scale(0.9, 1, 1.12);
  },
  onProjectileImpact(pos, game) {
    game.encounter.detonate(pos, game);
  },
  beastSurface(b, player, level, floor, dt, game) {
    const hover = b.type === 2 ? 1.15 + 0.2 * Math.sin(game.time * 2 + b.id) : 0;
    const velocity = game.encounter.launchVelocity;
    if (velocity[b.id]) {
      velocity[b.id] -= 12 * dt;
      b.y = Math.max(floor + hover, b.y + velocity[b.id] * dt);
      if (b.y <= floor + hover + 0.001) velocity[b.id] = 0;
    } else b.y = Math.max(floor + hover, b.y - 8 * dt);
  },
  beastDropHeight(b, level) {
    return level.surface(b.x, b.z, b.y + 0.12);
  },
  onBeastDefeated(b, game, source) {
    game.encounter.clearBody(b.id);
    if (b.type === 0 && Math.hypot(b.x - game.player.x, b.z - game.player.z) < 18) {
      game.sound.hiss(0.085, 1900, 280, 0.13);
      game.sound.tone(243, 108, 0.1, 0.09, 'triangle');
    }
    return (
      b.type === 2 && source === 'weapon' && game.weapon.skinId === 'haunted-midway' && game.encounter.stageDrop(b)
    );
  },
  onBossRage(b, game) {
    game.encounter.blackout = 2.4;
    game.sound.tone(392, 97, 0.72, 0.24, 'triangle');
  },
  minimap: {
    tiles: { '#': '#79617a', S: '#9f697b', B: '#935a73', C: '#699095' },
    afterTiles({ ctx, px, pz }) {
      ctx.fillStyle = '#99c6c9';
      for (const [x, z, w, d] of WALLS)
        ctx.fillRect(px(x - w / 2), pz(z - d / 2), Math.max(1.4, px(w) - px(0)), Math.max(1.4, pz(d) - pz(0)));
      ctx.strokeStyle = '#a9847c';
      ctx.strokeRect(px(TRACK.x - 3), pz(-23), px(6) - px(0), pz(46) - pz(0));
      ctx.strokeStyle = '#bf7ba6';
      ctx.beginPath();
      ctx.arc(px(0), pz(0), px(8) - px(0), 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = '#aa8297';
      ctx.beginPath();
      ctx.arc(px(0), pz(-32), px(14) - px(0), 0, TAU);
      ctx.stroke();
    },
    overlay({ ctx, px, pz, game }) {
      const e = game.encounter;
      if (!e.ride) return;
      ctx.fillStyle = e.rideActive ? '#fa6675a8' : '#ffca69a0';
      ctx.strokeStyle = '#ffcb70';
      if (e.ride === 'train') {
        ctx.strokeRect(px(TRACK.x - 1.8), pz(-23), px(3.6) - px(0), pz(46) - pz(0));
        const z = e.rideActive ? e.trainZ : TRACK.reach;
        ctx.fillRect(px(TRACK.x - 1.8), pz(z - 2), px(3.6) - px(0), pz(4) - pz(0));
      } else
        for (const a of [e.angle, e.angle + Math.PI]) {
          ctx.beginPath();
          ctx.moveTo(px(0), pz(0));
          ctx.arc(px(0), pz(0), px(7.7) - px(0), a - 0.14, a + 0.14);
          ctx.closePath();
          ctx.fill();
        }
    },
  },
};
