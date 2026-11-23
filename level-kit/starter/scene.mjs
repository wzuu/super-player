import { createGrid } from '@level-kit/world.mjs';

const CONFIG = {
  map: { cell: 4, fog: 0.016 },
  beasts: { population: 64 },
};

const MAP_GRID = [
  '#####################',
  '#.........G....A....#',
  '#.0.................#',
  '#.........A.....1...#',
  '#...###..B.B..###...#',
  '#..B.2...........B..#',
  '#.........O.........#',
  '#.....B....A.B....3.#',
  '#..A.....4.B.....A..#',
  '#.5.###.......###...#',
  '#.......B...B.6.....#',
  '#....7..............#',
  '#...###.......###...#',
  '#...B.....B....B8...#',
  '#......9....A.......#',
  '#.........P.........#',
  '#####################',
];

const loot = [], ammo = [];
const grid = createGrid(MAP_GRID, CONFIG.map.cell);
for (let row = 0; row < grid.rows; row++) {
  for (let column = 0; column < grid.columns; column++) {
    const tile = grid.cells[row][column];
    const x = grid.x(column), z = grid.z(row);
    if (tile === 'A') ammo.push([x, z]);
    if (/^[0-9]$/.test(tile)) loot.push([x, z, '样本箱 ' + (Number(tile) + 1), 100 + Number(tile) * 25]);
  }
}

function buildMap({ THREE, scene, GRID, level, StaticBatches, canvasTexture, brighter }) {
  const material = {
    wall: new THREE.MeshLambertMaterial({ color: 0x90a197 }),
    trim: new THREE.MeshLambertMaterial({ color: 0x404d45 }),
    marker: new THREE.MeshBasicMaterial(),
  };
  const city = new StaticBatches(material);
  const floorMap = canvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#485750'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#667c6d'; ctx.strokeRect(0, 0, w, h);
  }, true);
  floorMap.repeat.set(GRID.columns, GRID.rows);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(GRID.halfX * 2, GRID.halfZ * 2),
    new THREE.MeshLambertMaterial({ map: floorMap, color: 0xbcceb9 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  for (let row = 0; row < GRID.rows; row++) {
    for (let column = 0; column < GRID.columns; column++) {
      const tile = GRID.cells[row][column];
      const x = GRID.x(column), z = GRID.z(row);
      if (tile === '#' || tile === 'B') {
        const wall = tile === '#';
        const width = wall ? GRID.cell + 0.01 : 1.95;
        const depth = wall ? width : 0.86;
        const height = wall ? 2.7 : 0.9;
        city.add('box', 'wall', x, height / 2, z, width, height, depth, wall ? 0xc4cfb7 : 0x9ea280);
        city.add('box', 'trim', x, height, z, width, 0.11, depth, 0xc1c6a3);
        level.box(x, z, width, depth, 0, height);
      } else if (tile === 'P') {
        level.spawn.set(x, 0, z);
        city.add('cylinder', 'marker', x, 0.015, z, 1.75, 0.03, 1.75, brighter(0x518575));
      } else if (tile === 'O') {
        level.bossAnchor.set(x, 0, z);
        level.bossSpawn.set(x, 0, z);
        city.add('cylinder', 'trim', x, 0.035, z, 3.8, 0.07, 3.8, 0xe0ba8c);
      } else if (tile === 'G') {
        level.gate.set(x, 0, z);
      }
    }
  }
  city.flush();
  const sun = new THREE.DirectionalLight(0xffdbad, 1.35);
  sun.position.set(20, 32, -44);
  scene.add(sun, new THREE.HemisphereLight(0xdcebd2, 0x546155, 1.5));
}

export default {
  config: CONFIG,
  grid: MAP_GRID,
  loot,
  ammo,
  buildMap,
  background: 0x4b6255,
  fog: 0x53675b,
  palette: { projectile: 0xa2ec68, core: 0xffbd70, rare: 0x74f6b2 },
  minimap: { tiles: { '#': '#4b6558', B: '#757460' } },
  area(x, z) { return z > 18 ? '南侧起点' : z < -16 ? '北侧传送门' : '中央庭院'; },
  text: {
    tag: '场景模板 / 灰盒地图',
    title: '封锁庭院',
    enter: '进入庭院',
    keyItem: '封印石',
    bossName: '庭院守卫',
  },
};
