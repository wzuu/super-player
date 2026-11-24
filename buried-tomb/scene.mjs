import {tombModel as buildBeastModel} from '@level-kit/tomb-model.mjs';
// 王陵主题参数。共享步枪、分区遭遇与胜负流程来自 level-kit。
const CONFIG = {
  map: { cell: 3.6, fog: 0.014, navCell: 1.25 },
  graphics: { maxPixelRatio: 1.15, bloomScale: 0.68, dustCount: 2800 },
  player: { crouch: { height: 1.10, eye: 1.01, speed: 0.51 } },
  audio: { ambient: { filter: 'lowpass', frequency: 750, activeGain: 0.13, pauseGain: 0.08 } },
  beasts: {
    appearance: { scale: [[1.28,1.32], [1.42,1.27], [1.20,1.27], [1.34,1.34]] },
    types: [
      { hp: 59, height: 0.99, radius: 0.43 },
      { hp: 162, height: 1.83, radius: 0.66 },
      { hp: 105, height: 2.01, hazardLife: 5.4 },
      { hp: 790, height: 3.97, radius: 1.03, summonCount: 6 },
    ],
  },
  storm: {
    interval: 90, duration: 15, warning: 5, extraPopulation: 18,
    shotHearing: 42, walkHearing: 9.5, runHearing: 20, memory: 2.7, fog: 0.103,
  },
};

// 北在首行。# 断墙，T 金字塔，S 出生石门，N 北陵墓，O 绿洲，J 柱，I 方尖碑，B 矮墙，F 棕榈，R 碎石。
const MAP_GRID = [
  '#########################',
  '#.......................#',
  '#.................R.....#',
  '#...R...R.......R.......#',
  '#...........N...........#',
  '#....B.............B....#',
  '#.....................R.#',
  '#..B....................#',
  '#.R..................B..#',
  '#.....I..............F..#',
  '#....J.J...............R#',
  '#......J.............F..#',
  '#...........T.......F...#',
  '#....J.............O....#',
  '#....J.J.........F..F...#',
  '#.....I............F....#',
  '#.R...............F..B..#',
  '#....................F..#',
  '#..B................B...#',
  '#.......................#',
  '#....R..................#',
  '#....................R..#',
  '#.......................#',
  '#......R....S....R......#',
  '#########################',
];

const TOMB = { halfWidth: 17.0, back: -33.1, front: -24.0, landing: -21.65, approach: -17.8, depth: 3.10, rampX: 12.4, rampWidth: 4.1 };
const TOWER = { height: 5.10, start: 15.15, tread: 0.87, step: 0.34, steps: 15, width: 3.3 };
const LANDMARKS = {
  loot: [
    [5.2, 31.8, '黄金项圈', 150], [-19.5, 26.5, '青石印章', 110],
    [26, 10, '绿松石护符', 135], [30, 4.1, '石榴纹金杯', 180],
    [-23.2, 4.4, '圣甲虫雕像', 220], [-31.8, -3.2, '刻铭匕首', 175],
    [10.2, -28.0, '莎草纸卷轴', 260], [-10.0, -28.0, '白石祭碗', 240],
    [0, -30.5, '王名金牌', 300], [1.44, -1.50, '金面具', 420, 'top'],
  ],
  ammo: [[2.8, 33.5], [-13.3, 24.5], [17.8, 8.8], [32.2, 11.2], [-25.0, 0], [-34, -8.5],
    [15.4, -18.0], [-12.4, -25.8], [12.4, -27.7], [3.5, 17.8]],
};

function passage(x) {
  return Math.abs(Math.abs(x) - TOMB.rampX) < TOMB.rampWidth * 0.5;
}

function terrainHeight(x, z) {
  if (Math.abs(x) < TOMB.halfWidth && z > TOMB.back && z < TOMB.front) return -TOMB.depth;
  if (z >= TOMB.front && z < TOMB.approach && passage(x)) {
    // 坡脚在门楣前留一段水平地面，大体型的前后脚都落平后再通过拱门。
    return -TOMB.depth * Math.min(1, (TOMB.approach - z) / (TOMB.approach - TOMB.landing));
  }
  return 0;
}

function buildMap({ THREE, scene, GRID, StaticBatches, shapes, canvasTexture, seededRandom, brighter, level }) {
  const rnd = seededRandom(75206);
  const tau = Math.PI * 2;
  const warm = brighter(0xffb762, 2.5), paleGold = brighter(0xffd696, 1.8);
  const sandMap = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#d5a36c'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 5400; i++) {
      ctx.fillStyle = rnd() < 0.53 ? '#975d3541' : '#f5d29d59';
      ctx.fillRect(rnd() * w, rnd() * h, 0.4 + rnd() * 2.5, 0.4 + rnd() * 1.8);
    }
    for (let row = -1; row < 30; row++) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const y = row * h / 29 + Math.sin(x / w * tau + row * 0.48) * 3.60 +
          Math.sin(x / w * tau * 3 + row * .31) * 1.52;
        if (!x) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineWidth = rnd() * 1.10 + .35; ctx.strokeStyle = '#995d3a6a'; ctx.stroke();
    }
  }, true);
  const blockMap = canvasTexture(192, 128, (ctx, w, h) => {
    ctx.fillStyle = '#d2a37b'; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) {
      const offset = y % 64 ? -24 : 0;
      for (let x = offset; x < w; x += 49) {
        const shade = 166 + Math.round(rnd() * 36);
        ctx.fillStyle = 'rgb(' + (shade + 25) + ',' + (shade - 19) + ',' + (shade - 49) + ')';
        ctx.fillRect(x + 1, y + 1, 47, 29);
        ctx.fillStyle = '#e9bc905c'; ctx.fillRect(x + 2, y + 1, 46, 1);
        ctx.fillStyle = '#6237177d'; ctx.fillRect(x + 1, y + 30, 48, 2);
      }
    }
    for (let i = 0; i < 2700; i++) {
      ctx.fillStyle = rnd() > 0.5 ? '#8b5a3c4e' : '#fbdcb358';
      ctx.fillRect(rnd() * w, rnd() * h, 1.8 * rnd() + 0.3, 2.4 * rnd() + 0.2);
    }
  });
  const goldMap = canvasTexture(256, 96, (ctx, w, h) => {
    ctx.fillStyle = '#806442'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#b78047'; ctx.fillRect(0, 4, w, 5); ctx.fillRect(0, h - 9, w, 5);
    ctx.strokeStyle = '#dfaa56'; ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const x = 16 + i * 32;
      ctx.beginPath(); ctx.moveTo(x - 10, 47); ctx.lineTo(x, 27); ctx.lineTo(x + 10, 47); ctx.lineTo(x, 65); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, 47, 4.5, 0, tau); ctx.stroke();
      ctx.fillStyle = '#a07039'; ctx.fillRect(x - 11, 71, 22, 3);
    }
  });
  const materials = {
    sand: new THREE.MeshLambertMaterial({ map: sandMap, color: 0xc8a57d }),
    brick: new THREE.MeshLambertMaterial({ map: blockMap, color: 0xffffff }),
    stone: new THREE.MeshLambertMaterial({ color: 0xd0a278 }),
    tomb: new THREE.MeshLambertMaterial({ color: 0x765449, map: blockMap }),
    accent: new THREE.MeshLambertMaterial({ color: 0xdabe8a, map: goldMap }),
    palm: new THREE.MeshLambertMaterial({ color: 0xaec7a1, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    shadowDune: new THREE.MeshLambertMaterial({ color: 0xffbd80 }),
  };
  const leaf = new THREE.BufferGeometry();
  leaf.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, 0.24, .11, .32, 0, .29, .55, 0, 0, 0, 0, .29, .55, -.24, .11, .32,
    .24, .11, .32, .16, -.08, .82, 0, .29, .55, -.24, .11, .32, 0, .29, .55, -.16, -.08, .82,
    .16, -.08, .82, 0, -.34, 1.18, 0, .29, .55, -.16, -.08, .82, 0, .29, .55, 0, -.34, 1.18,
  ], 3));
  leaf.computeVertexNormals();
  const dune = new THREE.SphereGeometry(0.5, 12, 5, 0, tau, 0, Math.PI / 2);
  const geometries = {
    ...shapes, leaf, dune,
    obelisk: new THREE.CylinderGeometry(0.29, 0.50, 1, 4).rotateY(Math.PI / 4),
    cap: new THREE.ConeGeometry(.5, 1, 4).rotateY(Math.PI / 4),
  };
  const city = new StaticBatches(materials, geometries);
  const draw = (...args) => city.add(...args);
  const box = (mat, ...args) => city.add('box', mat, ...args);
  const solid = (mat, x, z, width, depth, bottom, top, tint, climb = false) => {
    box(mat, x, (bottom + top) / 2, z, width, top - bottom, depth, tint);
    return level.box(x, z, width, depth, bottom, top, climb);
  };

  // 方尖碑柱廊旁的陪葬室由三面石墙围合，南墙门洞朝向玩家来路。
  for (const x of [-30.8, -20.2]) {
    solid('brick', x, -8, .38, 8.8, 0, 3.4, 0xd8ac78);
    solid('stone', x + (x < -25 ? 1.4 : -1.4), -3.8, 2.8, .4, 0, 3.4, 0xe0ba83);
  }
  solid('brick', -25.5, -12.2, 10.6, .38, 0, 3.4, 0xcb9d69);
  solid('stone', -25.5, -8, 11.1, 9.2, 3.4, 3.65, 0xe7c394);
  for (const z of [13, 22, 30]) column(-20, z, 2.45);
  for (const z of [22, 30]) column(7.5, z, 2.45);

  function pyramid(x, z) {
    level.gate.set(x, TOWER.height, z);
    level.bossAnchor.set(x, 0, z + 9.5);
    level.bossSpawn.set(x + 5.3, 0, z + 12.6);
    for (let tier = 0; tier < 6; tier++) {
      const width = [21.8, 18.4, 15.2, 11.8, 8.8, 5.70][tier];
      const top = (tier + 1) * .85;
      solid('brick', x, z, width, width, tier * .85, top, tier % 2 ? 0xe7b577 : 0xf0c792, true);
      for (const dir of [-1, 1]) {
        box('stone', x, top - .075, z + dir * width / 2, width + .06, .14, .13, 0xfcce9c);
        box('stone', x + dir * width / 2, top - .075, z, .13, .14, width + .06, 0xefb883);
      }
    }
    // 四面台阶分别带有物理踏面。每级小于默认玩家上台阶能力。
    for (let j = 0; j < TOWER.steps; j++) {
      const radius = TOWER.start - j * TOWER.tread;
      const top = (j + 1) * TOWER.step;
      for (const dir of [-1, 1]) {
        solid('stone', x, z + dir * radius, TOWER.width, TOWER.tread + .018, 0, top, 0xdcb185, true);
        solid('stone', x + dir * radius, z, TOWER.tread + .018, TOWER.width, 0, top, 0xe4bc89, true);
        box('stone', x, top + .005, z + dir * (radius + .37), TOWER.width + .05, .035, .16, 0xc39468);
        box('stone', x + dir * (radius + .37), top + .005, z, .16, .035, TOWER.width + .05, 0xc79665);
      }
    }
    for (const ix of [-2.08, 2.08]) for (const iz of [-2.08, 2.08]) {
      solid('accent', x + ix, z + iz, .44, .44, TOWER.height, TOWER.height + 1.18, 0xe9b758);
      draw('cap', 'glow', x + ix, TOWER.height + 1.29, z + iz, .32, .24, .32, paleGold);
    }
    draw('cylinder', 'accent', x, TOWER.height + .025, z, 2.56, .05, 2.56, 0xe6b164);
    for (let j = 0; j < 12; j++) {
      const a = j / 12 * tau;
      box('glow', x + Math.sin(a) * 1.32, TOWER.height + .041, z + Math.cos(a) * 1.32, .16, .035, .08, paleGold, a);
    }
  }

  function column(x, z, height) {
    solid('stone', x, z, 1.37, 1.37, 0, .18, 0xebbb85, true);
    level.box(x, z, .90, .90, .18, height);
    draw('cylinder', 'stone', x, height / 2, z, .91, height, .91, 0xe2b482);
    draw('cylinder', 'accent', x, height - .34, z, 1.04, .27, 1.04, 0xb99562);
    box('stone', x, height + .03, z, 1.22, .19, 1.22, 0xf1c396);
  }

  function palm(x, z) {
    const height = 3.3 + rnd() * 2.35, tilt = (rnd() - .5) * .34;
    draw('cylinder', 'stone', x + height * tilt * .35, height / 2, z, .24, height, .24, 0x977354, 0, .09, -tilt);
    level.box(x, z, .49, .49, 0, height - .38);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * tau + rnd() * .24, size = 1.45 + rnd() * .83;
      draw('leaf', 'palm', x + height * tilt * .78, height + rnd() * .17, z + .1, size, size, size, i % 2 ? 0x77945b : 0x4b724f, a, rnd() * .33);
    }
  }

  function oasis(x, z) {
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 6.8), new THREE.ShaderMaterial({
      uniforms: { tick: { value: 0 } }, transparent: true, depthWrite: false,
      vertexShader: 'varying vec2 st; void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `
        uniform float tick;
        varying vec2 st;
        void main(){
          vec2 p = (st - 0.5) * 2.0;
          float shape = length(vec2(p.x, p.y * 0.94)) + sin(p.x * 14.0 + p.y * 5.0) * .042;
          float mask = 1.0 - smoothstep(.79, 1.0, shape);
          float ripple = sin(st.y * 141.0 + sin(st.x * 17.0 + tick * .8) * .9 - tick * 2.9);
          float shine = pow(max(0.0, ripple), 8.0) * exp(-pow((p.x - .19) * 3.4, 2.0));
          vec3 tint = mix(vec3(.03,.17,.145), vec3(.08,.39,.29), clamp(1.0-shape,0.0,1.0) * 1.6);
          vec3 c = tint + vec3(.42,.26,.095) * shine * .69 + ripple * .012;
          gl_FragColor = vec4(c, mask * .91);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(x, .031, z);
    scene.add(pool);
    for (let j = 0; j < 34; j++) {
      const a = j * 2.399963, radial = .98 + rnd() * .25;
      draw('stone', 'stone', x + Math.cos(a) * 4.6 * radial, .075, z + Math.sin(a) * 3.25 * radial,
        .35 + rnd() * .56, .16 + rnd() * .12, .26 + rnd() * .51, iColor(j), a);
    }
    return pool;
  }

  function iColor(i) { return [0xc39268, 0xdeb789, 0xb78c65][i % 3]; }

  function entry(x, z) {
    const pillarY = 2.65;
    for (const side of [-1, 1]) {
      solid('brick', x + side * 2.30, z, 1.46, 2.8, 0, pillarY, 0xdca675);
      box('accent', x + side * 2.30, 1.64, z - 1.45, 1.1, 1.82, .065, 0xe6bd81);
      draw('dune', 'shadowDune', x + side * 2.95, -.21, z + .22, 5.6, 2.0, 4.7, 0xd5ad79, .22 * side);
    }
    solid('brick', x, z, 6.52, 2.5, pillarY, 3.55, 0xdcb485);
    box('accent', x, 3.0, z - 1.29, 5.50, .46, .07, 0xf1c68e);
    level.spawn.set(x, 0, z - 4.75);
  }

  let pool = null;
  for (let row = 0; row < GRID.rows; row++) {
    for (let col = 0; col < GRID.columns; col++) {
      const x = GRID.x(col), z = GRID.z(row), mark = GRID.cells[row][col];
      if (mark === '#') {
        const h = 2.1 + rnd() * 1.40;
        solid('brick', x, z, GRID.cell + .02, GRID.cell + .02, 0, h, iColor(row + col));
        if ((row + col) % 3) draw('stone', 'stone', x + rnd() - .5, h, z, 1.1 + rnd(), .38 + rnd() * .70, .8 + rnd(), 0xd6b08a, rnd() * tau);
      } else if (mark === 'T') pyramid(x, z);
      else if (mark === 'S') entry(x, z);
      else if (mark === 'O') pool = oasis(x, z);
      else if (mark === 'J') column(x, z, 2.62 + rnd() * 1.95);
      else if (mark === 'I') {
        solid('stone', x, z, 2.13, 2.13, 0, .32, 0xd3a273, true);
        level.box(x, z, .98, .98, .32, 7.1);
        draw('obelisk', 'stone', x, 3.37, z, 1.68, 6.1, 1.68, 0xb6835c);
        draw('cap', 'accent', x, 6.78, z, .72, .9, .72, 0xe4b970);
        box('accent', x, 3.37, z + .43, .28, 3.87, .025, 0xedcf88);
      } else if (mark === 'B') {
        solid('brick', x, z, 2.52, 1.05, 0, .91, iColor(row + col));
        box('stone', x, .92, z, 2.5, .12, 1.02, 0xf4bd83);
      } else if (mark === 'F') palm(x, z);
      else if (mark === 'R') {
        draw('stone', 'stone', x, .36, z, 1.43 + rnd() * .7, .65 + rnd() * .35, 1.46, iColor(row + col), rnd() * tau);
        level.box(x, z, 1.30, 1.13, 0, .68);
      }
    }
  }

  const torches = [];
  function torch(x, y, z, strength) {
    box('accent', x, y - .31, z, .14, .70, .14, 0x8c603a);
    draw('cylinder', 'stone', x, y - .10, z, .29, .21, .29, 0xbb7841);
    torches.push({ x, y, z, strength, light: null });
  }

  function tomb() {
    const t = TOMB, width = t.halfWidth * 2, deep = t.front - t.back, cz = (t.front + t.back) / 2;
    solid('tomb', 0, cz, width, deep, -.36, 0, 0xc79d81, true);
    solid('tomb', 0, t.back, width + .64, .37, -t.depth, .30, 0x9c725a, true);
    for (const side of [-1, 1]) {
      solid('tomb', side * t.halfWidth, cz, .36, deep + .32, -t.depth, .30, 0x9a7258, true);
      const entrance = side * t.rampX;
      for (const edge of [-1, 1]) {
        const x = entrance + edge * t.rampWidth / 2;
        for (let j = 0; j < 9; j++) {
          const segment = (t.approach - t.front) / 9, z = t.front + (j + .5) * segment;
          solid('tomb', x, z, .23, segment + .025, terrainHeight(x - edge * .04, z - segment / 2),
            .20, 0xaf8166);
        }
      }
      const inner = t.rampX - t.rampWidth / 2;
      const outer = t.rampX + t.rampWidth / 2;
      solid('tomb', side * (outer + t.halfWidth) / 2, t.front, t.halfWidth - outer, .44, -t.depth, .28, 0x9d6e57);
      for (const edge of [-1, 1]) {
        box('accent', entrance + edge * (t.rampWidth * .50 - .09), -1.38, t.front + .06, .30, 2.8, .36, 0xaf7951);
      }
      solid('brick', entrance, t.front, t.rampWidth + .46, .57, -.38, .42, 0xd7a578, true);
      box('accent', entrance, .17, t.front + .31, t.rampWidth - .26, .32, .055, 0xe4b776);
      torch(entrance - side * 1.52, -1.25, t.front - .46, 30);
      torch(side * 5.9, -1.32, t.back + .49, 22);
      for (const a of [5.0, 8.9, 14.8]) box('accent', side * a, -1.30, t.back + .202, 1.60, 1.86, .045, 0xb6814d);
      // 顶部是堆沙的陵墓地表，中央下方仍是连通回廊。
      solid('brick', side * 6.18, t.back + .83, 2.95, 1.46, 0, 1.25, 0xcd9b73);
      for (let j = 0; j < 3; j++) {
        draw('stone', 'stone', side * (14 + rnd() * 2), .19, t.back + rnd() * 2.4, .73, .34, .66, 0xca9e78, rnd() * tau);
      }
    }
    solid('tomb', 0, t.front, (t.rampX - t.rampWidth / 2) * 2, .50, -t.depth, .28, 0x9a6e58);
    for (const x of [-7.2, 0, 7.2]) {
      solid('tomb', x, t.back + 1.29, .78, .80, -t.depth, -.36, 0xb48f76);
      box('accent', x, -1.42, t.back + 1.74, .32, 1.43, .09, 0xd4a075);
    }
    for (const x of [-8.3, 8.3]) torch(x, 1.08, t.back + 1.84, 19);
  }
  tomb();

  // 地面在回廊和坡道边缘拆分网格，使渲染高度与实际地面函数对齐。
  const xCuts = new Set([-GRID.halfX, GRID.halfX, -TOMB.halfWidth, TOMB.halfWidth]);
  for (let i = -40; i <= 40; i += 4) xCuts.add(i);
  for (const side of [-1, 1]) for (const edge of [-1, 1]) xCuts.add(side * TOMB.rampX + edge * TOMB.rampWidth / 2);
  const zCuts = new Set([-GRID.halfZ, GRID.halfZ, TOMB.back, TOMB.front, TOMB.landing, TOMB.approach]);
  for (let i = -40; i <= 40; i += 4) zCuts.add(i);
  const xs = [...xCuts].sort((a, b) => a - b), zs = [...zCuts].sort((a, b) => a - b);
  const buffers = [{ position: [], uv: [] }, { position: [], uv: [] }];
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i], x1 = xs[i + 1], z0 = zs[j], z1 = zs[j + 1];
    const mid = terrainHeight((x0 + x1) / 2, (z0 + z1) / 2);
    const target = buffers[mid < -.001 ? 1 : 0];
    for (const [x, z] of [[x0,z0], [x0,z1], [x1,z0], [x1,z0], [x0,z1], [x1,z1]]) {
      const yy = terrainHeight(x === x0 ? x + .0001 : x - .0001, z === z0 ? z + .0001 : z - .0001);
      target.position.push(x, yy, z); target.uv.push(x / 5.6, z / 5.6);
    }
  }
  for (let i = 0; i < buffers.length; i++) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers[i].position, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffers[i].uv, 2));
    geometry.computeVertexNormals();
    const material = i === 0 ? materials.sand : new THREE.MeshLambertMaterial({ map: sandMap, color: 0x59443b });
    scene.add(new THREE.Mesh(geometry, material));
  }

  // 周边沙丘和风蚀遗迹为远景，同类外形批量渲染。
  for (let i = 0; i < 51; i++) {
    const a = i * tau / 51 + rnd() * .08, r = 49 + rnd() * 40;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    draw('dune', 'shadowDune', x, -1.2, z, 9 + rnd() * 27, 4 + rnd() * 12, 8 + rnd() * 13,
      [0xdca671, 0xcf945d, 0xb87e54][i % 3], a + rnd() * .8);
    if (i % 8 === 0) draw('obelisk', 'stone', x + 1.2, 3.8, z - 3, 1.5, 7.6, 1.5, 0x9e7155, a);
  }
  for (let k = 0; k < 250; k++) {
    const x = rnd() * 78 - 39, z = rnd() * 78 - 39;
    if (Math.abs(x) < 8 && z > 18 && rnd() < .77) continue;
    if (terrainHeight(x, z) < -.01 || level.blocked(x, z, 0, .18, .36)) continue;
    draw('stone', 'stone', x, .02, z, .13 + rnd() * .65, .10 + rnd() * .21, .17 + rnd() * .55, iColor(k), rnd() * tau);
  }
  for (const dir of [-1, 1]) for (let z = 17; z < 34; z += 2.8) {
    box('stone', dir * 2.23, .027, z, .56 + rnd() * .14, .052, .32 + rnd() * .37, 0xe6ba86, rnd() * .14);
  }
  for (const p of torches) {
    draw('cylinder', 'glow', p.x, p.y, p.z, .09, .24, .09, warm);
  }
  city.flush();

  const skyLight = new THREE.HemisphereLight(0xffdfac, 0x89624f, 1.28);
  const sun = new THREE.DirectionalLight(0xffc179, 2.28);
  sun.position.set(46, 20, -57);
  const portalLight = new THREE.PointLight(0xffae4e, 65, 15);
  portalLight.position.copy(level.gate).add(new THREE.Vector3(0, 2.4, 0));
  scene.add(skyLight, sun, portalLight);
  for (const p of torches) {
    p.light = new THREE.PointLight(0xff9a52, p.strength, 8);
    p.light.position.set(p.x, p.y + .20, p.z); scene.add(p.light);
  }
  return { pool, torches, sun, portalLight, shapes };
}

function createEncounter({ CONFIG: options, sound }) {
  const rules = options.storm;
  return {
    shotHearing: rules.shotHearing, walkHearing: rules.walkHearing, runHearing: rules.runHearing, memory: rules.memory,
    hearingOnly: false, status: null,
    reset() {
      this.hearingOnly = false; this.status = null;
      this.stormGroup = null;
    },
    update(game) {
      const elapsed = game.time % rules.interval;
      const active = game.time >= rules.interval && elapsed < rules.duration;
      if (active && !this.hearingOnly) {
        if (!game.story?.managed && !game.field?.hunting && !game.blast) {
          this.stormGroup = Array.from({length:rules.extraPopulation}, () => game.beasts.randomType());
        }
        sound.hiss(2.7, 840, 120, .40);
        sound.tone(74, 31, .85, .21);
      }
      this.hearingOnly = active;
      if (active && this.stormGroup && game.beasts.spawnGroup(this.stormGroup).length) this.stormGroup = null;
      if (active) {
        const quiet = game.player.crouched && game.time - Math.max(game.shotAt, game.footstep.at) > .40;
        this.status = {
          title: '沙暴中', remaining: rules.duration - elapsed,
          detail: quiet ? '已压低声响，凶兽仍会搜索最后听见的位置' : '凶兽循声搜索。按住 ' + options.crouchLabel + ' 蹲伏，松开左键停火',
        };
      } else if (rules.interval - elapsed <= rules.warning) {
        this.status = { title: '沙暴将至', remaining: rules.interval - elapsed, detail: '能见度将下降，准备找掩体或蹲伏停火' };
      } else this.status = null;
    },
  };
}

function createEnvironment({ THREE, scene, camera, CONFIG: options, mapData, seededRandom, dynamicMesh, setInstance, updateMesh, brighter }) {
  const rng = seededRandom(42016);
  const baseFog = new THREE.Color(0xc39767), stormFog = new THREE.Color(0xb38354);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(115, 32, 19), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { storm: { value: 0 }, sunDirection: { value: new THREE.Vector3(.44,.14,-.85).normalize() } },
    vertexShader: `
      varying vec3 worldDirection;
      void main() {
        vec4 point = modelMatrix * vec4(position, 1.0);
        worldDirection = point.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * point;
      }
    `,
    fragmentShader: `
      uniform vec3 sunDirection;
      uniform float storm;
      varying vec3 worldDirection;
      void main() {
        vec3 d = normalize(worldDirection);
        float elevation = clamp(d.y, 0.0, 1.0);
        float around = max(0.0, dot(d, sunDirection));
        vec3 horizon = mix(vec3(.81,.441,.202), vec3(.99,.477,.145), pow(around,8.0));
        vec3 clear = mix(horizon,vec3(.225,.183,.169), pow(elevation,.59));
        float haze = pow(around,35.0) * .24 + pow(around,165.0) * .27;
        float disk = smoothstep(.99948,.99978,around) * 2.33;
        vec3 warm = clear + (haze + disk) * vec3(1.00,.46,.145);
        float stripe = sin(d.x*17.0+sin(d.z*11.0+d.y*19.0)*1.3+d.y*31.0)*sin(d.x*5.0-d.y*12.0+d.z*4.4);
        warm -= vec3(.045,.029,.016) * pow(max(0.0,stripe),5.0) * (1.0-elevation) * (1.0-around*.7);
        vec3 thick = vec3(.63,.39,.21) + vec3(.16,.09,.038) * pow(around,3.0);
        gl_FragColor = vec4(mix(warm,thick,storm*.91),1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }));
  sky.renderOrder = -20; sky.frustumCulled = false; scene.add(sky);

  const seeds = new Float32Array(options.graphics.dustCount * 3);
  for (let i = 0; i < seeds.length; i++) seeds[i] = rng();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
  const dust = new THREE.Points(geometry, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { tick: { value: 0 }, storm: { value: 0 }, outdoors: { value: 1 } },
    vertexShader: `
      uniform float tick,storm,outdoors;
      varying float alpha;
      void main(){
        vec3 n = position;
        float span = 48.0, air = 1.75 + n.x * 3.4 + storm * (6.0 + n.y*5.0);
        vec3 origin = cameraPosition;
        vec3 p;
        p.x = mod(n.x*span + tick*air - origin.x,span) + origin.x - span*.5;
        p.z = mod(n.z*span - tick*(.81+storm*3.9) - origin.z,span) + origin.z - span*.5;
        p.y = n.y*n.y*9.3 + .19 + sin(tick*1.43+n.z*36.0)*(.12+storm*.26);
        vec4 view = viewMatrix * vec4(p,1.0);
        float fade = smoothstep(.8,2.0,-view.z) * (1.0-smoothstep(18.0,26.0,-view.z));
        float normalDust = .30 + step(.65,n.z) * .40;
        alpha = fade * mix(normalDust,1.0,storm) * outdoors * (.34+storm*.40);
        gl_PointSize = clamp((3.0+6.3*storm) / max(1.7,-view.z) * (1.30+n.x),1.0,5.8);
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: `
      varying float alpha;
      void main(){
        float dotFade = 1.0 - smoothstep(.11,.49,length(gl_PointCoord-.5));
        gl_FragColor = vec4(vec3(.92,.65,.38), alpha * dotFade);
      }
    `,
  }));
  dust.frustumCulled = false; scene.add(dust);

  const flame = dynamicMesh(new THREE.ConeGeometry(.24, .62, 6), new THREE.MeshBasicMaterial({
    transparent: true, blending: THREE.AdditiveBlending, opacity: .75, depthWrite: false,
  }), mapData.torches.length * 2);
  const flameOuter = brighter(0xff9435, 2.35), flameCore = brighter(0xffe49d, 2.43);
  let intensity = 0, last = 0;
  return {
    update(t, playing, game) {
      const dt = Math.min(.045, t - last); last = t;
      intensity += ((game.encounter?.hearingOnly ? 1 : 0) - intensity) * (1 - Math.exp(-dt * 3.4));
      const outside = THREE.MathUtils.smoothstep(camera.position.y, -.18, .87);
      const weather = intensity * (.24 + outside * .76);
      scene.fog.color.copy(baseFog).lerp(stormFog, weather);
      scene.fog.density = THREE.MathUtils.lerp(options.map.fog, options.storm.fog, weather) * (game.variation?.fog ?? 1);
      sky.material.uniforms.storm.value = intensity;
      dust.material.uniforms.tick.value = t;
      dust.material.uniforms.storm.value = intensity;
      dust.material.uniforms.outdoors.value = outside;
      if (mapData.pool) mapData.pool.material.uniforms.tick.value = t;
      mapData.sun.intensity = THREE.MathUtils.lerp(2.28, .75, weather);
      mapData.portalLight.intensity = 65 + Math.sin(t * 2.10) * 11 + game.blast * (1 - game.blast) * 350;
      let count = 0;
      for (const [i, p] of mapData.torches.entries()) {
        const f = Math.sin(t * 16.0 + i * 5.20) * .21 + Math.sin(t * 24.5 - i * 2.07) * .11;
        p.light.intensity = p.strength * (1 + f);
        setInstance(flame, count++, p.x, p.y + .22 + f * .16, p.z, .91 + f * .20, .78 + f, .91, flameOuter, t * .8, f *.26, -.15 + f);
        setInstance(flame, count++, p.x, p.y + .15 + f * .09, p.z + .011, .50, .53 + f *.38, .56, flameCore, i * 2, 0, f * .48);
      }
      updateMesh(flame, count);
    },
  };
}

function createPortal({ THREE, scene, level, brighter }) {
  const gate = new THREE.Group();
  gate.position.copy(level.gate);
  scene.add(gate);
  const pillars = [];
  for (const [i, height] of [12.6, 8.5, 4.5].entries()) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.22 - i * .025, .80 - i * .21, height, 28, 1, true),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { tick: { value: 0 }, openGate: { value: 0 }, strength: { value: .62 - i * .12 }, burst: { value: 0 }, phase: { value: i * 10.9 } },
        vertexShader: 'varying vec2 st; void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader: `
          uniform float tick,openGate,strength,burst,phase;
          varying vec2 st;
          void main(){
            float ray = pow(max(0.0,sin(st.x*93.0+sin(st.y*8.0-tick*1.2)+phase)),6.0);
            float band = pow(max(0.0,sin(st.y*55.0-tick*5.0+st.x*18.8)),9.0)*(.15-.08*openGate);
            float residue = (1.0 - smoothstep(.0,1.0,st.y)) * smoothstep(.0,.034,st.y);
            vec3 hue = mix(vec3(1.68,.81,.13),vec3(2.13,1.26,.34),openGate);
            float shape = (.37 + ray*.45 + band)*residue*strength*(1.0-burst);
            gl_FragColor = vec4(hue * (1.0+burst*3.0),shape*(1.0+burst*1.4));
          }
        `,
      }));
    beam.position.y = height / 2; gate.add(beam); pillars.push(beam);
  }
  const rings = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(.92 + i * .15, .026, 6, 44, Math.PI * (1.57 + i * .12)),
      new THREE.MeshBasicMaterial({ color: brighter(i % 2 ? 0xffcf68 : 0xc4863b, 2.6) }));
    m.position.y = .30 + .42 * i; m.rotation.x = -Math.PI / 2;
    gate.add(m); rings.push(m);
  }

  const waves = [];
  for (const [i, height] of [level.gate.y + .19, .055, .16].entries()) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { age: { value: 0 }, opacity: { value: 0 } },
      vertexShader: 'varying vec2 st; void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `
        uniform float age,opacity;
        varying vec2 st;
        void main() {
          vec2 p = st*2.0-1.0;
          float a = atan(p.y,p.x);
          float radius = length(p);
          float offset = sin(a*19.0+age*8.0)*.025 + sin(a*39.0)*.015;
          float front = exp(-abs(radius-.84+offset)*25.0);
          float dustBand = exp(-pow((radius-.71-offset*2.2)*9.0,2.0)) * (.32+.54*pow(max(0.0,sin(a*17.0+age*15.0)),3.0));
          gl_FragColor = vec4(vec3(.97,.59,.22)*(1.1+front*.7),(front*.65+dustBand)*opacity);
        }
      `,
    }));
    mesh.position.set(level.gate.x, height, level.gate.z);
    mesh.rotation.x = -Math.PI / 2; scene.add(mesh); waves.push(mesh);
  }
  return {
    update(t, ready, blast) {
      for (const [i, beam] of pillars.entries()) {
        const u = beam.material.uniforms;
        u.tick.value = t; u.openGate.value = Number(ready); u.burst.value = blast;
        beam.rotation.y = t * (.24 + i * .24) * (i % 2 ? -1 : 1);
        beam.visible = blast < .99;
      }
      for (const [i, ring] of rings.entries()) {
        ring.rotation.set(-Math.PI / 2 + Math.sin(t * .78 + i) * .19, .11 * i, t * (.70 + i * .21) * (i % 2 ? -1 : 1));
        ring.position.y = .27 + .43 * i + Math.sin(t * 1.30 + i) * .11;
        ring.visible = blast < .85;
        ring.scale.setScalar(1 + blast * (2.4 + i));
      }
      for (const [i, wave] of waves.entries()) {
        const elapsed = Math.max(0, blast - i * .09);
        wave.visible = elapsed > 0 && blast < 1;
        wave.material.uniforms.age.value = elapsed;
        wave.material.uniforms.opacity.value = (1 - blast) * (i === 0 ? .84 : .70);
        const radius = 1.9 + elapsed * (i === 0 ? 27 : 48);
        wave.scale.set(radius, radius, 1);
      }
    },
  };
}

export default {
  story:{type:'regions',sectors:[
    {name:'陵前祭道',at:[-10,24],entries:[[-11,21]],parts:[
      {name:'陵前祭道',count:100,bounds:[-33,10,9,34],anchor:[-11,21]}
    ]},
    {name:'西侧方尖碑柱廊',at:[-23,3],entries:[[-24,0]],parts:[
      {name:'西侧方尖碑柱廊',count:94,bounds:[-38,-20,-4,9],anchor:[-24,0]},
      {name:'西廊陪葬室',count:6,bounds:[-30,-11.6,-21,-4.5],anchor:[-26,-7],types:[0],reward:{name:'陵卫铜印',value:120,at:[-27,-9]}}
    ]},
  ]},
  weaponSkin: 'buried-tomb',
  pageTitle: '流沙王陵 | 第四关',
  config: CONFIG,
  grid: MAP_GRID,
  loot: LANDMARKS.loot,
  ammo: LANDMARKS.ammo,
  background: 0xc39767,
  fog: 0xc39767,
  palette: { projectile: 0x9dd957, ichor: 0x8d4f3b, spark: 0xffcc7a, core: 0xffc064, rare: 0xffd693, blast: 0xd5a364 },
  portal: { width: 1.13, depth: 1.13, height: 5.2, verticalRange: .42, useRadius: 3.10 },
  buildMap,
  createEnvironment,
  createEncounter,
  createPortal,
  buildBeastModel,
  terrain: { ground: terrainHeight },
  area(x, z, level, y) {
    if (y < -.62) return '地下回廊';
    if (y >= 4.68 && Math.hypot(x - level.gate.x, z - level.gate.z) < 5.2) return '塔顶日轮祭坛';
    if (z < -18.0) return '北侧陵墓入口';
    if (z > 29 && Math.abs(x) < 8) return '南侧半埋石门';
    if (z > 16) return '南侧沙丘荒原';
    if (x > 17) return '东侧绿洲废墟';
    if (x < -17) return '西侧方尖碑柱廊';
    return '阶梯金字塔广场';
  },
  minimap: {
    tiles: { '#': '#9b7456', J: '#c4a173', I: '#e6b06d', B: '#a08667', F: '#366d56', R: '#6e6354' },
    beforeTiles({ ctx, px, pz, size }) {
      ctx.fillStyle = '#473c33'; ctx.fillRect(0, 0, size, size);
      const t = TOMB;
      ctx.fillStyle = '#241d22';
      ctx.fillRect(px(-t.halfWidth), pz(t.back), px(t.halfWidth)-px(-t.halfWidth), pz(t.front)-pz(t.back));
      for (const direction of [-1, 1]) {
        const x = direction * t.rampX - t.rampWidth / 2;
        ctx.fillRect(px(x), pz(t.front), px(x + t.rampWidth)-px(x), pz(t.approach)-pz(t.front));
      }
      ctx.fillStyle = '#4a7862';
      ctx.beginPath(); ctx.ellipse(px(25.2), pz(3.6), 9.4, 6.7, 0, 0, Math.PI*2); ctx.fill();
    },
    afterTiles({ ctx, px, pz }) {
      ctx.strokeStyle = '#d4ac746e';
      for (const radius of [10.9, 7.6, 4.4]) {
        ctx.strokeRect(px(-radius), pz(-radius), px(radius)-px(-radius), pz(radius)-pz(-radius));
      }
    },
  },
  text: {
    tag: '第四关 / 上古王陵',
    title: '流沙王陵',
    enter: '进入王陵',
    brief: '从半埋的南门进入王陵，夺取太阳圣核，登上金字塔引爆金色光柱。沙暴来临时，蹲伏并停火可压低声响。',
    enemy: '凶兽',
    bossName: '巨型守墓者',
    keyItem: '太阳圣核',
    portal: '塔顶光柱',
    safe: '半埋石门安全区',
    objective: '清除凶兽，击败巨型守墓者并夺取太阳圣核',
    exitObjective: '登上金字塔，在塔顶光柱前按 F 引爆',
    detonating: '封印崩解，沙浪扩散中',
    rage: '守墓者狂暴，沙蝎群从阶下涌出',
  },
};
