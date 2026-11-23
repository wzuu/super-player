const CONFIG = {
  map: { cell: 4, fog: 0.018, navCell: 1.25 },
  graphics: { maxPixelRatio: 1.25, bloomScale: 0.66, rain: 640, fireflies: 90 },
  audio: { ambient: { filter: 'bandpass', frequency: 1920, q: 0.60, activeGain: 0.14, pauseGain: 0.07 } },
  weapon: { fireRate: 10, magazine: 60, reloadTime: 1.8, baseSpread: 0.0045, maxSpread: 0.031, recoil: 0.012 },
  beasts: {
    killsToWin: 150,
    types: [
      { hp: 58, speed: 7.29, height: 1.02, radius: 0.41 },
      { hp: 168, height: 1.69, radius: 0.64, chargeSpeed: 14.3, windup: 0.76 },
      { hp: 88, height: 1.78, damage: 7, reach: 18, projectileSpeed: 23, projectileGravity: 2.4 },
      { hp: 850, height: 3.76, radius: 1.03, rageSpeed: 5.6, summonCount: 7 },
    ],
  },
  storm: {
    first: 46, period: 100, warning: 7, duration: 32, rise: 6, drain: 9,
    depth: 1.10, shallowSpeed: 0.84, deepSpeed: 0.48, ambush: 10, ambushInterval: 0.68,
  },
  poison: { damage: 3, interval: 1.9, herbRegrow: 34, reach: 1.35 },
};

// 北在首行。# 密林高墙，J 林丛，P 石柱，T 小神庙。楼梯与区域边界另用米制坐标。
const MAP_GRID = [
  '#########################',
  '#..JJ...............JJ..#',
  '#J..T...............T..J#',
  '#.J...................J.#',
  '#J...P.............P...J#',
  '#.J.P.....P...P.....P.J.#',
  '#.....P...........P.....#',
  '#J.....................J#',
  '#.....P...........P.....#',
  '#J................P....J#',
  '#.......................#',
  '#......................P#',
  '#.......................#',
  '#.......................#',
  '#J....P...........P....J#',
  '#........P.....P........#',
  '#J.P....P.......P....P.J#',
  '#....T.........J...T....#',
  '#.J...J.J.....J.J...J.J.#',
  '#J..J.J..J.....J.J.J...J#',
  '#..J.................J..#',
  '#J.P..P....P.P....P..P.J#',
  '#.J...................J.#',
  '#J..J.J...........J.J..J#',
  '#########################',
];

const PYRAMID = { z: -3, top: 5.4, tiers: [[10.9, 9.2], [9.3, 8.0], [7.65, 6.7], [5.9, 5.6], [4.25, 4.55]] };
const CAVE = { halfX: 15.5, north: -44, roofEdge: -34, mouth: -23, shaft: 10.5, halfRamp: 2.3, floor: -3.2 };
const WETLANDS = [
  { x0: -41, x1: -22, z0: -14.5, z1: 11.7, water: 0.14 },
  { x0: -16, x1: 18.5, z0: 15.5, z1: 34.3, water: 0.09 },
];
const LANDMARKS = {
  spawn: [0, 0.18, 40.46], boss: [0, 0, -23], gate: [0, PYRAMID.top, -4.45],
  loot: [
    [34, -12, '玉面具', 580], [0, 0.7, '黄金羽饰', 840, 'top'],
    [0, -39, '黑曜石匕首', 490], [-28, 7, '祭祀陶罐', 290],
    [-35, -5, '青铜祭铃', 330, 'top'], [10.5, -40.5, '翡翠蛇纹碑', 640],
    [-12, 27, '绿松石串珠', 260], [22, 22.4, '金丝护腕', 410],
    [-39, -22, '豹纹石雕', 360], [35, -30, '象牙嵌玉盒', 520],
  ],
  ammo: [[-6.6, 40.2], [21, 25], [-22, 27], [-26, 9.4], [-22, -13], [-10.5, -39],
    [10.5, -31], [15, -18], [36, 6], [26, -19]],
  herbs: [[6.6, 39.4], [22, 18], [-20, 19], [-21, -14], [-40, 13.8],
    [-10.5, -41], [13.5, -21], [37, 6], [-3.1, -1, 'top']],
};

function contains(box, x, z) {
  return x >= box.x0 && x <= box.x1 && z >= box.z0 && z <= box.z1;
}

function ground(x, z) {
  if (Math.abs(x) < CAVE.halfX && z >= CAVE.north && z <= CAVE.roofEdge) return CAVE.floor;
  if (Math.abs(Math.abs(x) - CAVE.shaft) < CAVE.halfRamp && z > CAVE.roofEdge && z < CAVE.mouth) {
    return CAVE.floor * (CAVE.mouth - z) / (CAVE.mouth - CAVE.roofEdge);
  }
  return 0;
}

function waterScale(x, z, y, game) {
  const pool = WETLANDS.find(box => contains(box, x, z));
  if (!pool) return 1;
  const tune = CONFIG.storm;
  const depth = pool.water + (game.encounter?.height ?? 0) - y;
  const drag = Math.min(1, Math.max(0, depth / 0.12));
  const deep = Math.min(1, Math.max(0, (depth - 0.16) / 0.94));
  return 1 - drag * (1 - tune.shallowSpeed) - deep * (tune.shallowSpeed - tune.deepSpeed);
}

function buildMap({ THREE, scene, level, GRID, StaticBatches, shapes, canvasTexture, seededRandom, brighter }) {
  const rng = seededRandom(430976);
  const between = (a, b) => a + (b - a) * rng();
  const palette = [0x164634, 0x24533a, 0x376044, 0x436a3b, 0x627645, 0x2e694d, 0x577c40];
  const stones = [0xb2bda3, 0xaab69f, 0xc2c4a3, 0x919c87, 0xacbca8];
  const pick = colors => colors[Math.floor(rng() * colors.length)];

  // 统一贴图绘制苔斑、石缝与湿泥颗粒，同材质的构件在地图生成结束时批量上传。
  function mottled(base, specks, grout = false) {
    return canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2400; i++) {
        ctx.fillStyle = pick(specks);
        ctx.fillRect(between(0, w), between(0, h), between(0.7, 5), between(0.7, 2.5));
      }
      if (!grout) return;
      ctx.strokeStyle = '#243b32';
      ctx.lineWidth = 2.4;
      for (let y = 0; y <= h; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y + between(-1.8, 1.8));
        for (let x = (y / 32 % 2) * 21; x <= w; x += 43) {
          ctx.moveTo(x, y);
          ctx.lineTo(x + between(-1.3, 1.3), y + 32);
        }
        ctx.stroke();
      }
    }, true);
  }

  const stoneMap = mottled('#8d9380', ['#9fa58a', '#555e4e', '#6f8260', '#859778', '#596c50'], true);
  const groundMap = mottled('#52634a', ['#425946', '#536c46', '#667553', '#4f5440', '#798059']);
  groundMap.repeat.set(18, 18);
  const barkMap = mottled('#7d7c56', ['#8d8f62', '#5c6e50', '#66664b', '#565740', '#b2aa77']);
  const leaf = new THREE.BufferGeometry();
  leaf.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, -0.44, .38, .04, -0.32, .73, .11, 0, 1, .29,
    .32, .73, .11, .44, .38, .04, 0, .47, -.12,
  ], 3));
  leaf.setIndex([0, 1, 6, 1, 2, 6, 2, 3, 6, 3, 4, 6, 4, 5, 6, 5, 0, 6]);
  leaf.computeVertexNormals();
  const materials = {
    stone: new THREE.MeshLambertMaterial({ map: stoneMap }),
    trim: new THREE.MeshLambertMaterial(),
    bark: new THREE.MeshLambertMaterial({ map: barkMap }),
    leaf: new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }),
    wood: new THREE.MeshLambertMaterial({ map: barkMap }),
    cave: new THREE.MeshLambertMaterial({ color: 0xa9baaa, map: stoneMap }),
    gold: new THREE.MeshLambertMaterial({ color: 0xd9b072, emissive: 0x271400 }),
    ember: new THREE.MeshBasicMaterial(),
  };
  const batch = new StaticBatches(materials, {
    ...shapes, leaf, trunk: new THREE.CylinderGeometry(.31, .59, 1, 7),
    spike: new THREE.ConeGeometry(.63, 1, 5), hoop: new THREE.TorusGeometry(.5, .13, 5, 14),
    rock: new THREE.DodecahedronGeometry(.62, 0),
  });
  const add = (...args) => batch.add(...args);

  const groundMaterial = new THREE.MeshLambertMaterial({ map: groundMap, color: 0xb3bca1 });
  function slab(x0, x1, z0, z1, height = 0, slope = height) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      x0, height, z0, x0, slope, z1, x1, slope, z1, x1, height, z0,
    ], 3));
    const uv = (x, z) => [(x + 50) / 100, (z + 50) / 100];
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([
      ...uv(x0, z0), ...uv(x0, z1), ...uv(x1, z1), ...uv(x1, z0),
    ], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.computeVertexNormals();
    scene.add(new THREE.Mesh(geo, groundMaterial));
  }
  slab(-50, 50, -50, CAVE.north);
  slab(-50, -CAVE.halfX, CAVE.north, CAVE.roofEdge);
  slab(CAVE.halfX, 50, CAVE.north, CAVE.roofEdge);
  slab(-CAVE.halfX, CAVE.halfX, CAVE.north, CAVE.roofEdge, CAVE.floor);
  const lip = CAVE.shaft + CAVE.halfRamp, inner = CAVE.shaft - CAVE.halfRamp;
  slab(-50, -lip, CAVE.roofEdge, CAVE.mouth);
  slab(-inner, inner, CAVE.roofEdge, CAVE.mouth);
  slab(lip, 50, CAVE.roofEdge, CAVE.mouth);
  for (const side of [-1, 1]) {
    const x = side * CAVE.shaft;
    slab(x - CAVE.halfRamp, x + CAVE.halfRamp, CAVE.roofEdge, CAVE.mouth, CAVE.floor, 0);
  }
  slab(-50, 50, CAVE.mouth, 50);

  function block(mat, x, z, w, d, bottom, top, walk = false, color = pick(stones)) {
    add('box', mat, x, (bottom + top) / 2, z, w, top - bottom, d, color);
    return level.box(x, z, w, d, bottom, top, walk);
  }

  function pillar(x, z, h = 3.4, base = ground(x, z), width = 1.25) {
    block('stone', x, z, width, width, base, base + h);
    add('box', 'trim', x, base + .21, z, width * 1.26, .41, width * 1.26, 0x7b8b6c);
    add('box', 'stone', x, base + h - .08, z, width * 1.29, .31, width * 1.29, 0xbac3a7);
    add('box', 'gold', x, base + h * .73, z, width * 1.025, .09, width * 1.025, 0x968e4e);
  }

  function plant(x, y, z, size, blades = 5) {
    const angle = between(0, Math.PI * 2);
    for (let i = 0; i < blades; i++) {
      const yaw = angle + i * Math.PI * 2 / blades;
      const h = size * between(.69, 1.14);
      add('leaf', 'leaf', x, y, z, h * between(.29, .46), h, h,
        pick(palette), yaw, between(.55, 1.33), between(-.18, .18));
    }
  }

  function tree(x, z, size, solid = true) {
    const h = between(7.1, 11.0) * size, trunk = between(.70, 1.24) * size;
    const y = Math.max(0, ground(x, z));
    add('trunk', 'bark', x, y + h / 2, z, trunk, h, trunk, 0x918d69);
    if (solid) level.box(x, z, trunk * .86, trunk * .86, y, y + h * .8);
    for (let j = 0; j < 4; j++) {
      const a = j * Math.PI / 2 + .4;
      add('rock', 'bark', x + Math.sin(a) * trunk * .55, y + .17, z + Math.cos(a) * trunk * .55,
        trunk * .53, trunk * .68, trunk * 1.75, 0x79784f, a, .29);
    }
    for (let j = 0; j < 7; j++) {
      const a = j * .898, len = size * between(3.0, 5.0);
      const ox = Math.sin(a) * len * .32, oz = Math.cos(a) * len * .32;
      add('trunk', 'bark', x + ox, y + h - .72 * size, z + oz, trunk * .29, len, trunk * .28,
        0x858258, a, 1.16);
      if (j % 2 === 0) {
        add('rock', 'leaf', x + ox * 1.53, y + h + size * between(.04, .39), z + oz * 1.53,
          len * .81, len * .29, len * .91, pick(palette), a, .12, -.17);
      }
      for (let frond = -1; frond <= 1; frond++) {
        add('leaf', 'leaf', x + ox * 1.2, y + h + frond * .20, z + oz * 1.2,
          len * .58, len * 1.32, len * .64, pick(palette), a + frond * .44, 1.40 + frond * .15);
      }
      if (j % 2 === 0) {
        const length = len * between(.61, 1.21);
        const vx = x + ox * 2.6, vz = z + oz * 2.6;
        add('trunk', 'leaf', vx, y + h - length / 2, vz, .087 * size, length, .087 * size, 0x33572f, a, .05);
        for (let k = 0; k < 3; k++) {
          add('leaf', 'leaf', vx, y + h - length * (k + .6) / 3, vz,
            .29 * size, .66 * size, .47 * size, pick(palette), a + k * 1.74, .91);
        }
      }
    }
    plant(x + trunk * .42, y, z - trunk * .69, between(.8, 1.6));
  }

  function ruin(x, z) {
    for (const side of [-1, 1]) pillar(x + side * 2.2, z, 3.65, 0, 1.02);
    block('stone', x, z, 5.5, 1.55, 3.2, 4.08);
    add('box', 'trim', x, 4.18, z, 5.88, .27, 1.94, 0x788967);
    add('box', 'gold', x, 3.74, z + .794, 4.32, .095, .04, 0x8b904c);
    for (let i = 0; i < 12; i++) {
      const vx = x + between(-2.55, 2.55);
      plant(vx, between(3, 4.2), z + between(-.6, .8), between(.64, .95), 3);
    }
  }

  for (let row = 0; row < GRID.rows; row++) {
    for (let col = 0; col < GRID.columns; col++) {
      const tile = MAP_GRID[row][col], x = GRID.x(col), z = GRID.z(row);
      if (tile === '#') {
        block('stone', x, z, 4.02, 4.02, 0, between(4.5, 5.8), false, 0x4f634e);
        tree(x + between(-.9, .9), z + between(-.9, .9), between(.82, 1.22), false);
        const ix = x - Math.sign(x) * (Math.abs(x) === 48 ? 2.0 : 0);
        const iz = z - Math.sign(z) * (Math.abs(z) === 48 ? 2.0 : 0);
        for (let i = 0; i < 5; i++) plant(ix + between(-1.7, 1.7), between(.03, 3.9), iz + between(-1.7, 1.7), between(.85, 1.85), 4);
      } else if (tile === 'J') {
        tree(x, z, between(.69, 1.0));
        if (rng() < .48) tree(x + between(-1.7, 1.7), z + 1.38, between(.49, .71));
      } else if (tile === 'P') {
        pillar(x, z, between(2.0, 3.6));
        plant(x - 1.0, 0, z + .72, .81);
      } else if (tile === 'T') {
        ruin(x, z);
      }
    }
  }

  // 河岸双层石阶与中轴板路在涨水时仍可供往返。
  block('stone', 0, 41.2, 9.2, 5.5, 0, .18, true);
  block('stone', 0, 44.3, 10.0, 1.5, -.08, .075, true);
  block('stone', 0, 39.45, 7.0, 1.0, .18, .35, true);
  function stairs(mat, axis, x, z, count, tread, width, rise) {
    for (let i = 0; i < count; i++) {
      const along = tread * (i + .5);
      const cx = axis === 'x' ? x + along : x, cz = axis === 'z' ? z + along : z;
      const w = axis === 'x' ? Math.abs(tread) + .012 : width;
      const d = axis === 'x' ? width : Math.abs(tread) + .012;
      const top = rise * (i + 1);
      block(mat, cx, cz, w, d, 0, top, true);
      const edgeX = axis === 'x' ? cx - tread * .435 : cx;
      const edgeZ = axis === 'z' ? cz - tread * .435 : cz;
      add('box', 'trim', edgeX, top - .039, edgeZ,
        axis === 'x' ? .105 : w, .055, axis === 'z' ? .105 : d, 0x99a78a);
    }
  }
  stairs('wood', 'z', 0, 39.0, 4, -.95, 3.75, .36);
  stairs('wood', 'z', 0, 10.0, 4, 1.0, 3.75, .36);
  block('wood', 0, 24.57, 3.75, 21.22, 1.13, 1.44, true, 0x9b8e58);
  for (let i = 0; i < 49; i++) {
    const z = 14.2 + i * .429;
    add('box', 'wood', 0, 1.427, z, 3.79, .056, .405, pick([0x95835b, 0x8d784a, 0x9a8e61]));
  }
  for (let i = 0; i < 8; i++) {
    for (const side of [-1, 1]) {
      const z = 14.9 + i * 2.76;
      add('trunk', 'wood', side * 1.78, .95, z, .32, 2.33, .32, 0x91754b);
    }
  }

  // 五层金字塔的下两层保留南北轴廊，东西台阶在地面通路上方汇入塔顶。
  for (let i = 0; i < PYRAMID.tiers.length; i++) {
    const [hx, hz] = PYRAMID.tiers[i], low = i * 1.08, high = low + 1.08;
    if (i < 2) {
      for (const side of [-1, 1]) block('stone', side * (hx + 2.55) / 2, PYRAMID.z, hx - 2.55, hz * 2, low, high, true);
    } else {
      block('stone', 0, PYRAMID.z, hx * 2, hz * 2, low, high, true);
    }
    for (const side of [-1, 1]) {
      const z = PYRAMID.z + side * hz;
      const lipWidth = i < 2 ? hx - 2.55 : hx * 2;
      const centers = i < 2 ? [-(hx + 2.55) / 2, (hx + 2.55) / 2] : [0];
      for (const x of centers) {
        add('box', 'trim', x, high - .14, z, lipWidth, .22, .26, 0xa2a689);
        add('box', 'gold', x, low + .20, z + side * .018, lipWidth * .92, .055, .04, 0x878844);
      }
      for (let j = 0; j < 12; j++) {
        let x = between(-hx + .2, hx - .2);
        if (Math.abs(x) < 2.57 && i < 2) x = Math.sign(x) * between(3.0, 5.6);
        plant(x, high - .08, z, between(.34, .83), 3);
      }
    }
  }
  for (const side of [-1, 1]) {
    stairs('stone', 'x', side * 17.72, PYRAMID.z, 15, side * -.90, 4.95, .36);
    pillar(side * 4.2, 9.3, 3.95, 0, 1.12);
    add('box', 'stone', side * 4.95, 2.52, 9.66, .27, 1.22, .25, 0xa9bc8b, 0, 0, side * .56);
    for (let i = 0; i < 6; i++) {
      add('box', 'gold', side * 5.26, 2.07 + .25 * i, 9.94, .13, .115, .063, 0xcdb470, 0, 0, side * .49);
    }
    pillar(side * 2.83, -5.88, 3.38, PYRAMID.top, 1.04);
    add('spike', 'stone', side * 2.83, PYRAMID.top + 3.66, -5.88, 1.22, .57, 1.22, 0xa4aa87);
    for (let i = 0; i < 4; i++) {
      const y = PYRAMID.top + 1.23 + i * .41;
      add('box', 'gold', side * (2.83 + .08 * (i % 2)), y, -5.343, .25, .047, .05, 0xcab06a, 0, 0, side * .74);
    }
    plant(side * 3.27, PYRAMID.top + .03, -6.46, .91);
  }
  for (const z of [-9, -5, -1, 3]) {
    for (const side of [-1, 1]) {
      add('box', 'trim', side * 2.49, .26, z, .36, .52, .95, 0x666f51);
      add('cylinder', 'ember', side * 2.46, .55, z, .29, .043, .29, brighter(0xb4f496, 2.9));
    }
  }
  for (let z = -22; z <= 14; z += 2.2) {
    if (z > 9.5) continue;
    add('box', 'stone', 0, .024, z, 3.55, .052, 2.10, 0xc2c3a4);
    for (const side of [-1, 1]) add('box', 'trim', side * 1.64, .058, z, .035, .019, 1.85, 0xa09760);
  }
  // 广场分布疏朗的铺地和立碑，在金字塔东西两侧保留完整绕行宽度。
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      add('box', 'stone', side * (10.8 + i * 1.9), .036, 11.7, 1.78, .071, 3.1, pick(stones));
    }
    for (const z of [-15, 9.5]) {
      add('box', 'stone', side * 4.4, .037, z, 3.0, .070, 2.4, 0xafa88a);
    }
  }

  // 球场地面保持开阔，低看台与高柱分列长边，四角各留出口。
  add('box', 'stone', 33.8, .020, -3, 18.5, .04, 25.7, 0xb9b287);
  for (let i = 0; i < 14; i++) {
    const z = -15.1 + i * 1.86;
    add('box', 'trim', 33.8, .046, z, 17.6, .014, .025, 0x78826c);
  }
  add('box', 'gold', 33.8, .053, -3, 17.48, .016, .079, 0xbfad73);
  for (const x of [25.65, 42.05]) {
    block('stone', x, -3, 1.52, 16.4, 0, .40, true);
    block('stone', x + Math.sign(x - 33.8) * .65, -3, .87, 14.5, .40, .83, true);
    pillar(x, -3, 3.85, .83, .74);
    add('hoop', 'gold', x - Math.sign(x - 33.8) * .57, 3.25, -3, 1.59, 1.59, 1.59, 0xb2a66e, Math.PI / 2);
    for (const z of [-12, 7.8]) plant(x, .08, z, 1.02);
  }

  // 双入口溶洞。岩顶兼作实体掩体，洞口之外的坡边有矮墙防止跌穿。
  block('cave', 0, -39.0, 31.0, 10, -.56, 0, true, 0xa4b096);
  for (const x of [-15.65, 15.65]) block('cave', x, -39.0, .75, 10.7, CAVE.floor, 1.25);
  block('cave', 0, -44.1, 31.2, .74, CAVE.floor, 1.2);
  for (const x of [-lip - .26, -inner + .26, inner - .26, lip + .26]) {
    block('stone', x, -28.7, .56, 10.60, CAVE.floor, .48);
  }
  block('stone', 0, -34, 15.8, .74, CAVE.floor, 1.06);
  for (const side of [-1, 1]) {
    const x = side * CAVE.shaft;
    block('stone', x, -34.05, 4.7, 1.45, -.51, .59);
    for (const z of [-24.7, -32.2]) {
      add('box', 'trim', x, ground(x, z) + .027, z, 4.4, .04, .10, 0x8e9e79);
    }
    pillar(side * 6.7, -40.55, 2.45, CAVE.floor, .91);
    for (let i = 0; i < 25; i++) {
      const rx = side * between(1.4, 14.9), rz = between(-43.8, -34.6);
      add('spike', 'cave', rx, -.87, rz, between(.2, .72), between(.32, 1.05), between(.2, .68), 0x889c82, 0, Math.PI);
    }
  }
  block('cave', 0, -41.65, 4.05, 1.46, CAVE.floor, CAVE.floor + .34, true);
  add('box', 'gold', 0, -2.79, -41.67, 2.62, .11, .83, 0xa99d5a);
  add('cylinder', 'ember', 0, -2.69, -41.67, .63, .07, .63, brighter(0xb6ffaa, 2.7));
  for (const x of [-5.7, 5.7]) {
    const z = -43.45;
    add('rock', 'cave', x, -2.43, z, 1.54, 1.39, .71, 0x657c59);
    add('spike', 'ember', x, -2.43, z + .20, .26, .51, .26, brighter(0x8de89a, 1.9));
  }
  ruin(-18, -37.7);
  ruin(18, -37.7);

  // 吊桥的连续承重面用一块碰撞体，独立木板、绳索和桥架仅表现形状。
  stairs('wood', 'x', -43.9, -5, 5, .78, 3.35, .35);
  stairs('wood', 'x', -20.0, -5, 5, -.60, 3.35, .35);
  level.box(-31.5, -5, 17.04, 3.35, 1.47, 1.75, true);
  for (let i = 0; i < 34; i++) {
    const x = -39.75 + i * .50;
    add('box', 'wood', x, 1.615, -5, .484, .25, 3.38, pick([0xa29366, 0x887449, 0xaea074]));
  }
  for (const z of [-6.7, -3.3]) {
    for (const x of [-40, -31.5, -23]) {
      add('box', 'wood', x, 1.90, z, .25, 1.95, .25, 0x9f915c);
    }
    for (let i = 0; i < 16; i++) {
      const x = -39.47 + i * 1.0625;
      const low = Math.sin(Math.PI * i / 16) * .39;
      add('box', 'wood', x, 2.67 - low, z, 1.09, .072, .081, 0xc4af75, 0, 0, -.070 * Math.cos(Math.PI * i / 16));
      add('trunk', 'wood', x, 2.19 - low * .45, z, .054, .9 - low, .054, 0xac9a62);
    }
  }
  for (let i = 0; i < 25; i++) {
    const x = -39.6 + i * .77, z = -15.6 - between(.05, 2.05);
    const h = between(5.1, 11.6);
    add('rock', 'stone', x, h * .43, z, between(1.5, 2.8), h, between(2.4, 4.3), pick([0x65745e, 0x81917a, 0xa5af92]));
    plant(x, h * .84, z, between(.66, 1.42));
  }
  block('stone', -31.5, -15.9, 19.0, 1.70, 0, 5.0, false, 0x859580);
  for (let i = 0; i < 24; i++) {
    const z = 15.8 + (i % 8) * 2.49, x = (i < 12 ? -1 : 1) * between(3.55, 15.25);
    plant(x, 0, z, between(1.68, 3.27), 7);
    if (i % 3 === 0) {
      add('rock', 'trim', x, .33, z, 1.02, .75, 1.35, 0x818b64, between(0, 6));
      level.box(x, z, .80, .86, 0, .74);
    }
  }
  for (const pool of WETLANDS) {
    for (let i = 0; i < 34; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side < 0 ? pool.x0 + between(0, 1.85) : pool.x1 - between(0, 1.85);
      const z = between(pool.z0 + .5, pool.z1 - .5);
      if (pool === WETLANDS[0] && Math.abs(z + 5) < 2.4) continue;
      plant(x, 0, z, between(.76, 2.1), 5);
    }
  }

  batch.flush();
  level.spawn.set(...LANDMARKS.spawn);
  level.bossAnchor.set(...LANDMARKS.boss);
  level.bossSpawn.copy(level.bossAnchor);
  level.gate.set(...LANDMARKS.gate);
  const sky = new THREE.HemisphereLight(0xd9e9c2, 0x405045, 1.5);
  const sun = new THREE.DirectionalLight(0xffd395, 2.40);
  sun.position.set(-26, 42, -31);
  const flash = new THREE.DirectionalLight(0xd6e9ff, 0);
  flash.position.set(22, 29, -45);
  scene.add(sky, sun, flash);
  function point(color, power, radius, x, y, z) {
    const light = new THREE.PointLight(color, power, radius, 1.72);
    light.position.set(x, y, z);
    scene.add(light);
  }
  point(0x9bff9b, 28, 13, 0, 7.85, -4.45);
  point(0xeccc82, 19, 12, 0, 2.7, -22.3);
  point(0x9affb3, 15, 10, -8.4, -1.65, -39);
  point(0xe5b478, 15, 10, 7.2, -1.50, -40);
  point(0x9ef8d0, 12, 8, 0, 1.35, 0.0);
  return { sky, sun, flash };
}

const AMBUSH_SITES = [
  [-37, -11.7], [-32, -12.8], [-25, -10.5], [-39, 4.5], [-34, 8.4], [-23.5, 5.3],
  [-14, 17], [-12.6, 23.2], [-13, 31.7], [-6.2, 30.4], [-4.8, 21.9],
  [6.1, 19.3], [9.3, 24.8], [7.2, 32.1], [15.8, 18.1], [16.5, 29.8], [17.2, 33.1],
];

function createEncounter({ CONFIG: tune, level, THREE, dynamicMesh, setInstance, updateMesh, brighter, V3, sound }) {
  const settings = tune.storm, poison = tune.poison, status = {};
  const herbs = LANDMARKS.herbs.map(([x, z, height]) => ({
    x, z, y: level.surface(x, z, height === 'top' ? Infinity : level.base(x, z) + .15), ready: 0,
  }));
  const leafMesh = dynamicMesh(new THREE.OctahedronGeometry(1, 0),
    new THREE.MeshLambertMaterial({ emissive: 0x376021 }), herbs.length * 5);
  const rings = dynamicMesh(new THREE.RingGeometry(.74, 1, 21),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: .71, depthWrite: false }), herbs.length);
  const leaves = brighter(0x9dfa72, 1.2), root = brighter(0x79e648, 1.3);
  const splash = new V3();

  const encounter = {
    settings, herbs, status: null, ambushers: new Set(),
    reset() {
      this.phase = 'calm';
      this.height = 0;
      this.nextRain = settings.first;
      this.leftToSpawn = 0;
      this.strike = -Infinity;
      this.poisonTick = Infinity;
      this.poisoned = false;
      this.population = tune.beasts.population;
      this.ambushers.clear();
      this.status = null;
      for (const herb of herbs) herb.ready = 0;
    },
    envenom(game) {
      if (this.poisoned) return;
      this.poisoned = true;
      this.poisonTick = game.time + poison.interval;
      game.ui.notify('毒镖中毒，拾取绿环标记的解毒草', 2.4);
    },
    update(game) {
      const t = game.time, p = game.player;
      const rainEnds = this.nextRain + settings.duration;
      if (this.phase === 'calm' && t >= this.nextRain - settings.warning) {
        this.phase = 'warning';
        sound.tone(68, 42, 1.1, .23, 'sine');
        game.ui.notify('雷雨将至，低地即将涨水', 2.4);
      }
      if (this.phase === 'warning' && t >= this.nextRain) {
        this.phase = 'rain';
        this.leftToSpawn = settings.ambush;
        this.nextAmbush = t + 1.8;
        this.nextStrike = t + .3;
        game.ui.notify('丛林涨水，留意浅滩伏击', 2.6);
      }
      if (this.phase === 'rain' && t >= rainEnds) {
        this.phase = 'drain';
        this.leftToSpawn = 0;
        game.ui.notify('雷雨已停，低地正在退水', 2.3);
      }
      if (this.phase === 'drain' && t >= rainEnds + settings.drain) {
        this.phase = 'calm';
        this.nextRain += settings.period;
      }
      const smooth = x => {
        const f = Math.min(1, Math.max(0, x));
        return f * f * (3 - 2 * f);
      };
      this.height = settings.depth * (this.phase === 'rain'
        ? smooth((t - this.nextRain) / settings.rise)
        : this.phase === 'drain' ? 1 - smooth((t - rainEnds) / settings.drain) : 0);

      for (const hunter of this.ambushers) {
        if (!hunter.active || !hunter.reinforcement) this.ambushers.delete(hunter);
      }
      if (this.phase === 'rain' && !game.blast) {
        if (t >= this.nextStrike) {
          this.strike = t;
          this.nextStrike = t + 5.9 + Math.random() * 4.3;
          sound.hiss(1.45, 970, 85, .39, .20);
          sound.tone(74, 25, 1.51, .42, 'triangle', .22);
        }
        if (this.leftToSpawn > 0 && t >= this.nextAmbush) {
          this.nextAmbush = t + settings.ambushInterval;
          this.spawnAmbush(game);
        }
      }
      this.population = tune.beasts.population + (this.phase === 'rain' ? this.ambushers.size : 0);
      if (!game.blast && this.poisoned) {
        const herb = herbs.find(h => t >= h.ready && Math.abs(p.y - h.y) < .82 && Math.hypot(p.x - h.x, p.z - h.z) < poison.reach);
        if (herb) {
          herb.ready = t + poison.herbRegrow;
          this.poisoned = false;
          this.poisonTick = Infinity;
          game.sound.pickup(true);
          game.sound.stageEvent('clear',game,herb);
          game.ui.notify('已拾取解毒草，毒素解除', 2.3);
          game.effects.spray(splash.set(herb.x, herb.y + .25, herb.z), root, 14, 2.7, .051, 'spark');
        } else if (t >= this.poisonTick && p.hurt(poison.damage, game, .13, undefined, 2)) {
          this.poisonTick = t + poison.interval;
        }
      }
      const poisoned = this.poisoned ? '中毒，去绿环取草' : '';
      const wet = waterScale(p.x, p.z, p.y, game) < .78;
      status.remaining = undefined;
      status.readout = undefined;
      if (this.phase === 'warning') {
        status.title = '雷雨预警';
        status.remaining = this.nextRain - t;
        status.detail = poisoned || '低地将涨水，留意高路';
      } else if (this.phase === 'rain') {
        status.title = '丛林涨水';
        status.remaining = rainEnds - t;
        status.detail = poisoned || (wet ? '深水减速，转向木板路' : '浅滩有伏兽，吊桥与板路可通行');
      } else if (this.phase === 'drain') {
        status.title = '低地退水';
        status.remaining = rainEnds + settings.drain - t;
        status.detail = poisoned || '水位下降，低路逐步恢复';
      } else if (poisoned) {
        status.title = '毒镖中毒';
        status.detail = '靠近小地图绿环处的解毒草';
      }
      this.status = this.phase === 'calm' && !poisoned ? null : status;
      this.drawHerbs(t);
    },
    spawnAmbush(game) {
      if (game.beasts.live >= tune.beasts.capacity) return;
      const p = game.player, offset = Math.floor(Math.random() * AMBUSH_SITES.length);
      // 优先检查临近的淹水点，近身浮出水面前必须留出反应距离。
      let site, distance = Infinity;
      for (let i = 0; i < AMBUSH_SITES.length; i++) {
        const candidate = AMBUSH_SITES[(offset + i) % AMBUSH_SITES.length];
        const [x, z] = candidate, d = Math.hypot(x - p.x, z - p.z);
        const hunter = tune.beasts.types[0];
        if (d < 8 || d > distance + 2 || level.blocked(x, z, 0, hunter.radius, hunter.height)) continue;
        if (game.beasts.pool.some(b => b.active && Math.hypot(b.x - x, b.z - z) < 1.8)) continue;
        site = candidate;
        distance = d;
      }
      if (!site) return;
      const [x, z] = site, hunter = game.beasts.spawn(0, x, z, 0);
      if (!hunter) return;
      this.leftToSpawn--;
      hunter.reinforcement = true;
      if (distance < 22) hunter.alert = tune.beasts.memory;
      this.ambushers.add(hunter);
      game.sound.stageEvent('warning',game,hunter);
      const water = WETLANDS.find(pool => contains(pool, x, z)).water + this.height;
      game.effects.spray(splash.set(x, water + .08, z), brighter(0xabf0c8, 1.7), 15, 4.8, .075, 'mist');
    },
    drawHerbs(t) {
      let growing = 0;
      for (const h of herbs) {
        if (t < h.ready) continue;
        for (let i = 0; i < 5; i++) {
          const a = i * 1.256;
          setInstance(leafMesh, growing * 5 + i, h.x + Math.sin(a) * .12, h.y + .28, h.z + Math.cos(a) * .12,
            .105, .27, .059, leaves, a, .76);
        }
        const r = .39 + .052 * Math.sin(t * 4 + h.x);
        setInstance(rings, growing++, h.x, h.y + .052, h.z, r, r, 1, root, 0, -Math.PI / 2);
      }
      updateMesh(leafMesh, growing * 5);
      updateMesh(rings, growing);
    },
  };
  encounter.reset();
  encounter.drawHerbs(0);
  return encounter;
}

function waterSurface({ THREE, scene }, pool, river = false) {
  const w = pool.x1 - pool.x0, d = pool.z1 - pool.z0;
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      area: { value: new THREE.Vector2(w, d) }, t: { value: 0 }, flood: { value: 0 },
      flow: { value: river ? 2.8 : 1 }, tint: { value: new THREE.Color(0x4b9876) },
    },
    vertexShader: `
      varying vec2 field;
      varying float fogDepth;
      void main() {
        field = uv;
        vec4 view = modelViewMatrix * vec4(position, 1.);
        fogDepth = -view.z;
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: `
      uniform vec2 area;
      uniform float t, flood, flow;
      uniform vec3 tint;
      varying vec2 field;
      varying float fogDepth;
      void main() {
        vec2 p = field * area;
        float edge = min(min(p.x, area.x - p.x), min(p.y, area.y - p.y));
        float w1 = sin(p.x * 2.2 + p.y * 1.5 - t * 3.7 * flow);
        float w2 = sin(p.x * .53 - p.y * 3.1 + t * 2.8);
        float ripple = pow(max(0., sin(w1 * 1.4 + w2 * .71 + p.y * .67 + t * .7)), 13.);
        float foam = exp(-edge * 2.4) * smoothstep(.3, .95, w1);
        vec3 water = tint * (.54 + .48 * flood) + ripple * vec3(.11, .28, .22) + foam * vec3(.12, .20, .12);
        float fog = 1. - exp(-pow(max(0., fogDepth) * .018, 2.));
        gl_FragColor = vec4(mix(water, vec3(.10, .17, .135), fog),
          smoothstep(0., .41, edge) * (.45 + .298 * flood));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  mesh.position.set((pool.x0 + pool.x1) / 2, pool.water, (pool.z0 + pool.z1) / 2);
  mesh.rotation.x = -Math.PI / 2;
  scene.add(mesh);
  return mesh;
}

function createEnvironment(context) {
  const { THREE, scene, camera, CONFIG: tune, mapData, seededRandom, brighter, canvasTexture } = context;
  const rng = seededRandom(27443), range = (a, b) => a + (b - a) * rng();
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const pools = WETLANDS.map(box => waterSurface(context, box));
  const river = waterSurface(context, { x0: -47.5, x1: 47.5, z0: 43.5, z1: 48.1, water: .042 }, true);
  const cloudMap = canvasTexture(256, 128, (ctx, w, h) => {
    for (let i = 0; i < 95; i++) {
      const center = range(0, w), y = range(18, 65), rx = range(18, 62), ry = range(3, 14);
      const alpha = range(.08, .24) * Math.min(1, (74 - y) / 17);
      for (const shift of [-w, 0, w]) {
        ctx.save();
        ctx.translate(center + shift, y);
        ctx.scale(rx, ry);
        const gradient = ctx.createRadialGradient(0, 0, .03, 0, 0, 1);
        gradient.addColorStop(0, 'rgba(22,43,39,' + alpha + ')');
        gradient.addColorStop(.55, 'rgba(32,52,44,' + (alpha * .7) + ')');
        gradient.addColorStop(1, 'rgba(42,59,52,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(-1, -1, 2, 2);
        ctx.restore();
      }
    }
  }, true);
  cloudMap.wrapT = THREE.ClampToEdgeWrapping;
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(119, 28, 16), new THREE.MeshBasicMaterial({
    map: cloudMap, side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
  }));
  clouds.renderOrder = -10;
  scene.add(clouds);

  // 瀑布贴图、体积光和水汽皆为程序生成，雨丝与萤火虫复用顶点缓冲。
  const fallsMap = canvasTexture(128, 256, (ctx, w, h) => {
    for (let i = 0; i < 180; i++) {
      const x = range(0, w), y = range(0, h), len = range(7, 93);
      ctx.fillStyle = 'rgba(193,246,220,' + range(.04, .39) + ')';
      for (const offset of [-h, 0, h]) ctx.fillRect(x, y + offset, range(.65, 2.8), len);
    }
  }, true);
  fallsMap.repeat.set(1, 1.45);
  const fallsMaterial = new THREE.MeshBasicMaterial({
    map: fallsMap, color: 0xd5ffe8, transparent: true, opacity: .81, side: THREE.DoubleSide, depthWrite: false,
  });
  for (const [x, z, width, height] of [[-36.0, -14.5, 3.5, 8.6], [-31.2, -14.4, 5.7, 10.1], [-25.8, -14.45, 3.0, 7.1]]) {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(width, height), fallsMaterial);
    water.position.set(x, height / 2 + .18, z);
    water.rotation.x = -.07;
    scene.add(water);
  }
  const softMap = canvasTexture(96, 96, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(225,255,229,0.82)');
    g.addColorStop(.32, 'rgba(213,243,216,0.36)');
    g.addColorStop(1, 'rgba(204,245,213,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  const mists = [];
  const mistMaterial = new THREE.SpriteMaterial({ map: softMap, color: 0xbde7c9, opacity: .39, depthWrite: false, transparent: true });
  for (let i = 0; i < 8; i++) {
    const cloud = new THREE.Sprite(mistMaterial);
    const x = -39.2 + i * 2.15 + range(-.5, .5), z = range(-14.45, -12.85), scale = range(2.9, 5.2);
    cloud.scale.set(scale * 1.85, scale * .61, 1);
    scene.add(cloud);
    mists.push({ cloud, x, z, a: i * .86 });
  }
  const shaftMap = canvasTexture(96, 128, (ctx, w, h) => {
    for (let y = 0; y < h; y++) {
      const along = y / h;
      const alpha = Math.sin(along * Math.PI) ** 1.17 * (1.22 - along);
      for (let x = 0; x < w; x++) {
        const band = Math.max(0, 1 - Math.abs(x / w * 2 - 1)) ** 2;
        const filament = .58 + .42 * Math.cos(x * .26 + .32 * Math.sin(x * .09));
        ctx.fillStyle = 'rgba(255,236,160,' + Math.min(1, band * alpha * filament) + ')';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });
  const beamMaterial = new THREE.MeshBasicMaterial({
    map: shaftMap, color: 0xffdf9c, transparent: true, depthWrite: false,
    opacity: .14, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  for (const [x, z, h, width] of [[-12, 15, 19, 6], [4, 9, 16, 4], [-27, -4, 18, 5], [26, -11, 18, 6], [-9, -26, 17, 4]]) {
    const tip = new THREE.Vector3(x - h * .46, h, z - h * .32);
    const foot = new THREE.Vector3(x, .18, z);
    const direction = new THREE.Vector3().subVectors(tip, foot);
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    for (const yaw of [0, Math.PI / 2]) {
      const geometry = new THREE.PlaneGeometry(width, direction.length());
      // 将树冠开口端收细，光束到地面逐步散开。
      const pos = geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0) pos.setX(i, pos.getX(i) * .22);
      geometry.rotateY(yaw);
      const beam = new THREE.Mesh(geometry, beamMaterial);
      beam.position.copy(tip).lerp(foot, .5);
      beam.quaternion.copy(rotation);
      scene.add(beam);
    }
  }

  const glows = new Float32Array(tune.graphics.fireflies * 3);
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.BufferAttribute(glows, 3).setUsage(THREE.DynamicDrawUsage));
  const glowMat = new THREE.PointsMaterial({
    color: brighter(0xd9ff87, 2.8), map: softMap, size: .17, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, opacity: .92,
  });
  const glowCloud = new THREE.Points(glowGeo, glowMat);
  glowCloud.frustumCulled = false;
  scene.add(glowCloud);
  const flies = Array.from({ length: tune.graphics.fireflies }, (_, i) => ({
    x: range(-43.5, 43.5), z: i % 2 ? range(13, 37) : range(-29, 15),
    y: range(.38, 4.85), a: range(0, 6.28), v: range(.42, 1.25),
  }));

  const streaks = new Float32Array(tune.graphics.rain * 6);
  const stormGeo = new THREE.BufferGeometry();
  stormGeo.setAttribute('position', new THREE.BufferAttribute(streaks, 3).setUsage(THREE.DynamicDrawUsage));
  const rainMat = new THREE.LineBasicMaterial({ color: 0xc0f2e6, transparent: true, opacity: 0, depthWrite: false });
  const shower = new THREE.LineSegments(stormGeo, rainMat);
  shower.frustumCulled = false;
  scene.add(shower);
  const drops = Array.from({ length: tune.graphics.rain }, () => ({ x: range(-25, 25), y: range(0, 15), z: range(-25, 25), speed: range(13, 24) }));

  const bolts = new Float32Array(52 * 6);
  const boltGeometry = new THREE.BufferGeometry();
  boltGeometry.setAttribute('position', new THREE.BufferAttribute(bolts, 3).setUsage(THREE.DynamicDrawUsage));
  const boltMat = new THREE.LineBasicMaterial({ color: brighter(0xe0f0ff, 4), transparent: true, opacity: 0 });
  const bolt = new THREE.LineSegments(boltGeometry, boltMat);
  bolt.frustumCulled = false;
  scene.add(bolt);
  function forkLightning() {
    let x = range(-37, 38), z = -45, y = 35, i = 0;
    function segment(nx, ny, nz, ex, ey, ez) {
      bolts.set([nx, ny, nz, ex, ey, ez], i * 6);
      i++;
    }
    for (let j = 0; j < 17; j++) {
      const nx = x + range(-2.4, 2.4), nz = z + range(-.88, .88), ny = y - range(1.3, 2.2);
      segment(x, y, z, nx, ny, nz);
      if (j % 3 === 0) {
        const side = rng() < .5 ? -1 : 1;
        let bx = x, by = y;
        for (let k = 0; k < 3; k++) {
          const ex = bx + range(.98, 2.0) * side, ey = by - range(.57, 1.43);
          segment(bx, by, z, ex, ey, z);
          bx = ex; by = ey;
        }
      }
      x = nx; y = ny; z = nz;
    }
    boltGeometry.setDrawRange(0, i * 2);
    boltGeometry.attributes.position.needsUpdate = true;
  }

  const calmFog = new THREE.Color(0x577360), stormFog = new THREE.Color(0x2e4e49);
  const calmSky = new THREE.Color(0x6c8170), stormSky = new THREE.Color(0x385454);
  let lastStrike = -Infinity;
  return {
    update(t, _playing, game) {
      const encounter = game.encounter, reduced = reduceMotion.matches;
      const flood = (encounter?.height ?? 0) / tune.storm.depth;
      const rainy = encounter?.phase === 'rain', warning = encounter?.phase === 'warning';
      const intensity = rainy ? .88 + flood * .12 : warning ? .18 : .08;
      const rain = game.phase === 'ready' ? .20 : intensity;
      scene.fog.color.copy(calmFog).lerp(stormFog, rain * .82);
      scene.fog.density = tune.map.fog * (1 + rain * .42) * (game.variation?.fog ?? 1);
      scene.background.copy(calmSky).lerp(stormSky, rain);
      clouds.position.copy(camera.position);
      clouds.rotation.y = t * .006;
      clouds.material.opacity = .66 + rain * .28;
      mapData.sun.intensity = 2.4 - rain * 1.2;
      mapData.sky.intensity = 1.5 - rain * .30;
      beamMaterial.opacity = .25 - .17 * rain;

      const strike = encounter?.strike ?? -Infinity, elapsed = game.time - strike;
      if (strike !== lastStrike && Number.isFinite(strike)) forkLightning();
      lastStrike = strike;
      const pulse = Math.max(0, 1 - elapsed / (reduced ? .48 : .24)) ** 2;
      mapData.flash.intensity = pulse * (reduced ? .40 : 3.9);
      bolt.visible = !reduced && pulse > .04;
      boltMat.opacity = pulse * .88;

      for (let i = 0; i < pools.length; i++) {
        const mesh = pools[i];
        mesh.position.y = WETLANDS[i].water + (encounter?.height ?? 0);
        mesh.material.uniforms.t.value = t;
        mesh.material.uniforms.flood.value = flood;
      }
      river.material.uniforms.t.value = t;
      fallsMap.offset.y = t * (.53 + flood * .66) % 1;
      for (const { cloud, x, z, a } of mists) {
        cloud.position.set(x + .72 * Math.sin(t * .36 + a), .58 + flood + .36 * Math.sin(t * .74 + a), z);
      }
      for (let i = 0; i < flies.length; i++) {
        const f = flies[i], a = t * f.v + f.a;
        const index = i * 3;
        glows[index] = f.x + Math.sin(a * .42);
        glows[index + 1] = f.y + Math.cos(a * .68) * .46;
        glows[index + 2] = f.z + Math.sin(a * .81) * .83;
      }
      glowGeo.attributes.position.needsUpdate = true;
      glowMat.opacity = .94 - rain * .54;

      const indoors = CAVE.floor + 3 > camera.position.y ||
        (Math.abs(camera.position.x) < 2.55 && Math.abs(camera.position.z - PYRAMID.z) < 6.4 && camera.position.y < 2.16);
      rainMat.opacity = (.11 + rain * .23) * (reduced ? .51 : 1);
      shower.visible = !indoors;
      if (!shower.visible) return;
      const count = Math.floor(drops.length * (reduced ? .34 : .45 + rain * .55));
      for (let i = 0; i < count; i++) {
        const d = drops[i], y = ((d.y - t * d.speed) % 15 + 15) % 15 - 3;
        const x = camera.position.x + d.x - y * .11, z = camera.position.z + d.z + y * .032;
        const length = rain * .41 + .33, k = i * 6;
        streaks[k] = x; streaks[k + 1] = y; streaks[k + 2] = z;
        streaks[k + 3] = x - length * .11; streaks[k + 4] = y + length; streaks[k + 5] = z + length * .032;
      }
      stormGeo.setDrawRange(0, count * 2);
      stormGeo.attributes.position.needsUpdate = true;
    },
  };
}

function createPortal({ THREE, scene, level, shapes, brighter, dynamicMesh, setInstance, updateMesh, seededRandom }) {
  const rng = seededRandom(313037);
  const group = new THREE.Group();
  group.position.copy(level.gate);
  scene.add(group);

  const limestone = new THREE.MeshLambertMaterial({ color: 0x8d9b81 });
  const bronze = new THREE.MeshLambertMaterial({ color: 0xc49d56, emissive: 0x4f2b10, emissiveIntensity: .48 });
  const jade = new THREE.MeshBasicMaterial({ color: brighter(0x48f187, 2.30) });
  const gold = new THREE.MeshBasicMaterial({ color: brighter(0xffd879, 1.84) });
  const vineMat = new THREE.MeshLambertMaterial({ color: 0x38613a });
  const veinMat = new THREE.MeshLambertMaterial({ color: 0x7b943f });
  const mist = new THREE.MeshBasicMaterial({ color: 0x3fe689, opacity: .14, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  function add(parent, geo, material, x, y, z) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  const plinth = add(group, new THREE.CylinderGeometry(1.18, 1.48, .28, 10), limestone, 0, .14, 0);
  plinth.rotation.y = Math.PI / 10;
  const edge = add(group, new THREE.CylinderGeometry(1.17, 1.23, .09, 10), bronze, 0, .31, 0);
  edge.rotation.y = plinth.rotation.y;
  const frame = add(group, new THREE.TorusGeometry(1.77, .181, 7, 48), limestone, 0, 2.15, 0);
  const rim = add(group, new THREE.TorusGeometry(1.66, .045, 8, 54), jade, 0, 2.15, .15);
  const halo = add(group, new THREE.TorusGeometry(1.96, .021, 5, 56), gold, 0, 2.15, -.059);
  const veil = add(group, new THREE.CircleGeometry(1.61, 44), mist, 0, 2.15, -.095);

  const seal = new THREE.Group();
  seal.position.set(0, 2.15, 0);
  group.add(seal);
  const disc = add(seal, new THREE.CylinderGeometry(1.27, 1.27, .30, 12), limestone, 0, 0, 0);
  disc.rotation.x = Math.PI / 2;
  add(seal, new THREE.TorusGeometry(.93, .08, 6, 24), bronze, 0, 0, .195);
  add(seal, new THREE.TorusGeometry(.43, .048, 6, 18), gold, 0, 0, .205);
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI / 5;
    const stamp = add(seal, shapes.box, bronze, Math.sin(a) * .73, Math.cos(a) * .73, .163);
    stamp.scale.set(.045, .22, .062);
    stamp.rotation.z = -a;
  }
  const jewel = add(seal, new THREE.OctahedronGeometry(.19), jade, 0, 0, .25);
  jewel.scale.z = .70;

  const vines = new THREE.Group();
  group.add(vines);
  const vineLeaves = new THREE.InstancedMesh(shapes.stone, veinMat, 54);
  const leafStamp = new THREE.Object3D();
  vines.add(vineLeaves);
  let leafCount = 0;
  for (let i = 0; i < 9; i++) {
    const side = i % 2 ? 1 : -1, a = .62 * i;
    const points = Array.from({ length: 9 }, (_, j) => {
      const s = j / 8;
      return new THREE.Vector3(side * (1.3 - s * 1.70) + Math.sin(s * 6.3 + a) * .31,
        .31 + s * (3.25 - .11 * (i % 3)),
        .26 + Math.sin(a + s * 4.5) * .26);
    });
    const vine = new THREE.CatmullRomCurve3(points);
    add(vines, new THREE.TubeGeometry(vine, 14, .035 + .016 * rng(), 5, false), vineMat, 0, 0, 0);
    for (const p of points.slice(2, 8)) {
      leafStamp.position.set(p.x + side * .092, p.y, p.z + .055);
      leafStamp.scale.set(.117, .20, .037);
      leafStamp.rotation.z = side * .63;
      leafStamp.updateMatrix();
      vineLeaves.setMatrixAt(leafCount++, leafStamp.matrix);
    }
  }

  const motes = dynamicMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial(), 38);
  const debris = dynamicMesh(shapes.box, vineMat, 70);
  const shards = Array.from({ length: 70 }, (_, i) => {
    const a = rng() * Math.PI * 2, distance = .3 + rng() * 1.46;
    return {
      x: Math.cos(a) * distance, y: 2.15 + Math.sin(a) * distance, z: (rng() - .5) * .66,
      vx: Math.cos(a) * (2.0 + rng() * 3.5), vy: 1.7 + rng() * 5, vz: (rng() - .33) * 10,
      size: .045 + rng() * .090, angle: rng() * 6.28, stone: i % 5 === 0,
    };
  });
  const green = brighter(0x59ff9c, 2.8), amber = brighter(0xffd17c, 1.8);
  const stoneColor = new THREE.Color(0xd9c696), vineColor = new THREE.Color(0x8ade81);
  const ring = add(group, new THREE.RingGeometry(.86, 1, 54), new THREE.MeshBasicMaterial({
    color: brighter(0xa7ffc6, 2.0), transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }), 0, .17, 0);
  ring.rotation.x = -Math.PI / 2;

  return {
    update(t, ready, blast) {
      const broken = blast > .035;
      seal.visible = !broken;
      vines.visible = !broken;
      rim.rotation.x = Math.sin(t * .65) * .11;
      halo.rotation.y = Math.sin(t * 1.14) * .145;
      frame.visible = blast < .75;
      rim.visible = blast < .69;
      halo.visible = blast < .78;
      veil.visible = blast < .74;
      mist.opacity = (ready ? .30 : .15) + .065 * Math.sin(t * 3.4);
      jade.color.copy(green).multiplyScalar((ready ? 1.35 : .72) + .14 * Math.sin(t * 4.0));
      jewel.rotation.y = t * 2.1;
      let sparks = 0, chunks = 0;
      if (blast < .76) {
        for (let i = 0; i < 38; i++) {
          const a = i * 2.39996 + t * (i % 2 ? .95 : -.83);
          const r = (i % 4 === 0 ? 2.12 : 1.78) + .14 * Math.sin(t * 2.2 + i);
          const s = .029 + (i % 5) * .008;
          setInstance(motes, sparks++, group.position.x + r * Math.cos(a), group.position.y + 2.15 + r * Math.sin(a),
            group.position.z + .16 + .43 * Math.sin(a + i), s, s * 1.7, s, i % 5 === 0 ? amber : green, a);
        }
      }
      if (broken && blast < 1) {
        const age = blast * 2.25;
        for (const s of shards) {
          const y = s.y + s.vy * age - 5.2 * age ** 2;
          if (y < .05) continue;
          setInstance(debris, chunks++, group.position.x + s.x + s.vx * age, group.position.y + y,
            group.position.z + s.z + s.vz * age, s.size, s.size * (s.stone ? 1.5 : 4.9), s.size,
            s.stone ? stoneColor : vineColor, s.angle + age * 4, age * 5, s.angle - age * 2);
        }
      }
      ring.visible = blast > 0 && blast < .62;
      ring.scale.setScalar(1.2 + blast * 37);
      ring.material.opacity = ring.visible ? (1 - blast / .62) * .86 : 0;
      updateMesh(motes, sparks);
      updateMesh(debris, chunks);
    },
  };
}

function jungleBeast(type, { THREE, shapes, mergeGeometries }, rage = false) {
  const solid = [], luminous = [], pivot = new THREE.Object3D();
  const facet = new THREE.IcosahedronGeometry(.70, 0);
  const joint = new THREE.CylinderGeometry(.44, .54, 1, 6);
  const spike = new THREE.ConeGeometry(.52, 1, 5);
  const wedge = new THREE.OctahedronGeometry(.75, 0);
  function join(parts, shape, color, x, y, z, w, h, d, pitch = 0, yaw = 0, roll = 0) {
    const geo = shape.index ? shape.toNonIndexed() : shape.clone();
    pivot.position.set(x, y, z);
    pivot.rotation.set(pitch, yaw, roll, 'YXZ');
    pivot.scale.set(w, h, d);
    pivot.updateMatrix();
    geo.applyMatrix4(pivot.matrix);
    const tint = new THREE.Color(color), values = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < values.length; i += 3) {
      values[i] = tint.r; values[i + 1] = tint.g; values[i + 2] = tint.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(values, 3));
    parts.push(geo);
  }
  const body = (...p) => join(solid, facet, ...p);
  const plate = (...p) => join(solid, shapes.box, ...p);
  const limb = (...p) => join(solid, joint, ...p);
  const tooth = (...p) => join(solid, spike, ...p);
  const feather = (...p) => join(solid, wedge, ...p);
  const eye = (...p) => join(luminous, facet, ...p);

  if (type === 0) {
    const fur = 0xba8d41, dark = 0x423026, cream = 0xd5c093;
    body(fur, 0, .59, -.10, .42, .33, .78);
    body(fur, 0, .66, .29, .39, .36, .42);
    body(0xc59c52, 0, .76, .53, .275, .23, .25);
    body(cream, 0, .685, .676, .182, .106, .16);
    body(dark, 0, .725, .763, .073, .065, .062);
    limb(fur, 0, .59, -.72, .097, .58, .10, -1.25);
    limb(dark, .04, .73, -.99, .085, .39, .084, -1.06, 0, -.28);
    for (const side of [-1, 1]) {
      body(fur, side * .126, .884, .472, .096, .104, .059);
      eye(0xffd173, side * .121, .770, .665, .040, .027, .040);
      for (const k of [-1, 1]) {
        const z = k * .31;
        body(fur, side * .20, .466, z, .137, .27, .165);
        limb(fur, side * .203, .247, z + k * .057, .112, .355, .101, k * -.29);
        body(cream, side * .202, .073, z + .045, .112, .081, .148);
      }
      for (let i = 0; i < 6; i++) {
        body(dark, side * (.208 + .052 * (i % 3 === 1)), .59 + .084 * (i % 2), -.48 + i * .133,
          .086, .044, .055);
      }
    }
  } else if (type === 1) {
    body(0x404537, 0, .78, -.18, .80, .75, 1.06);
    body(0x57654b, 0, .74, .43, .65, .62, .61);
    body(0x687055, 0, .60, .76, .41, .29, .36);
    body(0x98977e, 0, .63, .94, .35, .23, .13);
    for (let i = 0; i < 5; i++) {
      plate(i % 2 ? 0x959d79 : 0x788a6d, 0, 1.29 + .073 * Math.sin(i * .79), -.65 + i * .28,
        .66, .21, .25, -.14);
    }
    for (const side of [-1, 1]) {
      feather(0x6e8164, side * .34, 1.18, .35, .25, .48, .18, -.29, 0, side * -.50);
      tooth(0xcfd5ac, side * .26, .69, .92, .16, .47, .18, .79, 0, -.28 * side);
      for (const z of [-.52, .38]) {
        limb(0x565943, side * .35, .37, z, .25, .56, .26, .14);
        plate(0x343d32, side * .35, .094, z + .055, .21, .14, .24);
      }
      plate(0x7d8f6a, side * .42, .96, -.13, .20, .38, .67, 0, .07 * side, side * .29);
      eye(0xffa842, side * .30, .876, .75, .062, .048, .064);
    }
  } else if (type === 2) {
    const cloth = 0x587749, dark = 0x365645, mask = 0xa7af72;
    limb(cloth, 0, .80, -.025, .66, .96, .45);
    feather(dark, 0, 1.08, .015, .54, .54, .41);
    body(0x826e4a, 0, 1.47, .043, .35, .34, .31);
    plate(mask, 0, 1.48, .228, .36, .286, .09);
    plate(0x617544, 0, 1.607, .174, .526, .086, .20);
    limb(0x977d4c, .283, 1.27, .40, .102, .83, .112, Math.PI / 2);
    limb(0xc2ab61, .283, 1.27, .825, .118, .06, .121, Math.PI / 2);
    for (const side of [-1, 1]) {
      limb(0x877256, side * .13, .295, .015, .14, .53, .17, -.16 * side);
      body(0x56604b, side * .13, .077, .108, .126, .095, .19);
      limb(0x927751, side * .29, 1.10, .24, .115, .47, .128, side * .91);
      feather(side < 0 ? 0x8db177 : 0x729550, side * .20, 1.60, -.128, .14, .34, .17, -.21, 0, side * -.45);
      eye(0xbaff75, side * .115, 1.492, .283, .056, .028, .04);
    }
  } else {
    const shell = rage ? 0x4b8568 : 0x7e8a74;
    const scale = rage ? 0x287b54 : 0x566e59;
    const edge = rage ? 0x9ec96e : 0xa2a382;
    body(scale, 0, .37, -.06, 1.39, .53, 1.55);
    body(shell, 0, .80, -.35, 1.10, .77, .95);
    body(scale, 0, 1.30, -.16, .74, .83, .76);
    body(shell, 0, 1.91, .09, .65, .82, .71);
    body(scale, 0, 2.31, .37, .66, .78, .70);
    body(shell, 0, 2.61, .61, .82, .61, .72);
    body(edge, 0, 2.48, 1.00, .73, .31, .57);
    body(0x354932, 0, 2.26, .90, .60, .29, .53, rage ? .22 : .04);
    for (const side of [-1, 1]) {
      body(scale, side * .64, .74, -.39, .60, .46, .80);
      body(shell, side * .74, .38, .20, .63, .39, .78);
      for (let i = 0; i < 6; i++) {
        const s = i / 5, x = side * (.44 + Math.sin(s * Math.PI) * (rage ? .87 : .57));
        feather(i % 2 === 0 ? edge : scale, x, 2.94 - s * 1.65, .36 - .35 * s,
          .30 + .11 * s, .81, .27, -.38, .16 * side, side * (-.26 - s * 1.51));
      }
      for (let i = 0; i < 3; i++) {
        tooth(0xc9d4aa, side * (.19 + i * .137), 2.32, 1.10 - i * .091, .12, .20, .12, Math.PI, 0, side * .18);
      }
      eye(rage ? 0xfdc860 : 0xc6f39c, side * .39, 2.70, .992, .129, .093, .113);
      if (rage) {
        eye(0x8fff9c, side * .34, 2.24, .84, .081, .22, .095);
        eye(0xf6d977, side * .58, 1.34, .07, .085, .361, .13, .14, 0, side * -.38);
      } else {
        plate(shell, side * .57, 1.64, .17, .24, .89, .53, -.23, 0, side * -.44);
        plate(edge, side * .39, 2.51, .94, .17, .19, .21, .28);
      }
    }
    tooth(edge, 0, 3.20, .31, .33, .90, .36, -.56);
    eye(rage ? 0xffcf75 : 0x9ae884, 0, 2.89, .84, .14, .21, .11);
  }
  const model = [mergeGeometries(solid), mergeGeometries(luminous)];
  for (const g of [...solid, ...luminous, facet, joint, spike, wedge]) g.dispose();
  return model;
}

export default {
  story:{type:'regions',sectors:[
    {name:'河岸石阶',at:[-9,29],entries:[[-17,25],[0,22]]},
    {name:'西侧瀑布池',at:[-25,6],entries:[[-32,11],[-22,-3]]},
  ]},
  weaponSkin: 'jungle-temple',
  pageTitle: '雨蚀天阶 | 第十关',
  grid: MAP_GRID,
  config: CONFIG,
  loot: LANDMARKS.loot,
  ammo: LANDMARKS.ammo,
  background: 0x6c8170,
  fog: 0x577360,
  spawnPitch: .054,
  palette: { projectile: 0xb1fa67, ichor: 0x887742, spark: 0xffdc93, core: 0xffc962, rare: 0x8be5a7, blast: 0x64ff9e },
  buildMap,
  createEncounter,
  createEnvironment,
  createPortal,
  buildBeastModel: jungleBeast,
  buildRageModel(helpers) { return jungleBeast(3, helpers, true); },
  onBossRage(beast, game, { THREE, brighter }) {
    const point = new THREE.Vector3(beast.x, beast.y + 1.7, beast.z);
    game.effects.spray(point, brighter(0xa5ad8a, 1.4), 40, 8.8, .18, 'spark');
    game.effects.spray(point, brighter(0x79c87b, 1.5), 27, 7.5, .19, 'mist');
    game.sound.hiss(.58, 2300, 320, .32);
  },
  projectileGeometry(THREE) { return new THREE.ConeGeometry(.37, 4.3, 5).rotateX(Math.PI / 2); },
  onProjectileHit(game) { game.sound.tone(1350,720,.10,.15,'sine'); game.encounter.envenom(game); },
  portal: { width: 1.93, depth: .38, verticalRange: .50, useRadius: 4.26 },
  terrain: { ground, moveScale: waterScale },
  inSafeZone(x, z, margin = 0) {
    return Math.abs(x) < 5.3 + margin && z > 35 - margin;
  },
  area(x, z, level, y) {
    if (y >= PYRAMID.top - .13 && Math.abs(x) < 4.5) return '金字塔顶祭门';
    if (y < -.55 && z < CAVE.mouth) return '北侧地下祭坛与溶洞';
    if (z > 36 && Math.abs(x) < 9) return '南侧河岸石阶';
    if (z > 14) return y > 1.29 && Math.abs(x) < 2.2 ? '沼泽木板路' : '南侧沼泽与藤蔓树林';
    if (z < -19) return '北侧羽蛇祭庭';
    if (x > 22) return '东侧祭祀球场';
    if (x < -22) return y > 1.54 && Math.abs(z + 5) < 1.84 ? '西侧吊桥' : '西侧瀑布池';
    if (Math.abs(x) < 2.57 && Math.abs(z - PYRAMID.z) < 9 && y < 1.9) return '神庙南北轴廊';
    return '中央神庙广场';
  },
  minimap: {
    tiles: { '#': '#38604c', J: '#27493b', P: '#6a7356', T: '#838160' },
    beforeTiles({ ctx, px, pz, size }) {
      ctx.fillStyle = '#263e35';
      ctx.fillRect(0, 0, size, size);
      function mark(x0, x1, z0, z1, color) {
        ctx.fillStyle = color;
        ctx.fillRect(px(x0), pz(z0), px(x1) - px(x0), pz(z1) - pz(z0));
      }
      for (const p of WETLANDS) mark(p.x0, p.x1, p.z0, p.z1, '#376257');
      mark(-47.5, 47.5, 43.5, 48, '#416657');
      mark(-15.5, 15.5, -44, -34, '#575b50');
      for (const x of [-CAVE.shaft, CAVE.shaft]) mark(x - 2.3, x + 2.3, -34, -23, '#777764');
      mark(24.6, 43.0, -15.6, 9.9, '#626c53');
      mark(-10.9, 10.9, -12.2, 6.2, '#74806a');
      mark(-4.25, 4.25, -7.55, 1.55, '#8b9071');
      mark(-17.7, 17.7, -5.5, -.5, '#a09571');
    },
    overlay({ ctx, px, pz, game }) {
      const event = game.encounter, warning = event?.phase === 'warning';
      if (warning || event?.height > 0) {
        for (const p of WETLANDS) {
          ctx.fillStyle = warning ? '#d7bc551d' : '#0ccbb939';
          ctx.strokeStyle = warning ? '#deb658' : '#61d7be';
          ctx.lineWidth = 1;
          const x = px(p.x0), z = pz(p.z0), w = px(p.x1) - x, d = pz(p.z1) - z;
          ctx.fillRect(x, z, w, d);
          ctx.strokeRect(x, z, w, d);
        }
      }
      // 高路的标记盖住淹没图层，转移路线在预警与满水时同样清晰。
      ctx.fillStyle = '#b5a674';
      ctx.fillRect(px(-1.88), pz(10), px(1.88) - px(-1.88), pz(39) - pz(10));
      ctx.fillRect(px(-43.9), pz(-6.67), px(-20.0) - px(-43.9), pz(-3.33) - pz(-6.67));
      for (const herb of event?.herbs ?? []) {
        if (game.time < herb.ready) continue;
        ctx.strokeStyle = '#adf989';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.arc(px(herb.x), pz(herb.z), 2.6, 0, Math.PI * 2);
        ctx.stroke();
      }
    },
  },
  text: {
    tag: '第十关 / 雨林遗迹',
    title: '雨蚀天阶',
    enter: '进入雨林',
    brief: '从南岸进入神庙群，击败羽蛇神像守护者，带太阳石盘上塔引爆祭门。雷雨涨水时可走高处。被毒镖击中后，靠近小地图绿环处的解毒草。',
    bossName: '羽蛇神像守护者',
    keyItem: '太阳石盘',
    portal: '塔顶传送门',
    safe: '河岸石阶安全区',
    exitObjective: '从东西台阶登塔，在塔顶传送门前按 F 引爆',
    detonating: '石盘破裂，缠门藤蔓正在崩解',
    rage: '羽蛇神像石壳碎裂，猎豹群正在聚集',
  },
};
