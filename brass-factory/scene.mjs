import { stageBuilder, stairDeck, creatureParts, skySpecks } from '@level-kit/stage-craft.mjs';

const CONFIG = {
  map: { cell: 4, fog: 0.015 },
  beasts: { population: 80, capacity: 112, types: [{}, {}, { hazardLife: 3.8 }, { summonCount: 7 }] },
  audio: { ambient: { filter: 'lowpass', frequency: 500, activeGain: 0.09 } },
  pipes: {
    first: 40,
    interval: 30,
    warning: 2,
    duration: 6,
    radius: 3.9,
    maxActive: 3,
    tick: 0.45,
    playerDps: 8,
    enemyDps: 32,
    bossDps: 8,
  },
  conveyor: { x: -20, z: -8, width: 4, length: 22, speed: 2.4 },
};
const MAP_GRID = [
  '#########################',
  '#.......................#',
  '#.......................#',
  '#.................D.....#',
  '#...........D...........#',
  '#.......................#',
  '#..A.............K......#',
  '#.......................#',
  '#.......................#',
  '#....................K..#',
  '#......B................#',
  '#...........G...........#',
  '#..A........F.O.........#',
  '#................K......#',
  '#.......................#',
  '#.......................#',
  '#....A...............K..#',
  '#.......................#',
  '#.......C...............#',
  '#...C................C..#',
  '#.................C.....#',
  '#...W...............W...#',
  '#...........P...........#',
  '#.......................#',
  '#########################',
];
const decks = [
  stairDeck(0, -3, 9.2, 8, 13, 3.12, 'z'),
  stairDeck(-20, -8, 5, 22, 7, 1.92, 'z'),
  stairDeck(8, -32, 5.4, 28, 8, 3.36, 'x'),
];
const vents = [
  { x: 24, z: -22, name: '东锅炉进汽口' },
  { x: 29, z: 5, name: '回流管' },
  { x: -20, z: -9, name: '装配线阀门' },
  { x: 4, z: -30, name: '船坞供汽管' },
  { x: 10, z: 19, name: '煤仓回压阀' },
];
const ground = (x, z) => Math.max(decks[0].height(x, z), decks[1].height(x, z), decks[2].height(x, z));
const loot = [
  [-36, 32, '煤仓铅印', 110],
  [13, 30, '机修怀表', 180],
  [31, 15, '蒸汽阀门', 235],
  [25, -24, '压力计', 280],
  [0, -3, '主齿轮蓝图', 470],
  [-20, -8, '装配卡尺', 360],
  [-33, -18, '黄铜齿轮', 220],
  [18, -32, '飞艇罗盘', 530],
  [-2, -32, '船坞调度簿', 310],
  [36, -35, '铆工纪念章', 240],
];
const ammo = [
  [0, 32],
  [-12, 25],
  [21, 23],
  [36, 3],
  [29, -16],
  [32, -32],
  [10, -32],
  [-19, -9],
  [-32, 11],
  [9, 6],
];

function gearShape(THREE, teeth) {
  const shape = new THREE.Shape();
  for (let i = 0; i < teeth * 4; i++) {
    const angle = (i * Math.PI * 2) / (teeth * 4),
      radius = i % 4 === 0 || i % 4 === 3 ? 0.83 : 1;
    const x = Math.cos(angle) * radius,
      y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const hub = new THREE.Path();
  hub.absarc(0, 0, 0.26, 0, Math.PI * 2, true);
  shape.holes.push(hub);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false, curveSegments: 8 });
  geometry.translate(0, 0, -0.1);
  return geometry;
}

function buildMap(context) {
  const { THREE, scene, GRID, level, canvasTexture, seededRandom } = context;
  const random = seededRandom(1303);
  const grating = canvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#75695f';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#443d3b';
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, w - 4, h - 4);
      for (let i = 0; i < 230; i++) {
        ctx.strokeStyle = i % 3 ? '#b374443a' : '#d4c5a82e';
        const x = random() * w,
          y = random() * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + random() * 10, y + random() * 1.6);
        ctx.stroke();
      }
      ctx.fillStyle = '#393d3e';
      for (const x of [7, 121])
        for (const y of [7, 121]) {
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
    },
    true,
  );
  grating.repeat.set(29, 29);
  const b = stageBuilder(
    context,
    {
      iron: 0x4c555c,
      edge: 0x788189,
      coal: 0x302d31,
      copper: 0xa46c49,
      brass: 0xc79458,
      black: 0x34333e,
      brick: 0x885d50,
      ivory: 0xccb184,
      red: 0xa64c36,
    },
    grating,
  );
  const { block, column, part, beam } = b;
  b.floor('surface');
  for (const deck of decks) deck.draw(b, 'iron');
  const gears = [],
    pistons = [];
  const gearGeometry = gearShape(THREE, 16);
  const brass = new THREE.MeshLambertMaterial({ color: 0xb48447 }),
    iron = new THREE.MeshLambertMaterial({ color: 0x647077 });
  function gear(x, y, z, radius, speed, material = brass) {
    const wheel = new THREE.Mesh(gearGeometry, material);
    wheel.position.set(x, y, z);
    wheel.scale.set(radius, radius, radius);
    scene.add(wheel);
    gears.push({ wheel, speed, phase: gears.length * 0.23 });
    part('cylinder', 'black', x, y, z, radius * 0.39, 0.62, radius * 0.39, 0xffffff, 0, Math.PI / 2);
  }
  function pipe(a, c, width = 0.55, m = 'copper') {
    beam(m, a, c, width, 'cylinder');
    const steps = Math.max(1, Math.floor(Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]) / 3.2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps,
        p = a.map((v, j) => v + (c[j] - v) * t);
      part('orb', 'brass', p[0], p[1], p[2], width * 1.24, width * 1.24, width * 1.24);
    }
  }
  function boiler(x, z) {
    column('iron', x, z, 4.45, 0, 0.67, true);
    column('copper', x, z, 3.92, 0.62, 5.9, true);
    part('orb', 'brass', x, 5.94, z, 3.97, 1.3, 3.97);
    for (const y of [1.05, 2.72, 4.92]) column('iron', x, z, 4.1, y, y + 0.18);
    column('black', x, z, 0.93, 6.35, 9.16);
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      for (const y of [1.11, 4.98])
        part('orb', 'ivory', x + 2.02 * Math.sin(a), y, z + 2.02 * Math.cos(a), 0.15, 0.15, 0.15);
    }
    part('cylinder', 'black', x, 2.6, z + 2.0, 1.24, 0.19, 1.24, 0xffffff, 0, Math.PI / 2);
    part('cylinder', 'light', x, 2.6, z + 2.13, 1.0, 0.07, 1.0, 0xffce8a, 0, Math.PI / 2);
    part('box', 'red', x + 0.1, 2.72, z + 2.2, 0.075, 0.43, 0.07, 0xffffff, 0, 0, -0.7);
  }
  function crane(x, z) {
    column('iron', x, z, 1.0, 0, 8.6, true);
    beam('brass', [x, 8.2, z], [x + 6, 10.1, z], 0.39);
    beam('iron', [x, 6.6, z], [x + 6, 10.1, z], 0.15);
    beam('black', [x + 5.85, 10.0, z], [x + 5.85, 6.9, z], 0.07);
    part('ring', 'brass', x + 5.85, 6.7, z, 0.55, 0.68, 0.6);
  }
  function arm(x, z) {
    column('black', x, z, 1.92, 0, 0.59, true);
    column('brass', x, z, 1.13, 0.59, 2.45, true);
    beam('iron', [x, 2.2, z], [x + 1.8, 4.3, z], 0.48);
    beam('brass', [x + 1.8, 4.3, z], [x + 3.45, 3.6, z], 0.36);
    part('orb', 'copper', x + 1.8, 4.3, z, 0.9, 0.9, 0.86);
    for (const s of [-1, 1]) beam('black', [x + 3.45, 3.6, z], [x + 3.45 + s * 0.33, 2.9, z], 0.15);
  }
  for (let row = 0; row < GRID.rows; row++)
    for (let col = 0; col < GRID.columns; col++) {
      const tile = GRID.cells[row][col],
        x = GRID.x(col),
        z = GRID.z(row);
      if (tile === '#') {
        block('brick', x, z, GRID.cell + 0.02, GRID.cell + 0.02, -0.15, 4.1, true);
        block('iron', x, z, GRID.cell + 0.08, GRID.cell + 0.08, 3.95, 4.23);
        if ((row + col) % 3 === 0) column('brass', x, z, 0.98, 3.9, 6.4);
      } else if (tile === 'K') boiler(x, z);
      else if (tile === 'D') crane(x, z);
      else if (tile === 'A') arm(x, z);
      else if (tile === 'C') {
        part('stone', 'coal', x, 0.96, z, 4.2, 2.8, 3.6);
        level.box(x, z, 3, 2.9, 0, 2.15);
        for (let i = 0; i < 5; i++)
          part(
            'stone',
            'coal',
            x + (random() - 0.5) * 2.1,
            1.3 + random() * 0.5,
            z + (random() - 0.5) * 2,
            1,
            1,
            1,
          );
      } else if (tile === 'W') {
        block('brick', x, z, 6.3, 5.3, 0, 3.87, true);
        part('roof', 'iron', x, 4.39, z, 8, 1.3, 7);
        for (let k = -2; k <= 2; k++) block('light', x + k, z - 2.67, 0.64, 0.04, 2.0, 2.7);
      } else if (tile === 'P') level.spawn.set(x, 0, z);
      else if (tile === 'O') {
        level.bossAnchor.set(x, ground(x, z), z);
        level.bossSpawn.copy(level.bossAnchor);
      } else if (tile === 'G') level.gate.set(x, ground(x, z), z);
    }
  // 门架、主机房闸门与侧置齿轮。中轴两端均可登上屋顶，外围仍保留绕行空间。
  for (const sign of [-1, 1]) {
    block('iron', sign * 5.4, 37, 1.0, 1.4, 0, 5.5, true);
    block('iron', sign * 5.7, -3, 1.0, 1.2, 0, 7.1, true);
    pipe([sign * 5.7, 6.62, -3], [sign * 9, 6.62, -3], 0.6);
    block('brass', sign * 2.65, -4, 0.45, 0.45, 3.12, 7.52, true);
    for (let i = 0; i < 4; i++) block('black', sign * (2.55 + i * 0.09), -4, 0.17, 0.32, 3.32, 7.25);
  }
  block('brass', 0, 37, 11.65, 1.3, 5.34, 5.88);
  block('iron', 0, -4, 5.9, 0.51, 7.37, 7.94);
  gear(-5.72, 5.66, -2.2, 2.46, 0.36);
  gear(-8.89, 4.77, -2.12, 1.02, -0.83, iron);
  gear(5.9, 5.55, -2.12, 1.66, -0.45);
  for (let i = 0; i < 5; i++) {
    const x = -25.4,
      z = -16 + i * 3.8;
    gear(x, 2.54, z, 0.82, 0.88 * (i % 2 ? 1 : -1), i % 2 ? iron : brass);
    const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 1.5, 8), brass);
    piston.position.set(x, 3.6, z);
    scene.add(piston);
    pistons.push(piston);
  }
  for (const z of [-39, -28, -17, 15, 28]) pipe([42, 4.8, z], [31, 4.8, z], 0.69);
  pipe([42, 4.8, -39], [42, 4.8, 35], 0.91);
  for (const { x, z } of vents) {
    const y = ground(x, z);
    part('ring', 'brass', x, y + 0.067, z, 1.27, 1.27, 1.27, 0xffffff, 0, Math.PI / 2);
    for (let i = -2; i <= 2; i++) block('black', x + i * 0.19, z, 0.09, 0.88, y + 0.02, y + 0.07);
    pipe([x + 3.2, y + 0.27, z], [x + 0.8, y + 0.27, z], 0.4);
  }
  // 装配线踏面用连续的横肋指示输送方向。坡段与皮带等高，端头可以直接下线。
  const belt = CONFIG.conveyor;
  for (let z = belt.z - belt.length / 2; z <= belt.z + belt.length / 2; z += 1.1)
    block('edge', belt.x, z, belt.width, 0.14, 1.92, 1.97);
  for (const x of [-28, 28])
    for (const z of [-42, 40]) {
      column('brick', x, z, 2.4, 0, 12.5, true);
      column('black', x, z, 2.6, 12.2, 12.7);
    }
  // 北侧供汽总管同时支撑船坞步道。两端坡道和侧面敞开的装卸口都可撤出。
  for (const z of [-34.4, -29.6]) {
    pipe([-6, 2.95, z], [22, 2.95, z], 0.86, 'brass');
    for (const [a, c] of [
      [-6, -1],
      [5, 11],
      [17, 22],
    ]) {
      pipe([a, 4.17, z], [c, 4.17, z], 0.13, 'iron');
      for (const x of [a, c]) column('iron', x, z, 0.15, 3.36, 4.22);
    }
  }
  // 高侧窗和外侧炉房的剪影围住生产线。上方桁架跨过过道，地面行走路线保持开阔。
  for (const z of [-23, -8, 7]) {
    for (const x of [17, 39]) {
      column('iron', x, z, 0.45, 0, 10.8, true);
      beam('brass', [x, 8.4, z], [x + (x === 17 ? 2.6 : -2.6), 10.8, z], 0.23);
    }
    beam('iron', [17, 10.8, z], [39, 10.8, z], 0.36);
    beam('iron', [17, 12.7, z], [39, 12.7, z], 0.27);
    for (let x = 17; x < 39; x += 2.75) {
      const y = ((x - 17) / 2.75) % 2 === 0 ? 10.8 : 12.7;
      beam('edge', [x, y, z], [x + 2.75, 23.5 - y, z], 0.19);
    }
  }
  for (const x of [-39, -23, -7, 9, 25, 41]) {
    const z = -54,
      h = 8 + Math.abs(x % 7) * 0.55;
    block('brick', x, z, 15, 11, 0, h);
    for (let j = 0; j < 3; j++) {
      const cx = x - 5 + j * 5;
      part('box', 'iron', cx, h + 1.05, z, 5.45, 0.3, 11.45, 0xffffff, 0, 0, 0.4);
      block('ivory', cx + 2.43, z, 0.15, 10, h, h + 1.96);
    }
    for (const dx of [-5, -3, 2, 4]) block('ivory', x + dx, z + 5.53, 0.94, 0.09, h - 2.6, h - 1.0);
    column('coal', x - 4, z - 3, 1.55, h, h + 5 + Math.abs(x % 9));
  }
  // 铆接飞艇停在船坞上空，系泊缆连接桅杆与刚性气囊。
  part('orb', 'ivory', 16, 14.5, -39, 19, 6.3, 6.2);
  for (const dx of [-6, -2, 2, 6]) {
    const scale = Math.sqrt(1 - (dx / 9.6) ** 2);
    part('ring', 'copper', 16 + dx, 14.5, -39, 6.75 * scale, 6.75 * scale, 0.8, 0xffffff, Math.PI / 2);
  }
  block('copper', 16, -39, 5.8, 2, 9.1, 10.0);
  for (const dx of [-2, 2]) beam('black', [16 + dx, 9.9, -39], [16 + dx * 1.5, 12, -39], 0.12);
  beam('black', [22, 14.1, -39], [28, 9.5, -36], 0.09);
  part('box', 'red', 8, 15.6, -39, 3.8, 2.3, 0.21, 0xffffff, 0, 0, -0.3);
  for (const sign of [-1, 1]) part('box', 'copper', 8, 14, -39 + sign, 4.4, 0.22, 2.0);
  b.flush();
  b.lighting(0xf4dcc1, 0x77625a, 0xffddaf, [
    [0, 9, -4, 0xffbf74, 58, 22],
    [25, 5, -9, 0xff752f, 60, 22],
    [-20, 5, -8, 0xe8cb83, 41, 17],
    [12, 8, -33, 0xa3c7d9, 43, 19],
  ]);
  return { gears, pistons };
}

function createEncounter({ CONFIG: settings, level, sound }) {
  const rules = settings.pipes,
    belt = settings.conveyor;
  function contains(point, x, z, y) {
    return Math.abs(y - ground(point.x, point.z)) < 2.8 && Math.hypot(x - point.x, z - point.z) < rules.radius;
  }
  function drift(actor, dt) {
    if (
      Math.abs(actor.x - belt.x) > belt.width / 2 ||
      Math.abs(actor.z - belt.z) > belt.length / 2 ||
      Math.abs(actor.y - ground(actor.x, actor.z)) > 0.34
    )
      return;
    level.move(actor, 0, -belt.speed * dt, 0.46);
  }
  return {
    next: rules.first,
    selected: -1,
    active: new Map(),
    last: -1,
    tick: 0,
    status: null,
    reset() {
      this.next = rules.first;
      this.selected = -1;
      this.active.clear();
      this.last = -1;
      this.tick = 0;
      this.status = null;
    },
    inPipe(x, z, y) {
      for (const i of this.active.keys()) if (contains(vents[i], x, z, y)) return true;
      return false;
    },
    inSteam(x, z, y, game) {
      if (this.inPipe(x, z, y)) return true;
      return Boolean(
        game?.projectiles?.puddles.some(
          (p) =>
            p.life > 0 &&
            Math.abs(y - p.pos.y) < 0.6 &&
            Math.hypot(x - p.pos.x, z - p.pos.z) < 1.14 + (1 - p.life / p.max) * 0.36,
        ),
      );
    },
    update(game, dt) {
      if (game.blast) return;
      const t = game.time,
        p = game.player;
      for (const [i, end] of this.active) if (t >= end) this.active.delete(i);
      if (this.selected < 0 && t >= this.next - rules.warning) {
        // 上次使用过的阀门不连续选中，仍可同时容纳后续配置产生的多个活跃喷口。
        const count = vents.length;
        this.selected =
          this.last < 0
            ? Math.floor(Math.random() * count)
            : (this.last + 1 + Math.floor(Math.random() * (count - 1))) % count;
        sound.stageEvent('warning',game,vents[this.selected]);
        game.ui.notify(vents[this.selected].name + '升压，注意白色预兆', 1.8);
      }
      if (this.selected >= 0 && t >= this.next) {
        this.last = this.selected;
        if (this.active.size < rules.maxActive) this.active.set(this.last, this.next + rules.duration);
        this.next += rules.interval;
        this.selected = -1;
        sound.stageEvent('danger',game,vents[this.last]);
      }
      if (this.selected >= 0)
        this.status = { title: '管道升压', detail: vents[this.selected].name, remaining: this.next - t };
      else if (this.active.size) {
        const nearest = this.inPipe(p.x, p.z, p.y);
        this.status = {
          title: '管道爆裂 × ' + this.active.size,
          detail: nearest ? '蒸汽灼烫 · 能见度下降' : '引导机械体穿过白色蒸汽',
          remaining: Math.max(...this.active.values()) - t,
        };
      } else this.status = null;
      drift(p, dt);
      this.tick -= dt;
      const burn = this.tick <= 0;
      if (burn) this.tick += rules.tick;
      if (burn && this.inPipe(p.x, p.z, p.y)) p.hurt(rules.playerDps * rules.tick, game);
      for (const beast of game.beasts.pool) {
        if (!beast.active) continue;
        drift(beast, dt);
        if (burn && this.inSteam(beast.x, beast.z, beast.y, game))
          game.beasts.damage(
            beast,
            (beast.type === 3 ? rules.bossDps : rules.enemyDps) * rules.tick,
            game,
            'environment',
          );
      }
    },
  };
}

function machine(type, helpers, rage = false) {
  const { add, finish } = creatureParts(helpers);
  const iron = 0x414957,
    bronze = 0xb77846,
    brass = 0xd7a966,
    fire = 0xffb64e;
  const lamp = (x, y, z, w, h = w) => add('gem', fire, x, y, z, w, h, w, 0, 0, 0, true);
  if (type === 0) {
    add('gem', bronze, 0, 0.47, 0, 0.67, 0.67, 1.01);
    add('horn', brass, 0, 0.47, 0.51, 0.43, 0.59, 0.41, Math.PI / 2);
    for (const s of [-1, 1]) {
      add('cylinder', iron, s * 0.25, 0.26, -0.22, 0.38, 0.13, 0.38, 0, Math.PI / 2);
      add('cylinder', brass, s * 0.23, 0.73, 0.2, 0.29, 0.11, 0.29, 0, Math.PI / 2);
      lamp(s * 0.16, 0.58, 0.39, 0.092);
    }
    add('horn', iron, 0, 0.4, -0.69, 0.11, 0.81, 0.13, -1.28);
  } else if (type === 1) {
    add('cylinder', bronze, 0, 1.13, -0.05, 1.1, 1.2, 0.97);
    add('box', iron, 0, 1.76, 0.12, 0.67, 0.51, 0.62);
    add('box', brass, 0, 1.28, 0.44, 0.9, 0.5, 0.2);
    lamp(0, 1.78, 0.44, 0.33, 0.16);
    for (const s of [-1, 1]) {
      add('cylinder', iron, s * 0.31, 0.38, 0.01, 0.38, 0.74, 0.41);
      add('box', bronze, s * 0.66, 0.92, 0.02, 0.34, 0.83, 0.49);
      add('cylinder', brass, s * 0.63, 1.48, 0.02, 0.58, 0.41, 0.58);
    }
  } else if (type === 2) {
    add('gem', iron, 0, 0.79, 0, 1.09, 0.76, 1.1);
    add('cylinder', bronze, 0, 1.16, 0.04, 0.73, 0.64, 0.77);
    add('cylinder', brass, 0, 1.41, 0.5, 0.27, 0.83, 0.27, Math.PI / 2);
    lamp(0, 1.44, 0.91, 0.18);
    for (const s of [-1, 1])
      for (let j = 0; j < 4; j++)
        add('box', bronze, s * 0.55, 0.46, -0.42 + 0.26 * j, 0.15, 1.05, 0.14, 0, s * 0.55);
  } else {
    add('cylinder', bronze, 0, 2.12, -0.12, 1.95, 1.68, 1.51);
    add('box', iron, 0, 3.09, 0.2, 1.25, 0.91, 1.14);
    lamp(0, 3.17, 0.81, 0.67, 0.23);
    for (let k = -2; k <= 2; k++)
      add('box', rage ? fire : brass, k * 0.22, 2.13, 0.69, 0.12, 0.89, 0.1, 0, 0, 0, rage);
    for (const s of [-1, 1]) {
      add('box', iron, s * 0.49, 0.68, 0.0, 0.57, 1.37, 0.75);
      add('cylinder', brass, s * 1.02, 2.48, 0.03, 0.83, 0.66, 0.85, 0, Math.PI / 2);
      add('box', bronze, s * 1.13, 1.67, 0.14, 0.58, 1.04, 0.67);
      add('cylinder', iron, s * 0.7, 3.02, -0.48, 0.32, rage ? 1.56 : 0.98, 0.32);
      if (rage) lamp(s * 0.7, 3.9, -0.48, 0.29, 0.42);
    }
  }
  return finish();
}

function createEnvironment(context) {
  const { THREE, scene, mapData, level, dynamicMesh, setInstance, updateMesh, seededRandom } = context;
  const random = seededRandom(497),
    ash = skySpecks(context, 126, 89, 0xb6ae9a, 0.076, 1301);
  const geometry = new THREE.IcosahedronGeometry(0.6, 0);
  const steam = dynamicMesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: 0xe4ddd2, transparent: true, opacity: 0.25, depthWrite: false }),
    vents.length * 16,
  );
  const gateSteam = dynamicMesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: 0xffdeb0,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
    }),
    28,
  );
  const motes = Array.from({ length: 16 }, () => [random() * 2 * Math.PI, random(), random()]);
  const density = scene.fog.density;
  return {
    update(t, playing, game) {
      const clock = game.phase === 'ready' ? t : game.time;
      for (const { wheel, speed, phase } of mapData.gears) wheel.rotation.z = phase + clock * speed;
      for (let i = 0; i < mapData.pistons.length; i++)
        mapData.pistons[i].position.y = 3.65 + Math.sin(clock * 3 + i) * 0.52;
      ash.position.y = Math.sin(t * 0.24) * 0.8;
      let n = 0;
      const enc = game.encounter;
      for (let i = 0; i < vents.length; i++) {
        const active = enc.active.has(i),
          warned = enc.selected === i;
        if (!active && !warned) continue;
        const v = vents[i],
          base = ground(v.x, v.z);
        for (let j = 0; j < (active ? 16 : 5); j++) {
          const [angle, offset, r] = motes[j],
            p = (clock * (active ? 0.84 : 0.49) + offset) % 1;
          const radius = (0.25 + p * (active ? 3.5 : 0.72)) * (0.4 + r * 0.6),
            size = (0.28 + p * 1.75) * (active ? 1 : 0.44);
          setInstance(
            steam,
            n++,
            v.x + Math.cos(angle) * radius,
            base + 0.15 + p * (active ? 4.6 : 1.45),
            v.z + Math.sin(angle) * radius,
            size,
            size * 0.87,
            size,
            null,
            angle + clock * 0.32,
          );
        }
      }
      updateMesh(steam, n);
      const blast = game.blast,
        radius = 1.85 + blast * 10;
      for (let i = 0; i < 28; i++) {
        const angle = (i * 2 * Math.PI) / 28 + clock * 0.6;
        const x = radius * Math.cos(angle),
          y = radius * Math.sin(angle);
        const size = 0.12 + blast * 0.95;
        setInstance(
          gateSteam,
          i,
          level.gate.x + x,
          level.gate.y + 2.43 + y * (1 - blast * 0.67),
          level.gate.z + 0.23 + blast * 2.4,
          size,
          size * 0.8,
          size,
          null,
          angle,
        );
      }
      updateMesh(gateSteam, 28);
      const p = game.player;
      scene.fog.density = density * (enc.inPipe(p.x, p.z, p.y) ? 2.8 : 1) * (game.variation?.fog ?? 1);
    },
  };
}

export default {
  story:{type:'regions',sectors:[
    {name:'货运月台',at:[-8,23],entries:[[-15,25],[-2,16]]},
    {name:'锅炉机坊',at:[23,5],entries:[[31,7],[18,-1]]},
  ]},
  config: CONFIG,
  grid: MAP_GRID,
  weaponSkin: 'brass-factory',
  pageTitle: '黄铜机坊 | 第十三关',
  loot,
  ammo,
  buildMap,
  createEnvironment,
  createEncounter,
  buildBeastModel: machine,
  buildRageModel: (h) => machine(3, h, true),
  terrain: {
    ground,
    moveScale(x, z, y, game) {
      return game?.encounter?.inPipe(x, z, y) ? 0.85 : 1;
    },
  },
  background: 0x61504b,
  fog: 0x867368,
  portal: { width: 4.5, useRadius: 4, verticalRange: 1.6 },
  palette: {
    projectile: 0xffb469,
    ichor: 0xae8c61,
    spark: 0xffd78c,
    core: 0xffce73,
    rare: 0xc2d8dc,
    blast: 0xe7d4ac,
    rift: {
      sealed: [0.65, 0.37, 0.12],
      ready: [1.24, 0.86, 0.3],
      rings: [0xe4a64b, 0xffdc89],
      particles: 0xf5bd67,
      wave: 0xe9cb98,
    },
  },
  area(x, z) {
    return z < -25
      ? '飞艇船坞'
      : x > 14
        ? '锅炉车间'
        : x < -13 && z < 15
          ? '装配流水线'
          : z > 17
            ? '煤场与仓库'
            : '主齿轮机房';
  },
  minimap: {
    tiles: { '#': '#76665a', A: '#998b69', C: '#4b4548', K: '#ac7651', W: '#766955', D: '#8c9998', F: '#bba373' },
    overlay({ ctx, px, pz, game }) {
      const enc = game.encounter;
      if (!enc) return;
      for (let i = 0; i < vents.length; i++) {
        const active = enc.active.has(i);
        if (!active && enc.selected !== i) continue;
        const { x, z } = vents[i];
        ctx.beginPath();
        ctx.arc(px(x), pz(z), Math.abs(px(CONFIG.pipes.radius) - px(0)), 0, 2 * Math.PI);
        ctx.strokeStyle = active ? '#ffa76b' : '#ffdb9e';
        ctx.fillStyle = active ? '#f3926777' : '#f6dba237';
        ctx.fill();
        ctx.stroke();
      }
    },
  },
  text: {
    tag: '第十三关 / 蒸汽工厂',
    title: '黄铜机坊',
    enter: '进入货运月台',
    enemy: '失控机械体',
    bossName: '主控机械巨像',
    keyItem: '主传动芯轴',
    portal: '机械闸门',
    loot: '机坊藏品',
    safe: '货运月台安全区',
    rage: '压力炉阀门崩开，巨像正在召集机械鼠',
    brief:
      '穿过煤场和装配线，留意压力阀的嘶鸣。诱使机械群进入喷口，借蒸汽清出退路。取回主传动芯轴后登上中央机房顶部，引爆机械闸门。',
    winBrief: '主传动芯轴停转，金色蒸汽冲开闸门。你从货运月台带走了机坊藏品。',
  },
};
