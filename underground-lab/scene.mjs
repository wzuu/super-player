import { Reflector } from 'three/addons/objects/Reflector.js';

const CONFIG = {
  map: { cell: 2, navCell: 1, fog: 0.014 },
  graphics: { maxPixelRatio: 1.25, bloomScale: 0.62, reflectionSize: 256, reflectionInterval: 0.085 },
  audio: { ambient: { frequency: 190, q: 0.64, activeGain: 0.20, pauseGain: 0.12 } },
  player: { safeTime: 13, hurtCooldown: 0.36 },
  weapon: { reserve: 330, recoil: 0.011, maxSpread: 0.030, hearingRadius: 22 },
  beasts: {
    spawnDistance: 18, sight: 21, memory: 5.5, spawnEvery: 1, spawnBurst: 2,
    types: [
      { hp: 56, damage: 7 },
      { hp: 144, damage: 15 },
      { hp: 84, reach: 16.5, damage: 9, projectileGravity: 5.2, hazardLife: 4.4 },
      { hp: 690, height: 3.45, summonCount: 7 },
    ],
  },
  pickups: { ammoDrop: 18, ammoCache: 78 },
  alarm: {
    streakKills: 5, streakWindow: 8, sustainedFire: 4, shotGap: 0.36,
    duration: 32, cooldown: 10, extraPopulation: 18, spawnEvery: 0.26, spawnBurst: 3,
  },
};

const HALF = 40;
const MAP_CELLS = 2 * HALF / CONFIG.map.cell;
const REACTOR = { x: 0, z: -1 };
const AIRLOCK = { x: 0, z: 32, width: 7.4, depth: 0.54, height: 3.48 };
const HATCH = { x: -13, z: -8.5, width: 2.8, depth: 0.58, height: 2.95 };
// 主线封锁门使用从地板到顶棚的完整围护。清理过的房间保持安静。
function isolationRoom(id,x,z,w,d,doorX,gap) {
  const left=x-w/2,right=x+w/2,front=z+d/2,back=z-d/2,h=5.4;
  return [
    [null,left,z,.42,d,h], [null,right,z,.42,d,h], [null,x,back,w,.42,h],
    [null,(left+doorX-gap/2)/2,front,doorX-gap/2-left,.42,h,true],
    [null,(right+doorX+gap/2)/2,front,right-doorX-gap/2,.42,h,true],
    [id,doorX,front,gap,.44,h],
  ];
}
const labStory = {
  type:'lab',
  walls:[
    [null,-20,22,40,.46,5.4,true],[null,21.6,22,36.8,.46,5.4,true],['security',1.6,22,3.2,.48,5.4],
    ...isolationRoom('power',27,-12,20,17,29,3.5),
    ...isolationRoom('reactor',0,-2,23,23,6.3,3.5),
    ...isolationRoom('service',-9,-21,8,9,-9,3.3),
  ],
  terminals:[[2.6,26],[-24,-9],[29,-9],[0,-10.1]],
  locks:[
    {id:'security',at:[1.6,22],why:'需清空安检室，从值班台取安保卡'},
    {id:'power',at:[29,-3.5],why:'机房门需要样本封存模块'},
    {id:'reactor',at:[6.3,9.5],why:'反应堆隔离门需要机房供电和通行证'},
    {id:'service',at:[-9,-16.5],why:'需取得零号核心权限卡，在裂隙控制台解除封锁'},
  ],
  route:[
    {kind:'fight',name:'气闸安检室',label:'清理安检室守卫',at:[2,27.2],entries:[[-4,25],[5,24]],count:4,cap:3,mix:[0],range:10},
    {kind:'use',label:'从值班台领取安保卡',at:[2.6,26]},
    {kind:'use',label:'刷安保卡开启样本走廊',door:'security',at:[1.6,23.1]},
    {kind:'fight',name:'西侧样本走廊',label:'清理走廊转角',at:[-10,15.5],entries:[[-16.9,14.4],[-15.6,9]],count:4,cap:3,mix:[0,0,2],range:12},
    {kind:'fight',name:'西侧培养室',label:'清理培养罐之间的守卫',at:[-23,-8],entries:[[-30,-8],[-24,-15]],count:7,cap:4,mix:[0,2,0,1]},
    {kind:'use',label:'从培养舱取样本封存模块',at:[-24,-9]},
    {kind:'use',label:'以封存模块解锁机房',door:'power',at:[29,-2.5]},
    {kind:'fight',name:'服务器机房',label:'击退维修通道与机柜守卫',at:[28,-9],entries:[[29,-15],[19,-13]],count:6,cap:4,mix:[1,0,2,0]},
    {kind:'use',label:'恢复机房供电并取通行证',at:[29,-9]},
    {kind:'fight',name:'机房检修口',label:'击退红色警报增援',alarm:true,at:[29,-9],entries:[[29,-17],[19,-12]],count:5,cap:3,mix:[0,2,0]},
    {kind:'use',label:'刷反应堆通行证开门',door:'reactor',at:[6.3,10.6]},
    {kind:'boss',label:'击败反应堆的零号实验体'},
    {kind:'use',label:'用核心权限卡解除裂隙封锁',door:'service',at:[0,-9.5]},
    {kind:'fight',name:'北侧检修通道',label:'击退检修通道守卫',at:[-9,-17.5],entries:[[-9,-22],[-7,-24]],count:4,cap:3,mix:[0,0,2],range:10},
    {kind:'reach',label:'穿过检修通道，抵达撤离气闸',at:[-9,-23],win:true},
  ],
};
const LANDMARKS = {
  spawn: [0, 0, 36.6], boss: [6.8, 0, -3.5], gate: [0, 0.16, -10.6],
  loot: [
    [-5.6, 24, '装卸调度芯片', 90], [15, 28, '应急能量电池', 110],
    [6.4, 6, '反应堆诊断芯片', 155], [7.4, -11.7, '零号实验体日志', 330],
    [-23, -9, '完整细胞样本箱', 240], [-31, -5.0, '培养舱监控记录', 165],
    [25, -12.8, '离线备份芯片', 220], [34.8, -6, '超导能量电池', 185],
    [-31, -27.3, '失联班组日志', 270], [24, -31, '封存逆变器样本', 310],
  ],
  ammo: [[-2.7, 35.9], [4.5, 21.7], [-15, 26], [14, 18], [-7.9, -4.0],
    [10, 5.8], [-25, -13.7], [29.4, -16.6], [-20, -31], [10, -31]],
};

// 墙段是地图坐标，横墙固定 z，纵墙固定 x。段之间的空隙就是门洞。
const WALLS = [
  ['x', -39.4, -40, 40, 'outer'], ['x', 39.4, -40, 40, 'outer'],
  ['z', -39.4, -40, 40, 'outer'], ['z', 39.4, -40, 40, 'outer'],
  ['x', -13, -14, -10], ['x', -13, -7, -5], ['x', -13, -5, -2, 'glass'],
  ['x', -13, 2, 8], ['x', -13, 11.4, 14],
  ['x', 13, -14, -6], ['x', 13, -6, -2, 'glass'], ['x', 13, 2, 8], ['x', 13, 11.4, 14],
  ['z', -14, -13.30, -10.1], ['z', -14, -6.7, -2], ['z', -14, 2, 6.7], ['z', -14, 10.1, 13.30],
  ['z', 14, -13.30, -2], ['z', 14, 2, 13.30],
  ['x', -2.3, -35, -31], ['x', -2.3, -26, -20, 'glass'], ['x', -2.3, -20, -13.72],
  ['x', 2.3, -35, -31], ['x', 2.3, -26, -20, 'glass'], ['x', 2.3, -20, -13.72],
  ['x', -2.3, 13.75, 19, 'glass'], ['x', 2.3, 13.75, 19, 'glass'],
  ['x', -4, 32, 39.6], ['x', 4, 32, 39.6],
  ['z', 32, -8, -3.7], ['z', 32, 3.7, 8],
  ['z', 27.7, -6.7, -3.5], ['z', 27.7, 3.5, 6.7],
  ['z', -25.4, -35, -19.1, 'baffle'], ['z', -25.4, -14.9, -4.6, 'baffle'],
  ['z', -25.4, 4.6, 14.9, 'baffle'], ['z', -25.4, 19.1, 35, 'baffle'],
  ['z', -32.5, -35, -25, 'baffle'], ['z', -32.5, -21, -9.2, 'baffle'],
  ['z', -32.5, 9.2, 21, 'baffle'], ['z', -32.5, 25, 35, 'baffle'],
];
for (const side of [-1, 1]) {
  for (const z of [-2.3, 2.3]) {
    for (const [a, b, kind] of [[13, 17, 'glass'], [21, 28, 'glass'], [34, 39.6, 'panel']]) {
      WALLS.push(['z', z, Math.min(a * side, b * side), Math.max(a * side, b * side), kind]);
    }
  }
}

// 低矮掩体与高柜共用包围盒。柜间留净空，容许玩家与冲锋体绕行。
const CABINETS = [21.8, 26.9, 32].flatMap(x =>
  [-9.2, -15.2, -20.9].map(z => [x, z]));
const TANKS = [-33.6, -27.8, -22, -16.6].map((x, i) => [x, -18.4, i === 1 || i === 3]);
const CRATES = [[-11, 22.8, 4.7, 2.25], [10.4, 25.3, 4.8, 2.1], [20, 29.5, 5.2, 2.2],
  [-19.8, 30.1, 5.0, 2.2], [31, 12.6, 4.6, 2.2], [-31, 12.6, 4.5, 2.2]];
const LIFT = { x: -2.5, z: 20.4, width: 4.2, depth: 2.1 };
const ROOMS = [
  [-13, -14, 13, 14, 8, 'H'],
  [13, -24, 39.4, -2.3, 4.6, 'E'], [-39.4, -24, -13, -2.3, 4.6, 'W'],
  [-39.4, -39.4, 39.4, -24, 4, 'N'], [-13, -24, 13, -14, 4, 'N'],
  [-39.4, 2.3, 39.4, 39.4, 5.4, 'S'],
  [-39.4, -2.3, -13, 2.3, 4, '.'], [13, -2.3, 39.4, 2.3, 4, '.'],
];

function inside(x, z, room) {
  return x >= room[0] && x <= room[2] && z >= room[1] && z <= room[3];
}

function wallFootprint([axis, at, start, end, kind]) {
  const mid = (start + end) / 2;
  const thickness = kind === 'outer' ? 1.2 : 0.60;
  return axis === 'z' ? [mid, at, end - start, thickness] : [at, mid, thickness, end - start];
}

// 将墙线和道具布局采样成共享小地图使用的二维网格，精确碰撞仍使用原始尺寸。
const MAP_GRID = Array.from({ length: MAP_CELLS }, (_, row) =>
  Array.from({ length: MAP_CELLS }, (_, col) => {
    const x = (col + 0.5) * CONFIG.map.cell - HALF, z = (row + 0.5) * CONFIG.map.cell - HALF;
    if (row === 0 || col === 0 || row === MAP_CELLS - 1 || col === MAP_CELLS - 1) return '#';
    if (WALLS.some(wall => {
      if (wall[4] === 'outer') return false;
      const [wx, wz, w, d] = wallFootprint(wall);
      return Math.abs(x - wx) < w / 2 + 0.34 && Math.abs(z - wz) < d / 2 + 0.34;
    })) return '#';
    if (Math.hypot(x - REACTOR.x, z - REACTOR.z) < 2.5 ||
        CABINETS.some(([cx, cz]) => Math.abs(x - cx) < 1.3 && Math.abs(z - cz) < 1.8) ||
        TANKS.some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 1.52) ||
        CRATES.some(([cx, cz, w, d]) => Math.abs(x - cx) < w / 2 && Math.abs(z - cz) < d / 2)) return 'B';
    return ROOMS.find(room => inside(x, z, room))?.[5] ?? '.';
  }).join(''));

const CERAMIC = 0x8faabf, METAL = 0x334757, DARK = 0x1a2836, STEEL = 0x586f81;
const ICE = 0x92e3ff, AMBER = 0xf29a54, JADE = 0x55e8b9;
const STEAM = [[-31.25, -33], [-17.1, -30.4], [-6.1, -19.9], [16.9, -29.7], [32.5, -34.3]];

function buildMap(ctx) {
  const { THREE, scene, level, StaticBatches, shapes, canvasTexture, brighter, seededRandom } = ctx;
  const rng = seededRandom(1507);
  const panelMap = canvasTexture(256, 256, (g, w, h) => {
    const fade = g.createLinearGradient(0, 0, 0, h);
    fade.addColorStop(0, '#b8c4ce'); fade.addColorStop(0.42, '#87949f'); fade.addColorStop(1, '#66747f');
    g.fillStyle = fade; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 340; i++) {
      g.fillStyle = i % 2 ? '#e8f2ff0b' : '#15232f16';
      g.fillRect(rng() * w, rng() * h, 8 + rng() * w * 0.45, 1);
    }
    g.strokeStyle = '#24303a'; g.lineWidth = 5; g.strokeRect(3, 3, w - 6, h - 6);
    g.strokeStyle = '#9bafbd'; g.lineWidth = 1; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#46515d'; g.fillRect(11, h - 54, w - 22, 2);
    for (const a of [14, w - 14]) for (const b of [14, h - 14]) {
      g.beginPath(); g.arc(a, b, 2.3, 0, Math.PI * 2); g.fill();
    }
  });
  const deckMap = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#60717d'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = i % 2 ? '#c5e2f312' : '#0c182524';
      g.fillRect(rng() * w, rng() * h, 3 + rng() * 11, 1);
    }
    g.strokeStyle = '#142432'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2);
    g.strokeStyle = '#8ba2af'; g.lineWidth = 1; g.strokeRect(5, 5, w - 10, h - 10);
  }, true);
  deckMap.repeat.set(20, 20);
  const materials = {
    panel: new THREE.MeshStandardMaterial({ map: panelMap, roughness: 0.65, metalness: 0.22 }),
    metal: new THREE.MeshStandardMaterial({ roughness: 0.48, metalness: 0.37 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x7accf4, transparent: true, opacity: 0.20, roughness: 0.26, depthWrite: false, side: THREE.FrontSide }),
    tank: new THREE.MeshBasicMaterial({ color: 0x64d2c9, transparent: true, opacity: 0.17, depthWrite: false, side: THREE.DoubleSide }),
    emit: new THREE.MeshBasicMaterial(),
    signal: new THREE.MeshBasicMaterial({ color: brighter(ICE, 2.0) }),
  };
  const geometry = { ...shapes, round: new THREE.CylinderGeometry(0.5, 0.5, 1, 48) };
  const kit = new StaticBatches(materials, geometry);
  const box = (material, x, y, z, w, h, d, tint, yaw = 0) => kit.add('box', material, x, y, z, w, h, d, tint, yaw);
  const drum = (material, x, y, z, w, h, tint, smooth = false) =>
    kit.add(smooth ? 'round' : 'cylinder', material, x, y, z, w, h, w, tint);
  const glow = (x, y, z, w, h, d, tint = ICE, power = 2.0, yaw = 0) =>
    box('emit', x, y, z, w, h, d, brighter(tint, power), yaw);

  const deck = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshStandardMaterial({
    map: deckMap, color: 0x8599ab, roughness: 0.45, metalness: 0.38,
  }));
  deck.rotation.x = -Math.PI / 2;
  scene.add(deck);

  for (const [x0, z0, x1, z1, height, type] of ROOMS) {
    const x = (x0 + x1) / 2, z = (z0 + z1) / 2;
    box('metal', x, height + 0.17, z, x1 - x0 + 0.04, 0.34, z1 - z0 + 0.04, DARK);
    level.box(x, z, x1 - x0, z1 - z0, height, height + 0.34);
    for (let at = z0 + 2; at < z1 - 0.7; at += type === 'H' ? 5.5 : 6) {
      box('metal', x, height - 0.14, at, x1 - x0, 0.25, 0.56, STEEL);
      for (const fraction of [0.23, 0.77]) {
        const lx = x0 + (x1 - x0) * fraction;
        box('metal', lx, height - 0.31, at, 3.2, 0.17, 0.42, METAL);
        box('signal', lx, height - 0.405, at, 2.83, 0.034, 0.15, 0xffffff);
      }
    }
  }

  for (const segment of WALLS) {
    const [axis, at, start, end, kind] = segment;
    const [x, z, w, d] = wallFootprint(segment);
    const vertical = axis === 'x';
    const isOuter = kind === 'outer';
    const highHall = !isOuter && ((vertical && Math.abs(at) === 13) || (!vertical && Math.abs(at) === 14));
    const height = kind === 'baffle' ? 4.02 : isOuter || highHall ? 8.05 : 5.5;
    level.box(x, z, w, d, 0, height);
    const yaw = vertical ? Math.PI / 2 : 0;
    const thick = vertical ? w : d;
    const piece = (material, mid, y, width, h, depth, tint) =>
      box(material, vertical ? at : mid, y, vertical ? mid : at, width, h, depth, tint, yaw);
    const tiles = Math.ceil((end - start) / 3.65);
    const span = (end - start) / tiles;
    for (let i = 0; i < tiles; i++) {
      const mid = start + (i + 0.5) * span;
      if (kind === 'glass') {
        piece('panel', mid, 0.57, span, 1.14, thick, STEEL);
        piece('glass', mid, 1.96, span, 1.65, 0.09, ICE);
        piece('panel', mid, (2.79 + height) / 2, span, height - 2.79, thick, CERAMIC);
        piece('metal', mid, 1.13, span, 0.10, thick + 0.08, METAL);
        piece('metal', mid, 2.80, span, 0.10, thick + 0.08, METAL);
      } else {
        piece('panel', mid, 1.53, span, 3.06, thick, isOuter ? STEEL : CERAMIC);
        piece('panel', mid, (3.06 + height) / 2, span, height - 3.06, thick, STEEL);
      }
      piece('metal', start + i * span + 0.035, Math.min(2, height / 2), 0.12, 3.9, thick + 0.10, METAL);
      piece('metal', mid, 0.15, span, 0.25, thick + 0.035, DARK);
    }
  }

  // 地面引导线在走廊转角中断，便于从战斗视角识别分区和出口。
  for (const s of [-1, 1]) {
    glow(s * 1.84, 0.014, 20, 0.065, 0.022, 18, ICE, 0.82);
    glow(s * 1.76, 0.014, -25, 0.065, 0.022, 18, ICE, 0.90);
    for (const z of [-1.86, 1.86]) glow(s * 25.3, 0.014, z, 23.7, 0.022, 0.065, ICE, 0.85);
    for (const z of [24, 26, 30, 33]) {
      glow(s * 6.1, 0.014, z, 0.085, 0.022, 1.45, AMBER, 1.15);
    }
  }

  function header(x, z, yaw, w, height, tint) {
    box('metal', x, height + 0.20, z, w + 0.46, 0.39, 0.74, DARK, yaw);
    box('signal', x, height - 0.018, z, w, 0.065, 0.18, 0xffffff, yaw);
    for (const s of [-1, 1]) {
      const axialX = Math.cos(yaw), axialZ = -Math.sin(yaw);
      box('metal', x + axialX * s * (w / 2 + 0.07), height / 2, z + axialZ * s * (w / 2 + 0.07),
        0.18, height, 0.70, METAL, yaw);
      glow(x + axialX * s * (w / 2 - 0.15), 2.12, z + 0.24, 0.055, 0.80, 0.072, tint, 1.65, yaw);
    }
  }
  header(0, 14, 0, 3.94, 3.45, ICE);
  header(0, -14, 0, 3.94, 3.45, AMBER);
  header(-13, 0, Math.PI / 2, 3.94, 3.45, JADE);
  header(13, 0, Math.PI / 2, 3.94, 3.45, ICE);
  header(0, 32, 0, 7.42, 3.48, AMBER);

  const sign = (x, y, z, yaw, code, badge, title, color) => {
    const map = canvasTexture(512, 144, (g, w, h) => {
      g.fillStyle = '#080f17'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#344957'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
      g.fillStyle = color; g.fillRect(17, 18, 5, 108);
      g.font = '600 44px monospace'; g.fillText(code, 40, 93);
      g.font = '600 37px -apple-system, sans-serif'; g.fillText(title, 145, 72);
      g.fillStyle = '#9caeba'; g.font = '20px monospace'; g.fillText(badge, 149, 110);
    });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3.84, 1.08), new THREE.MeshBasicMaterial({ map }));
    board.position.set(x, y, z); board.rotation.y = yaw; scene.add(board);
  };
  sign(0, 4.0, 32.41, 0, 'A01', 'ENTRY AIRLOCK', '入口气闸', '#9de4ff');
  sign(0, 4.63, 14.325, 0, 'R00', 'REACTOR CHAMBER', '核心实验大厅', '#a1e7ff');
  sign(-12.67, 4.05, 0, Math.PI / 2, 'W02', 'SPECIMEN WARD', '样本培养室', '#8af4d0');
  sign(12.67, 4.05, 0, -Math.PI / 2, 'E03', 'SERVER ARRAY', '服务器机房', '#99deff');
  sign(0, 4.52, -13.675, 0, 'N04', 'MAINTENANCE', '维修管道区', '#ffc088');
  sign(0, 4.05, 31.61, Math.PI, 'S05', 'CARGO TRANSFER', '货运装卸区', '#ffc088');

  // 反应堆基座留出一整圈可跨上的检修平台，核心筒贴合实体掩体。
  const { x: rx, z: rz } = REACTOR;
  box('metal', rx, 0.1625, rz, 9.38, 0.325, 9.38, 0x3f5362);
  drum('emit', rx, 0.329, rz, 9.16, 0.012, brighter(0x4782a6, 1.45), true);
  drum('metal', rx, 0.338, rz, 8.98, 0.012, 0x324956, true);
  level.box(rx, rz, 9.38, 9.38, 0, 0.325, true);
  drum('metal', rx, 0.58, rz, 4.6, 0.52, METAL, true);
  drum('emit', rx, 3.35, rz, 2.45, 5.0, brighter(0x8deaff, 3.05), true);
  drum('glass', rx, 3.35, rz, 3.57, 5.10, ICE, true);
  for (const y of [0.88, 1.14, 5.60, 5.78, 6.13, 6.52]) {
    drum('metal', rx, y, rz, y > 6 ? 4.45 : 4.02, 0.13, STEEL, true);
    drum('emit', rx, y - 0.09, rz, y > 6 ? 4.18 : 3.78, 0.04, brighter(ICE, 2.5), true);
  }
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    const c = Math.cos(a), s = Math.sin(a);
    box('metal', c * 1.67, 3.44, rz + s * 1.67, 0.18, 4.35, 0.26, STEEL, -a);
    glow(c * 1.80, 3.44, rz + s * 1.80, 0.052, 3.93, 0.052, ICE, 2.4);
    box('metal', c * 3.52, 0.35, rz + s * 3.52, 0.83, 0.05, 0.21, STEEL, -a);
    glow(c * 4.31, 0.365, rz + s * 4.31, 0.19, 0.075, 0.085, AMBER, 1.6, -a);
  }
  // 中段金属笼杆保持中空，中央的亮柱能从每个角度读出来。
  level.box(rx, rz, 3.46, 3.46, 0, 6.51);

  const rings = [];
  for (const [r, y, arc, tint] of [[2.7, 4.45, Math.PI * 1.76, ICE], [3.13, 4.94, Math.PI * 1.54, 0x609fff], [3.49, 5.52, Math.PI * 1.33, 0xd1f6ff]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.026, 7, 64, arc),
      new THREE.MeshBasicMaterial({ color: brighter(tint, 2.3) }));
    ring.position.set(rx, y, rz); scene.add(ring); rings.push(ring);
  }

  // 门底座与两侧场发生器。共享裂隙负责力场、漩涡和胜利瞬间的冲击波。
  const [gx, , gz] = LANDMARKS.gate;
  drum('metal', gx, 0.073, gz, 6.1, 0.146, 0x466078, true);
  drum('emit', gx, 0.137, gz, 5.95, 0.029, brighter(ICE, 1.0), true);
  drum('metal', gx, 0.152, gz, 5.68, 0.022, DARK, true);
  level.box(gx, gz, 5.75, 5.75, 0, 0.165, true);
  for (const s of [-1, 1]) {
    const x = s * 2.79;
    box('panel', x, 2.03, gz, 0.58, 4.04, 0.85, CERAMIC);
    box('metal', x, 0.35, gz, 0.94, 0.70, 1.16, STEEL);
    glow(x, 2.2, gz + 0.45, 0.11, 2.84, 0.045, ICE, 2.8);
    level.box(x, gz, 0.92, 1.15, 0, 4.04);
  }

  for (const [x, z] of CABINETS) {
    box('metal', x, 1.63, z, 1.60, 3.26, 3.20, DARK);
    box('panel', x, 3.27, z, 1.68, 0.13, 3.23, STEEL);
    level.box(x, z, 1.60, 3.20, 0, 3.35);
    for (const s of [-1, 1]) {
      box('panel', x + s * 0.79, 1.48, z, 0.09, 2.73, 2.96, 0x526a80);
      for (const zOffset of [-1.0, 0, 1.0]) for (let h = 0; h < 6; h++) {
        box('metal', x + s * 0.86, 0.60 + h * 0.385, z + zOffset, 0.12, 0.23, 0.87, METAL);
        const add = (h + Math.round(zOffset) + Math.round(x)) % 7 === 0 ? 'signal' : 'emit';
        box(add, x + s * 0.934, 0.61 + h * 0.385, z + zOffset - 0.22, 0.025, 0.034, 0.18,
          add === 'signal' ? 0xffffff : brighter(h % 3 ? ICE : JADE, 1.6));
      }
    }
    glow(x, 2.95, z + 1.619, 0.67, 0.038, 0.025, ICE, 1.7);
  }

  const splitCylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1, true, 1.2, Math.PI * 1.25);
  geometry.shattered = splitCylinder;
  const specimens = [];
  for (const [i, [x, z, broken]] of TANKS.entries()) {
    drum('metal', x, 0.34, z, 3.02, 0.64, DARK, true);
    drum('emit', x, 0.65, z, 2.89, 0.09, brighter(JADE, 2.4), true);
    drum('metal', x, 3.81, z, 2.9, 0.22, STEEL, true);
    drum('emit', x, 3.66, z, 2.70, 0.052, brighter(ICE, 2.0), true);
    kit.add(broken ? 'shattered' : 'round', 'tank', x, broken ? 1.88 : 2.15, z,
      2.44, broken ? 2.28 : 3.0, 2.44, 0xffffff, broken ? i * 0.48 : 0);
    level.box(x, z, 2.55, 2.55, 0, broken ? 1.46 : 3.78);
    for (const s of [-1, 1]) {
      box('metal', x + s * 1.33, 2.2, z - 0.21, 0.17, 3.1, 0.21, STEEL);
      glow(x + s * 1.33, 2.21, z - 0.069, 0.057, 2.6, 0.04, JADE, 1.6);
    }
    if (broken) {
      for (let n = 0; n < 9; n++) {
        const a = rng() * Math.PI * 2, r = 1.3 + rng() * 0.74;
        kit.add('stone', 'metal', x + Math.cos(a) * r, 0.045, z + Math.sin(a) * r, 0.28, 0.094, 0.39, 0x68c7c4, a);
      }
      drum('metal', x, 0.04, z + 1.25, 3.4, 0.035, 0x1e6865, true);
    } else {
      const shape = new THREE.IcosahedronGeometry(1, 1);
      const geo = new THREE.Mesh(shape, new THREE.MeshStandardMaterial({
        color: 0x2b5148, emissive: 0x459579, emissiveIntensity: 0.52, roughness: 0.54,
      }));
      geo.position.set(x, 2.18, z); geo.scale.set(0.62, 1.03, 0.64); scene.add(geo); specimens.push(geo);
    }
  }

  for (const [i, [x, z, w, d]] of CRATES.entries()) {
    const tint = i % 2 ? 0x445b71 : 0x8b6650;
    box('panel', x, 1.09, z, w, 2.18, d, tint);
    level.box(x, z, w, d, 0, 2.18);
    for (let offset = -w / 2 + 0.24; offset < w / 2; offset += 0.49) {
      box('metal', x + offset, 1.08, z, 0.11, 1.96, d + 0.065, tint);
    }
    for (const y of [0.14, 2.05]) box('metal', x, y, z, w + 0.08, 0.17, d + 0.11, STEEL);
    glow(x, 1.82, z + d / 2 + 0.06, 0.74, 0.068, 0.045, AMBER, 1.7);
  }
  const lift = new THREE.Mesh(new THREE.BoxGeometry(LIFT.width, 0.28, LIFT.depth), materials.panel);
  lift.position.set(LIFT.x, 0.14, LIFT.z); scene.add(lift);
  level.box(LIFT.x, LIFT.z, LIFT.width, LIFT.depth, 0, 0.28, true);
  for (const s of [-1, 1]) {
    box('metal', LIFT.x + s * 2.22, 0.10, LIFT.z, 0.17, 0.15, 3.05, DARK);
    for (let i = -3; i <= 3; i++) {
      glow(LIFT.x + i * 0.53, 0.294, LIFT.z + s * 0.92, 0.31, 0.026, 0.055, AMBER, 1.6);
    }
  }
  for (let i = 0; i < 12; i++) {
    const x = -12 + i * 2.2;
    glow(x, 0.018, 30.0, 0.92, 0.025, 0.10, AMBER, 1.12, -0.44);
  }

  // 高处输送管强调低净空，落地总管同时为维修区的真实掩体。
  for (const [i, [x, z]] of STEAM.entries()) {
    const h = 2.5 + i % 2 * 0.4;
    drum('metal', x, h / 2, z, 0.60, h, STEEL);
    level.box(x, z, 0.59, 0.59, 0, h);
    drum('metal', x, 0.21, z, 0.91, 0.42, DARK);
    drum('emit', x, 1.45, z, 0.65, 0.075, brighter(AMBER, 1.75));
    kit.add('cylinder', 'metal', x + 0.42, 0.73, z, 0.23, 0.65, 0.23, METAL, 0, 0, Math.PI / 2);
  }
  for (const z of [-36.3, -28.3, -16.9]) {
    for (const y of [3.27, 3.65]) {
      kit.add('cylinder', 'metal', 0, y, z, 0.38, 78, 0.38, STEEL, 0, 0, Math.PI / 2);
      for (let x = -36; x < 39; x += 4) {
        kit.add('cylinder', 'metal', x, y, z, 0.48, 0.22, 0.48, DARK, 0, 0, Math.PI / 2);
      }
    }
  }
  for (const [x, z, w, d] of [[-24.5, -29.1, 4.5, 1.15], [25, -28.6, 3.8, 1.25], [15, -24.3, 2.65, 0.90]]) {
    box('metal', x, 0.68, z, w, 1.36, d, METAL);
    glow(x, 1.06, z + d / 2 + 0.02, w * 0.71, 0.053, 0.035, AMBER, 1.55);
    level.box(x, z, w, d, 0, 1.36);
  }

  // 保持 8 盏灯，平时用青色环境和暖色分区，警报开启时统一切到红色。
  const lights = [];
  const sky = new THREE.HemisphereLight(0xb9def4, 0x63768a, 1.56);
  scene.add(sky);
  for (const [x, y, z, color, strength, distance] of [
    [0, 5.65, 0.5, 0x67c9ff, 88, 26], [0, 4.7, -9.1, 0x7bafff, 55, 18],
    [0, 3.75, 35, 0xa7dbff, 22, 16], [0, 4.95, 24, 0xd9c4a5, 96, 31],
    [24, 4.05, -9.2, 0x89cbff, 70, 24], [-23, 4.06, -11, 0x67efc7, 68, 24],
    [0, 3.55, -28, 0xffbd87, 77, 27],
  ]) {
    const light = new THREE.PointLight(color, strength, distance, 1.53);
    light.position.set(x, y, z); scene.add(light);
    lights.push({ light, normal: light.color.clone(), strength });
  }
  for (const [x, z] of [[0, 29.5], [-10.8, 13.4], [10.8, 13.4], [-19, -3.5], [19, -3.5], [0, -23]]) {
    box('metal', x, 3.23, z, 0.36, 0.22, 0.23, DARK);
    glow(x, 3.12, z + 0.07, 0.27, 0.11, 0.20, AMBER, 2.85);
  }

  kit.flush();
  level.spawn.set(...LANDMARKS.spawn);
  level.bossSpawn.set(...LANDMARKS.boss);
  level.bossAnchor.copy(level.bossSpawn);
  level.gate.set(...LANDMARKS.gate);
  const airlock = buildDoor(ctx, AIRLOCK, materials, false);
  const hatch = buildDoor(ctx, HATCH, materials, true);
  // 静态导航保留闸口单元，开局即使闸门闭合也能在安全区外布置实验体。
  level.serviceHatch = hatch.collider;
  return { airlock, hatch, rings, specimens, lights, sky, signal: materials.signal };
}

function buildDoor({ THREE, scene, level, brighter }, spec, materials, hidden) {
  const { x, z, width, depth, height } = spec;
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  if (hidden) group.rotation.y = Math.PI / 2;
  scene.add(group);
  const pane = width / 2 - 0.021;
  const parts = [-1, 1].map(s => {
    const leaf = new THREE.Group();
    group.add(leaf);
    const detail = (w, h, d, x, y, z, mat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z); leaf.add(mesh);
    };
    const shell = materials.panel.clone();
    shell.color.set(hidden ? 0x637a8d : 0x718598);
    const shellTrim = materials.metal.clone();
    shellTrim.color.set(hidden ? DARK : STEEL);
    const lit = new THREE.MeshBasicMaterial({ color: brighter(hidden ? JADE : AMBER, 2.3) });
    detail(pane, height, depth, 0, height / 2, 0, shell);
    for (const face of [-1, 1]) {
      const surface = face * (depth / 2 + 0.025);
      if (hidden) {
        // 保留面板纹理，仅用一颗很小的检修指示灯提示可交互位置。
        detail(0.061, 0.064, 0.047, -s * 0.42, 1.33, surface, lit);
      } else {
        for (const y of [0.44, 0.71, height - 0.43]) detail(pane - 0.25, 0.085, 0.07, 0, y, surface, shellTrim);
        detail(0.22, 1.65, 0.092, -s * (pane / 2 - 0.20), 1.80, surface, shellTrim);
        detail(0.058, 0.84, 0.085, -s * (pane / 2 - 0.20), 1.80, surface * 1.14, lit);
      }
    }
    return { leaf, sign: s };
  });
  const collider = level.box(x, z, hidden ? depth : width, hidden ? width : depth, 0, height);
  collider.active = false;
  const door = {
    collider, progress: 0,
    pose() {
      for (const { leaf, sign } of parts) leaf.position.x = sign * (width / 4 + this.progress * (pane + 0.16));
    },
    set(open, dt = Infinity) {
      this.progress = open ? Math.min(1, this.progress + dt * 1.85) : Math.max(0, this.progress - dt * 1.45);
      // 门叶从中间向两侧滑动。直到动画结束的安全开度才放开碰撞。
      const active = this.progress < 0.94;
      if (active !== collider.active) {
        collider.active = active;
        if (hidden) level.terrainRevision++;
      }
      this.pose();
    },
  };
  door.pose();
  return door;
}

function createEncounter({ CONFIG: setup, mapData, sound }) {
  const rules = setup.alarm;
  const { airlock, hatch } = mapData;
  const nearHatch = player => Math.abs(player.x - HATCH.x) < 1.85 && Math.abs(player.z - HATCH.z) < 1.37;
  const nearAirlock = body => Math.abs(body.x) < 4.65 && Math.abs(body.z - AIRLOCK.z) < 4.3;
  const crossingAirlock = body =>
    Math.abs(body.x) < AIRLOCK.width / 2 + body.radius &&
    Math.abs(body.z - AIRLOCK.z) < AIRLOCK.depth / 2 + body.radius + 0.30;
  const killTimes = [];

  const alarm = {
    status: null, population: setup.beasts.population, spawnEvery: setup.beasts.spawnEvery, spawnBurst: setup.beasts.spawnBurst,
    reset() {
      this.alarmUntil = -Infinity;
      this.cooldownUntil = -Infinity;
      this.sirenAt = Infinity;
      this.lastShot = this.fireSince = -Infinity;
      this.countedKills = 0;
      this.hatchOpen = false;
      killTimes.length = 0;
      this.setAlarm(false);
      airlock.set(false);
      hatch.set(false);
    },
    setAlarm(active) {
      this.active = active;
      const spawn = active ? rules : setup.beasts;
      this.population = setup.beasts.population + (active ? rules.extraPopulation : 0);
      this.spawnEvery = spawn.spawnEvery;
      this.spawnBurst = spawn.spawnBurst;
      if (!active) this.status = null;
    },
    interactionHint(game) {
      return !this.hatchOpen && nearHatch(game.player) ? '按 F 解锁维修面板后的捷径' : null;
    },
    interact(game) {
      if (!this.interactionHint(game)) return;
      this.hatchOpen = true;
      sound.hiss(0.46, 950, 135, 0.15);
      game.ui.notify('维修捷径已开启', 2.1);
    },
    update(game, dt) {
      const now = game.time;
      const open = nearAirlock(game.player) ||
        game.beasts.pool.some(beast => beast.active && crossingAirlock(beast));
      const wasOpen = airlock.progress > 0;
      airlock.set(open, dt);
      hatch.set(this.hatchOpen, dt);
      if (open !== wasOpen && (open || airlock.progress === 0)) sound.hiss(0.42, 740, 185, 0.12);

      if (game.blast) return;
      if (this.active && now >= this.alarmUntil) {
        this.setAlarm(false);
        this.cooldownUntil = now + rules.cooldown;
        game.ui.notify('警报解除，实验体增援恢复常速', 2.8);
      }
      if (this.active || now < this.cooldownUntil) {
        this.countedKills = game.kills;
        this.lastShot = game.shotAt;
      } else if (!game.story?.managed) {
        while (killTimes.length && now - killTimes[0] > rules.streakWindow) killTimes.shift();
        while (this.countedKills < game.kills) {
          killTimes.push(now);
          this.countedKills++;
        }
        if (game.shotAt > this.lastShot) {
          if (!Number.isFinite(this.fireSince) || game.shotAt - this.lastShot > rules.shotGap) this.fireSince = game.shotAt;
          this.lastShot = game.shotAt;
        }
        const loud = Number.isFinite(this.fireSince) && now - this.lastShot <= rules.shotGap &&
          this.lastShot - this.fireSince >= rules.sustainedFire;
        if (loud || killTimes.length >= rules.streakKills) {
          this.setAlarm(true);
          this.alarmUntil = now + rules.duration;
          this.sirenAt = now;
          this.fireSince = -Infinity;
          killTimes.length = 0;
          game.beasts.spawnTime = Math.min(game.beasts.spawnTime, this.spawnEvery);
          game.ui.notify(loud ? '持续枪声触发红色警报' : '连续击杀触发红色警报', 2.9);
        }
      }
      if (!this.active) return;
      if (now >= this.sirenAt) {
        sound.tone(415, 615, 0.69, 0.115, 'triangle');
        sound.tone(615, 355, 0.74, 0.097, 'triangle', 0.66);
        this.sirenAt = now + 4.2;
      }
      this.status = { title: '红色警报', detail: '实验体增援加快', remaining: this.alarmUntil - now };
    },
  };
  alarm.reset();
  return alarm;
}

function createEnvironment({ THREE, scene, mapData, CONFIG: setup, canvasTexture, seededRandom, brighter }) {
  const { rings, specimens, lights, sky, signal } = mapData;
  const red = new THREE.Color(0xff362a);
  const skyNormal = sky.color.clone(), groundNormal = sky.groundColor.clone();
  const skyRed = new THREE.Color(0xff8b70), groundRed = new THREE.Color(0x884458);
  const signalNormal = brighter(ICE, 1.9), signalRed = brighter(0xff493c, 2.45);
  let alarmMix = 0, lastTime = 0;

  // 反射只覆盖大厅中轴的抛光甲板，低分辨率并限制更新率，保留相邻的金属地砖。
  const base = Reflector.ReflectorShader;
  const shader = {
    uniforms: base.uniforms,
    vertexShader: base.vertexShader.replace('varying vec4 vUv;', 'varying vec4 vUv; varying vec2 deckUv;')
      .replace('vUv =', 'deckUv = uv; vUv ='),
    fragmentShader: `
      uniform sampler2D tDiffuse;
      varying vec4 vUv;
      varying vec2 deckUv;
      void main() {
        vec2 edge = min(deckUv, 1.0-deckUv);
        float fade = smoothstep(0.0, 0.12, min(edge.x, edge.y));
        vec3 mirror = texture2DProj(tDiffuse, vUv).rgb;
        gl_FragColor = vec4(mirror * vec3(0.48, 0.67, 0.84), fade * 0.48);
      }
    `,
  };
  const size = setup.graphics.reflectionSize;
  const reflection = new Reflector(new THREE.PlaneGeometry(21, 27.1), {
    shader, textureWidth: size, textureHeight: size, multisample: 0, clipBias: 0.003,
  });
  reflection.position.set(0, 0.008, 0.15);
  reflection.rotation.x = -Math.PI / 2;
  reflection.material.transparent = true;
  reflection.material.depthWrite = false;
  const renderReflection = reflection.onBeforeRender;
  let reflectedAt = -Infinity;
  reflection.onBeforeRender = function (renderer, world, view) {
    if (lastTime - reflectedAt < setup.graphics.reflectionInterval) return;
    reflectedAt = lastTime;
    renderReflection.call(this, renderer, world, view);
  };
  scene.add(reflection);

  const rng = seededRandom(230071);
  const motes = Array.from({ length: 145 }, () => [rng() * 76 - 38, rng() * 3.4 + 0.35, rng() * 76 - 38, rng() * 6.28]);
  const steam = STEAM.flatMap(([x, z]) => Array.from({ length: 20 }, () => [x + 0.7, z, rng(), rng()]));
  const puff = canvasTexture(64, 64, (g, w, h) => {
    const gradient = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, '#effaffbb'); gradient.addColorStop(0.48, '#e7f5ff55'); gradient.addColorStop(1, '#e7f5ff00');
    g.fillStyle = gradient; g.fillRect(0, 0, w, h);
  });
  function points(count, material) {
    const geo = new THREE.BufferGeometry();
    const positions = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', positions);
    const batch = new THREE.Points(geo, new THREE.PointsMaterial({
      ...material, map: puff, depthWrite: false, transparent: true,
    }));
    batch.frustumCulled = false;
    scene.add(batch);
    return positions;
  }
  const dustPositions = points(motes.length, { color: 0xaddbff, size: 0.068, opacity: 0.58 });
  const steamPositions = points(steam.length, { color: 0xb6c8d9, size: 1.02, opacity: 0.24 });

  return {
    update(t, playing, game) {
      const dt = Math.min(0.05, t - lastTime);
      lastTime = t;
      const active = game.encounter?.active && !game.blast && (game.phase === 'play' || game.phase === 'pause');
      alarmMix = THREE.MathUtils.lerp(alarmMix, active ? 1 : 0, 1 - Math.exp(-6.5 * dt));
      const pulse = 0.86 + Math.sin(t * 3.1) * 0.14;
      sky.color.copy(skyNormal).lerp(skyRed, alarmMix * 0.87);
      sky.groundColor.copy(groundNormal).lerp(groundRed, alarmMix);
      signal.color.copy(signalNormal).lerp(signalRed, alarmMix).multiplyScalar(0.92 + 0.08 * Math.sin(t * 5.6) - alarmMix * (1 - pulse) * 0.47);
      for (const { light, normal, strength } of lights) {
        light.color.copy(normal).lerp(red, alarmMix);
        light.intensity = strength * (1 + alarmMix * (0.38 + pulse * 0.22));
      }
      for (const [i, ring] of rings.entries()) {
        ring.rotation.set(Math.PI / 2 + Math.sin(t * 0.85 + i) * 0.18, i * 0.23, t * (i % 2 ? -0.73 : 0.52) + i * 2.2);
      }
      for (const [i, sample] of specimens.entries()) {
        sample.rotation.y = t * (i ? -0.40 : 0.30);
        sample.position.y = 2.16 + Math.sin(t * 1.3 + i * 3) * 0.16;
      }
      for (const [i, [x, y, z, seed]] of motes.entries()) {
        dustPositions.setXYZ(i, x + Math.sin(t * 0.39 + seed) * 0.24, y + Math.sin(t * 0.50 + seed) * 0.29,
          z + Math.cos(t * 0.34 + seed) * 0.35);
      }
      dustPositions.needsUpdate = true;
      for (const [i, [x, z, phase, spread]] of steam.entries()) {
        const age = (phase + t * (0.25 + spread * 0.13)) % 1;
        steamPositions.setXYZ(i, x + age * 2.6, 0.73 + age * (1.35 + spread * 0.74),
          z + Math.sin(i * 2.4 + t * 0.92) * age * 0.7);
      }
      steamPositions.needsUpdate = true;
    },
  };
}

function buildBeastModel(type, { THREE, shapes, mergeGeometries }, rage = false) {
  const body = [], emit = [], transform = new THREE.Object3D();
  const flesh = new THREE.IcosahedronGeometry(1, 0);
  const claw = new THREE.ConeGeometry(0.5, 1, 4);
  const plate = 0x536e80, collar = 0x263b49, skin = 0x776c7b, bone = 0xb6afbe;
  function add(target, shape, color, x, y, z, w, h, d, pitch = 0, roll = 0) {
    const g = shape.index ? shape.toNonIndexed() : shape.clone();
    transform.position.set(x, y, z); transform.scale.set(w, h, d);
    transform.rotation.set(pitch, 0, roll); transform.updateMatrix();
    g.applyMatrix4(transform.matrix);
    const { r, g: green, b } = new THREE.Color(color);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = r; colors[i + 1] = green; colors[i + 2] = b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); target.push(g);
  }
  const hide = (t, ...v) => add(body, flesh, t, ...v);
  const panel = (t, ...v) => add(body, shapes.box, t, ...v);
  const tooth = (t, ...v) => add(body, claw, t, ...v);
  const light = (t, ...v) => add(emit, flesh, t, ...v);

  if (type === 0) {
    hide(skin, 0, 0.59, -0.15, 0.33, 0.26, 0.52);
    hide(bone, 0, 0.63, 0.43, 0.27, 0.22, 0.41);
    panel(collar, 0, 0.66, 0.16, 0.49, 0.33, 0.12, -0.25);
    tooth(skin, 0, 0.51, -0.67, 0.16, 0.41, 0.14, -1.24);
    for (const s of [-1, 1]) {
      for (const z of [-0.36, 0.29]) {
        panel(skin, s * 0.24, 0.25, z, 0.105, 0.46, 0.19, z > 0 ? -0.25 : 0.34, s * -0.32);
        tooth(bone, s * 0.33, 0.10, z + 0.15, 0.094, 0.17, 0.095, 1.5);
      }
      light(0xffad75, s * 0.125, 0.68, 0.68, 0.059, 0.041, 0.041);
    }
  } else if (type === 1) {
    hide(skin, 0, 1.11, -0.14, 0.54, 0.65, 0.52);
    panel(plate, 0, 1.49, 0.33, 0.92, 0.54, 0.48, 0.20);
    panel(collar, 0, 1.61, 0.57, 0.48, 0.22, 0.24);
    light(0xff9e68, 0, 1.62, 0.71, 0.19, 0.033, 0.045);
    for (const s of [-1, 1]) {
      panel(plate, s * 0.50, 1.42, 0.11, 0.35, 0.53, 0.63, 0.20, s * 0.21);
      panel(collar, s * 0.48, 0.66, 0.34, 0.26, 0.70, 0.32, -0.26);
      panel(plate, s * 0.51, 0.42, 0.51, 0.32, 0.26, 0.41);
      hide(skin, s * 0.32, 0.42, -0.37, 0.23, 0.46, 0.30);
      light(0xffad75, s * 0.46, 1.60, 0.443, 0.077, 0.030, 0.030);
    }
  } else if (type === 2) {
    hide(0x58766c, 0, 0.97, -0.15, 0.45, 0.57, 0.49);
    hide(0x8a9f88, 0, 1.36, 0.36, 0.33, 0.29, 0.39);
    panel(collar, 0, 1.19, 0.62, 0.43, 0.13, 0.21);
    light(0xb7ff68, 0, 1.21, 0.742, 0.11, 0.06, 0.047);
    for (const s of [-1, 1]) {
      hide(0x729c78, s * 0.39, 1.18, -0.36, 0.26, 0.41, 0.30);
      light(0x88e953, s * 0.56, 1.21, -0.26, 0.14, 0.28, 0.17);
      panel(skin, s * 0.30, 0.43, -0.21, 0.18, 0.62, 0.24, -0.29, -s * 0.27);
      panel(plate, s * 0.35, 0.50, 0.26, 0.16, 0.72, 0.19, 0.54, s * 0.20);
      light(0xbdff75, s * 0.15, 1.46, 0.625, 0.057, 0.043, 0.041);
    }
  } else {
    const tint = rage ? 0xff644c : 0x85d9ff;
    hide(rage ? 0x885060 : skin, 0, 2.00, -0.14, 0.74, 1.10, 0.64);
    hide(bone, 0, 2.76, 0.60, 0.44, 0.44, 0.43);
    panel(collar, 0, 2.74, 0.89, 0.71, 0.24, 0.31);
    panel(plate, 0, 2.07, 0.45, 0.90, 0.74, 0.21, -0.24);
    light(tint, 0, 2.12, 0.66, 0.29, 0.25, 0.107);
    for (const s of [-1, 1]) {
      hide(skin, s * 0.69, 2.29, 0.21, 0.41, 0.51, 0.51);
      panel(plate, s * 0.74, 2.55, 0.12, 0.46, 0.31, 0.64, s * 0.16, s * -0.32);
      panel(collar, s * 0.85, 1.47, 0.53, 0.42, 1.03, 0.55, -0.30, s * -0.13);
      hide(bone, s * 0.87, 0.92, 0.77, 0.31, 0.35, 0.37);
      panel(plate, s * 0.43, 0.65, -0.23, 0.44, 1.06, 0.49, -0.23);
      hide(skin, s * 0.44, 0.19, -0.049, 0.28, 0.22, 0.47);
      light(tint, s * 0.20, 2.85, 0.988, 0.098, 0.056, 0.042);
      light(tint, s * 0.83, 1.61, 0.83, 0.089, 0.28, 0.046);
      if (rage) {
        tooth(0xe8a2a4, s * 0.55, 3.07, 0.14, 0.29, 0.74, 0.31, -0.36, s * -0.56);
        light(0xff8d57, s * 0.46, 2.38, 0.505, 0.07, 0.32, 0.06);
      }
    }
  }
  const models = [mergeGeometries(body), mergeGeometries(emit)];
  [...body, ...emit, flesh, claw].forEach(geometry => geometry.dispose());
  return models;
}

export default {
  story:labStory,
  weaponSkin: 'underground-lab',
  config: CONFIG,
  grid: MAP_GRID,
  loot: LANDMARKS.loot,
  ammo: LANDMARKS.ammo,
  buildMap,
  createEnvironment,
  createEncounter,
  buildBeastModel,
  buildRageModel: helpers => buildBeastModel(3, helpers, true),
  background: 0x101e2c,
  fog: 0x172a39,
  portal: { width: 4.91, depth: 0.22, height: 4.9 },
  palette: {
    projectile: 0xa6f65c, ichor: 0x78806a, core: 0x83ceff, rare: 0x7eeed2, blast: 0xc7eaff,
    rift: {
      sealed: [0.13, 0.58, 1.48], ready: [0.91, 1.42, 2.25],
      rings: [0x99ddff, 0xe1f8ff], particles: 0xa5d8ff, wave: 0xc4efff,
    },
  },
  terrain: {
    routeOpen(x, z, level) {
      const box = level.serviceHatch;
      return box.active === false || x < box.x0 - 0.52 || x > box.x1 + 0.52 ||
        z < box.z0 - 0.52 || z > box.z1 + 0.52;
    },
  },
  inSafeZone(x, z, _spawn, margin) {
    return Math.abs(x) < 6.25 + margin && z >= 28 - margin;
  },
  area(x, z) {
    if (z >= 32 && Math.abs(x) < 4) return '入口气闸舱';
    if (z >= 28 && Math.abs(x) < 6.25) return '安全缓冲区';
    if (Math.abs(x) < 13 && Math.abs(z) < 14) return '核心实验大厅';
    if (z <= -24 || (z < -14 && Math.abs(x) < 13)) return '北区维修管道';
    if (z > 2.3) return '货运装卸区';
    if (Math.abs(z) <= 2.3) return '十字主走廊';
    return x < 0 ? '西区样本培养室' : '东区服务器机房';
  },
  minimap: {
    tiles: { '#': '#405469', H: '#253e50', E: '#203e56', W: '#254744', N: '#3b3e45', S: '#333e47', B: '#61778b' },
    overlay({ ctx, px, pz, game }) {
      if (game.encounter?.active) {
        ctx.fillStyle = '#fc4d482a'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      }
      ctx.strokeStyle = '#9ad6ef';
      ctx.beginPath(); ctx.moveTo(px(-3.6), pz(AIRLOCK.z)); ctx.lineTo(px(3.6), pz(AIRLOCK.z)); ctx.stroke();
      if (game.encounter?.hatchOpen) {
        ctx.strokeStyle = '#83efbb';
        ctx.beginPath(); ctx.moveTo(px(HATCH.x), pz(HATCH.z - 1.3)); ctx.lineTo(px(HATCH.x), pz(HATCH.z + 1.3)); ctx.stroke();
      }
    },
  },
  text: {
    tag: '第一关 / 地下研究设施',
    title: '地下实验室',
    enter: '进入气闸舱',
    enemy: '实验体',
    bossName: '零号实验体',
    keyItem: '核心权限卡',
    portal: '能量裂隙',
    loot: '研究物资',
    safe: '气闸安全缓冲区',
    rage: '零号实验体挣脱拘束，变异幼体正在聚集',
    brief: '收容失效。先去安检室取卡，再进入培养室与机房恢复供电。反应堆隔离门后是零号实验体，核心权限卡可打开检修气闸。',
  },
};
