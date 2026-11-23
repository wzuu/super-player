import { Reflector } from 'three/addons/objects/Reflector.js';

// 北在第一行。句点为空地。井号为外围墙，H 为建筑，S 为店铺，C 为集装箱，
// V 为车辆，B 为路障，W 为停车高台，O 为钟楼，G 为裂隙，M 为地铁出口。
const MAP_GRID = [
  '#########################',
  '#.......................#',
  '#.HHHH.HHHH....HHHH.HHHH#',
  '#.HHHH..............HHHH#',
  '#.......V....B....V.HHHH#',
  '#.......................#',
  '#.HHH..V........B...HHHH#',
  '#.HHH...............HHHH#',
  '#....C..V...G....V......#',
  '#..................S....#',
  '#.HH.W.C.............HHH#',
  '#.HH.......O.........HHH#',
  '#.HH................S...#',
  '#.....C..........V......#',
  '#...C..B.............HHH#',
  '#.HHH..............S.HHH#',
  '#.HHH.V..V....V...B..HHH#',
  '#...HHHH.........HHH....#',
  '#.......................#',
  '#....V....V.....B...HHH.#',
  '#..HHHH.B.......HHH.HHH.#',
  '#..HHHH.HH....B.HHH.HHH.#',
  '#..HHHH.HH......HHH.HHH.#',
  '#...........M...........#',
  '#########################',
].map(row => row.split(''));

// 立体地形和拾取点用米定位。移动地图标记时也可以在这里调整附属区域。
const LANDMARKS = {
  bridge: { x0: -18, x1: 20, z: -31.5, width: 5.5, height: 3.6, ramp: 9 },
  flood: { x0: -10, x1: 10, z0: 22, z1: 42, ramp: 4, depth: 1.55 },
  loot: [
    [-7, 39, '应急医疗箱', 120], [8, 33, '净水滤芯', 145],
    [-25, -7.8, '航空合金零件', 220, 'top'], [-33, 3, '线路继电器', 165],
    [28, -12, '加密数据芯片', 320], [33, 0, '工业蓄电池', 210],
    [28, 12, '夜视模组', 260], [-9, -31.5, '军用电台', 300, 'top'],
    [17, -31.5, '测绘终端', 280], [-14, -5, '气象记录仪', 180],
  ],
  ammo: [[2.5, 42], [-5, 26], [16, 8], [-16, 11], [-25, 1.9], [28, -12], [10, -23], [-27.5, -25], [24, -36.8], [17, 25]],
  lamps: [[-6, 39], [8, 22], [-8, 12], [7, -6], [-11, -21], [19, -27], [-23, -4], [22, 2], [21, 14], [-31, 15], [10, 33]],
};

function buildRainCity({ CONFIG, THREE, GRID, TAU, shapes, scene, brighter, canvasTexture, StaticBatches, seededRandom, level, V3 }) {
  const { cells, halfX, halfZ } = GRID;
  const random = seededRandom(723614);

  function grit(ctx, w, h, light, dark, n) {
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = random() > 0.5 ? light : dark;
      ctx.fillRect(random() * w, random() * h, random() * 4 + 1, random() * 2 + 1);
    }
  }

  const asphalt = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#38424d'; ctx.fillRect(0, 0, w, h);
    grit(ctx, w, h, '#828e972b', '#05091152', 5800);
    ctx.strokeStyle = '#060e18a8'; ctx.lineWidth = 1.25;
    for (let i = 0; i < 15; i++) {
      let x = random() * w, y = random() * h;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let j = 0; j < 7; j++) { x += (random() - 0.5) * 18; y += random() * 12; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }, true);
  const concrete = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#a3a9ad'; ctx.fillRect(0, 0, w, h);
    grit(ctx, w, h, '#e5e1d07b', '#26333f4b', 2400);
    ctx.fillStyle = '#232d394c'; ctx.fillRect(0, 4, w, 2);
    for (let i = 0; i < 42; i++) ctx.fillRect(random() * w, 0, 1 + random() * 3, random() * h);
  });
  const facade = canvasTexture(192, 256, (ctx, w, h) => {
    ctx.fillStyle = '#5f6976'; ctx.fillRect(0, 0, w, h);
    grit(ctx, w, h, '#bcc4c443', '#09152262', 4000);
    for (let y = 5; y < h; y += 43) {
      ctx.fillStyle = '#a8b1bf57'; ctx.fillRect(0, y + 34, w, 3);
      for (let x = 9; x < w - 20; x += 44) {
        ctx.fillStyle = '#101925'; ctx.fillRect(x, y, 32, 29);
        ctx.fillStyle = '#33485a'; ctx.fillRect(x + 3, y + 3, 26, 23);
        if (random() > 0.8) { ctx.fillStyle = '#b68b60'; ctx.fillRect(x + 4, y + 3, 10, 17); }
        ctx.fillStyle = '#172332'; ctx.fillRect(x + 15, y, 2, 29);
        ctx.fillStyle = '#93b9c94a'; ctx.fillRect(x + 5, y + 5, 7, 19);
        if (random() > 0.48) { ctx.fillStyle = '#131c29'; ctx.fillRect(x, y + 15, 32, 13); }
      }
    }
  });
  const metal = canvasTexture(128, 96, (ctx, w, h) => {
    ctx.fillStyle = '#818990'; ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 12) {
      ctx.fillStyle = '#333c46'; ctx.fillRect(x, 0, 3, h);
      ctx.fillStyle = '#bdc3c6'; ctx.fillRect(x + 3, 0, 3, h);
    }
    grit(ctx, w, h, '#e5d5bc65', '#54291863', 1750);
  });
  const staticMaterial = {
    wall: new THREE.MeshLambertMaterial({ map: concrete, color: 0x818c9b }),
    facade: new THREE.MeshLambertMaterial({ map: facade }),
    steel: new THREE.MeshLambertMaterial({ color: 0xa3b3c2 }),
    asphalt: new THREE.MeshLambertMaterial({ map: asphalt, color: 0x8393a3 }),
    dark: new THREE.MeshLambertMaterial({ color: 0x253344 }),
    glass: new THREE.MeshLambertMaterial({ color: 0x566d8f, emissive: 0x14283c, emissiveIntensity: 0.4 }),
    paint: new THREE.MeshLambertMaterial({ color: 0xbbcbd3, polygonOffset: true, polygonOffsetFactor: -2 }),
    container: new THREE.MeshLambertMaterial({ map: metal }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    haze: new THREE.MeshBasicMaterial({ color: 0x40536f, fog: true }),
  };

  function buildMap() {
    const city = new StaticBatches(staticMaterial);
    const add = (...args) => city.add(...args);
    const box = (m, ...args) => city.add('box', m, ...args);
    const white = brighter(0xd5f7ff, 2.6);
    const cyan = brighter(0x51f9ed, 2.7);
    const pink = brighter(0xff489a, 2.45);
    const amber = brighter(0xffa464, 2.75);
    const yellowPaint = 0xe1a759, coldPaint = 0xa2b1c3;
    const c = CONFIG.map.cell;

    function shell(material, x, z, w, d, lo, hi, color, climb = false) {
      box(material, x, (lo + hi) / 2, z, w, hi - lo, d, color);
      level.box(x, z, w, d, lo, hi, climb);
    }

    function vehicle(x, z, y, axis, color) {
      const front = axis ? [1, 0] : [0, -1], side = [-front[1], front[0]];
      const put = (kind, mat, across, up, along, w, h, d, tint) => add(kind, mat,
        x + across * side[0] - along * front[0], y + up, z + across * side[1] - along * front[1],
        w, h, d, tint, axis ? Math.PI / 2 : 0);
      put('box', 'steel', 0, 0.51, 0, 1.76, 0.47, 3.7, color);
      put('box', 'dark', 0, 0.33, 0, 1.69, 0.36, 3.56, 0x565b68);
      put('box', 'glass', 0, 0.96, 0.25, 1.48, 0.46, 1.68, 0x9aa8b8);
      put('box', 'steel', 0, 1.22, 0.27, 1.58, 0.15, 1.69, color);
      for (const offset of [-0.62, 0.62]) {
        put('box', 'steel', offset, 0.58, 1.87, 0.29, 0.10, 0.04, 0xb04a58);
        put('box', 'glass', offset, 0.60, -1.86, 0.31, 0.15, 0.05, 0xcbd8b0);
        for (const at of [-1.13, 1.14]) {
          add('cylinder', 'dark', x + offset * 1.45 * side[0] - at * front[0], y + 0.31, z + offset * 1.45 * side[1] - at * front[1],
            0.65, 0.23, 0.65, 0x657381, axis ? Math.PI / 2 : 0, 0, Math.PI / 2);
        }
      }
      level.box(x, z, axis ? 3.73 : 1.82, axis ? 1.82 : 3.73, y, y + 0.77);
      level.box(x - front[0] * 0.25, z - front[1] * 0.25, axis ? 1.7 : 1.53, axis ? 1.53 : 1.7, y + 0.77, y + 1.29);
    }

    function sign(text, width, x, y, z, facing, colors) {
      const map = canvasTexture(384, 104, (ctx, w, h) => {
        ctx.fillStyle = '#0a121e'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = colors[0]; ctx.lineWidth = 3; ctx.strokeRect(8, 8, w - 16, h - 16);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '700 48px PingFang SC, sans-serif';
        ctx.shadowBlur = 17; ctx.shadowColor = colors[0];
        ctx.fillStyle = colors[1]; ctx.fillText(text, w / 2, h / 2, w - 35);
      });
      const mat = new THREE.MeshBasicMaterial({ map, color: new THREE.Color(1.6, 1.6, 1.6) });
      const mesh = new THREE.Mesh(shapes.plane, mat);
      mesh.scale.set(width, width * 0.267, 1); mesh.position.set(x, y, z); mesh.rotation.y = facing;
      scene.add(mesh);
    }

    function shop(x, z, row) {
      const front = x - 3.5, back = x + 3.5, edge = 3.0;
      shell('wall', back, z, 0.26, 6.25, 0, 3.42, 0x8194aa);
      for (const side of [-1, 1]) {
        shell('wall', x, z + side * edge, 7.1, 0.24, 0, 3.42, 0x8194aa);
        shell('wall', front, z + 2.62 * side, 0.28, 0.72, 0, 3.42, 0x9fb1c2);
        shell('steel', front, z + 1.87 * side, 0.26, 0.80, 0, 0.85, 0x6f7f90);
        box('glass', front, 1.44, z + side * 1.98, 0.10, 1.09, 0.78, 0xb5c9d7);
        level.box(front, z + side * 1.98, 0.10, 0.78, 0.85, 1.99);
      }
      shell('wall', x, z, 7.61, 6.49, 3.34, 3.59, 0x98a3ad);
      shell('wall', front, z, 0.31, 6.2, 2.42, 3.34, 0xa3b6c1);
      box('paint', x, 0.018, z, 6.97, 0.035, 5.76, 0x536f87);
      box('glow', x - 2.15, 3.24, z, 0.16, 0.045, 3.94, row === 12 ? pink : cyan);
      shell('steel', x + 2.18, z + 1.82, 0.88, 1.6, 0, 0.84, 0x75808b);
      for (let i = -1; i <= 1; i++) box('dark', x + 2.78, 1.35 + i * 0.38, z - 1.75, 0.57, 0.12, 1.75, 0x7d8c9a);
      sign(row === 9 ? '夜线电器' : row === 12 ? '霓虹药房' : '星港便利', 4.05, front - 0.16, 2.92, z, -Math.PI / 2,
        row === 12 ? ['#fa589a', '#ffc3df'] : ['#52f5e9', '#b0fff8']);
      box('glow', front - 0.2, 0.026, z, 0.055, 0.035, 4.25, row === 12 ? pink : cyan);
    }

    function clocktower(x, z) {
      level.bossAnchor.set(x, 0, z);
      level.bossSpawn.set(x + 4.75, 0, z - 2.9);
      shell('wall', x, z, 4.35, 4.18, 0, 0.35, 0x8b9aab, true);
      shell('wall', x, z, 2.54, 2.60, 0.35, 8.40, 0xb3afb0);
      for (const dx of [-1.33, 1.33]) for (const dz of [-1.34, 1.34]) {
        box('wall', x + dx, 4.27, z + dz, 0.31, 8.26, 0.33, 0xc3b9ae);
      }
      for (const y of [0.92, 3.9, 6.27, 8.35]) box('wall', x, y, z, 2.95, 0.22, 2.99, 0xb8b1ac);
      shell('wall', x - 0.85, z - 0.86, 0.67, 0.63, 8.37, 11.17, 0x8d939e);
      shell('wall', x + 0.9, z - 0.84, 0.66, 0.60, 8.38, 9.92, 0x9e9fa5);
      box('steel', x - 0.02, 9.05, z - 0.66, 0.18, 2.88, 0.16, 0x9e816e, 0, 0, -0.52);
      box('steel', x - 0.55, 9.35, z + 0.6, 1.47, 0.22, 0.24, 0x905c40, 0, 0, 0.52);
      const face = canvasTexture(256, 256, (ctx, w, h) => {
        ctx.translate(w / 2, h / 2);
        ctx.fillStyle = '#16212d'; ctx.beginPath(); ctx.arc(0, 0, 121, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#d9a67c'; ctx.lineWidth = 5; ctx.stroke();
        ctx.strokeStyle = '#daaa84'; ctx.lineWidth = 4;
        for (let i = 0; i < 12; i++) {
          const a = i / 12 * TAU;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * 91, Math.sin(a) * 91); ctx.lineTo(Math.cos(a) * 108, Math.sin(a) * 108); ctx.stroke();
        }
        ctx.lineCap = 'round'; ctx.lineWidth = 15; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-34, -34); ctx.stroke();
        ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(48, -56); ctx.stroke();
        ctx.strokeStyle = '#fce3bb50'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-109, -45); ctx.lineTo(17, 5); ctx.lineTo(83, 83); ctx.stroke();
      });
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        const disk = new THREE.Mesh(shapes.plane, new THREE.MeshBasicMaterial({ map: face, transparent: true, alphaTest: 0.2, color: new THREE.Color(1.4, 1.4, 1.4) }));
        disk.position.set(x + Math.sin(a) * 1.315, 7.38, z + Math.cos(a) * 1.34);
        disk.rotation.y = a; disk.scale.set(2.26, 2.26, 1); scene.add(disk);
      }
      for (let j = 0; j < 29; j++) {
        const a = random() * TAU, r = 2.1 + random() * 3.6;
        add('stone', 'wall', x + Math.sin(a) * r, 0.14, z + Math.cos(a) * r, 0.34 + random() * 0.82, 0.21 + random() * 0.30, 0.45, 0x7b8e9f, a);
      }
    }

    for (let row = 0; row < GRID.rows; row++) {
      for (let col = 0; col < GRID.columns; col++) {
        const x = GRID.x(col), z = GRID.z(row);
        const y = level.base(x, z);
        const tile = cells[row][col];
        if (tile === '#') {
          const h = 3.7 + random() * 3.0;
          shell('wall', x, z, c + 0.018, c + 0.018, 0, h, 0x6f8399);
          box('steel', x, h, z, c * 0.73, 0.18, c * 0.71, 0x6d879a);
          if ((row + col) % 3 === 0) add('stone', 'wall', x + random() * 2 - 1, h - 0.06, z, 1.8, 1.4, 1.9, 0x8c9dae, random() * TAU);
        } else if (tile === 'H') {
          const h = 5.3 + random() * 9.8;
          shell('facade', x, z, c + 0.012, c + 0.012, 0, h, [0x9dacc2, 0xb1a5af, 0x8eacbb][(col + row) % 3]);
          box('dark', x, h + 0.05, z, 3.76, 0.19, 3.76, 0x6e8499);
          if ((col + row) % 3 === 1) box('steel', x + 0.75, h + 0.36, z - 0.52, 1.09, 0.57, 0.81, 0x5e6e7f);
        } else if (tile === 'S') {
          shop(x, z, row);
        } else if (tile === 'V') {
          vehicle(x, z, y, (col + row) % 2 === 0, [0x899ca8, 0xa06566, 0x4b747a, 0x81735c][(col + row) % 4]);
        } else if (tile === 'B') {
          shell('wall', x, z, 2.16, 0.70, y, y + 0.88, 0x9a968e);
          box('steel', x, y + 0.55, z - 0.363, 2.03, 0.25, 0.035, 0x594733);
          for (let s = -2; s <= 2; s++) box('paint', x + s * 0.38, y + 0.55, z - 0.385, 0.13, 0.2, 0.017, yellowPaint, 0, 0, 0.34);
        } else if (tile === 'C') {
          const w = row % 2 ? 5.8 : 4.95;
          const h = row === 8 || row === 13 ? 2.82 : 2.33;
          shell('container', x, z, w, 2.38, 0, h, [0x997068, 0x547f91, 0x9a744e][row % 3], true);
          for (const end of [-1, 1]) box('steel', x + end * (w - 0.1) / 2, h / 2, z + 1.19, 0.12, h, 0.12, 0x646f79);
        } else if (tile === 'W') {
          // 六级台阶通往箱顶与二层平台。可站立的箱体以 climb 标记。
          for (let i = 0; i < 6; i++) shell('steel', x - 1.55, z + 5.0 - i * 0.73, 2.73, 0.74, 0, (i + 1) * 0.37, 0x668595, true);
          shell('container', x - 1.55, z - 0.72, 4.88, 3.77, 0, 2.22, 0x64928e, true);
          shell('steel', x + 0.88, z - 0.82, 1.0, 2.45, 2.22, 2.58, 0x6b93a2, true);
          shell('container', x + 2.9, z - 0.82, 3.15, 3.71, 0, 2.94, 0x9a755d, true);
          for (const i of [-1, 1]) box('paint', x - 1.55, 2.25, z - 0.72 + i * 1.5, 4.65, 0.04, 0.095, yellowPaint);
        } else if (tile === 'O') {
          clocktower(x, z);
        } else if (tile === 'G') {
          level.gate.set(x, 0, z);
          for (const side of [-1, 1]) {
            shell('wall', x + side * 3.12, z, 0.78, 1.43, 0, 3.12, 0xa29cab);
            box('glow', x + side * 3.12, 2.62, z + 0.73, 0.11, 0.72, 0.04, amber);
          }
          add('cylinder', 'steel', x, 0.06, z, 6.68, 0.12, 6.68, 0x688493);
          for (let i = 0; i < 16; i++) {
            const a = i / 16 * TAU;
            box('glow', x + Math.sin(a) * 3.15, 0.125, z + Math.cos(a) * 3.15, 0.47, 0.026, 0.095, i % 2 ? pink : amber, a);
          }
        } else if (tile === 'M') {
          level.spawn.set(x, 0, z - 0.5);
          shell('wall', x, z + 2.85, 6.4, 0.48, 0, 2.96, 0xa0a6ac);
          for (const side of [-1, 1]) shell('wall', x + side * 3.10, z + 0.65, 0.39, 4.73, 0, 2.83, 0xa0b2c1);
          shell('steel', x, z + 0.55, 6.68, 5.1, 2.76, 3.02, 0x788d9e);
          box('glow', x, 2.71, z + 0.55, 4.1, 0.055, 0.13, cyan);
          sign('南线地铁站', 4.9, x, 3.37, z - 2.023, Math.PI, ['#57d7ca', '#b3fff3']);
          for (let i = -2; i <= 2; i++) box('paint', x + i * 1.35, 0.033, z - 3.75, 0.86, 0.026, 0.15, yellowPaint);
        }
      }
    }

    // 下沉广场的地面随 z 轴下斜。两侧挡墙与入口坡道分开。
    const f = LANDMARKS.flood;
    for (const x of [f.x0, f.x1]) {
      for (let z = f.z0 + 0.5; z < f.z1; z++) {
        const lower = Math.min(level.base(x * 0.999, z - 0.5), level.base(x * 0.999, z + 0.5));
        if (lower < -0.01) shell('wall', x, z, 0.29, 1.015, lower, 0.22, 0x8398a6);
      }
    }
    box('steel', 0, -f.depth + 0.08, 33.6, 2.15, 0.16, 0.56, 0x7d95a4);
    for (const x of [-8.3, 8.3]) {
      for (const z of [27, 36.5]) {
        box('glow', x, -1.51, z, 0.10, 0.035, 1.0, cyan);
        box('steel', x, -1.45, z, 0.39, 0.07, 1.03, 0x788894);
      }
    }

    const b = LANDMARKS.bridge;
    const bridgeLength = b.x1 - b.x0;
    shell('wall', (b.x0 + b.x1) / 2, b.z, bridgeLength, b.width, b.height - 0.52, b.height, 0xa6aeb8, true);
    for (const x of [-15.6, -5.0, 8.5, 17.6]) {
      for (const z of [b.z - 1.88, b.z + 1.88]) shell('wall', x, z, 0.84, 0.68, 0, b.height - 0.22, 0x9babb8);
    }
    for (const side of [-1, 1]) {
      for (let x = b.x0 + 1.65; x < b.x1 - 0.7; x += 3.27) {
        if ((side < 0 && x > -4 && x < 3) || (side > 0 && x > 11 && x < 17)) continue;
        shell('steel', x, b.z + side * (b.width / 2 - 0.11), 2.95, 0.18, b.height, b.height + 0.74, 0x708690);
      }
      const start = side < 0 ? b.x0 : b.x1;
      box('wall', start + side * b.ramp / 2, b.height / 2 - 0.12, b.z,
        Math.hypot(b.height, b.ramp), 0.24, b.width, 0x8798a7, 0, 0, -side * Math.atan(b.height / b.ramp));
      for (let i = 1; i < b.ramp; i++) {
        const x = start + side * i, ground = level.ramp(x, b.z);
        level.box(x, b.z, 1.02, b.width, Math.max(0, ground - 0.55), ground - 0.18);
      }
    }
    sign('高架桥 / 隧道', 4.8, 0, 2.62, b.z + b.width / 2 + 0.06, 0, ['#5d89a4', '#c5dce5']);
    for (let x = -15; x <= 19; x += 6) box('glow', x, b.height - 0.53, b.z + 0.2, 0.85, 0.045, 0.17, x % 2 ? white : amber);

    // 沥青网格保留同一组世界 UV，坡道处顶点使用地形高度。
    const positions = [], uvs = [];
    for (let row = 0; row < GRID.rows; row++) for (let col = 0; col < GRID.columns; col++) {
      const x = col * c - halfX, z = row * c - halfZ;
      const inFlood = x >= f.x0 && x < f.x1 && z >= f.z0 && z < f.z1;
      for (const [dx, dz] of [[0, 0], [0, 1], [1, 0], [1, 0], [0, 1], [1, 1]]) {
        const xx = x + c * dx, zz = z + c * dz;
        const yy = inFlood ? -f.depth * Math.min(1, (zz - f.z0) / f.ramp, (f.z1 - zz) / f.ramp) : 0;
        positions.push(xx, yy, zz); uvs.push(xx / 5.6, zz / 5.6);
      }
    }
    const ground = new THREE.BufferGeometry();
    ground.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    ground.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    ground.computeVertexNormals();
    scene.add(new THREE.Mesh(ground, staticMaterial.asphalt));
    for (const x of [-9.7, 9.7]) for (let z = -26; z <= 20; z += 4) box('paint', x, 0.021, z, 0.11, 0.032, 1.62, yellowPaint);
    for (const z of [-10.0, 8.5, 20.1]) for (let x = -5.5; x <= 6.1; x += 1.05) box('paint', x, 0.022, z, 0.65, 0.04, 1.35, coldPaint);
    for (let x = -38; x <= 37; x += 3.8) {
      if (Math.abs(x) < 11.5) continue;
      for (const z of [1.75, 9.28]) box('paint', x, 0.022, z, 2.22, 0.033, 0.11, coldPaint);
    }

    const lampLight = [];
    for (const [i, [x, z]] of LANDMARKS.lamps.entries()) {
      const y = level.base(x, z), side = x > 0 ? -1 : 1;
      add('cylinder', 'steel', x, y + 2.53, z, 0.14, 5.07, 0.14, 0x526777);
      box('wall', x, y + 0.26, z, 0.39, 0.52, 0.39, 0x91a9b0);
      box('steel', x + side * 0.44, y + 5.10, z, 1.00, 0.115, 0.15, 0x6b7f8e);
      box('glow', x + side * 0.94, y + 5.0, z, 0.70, 0.10, 0.38, i % 4 ? white : amber);
      if ([0, 1, 3, 6, 7].includes(i)) {
        const light = new THREE.PointLight(i === 7 ? 0xff64b3 : 0xa4dcff, 62, 17, 2);
        light.position.set(x + side * 1.01, y + 4.77, z);
        scene.add(light); lampLight.push(light);
      }
    }

    for (let i = 0; i < 65; i++) {
      const a = i / 65 * TAU + random() * 0.05, r = 58 + random() * 16;
      const h = 6 + random() * 23;
      const x = Math.sin(a) * r, z = Math.cos(a) * r, w = 1.8 + random() * 5.7, d = 2.4 + random() * 5.2;
      box('facade', x, h / 2 - 1, z, w, h, d, 0x8294af);
      box('dark', x + w * 0.15, h - 0.37, z, w * 0.53, 1.8, d * 0.65, 0x8498b1);
      if (i % 7 === 0) box('glow', x, h + 0.70, z, 0.11, 0.19, 0.11, amber);
    }
    for (let i = 0; i < 310; i++) {
      const x = random() * 92 - 46, z = random() * 92 - 46;
      const y = level.base(x, z);
      if (level.blocked(x, z, y, 0.30, 0.45)) continue;
      add('stone', 'wall', x, y + 0.035, z, 0.13 + random() * 0.48, 0.10 + random() * 0.20, 0.23 + random() * 0.38, 0x75899f, random() * TAU);
    }
    city.flush();

    const sky = new THREE.HemisphereLight(0xabcbfa, 0x697991, 1.21);
    const moon = new THREE.DirectionalLight(0xb0ceff, 1.22); moon.position.set(-30, 35, -47);
    const lightning = new THREE.DirectionalLight(0xc9dbff, 0); lightning.position.set(54, 38, -73);
    const gateLamp = new THREE.PointLight(0xff865c, 68, 16, 2);
    gateLamp.position.copy(level.gate).add(new V3(0, 2.2, 0.9));
    scene.add(sky, moon, lightning, gateLamp);
    return { lampLight, lightning, gateLamp };
  }

  return buildMap();
}


function createRainEnvironment({ CONFIG, THREE, scene, brighter, seededRandom, randomRange, mapData, sound }) {
  function makeReflection() {
    const base = Reflector.ReflectorShader;
    const shader = {
      uniforms: { ...base.uniforms, tick: { value: 0 } },
      vertexShader: base.vertexShader.replace('varying vec4 vUv;', 'varying vec4 vUv; varying vec2 surfaceUV;')
        .replace('vUv =', 'surfaceUV = uv; vUv ='),
      fragmentShader: `
        uniform vec3 color;
        uniform sampler2D tDiffuse;
        uniform float tick;
        varying vec4 vUv;
        varying vec2 surfaceUV;
        void main() {
          vec2 p = surfaceUV;
          vec2 wave = vec2(sin(p.y * 190.0 - tick * 9.0 + p.x * 72.0), cos(p.y * 290.0 + tick * 6.0 + p.x * 55.0));
          float edge = min(min(p.x, 1.0-p.x) * 1.75, min(p.y, 1.0-p.y) * 6.0);
          float irregularEdge = sin(p.x * 22.0 + p.y * 32.0) * 0.048 + sin(p.y * 95.0 - p.x * 14.0) * 0.033;
          float opacity = smoothstep(0.05, 0.28, edge + irregularEdge) * (0.56 + wave.x * 0.045);
          vec3 reflected = texture2D(tDiffuse, vUv.xy / vUv.w + wave * 0.00145).rgb;
          gl_FragColor = vec4(reflected * vec3(0.60, 0.70, 0.83), opacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    };
    const s = CONFIG.graphics.reflectionSize;
    const reflector = new Reflector(new THREE.PlaneGeometry(15.7, 48.8), {
      shader, textureWidth: s, textureHeight: s, multisample: 0, clipBias: 0.004,
    });
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.set(0, 0.011, -4.1);
    reflector.material.transparent = true;
    reflector.material.depthWrite = false;
    const capture = reflector.onBeforeRender;
    let last = -Infinity;
    reflector.onBeforeRender = function (r, world, view) {
      const t = this.material.uniforms.tick.value;
      if (t - last < CONFIG.graphics.reflectionInterval || (last > 0 && view.position.y < 0.22)) return;
      last = t;
      capture.call(this, r, world, view);
    };
    scene.add(reflector);

    const shallow = new THREE.Mesh(new THREE.PlaneGeometry(18.8, 13.0), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { tick: { value: 0 } },
      vertexShader: 'varying vec2 tex; void main(){ tex=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `
        varying vec2 tex;
        uniform float tick;
        void main() {
          vec2 p = tex;
          float edge = min(min(p.x,1.0-p.x),min(p.y,1.0-p.y));
          vec2 tile = vec2(p.x * 46.0,p.y * 35.0);
          vec2 id = floor(tile);
          float seed = fract(sin(dot(id,vec2(127.1,311.7)))*43758.5453);
          float life = fract(tick * 1.4 + seed);
          float ripple = 1.0-smoothstep(0.013,0.048,abs(length(fract(tile)-0.5)-life*0.39));
          ripple *= (1.0-life)*step(0.62,seed);
          float streak = pow(max(0.0,cos(p.x * 32.0 + sin(p.y * 17.0 - tick * 1.7) * 0.25)),16.0);
          vec3 blue = vec3(0.062,0.125,0.18) + ripple * vec3(0.20,0.36,0.44) + streak * vec3(0.025,0.065,0.10);
          gl_FragColor=vec4(blue, smoothstep(0.0,0.075,edge)*0.69);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    const flooded = LANDMARKS.flood;
    shallow.rotation.x = -Math.PI / 2;
    shallow.position.set((flooded.x0 + flooded.x1) / 2, -flooded.depth + 0.032, (flooded.z0 + flooded.z1) / 2);
    scene.add(shallow);
    return t => { reflector.material.uniforms.tick.value = t; shallow.material.uniforms.tick.value = t; };
  }

  function makeRain() {
    const seeds = new Float32Array(CONFIG.graphics.rainCount * 6);
    const ends = new Float32Array(CONFIG.graphics.rainCount * 2);
    const rng = seededRandom(83272);
    for (let i = 0; i < CONFIG.graphics.rainCount; i++) {
      const offset = i * 6;
      for (let axis = 0; axis < 3; axis++) seeds[offset + axis] = seeds[offset + 3 + axis] = rng();
      ends[i * 2 + 1] = 1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
    geo.setAttribute('endpoint', new THREE.BufferAttribute(ends, 1));
    const rain = new THREE.LineSegments(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { tick: { value: 0 }, storm: { value: 0 } },
      vertexShader: `
        attribute float endpoint;
        uniform float tick;
        varying float alpha;
        void main() {
          vec3 p = position;
          float span = 49.0;
          vec3 anchor = cameraPosition;
          vec3 pos = vec3(
            mod(p.x * span - tick * 2.7 - anchor.x,span) + anchor.x - span*0.5,
            mod(p.y * 17.0 - tick*(15.0+p.x*5.0)-anchor.y,17.0) + anchor.y - 4.0,
            mod(p.z * span + tick * 0.9 - anchor.z,span) + anchor.z - span*0.5
          );
          pos += vec3(0.07, 0.34+p.x*0.34, -0.018) * endpoint;
          vec4 view = viewMatrix * vec4(pos, 1.0);
          float fade = smoothstep(0.6,2.7,-view.z) * (1.0-smoothstep(14.0,25.0,-view.z));
          alpha = fade * mix(0.19,0.62,p.x) * mix(0.24,1.0,endpoint);
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: `
        uniform float storm;
        varying float alpha;
        void main() { gl_FragColor=vec4(vec3(0.32,0.52,0.72)+storm * 0.25, alpha); }
      `,
    }));
    rain.layers.set(1);
    rain.frustumCulled = false;
    scene.add(rain);
    return (t, flash) => { rain.material.uniforms.tick.value = t; rain.material.uniforms.storm.value = flash; };
  }

  class Weather {
    constructor(lights, sound) {
      this.lights = lights;
      this.sound = sound;
      this.rain = makeRain();
      this.water = makeReflection();
      this.nextStrike = 5.2;
      this.flash = 0;
      this.stormColor = new THREE.Color(0x9db7dd);
      this.baseColor = new THREE.Color(0x283b59);
      this.bolt = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
        color: brighter(0xbbd7ff, 4.1), transparent: true, depthWrite: false, fog: false,
      }));
      this.bolt.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(33), 3));
      this.bolt.frustumCulled = false; this.bolt.visible = false;
      scene.add(this.bolt);
    }
    update(t, playAudio, game) {
      if (t >= this.nextStrike) {
        this.nextStrike = t + randomRange(9, 19);
        this.strikeAt = t;
        const k = this.bolt.geometry.attributes.position;
        const startX = randomRange(13, 45), z = randomRange(-100, -79);
        for (let i = 0; i < k.count; i++) {
          const x = startX - i * 1.02 + randomRange(-1.8, 1.8);
          k.setXYZ(i, x, 38 - i * 2.56, z + randomRange(-0.6, 0.6));
        }
        k.needsUpdate = true;
        if (playAudio) {
          this.sound.hiss(1.6, 350, 58, 0.62, 0.3);
          this.sound.tone(65, 28, 1.1, 0.32, 'sine', 0.42);
        }
      }
      const after = t - (this.strikeAt ?? -8);
      this.flash = Math.max(Math.exp(-after * 22) * 0.64, Math.max(0, 1 - Math.abs(after - 0.20) * 10) * 0.32);
      this.bolt.visible = after < 0.115;
      this.bolt.material.opacity = Math.max(0, 1 - after / 0.12);
      this.lights.lightning.intensity = this.flash * 5.8;
      scene.background.copy(this.baseColor).lerp(this.stormColor, this.flash * 0.63);
      for (let i = 0; i < this.lights.lampLight.length; i++) {
        const flicker = Math.sin(t * 6.4 + i * 5) + Math.sin(t * 17.3 + i * 6.1);
        this.lights.lampLight[i].intensity = flicker < -1.72 ? 14 : 54 + i * 3 + flicker * 4;
      }
      this.lights.gateLamp.intensity = 64 + Math.sin(t * 4.2) * 18 + game.blast * (1 - game.blast) * 500;
      this.rain(t, this.flash); this.water(t);
    }
  }

  return new Weather(mapData, sound);
}

const CONFIG = {
  graphics: { rainCount: 3300, reflectionSize: 224, reflectionInterval: 0.075 },
  audio: { ambient: { filter: 'bandpass', frequency: 1700, q: 0.52, activeGain: 0.24, pauseGain: 0.14 } },
  beasts: { types: [undefined, undefined, { hazardLife: 4.5 }] },
};

export default {
  weaponSkin: 'rain-city',
  pageTitle: '雨夜废城 | 第三关',
  config: CONFIG,
  grid: MAP_GRID,
  loot: LANDMARKS.loot,
  ammo: LANDMARKS.ammo,
  background: 0x283b59,
  fog: 0x344865,
  buildMap: buildRainCity,
  createEnvironment: createRainEnvironment,
  terrain: {
    ground(x, z) {
      const f = LANDMARKS.flood;
      if (x <= f.x0 || x >= f.x1 || z <= f.z0 || z >= f.z1) return 0;
      return -f.depth * Math.min(1, (z - f.z0) / f.ramp, (f.z1 - z) / f.ramp);
    },
    ramp(x, z) {
      const b = LANDMARKS.bridge;
      if (Math.abs(z - b.z) >= b.width / 2) return 0;
      if (x < b.x0 && x > b.x0 - b.ramp) return b.height * (1 - (b.x0 - x) / b.ramp);
      if (x > b.x1 && x < b.x1 + b.ramp) return b.height * (1 - (x - b.x1) / b.ramp);
      return 0;
    },
  },
  inSafeZone(x, z, spawn, margin) {
    return z > spawn.z - 5.4 - margin && Math.abs(x - spawn.x) < 7 + margin / 3;
  },
  area(x, z, level) {
    if (z > 40 && Math.abs(x - level.spawn.x) < 15) return '南侧地铁出口';
    if (z > 21 && Math.abs(x) < 17) return '积水下沉广场';
    if (z < -23) return '断桥与隧道';
    if (x > 17) return '东区商业街';
    if (x < -17) return '西区停车场';
    return '钟楼十字路口';
  },
  chaseWaypoint(beast, player) {
    const bridge = LANDMARKS.bridge;
    if (beast.type === 2 || player.y <= 2 || player.y - beast.y <= 1.4 ||
        Math.abs(player.z - bridge.z) >= bridge.width / 2 + 0.5 ||
        player.x <= bridge.x0 - bridge.ramp || player.x >= bridge.x1 + bridge.ramp) return null;
    const end = beast.x < (bridge.x0 + bridge.x1) / 2 ? bridge.x0 - bridge.ramp - 0.7 : bridge.x1 + bridge.ramp + 0.7;
    const atRamp = Math.abs(beast.z - bridge.z) < bridge.width * 0.38 && Math.abs(beast.x - end) < 2.6;
    return { x: atRamp ? player.x : end, z: bridge.z };
  },
  minimap: {
    tiles: { '#': '#3a556b', S: '#315e69', H: '#273849', C: '#273849', W: '#273849' },
    beforeTiles({ ctx, px, pz }) {
      const f = LANDMARKS.flood;
      ctx.fillStyle = '#254658';
      ctx.fillRect(px(f.x0), pz(f.z0), px(f.x1) - px(f.x0), pz(f.z1) - pz(f.z0));
    },
    afterTiles({ ctx, px, pz }) {
      const b = LANDMARKS.bridge;
      ctx.fillStyle = '#51667674';
      ctx.fillRect(px(b.x0), pz(b.z - b.width / 2), px(b.x1) - px(b.x0), pz(b.width / 2) - pz(-b.width / 2));
    },
  },
  text: {
    tag: '第三关 / 废墟都市',
    title: '雨夜废城',
    enter: '进入废城',
    brief: '从南侧地铁出发，击杀变异体，夺取能量核心，引爆钟楼北侧的裂隙。沿主干道边打边退，带走沿途找到的物资。',
    pauseBrief: '返回街区后，战斗会从暂停处继续。',
    winBrief: '裂隙屏障已摧毁，你带着搜集到的物资撤出了废城。',
    failBrief: '你在废墟中倒下，本局拾取的物资已丢失。',
    enemy: '变异体',
    bossName: '巨型变异体',
    keyItem: '能量核心',
    portal: '裂隙',
    loot: '物资',
    safe: '地铁出口安全区',
    objective: '清除变异体，夺取钟楼守卫的能量核心',
    exitObjective: '前往钟楼北侧裂隙，按 E 引爆',
    rage: '巨型变异体狂暴，犬群正在聚集',
  },
};
