import { stageBuilder, stairDeck, creatureParts, skySpecks } from '@level-kit/stage-craft.mjs';

const CONFIG = {
  map: { cell: 3.6, fog: 0.016 },
  beasts: { population: 78, capacity: 110, types: [{}, {}, { hazardLife: 3.5 }, { summonCount: 7 }] },
  audio: { ambient: { filter: 'highpass', frequency: 470, activeGain: 0.045 } },
  parade: {
    first: 120,
    interval: 120,
    warning: 8,
    duration: 20,
    lanterns: 8,
    extra: 16,
    healing: 12,
  },
};
const MAP_GRID = [
  '#########################',
  '#.......................#',
  '#.......................#',
  '#.......................#',
  '#...........T...........#',
  '#..B...B.L......H....H..#',
  '#.......................#',
  '#.......................#',
  '#....B..................#',
  '#.......L.......H....H..#',
  '#...........G...........#',
  '#.B.......O.............#',
  '#.....B.................#',
  '#....L..................#',
  '#.........L.....H....H..#',
  '#...B...................#',
  '#.......................#',
  '#.......................#',
  '#..B....W.......H....H..#',
  '#.......................#',
  '#.......................#',
  '#..............L........#',
  '#...........S...........#',
  '#.......................#',
  '#########################',
];
const towerDeck = stairDeck(0, -28.8, 10, 10, 9, 3.12, 'x');
const lanternRoad = { x: 24.8, start: 31, end: -32 };
const loot = [
  [-11.5, 22, '池畔御守', 110],
  [10, 30, '朱印手帖', 130],
  [23, 19, '狐面', 240],
  [34, -17, '古町铜钱', 230],
  [25, -34, '百鬼绘卷', 410],
  [4, -31, '五重塔宝珠', 650],
  [-22.5, -14, '竹简', 180],
  [-32, 3, '石灯笼铭牌', 250],
  [-17, -4, '能面', 330],
  [6, -8, '神社绘马', 270],
];
const ammo = [
  [2, 30],
  [-12, 15],
  [15, 18],
  [26, 7],
  [29, -9],
  [23, -29],
  [6, -29],
  [-23, -23],
  [-32, 9],
  [-6, 4],
];

function buildMap(context) {
  const { THREE, scene, GRID, level, canvasTexture, seededRandom } = context;
  const rand = seededRandom(824);
  const stone = canvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#41485d';
      ctx.fillRect(0, 0, w, h);
      for (let row = 0; row < 4; row++)
        for (let i = -1; i < 5; i++) {
          const t = Math.round(59 + rand() * 18);
          ctx.fillStyle = 'rgb(' + t + ',' + (t + 4) + ',' + (t + 10) + ')';
          ctx.fillRect(i * 32 + (row % 2) * 16, row * 32, 30, 30);
        }
    },
    true,
  );
  stone.repeat.set(22, 22);
  const b = stageBuilder(
    context,
    {
      vermilion: 0x9f3839,
      black: 0x26283b,
      wood: 0x62473d,
      paper: 0xe6ccaa,
      gold: 0xe4aa5e,
      jade: 0x586e59,
      trunk: 0x68505c,
      flower: 0xea9fb8,
      rock: 0x888291,
      water: 0x435f79,
    },
    stone,
  );
  b.floor('surface');
  const { part, block, column, beam } = b;
  function lantern(x, y, z, size = 1) {
    column('black', x, z, 0.68 * size, y + 0.36 * size, y + 0.47 * size);
    part('orb', 'light', x, y, z, 0.7 * size, 0.87 * size, 0.7 * size, 0xffbf71);
    for (const dy of [-0.25, 0.22]) column('vermilion', x, z, 0.54 * size, y + dy * size, y + (dy + 0.045) * size);
    column('black', x, z, 0.48 * size, y - 0.49 * size, y - 0.39 * size);
    part('box', 'vermilion', x, y - 0.65 * size, z, 0.1 * size, 0.33 * size, 0.1 * size);
  }
  function torii(x, z, width, height) {
    for (const side of [-1, 1]) {
      column('vermilion', x + side * width * 0.43, z, 0.7, 0, height, true);
      column('black', x + side * width * 0.43, z, 0.83, 0, 0.58);
      lantern(x + side * width * 0.29, height - 0.91, z, 0.75);
    }
    block('vermilion', x, z, width, 0.65, height - 0.13, height + 0.26);
    block('black', x, z, width + 0.78, 0.92, height + 0.25, height + 0.5);
    block('vermilion', x, z, width * 0.94, 0.43, height - 1.1, height - 0.84);
    block('gold', x, z, 0.75, 0.14, height - 1.0, height - 0.02);
    for (const sign of [-1, 1])
      beam(
        'black',
        [x + sign * width * 0.47, height + 0.35, z],
        [x + sign * (width * 0.56), height + 0.68, z],
        0.3,
      );
  }
  function house(x, z) {
    block('wood', x, z, 5.9, 5.7, 0, 0.42, true);
    block('paper', x, z, 5.6, 5.35, 0.41, 3.16, true);
    for (const face of [-1, 1]) {
      for (let k = -2; k <= 2; k++) block('wood', x + k * 1.28, z + face * 2.7, 0.12, 0.12, 0.43, 3.18);
      for (const y of [0.8, 1.8, 2.86]) block('wood', x, z + face * 2.7, 5.68, 0.13, y, y + 0.1);
      block('vermilion', x, z + face * 2.9, 3.65, 0.1, 2.15, 2.78);
    }
    part('roof', 'black', x, 3.84, z, 7.2, 1.64, 6.9);
    block('rock', x, z, 6.0, 0.3, 4.59, 4.8);
    for (const side of [-1, 1]) {
      beam('rock', [x - 3.25, 3.1, z + side * 3.26], [x + 3.25, 3.1, z + side * 3.26], 0.16);
      for (const dx of [-3.45, 3.45])
        beam('black', [x + dx * 0.85, 3.07, z + side * 3.1], [x + dx, 3.4, z + side * 3.38], 0.19);
    }
    lantern(x - 2.6, 2.2, z + 2.9, 0.68);
  }
  function cherry(x, z) {
    column('trunk', x, z, 0.86, 0, 3.8, true);
    for (let k = 0; k < 5; k++) {
      const a = k * 2.4,
        ex = x + Math.cos(a) * 2.2,
        ez = z + Math.sin(a) * 2.2,
        ey = 4.0 + rand() * 1.4;
      beam('trunk', [x, 2.5, z], [ex, ey, ez], 0.23, 'cylinder');
      part('orb', 'flower', ex, ey + 0.6, ez, 3.3, 1.65, 2.75, k % 2 ? 0xfbbac8 : 0xde88a6, a);
    }
  }
  function shrine(x, z) {
    for (const side of [-1, 1])
      for (const end of [-1, 1]) column('vermilion', x + side * 4.0, z + end * 2.5, 0.47, 0, 4.7, true);
    block('wood', x, z - 1.3, 7.2, 2.2, 0, 3.4, true);
    part('roof', 'black', x, 4.95, z, 11.8, 2.3, 9);
    block('gold', x, z, 9.1, 0.32, 6.04, 6.26);
    for (let k = -3; k <= 3; k++) {
      const y = 3.82 + 0.045 * k * k;
      part('cylinder', 'gold', x + k, y, z + 2.5, 0.11, 1.15, 0.11, 0xffffff, 0, 0, Math.PI / 2 + 0.09 * k);
      if (k % 2 === 0) part('box', 'paper', x + k, y - 0.33, z + 2.5, 0.28, 0.49, 0.06, 0xffffff, 0, 0, 0.28);
    }
  }
  for (let row = 0; row < GRID.rows; row++)
    for (let col = 0; col < GRID.columns; col++) {
      const tile = GRID.cells[row][col],
        x = GRID.x(col),
        z = GRID.z(row);
      if (tile === '#') {
        block('rock', x, z, GRID.cell + 0.02, GRID.cell + 0.02, -0.1, 3.2, true);
        part('cone', 'jade', x + rand() - 0.5, 4.0 + rand(), z, 3.2 + rand(), 4.0 + rand() * 2, 3.5);
      } else if (tile === 'H') house(x, z);
      else if (tile === 'B') {
        for (let k = 0; k < 6; k++) {
          const bx = x + (rand() - 0.5) * 2.3,
            bz = z + (rand() - 0.5) * 2.3,
            h = 4 + rand() * 3;
          column('jade', bx, bz, 0.19, 0, h);
          for (let y = 1; y < h; y += 1.15) column('gold', bx, bz, 0.22, y, y + 0.06);
          part('cone', 'jade', bx, h, bz, 1.6, 1.42, 1.24);
        }
        level.box(x, z, 1.75, 1.75, 0, 3.6);
      } else if (tile === 'L') {
        column('rock', x, z, 0.62, 0, 1.5, true);
        block('rock', x, z, 0.95, 0.95, 1.43, 1.63);
        part('box', 'light', x, 1.87, z, 0.55, 0.54, 0.55, 0xffd897);
        part('roof', 'rock', x, 2.27, z, 1.25, 0.43, 1.25);
      } else if (tile === 'S') {
        level.spawn.set(x, 0, z);
        torii(x, z - 1.8, 8.8, 5.5);
      } else if (tile === 'G') level.gate.set(x, 0, z);
      else if (tile === 'O') {
        level.bossAnchor.set(x, 0, z);
        level.bossSpawn.copy(level.bossAnchor);
      } else if (tile === 'T') {
        towerDeck.draw(b, 'rock');
        for (let i = 0; i < 5; i++) {
          const w = 5.6 - i * 0.73,
            y = 3.12 + i * 2.15;
          block('vermilion', x, z, w * 0.68, w * 0.68, y, y + 1.36, i === 0);
          part('roof', 'black', x, y + 1.72, z, w + 1.45, 1.15, w + 1.45);
          block('gold', x, z, w * 0.68 + 0.12, 0.15, y + 1.12, y + 1.24);
        }
        column('gold', x, z, 0.22, 13.4, 16.4);
        for (let k = 0; k < 5; k++)
          part('ring', 'gold', x, 14 + k * 0.35, z, 0.9 - k * 0.12, 0.9 - k * 0.12, 0.8, 0xffffff, 0, Math.PI / 2);
      } else if (tile === 'W') {
        block('water', x, z, 12, 7, -0.02, 0.04);
        block('wood', x, z, 2.5, 8, 0.045, 0.3, true, true);
        for (const sign of [-1, 1])
          beam('vermilion', [x + 1.34 * sign, 0.76, z - 3.55], [x + 1.34 * sign, 0.76, z + 3.55], 0.16);
      }
    }
  shrine(0, -12.5);
  for (const [x, z] of [
    [-6, 24],
    [8, 18],
    [-16, 7],
    [-24, -23],
    [34, 30],
    [36, -31],
    [-8, -16],
  ])
    cherry(x, z);
  // 东街小巷夹在四排町屋之间；灯串横跨长街，游戏中补给队伍沿道路中央通过。
  for (let z = -27; z <= 29; z += 8) {
    for (const x of [20.9, 29.0]) column('wood', x, z, 0.3, 0, 4.35, true);
    beam('black', [20.9, 4.3, z], [29, 4.3, z], 0.065);
    for (const x of [22.25, 24.95, 27.55]) lantern(x, 3.77, z, 0.84);
  }
  for (let i = 0; i < 13; i++) block('rock', 0, 32 - i * 2.6, 4.4, 1.72, -0.012, 0.022);
  // 山脊在墙外逐层后退，剪影与塔身错开。东边的灯市屋顶沿坡道抬升。
  for (let i = 0; i < 13; i++) {
    const x = -74 + i * 12,
      h = 10 + 7 * (1 + Math.sin(i * 1.21));
    part('stone', 'jade', x, 2, -65 - rand() * 11, 26 + rand() * 7, h, 21, 0x718499);
    part('cone', 'jade', x + 4, 4, -55, 9, 15 + rand() * 6, 9, 0x83939b);
  }
  for (const x of [-51, 51])
    for (let k = 0; k < 6; k++) {
      const z = -36 + k * 13,
        y = 4 + rand() * 3.8;
      block('wood', x, z, 5.8, 7.7, 0, y);
      part('roof', 'black', x, y + 0.84, z, 7.8, 2.0, 10);
      for (const dz of [-1.6, 1.6])
        part('box', 'light', x - Math.sign(x) * 2.93, y - 1.35, z + dz, 0.09, 0.67, 1.2, 0xffb77c);
    }
  // 屋脊的瓦当、帘纸和木纹都用本地绘制的纹样。
  const paper = canvasTexture(96, 128, (ctx, w, h) => {
    ctx.fillStyle = '#ffe6ba';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#aa3834';
    ctx.textAlign = 'center';
    ctx.font = 'bold 32px serif';
    ctx.fillText('御', w / 2, 55);
    ctx.fillText('封', w / 2, 92);
    ctx.strokeStyle = '#ab5144';
    ctx.lineWidth = 2;
    ctx.strokeRect(7, 8, w - 14, h - 16);
    ctx.fillStyle = '#985d4425';
    for (let i = 0; i < 180; i++) ctx.fillRect(rand() * w, rand() * h, 1, 2 + rand() * 4);
  });
  const seals = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.38, 0.67),
    new THREE.MeshBasicMaterial({ map: paper, side: THREE.DoubleSide }),
    10,
  );
  const stamp = new THREE.Object3D();
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5;
    stamp.position.set(2.03 * Math.cos(angle), 2.03 * Math.sin(angle), 0);
    stamp.rotation.z = angle - Math.PI / 2;
    stamp.updateMatrix();
    seals.setMatrixAt(i, stamp.matrix);
  }
  seals.position.set(level.gate.x, 2.3, level.gate.z + 0.19);
  seals.computeBoundingSphere();
  scene.add(seals);
  b.flush();
  b.lighting(0xbad2ff, 0x6c5361, 0xc4d6ff, [
    [0, 5, -7, 0xffc27f, 54, 22],
    [25, 4, 9, 0xff9b46, 45, 18],
    [24, 5, -18, 0xffad55, 43, 18],
    [-13, 5, 14, 0xf7b4ca, 28, 14],
  ]);
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(4.5, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe2bc, fog: false }),
  );
  moon.position.set(-27, 33, -86);
  scene.add(moon);
  return { seals };
}

function createEncounter({ CONFIG: settings, sound }) {
  const rules = settings.parade,
    script = new Map();
  return {
    next: rules.first,
    active: false,
    warned: false,
    status: null,
    script,
    isLantern(beast) { return script.has(beast); },
    killHealing(beast) { return this.isLantern(beast) ? rules.healing : 0; },
    reset() {
      this.next = rules.first;
      this.active = false;
      this.warned = false;
      this.status = null;
      this.beat = -1;
      this.nextGroup = null;
      script.clear();
    },
    stepScriptedBeast(b, game, dt) {
      if (!script.has(b)) return false;
      const speed = b.stun > 0 ? 0 : 2.56 * (b.perkMoveScale ?? 1);

      b.fx = 0;
      b.fz = -1;
      b.stride = speed;
      game.level.move(b, 0, -speed * dt, 0.47);
      return true;
    },
    update(game) {
      if (game.blast) return;
      if (!this.warned && game.time >= this.next - rules.warning) {
        this.warned = true;
        sound.tone(440, 622, 0.54, 0.19, 'sine');
        game.ui.notify('东街灯火齐明，百鬼行列即将到来', 2);
      }
      if (!this.active && game.time >= this.next) {
        if (!this.nextGroup) {
          const count = game.story?.managed || game.field?.hunting ? rules.lanterns : rules.extra;
          this.nextGroup = Array.from({ length: count }, (_, i) => {
            if (i >= rules.lanterns) return game.beasts.randomType();
            return { type: 0, regular: false, angle: Math.PI, anchor: {
              x: lanternRoad.x + (i % 2 ? .73 : -.73), z: lanternRoad.start - i * 1.31,
            } };
          });
        }
        const ghosts = game.beasts.spawnGroup(this.nextGroup, {
          accept: ({ x, y, z }, i) => i >= rules.lanterns ||
            (Math.abs(x - lanternRoad.x) <= 3.2 && z <= lanternRoad.start + 2 && z > lanternRoad.end + 5 && y < .5),
        });
        if (!ghosts.length) return;
        this.nextGroup = null;
        this.active = true;
        this.next = game.time;
        this.beat = -1;
        ghosts.slice(0, rules.lanterns).forEach((ghost, i) => script.set(ghost, i));
        game.ui.notify('百鬼行列穿过灯笼长街，少数灯笼妖会掉落圣露', 2.5);
      }
      const remaining = this.next + rules.duration - game.time;
      if (this.active && remaining <= 0) {
        script.clear();
        this.active = false;
        this.warned = false;
        this.status = null;
        this.next += rules.interval;
        game.ui.notify('百鬼行列结束', 1.6);
        return;
      }
      if (this.active) {
        this.status = { title: '百鬼行列', detail: '东街队列偶有圣露掉落', remaining };
        const beat = Math.floor((game.time - this.next) / 0.7);
        if (beat !== this.beat) {
          this.beat = beat;
          sound.stageEvent('impact',game,script.keys().next().value ?? {x:lanternRoad.x,z:lanternRoad.start});
          sound.tone(200, 95, 0.06, 0.07, 'triangle', 0.15);
          if (beat % 4 === 0) sound.tone(587, beat % 8 === 0 ? 880 : 698, 0.38, 0.065, 'sine');
        }
      } else if (this.warned)
        this.status = {
          title: '东街游行预警',
          detail: '留意小地图上的金色路线',
          remaining: this.next - game.time,
        };
    },
  };
}

function onBeastDefeated(beast, game) {
  game.encounter.script.delete(beast);
}

function yokaiModel(type, helpers, rage = false) {
  const { add, finish } = creatureParts(helpers);
  const coal = 0x352c45,
    lacquer = 0xb95557,
    gold = 0xfbd793,
    paper = 0xf1ddd5,
    fur = 0xe8cab7;
  const eye = (x, y, z, w = 0.12) => add('gem', gold, x, y, z, w, 0.1, w, 0, 0, 0, true);
  if (type === 0) {
    add('horn', lacquer, 0, 0.81, 0, 0.95, 0.6, 0.95);
    add('cylinder', paper, 0, 0.58, 0.02, 0.42, 0.34, 0.42);
    add('box', coal, 0, 0.27, 0.0, 0.12, 0.55, 0.14);
    add('box', coal, 0, 0.08, 0.1, 0.3, 0.1, 0.4);
    eye(0, 0.68, 0.27, 0.21);
  } else if (type === 1) {
    add('gem', coal, 0, 0.89, -0.15, 1.35, 1.25, 1.6);
    add('gem', lacquer, 0, 1.38, 0.34, 0.95, 1.1, 0.86);
    for (const s of [-1, 1]) {
      add('horn', paper, 0.33 * s, 1.85, 0.4, 0.2, 0.8, 0.22, 0, -0.28 * s);
      for (let k = 0; k < 4; k++)
        add('box', coal, s * (0.48 + 0.05 * k), 0.48, -0.64 + 0.32 * k, 0.15, 1.04, 0.14, 0, 0.5 * s);
      eye(s * 0.21, 1.52, 0.72);
    }
  } else if (type === 2) {
    add('cylinder', lacquer, 0, 0.89, 0, 1.53, 0.26, 1.53, Math.PI / 2);
    add('cylinder', coal, 0, 0.89, 0.15, 1.12, 0.1, 1.12, Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      add('horn', gold, Math.sin(a) * 0.66, 0.89 + Math.cos(a) * 0.66, 0, 0.21, 0.54, 0.28, 0, -a);
    }
    add('gem', paper, 0, 0.91, 0.26, 0.63, 0.85, 0.44);
    eye(-0.14, 1.02, 0.44);
    eye(0.14, 1.02, 0.44);
  } else {
    add('gem', fur, 0, 1.55, 0, 1.68, 2.48, 1.79);
    add('gem', paper, 0, 2.92, 0.39, 1.34, 1.19, 1.18);
    add('horn', coal, 0, 2.82, 1.01, 0.59, 0.71, 0.62, Math.PI / 2);
    for (const s of [-1, 1]) {
      add('horn', lacquer, s * 0.43, 3.59, 0.32, 0.47, 0.85, 0.49, 0, -s * 0.18);
      for (const z of [-0.49, 0.42]) add('box', coal, s * 0.51, 0.58, z, 0.36, 1.06, 0.42);
      eye(s * 0.31, 3.02, 0.88, 0.17);
    }
    const tails = rage ? 9 : 4;
    for (let i = 0; i < tails; i++) {
      const a = (i - (tails - 1) / 2) * 0.2;
      add(
        'gem',
        rage ? gold : fur,
        Math.sin(a) * 1.85,
        1.86 + Math.cos(a) * 0.61,
        -1.15,
        0.45,
        2.2,
        0.54,
        -0.68,
        -a,
      );
    }
  }
  return finish();
}

function createEnvironment(context) {
  const { THREE, dynamicMesh, setInstance, updateMesh, seededRandom, mapData, level } = context;
  const random = seededRandom(477),
    clouds = skySpecks(context, 100, 83, 0xffde9a, 0.095, 482);
  const petals = dynamicMesh(
    new THREE.CircleGeometry(1, 5),
    new THREE.MeshLambertMaterial({ color: 0xffbdce, side: THREE.DoubleSide }),
    110,
  );
  const lanterns = dynamicMesh(
    new THREE.SphereGeometry(0.5, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffbc61 }),
    CONFIG.parade.lanterns,
  );
  const mist = dynamicMesh(
    new THREE.IcosahedronGeometry(0.55, 1),
    new THREE.MeshBasicMaterial({
      color: 0xadb8cf,
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
    }),
    12,
  );
  const seeds = Array.from({ length: 110 }, () => [
    random() * 78 - 39,
    random() * 14,
    random() * 78 - 39,
    random() * 6,
  ]);
  return {
    update(t, playing, game) {
      for (let i = 0; i < seeds.length; i++) {
        const [x, y, z, a] = seeds[i];
        if (game.blast && i < 60) {
          const r = 0.6 + game.blast * (5 + y);
          setInstance(
            petals,
            i,
            level.gate.x + Math.cos(a) * r,
            1 + y * 0.24 + game.blast * 3,
            level.gate.z + Math.sin(a) * r,
            0.17,
            0.09,
            0.1,
            null,
            t + a,
            t * 2 + a,
            a,
          );
        } else
          setInstance(
            petals,
            i,
            x + Math.sin(t * 0.42 + a) * 1.8,
            (y + 14 - ((t * 0.74) % 14)) % 14,
            z + Math.cos(t * 0.23 + a),
            0.095,
            0.055,
            0.05,
            null,
            a + t * 0.68,
            t + a,
            a,
          );
      }
      updateMesh(petals, seeds.length);
      clouds.position.y = Math.sin(t * 0.55) * 0.39;
      mapData.seals.rotation.z = t * 0.15 + game.blast * 3.4;
      mapData.seals.visible = game.blast < 0.78;
      for (let i = 0; i < 12; i++) {
        const [x, y, z, a] = seeds[i];
        setInstance(mist, i, x + Math.sin(t * 0.09 + a) * 3, 0.22 + y * 0.024, z, 5 + y * 0.25, 0.4, 2.2, null, a);
      }
      updateMesh(mist, 12);
      let n = 0;
      for (const [b] of game.encounter?.script ?? [])
        if (b.active)
          setInstance(lanterns, n++, b.x, b.y + 1.45 + Math.sin(t * 3.4 + b.id) * 0.08, b.z, 0.58, 0.78, 0.58);
      updateMesh(lanterns, n);
    },
  };
}

export default {
  story:{type:'regions',sectors:[
    {name:'鸟居参道',at:[-8,18],entries:[[-15,15],[0,10]]},
    {name:'东侧河岸',at:[26,7],entries:[[29,5],[18,0]]},
  ]},
  config: CONFIG,
  grid: MAP_GRID,
  weaponSkin: 'sakura-night-town',
  pageTitle: '樱落夜町 | 第十二关',
  buildMap,
  createEncounter,
  createEnvironment,
  onBeastDefeated,
  loot,
  ammo,
  terrain: { ground: towerDeck.height },
  buildBeastModel: yokaiModel,
  buildRageModel: (h) => yokaiModel(3, h, true),
  background: 0x222b48,
  fog: 0x434763,
  palette: {
    projectile: 0xff956e,
    ichor: 0xd681a8,
    spark: 0xfbe29c,
    core: 0xffdfbc,
    rare: 0xddbcf6,
    blast: 0xffbde0,
    rift: {
      sealed: [0.72, 0.32, 0.85],
      ready: [1.1, 0.84, 1.15],
      rings: [0xffa3cb, 0xcfb4ff],
      particles: 0xffc4de,
      wave: 0xffddf1,
    },
  },
  area(x, z) {
    return z < -22
      ? '山顶古寺与五重塔'
      : x > 14
        ? '灯笼长街'
        : x < -15
          ? '竹林石灯小径'
          : z > 17
            ? '枯山水庭院'
            : '町中心神社';
  },
  minimap: {
    tiles: { '#': '#53546c', B: '#456558', H: '#9a6a64', T: '#c09e84', W: '#48748a', L: '#ac987c' },
    overlay({ ctx, px, pz, game }) {
      if (!game.encounter?.warned) return;
      ctx.strokeStyle = '#ffd787';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(px(lanternRoad.x), pz(lanternRoad.start));
      ctx.lineTo(px(lanternRoad.x), pz(lanternRoad.end));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#fff4ab';
      for (const b of game.encounter.script.keys()) if (b.active) ctx.fillRect(px(b.x) - 2, pz(b.z) - 2, 4, 4);
    },
  },
  text: {
    tag: '第十二关 / 百鬼夜行',
    title: '樱落夜町',
    enter: '穿过鸟居',
    enemy: '妖怪',
    bossName: '九尾狐',
    keyItem: '御神镜',
    portal: '神社结界',
    loot: '古町宝物',
    safe: '山脚鸟居安全区',
    rage: '九尾现形，群妖正向神社聚集',
    brief:
      '沿枯山水庭院进入古町。百鬼在东街结队游行，少数灯笼妖会掉落圣露。夺取九尾狐守护的御神镜，到神社正殿解除结界。',
    winBrief: '御神镜映亮符纸，花瓣与光屑冲散东街的夜雾。你带着古町宝物撤离。',
  },
};
