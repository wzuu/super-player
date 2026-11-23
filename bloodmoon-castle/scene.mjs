const CONFIG = {
  map: { cell: 3.6, fog: 0.014, navCell: 0.9 },
  graphics: { maxPixelRatio: 1.25, bloomScale: 0.64 },
  beasts: {
    appearance: { minSwarmHeight: 1.62 },
    capacity: 100,
    types: [
      { hp: 48, speed: 7.22, radius: 0.43, height: 0.68, damage: 7 },
      { hp: 164, speed: 3.63, radius: 0.62, height: 2.28, chargeSpeed: 14.1, damage: 17 },
      { hp: 104, speed: 4.32, height: 1.92, projectileSpeed: 14, damage: 10 },
      { hp: 780, speed: 3.61, rageSpeed: 5.92, radius: 0.97, height: 3.35, summonCount: 8 },
    ],
  },
  bloodMoon: { period: 120, warning: 8, duration: 20, speed: 1.18, damage: 1.30, ammo: 12, health: 9, veilDuration: 1.65 },
};

const MAP_GRID = [
  '#########################',
  '#.......................#',
  '#.......TTTTTTTTT.......#',
  '#.......T.......T.......#',
  '#.......T.......T.......#',
  '#..c....R.......R....c..#',
  '#..c....R.......R.......#',
  '#..c................h...#',
  '#..c.............hh.h...#',
  '#..c...c............h...#',
  '#..c..............h.....#',
  '#..c.............hh.h...#',
  '#..c...c............h...#',
  '#..c..............h.h...#',
  '#..c.............hh.....#',
  '#..c................h...#',
  '#..c................h...#',
  '#..c....................#',
  '#...................s...#',
  '#...................s...#',
  '#...................s...#',
  '###########...###########',
  'vvvvvvvvvvv...vvvvvvvvvvv',
  'vvvvvvvvvvv...vvvvvvvvvvv',
  'vvvvvvvvvvv.P.vvvvvvvvvvv',
];

const LANDMARKS = {
  spawn: [0, 42.65], gate: [0, -13.6], boss: [0, -6.8],
  hall: { west: -12.6, east: 12.6, north: -19.8, south: 9 },
  crypt: { x: -32.4, width: 7.8, north: -25, south: 22, flatNorth: -14, flatSouth: 11, depth: 3.3 },
  tower: { x: 14.4, north: -35.7, south: -20.3, rise: 3.24, steps: 12, width: 3.2 },
  bridge: { width: 6.35, wall: 32.4 },
};

const loot = [
  [-7.8, 22.8, '银十字架', 125], [9.3, 18.9, '马厩铜铃', 85],
  [24.1, 10, '月桂烛台', 135], [34.7, -12.8, '宝石王冠', 240],
  [-22.7, 4.5, '墓志铭拓片', 110], [-32.4, -1, '缄封古书', 185],
  [-32.4, -10.5, '镶银圣骨匣', 210],
  [-9.5, -6.6, '彩窗碎片', 100], [11.5, -35.4, '伯爵印戒', 260, 'top'],
  [-8.2, -35.4, '钟楼星盘', 195, 'top'],
];
const ammo = [[0, 37.2], [-13.7, 23.2], [21.6, 22.2], [23.6, -4.2], [36.8, 1.5], [6.6, -1.4],
  [-7, -16.4], [-21, -11], [-32.4, 6.9], [4.5, -27.8]];

function groundHeight(x, z) {
  const c = LANDMARKS.crypt;
  if (Math.abs(x - c.x) >= c.width / 2 || z < c.north || z > c.south) return 0;
  return -c.depth * Math.min(1, (z - c.north) / (c.flatNorth - c.north), (c.south - z) / (c.south - c.flatSouth));
}

function buildMap({ THREE, scene, GRID, level, StaticBatches, shapes, canvasTexture, seededRandom, brighter }) {
  const rand = seededRandom(1148);
  const { spawn, gate, boss, hall, crypt, tower, bridge } = LANDMARKS;
  level.spawn.set(spawn[0], 0, spawn[1]);
  level.gate.set(gate[0], 0, gate[1]);
  level.bossSpawn.set(boss[0], 0, boss[1]);
  level.bossAnchor.set(boss[0], 0, boss[1]);

  const stoneMap = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#353744'; ctx.fillRect(0, 0, w, h);
    for (let row = 0; row < 4; row++) {
      for (let col = -1; col < 4; col++) {
        const x = col * 64 + (row % 2) * 32, y = row * 32;
        const v = 117 + Math.floor(rand() * 41);
        ctx.fillStyle = 'rgb(' + v + ',' + (v + 2) + ',' + (v + 9) + ')';
        ctx.fillRect(x + 1, y + 1, 62, 29);
        ctx.fillStyle = '#b0a9ab44'; ctx.fillRect(x + 2, y + 2, 60, 2);
        ctx.fillStyle = '#34303d66'; ctx.fillRect(x + 1, y + 27, 62, 3);
      }
    }
    for (let i = 0; i < 3400; i++) {
      ctx.fillStyle = i % 3 ? '#261d2a25' : '#e4e7ff28';
      ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 4, 1 + rand() * 2);
    }
  }, true);
  const earthMap = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#666570'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2800; i++) {
      ctx.fillStyle = ['#36344038', '#b0ac9635', '#554d4548'][i % 3];
      ctx.fillRect(rand() * w, rand() * h, rand() * 8, rand() * 5);
    }
  }, true);
  const glass = makeStainedGlass(canvasTexture);
  const matte = (color, map) => new THREE.MeshLambertMaterial({ color, map: map ?? null });
  const mats = {
    stone: matte(0xa0a4b5, stoneMap), carved: matte(0x777c94), edge: matte(0xa3a8bd),
    ground: matte(0x696477, earthMap), lawn: matte(0x555e65, earthMap),
    wood: matte(0x69505a, stoneMap), iron: matte(0x414255), brass: matte(0xb59158),
    hedge: matte(0x577761, earthMap), leaf: matte(0x648572),
    candle: new THREE.MeshBasicMaterial({ color: brighter(0xffc17a, 2.5) }),
    sign: new THREE.MeshBasicMaterial({ color: brighter(0xdb9765, 1.6) }),
  };
  const geometry = {
    ...shapes, crystal: new THREE.ConeGeometry(0.5, 1, 4),
    turret: new THREE.CylinderGeometry(0.5, 0.67, 1, 8),
    leaf: new THREE.IcosahedronGeometry(0.65, 0),
    roof: new THREE.ConeGeometry(0.70, 1, 8),
  };
  const batch = new StaticBatches(mats, geometry);
  const box = (mat, x, y, z, w, h, d, color, yaw) => batch.add('box', mat, x, y, z, w, h, d, color, yaw);
  function solid(mat, x, z, w, d, bottom, top, climb = false) {
    box(mat, x, (bottom + top) / 2, z, w, top - bottom, d);
    level.box(x, z, w, d, bottom, top, climb);
  }
  function slab(x1, x2, z1, z2, mat = 'ground', y = 0) {
    box(mat, (x1 + x2) / 2, y - 0.14, (z1 + z2) / 2, x2 - x1, 0.28, z2 - z1);
  }
  function beam(mat, a, b, width, depth = width) {
    const delta = new THREE.Vector3().subVectors(b, a);
    const center = a.clone().lerp(b, 0.5);
    const rotation = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), delta.clone().normalize()));
    batch.add('box', mat, center.x, center.y, center.z, width, delta.length() + width * 0.45, depth,
      0xffffff, rotation.y, rotation.x, rotation.z);
  }

  // 下挖墓穴，地表网格留出坡道。长方形顶板同时是可步行的墓地地面。
  const innerWest = crypt.x - crypt.width / 2, innerEast = crypt.x + crypt.width / 2;
  slab(-45, innerWest, -45, bridge.wall, 'lawn');
  slab(innerEast, 45, -45, bridge.wall);
  slab(innerWest, innerEast, -45, crypt.north, 'lawn');
  slab(innerWest, innerEast, crypt.south, bridge.wall, 'lawn');
  slab(innerWest, innerEast, crypt.flatNorth, crypt.flatSouth, 'stone', -crypt.depth);
  for (const [edge, inside] of [[crypt.north, crypt.flatNorth], [crypt.south, crypt.flatSouth]]) {
    const run = Math.abs(inside - edge);
    const pitch = Math.atan2(Math.sign(inside - edge) * crypt.depth, run);
    batch.add('box', 'stone', crypt.x, -crypt.depth / 2 - 0.125, (edge + inside) / 2, crypt.width, 0.25,
      Math.hypot(run, crypt.depth), 0xffffff, 0, pitch);
  }
  for (const x of [innerWest - 0.18, innerEast + 0.18]) {
    solid('stone', x, (crypt.north + crypt.south) / 2, 0.36, crypt.south - crypt.north, -crypt.depth, 0);
    for (const z of [(crypt.north + crypt.flatNorth) / 2, (crypt.flatSouth + crypt.south) / 2]) {
      solid('carved', x, z, 0.38, 10.6, 0, 0.78);
    }
  }
  solid('stone', crypt.x, (crypt.flatNorth + crypt.flatSouth) / 2, crypt.width + 0.38,
    crypt.flatSouth - crypt.flatNorth, -0.32, 0, true);

  // 外墙、雉堞与断崖。南侧只保留吊桥通向门楼。
  for (let row = 0; row < GRID.rows; row++) {
    for (let col = 0; col < GRID.columns; col++) {
      const tile = GRID.cells[row][col], x = GRID.x(col), z = GRID.z(row), cell = GRID.cell;
      if (tile === '#') {
        const horizontal = row === 0 || row === 21;
        const w = horizontal ? cell + 0.05 : 1.7, d = horizontal ? 1.72 : cell + 0.05;
        const h = row === 21 ? 7.5 : 7.1;
        solid('stone', x, z, w, d, -0.22, h);
        box('carved', x, h - 0.12, z, w + 0.29, 0.32, d + 0.29);
        for (const shift of [-0.92, 0.92]) {
          box('stone', x + (horizontal ? shift : 0), h + 0.43, z + (horizontal ? 0 : shift),
            horizontal ? 0.9 : 1.34, 0.91, horizontal ? 1.34 : 0.9);
        }
      }
      if (tile === 'v') {
        const limit = bridge.width / 2;
        if (Math.abs(x) > limit + 0.5 && z < 39) {
          batch.add('stone', 'carved', x, -4.8 - rand() * 1.5, z - 1.6, 4.1, 10.7, 4.2, 0x6e6a88, rand() * 3);
        }
      }
      if (tile === 'h') {
        const width = 2.25, thickness = 2.35;
        level.box(x, z, width, thickness, 0, 2.6);
        box('hedge', x, 1.10, z, width, 2.18, thickness);
        if (GRID.cells[row][col + 1] === 'h') solid('hedge', x + cell / 2, z, cell - width + 0.04, thickness, 0, 2.38);
        if (GRID.cells[row + 1]?.[col] === 'h') solid('hedge', x, z + cell / 2, width, cell - thickness + 0.04, 0, 2.38);
        for (let i = 0; i < 7; i++) {
          batch.add('leaf', 'leaf', x + (rand() - 0.5) * 1.85, 1.62 + rand() * 0.79, z + (rand() - 0.5) * 1.7,
            0.89, 0.72, 0.91, rand() < 0.5 ? 0x9eb8ad : 0x6d827e, rand() * 3);
        }
      }
    }
  }
  for (const x of [-43.2, 43.2]) for (const z of [-40.7, 32.4]) {
    batch.add('turret', 'stone', x, 4.8, z, 5.4, 10.3, 5.4);
    batch.add('roof', 'iron', x, 11.1, z, 4.9, 3.2, 4.9, 0x8997b4, Math.PI / 8);
    level.box(x, z, 4.5, 4.5, 0, 10);
  }
  for (let z = 32.45; z < 45; z += 0.34) box('wood', 0, -0.12, z, bridge.width, 0.24, 0.327);
  for (const x of [-3.18, 3.18]) {
    solid('iron', x, 39.1, 0.18, 13.1, -0.1, 1.0);
    for (let z = 34.2; z < 45; z += 2.45) box('wood', x, 0.58, z, 0.24, 1.33, 0.26);
    beam('iron', new THREE.Vector3(x, 0.87, 42.8), new THREE.Vector3(x * 1.17, 6.1, 33.5), 0.12);
  }
  // 隐藏碰撞延伸到悬崖边缘，防止绕过外墙进入空地。
  for (const x of [-24.1, 24.1]) level.box(x, 39, 41.8, 12, -8, 15);
  for (const x of [-7.1, 7.1]) {
    batch.add('turret', 'stone', x, 5.6, bridge.wall, 6.3, 11.2, 6.3, 0xb1b0c9);
    batch.add('roof', 'iron', x, 12.8, bridge.wall, 5.5, 4.8, 5.5, 0xb0aabf, Math.PI / 8);
    box('brass', x, 15.3, bridge.wall, 0.13, 0.65, 0.13);
    level.box(x, bridge.wall, 5.15, 5.15, 0, 11.2);
  }

  function pointedArch(x, z, w, spring, rise, base = 0, yaw = 0, beamSize = 0.33) {
    const s = Math.sin(yaw), c = Math.cos(yaw);
    const point = (local, y) => new THREE.Vector3(x + local * c, y + base, z + local * s);
    for (const sign of [-1, 1]) {
      let last = point(sign * w / 2, spring);
      beam('carved', point(sign * w / 2, 0), last, beamSize * 1.16, beamSize * 1.35);
      for (let i = 1; i <= 9; i++) {
        const t = i / 9, current = point(sign * w / 2 * (1 - t ** 1.55), spring + rise * t);
        beam(i % 3 ? 'carved' : 'edge', last, current, beamSize, beamSize);
        last = current;
      }
    }
    batch.add('crystal', 'edge', x, base + spring + rise + 0.3, z, beamSize, 0.67, beamSize, 0xcac3cc, Math.PI / 4);
  }
  pointedArch(0, bridge.wall + 0.78, 8.1, 4.2, 3.5, 0, 0, 0.71);
  solid('stone', 0, bridge.wall, 8.8, 1.47, 7.8, 10.3);
  pointedArch(0, bridge.wall - 0.88, 8.1, 4.2, 3.5, 0, 0, 0.52);
  for (const x of [-1.2, 0, 1.2]) {
    box('iron', x, 7.9, bridge.wall + 0.85, 0.11, 1.74, 0.11);
  }
  box('iron', 0, 8.35, bridge.wall + 0.85, 4.0, 0.14, 0.11);

  // 主厅十字拱和侧门。两侧墙各留两处开口，座椅外侧保留独立侧廊。
  for (const x of [hall.west, hall.east]) {
    const gaps = [-12.8, 2.2], doorWidth = 4.4;
    let from = hall.north;
    for (const z of gaps) {
      const end = z - doorWidth / 2;
      solid('stone', x, (from + end) / 2, 0.91, end - from, 0, 10.8);
      solid('stone', x, z, 0.91, doorWidth, 5.6, 10.8);
      pointedArch(x, z, doorWidth, 3.15, 2.45, 0, Math.PI / 2, 0.30);
      from = z + doorWidth / 2;
    }
    solid('stone', x, (from + hall.south) / 2, 0.91, hall.south - from, 0, 10.8);
    box('edge', x, 10.7, -5.4, 1.26, 0.32, 29.1);
  }
  for (const z of [hall.south, hall.north]) {
    const doorway = z > 0 ? 7 : 5;
    for (const sign of [-1, 1]) {
      const gap = doorway / 2;
      solid('stone', sign * (hall.east + gap) / 2, z, hall.east - gap, 0.92, 0, 11.1);
      batch.add('turret', 'carved', sign * 11.9, 6.5, z, 2.75, 12.6, 2.75);
      batch.add('roof', 'iron', sign * 11.9, 15, z, 2.85, 4.8, 2.85);
      level.box(sign * 11.9, z, 2.5, 2.5, 0, 12.8);
    }
    solid('stone', 0, z, doorway, 0.94, 6.55, 11.1);
    pointedArch(0, z + 0.52, doorway, 4.0, 2.5, 0, 0, 0.50);
  }
  // 山墙装饰与不连续的屋面保留读图所需的雷光和月光。
  const roofSlope = 0.45;
  for (const sign of [-1, 1]) {
    for (const [z, depth] of [[5.72, 7.9], [-16.95, 6.6], [-4.9, 2.8]]) {
      batch.add('box', 'iron', sign * 6.4, 13.68, z, 14.55, 0.42, depth, 0xa6a6c0, 0, 0, -sign * roofSlope);
    }
    beam('edge', new THREE.Vector3(sign * 12.9, 11, hall.south + 0.52), new THREE.Vector3(0, 17.1, hall.south + 0.52), 0.24);
  }
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-12.8, 0); gableShape.lineTo(12.8, 0); gableShape.lineTo(0, 5.95); gableShape.closePath();
  const gableGeometry = new THREE.ShapeGeometry(gableShape);
  const gable = new THREE.Mesh(gableGeometry, new THREE.MeshLambertMaterial({ color: 0x4b526c, side: THREE.DoubleSide }));
  gable.position.set(0, 10.93, hall.south + 0.47);
  scene.add(gable);
  for (const [x, width] of [[-7.8, 8.5], [7.8, 8.5]]) {
    box('edge', x, 6.75, hall.south + 0.51, width, 0.15, 0.18, 0xc6bdc7);
    box('edge', x, 10.73, hall.south + 0.55, width, 0.25, 0.24);
    pointedArch(x, hall.south + 0.55, 2.55, 4.12, 1.56, 0.36, 0, 0.18);
    box('iron', x, 3.27, hall.south + 0.49, 0.67, 3.62, 0.08);
    box('edge', x, 2.52, hall.south + 0.57, 0.90, 0.13, 0.13);
  }
  for (const x of [-11.9, 11.9]) {
    for (const y of [1, 5.1, 9.7, 12.05]) box('edge', x, y, hall.south + 0.94, 2.65, 0.22, 0.66);
    for (const z of [-13.7, -6.2, 1.5]) {
      const face = x < 0 ? -12.95 : 12.95;
      if (z !== -13.7 && z !== 1.5) {
        box('carved', face, 3.22, z, 1.0, 6.4, 0.62);
        batch.add('crystal', 'edge', face, 6.8, z, 0.72, 1.05, 0.60, 0xab9ca7, Math.PI / 4);
      }
    }
  }
  box('brass', 0, 16.99, hall.south + 0.55, 0.14, 1.72, 0.17, 0x948393);
  box('brass', 0, 17.17, hall.south + 0.55, 0.86, 0.14, 0.17, 0x948393);
  for (const z of [-15.8, -7.0, 0.0, 6.1]) {
    pointedArch(0, z, 15.9, 6.3, 5.4, 0, 0, 0.28);
    for (const x of [-7.95, 7.95]) {
      solid('carved', x, z, 0.63, 0.72, 0, 6.4);
      box('edge', x, 0.19, z, 0.97, 0.38, 1.00);
      box('edge', x, 5.89, z, 0.94, 0.19, 1.00);
    }
  }
  for (const z of [-5.2, -2.8, -0.6, 2.6, 4.9]) for (const sign of [-1, 1]) {
    const x = sign * 4.7;
    solid('wood', x, z, 3.42, 0.84, 0, 0.75);
    box('wood', x, 0.91, z + 0.33, 3.42, 0.49, 0.12);
    for (const dx of [-1.47, 1.47]) box('carved', x + dx, 0.40, z, 0.15, 0.80, 1.0);
  }
  for (const [x, width, tint] of [[0, 7.4, 0x8c5a62], [-9.8, 2.5, 0x717e9c], [9.8, 2.5, 0x717e9c]]) {
    box('carved', x, 0.002, -5.4, width, 0.012, 28.2, tint);
    for (let z = -17; z < 8; z += 1.57) {
      box('edge', x, 0.012, z, width - 0.09, 0.007, 0.018, 0x9594a9);
    }
  }
  solid('stone', 0, -14.35, 4.9, 2.6, 0, 0.20, true);
  box('carved', 0, 0.020, 17.8, 6.9, 0.04, 25.2, 0x9e92a7);
  for (let z = 6; z < 31; z += 1.9) {
    for (const x of [-3.32, 3.32]) box('edge', x, 0.043, z, 0.11, 0.035, 1.87, 0x9a90a2);
  }
  for (let row = 0; row < 7; row++) for (let col = -4; col <= 4; col++) {
    const x = col * 3.12 + (row % 2) * 1.54, z = 10.8 + row * 2.75;
    if (Math.abs(x) > 3.9) box('ground', x, 0.004, z, 2.99, 0.032, 2.61, rand() < 0.5 ? 0x9f98ab : 0xb7afb9);
  }
  for (const [x, z] of [[-9.6, 19], [9.5, 15.5], [20.6, 3], [-20, 2]]) {
    solid('stone', x, z, 1.65, 1.3, 0, 0.84);
    box('edge', x, 0.82, z, 1.88, 0.18, 1.55);
  }

  // 彩窗的投影预先烘焙为程序纹理，在地面叠加彩色光斑。
  function stainedWindow(x, y, z, width, height, yaw, rose = false) {
    const texture = rose ? glass.rose : glass.lancet;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({
      map: texture, color: brighter(rose ? 0xffdce0 : 0xe6e9ff, 1.85), transparent: true, alphaTest: 0.12, side: THREE.DoubleSide,
    }));
    pane.position.set(x, y, z); pane.rotation.y = yaw; scene.add(pane);
  }
  stainedWindow(0, 8.66, hall.north + 0.53, 4.55, 4.55, 0, true);
  stainedWindow(0, 8.88, hall.south + 0.50, 3.62, 3.62, 0, true);
  for (const x of [-8.2, 8.2]) stainedWindow(x, 7.45, hall.north + 0.50, 1.94, 5.5, 0);
  const castLights = [];
  for (const sign of [-1, 1]) {
    for (const z of [-7.35, 0.75]) {
      const x = sign * 12.08;
      stainedWindow(x, 7.15, z, 2.15, 4.9, Math.PI / 2);
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 10.2), new THREE.MeshBasicMaterial({
        map: glass.lancet, color: brighter(0xaba2fc, 1.15), transparent: true, opacity: 0.44,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      patch.rotation.set(-Math.PI / 2, 0, sign * Math.PI / 2);
      patch.position.set(sign * 6.25, 0.035, z + 0.72);
      scene.add(patch); castLights.push(patch);
    }
  }

  const candles = [];
  function candelabrum(x, y, z, branches = 3) {
    if (branches > 1) box('brass', x, y + 0.19, z, 0.06, 0.40, 0.06);
    for (let i = 0; i < branches; i++) {
      const dx = (i - (branches - 1) / 2) * 0.26, dy = (i % 2) * 0.10;
      if (branches > 1) box('brass', x + dx / 2, y + 0.34, z, Math.abs(dx) + 0.13, 0.055, 0.08);
      box('candle', x + dx, y + 0.47 + dy, z, 0.064, 0.21, 0.065, 0xcaa388);
      candles.push([x + dx, y + 0.615 + dy, z, rand() * 6.28]);
    }
  }
  for (const z of [-12, -3.6, 5.3]) for (const x of [-10.9, 10.9]) candelabrum(x, 0.76, z);
  for (const x of [-3.35, 3.35]) candelabrum(x, 0.7, -15.2, 5);
  for (const [x, z] of [[-4.8, 10.5], [4.8, 10.5], [26, 11.3], [26, -2.4], [37.8, -15.1]]) {
    solid('carved', x, z, 0.34, 0.33, 0, 1.02);
    box('brass', x, 1.04, z, 0.42, 0.12, 0.42);
    candelabrum(x, 0.85, z);
  }
  for (const z of [-11.8, -4.5, 2.9, 9.8]) {
    pointedArch(crypt.x, z, 7.35, 1.32, 1.55, -crypt.depth, 0, 0.28);
    const side = z < 0 ? 1 : -1;
    const x = crypt.x + 2.4 * side;
    solid('stone', x, z - 0.9, 1.14, 2.0, -crypt.depth, -2.57);
    box('edge', x, -2.55, z - 0.9, 1.2, 0.14, 2.12);
    candelabrum(x, -2.54, z - 1.65, 1);
  }
  for (const x of [-25.5, -20.6, -38.2]) {
    for (const z of [-14.7, -8.3, -1.6, 5.9, 11.8]) {
      const heading = (rand() - 0.5) * 0.45;
      const gx = x + (rand() - 0.5) * 1.8, gz = z + (rand() - 0.5) * 1.9;
      solid('carved', gx, gz, 0.75, 0.49, 0, 1.08);
      box('edge', gx, 1.01, gz, 0.77, 0.17, 0.18, 0xb5a9bf, heading);
      box('carved', gx, 1.33, gz, 0.14, 0.72, 0.14, 0xb5b0c0, heading);
      box('edge', gx, 1.42, gz, 0.48, 0.12, 0.16, 0xb5b0c0, heading);
      box('carved', gx, 0.05, gz + 0.76, 0.88, 0.12, 1.51, 0x777388, heading);
    }
  }

  // 双阶梯通向北回廊。台阶间距、提升量和净宽可在 LANDMARKS 调整。
  const stepRun = (tower.south - tower.north) / tower.steps;
  for (const x of [-tower.x, tower.x]) {
    for (let i = 0; i < tower.steps; i++) {
      const z = tower.south - (i + 0.5) * stepRun, top = (i + 1) * tower.rise / tower.steps;
      solid('stone', x, z, tower.width, stepRun + 0.02, 0, top, true);
      box('edge', x, top - 0.04, z + stepRun / 2 - 0.08, tower.width + 0.10, 0.1, 0.14);
    }
    for (const dx of [-1.71, 1.71]) {
      beam('carved', new THREE.Vector3(x + dx, 0.65, tower.south), new THREE.Vector3(x + dx, tower.rise + 0.65, tower.north), 0.22);
    }
    solid('stone', x, -40.7, 5.0, 3.65, 0, 19.5);
    batch.add('turret', 'stone', x, 17.4, -40.7, 6.2, 4.2, 5.6);
    batch.add('roof', 'iron', x, 21.0, -40.7, 5.6, 6.0, 5.6, 0xb9afc8, Math.PI / 8);
    box('brass', x, 24.0, -40.7, 0.16, 1.28, 0.16);
    box('brass', x, 24.25, -40.7, 0.64, 0.13, 0.14);
    stainedWindow(x, 15.8, -38.78, 1.2, 3.65, 0);
    candelabrum(x, tower.rise + 0.68, -36.75);
  }
  solid('stone', 0, -35.6, 32.15, 4.24, tower.rise - 0.4, tower.rise, true);
  for (const z of [-37.65, -33.58]) {
    if (z < -35) solid('carved', 0, z, 32.0, 0.22, tower.rise, tower.rise + 0.88);
    else solid('carved', 0, z, 25.6, 0.22, tower.rise, tower.rise + 0.88);
  }
  for (let i = -3; i <= 3; i++) {
    const x = i * 4.0;
    pointedArch(x, -37.24, 3.86, 1.98, 1.47, tower.rise, 0, 0.23);
    if (i < 3) solid('carved', x + 1.96, -37.24, 0.42, 0.46, tower.rise, tower.rise + 2.05);
    if (i % 2 === 0) candelabrum(x, tower.rise + 0.61, -37.1);
  }
  box('iron', 0, tower.rise + 3.72, -35.62, 32.3, 0.25, 4.44);
  for (const x of [-13.05, 13.05]) solid('carved', x, -36.1, 0.74, 0.74, 0, tower.rise - 0.4);
  for (const x of [-4.2, 4.2]) solid('carved', x, -36.1, 0.79, 0.82, 0, tower.rise - 0.4);
  batch.add('turret', 'brass', -14.4, 9.1, -38.1, 1.24, 1.24, 1.24, 0xb99864);
  box('brass', -14.4, 8.36, -38.1, 0.2, 0.43, 0.19);

  // 马厩保留两端通行，围栏、料槽和断掉的椽子提供短掩体。
  for (const z of [14, 18, 22, 26]) {
    for (const x of [28.4, 37.0]) solid('wood', x, z, 0.3, 0.3, 0, 3.6);
    beam('wood', new THREE.Vector3(28.25, 3.16, z), new THREE.Vector3(37.15, 4.15, z), 0.24);
    if (z !== 14) solid('wood', 35.1, z, 3.8, 0.36, 0, 1.16);
  }
  batch.add('box', 'wood', 32.8, 3.72, 20, 9.05, 0.24, 13.9, 0x8b8496, 0, 0, 0.11);
  solid('wood', 37, 20, 0.27, 12.25, 0, 2.9);
  for (const [x, z] of [[30.5, 24.2], [25.8, 20.7], [36.4, 12.8], [20.2, 25.5]]) {
    solid('wood', x, z, 1.2, 1.0, 0, 0.82);
    box('iron', x, 0.6, z, 1.24, 0.075, 1.03);
  }
  candelabrum(28.4, 1.55, 14, 1);
  candelabrum(28.4, 1.55, 26, 1);

  for (const [x, z] of [[23.1, -15], [37.5, -21.8], [-24.7, 16.4], [-39, -18.7], [32.2, -2.9], [19, 29.8]]) {
    solid('wood', x, z, 0.61, 0.60, 0, 2.5);
    const root = new THREE.Vector3(x, 1.7, z);
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4 + rand(), length = 1.4 + rand() * 1.72;
      const tip = new THREE.Vector3(x + Math.cos(a) * length, 3.6 + rand() * 2.55, z + Math.sin(a) * length);
      beam('wood', root, tip, 0.17);
      if (x > 0) batch.add('leaf', 'leaf', tip.x, tip.y, tip.z, 1.62, 1.28, 1.63, 0x909ea0, a);
    }
    beam('wood', new THREE.Vector3(x, 2.2, z), new THREE.Vector3(x - 0.24, 6.55, z + 0.15), 0.28);
  }
  batch.flush();

  const sky = new THREE.HemisphereLight(0xa8b8f2, 0x534255, 1.48);
  const moonlight = new THREE.DirectionalLight(0xb1c8ff, 1.83);
  moonlight.position.set(-32, 49, -65);
  const flash = new THREE.DirectionalLight(0xc6d4ff, 0);
  flash.position.set(40, 44, -28);
  scene.add(sky, moonlight, flash);
  const makeLight = (x, y, z, hue, intensity, range) => {
    const light = new THREE.PointLight(hue, intensity, range, 2);
    light.position.set(x, y, z); scene.add(light);
    return { light, intensity };
  };
  const fireLights = [
    makeLight(-3.3, 2.55, -14, 0xf57962, 82, 17),
    makeLight(2.6, 4.0, 8.45, 0xffa66d, 65, 18),
    makeLight(-34, -0.95, -8.7, 0xe89567, 34, 12),
    makeLight(-30.7, -1, 6.6, 0xb47965, 40, 13),
    makeLight(0, 5.75, 33.9, 0xec8a6f, 58, 16),
    makeLight(-4.8, 4.5, 14.9, 0xb5b7ff, 103, 21),
    makeLight(26, 3.4, 3.1, 0xffb078, 63, 16),
  ];
  return { candles, fireLights, moonlight, sky, flash, castLights };
}

function makeStainedGlass(canvasTexture) {
  const colors = ['#c73554', '#584ba7', '#1c639f', '#de8050', '#439aaf', '#b45681'];
  function paintedPath(ctx, points, fill, outline = '#272538') {
    ctx.beginPath(); ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = outline; ctx.stroke();
  }
  const rose = canvasTexture(256, 256, ctx => {
    ctx.translate(128, 128);
    ctx.lineWidth = 3;
    const point = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
    ctx.fillStyle = '#272538';
    ctx.beginPath(); ctx.arc(0, 0, 122, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 24; i++) {
      const a = Math.PI * i / 12, b = a + Math.PI / 12;
      paintedPath(ctx, [point(80, a), point(117, a), point(117, b), point(80, b)], colors[i % colors.length]);
      const mid = (a + b) / 2;
      if (i % 2 === 0) {
        paintedPath(ctx, [point(17, a), point(63, a), point(83, b), point(63, b + (b - a)), point(17, b + (b - a))], colors[(3 + i / 2) % colors.length]);
      }
      paintedPath(ctx, [point(87, mid), point(99, a + 0.045), point(111, mid), point(99, b - 0.045)], '#f3ad6b');
    }
    for (const r of [22, 83, 120]) {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = '#c28a69'; ctx.lineWidth = r === 120 ? 4 : 2; ctx.stroke();
    }
    paintedPath(ctx, [[0, -17], [5, -5], [17, 0], [5, 5], [0, 17], [-5, 5], [-17, 0], [-5, -5]], '#ffd293');
  });
  const lancet = canvasTexture(128, 256, ctx => {
    ctx.beginPath(); ctx.moveTo(7, 252); ctx.lineTo(7, 94); ctx.quadraticCurveTo(9, 56, 64, 4);
    ctx.quadraticCurveTo(119, 56, 121, 94); ctx.lineTo(121, 252); ctx.closePath();
    ctx.save(); ctx.clip(); ctx.fillStyle = '#272538'; ctx.fillRect(0, 0, 128, 256);
    ctx.lineWidth = 3;
    for (let row = 0; row < 7; row++) for (let col = -1; col < 4; col++) {
      const x = 20 + col * 42 + (row % 2) * 21, y = row * 39 + 17;
      paintedPath(ctx, [[x, y - 30], [x + 21, y], [x, y + 30], [x - 21, y]], colors[(row * 2 + col + 6) % colors.length]);
    }
    ctx.fillStyle = '#b27a69'; ctx.fillRect(62, 9, 4, 243);
    ctx.restore();
    ctx.strokeStyle = '#c79a7d'; ctx.lineWidth = 4; ctx.stroke();
  });
  return { rose, lancet };
}

function createEncounter({ CONFIG: setup, sound }) {
  const rules = setup.bloodMoon;
  const status = { title: '', detail: '', remaining: 0 };
  return {
    phase: 'calm', status: null, veilUntil: -Infinity,
    get beastSpeedScale() { return this.phase === 'active' ? rules.speed : 1; },
    get beastDamageScale() { return this.phase === 'active' ? rules.damage : 1; },
    get bonusAmmo() { return this.phase === 'active' ? rules.ammo : 0; },
    get bonusHealth() { return this.phase === 'active' ? rules.health : 0; },
    reset() {
      this.phase = 'calm'; this.status = null; this.veilUntil = -Infinity;
    },
    veil(game) {
      this.veilUntil = game.time + rules.veilDuration;
      game.ui.notify('暗影弹命中，视野受阻', rules.veilDuration);
    },
    update(game) {
      const cycle = game.time % rules.period;
      const active = game.time >= rules.period && cycle < rules.duration;
      const warning = cycle >= rules.period - rules.warning;
      const phase = active ? 'active' : warning ? 'warning' : 'calm';
      if (phase !== this.phase) {
        this.phase = phase;
        const message = active ? '血月升起，击杀额外掉落弹药和圣露' :
          warning ? '血月即将升起' : '血月退去';
        game.ui.notify(message, 2.6);
        game.ui.tick = 0;
        if (active) sound.tone(139, 55, 0.88, 0.31, 'triangle');
      }
      status.title = active ? '血月当空' : '血月将升';
      status.detail = active ? '凶兽强化 / 击杀掉落弹药和圣露' : '凶兽即将强化';
      status.remaining = (active ? rules.duration : rules.period) - cycle;
      this.status = active || warning ? status : null;
    },
  };
}

function beastSurface(beast, player, level, floor, dt, game) {
  if (beast.type !== 0 && !beast.rage) {
    beast.y = Math.max(floor, beast.y - dt * 8);
    return;
  }
  const time = game.time * (beast.rage ? 6 : 9) + beast.blink;
  const near = Math.abs(floor - player.y) < 0.7 && Math.hypot(beast.x - player.x, beast.z - player.z) < 5.8;
  const lift = near ? 0.58 : beast.rage ? 0.92 : 1.65;
  const target = floor + lift + Math.sin(time) * (near ? 0.19 : 0.34);
  const y = Math.max(floor, beast.y + (target - beast.y) * Math.min(1, dt * 6.2));
  if (!level.blocked(beast.x, beast.z, y, beast.radius, beast.height)) beast.y = y;
  else beast.y = Math.max(floor, beast.y - dt * 5);
}

function wingGeometry(THREE) {
  const wing = new THREE.Shape();
  wing.moveTo(0.08, 0);
  wing.lineTo(0.40, 0.17);
  wing.lineTo(0.91, 0.01);
  wing.quadraticCurveTo(0.66, 0.01, 0.66, -0.19);
  wing.quadraticCurveTo(0.53, -0.10, 0.45, -0.30);
  wing.quadraticCurveTo(0.30, -0.21, 0.12, -0.23);
  wing.closePath();
  const one = new THREE.ShapeGeometry(wing, 2);
  const both = one.toNonIndexed();
  const flipped = both.clone().rotateY(Math.PI);
  const folded = both.clone().rotateX(-Math.PI / 2);
  const foldedOther = flipped.clone().rotateX(-Math.PI / 2);
  one.dispose();
  both.dispose();
  flipped.dispose();
  return [folded, foldedOther];
}

function undeadModel(type, { THREE, shapes, mergeGeometries }, rage = false) {
  const body = [], lit = [], transform = new THREE.Object3D();
  const rock = new THREE.IcosahedronGeometry(1, 0);
  const cone = new THREE.ConeGeometry(0.5, 1, 5);
  const tube = new THREE.CylinderGeometry(0.43, 0.5, 1, 6);
  const wings = type === 0 || rage ? wingGeometry(THREE) : [];
  function part(target, source, tint, x, y, z, w, h, d, pitch = 0, yaw = 0, roll = 0) {
    const geometry = source.index ? source.toNonIndexed() : source.clone();
    transform.position.set(x, y, z); transform.scale.set(w, h, d);
    transform.rotation.set(pitch, yaw, roll, 'YXZ'); transform.updateMatrix();
    geometry.applyMatrix4(transform.matrix);
    const color = new THREE.Color(tint), data = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < data.length; i += 3) {
      data[i] = color.r; data[i + 1] = color.g; data[i + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
    target.push(geometry);
  }
  const orb = (...args) => part(body, rock, ...args);
  const spike = (...args) => part(body, cone, ...args);
  const rod = (...args) => part(body, tube, ...args);
  const plate = (...args) => part(body, shapes.box, ...args);
  const glow = (...args) => part(lit, rock, ...args);
  const bone = 0xd5c6b2, iron = 0x616785, soot = 0x33304c, red = 0x913950, violet = 0x706189;
  function bat(x, y, z, size, yaw = 0) {
    orb(soot, x, y, z, 0.15 * size, 0.13 * size, 0.28 * size, 0, yaw);
    orb(violet, x, y + 0.05 * size, z + 0.18 * size, 0.142 * size, 0.11 * size, 0.1 * size);
    for (const [index, sign] of [-1, 1].entries()) {
      const rotation = sign * 0.26;
      // 同一翅膀造型补上反向面，细薄的膜翼从上下方都可见。
      part(body, wings[index], index ? 0x64516c : 0x584666, x, y, z, size, size, size, 0, yaw, rotation);
      part(body, wings[1 - index], 0x534160, x, y, z, size, size, size, Math.PI, yaw, -rotation);
      spike(violet, x + sign * 0.10 * size, y + 0.16 * size, z + 0.17 * size, 0.094 * size, 0.175 * size, 0.09 * size);
      glow(0xff5479, x + sign * 0.069 * size, y + 0.066 * size, z + 0.268 * size, 0.023 * size, 0.023 * size, 0.024 * size);
    }
  }
  if (type === 0) {
    bat(0, 0.32, 0, 1);
  } else if (rage) {
    for (let i = 0; i < 11; i++) {
      const angle = i * 2.39996, ring = i ? 0.39 + (i % 3) * 0.21 : 0;
      bat(Math.cos(angle) * ring, 0.49 + i * 0.228, Math.sin(angle) * ring, i === 0 ? 1.1 : 0.55 + (i % 3) * 0.15, angle);
    }
    glow(0xff387b, 0, 1.67, 0.12, 0.15, 0.22, 0.15);
  } else if (type === 1) {
    orb(iron, 0, 1.41, 0, 0.47, 0.49, 0.31);
    plate(soot, 0, 1.02, 0.02, 0.56, 0.34, 0.49);
    orb(bone, 0, 1.94, 0.11, 0.23, 0.25, 0.23);
    plate(iron, 0, 2.06, 0.06, 0.45, 0.21, 0.46);
    plate(bone, 0, 1.81, 0.29, 0.25, 0.14, 0.12);
    rod(iron, 0.59, 1.15, 0.34, 0.10, 1.50, 0.10, 0.36, 0, -0.19);
    spike(bone, 0.74, 1.93, 0.60, 0.19, 0.55, 0.18, 0.36, 0, -0.19);
    plate(soot, -0.54, 1.00, 0.34, 0.56, 0.73, 0.21, 0.04, -0.20);
    plate(iron, -0.54, 1.00, 0.466, 0.34, 0.48, 0.042);
    for (const sign of [-1, 1]) {
      orb(iron, sign * 0.49, 1.58, 0, 0.30, 0.26, 0.27);
      rod(bone, sign * 0.48, 1.19, 0.07, 0.18, 0.61, 0.16, -0.25);
      rod(bone, sign * 0.24, 0.54, 0, 0.17, 0.81, 0.16, 0, 0, sign * 0.12);
      plate(iron, sign * 0.25, 0.28, 0.07, 0.30, 0.48, 0.32);
      plate(soot, sign * 0.25, 0.095, 0.145, 0.28, 0.17, 0.47);
      glow(0xff856b, sign * 0.096, 1.965, 0.31, 0.04, 0.028, 0.025);
    }
  } else if (type === 2) {
    spike(soot, 0, 0.71, 0.0, 0.9, 1.45, 0.76);
    orb(violet, 0, 1.21, 0.03, 0.42, 0.33, 0.32);
    orb(soot, 0, 1.61, 0.04, 0.31, 0.32, 0.29);
    orb(bone, 0, 1.56, 0.22, 0.133, 0.16, 0.12);
    spike(violet, 0, 1.89, -0.10, 0.32, 0.25, 0.30, -0.28);
    rod(soot, 0.54, 0.86, 0.22, 0.073, 1.71, 0.076, 0.16, 0, 0.15);
    orb(violet, 0.42, 1.74, 0.36, 0.14, 0.19, 0.14);
    glow(0xac75e8, 0.42, 1.77, 0.39, 0.096, 0.13, 0.082);
    for (const sign of [-1, 1]) {
      rod(violet, sign * 0.43, 1.17, 0.21, 0.26, 0.65, 0.26, -0.8, 0, sign * 0.42);
      glow(0xd99afe, sign * 0.066, 1.59, 0.327, 0.027, 0.022, 0.025);
    }
  } else {
    plate(soot, 0, 1.63, -0.28, 0.98, 2.2, 0.22, -0.08);
    rod(red, 0, 1.64, 0, 0.87, 1.75, 0.54);
    plate(iron, 0, 2.11, 0.25, 0.57, 0.47, 0.14);
    orb(0xe9d2cf, 0, 2.82, 0.16, 0.31, 0.36, 0.28);
    orb(soot, 0, 3.01, 0.055, 0.34, 0.24, 0.31);
    for (const sign of [-1, 1]) {
      plate(red, sign * 0.54, 1.49, -0.29, 0.48, 2.65, 0.16, 0.17, sign * 0.22, sign * 0.15);
      spike(soot, sign * 0.32, 2.69, -0.065, 0.43, 0.86, 0.23, 0.1, 0, -sign * 0.66);
      rod(soot, sign * 0.58, 1.96, 0.07, 0.34, 0.95, 0.30, -0.4, 0, sign * 0.18);
      orb(0xd2bec7, sign * 0.65, 1.55, 0.27, 0.17, 0.21, 0.17);
      rod(iron, sign * 0.25, 0.65, 0.04, 0.32, 1.28, 0.31);
      plate(soot, sign * 0.25, 0.13, 0.13, 0.38, 0.25, 0.56);
      glow(0xff486a, sign * 0.114, 2.90, 0.403, 0.043, 0.033, 0.032);
      spike(bone, sign * 0.087, 2.716, 0.409, 0.06, 0.15, 0.05, Math.PI);
    }
    glow(0xf4a279, 0, 2.27, 0.344, 0.083, 0.115, 0.039);
  }
  const merged = [mergeGeometries(body), mergeGeometries(lit)];
  for (const geometry of [...body, ...lit, ...wings, rock, cone, tube]) geometry.dispose();
  return merged;
}

function createEnvironment({ THREE, scene, camera, CONFIG: setup, mapData, seededRandom, canvasTexture, dynamicMesh, setInstance, updateMesh, brighter, $ }) {
  const rand = seededRandom(11484);
  const { candles, fireLights, moonlight, sky, flash, castLights } = mapData;
  const veil = document.createElement('div');
  veil.id = 'shadow-veil';
  veil.setAttribute('aria-hidden', 'true');
  Object.assign(veil.style, {
    position: 'fixed', inset: '0', pointerEvents: 'none', opacity: '0',
    background: 'radial-gradient(ellipse at 50% 50%, #22193355 12%, #151023e8 54%, #080611 100%)',
  });
  const modernGradient = 'radial-gradient(ellipse at 50% 50% in oklab, #22193355 12%, #151023e8 54%, #080611 100%)';
  if (CSS.supports('background', modernGradient)) veil.style.background = modernGradient;
  $('world').after(veil);

  const moonMap = canvasTexture(256, 256, ctx => {
    const cx = 128, cy = 128;
    const halo = ctx.createRadialGradient(cx, cy, 66, cx, cy, 126);
    halo.addColorStop(0, '#acb8ff65'); halo.addColorStop(0.52, '#a8aef228'); halo.addColorStop(1, '#9aa4e300');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, 256, 256);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, 73, 0, Math.PI * 2); ctx.clip();
    const light = ctx.createLinearGradient(70, 196, 160, 65);
    light.addColorStop(0, '#9a9bb7'); light.addColorStop(0.56, '#d0cbea'); light.addColorStop(1, '#fff4e9');
    ctx.fillStyle = light; ctx.fillRect(50, 50, 156, 156);
    for (let i = 0; i < 290; i++) {
      const x = 57 + rand() * 142, y = 56 + rand() * 145, r = 1 + rand() * 17;
      const crater = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
      crater.addColorStop(0, i % 2 ? '#625b875c' : '#faf0eb75'); crater.addColorStop(1, '#b2afd200');
      ctx.fillStyle = crater; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  });
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: moonMap, transparent: true, depthWrite: false, fog: false,
  }));
  moon.position.set(-53, 64, -83); moon.scale.setScalar(25);
  scene.add(moon);

  const starPositions = [];
  for (let i = 0; i < 175; i++) {
    const yaw = rand() * 6.2832, height = 0.16 + rand() * 0.82, r = 103 * Math.sqrt(1 - height * height);
    starPositions.push(Math.cos(yaw) * r, height * 103, Math.sin(yaw) * r);
  }
  const starsGeometry = new THREE.BufferGeometry();
  starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  scene.add(new THREE.Points(starsGeometry, new THREE.PointsMaterial({
    color: 0xb3b9ef, size: 1.45, sizeAttenuation: false, transparent: true, opacity: 0.52, fog: false,
  })));

  const flame = dynamicMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: brighter(0xff9b60, 3.5) }), candles.length);
  const coals = dynamicMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: brighter(0xffdfbf, 4.2) }), candles.length);
  const wingMat = new THREE.MeshBasicMaterial({ color: 0x111124, side: THREE.DoubleSide });
  const wings = wingGeometry(THREE).map(geometry => dynamicMesh(geometry, wingMat, 44));
  const bats = Array.from({ length: 36 }, (_, i) => ({
    x: i % 3 === 0 ? -13 : i % 3 === 1 ? 8 : 0, z: -16 - (i % 3) * 7.5,
    height: 12.5 + rand() * 13, radius: 7 + rand() * 14,
    offset: rand() * 6.28, speed: 0.33 + rand() * 0.33, size: 0.57 + rand() * 0.29,
  }));

  const mistTexture = canvasTexture(128, 64, (ctx, w, h) => {
    for (let i = 0; i < 29; i++) {
      const x = 20 + rand() * 88, y = 15 + rand() * 34, r = 9 + rand() * 15;
      const haze = ctx.createRadialGradient(x, y, 0, x, y, r);
      haze.addColorStop(0, '#d0d0ed2c'); haze.addColorStop(1, '#acb4e400');
      ctx.fillStyle = haze; ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = 'destination-in';
    const fade = ctx.createRadialGradient(64, 32, 0, 64, 32, 53);
    fade.addColorStop(0, '#fff'); fade.addColorStop(1, '#ffffff00');
    ctx.fillStyle = fade; ctx.fillRect(0, 0, w, h);
  });
  const mist = [
    [-13, 22, 0.50], [9, 28, 0.7], [-26, 8, 0.8], [-36, -16, 0.8], [-32.4, -7, -2.8], [-32.4, 5, -2.72],
    [27, -11, 0.85], [32, 9.2, 0.35], [0, -19, 0.53], [10, -28, 0.58], [0, -2, 0.29], [0, 38, -1.4],
  ];
  const mistMaterial = new THREE.MeshBasicMaterial({
    map: mistTexture, color: 0x7f89b9, transparent: true, opacity: 0.48, depthWrite: false, side: THREE.DoubleSide,
  });
  const mistMesh = dynamicMesh(new THREE.PlaneGeometry(1, 1), mistMaterial, mist.length);

  const boltPoints = [];
  let xi = 31, zi = -72;
  for (let i = 0; i < 9; i++) {
    boltPoints.push(new THREE.Vector3(xi, 48 - i * 4.6, zi));
    xi += (rand() - 0.47) * 7.5; zi += (rand() - 0.5) * 3.4;
  }
  const bolt = new THREE.Line(new THREE.BufferGeometry().setFromPoints(boltPoints),
    new THREE.LineBasicMaterial({ color: brighter(0xaebdff, 2.15), fog: false, transparent: true, depthWrite: false }));
  scene.add(bolt);
  const normal = new THREE.Color(0xb1c8ff), red = new THREE.Color(0xfa7180);
  const nightFog = new THREE.Color(0x26263f), bloodyFog = new THREE.Color(0x422438);
  const nightSky = new THREE.Color(0x15192f), bloodySky = new THREE.Color(0x2d172b);
  const paleMoon = brighter(0xdfd7ff, 1.25), bloodMoon = brighter(0xff666c, 1.6);
  let lastTime = 0, nextThunder = 14.5, lightning = -Infinity, blood = 0, lastVeil = '';
  function stampBat(index, x, y, z, scale, heading, flap) {
    for (let i = 0; i < wings.length; i++) {
      setInstance(wings[i], index, x, y, z, scale, scale, scale, null, heading, 0.04, (i ? -1 : 1) * flap);
    }
  }
  return {
    update(time, playing, game) {
      const dt = Math.min(time - lastTime, 0.04);
      lastTime = time;
      const event = game.encounter;
      const bloodTarget = event.phase === 'active' ? 1 : event.phase === 'warning' ? 0.20 : 0;
      blood += (bloodTarget - blood) * (1 - Math.exp(-dt * 2.3));
      moonlight.color.copy(normal).lerp(red, blood);
      moonlight.intensity = 1.83 + blood * 0.38;
      moon.material.color.copy(paleMoon).lerp(bloodMoon, blood);
      moon.position.y = 64 + 5.2 * blood;
      scene.fog.color.copy(nightFog).lerp(bloodyFog, blood);
      scene.background.copy(nightSky).lerp(bloodySky, blood);
      sky.intensity = 1.48 + 0.15 * blood;
      for (const patch of castLights) patch.material.opacity = 0.45 + blood * 0.14;
      if (time >= nextThunder) {
        lightning = time; nextThunder = time + 22 + rand() * 17;
        if (playing) game.sound.tone(58, 27, 0.63, 0.16, 'triangle');
      }
      const after = time - lightning;
      flash.intensity = 2.64 * Math.exp(-after * 10.5) * Number(after < 0.32);
      bolt.visible = after < 0.13;
      bolt.material.opacity = after < 0.13 ? 1 - after / 0.13 : 0;
      for (const [i, { light, intensity }] of fireLights.entries()) {
        light.intensity = intensity * (0.93 + 0.12 * Math.sin(time * 8.4 + i * 4.8) + 0.035 * Math.sin(time * 19.3 + i));
      }
      for (const [i, [x, y, z, phase]] of candles.entries()) {
        const waver = Math.sin(time * 11.9 + phase), lean = Math.cos(time * 7.2 + phase) * 0.22;
        setInstance(flame, i, x + waver * 0.013, y, z, 0.053 + waver * 0.009, 0.104 + waver * 0.024, 0.047, null, 0, 0, lean);
        setInstance(coals, i, x, y - 0.024, z, 0.028, 0.05, 0.025);
      }
      updateMesh(flame, candles.length);
      updateMesh(coals, candles.length);
      let index = 0;
      for (const bat of bats) {
        const a = time * bat.speed + bat.offset;
        stampBat(index++, bat.x + Math.cos(a) * bat.radius, bat.height + Math.sin(a * 1.7) * 1.57,
          bat.z + Math.sin(a) * bat.radius, bat.size, -a, Math.sin(time * 13 + bat.offset) * 0.74);
      }
      const boss = game.beasts.boss;
      if (boss?.rage) for (let i = 0; i < 8; i++) {
        const a = game.time * 3.9 + i * Math.PI / 4, radius = 0.72 + i % 3 * 0.17;
        stampBat(index++, boss.x + Math.cos(a) * radius, boss.y + 1.47 + Math.sin(a * 2 + i) * 0.96,
          boss.z + Math.sin(a) * radius, 0.46 + i % 3 * 0.09, -a, Math.sin(game.time * 22 + i) * 0.7);
      }
      for (const wing of wings) updateMesh(wing, index);
      mistMaterial.color.setRGB(0.28 + 0.18 * blood, 0.35 - 0.12 * blood, 0.58 - 0.18 * blood);
      for (const [i, [x, z, y]] of mist.entries()) {
        const shift = time * 0.29 + i * 1.41;
        const yaw = Math.atan2(camera.position.x - x, camera.position.z - z);
        setInstance(mistMesh, i, x + Math.sin(shift) * 1.75, y + Math.cos(shift * 1.5) * 0.17, z,
          8.5 + i % 3 * 2.2, 1.5 + i % 3 * 0.45, 1, null, yaw, 0, Math.sin(shift) * 0.06);
      }
      updateMesh(mistMesh, mist.length);

      const left = (event.veilUntil - game.time) / setup.bloodMoon.veilDuration;
      const opacity = playing && left > 0 && !game.blast ? Math.min(0.92, left * 1.52).toFixed(3) : '0';
      if (lastVeil !== opacity) { lastVeil = opacity; veil.style.opacity = opacity; }
    },
  };
}

function createPortal({ THREE, scene, level, brighter, TAU }) {
  const group = new THREE.Group();
  group.position.copy(level.gate);
  scene.add(group);
  const additive = (color, opacity) => new THREE.MeshBasicMaterial({
    color, opacity, side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.17, 1.58, 8.25, 28, 1, true), new THREE.ShaderMaterial({
    transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, open: { value: 0 }, broken: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `
      varying vec2 vUv;
      uniform float time, open, broken;
      void main() {
        float ribbon = pow(0.5+0.5*sin(vUv.x*37.699+vUv.y*14.0-time*2.7),5.0);
        float flare = pow(0.5+0.5*sin(vUv.x*75.398-vUv.y*11.0+time*4.2),3.0);
        float falloff = 1.0-smoothstep(0.07,1.0,vUv.y);
        float release = sin(broken*3.14159);
        vec3 hue = mix(vec3(.90,.025,.085),vec3(2.15,1.48,.70),release);
        float alpha = (0.12+ribbon*.30+flare*.17)*falloff*(1.0-broken)*(.72+open*.36+release);
        gl_FragColor = vec4(hue,alpha);
      }`,
  }));
  beam.position.y = 4.35;
  group.add(beam);
  const sigil = new THREE.Group();
  sigil.position.set(0, 2.45, 0.91);
  const sealMat = additive(brighter(0xff9978, 2.5), 0.84);
  const outer = new THREE.Mesh(new THREE.TorusGeometry(1.63, 0.031, 5, 48), sealMat);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.020, 5, 48), sealMat);
  sigil.add(outer, inner);
  const runeGeometry = new THREE.BufferGeometry();
  const points = [];
  function line(ax, ay, bx, by) { points.push(ax, ay, 0, bx, by, 0); }
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12, c = Math.cos(a), s = Math.sin(a);
    line(c * 1.39, s * 1.39, c * 1.55, s * 1.55);
    const b = a + 5 * TAU / 12;
    line(c * 1.31, s * 1.31, Math.cos(b) * 1.31, Math.sin(b) * 1.31);
  }
  line(0, -1.05, 0, 1.05); line(-0.61, 0.34, 0.61, 0.34);
  runeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const runes = new THREE.LineSegments(runeGeometry, new THREE.LineBasicMaterial({
    color: brighter(0xff9b7f, 2.0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sigil.add(runes); group.add(sigil);
  const groundSeal = new THREE.Mesh(new THREE.RingGeometry(1.46, 1.51, 54), additive(brighter(0xff385c, 2.3), 0.79));
  groundSeal.rotation.x = -Math.PI / 2; groundSeal.position.y = 0.235; group.add(groundSeal);

  const waves = [];
  for (let i = 0; i < 3; i++) {
    const wave = new THREE.Mesh(new THREE.TorusGeometry(1, 0.032, 5, 64), additive(brighter(i ? 0xffd498 : 0xfff7df, 3.1), 0));
    wave.position.y = 0.31 + i * 0.21; wave.rotation.x = -Math.PI / 2;
    group.add(wave); waves.push(wave);
  }
  return {
    update(t, ready, blast) {
      beam.material.uniforms.time.value = t;
      beam.material.uniforms.open.value = ready ? 1 : 0;
      beam.material.uniforms.broken.value = blast;
      beam.visible = blast < 1;
      sigil.visible = blast < 0.38;
      sigil.rotation.z = Math.sin(t * 0.7) * 0.045;
      sigil.scale.setScalar(1 + blast * 2.9);
      sealMat.opacity = (ready ? 0.96 : 0.69) * (1 - Math.min(1, blast * 2.45));
      runes.material.opacity = sealMat.opacity;
      groundSeal.material.opacity = 0.73 * (1 - blast);
      for (const [i, wave] of waves.entries()) {
        const age = Math.max(0, (blast - i * 0.10) / (1 - i * 0.10));
        wave.visible = age > 0 && age < 1;
        wave.scale.setScalar(1.55 + 22.3 * age ** 0.78);
        wave.material.opacity = (1 - age) ** 1.4 * (1 - i * 0.14);
      }
    },
  };
}

export default {
  story:{type:'regions',sectors:[
    {name:'吊桥南庭院',at:[-8,25],entries:[[-16,23],[0,18]]},
    {name:'大教堂侧廊',at:[7,1],entries:[[13,3],[3,-6]]},
  ]},
  weaponSkin: 'bloodmoon-castle',
  pageTitle: '血月古堡 | 第十一关',
  config: CONFIG, grid: MAP_GRID, loot, ammo, buildMap, createEnvironment, createEncounter, createPortal,
  background: 0x15192f, fog: 0x26263f,
  palette: { projectile: 0x9a68df, ichor: 0x9c4166, core: 0xffc384, rare: 0xaed7ff, blast: 0xffe9ba },
  portal: { width: 3.3, height: 4.35, useRadius: 4.6 },
  terrain: {
    ground: groundHeight,
    routeOpen(x, z) {
      // 寻路使用地面层。连通墓穴的只有南北坡道，坡侧不作为地面捷径。
      const crypt = LANDMARKS.crypt;
      const edge = Math.abs(x - crypt.x);
      return !(edge > crypt.width / 2 - 0.9 && edge < crypt.width / 2 + 0.9 &&
        z > crypt.north + 1.9 && z < crypt.south - 1.9);
    },
  },
  beastSurface,
  beastDropHeight(beast, level) { return level.surface(beast.x, beast.z, beast.y + 0.10); },
  buildBeastModel: undeadModel,
  buildRageModel: helpers => undeadModel(3, helpers, true),
  projectileGeometry: THREE => new THREE.IcosahedronGeometry(1.36, 1).scale(1, 1, 1.32),
  onProjectileHit(game) { game.encounter.veil(game); },
  area(x, z, level, y) {
    if (z > LANDMARKS.bridge.wall) return '南侧吊桥';
    if (y < -0.68) return '地下墓穴';
    if (z < -32.6 && y > 2.65) return '北侧高塔回廊';
    if (z < -20.0) return '北侧钟楼';
    if (z > 13 && x > 25) return '马厩';
    if (z >= 9) return '南庭院';
    if (x > 15.5) return '东花园迷宫';
    if (x < -15.5) return '西墓地';
    return '大教堂主厅';
  },
  minimap: {
    tiles: { '#': '#50506d', v: '#0d1020', h: '#435d52', s: '#68565e', T: '#4a4668', R: '#615875', c: '#323751' },
    beforeTiles({ ctx, px, pz }) {
      const hall = LANDMARKS.hall;
      ctx.fillStyle = '#3d405a';
      ctx.fillRect(px(hall.west), pz(hall.north), px(hall.east) - px(hall.west), pz(hall.south) - pz(hall.north));
      ctx.strokeStyle = '#696780';
      ctx.strokeRect(px(hall.west), pz(hall.north), px(hall.east) - px(hall.west), pz(hall.south) - pz(hall.north));
    },
  },
  text: {
    tag: '第十一关 / 月夜古堡', title: '血月古堡', enter: '踏上吊桥',
    enemy: '亡灵和蝠群', bossName: '吸血鬼伯爵', keyItem: '血月圣杯', portal: '血月传送门', loot: '古堡宝物',
    brief: '穿过吊桥，绕行庭院、花园和墓穴。完成亡灵击杀目标，夺取伯爵的血月圣杯，再到大教堂解除圣印。血月升起时，亡灵更凶猛，击杀可获得额外弹药和圣露。',
    rage: '吸血鬼伯爵化为蝠群，正在召集蝙蝠',
    winBrief: '圣印崩解，净化冲击波驱散了主厅的亡灵。你带着搜集到的宝物撤离。',
    safe: '吊桥安全区',
  },
};
