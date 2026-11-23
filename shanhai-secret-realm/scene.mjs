const CONFIG = {
  map: { cell: 3.6, fog: 0.015, navCell: 1.0 },
  graphics: { maxPixelRatio: 1.25, bloomScale: 0.63 },
  audio: { ambient: { activeGain: 0.20, pauseGain: 0.10, frequency: 420, filter: 'lowpass' } },
  player: { walk: 5.65, sprint: 9, hurtCooldown: 0.42 },
  weapon: { fireRate: 10, magazine: 60, reloadTime: 1.8, baseSpread: 0.0045, maxSpread: 0.033, recoil: 0.012 },
  beasts: {
    killsToWin: 150, sight: 22, memory: 6,
    types: [
      { hp: 51, speed: 7.85, damage: 7, windup: 0.32, recovery: 1.05 },
      { hp: 143, damage: 16, windup: 0.78 },
      { hp: 91, damage: 11, projectileSpeed: 13.3, projectileGravity: 11, hazardLife: 4.5 },
      { hp: 790, damage: 23, summonCount: 7 },
    ],
  },
  pickups: { ammoDrop: 17, ammoCache: 60 },
  moon: { period: 120, duration: 20, warning: 8, nightfall: 58, speed: 1.14, damage: 1.30, ammo: 12, health: 9 },
  lava: { depth: -0.40, damage: 14, cooldown: 0.55 },
};

// 北在上。# 山壁，^ 岩石，R 断垣，B 竹丛，T 墓碑，+ 石道，~ 岩浆，= 石桥。
const MAP_GRID = [
  '#########################',
  '#..^.....^.....^.....^..#',
  '#....+.^....+...^..+....#',
  '#..^.........^.......^..#',
  '#.~~~=~~~~~~=~~~~~~=~~~.#',
  '#.~~~=~~~~~~=~~~~~~=~~~.#',
  '#.~~~=~~~~~~=~~~~~~=~~~.#',
  '#..^.+..^...+..^...+..^.#',
  '#.^..RR...^.+.^...B.B^..#',
  '#..RRR.^....+..^.B..BB.^#',
  '#.^....R..^.+.^...B..BB.#',
  '#...^.RR^..+++..^B.B..^.#',
  '#.^RR...++^+++^++B...BB.#',
  '#..R..RR...+++....B.B...#',
  '#.^......^..+..^.B.B.B^.#',
  '#...RR.R....+.....B...B.#',
  '#..^..R.....+....B.B.^..#',
  '#...TR..^.T.+.T.^..BB..^#',
  '#....T..T.T.+.T.T..T....#',
  '#..^..T..T..+..T...T..^.#',
  '#....T.T..T.+.T..T.T....#',
  '#.^.....T...+...T...T.^.#',
  '#.....T...T.+.T...T.....#',
  '#...^...^...+...^....^..#',
  '#########################',
];

const LANDMARKS = {
  spawn: [0, 38.5], arch: [0, 32.2], altar: [0, -1.3], gate: [0, -11.8], boss: [4.6, -4.2],
  terraces: { x: -25.2, z: -0.4, width: 3.8, deck: 5.2, rise: 0.36, tread: 0.79, steps: 4 },
  graveGuards: [[1, -11.3, 23.8], [2, 12.5, 24.7], [1, -17.1, 16.3], [2, 16.9, 16.0]],
};

const loot = [
  [-13.0, 26.0, '兽面青铜鼎', 460], [13.0, 28.0, '白泽骨简', 385], [-19.5, 19.5, '夔纹玉璧', 365],
  [24.2, 2.5, '幽竹灵草', 165], [32.4, -12.8, '青鸾尾羽', 290],
  [LANDMARKS.terraces.x, LANDMARKS.terraces.z, '双螭铜镜', 340, 'top'], [-31.7, -14.8, '残城玉琮', 230],
  [-25.2, -36.2, '赤焰玄晶', 360], [25.4, -35.3, '朱厌臼齿', 320], [7.3, -8.5, '玄鸟璜', 275],
];
const ammo = [[0, 35.1], [-16.1, 30.2], [19.4, 28.6], [29.6, 9.2], [23.3, -14.1],
  [-32.6, 6.6], [-16.4, -15.3], [-2.8, -2.3], [-19.6, -34.3], [23.7, -34.4]];

const half = CONFIG.map.cell * MAP_GRID.length / 2;
const TAU = 2 * Math.PI;

function tileAt(x, z) {
  const index = value => Math.floor((value + half) / CONFIG.map.cell);
  return MAP_GRID[index(z)]?.[index(x)];
}

function stoneTexture(canvasTexture, seededRandom, pattern, base, carving) {
  const random = seededRandom(9237);
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 3500; i++) {
      ctx.fillStyle = (i % 2 ? 'rgba(0,0,0,' : 'rgba(215,212,178,') + (0.02 + random() * 0.12) + ')';
      ctx.fillRect(random() * w, random() * h, 1 + random() * 7, 1 + random() * 4);
    }
    ctx.lineJoin = 'bevel';
    function path(points, shade, width, offset = 0) {
      ctx.beginPath();
      for (const [i, [x, y]] of points.entries()) {
        if (i) ctx.lineTo(x, y + offset);
        else ctx.moveTo(x, y + offset);
      }
      ctx.strokeStyle = shade;
      ctx.lineWidth = width;
      ctx.stroke();
    }
    const cut = points => {
      path(points, 'rgba(213,185,127,.26)', 3, 2);
      path(points, carving, 3);
    };
    if (pattern === 'cloud') {
      for (const y of [32, 96, 160, 224]) {
        for (const x of [24, 108, 192]) {
          const cloud = [[-23, 10], [-19, 2], [-9, 0], [-5, -9], [8, -14], [23, -10],
            [28, -2], [25, 7], [15, 10], [8, 6], [9, 0], [16, -2], [19, 2]];
          cut(cloud.map(([a, b]) => [a + x, b + y]));
          cut([[x - 21, y + 19], [x + 44, y + 19]]);
        }
      }
    } else if (pattern === 'thunder') {
      for (const y of [12, 76, 140, 204]) {
        for (const x of [7, 71, 135, 199]) {
          cut([[x, y + 38], [x, y], [x + 48, y], [x + 48, y + 42], [x + 11, y + 42],
            [x + 11, y + 10], [x + 37, y + 10], [x + 37, y + 30], [x + 22, y + 30], [x + 22, y + 18], [x + 29, y + 18]]);
        }
      }
    } else if (pattern === 'mask') {
      for (const side of [-1, 1]) {
        const mirrored = points => cut(points.map(([x, y]) => [128 + side * x, y]));
        mirrored([[8, 91], [33, 52], [82, 59], [107, 87], [92, 112], [59, 119], [27, 100], [8, 91],
          [20, 129], [59, 139], [86, 156], [87, 199], [51, 214], [22, 199], [15, 174]]);
        mirrored([[27, 86], [48, 71], [75, 75], [83, 92], [59, 103], [40, 97], [27, 86]]);
        mirrored([[44, 148], [70, 162], [67, 183], [49, 185], [42, 174], [44, 148]]);
        mirrored([[7, 51], [34, 34], [86, 35], [114, 63]]);
      }
      cut([[128, 102], [111, 145], [128, 162], [145, 145], [128, 102]]);
      cut([[15, 231], [241, 231]]);
    }
  }, true);
}

function glowTexture(canvasTexture, broad = false) {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, broad ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,1)');
    gradient.addColorStop(0.34, 'rgba(255,255,255,.22)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
}

function sigilTexture(canvasTexture) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2.5;
    for (const radius of [110, 169, 193, 228, 239]) {
      ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.stroke();
    }
    for (let i = 0; i < 24; i++) {
      ctx.save();
      ctx.rotate(i * TAU / 24);
      ctx.beginPath();
      ctx.moveTo(0, 219); ctx.lineTo(-7, 211); ctx.lineTo(0, 199);
      ctx.lineTo(7, 211); ctx.closePath();
      ctx.moveTo(-4, 213); ctx.lineTo(4, 213);
      if (i % 3 === 0) { ctx.moveTo(0, 193); ctx.lineTo(0, 169); }
      ctx.stroke();
      ctx.restore();
    }
    for (const spin of [0, Math.PI / 4]) {
      ctx.save(); ctx.rotate(spin); ctx.strokeRect(-118, -118, 236, 236); ctx.restore();
    }
    // 雷纹转折落在符阵中心，外围保留可辨认的方圆结构。
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-73, -63); ctx.lineTo(71, -63); ctx.lineTo(71, 60); ctx.lineTo(-57, 60);
    ctx.lineTo(-57, -47); ctx.lineTo(53, -47); ctx.lineTo(53, 43); ctx.lineTo(-38, 43);
    ctx.lineTo(-38, -31); ctx.lineTo(35, -31); ctx.lineTo(35, 24); ctx.lineTo(-15, 24);
    ctx.lineTo(-15, -13); ctx.lineTo(16, -13);
    ctx.stroke();
  });
}

function lavaTexture(canvasTexture, seededRandom) {
  const random = seededRandom(4431);
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#5b1717'; ctx.fillRect(0, 0, w, h);
    const sites = Array.from({ length: 34 }, () => [random() * w, random() * h]);
    const pixels = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let best = Infinity, second = Infinity;
        for (const [sx, sy] of sites) {
          const dx = Math.min(Math.abs(x - sx), w - Math.abs(x - sx));
          const dy = Math.min(Math.abs(y - sy), h - Math.abs(y - sy));
          const d = dx * dx + dy * dy;
          if (d < best) { second = best; best = d; }
          else if (d < second) second = d;
        }
        const heat = Math.exp(-(Math.sqrt(second) - Math.sqrt(best)) * 0.20);
        const i = (y * w + x) * 4;
        pixels.data[i] = 65 + heat * 190 + random() * 13;
        pixels.data[i + 1] = 20 + heat * 101;
        pixels.data[i + 2] = 23 + heat * 22;
        pixels.data[i + 3] = 255;
      }
    }
    ctx.putImageData(pixels, 0, 0);
  }, true);
}

function buildMap({ THREE, scene, GRID, level, StaticBatches, shapes, canvasTexture, seededRandom, brighter }) {
  const random = seededRandom(57118);
  const mild = stoneTexture(canvasTexture, seededRandom, 'plain', '#686861', '#2e302d');
  const cloud = stoneTexture(canvasTexture, seededRandom, 'cloud', '#8d8674', '#45463b');
  const thunder = stoneTexture(canvasTexture, seededRandom, 'thunder', '#8e7e66', '#4b463c');
  const mask = stoneTexture(canvasTexture, seededRandom, 'mask', '#918b77', '#463e32');
  const lavaMap = lavaTexture(canvasTexture, seededRandom);
  const lanternMat = new THREE.MeshBasicMaterial({ color: brighter(0xff8b46, 2.0) });
  const lambert = map => new THREE.MeshLambertMaterial({ map });
  const materials = {
    earth: lambert(mild), cloud: lambert(cloud), thunder: lambert(thunder), mask: lambert(mask),
    dark: new THREE.MeshLambertMaterial({ color: 0x8b8a7d }),
    bamboo: new THREE.MeshLambertMaterial({ color: 0xa1bd9b }),
    leaves: new THREE.MeshLambertMaterial({ color: 0x8cb994 }),
    lava: new THREE.MeshBasicMaterial({ map: lavaMap, color: 0xffa55c }),
    lantern: lanternMat, jade: new THREE.MeshBasicMaterial(),
  };
  const batch = new StaticBatches(materials, {
    ...shapes,
    flute: new THREE.CylinderGeometry(0.43, 0.5, 1, 6),
    peak: new THREE.CylinderGeometry(0.083, 0.68, 1, 6),
    bulb: new THREE.SphereGeometry(0.5, 9, 6),
    leaf: new THREE.IcosahedronGeometry(0.6, 0),
  });
  const add = (...args) => batch.add(...args);
  const flagGlow = brighter(0x83ffc6, 1.7);
  const stone = 0xb9b2a3;
  const lanterns = [];
  const { spawn, arch, altar, gate, boss, terraces } = LANDMARKS;
  level.spawn.set(spawn[0], 0, spawn[1]);
  level.gate.set(gate[0], 0, gate[1]);
  level.bossSpawn.set(boss[0], 0, boss[1]);
  level.bossAnchor.set(boss[0], 0, boss[1]);

  function block(x, y, z, w, h, d, surface, tint, climb = false) {
    add('box', surface, x, y - h / 2, z, w, h, d, tint);
    level.box(x, z, w, d, y - h, y, climb);
  }
  function pillar(x, z, h, w, tint = stone) {
    block(x, h, z, w, h, w, 'thunder', tint);
    add('box', 'cloud', x, 0.11, z, w + 0.21, 0.22, w + 0.21, tint);
    add('box', 'dark', x, h - 0.05, z, w + 0.12, 0.13, w + 0.12, tint);
  }
  function lantern(x, z, y, scale = 1) {
    lanterns.push([x, y, z, scale]);
    add('bulb', 'lantern', x, y, z, 0.46 * scale, 0.54 * scale, 0.46 * scale);
    for (const side of [-1, 1]) {
      add('flute', 'dark', x, y + side * 0.24 * scale, z, 0.32 * scale, 0.09 * scale, 0.32 * scale, 0xe0a06a);
    }
    add('flute', 'lantern', x, y - 0.35 * scale, z, 0.04, 0.15 * scale, 0.04);
  }
  function post(x, z, height = 2.35) {
    pillar(x, z, height, 0.32, 0x928475);
    add('box', 'dark', x + 0.26, height - 0.09, z, 0.64, 0.12, 0.18, 0x928475);
    lantern(x + 0.50, z, height - 0.43, 0.87);
  }
  function bamboo(x, z) {
    // 主茎簇注册为窄掩体，冠叶遮挡视野，簇间保留穿行缝隙。
    level.box(x, z, 1.30, 1.27, 0, 4.8);
    for (let i = 0; i < 7; i++) {
      const angle = i * 2.39996;
      const bx = x + Math.cos(angle) * (0.15 + random() * 0.58);
      const bz = z + Math.sin(angle) * (0.15 + random() * 0.58);
      const h = 4.0 + random() * 4.3;
      const tint = i % 2 ? 0x669574 : 0x457a68;
      add('flute', 'bamboo', bx, h / 2, bz, 0.13, h, 0.13, tint);
      for (let k = 1; k < h; k += 0.84) add('flute', 'bamboo', bx, k, bz, 0.17, 0.069, 0.17, 0xb9bb83);
      for (const side of [-1, 1]) {
        add('leaf', 'leaves', bx + side * 0.51, h - 0.45, bz + 0.21, 1.50, 0.18, 0.49, tint, angle, side * 0.22, side * 0.28);
        add('leaf', 'leaves', bx + side * 0.31, h - 1.75, bz - 0.28, 1.06, 0.16, 0.40, tint, angle + 0.9, 0, side * 0.18);
      }
    }
  }

  for (let row = 0; row < GRID.rows; row++) {
    for (let col = 0; col < GRID.columns; col++) {
      const tile = GRID.cells[row][col], x = GRID.x(col), z = GRID.z(row), cell = GRID.cell;
      if (tile === '~') {
        add('plane', 'lava', x, CONFIG.lava.depth, z, cell + 0.004, cell + 0.004, 1, 0xffffff, 0, -Math.PI / 2);
        continue;
      }
      const inGrove = x > 15 && z > -18 && z < 19;
      const inGraves = z > 16;
      const tone = tile === '+' || tile === '=' ? 0xaba28f : inGrove ? 0x667c68 : inGraves ? 0x827b6d : 0x8b8b80;
      add('box', tile === '=' ? 'thunder' : 'earth', x, -0.32, z, cell + 0.004, 0.64, cell + 0.004, tone);
      if (tile === '#') {
        const height = 4.3 + random() * 6.8;
        level.box(x, z, cell + 0.01, cell + 0.01, 0, height);
        add('peak', 'dark', x, height * 0.40, z, 3.2 + random(), height, 2.9 + random(), 0x6c746c, random() * TAU, 0, (random() - 0.5) * 0.25);
        add('stone', 'earth', x, height * 0.14, z, 3.7, height * 0.55, 3.7, 0x817b6d, random() * TAU);
      } else if (tile === '^') {
        const h = 1.15 + random() * 1.67;
        add('stone', 'earth', x, h * 0.32, z, 1.47, h, 1.49, 0xb9aa9a, random() * TAU);
        level.box(x, z, 1.50, 1.45, 0, h * 0.76);
      } else if (tile === 'R') {
        const h = 1.07 + random() * 1.65;
        block(x, h, z, 2.60, h, 0.95, 'cloud', stone);
        add('stone', 'dark', x + 0.72, h - 0.19, z, 1.23, 0.93, 1.17, 0x9c9181, random() * TAU);
      } else if (tile === 'B') {
        bamboo(x, z);
      } else if (tile === 'T') {
        const h = 0.78 + random() * 0.61;
        block(x, 0.18, z, 1.32, 0.23, 1.68, 'earth', 0x8c9584, true);
        block(x, h, z - 0.39, 0.73, h, 0.35, 'mask', 0xa9a194);
        add('stone', 'dark', x + 0.49, 0.08, z + 0.51, 0.52, 0.19, 0.38, 0xb1a38b);
      } else if (tile === '=') {
        for (const side of [-1, 1]) {
          const lip = x + side * 1.60;
          block(lip, 0.29, z, 0.23, 0.31, cell, 'earth', 0x92907c, true);
          if (row !== 5) pillar(lip, z + (row === 4 ? -0.96 : 0.96), 0.94, 0.39);
        }
      }
    }
  }

  // 古城废墟有南北两组台阶，中央楼台可拾取宝物。
  block(terraces.x, terraces.steps * terraces.rise, terraces.z, terraces.width, 1.63, terraces.deck, 'cloud', stone, true);
  for (const side of [-1, 1]) {
    for (let i = 1; i <= terraces.steps; i++) {
      const dz = terraces.deck / 2 + (i - 0.5) * terraces.tread;
      const h = (terraces.steps + 1 - i) * terraces.rise;
      block(terraces.x, h, terraces.z + side * dz, terraces.width, h + 0.10, terraces.tread, 'earth', stone, true);
    }
  }
  for (const side of [-1, 1]) {
    block(terraces.x + side * 1.76, 1.75, terraces.z, 0.26, 0.34, terraces.deck, 'thunder', stone, true);
  }

  for (const side of [-1, 1]) {
    const x = arch[0] + side * 3.38, z = arch[1];
    pillar(x, z, side === 1 ? 4.72 : 4.27, 0.86);
    add('box', 'mask', x, 2.52, z + 0.52, 1.46, 1.21, 0.24, 0xbeb093);
    add('box', 'cloud', x + side * 0.18, 4.93, z, 1.95, 0.34, 1.31, stone, 0, 0, side * 0.10);
    add('box', 'dark', x + side * 0.18, 5.23, z, 2.41, 0.18, 1.75, 0xb8afa0, 0, 0, side * 0.12);
    add('box', 'cloud', side * 1.77, 4.37, z, 3.30, 0.48, 0.72, 0xc4b295, 0, 0, side * 0.06);
    level.box(side * 1.77, z, 3.30, 0.72, 4.11, 4.72);
    lantern(side * 2.48, z + 0.08, 3.83, 1.22);
    lantern(side * 5.50, z + 1.30, 1.55, 0.83);
    pillar(side * 5.50, z + 1.30, 1.20, 0.61);
  }

  const plaza = new THREE.Mesh(new THREE.CircleGeometry(8.50, 64),
    new THREE.MeshLambertMaterial({ map: mild, color: 0x747f79 }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(altar[0], 0.017, altar[1]);
  scene.add(plaza);
  const texture = sigilTexture(canvasTexture);
  const sigil = new THREE.Mesh(new THREE.PlaneGeometry(15.7, 15.7), new THREE.MeshBasicMaterial({
    map: texture, color: brighter(0x8ceac2, 1.54), transparent: true, opacity: 0.70,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, blending: THREE.AdditiveBlending,
  }));
  sigil.rotation.x = -Math.PI / 2;
  sigil.position.set(altar[0], 0.028, altar[1]);
  scene.add(sigil);
  for (let i = 0; i < 8; i++) {
    const angle = (i + 0.5) * TAU / 8;
    const x = Math.sin(angle) * 8.97, z = altar[1] + Math.cos(angle) * 8.97;
    if (Math.abs(x) < 5 && z < -7) continue;
    pillar(x, z, 1.16 + (i % 2) * 0.55, 0.70);
    add('stone', 'jade', x, 1.26 + (i % 2) * 0.55, z, 0.24, 0.22, 0.24, flagGlow, angle);
  }

  for (const side of [-1, 1]) {
    const x = side * 3.10;
    block(x, 4.35, gate[1], 1.07, 4.45, 1.05, 'cloud', 0xbab29f);
    add('box', 'mask', x, 2.36, gate[1] + 0.59, 1.14, 1.32, 0.14, 0xa69b7f);
    add('stone', 'earth', x, 4.55, gate[1], 1.03, 1.03, 1.10, 0xb6ab93);
    lantern(x + side * 0.87, gate[1] + 0.44, 3.22, 0.98);
  }

  for (const [x, z] of [[-9.3, 18.8], [9.2, 16.8], [-19, 9], [17.8, 7.4], [-23.5, -17.5], [23.5, -32.1], [1, -29.4]]) post(x, z);
  for (const [x, z] of [[-36, 9.5], [-35.5, -12.8], [36, -7.4], [35.1, 12.2], [-15.2, 6.7]]) {
    const h = 2.39 + random() * 0.88;
    pillar(x, z, h, 0.86, 0x8f9788);
    add('box', 'mask', x, h * 0.58, z + 0.48, 1.35, 1.27, 0.18, 0x959880);
  }

  // 远景山脊只参与渲染，近处崖壁负责限制可玩边界。
  for (let ring = 0; ring < 2; ring++) {
    const distance = 58 + ring * 20;
    for (let i = 0; i < 28; i++) {
      const a = i * TAU / 28 + ring * 0.14;
      const height = 9 + random() * 19 + ring * 5;
      add('peak', 'dark', Math.cos(a) * distance, height * 0.30, Math.sin(a) * distance,
        8 + random() * 8, height, 7 + random() * 6, ring ? 0x677371 : 0x555b58, random() * TAU, 0, (random() - 0.5) * 0.26);
    }
  }
  batch.flush();

  const skyLight = new THREE.HemisphereLight(0xebc6aa, 0x526860, 1.64);
  const rimLight = new THREE.DirectionalLight(0xffaf87, 1.48);
  rimLight.position.set(-24, 28, -42);
  scene.add(skyLight, rimLight);
  for (const [x, y, z, color, intensity, distance] of [
    [0, 3.1, 33, 0xff8e54, 54, 12], [0, 3, -11, 0xff4f63, 53, 13], [0, 0.9, -0.8, 0x8affca, 32, 13],
    [25.5, 2, -0.5, 0x77d39e, 45, 15], [-25, 2, 0, 0xffb67a, 35, 14],
    [-14, 1.7, -25.2, 0xff552c, 45, 15], [15, 1.7, -25.2, 0xff552c, 45, 15],
  ]) {
    const light = new THREE.PointLight(color, intensity, distance);
    light.position.set(x, y, z);
    scene.add(light);
  }
  return { lanterns, lanternMat, skyLight, rimLight, sigil, lavaMap };
}

function createEncounter({ CONFIG: setup, sound }) {
  const moon = setup.moon;
  const status = { title: '', detail: '', remaining: 0 };
  return {
    phase: 'calm', status: null, guardsPlaced: false,
    get beastSpeedScale() { return this.phase === 'active' ? moon.speed : 1; },
    get beastDamageScale() { return this.phase === 'active' ? moon.damage : 1; },
    get bonusAmmo() { return this.phase === 'active' ? moon.ammo : 0; },
    get bonusHealth() { return this.phase === 'active' ? moon.health : 0; },
    reset() {
      this.phase = 'calm';
      this.status = null;
      this.guardsPlaced = false;
    },
    update(game) {
      if (!this.guardsPlaced) {
        this.guardsPlaced = true;
        // 用共享对象池放置墓园守卫。若常规刷新已占用该点，让出该次固定刷新。
        for (const [type, x, z] of LANDMARKS.graveGuards) {
          if (!game.beasts.pool.some(b => b.active && Math.hypot(b.x - x, b.z - z) < 1.7)) game.beasts.spawn(type, x, z);
        }
      }

      const cycle = game.time % moon.period;
      const active = game.time >= moon.period && cycle < moon.duration;
      const warning = cycle >= moon.period - moon.warning;
      const phase = active ? 'active' : warning ? 'warning' : 'calm';
      if (phase !== this.phase) {
        this.phase = phase;
        game.ui.notify(active ? '血月已至，击杀额外掉落弹药与圣露' : warning ? '月色转红，血月将至' : '血月退去', 2.6);
        game.ui.tick = 0;
        if (active) sound.tone(125, 43, 1.14, 0.31, 'triangle');
      }
      status.title = active ? '血月当空' : '血月将至';
      status.detail = active ? '凶兽移速与伤害提高，击杀多掉弹药和圣露' : '凶兽即将强化';
      status.remaining = (active ? moon.duration : moon.period) - cycle;
      this.status = active || warning ? status : null;

      const { player } = game;
      if (!game.blast && tileAt(player.x, player.z) === '~' && player.y <= setup.lava.depth + 0.14 &&
          player.hurt(setup.lava.damage, game, setup.lava.cooldown) && player.hp > 0) {
        game.ui.notify('熔岩灼伤，退回石桥或岸边', 1.2);
      }
    },
  };
}

function createEnvironment({ THREE, scene, camera, CONFIG: setup, mapData, shapes, seededRandom, canvasTexture, dynamicMesh, updateMesh, brighter }) {
  const random = seededRandom(8331);
  const { lanterns, lanternMat, skyLight, rimLight, sigil, lavaMap } = mapData;
  const duskZenith = new THREE.Color(0x283d50), duskHorizon = new THREE.Color(0x946858);
  const nightZenith = new THREE.Color(0x17283c), nightHorizon = new THREE.Color(0x445750);
  const redHorizon = new THREE.Color(0x783c45);
  const duskFog = new THREE.Color(0x766758), nightFog = new THREE.Color(0x354a49), redFog = new THREE.Color(0x673c43);
  const duskSun = new THREE.Color(0xffc29a), nightSun = new THREE.Color(0x99cbe5), redSun = new THREE.Color(0xff777d);
  const duskMoon = new THREE.Color(0xffe9c2), redMoon = new THREE.Color(0xff4d51);
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { zenith: { value: duskZenith.clone() }, horizon: { value: duskHorizon.clone() } },
    vertexShader: `
      varying vec3 direction;
      void main() {
        direction = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 direction;
      uniform vec3 zenith, horizon;
      void main() {
        float height = clamp(normalize(direction).y, 0.0, 1.0);
        gl_FragColor = vec4(mix(horizon, zenith, 1.0 - pow(1.0 - height, 5.2)), 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(113, 24, 14), skyMaterial);
  sky.renderOrder = -10;
  scene.add(sky);

  const halo = glowTexture(canvasTexture, true);
  function sprite(map, color, opacity = 1, additive = false) {
    const material = new THREE.SpriteMaterial({ color, map, opacity, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const node = new THREE.Sprite(material);
    scene.add(node);
    return node;
  }
  const moonMap = canvasTexture(256, 256, (ctx, w, h) => {
    const radius = 120;
    ctx.arc(w / 2, h / 2, radius, 0, TAU);
    ctx.clip();
    const glow = ctx.createRadialGradient(102, 104, 25, 133, 133, 147);
    glow.addColorStop(0, '#fff9e6'); glow.addColorStop(0.55, '#dfc7ad'); glow.addColorStop(1, '#8b776d');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 75; i++) {
      const x = random() * w, y = random() * h, r = 3 + random() * 23;
      const crater = ctx.createRadialGradient(x, y, 0, x, y, r);
      crater.addColorStop(0, 'rgba(84,66,62,.29)'); crater.addColorStop(1, 'rgba(84,66,62,0)');
      ctx.fillStyle = crater;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
  const moonHalo = sprite(halo, 0xffae87, 0.22, true);
  const moon = sprite(moonMap, duskMoon, 1);
  moon.material.fog = false;
  moonHalo.material.fog = false;
  moon.position.set(23, 29, -79);
  moonHalo.position.copy(moon.position);
  moon.scale.set(8.1, 8.1, 1);
  moonHalo.scale.set(25, 25, 1);
  moonHalo.renderOrder = 1;
  moon.renderOrder = 2;

  const cloud = canvasTexture(256, 96, (ctx, w, h) => {
    for (let i = 0; i < 22; i++) {
      const x = random() * w * 0.78 + w * 0.11, y = (0.27 + random() * 0.45) * h;
      const radius = 15 + random() * 42;
      const vapor = ctx.createRadialGradient(x, y, 0, x, y, radius);
      const edge = Math.sin(Math.PI * x / w);
      vapor.addColorStop(0, 'rgba(255,255,255,' + (0.12 * edge) + ')');
      vapor.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = vapor;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    ctx.globalCompositeOperation = 'destination-in';
    const fade = ctx.createLinearGradient(0, 0, 0, h);
    fade.addColorStop(0, 'transparent'); fade.addColorStop(0.5, 'white'); fade.addColorStop(1, 'transparent');
    ctx.fillStyle = fade; ctx.fillRect(0, 0, w, h);
  });
  // 云雾和灯笼光晕使用面向相机的实例批次，避免每团云雾单独绘制。
  const mist = Array.from({ length: 22 }, (_, i) => ({
    angle: i * TAU / 22,
    distance: 43 + (i % 3) * 8,
    width: 22 + random() * 21,
    height: 2.8 + random() * 4.1,
    y: 2.1 + random() * 9,
  }));
  const cloudBatch = dynamicMesh(shapes.plane, new THREE.MeshBasicMaterial({
    map: cloud, fog: false, transparent: true, opacity: 0.63, depthWrite: false,
  }), mist.length);
  cloudBatch.renderOrder = 3;
  const lanternBatch = dynamicMesh(shapes.plane, new THREE.MeshBasicMaterial({
    map: halo, color: 0xff7d51, transparent: true, opacity: 0.44, depthWrite: false, blending: THREE.AdditiveBlending,
  }), lanterns.length);
  const faceCamera = new THREE.Object3D();
  function placeBillboard(batch, i, x, y, z, width, height) {
    faceCamera.position.set(x, y, z);
    faceCamera.scale.set(width, height, 1);
    faceCamera.updateMatrix();
    batch.setMatrixAt(i, faceCamera.matrix);
  }

  function motes(count, tint, size, embers) {
    const geometry = new THREE.BufferGeometry();
    const points = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', points);
    const node = new THREE.Points(geometry, new THREE.PointsMaterial({
      color: brighter(tint, 1.65), map: halo, size, transparent: true, opacity: 0.77,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    node.frustumCulled = false;
    scene.add(node);
    const seeds = Array.from({ length: count }, () => ({
      x: embers ? (random() - 0.5) * 75 : 7 + random() * 33,
      y: random(), z: embers ? -32.1 + random() * 14.1 : -16 + random() * 39,
      phase: random() * TAU,
    }));
    return { points, seeds, node };
  }
  const flies = motes(92, 0xafff91, 0.26, false), embers = motes(104, 0xff844e, 0.26, true);
  let red = 0;
  let previous = 0;
  return {
    update(t, playing, game) {
      const dt = Math.min(0.05, t - previous);
      previous = t;
      const night = THREE.MathUtils.smoothstep(game.time, 0, setup.moon.nightfall);
      const phase = game.encounter?.phase;
      const target = phase === 'active' ? 1 : phase === 'warning' ? 0.32 : 0;
      red = game.phase === 'ready' || game.time < 1 ? 0 : THREE.MathUtils.lerp(red, target, 1 - Math.exp(-2.4 * dt));
      sky.position.copy(camera.position);
      skyMaterial.uniforms.zenith.value.copy(duskZenith).lerp(nightZenith, night);
      skyMaterial.uniforms.horizon.value.copy(duskHorizon).lerp(nightHorizon, night).lerp(redHorizon, red);
      scene.fog.color.copy(duskFog).lerp(nightFog, night).lerp(redFog, red * 0.75);
      scene.fog.density = (setup.map.fog + night * 0.001) * (game.variation?.fog ?? 1);
      rimLight.color.copy(duskSun).lerp(nightSun, night).lerp(redSun, red);
      rimLight.intensity = 1.55 - night * 0.50 + red * 0.25;
      skyLight.intensity = 1.66 - night * 0.24;
      moon.material.color.copy(duskMoon).lerp(redMoon, red);
      moonHalo.material.color.copy(moon.material.color);
      moonHalo.material.opacity = 0.22 + red * 0.28;
      sigil.material.opacity = (0.70 + Math.sin(t * 1.6) * 0.13) * (1 - game.blast);
      lanternMat.color.setHex(0xff8b46).multiplyScalar(1.88 + 0.12 * Math.sin(t * 8.2) + 0.09 * Math.sin(t * 4.4));
      lavaMap.offset.set(t * 0.024, -t * 0.012);
      faceCamera.quaternion.copy(camera.quaternion);
      for (const [i, { angle, distance, width, height, y }] of mist.entries()) {
        const drift = angle + t * 0.011;
        placeBillboard(cloudBatch, i, Math.cos(drift) * distance, y + Math.sin(t * 0.23 + angle) * 0.53,
          Math.sin(drift) * distance, width, height);
      }
      cloudBatch.material.color.copy(scene.fog.color).lerp(duskMoon, 0.28);
      updateMesh(cloudBatch, mist.length);
      for (const [i, [x, y, z, size]] of lanterns.entries()) placeBillboard(lanternBatch, i, x, y, z, 1.9 * size, 1.9 * size);
      updateMesh(lanternBatch, lanterns.length);
      for (const [i, p] of flies.seeds.entries()) {
        flies.points.setXYZ(i, p.x + Math.sin(t * 0.46 + p.phase) * 0.96,
          0.42 + p.y * 3.26 + Math.sin(t + p.phase) * 0.33, p.z + Math.cos(t * 0.59 + p.phase) * 0.93);
      }
      flies.node.material.opacity = 0.49 + 0.27 * night;
      flies.points.needsUpdate = true;
      for (const [i, p] of embers.seeds.entries()) {
        const height = (p.y + t * 0.16) % 1;
        embers.points.setXYZ(i, p.x + height * 2.8, 0.06 + height * 4.3, p.z + Math.sin(p.phase + height * 3) * 0.39);
      }
      embers.points.needsUpdate = true;
    },
  };
}

function createPortal({ THREE, scene, level, canvasTexture, seededRandom, dynamicMesh, setInstance, updateMesh, brighter }) {
  const portal = new THREE.Group();
  portal.position.copy(level.gate);
  scene.add(portal);
  const centerY = 2.78;
  const sigil = sigilTexture(canvasTexture);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: brighter(0xff684f, 1.7), side: THREE.DoubleSide,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: sigil });
  const iris = new THREE.Mesh(new THREE.PlaneGeometry(5.15, 5.15), ringMaterial);
  iris.position.set(0, centerY, 0.19);
  iris.renderOrder = 5;
  portal.add(iris);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.30, 0.18, 7, 40), new THREE.MeshLambertMaterial({ color: 0x75726b }));
  const inner = new THREE.Mesh(new THREE.TorusGeometry(2.13, 0.027, 6, 50), new THREE.MeshBasicMaterial({ color: brighter(0xff593f, 2.1) }));
  rim.position.y = inner.position.y = centerY;
  portal.add(rim, inner);
  const veilMaterial = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, transparent: true, depthWrite: false,
    uniforms: { time: { value: 0 }, open: { value: 0 }, blast: { value: 0 } },
    vertexShader: 'varying vec2 p; void main(){p=position.xy/2.14; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `
      varying vec2 p;
      uniform float time, open, blast;
      void main() {
        float r = length(p);
        float a = atan(p.y, p.x);
        float ribbon = pow(.5 + .5 * sin(a*5.0 + r*21.0 - time*3.0), 3.0);
        float thread = pow(.5 + .5 * sin(a*11.0 + r*39.0 + time*2.1), 4.0);
        vec3 ink = mix(vec3(.081,.014,.023), vec3(.58,.042,.023), ribbon);
        ink += thread * vec3(.31,.038,.020);
        ink += open * (.25 + ribbon * .25) * vec3(.63,.16,.066);
        gl_FragColor = vec4(ink, (1.0-smoothstep(.94,1.0,r))*(1.0-blast));
      }`,
  });
  const veil = new THREE.Mesh(new THREE.CircleGeometry(2.16, 50), veilMaterial);
  veil.position.y = centerY;
  veil.renderOrder = 4;
  portal.add(veil);

  const chainMaterial = new THREE.MeshLambertMaterial({ color: 0xa47b65 });
  const positionsOnChain = [];
  const linkGeometry = new THREE.TorusGeometry(0.163, 0.050, 5, 9);
  const chain = dynamicMesh(linkGeometry, chainMaterial, 30);
  portal.add(chain);
  const clasp = new THREE.Mesh(new THREE.OctahedronGeometry(0.34), new THREE.MeshBasicMaterial({ color: brighter(0xff714d, 1.62) }));
  clasp.position.set(0, centerY, 0.64);
  portal.add(clasp);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 15; i++) {
      const x = (i - 7) * 0.317;
      const y = 2.72 + side * x * 0.72 - 0.22 * (1 - Math.abs(x) / 2.25);
      positionsOnChain.push({ x, y, z: 0.37 + side * 0.13, side });
    }
  }

  const glyph = canvasTexture(64, 64, ctx => {
    ctx.strokeStyle = 'white'; ctx.lineWidth = 5; ctx.lineJoin = 'bevel';
    ctx.beginPath(); ctx.moveTo(32, 4); ctx.lineTo(52, 31); ctx.lineTo(32, 58);
    ctx.lineTo(12, 31); ctx.closePath();
    ctx.moveTo(25, 40); ctx.lineTo(39, 31); ctx.lineTo(23, 23); ctx.stroke();
  });
  const random = seededRandom(3235);
  const motes = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(64 * 3), 3).setUsage(THREE.DynamicDrawUsage);
  motes.setAttribute('position', positions);
  const runes = new THREE.Points(motes, new THREE.PointsMaterial({
    color: brighter(0xff9975, 1.9), map: glyph, size: 0.17, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0.88,
  }));
  runes.frustumCulled = false;
  runes.renderOrder = 6;
  portal.add(runes);
  const orbits = Array.from({ length: positions.count }, () => [random(), random() * TAU]);
  const waves = Array.from({ length: 3 }, (_, i) => {
    const wave = new THREE.Mesh(new THREE.TorusGeometry(1, 0.019, 5, 72), new THREE.MeshBasicMaterial({
      color: brighter(i === 0 ? 0xffd599 : 0xf97651, 2.6), depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
    }));
    wave.position.y = 0.11 + i * 0.19;
    wave.rotation.x = -Math.PI / 2;
    wave.visible = false;
    portal.add(wave);
    return wave;
  });

  return {
    update(t, ready, blast) {
      veilMaterial.uniforms.time.value = t;
      veilMaterial.uniforms.open.value = ready ? 1 : 0;
      veilMaterial.uniforms.blast.value = blast;
      veil.visible = iris.visible = inner.visible = runes.visible = blast < 1;
      iris.rotation.z = -t * 0.18;
      iris.material.opacity = (ready ? 0.91 : 0.64) * (1 - blast);
      inner.material.color.setHex(ready ? 0xffa867 : 0xff5b49).multiplyScalar(2.2 * (1 - blast));
      clasp.visible = blast < 0.21;
      clasp.rotation.z = Math.sin(t * 0.63) * 0.11;
      const release = blast * 15;
      chain.visible = blast < 0.70;
      if (chain.visible) {
        for (const [i, { x, y, z, side }] of positionsOnChain.entries()) {
          setInstance(chain, i, x * (1 + blast * 1.6), y + release * (0.13 - blast) + side * blast * 1.7,
            z + release * (0.16 + (i % 5) * 0.12), 1.29, 0.69, 1, null, 0, i % 2 ? 0.91 : -0.32, side * (0.62 + blast * (i % 4)));
        }
        updateMesh(chain, positionsOnChain.length);
      }
      for (const [i, [seed, phase]] of orbits.entries()) {
        const drift = (seed + t * 0.20) % 1;
        const angle = phase + t * (0.95 + seed) + drift * 3.1;
        const radius = 0.20 + drift * 2.18 + blast * 9.0;
        positions.setXYZ(i, Math.cos(angle) * radius, centerY + Math.sin(angle) * radius,
          0.22 + drift * 0.64 + blast * 5.0);
      }
      positions.needsUpdate = true;
      runes.material.opacity = 0.88 * (1 - blast);
      for (const [i, wave] of waves.entries()) {
        const age = Math.max(0, (blast - i * 0.105) / (1 - i * 0.105));
        wave.visible = age > 0 && age < 1;
        wave.scale.setScalar(1.95 + 29 * age ** 0.79);
        wave.material.opacity = (1 - age) ** 1.75;
      }
    },
  };
}

function buildBeastModel(type, { THREE, shapes, mergeGeometries }, rage = false) {
  const skin = [], luminous = [];
  const matrix = new THREE.Object3D();
  const rock = new THREE.IcosahedronGeometry(1, 0);
  const horn = new THREE.ConeGeometry(0.5, 1, 6);
  const limb = new THREE.CylinderGeometry(0.36, 0.5, 1, 6);
  function part(target, source, tint, x, y, z, w, h, d, pitch = 0, yaw = 0, roll = 0) {
    const piece = source.index ? source.toNonIndexed() : source.clone();
    matrix.position.set(x, y, z);
    matrix.rotation.set(pitch, yaw, roll, 'YXZ');
    matrix.scale.set(w, h, d);
    matrix.updateMatrix();
    piece.applyMatrix4(matrix.matrix);
    const c = new THREE.Color(tint);
    const colors = new Float32Array(piece.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
    piece.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    target.push(piece);
  }
  const bulk = (...p) => part(skin, rock, ...p);
  const tooth = (...p) => part(skin, horn, ...p);
  const segment = (...p) => part(skin, limb, ...p);
  const slab = (...p) => part(skin, shapes.box, ...p);
  const glow = (...p) => part(luminous, rock, ...p);
  const jade = 0x557e70, rust = 0x93504a, bone = 0xddd1a6, soot = 0x4f5153, brass = 0x9b7454;

  if (type === 0) {
    // 狰幼崽用低伏身形、额角和三根扇形尾毛区别于冲撞兽。
    bulk(rust, 0, 0.51, -0.18, 0.36, 0.31, 0.55);
    bulk(0xaf6853, 0, 0.70, 0.34, 0.30, 0.25, 0.31);
    bulk(soot, 0, 0.61, 0.58, 0.22, 0.14, 0.21);
    tooth(bone, 0, 0.95, 0.40, 0.14, 0.28, 0.12, 0.41);
    for (const side of [-1, 1]) {
      tooth(rust, side * 0.23, 0.88, 0.25, 0.14, 0.23, 0.10, -0.23, 0, -side * 0.26);
      glow(0xffb572, side * 0.145, 0.743, 0.584, 0.063, 0.043, 0.045);
      segment(soot, side * 0.24, 0.29, 0.25, 0.15, 0.49, 0.15, 0.25);
      segment(rust, side * 0.24, 0.27, -0.41, 0.17, 0.45, 0.15, -0.34);
      tooth(rust, side * 0.23, 0.58, -0.74, 0.15, 0.52, 0.11, -1.02, 0, -side * 0.42);
    }
    tooth(soot, 0, 0.63, -0.81, 0.19, 0.58, 0.13, -0.96);
  } else if (type === 1) {
    bulk(soot, 0, 1.0, -0.22, 0.57, 0.54, 0.74);
    bulk(brass, 0, 1.37, 0.32, 0.57, 0.46, 0.59);
    bulk(rust, 0, 1.25, 0.71, 0.39, 0.36, 0.42);
    slab(soot, 0, 1.03, 0.89, 0.50, 0.18, 0.27);
    for (const side of [-1, 1]) {
      tooth(bone, side * 0.33, 1.56, 1.02, 0.21, 0.56, 0.24, 1.24, 0, side * 0.25);
      tooth(brass, side * 0.47, 1.74, 0.18, 0.28, 0.63, 0.22, -0.48, 0, -side * 0.41);
      bulk(jade, side * 0.52, 1.24, 0.1, 0.31, 0.43, 0.56);
      segment(soot, side * 0.48, 0.47, 0.41, 0.28, 0.88, 0.32, -0.18);
      segment(brass, side * 0.40, 0.42, -0.55, 0.27, 0.70, 0.29, 0.35);
      glow(0xff6552, side * 0.243, 1.40, 1.001, 0.091, 0.057, 0.050);
      glow(0x93e4a2, side * 0.72, 1.31, 0.17, 0.04, 0.15, 0.12);
    }
    for (let i = 0; i < 3; i++) tooth(brass, 0, 1.54 - i * 0.10, 0.04 - i * 0.31, 0.48, 0.70, 0.25, -0.42);
  } else if (type === 2) {
    // 烛龙裔立起蛇颈，头冠与火囊提供远距离轮廓和攻击提示。
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5;
      bulk(i % 2 ? jade : 0x496961, Math.cos(a) * 0.30, 0.22, Math.sin(a) * 0.37 - 0.19, 0.28, 0.22, 0.30);
    }
    bulk(soot, 0, 0.66, 0.00, 0.33, 0.53, 0.34, 0.23);
    bulk(jade, 0, 1.03, 0.23, 0.29, 0.50, 0.29, 0.41);
    bulk(0xb0614b, 0, 1.44, 0.44, 0.36, 0.26, 0.35);
    bulk(brass, 0, 1.35, 0.65, 0.25, 0.16, 0.29);
    glow(0xff8644, 0, 1.00, 0.43, 0.195, 0.30, 0.14);
    for (const side of [-1, 1]) {
      tooth(brass, side * 0.23, 1.57, 0.29, 0.17, 0.40, 0.14, -0.58, 0, -side * 0.59);
      tooth(bone, side * 0.17, 1.29, 0.76, 0.09, 0.20, 0.078, Math.PI);
      glow(0xffcf8b, side * 0.17, 1.48, 0.69, 0.079, 0.06, 0.048);
      slab(jade, side * 0.35, 1.15, 0.17, 0.38, 0.32, 0.095, 0.24, 0, side * 0.42);
    }
  } else {
    const plate = rage ? 0xab5948 : 0x5c806f;
    const energy = rage ? 0xff5832 : 0xe6bc75;
    bulk(soot, 0, 1.67, -0.44, 0.88, 0.86, 0.83);
    bulk(plate, 0, 2.25, -0.09, 1.02, 0.71, 0.66);
    bulk(brass, 0, 2.67, 0.40, 0.82, 0.53, 0.55);
    slab(0x38202a, 0, 2.08, 0.76, 1.07, 0.42, 0.36);
    slab(plate, 0, 1.89, 0.88, 1.19, 0.19, 0.42);
    bulk(plate, 0, 2.52, 0.80, 0.61, 0.28, 0.37);
    for (const side of [-1, 1]) {
      bulk(plate, side * 0.73, 2.16, 0.11, 0.42, 0.53, 0.48);
      segment(soot, side * 0.76, 1.13, 0.44, 0.49, 1.82, 0.51, -0.20, 0, side * 0.20);
      bulk(plate, side * 0.77, 0.33, 0.56, 0.30, 0.31, 0.43);
      segment(brass, side * 0.52, 0.98, -0.47, 0.45, 1.68, 0.46, 0.35, 0, -side * 0.10);
      bulk(soot, side * 0.60, 0.20, -0.55, 0.33, 0.24, 0.38);
      tooth(bone, side * 0.57, 3.16, 0.26, 0.35, rage ? 1.23 : 0.93, 0.32, -0.42, 0, -side * 0.64);
      tooth(brass, side * 0.37, 3.15, -0.44, 0.40, 0.79, 0.38, -0.45, 0, -side * 0.19);
      glow(energy, side * 0.354, 2.76, 0.884, 0.16, 0.087, 0.074);
      glow(energy, side * 0.64, 2.38, 0.659, 0.084, 0.20, 0.055, -0.2, 0, side * 0.36);
      for (let i = 0; i < 3; i++) tooth(bone, side * (0.18 + i * 0.15), 2.14, 0.96, 0.13, 0.26, 0.13, Math.PI);
      if (rage) {
        for (let i = 0; i < 3; i++) {
          tooth(plate, side * (0.69 + i * 0.11), 2.59 - i * 0.31, -0.35 - i * 0.11, 0.30, 0.86, 0.31, -0.31, 0, -side * 0.82);
          glow(energy, side * 0.70, 1.92 - i * 0.29, 0.53, 0.085, 0.12, 0.067);
        }
      }
    }
    glow(energy, 0, 2.99, 0.70, 0.13, 0.18, 0.085);
  }
  const meshes = [mergeGeometries(skin), mergeGeometries(luminous)];
  for (const geometry of [...skin, ...luminous, rock, horn, limb]) geometry.dispose();
  return meshes;
}

export default {
  story:{type:'regions',sectors:[
    {name:'荒冢墓园',at:[-8,25],entries:[[-16,24],[0,18]]},
    {name:'古城祭坛',at:[4,-2],entries:[[-9,-8],[13,-7]]},
  ]},
  weaponSkin: 'shanhai-secret-realm',
  pageTitle: '上古秘境 | 第二关',
  config: CONFIG, grid: MAP_GRID, loot, ammo, buildMap, createEnvironment, createEncounter, createPortal, buildBeastModel,
  buildRageModel: helpers => buildBeastModel(3, helpers, true),
  background: 0x43515a, fog: 0x766758,
  palette: { projectile: 0xff8051, ichor: 0x994351, core: 0xffc074, rare: 0xa7e6b4, blast: 0xffc08a },
  portal: { width: 4.38, height: 4.94, useRadius: 4.7 },
  spawnPitch: 0.035,
  terrain: {
    ground(x, z) { return tileAt(x, z) === '~' ? CONFIG.lava.depth : 0; },
    moveScale(x, z, y) { return tileAt(x, z) === '~' && y < -0.14 ? 0.64 : 1; },
    routeOpen(x, z) { return tileAt(x, z) !== '~'; },
    canEnter(body, x, z) { return body.type === undefined || tileAt(x, z) !== '~'; },
  },
  projectileGeometry: THREE => new THREE.IcosahedronGeometry(1.25, 1).scale(0.75, 0.83, 1.60),
  onBossRage(beast, game, { THREE, brighter }) {
    game.effects.spray(new THREE.Vector3(beast.x, beast.y + 1.8, beast.z), brighter(0xff5b42, 1.65), 32, 6.4, 0.13, 'spark');
  },
  area(x, z, level, y) {
    if (z > 30.7 && Math.abs(x) < 7.5) return '南侧残破石牌坊';
    if (z < -18.2) return tileAt(x, z) === '=' ? '裂谷石桥' : '北部熔岩裂谷';
    if (z > 15.5) return '南部荒芜墓园';
    if (x > 15) return '东部幽竹林';
    if (x < -15) return y > 1.1 ? '古城残垣高台' : '西部古城残垣';
    return '中央祭坛广场';
  },
  minimap: {
    tiles: { '#': '#4f5855', '^': '#495752', R: '#817366', B: '#3d725d', T: '#76606a', '+': '#426560', '~': '#873f37', '=': '#be9d71' },
    overlay({ ctx, px, pz }) {
      const { x, z, width, deck, tread, steps } = LANDMARKS.terraces;
      const d = deck + 2 * tread * steps;
      ctx.strokeStyle = '#ac9873';
      ctx.strokeRect(px(x - width / 2), pz(z - d / 2), px(x + width / 2) - px(x - width / 2), pz(z + d / 2) - pz(z - d / 2));
    },
  },
  text: {
    tag: '第二关 / 山海秘境', title: '上古秘境', enter: '穿过石牌坊',
    enemy: '上古凶兽', bossName: '饕餮', keyItem: '雷火符', portal: '封印传送门', loot: '秘境宝物',
    brief: '沿竹林、古城和墓园之间的荒原移动。完成凶兽击杀目标，从饕餮身上取得雷火符，在祭坛北侧引爆封印。血月约每两分钟来临，凶兽增强，击杀掉落更多弹药与圣露。',
    rage: '饕餮甲壳开裂，正在召唤狰幼崽',
    detonating: '符文锁链断裂，封印正在崩解',
    winBrief: '雷火击碎了封印。你穿过传送门，将拾得的宝物带往远古之地。',
    safe: '残破牌坊安全区',
  },
};
