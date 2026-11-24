import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rifleSkins, resolveRifleSkin } from '@level-kit/rifle-skins.mjs';
import { createShotgun } from '@level-kit/shotgun-model.mjs';
import { rifleFinish, rifleFrost, rifleRandom, rifleTexture, rifleWood } from '@level-kit/rifle-textures.mjs';

const tau = Math.PI * 2;

// 模型以 X 轴向前，展示台直接使用，第一人称旋转后沿相机的 -Z 轴。
export function createRifle(id, options = {}) {
  const rifle = makeRifle(id, options);
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 80;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({map:texture, toneMapped:false});
  const geometry = new THREE.PlaneGeometry(.21,.066);
  for (const side of [-1,1]) {
    const plate = new THREE.Mesh(geometry,material);
    plate.position.set(-.085,.04,.102*side);
    plate.rotation.y = side < 0 ? Math.PI : 0;
    rifle.root.add(plate);
  }
  let previous;
  rifle.setCount = count => {
    if (previous === count) return;
    previous = count;
    context.fillStyle='#122026'; context.fillRect(0,0,256,80);
    context.strokeStyle='#536b73'; context.lineWidth=4; context.strokeRect(3,3,250,74);
    context.fillStyle='#b8f4d9'; context.font='bold 54px monospace'; context.textAlign='center';
    context.fillText(String(count).padStart(5,'0'),128,59,236);
    texture.needsUpdate=true;
  };
  rifle.setCount(0);
  const dispose = rifle.dispose.bind(rifle);
  rifle.dispose = () => { dispose(); texture.dispose(); material.dispose(); };
  return rifle;
}

function makeRifle(id, { firstPerson = false } = {}) {
  id = resolveRifleSkin(id);
  const skin = rifleSkins[id];
  if (skin.category === '霰弹枪') return createShotgun(id,skin);
  const root = new THREE.Group();
  root.name = id;
  const groups = Object.fromEntries(['枪身', '枪管', '护木', '弹匣', '枪托'].map(name => {
    const group = new THREE.Group();
    group.name = name;
    root.add(group);
    return [name, group];
  }));
  const { 枪身: body, 枪管: barrel, 护木: guard, 弹匣: magazine, 枪托: stock } = groups;
  const muzzle = new THREE.Vector3(1.06, .046, 0);
  const batches = new Map();
  const materials = new Set();
  const textures = new Set();
  const animations = [];
  const standard = (color, options = {}) => material(THREE.MeshStandardMaterial, { color, ...options });
  const physical = (color, options = {}) => material(THREE.MeshPhysicalMaterial, { color, ...options });

  function material(Type, options) {
    const mat = new Type(options);
    materials.add(mat);
    for (const value of Object.values(options)) if (value?.isTexture) textures.add(value);
    return mat;
  }

  function add(group, mat, geo, x, y, z, rx = 0, ry = 0, rz = 0) {
    if (geo.index) {
      const expanded = geo.toNonIndexed();
      geo.dispose();
      geo = expanded;
    }
    geo.rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z);
    if (!batches.has(group)) batches.set(group, new Map());
    const byMaterial = batches.get(group);
    if (!byMaterial.has(mat)) byMaterial.set(mat, []);
    byMaterial.get(mat).push(geo);
  }

  const box = (group, mat, x, y, z, w, h, d, rz = 0) =>
    add(group, mat, new THREE.BoxGeometry(w, h, d), x, y, z, 0, 0, rz);
  const tube = (group, mat, x, y, z, radius, length, axis = 'x', top = radius, count = 12) =>
    add(group, mat, new THREE.CylinderGeometry(top, radius, length, count), x, y, z,
      axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? -Math.PI / 2 : 0);
  function plate(group, mat, points, thickness, x = 0, y = 0, z = 0, bevel = .006, mirror = false) {
    const shape = new THREE.Shape();
    points.forEach(([px, py], i) => i ? shape.lineTo(px, py) : shape.moveTo(px, py));
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: thickness, steps: 1, bevelEnabled: bevel > 0, bevelSegments: 1,
      bevelThickness: bevel, bevelSize: bevel, curveSegments: 1,
    });
    geo.computeBoundingBox();
    const { min, max } = geo.boundingBox;
    const positions = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const u = (positions.getX(i) - min.x) / (max.x - min.x);
      uv.setXY(i, mirror ? 1 - u : u, (positions.getY(i) - min.y) / (max.y - min.y));
    }
    add(group, mat, geo, x, y, z - thickness / 2);
  }

  function line(group, mat, x1, y1, x2, y2, z, thickness = .009, depth = .006) {
    box(group, mat, (x1 + x2) / 2, (y1 + y2) / 2, z,
      Math.hypot(x2 - x1, y2 - y1), thickness, depth, Math.atan2(y2 - y1, x2 - x1));
  }

  function glass(color, opacity = .27) {
    return physical(color, {
      transparent: true, opacity, depthWrite: false, metalness: .04,
      roughness: .13, clearcoat: .7, side: THREE.DoubleSide,
    });
  }

  const glow = (color, intensity = 1) => standard(color, { emissive: color, emissiveIntensity: intensity, roughness: .35 });
  function canister(color, casing, liquid = glow(color, .45)) {
    tube(magazine, glass(color), .12, -.155, 0, .057, .18, 'y');
    tube(magazine, liquid, .12, -.17, 0, .044, .13, 'y');
    for (const y of [-.063, -.242]) tube(magazine, casing, .12, y, 0, .063, .029, 'y');
    return liquid;
  }

  const finish = rifleFinish(THREE, id, skin);
  const surface = { ...finish, metalness: skin.metalness, roughness: skin.roughness };
  if (finish.normalMap) surface.normalScale = new THREE.Vector2(-.68, -.68);
  if (finish.emissiveMap) Object.assign(surface, { emissive: 0xffffff, emissiveIntensity: 1.4 });
  let enamel;
  if (id === 'jungle-temple') {
    // 第一人称武器独立清深度，折射缓冲里没有战场。用玉色透光和清漆反射表现玉质，
    // 避免战斗时为这一把枪额外绘制并生成透射纹理；收藏台保留真实透射。
    const optics = firstPerson
      ? { emissive: '#315d49', emissiveIntensity: .16, envMapIntensity: 1.08 }
      : { transmission: .3, thickness: .05 };
    enamel = physical(0xffffff, { ...surface, ...optics, clearcoat: .6, clearcoatRoughness: .2 });
  } else if (id === 'sakura-night-town') {
    enamel = physical(0xffffff, { ...surface, clearcoat: .8 });
  } else {
    enamel = standard(0xffffff, surface);
  }
  const accent = standard(skin.trim, { metalness: id === 'buried-tomb' ? 1 : .58, roughness: id === 'buried-tomb' ? .2 : .36 });
  const dark = standard(skin.dark, { roughness: .67, metalness: .25 });
  const hardware = standard('#353b43', { metalness: .65, roughness: .36 });
  const gasket = standard('#181d24', { roughness: .78 });
  const indicator = glow(skin.light, .75);
  const rail = standard(skin.base, { metalness: .52, roughness: .45 });

  const receiver = [[-.26, -.042], [-.23, .072], [-.13, .107], [.28, .107], [.357, .055],
    [.343, -.038], [.23, -.068], [.02, -.073], [-.07, -.047]];
  plate(body, dark, receiver, .129);
  for (const sign of [-1, 1]) plate(body, enamel, receiver, .012, 0, .009, sign * .07, .009, sign < 0);
  box(body, hardware, .01, .107, 0, .54, .039, .106);
  box(body, accent, .035, -.043, 0, .55, .018, .16);
  box(body, gasket, -.117, -.111, 0, .079, .138, .087, -.27);
  plate(body, hardware, [[-.158,-.063],[-.119,-.173],[-.059,-.16],[-.071,-.071]], .10);
  for (const z of [-.029, .029]) {
    line(body, hardware, -.098, -.083, -.071, -.129, z, .015, .012);
    line(body, hardware, -.071, -.129, .043, -.126, z, .015, .012);
    line(body, hardware, .043, -.126, .067, -.073, z, .015, .012);
  }

  const wood = ['shanhai-secret-realm', 'jungle-temple', 'haunted-midway'].includes(id)
    ? standard(0xffffff, { map: rifleWood(THREE, skin.dark), roughness: .77 }) : null;
  const frost = id === 'polar-station'
    ? standard(0xffffff, { map: rifleFrost(THREE, '#54768b'), roughness: .69 }) : null;
  const velvet = id === 'bloodmoon-castle'
    ? physical('#6b1b2e', { roughness: .92, sheen: 1, sheenColor: '#b74860', sheenRoughness: .88 }) : null;
  const pearl = id === 'drowned-city'
    ? physical(0xffffff, { map: finish.map, roughness: .26, clearcoat: 1, iridescence: .8, iridescenceIOR: 1.41 }) : null;

  const stockMat = wood ?? frost ?? velvet ?? dark;
  const stockShell = wood || frost || velvet
    ? [[-.61,.074],[-.30,.067],[-.226,.02],[-.28,-.008],[-.49,-.061],[-.59,-.091]]
    : [[-.61,.077],[-.34,.067],[-.23,.043],[-.27,-.011],[-.42,-.02],[-.57,-.104],[-.61,-.093]];
  plate(stock, stockMat, stockShell, .095);
  box(stock, gasket, -.611, -.009, 0, .039, .185, .122, -.12);
  box(stock, accent, -.581, .043, 0, .031, .077, .115, -.12);
  box(stock, stockMat, -.411, .074, 0, .29, .038, .126);
  for (const z of [-.052, .052]) {
    line(stock, accent, -.581, -.068, -.404, -.013, z, .011);
    line(stock, hardware, -.404, -.013, -.265, .015, z, .014);
  }

  tube(barrel, hardware, .588, .046, 0, .027, .78);
  tube(barrel, rail, .786, .046, 0, .034, .315);
  tube(barrel, accent, .934, .046, 0, .044, .045);
  tube(barrel, dark, .996, .046, 0, .045, .122, 'x', .049);
  tube(barrel, gasket, 1.058, .046, 0, .034, .004);
  tube(barrel, accent, 1.037, .046, 0, .049, .014);
  for (const x of [.96, .99, 1.02]) {
    for (const sign of [-1, 1]) box(barrel, gasket, x, .046, sign * .043, .013, .018, .009, -.27);
  }

  const handguard = [[.31,-.036],[.37,.072],[.646,.073],[.724,.041],[.721,-.021],[.668,-.061],[.387,-.058]];
  const guardMat = pearl ?? wood ?? frost ?? (id === 'ember-fortress' ? hardware : enamel);
  plate(guard, dark, handguard, .132);
  for (const sign of [-1, 1]) {
    plate(guard, guardMat, handguard, .015, 0, 0, sign * .073, .006, sign < 0);
    line(guard, accent, .386, .076, .679, .074, sign * .064, .013, .013);
    for (const x of [.373, .685]) tube(guard, accent, x, .003, sign * .087, .013, .009, 'z', .012, 8);
  }
  for (let i = 0; i < 9; i++) box(guard, hardware, .295 + i * .046, .094, 0, .022, .015, .103);

  box(magazine, hardware, .112, -.062, 0, .186, .044, .126);
  const standardMagazine = (inlay = accent) => {
    const magShell = [[.029,-.065],[.199,-.064],[.217,-.153],[.241,-.232],[.191,-.262],
      [.077,-.224],[.054,-.157]];
    plate(magazine, dark, magShell, .100, 0, 0, 0, .011);
    box(magazine, inlay, .156, -.229, 0, .165, .027, .115, -.27);
    for (const z of [-.058, .058]) {
      for (const x of [.089, .126, .163]) line(magazine, inlay, x, -.095, x + .036, -.195, z, .009);
    }
  };

  for (const z of [-.039, .039]) box(barrel, dark, .741, .112, z, .053, .053, .024, -.19);
  box(barrel, indicator, .739, .135, 0, .027, .012, .056);
  for (const z of [-.085, .085]) {
    for (const x of [-.223, .302]) tube(body, hardware, x, .008, z, .011, .010, 'z', .01, 8);
  }

  function pivot(parent, name, x, y, z) {
    const group = new THREE.Group();
    group.name = name;
    group.position.set(x, y, z);
    parent.add(group);
    return group;
  }

  // 小型粒子只分配一次，展示台与第一人称共用同一个动画。
  function motes(parent, mat, geo, count, position) {
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const particle = new THREE.Object3D();
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    parent.add(mesh);
    animations.push(time => {
      for (let i = 0; i < count; i++) {
        position(particle, i, time);
        particle.updateMatrix();
        mesh.setMatrixAt(i, particle.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  switch (id) {
    case 'sakura-night-town': {
      standardMagazine(accent);
      const cord = standard('#f4e3b8', { roughness: .89 });
      const petal = standard('#f7adbc', { roughness: .79, side: THREE.DoubleSide });
      for (let i = 0; i < 8; i++) {
        add(guard, cord, new THREE.TorusGeometry(.086, .009, 5, 14), .395 + i * .037, .008, 0, .14, Math.PI / 2, .16);
      }
      for (const x of [.41, .52, .63]) {
        box(guard, cord, x, -.058, .072, .022, .047, .004, -.42);
        box(guard, cord, x + .012, -.088, .072, .019, .031, .004, .36);
      }
      const talisman = standard('white', { map: rifleTexture(THREE, 64, 128, ctx => {
        ctx.fillStyle = '#e7c668'; ctx.fillRect(0, 0, 64, 128);
        ctx.strokeStyle = '#a22b21'; ctx.lineWidth = 3; ctx.strokeRect(5, 5, 54, 118);
        ctx.fillStyle = '#9a271d'; ctx.textAlign = 'center'; ctx.font = 'bold 35px serif';
        ctx.fillText('封', 32, 51); ctx.fillText('印', 32, 94);
      }) });
      for (const z of [-.087, .087]) {
        box(body, talisman, -.09, .025, z, .061, .132, .006, -.19);
        box(body, talisman, .16, .019, z, .056, .12, .006, .15);
        add(body, petal, new THREE.SphereGeometry(.014, 7, 4), .243, .063, z);
      }
      const bell = pivot(stock, '青铜铃', -.56, -.073, 0);
      add(bell, accent, new THREE.TorusGeometry(.02, .004, 5, 12), 0, -.017, 0);
      add(bell, accent, new THREE.SphereGeometry(.037, 12, 8), 0, -.065, 0);
      box(bell, dark, 0, -.079, .032, .037, .005, .007);
      for (const z of [-.063, .063]) {
        add(magazine, indicator, new THREE.SphereGeometry(.041, 12, 8), .124, -.144, z);
        for (const y of [-.179, -.112]) box(magazine, dark, .124, y, z, .059, .008, .05);
      }
      motes(barrel, petal, new THREE.SphereGeometry(.009, 5, 3), 18, (p, i, t) => {
        const angle = i * 2.4 + t * .8;
        if (i < 9) p.position.set(1.075, .046 + Math.cos(angle) * .062, Math.sin(angle) * .062);
        else p.position.set(-.38 + (i % 8) * .14, .27 - ((t * .1 + i * .137) % .34), Math.sin(angle) * .12);
        p.rotation.set(t + i, angle, angle); p.scale.set(1.2, .35, .76);
      });
      animations.push(t => {
        bell.rotation.z = .13 * Math.sin(2.1 * t);
        indicator.emissiveIntensity = 1.1 + .35 * Math.sin(5.3 * t);
      });
      break;
    }
    case 'brass-factory': {
      standardMagazine(rail);
      const copper = standard('#ad7045', { metalness: .86, roughness: .43 });
      const steam = standard('#d6d5cc', { transparent: true, opacity: .23, depthWrite: false });
      for (const z of [-.091, .091]) {
        for (const y of [-.028, .012, .052]) tube(guard, copper, .537, y, z, .014, .314);
        for (const x of [.39, .68]) for (const y of [-.033, .05]) {
          add(guard, accent, new THREE.SphereGeometry(.014, 7, 5), x, y, z);
        }
      }
      const valve = pivot(guard, '蒸汽阀', .625, .113, 0);
      add(valve, copper, new THREE.TorusGeometry(.043, .009, 7, 16), 0, .023, 0, Math.PI / 2);
      for (const angle of [0, Math.PI / 2]) add(valve, accent, new THREE.BoxGeometry(.084, .008, .01), 0, .023, 0, 0, angle);
      function gear(parent, x, y, z, radius, teeth, rate) {
        const cog = pivot(parent, '齿轮', x, y, z);
        tube(cog, accent, 0, 0, 0, radius, .018, 'z');
        tube(cog, hardware, 0, 0, .012, radius * .34, .014, 'z');
        for (let i = 0; i < teeth; i++) {
          const angle = tau * i / teeth;
          box(cog, copper, radius * Math.cos(angle), radius * Math.sin(angle), 0, radius * .42, radius * .26, .019, angle);
        }
        animations.push(t => { cog.rotation.z = t * rate; });
      }
      gear(body, -.11, .029, .091, .052, 12, .73);
      gear(body, -.025, .029, .091, .031, 8, -1.1);
      const dial = standard('white', { map: rifleTexture(THREE, 128, 128, ctx => {
        ctx.fillStyle = '#dfcea2'; ctx.fillRect(0, 0, 128, 128);
        ctx.translate(64, 64); ctx.lineWidth = 4;
        for (let i = 0; i <= 10; i++) {
          const a = 2.4 + i * .46;
          ctx.strokeStyle = i > 7 ? '#a03429' : '#493a2a'; ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 39, Math.sin(a) * 39); ctx.lineTo(Math.cos(a) * 52, Math.sin(a) * 52); ctx.stroke();
        }
        ctx.fillStyle = '#4d4236'; ctx.font = '18px serif'; ctx.fillText('BAR', -17, 27);
      }) });
      tube(body, copper, .22, .035, .09, .056, .043, 'z');
      add(body, dial, new THREE.CircleGeometry(.05, 32), .22, .035, .113);
      const needle = pivot(body, '压力指针', .22, .035, .115);
      box(needle, dark, 0, .021, 0, .006, .048, .004);
      const key = pivot(magazine, '上弦钥匙', .124, -.157, .063);
      tube(key, copper, 0, 0, .017, .011, .041, 'z');
      for (const x of [-.019, .019]) add(key, accent, new THREE.TorusGeometry(.019, .005, 6, 12), x, 0, .041);
      motes(barrel, steam, new THREE.IcosahedronGeometry(.019, 0), 12, (p, i, t) => {
        const phase = (t * .88 + i / 6) % 1, nozzle = i < 6;
        p.position.set((nozzle ? 1.055 : .625) + (nozzle ? .12 : .02) * phase, (nozzle ? .046 : .15) + phase * .19, Math.sin(i + t) * .018);
        p.scale.setScalar(Math.sin(phase * Math.PI) * (1 + phase));
      });
      animations.push((t, e) => {
        key.rotation.z = -.55 * t;
        needle.rotation.z = 2.16 - 4.32 * (e.pressure ?? 0) + .13 * (e.shot ?? 0);
      });
      break;
    }
    case 'haunted-midway': {
      standardMagazine(accent);
      const bands = ['#ef679d', '#53cccc', '#f5cc69'].map(color => glow(color, .6));
      const ticket = standard('white', { map: rifleTexture(THREE, 256, 100, ctx => {
        ctx.fillStyle = '#d1b787'; ctx.fillRect(0, 0, 256, 100);
        ctx.strokeStyle = '#845038'; ctx.lineWidth = 4; ctx.setLineDash([4, 4]); ctx.strokeRect(7, 8, 242, 84);
        ctx.fillStyle = '#57382e'; ctx.font = 'bold 22px serif'; ctx.fillText('MIDNIGHT FAIR', 30, 45);
        ctx.font = '17px monospace'; ctx.fillText('ADMIT ONE   014', 43, 72);
      }) });
      for (const z of [-.09, .09]) box(body, ticket, -.027, .026, z, .186, .079, .004, -.11);
      const ribbons = bands.map((color, i) => {
        const loop = pivot(guard, '彩带', .42 + i * .095, -.035, .079);
        add(guard, color, new THREE.TorusGeometry(.088, .007, 5, 16), .42 + i * .095, .005, 0, .2, 1.34);
        plate(loop, color, [[0,0],[.025,0],[.052,-.039],[.032,-.077],[.047,-.11],[.018,-.079],[.031,-.043]], .003);
        return loop;
      });
      const balloon = pivot(stock, '气球', -.47, .055, .065);
      for (const [i, color] of bands.entries()) {
        const x = (i - 1) * .045;
        line(balloon, dark, 0, 0, x, .065, 0, .004);
        add(balloon, color, new THREE.SphereGeometry(.034, 12, 8), x, .09 + (i % 2) * .028, 0);
      }
      box(magazine, wood, .126, -.148, 0, .172, .113, .139);
      const crank = pivot(magazine, '八音盒曲柄', .131, -.148, .084);
      box(crank, accent, .023, 0, 0, .056, .012, .012);
      tube(crank, dark, .046, 0, .013, .012, .032, 'z');
      const doll = pivot(stock, '旧玩偶', -.547, -.064, .014);
      line(doll, dark, 0, 0, 0, -.039, 0, .005);
      add(doll, wood, new THREE.SphereGeometry(.021, 10, 6), 0, -.058, 0);
      box(doll, bands[0], 0, -.096, 0, .039, .052, .024, .08);
      for (const sign of [-1, 1]) {
        line(doll, wood, sign * .015, -.082, sign * .031, -.103, .001, .009);
        line(doll, wood, sign * .011, -.115, sign * .017, -.147, .001, .011);
      }
      for (let i = 0; i < 10; i++) tube(guard, bands[i % 3], .384 + i * .031, .051, .093, .008, .008, 'z');
      let lastCycle = 0, crankAngle = 0;
      animations.push((t, e) => {
        const dt = Math.max(0, Math.min(.05, t - lastCycle)); lastCycle = t;
        crankAngle += dt * (e.shot ?? 0) * 20; crank.rotation.z = crankAngle;
        balloon.position.y = .055 + Math.sin(t * 1.8) * .009;
        doll.rotation.z = Math.sin(t * 2.3) * .15;
        ribbons.forEach((r, i) => { r.rotation.x = Math.sin(t * 3 + i) * .24; });
        bands.forEach((m, i) => { m.emissiveIntensity = .5 + .85 * Math.sin(t * 2.1 + i) ** 2; });
      });
      break;
    }
    case 'underground-lab': {
      canister(skin.light, hardware);
      const alarm = glow('#ff252f', 2);
      for (const z of [-.088, .088]) tube(body, alarm, .23, .057, z, .022, .018, 'z');
      animations.push(t => { alarm.emissiveIntensity = t % 1.15 < .23 ? 2.9 : .36; });
      break;
    }
    case 'shanhai-secret-realm': {
      standardMagazine(standard('#82704a', { metalness: .7, roughness: .55 }));
      for (const z of [-.091, .091]) {
        for (let i = 0; i < 5; i++) {
          const x = .4 + i * .055;
          line(guard, indicator, x, -.025, x + .025, .021, z);
          line(guard, indicator, x + .025, .021, x + .037, .003, z);
        }
      }
      animations.push((t, event) => {
        indicator.emissiveIntensity = .65 + .65 * Math.sin(t * 2.35) ** 2 + 2.4 * Number(Boolean(event.bloodMoon));
      });
      break;
    }
    case 'rain-city': {
      standardMagazine(hardware);
      const wrap = standard('#7b7973', { roughness: .89 });
      for (let i = 0; i < 5; i++) {
        box(body, wrap, -.12 + i * .004, -.08 - i * .019, 0, .088, .014, .096, -.24);
        box(guard, wrap, .486 + i * .024, -.015, 0, .018, .113, .175, -.14);
      }
      const drops = physical('#9cc8dc', { roughness: .1, clearcoat: 1, transparent: true, opacity: .62, depthWrite: false });
      const rand = rifleRandom(175);
      for (let i = 0; i < 32; i++) {
        tube(body, drops, -.209 + rand() * .51, -.017 + rand() * .092, i % 2 ? .09 : -.09, .002 + rand() * .004, .004, 'z', 0, 6);
      }
      break;
    }
    case 'buried-tomb': {
      const lapis = physical('#1744a3', { roughness: .43, clearcoat: .55 });
      standardMagazine(lapis);
      for (const z of [-.086, .086]) line(body, accent, -.216, .076, .28, .076, z, .009);
      break;
    }
    case 'polar-station': {
      canister(skin.light, accent, glass('#78bded', .72));
      tube(barrel, frost, .792, .046, 0, .045, .252);
      for (const x of [.687, .742, .842, .903]) {
        tube(barrel, hardware, x, .046, 0, .048, .014);
        for (const z of [-.033, .033]) tube(barrel, glass('#b9e8fd', .68), x, -.01, z, 0, .039, 'y', .011, 5);
      }
      break;
    }
    case 'drowned-city': {
      canister(skin.light, pearl);
      for (const z of [-.058, .058]) {
        for (let i = 0; i < 4; i++) {
          const x = .074 + i * .019, y = -.176 + Math.sin(i * 2.1) * .024;
          line(magazine, indicator, x, y, x + .019, -.176 + Math.sin((i + 1) * 2.1) * .024, z, .005);
        }
      }
      animations.push(t => { indicator.emissiveIntensity = .72 + 2.05 * Math.max(0, Math.sin(t * 11) * Math.cos(t * 4)); });
      break;
    }
    case 'ember-fortress': {
      standardMagazine(accent);
      const hammered = standard('#68504a', { roughness: .84, metalness: .47 });
      const rand = rifleRandom(1343);
      for (const z of [-.088, .088]) {
        line(guard, indicator, .401, -.03, .657, -.03, z, .007);
        for (let i = 0; i < 12; i++) tube(guard, hammered, .398 + i * .023, -.004 + rand() * .054, z,
          .004 + rand() * .009, .007, 'z', .005, 7);
      }
      animations.push((t, event) => {
        const tide = event.tide ?? .5 + .5 * Math.sin(t * 1.22);
        enamel.emissiveIntensity = indicator.emissiveIntensity = .75 + tide * (1.1 + .7 * Math.sin(t * 2.5) ** 2);
      });
      break;
    }
    case 'derelict-station': {
      standardMagazine(indicator);
      const windowGlass = glass('#60bdf5', .3);
      for (const z of [-.097, .097]) {
        box(guard, gasket, .535, .015, z * .96, .256, .068, .02);
        for (let i = 0; i < 7; i++) box(guard, indicator, .438 + i * .03, .016, z * 1.08, .021, .034, .01);
        box(guard, windowGlass, .535, .015, z * 1.16, .256, .067, .01);
        for (const x of [-.189, -.119, -.049]) tube(body, hardware, x, .047, z * .88, .018, .012, 'z');
      }
      break;
    }
    case 'neon-undercity': {
      const violet = glow('#ff298e', 1.5);
      standardMagazine(violet);
      const segments = Array.from({ length: 9 }, (_, i) => glow(i % 2 ? '#2afcec' : '#20bfd6', 1));
      for (const z of [-.092, .092]) {
        for (let i = 0; i < segments.length; i++) {
          const x = -.186 + i * .088, y = i < 6 ? .075 : .05;
          line(i < 6 ? body : guard, segments[i], x, y, x + .075, y, z);
        }
        line(body, violet, -.225, -.017, .24, -.046, z, .012);
        line(guard, violet, .39, -.047, .681, -.047, z, .012);
        plate(guard, physical('#8d4279', { map: finish.map, roughness: .25, iridescence: .63, clearcoat: .65 }),
          [[.435,-.013],[.61,-.013],[.644,.012],[.644,.044],[.435,.044]], .004, 0, 0, z, 0, z < 0);
      }
      animations.push((t, event) => {
        const restart = event.empRecovery ?? 0;
        const power = event.emp ? 0 : restart > 0 ? .33 + .67 * Number(Math.sin(t * 39) > 0) : 1;
        segments.forEach((light, i) => {
          light.emissiveIntensity = power * (.34 + 2.25 * Math.max(0, Math.sin(t * 4 - i * .74)) ** 2);
          light.color.setScalar(power ? .31 : .025);
        });
        indicator.emissiveIntensity = violet.emissiveIntensity = power * 1.62;
        indicator.color.setScalar(power ? .32 : .025);
        violet.color.setScalar(power ? .32 : .025);
      });
      break;
    }
    case 'jungle-temple': {
      standardMagazine(accent);
      const vine = standard('#718744', { roughness: .82 });
      for (const z of [-.085, .085]) {
        for (let i = 0; i < 4; i++) line(guard, vine, .397 + i * .071, -.04, .44 + i * .071, .072, z, .013);
        tube(body, accent, .254, .02, z, .039, .014, 'z');
        for (let i = 0; i < 8; i++) {
          const a = i * tau / 8;
          tube(body, accent, .254 + .05 * Math.cos(a), .02 + .05 * Math.sin(a), z, .006, .01, 'z');
        }
      }
      for (const [i, color] of ['#f1ad42', '#4bc4a5', '#d35d3d'].entries()) {
        const feather = standard(color, { roughness: .81 });
        const x = -.3 + i * .027;
        plate(stock, feather, [[x,.001],[x-.038,-.092],[x-.02,-.129],[x+.004,-.086]], .005, 0, 0, -.062, .002);
      }
      break;
    }
    case 'bloodmoon-castle': {
      canister(skin.light, accent, glow('#eb143a', .6));
      const arches = [[-.068,.006],[-.046,.034],[-.025,.006],[-.002,-.008],[.022,.006],[.046,.034],
        [.068,.006],[.059,-.031],[.031,-.012],[0,-.039],[-.031,-.012],[-.059,-.03]];
      for (const z of [-.092, .092]) {
        plate(guard, accent, arches, .008, .527, .003, z, .002);
        line(guard, accent, .656, -.026, .656, .052, z, .009);
        line(guard, accent, .638, .029, .675, .029, z, .009);
      }
      break;
    }
  }

  // 每个分组按材质合批，弹匣仍可独立参与换弹动画。
  for (const [group, byMaterial] of batches) {
    for (const [mat, parts] of byMaterial) {
      const geometry = parts.length > 1 ? mergeGeometries(parts) : parts[0];
      if (parts.length > 1) parts.forEach(part => part.dispose());
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.castShadow = !mat.transparent && !(mat.transmission > 0);
      mesh.receiveShadow = !mat.transparent;
      group.add(mesh);
    }
  }

  return {
    root, magazine, muzzle,
    update(time, signals = {}) { for (const animate of animations) animate(time, signals); },
    dispose() {
      root.removeFromParent();
      root.traverse(object => {
        if (object.isInstancedMesh) object.dispose();
        if (object.isMesh) object.geometry.dispose();
      });
      materials.forEach(mat => mat.dispose());
      textures.forEach(texture => texture.dispose());
    },
  };
}

// 六面反射环境也由 Canvas 生成。明暗不同的区域让抛光金属和湿表面显示轮廓。
export function createRifleEnvironment() {
  const faces = ['#c7daee', '#7690ab', '#f7e8d2', '#4c4953', '#adbfcc', '#666c7a'].map((color, i) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const light = ctx.createLinearGradient(0, 0, 54, 64);
    light.addColorStop(0, color); light.addColorStop(.38, '#536079'); light.addColorStop(1, '#252b35');
    ctx.fillStyle = light; ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#ffffffa8';
    ctx.fillRect(i % 2 ? 9 : 30, 6, 9, 48);
    return canvas;
  });
  const environment = new THREE.CubeTexture(faces);
  environment.colorSpace = THREE.SRGBColorSpace;
  environment.needsUpdate = true;
  return environment;
}
