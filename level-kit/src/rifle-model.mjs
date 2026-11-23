import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rifleSkins, resolveRifleSkin } from '@level-kit/rifle-skins.mjs';
import { rifleFinish, rifleFrost, rifleRandom, rifleWood } from '@level-kit/rifle-textures.mjs';

const tau = Math.PI * 2;

// 模型以 X 轴向前，展示台直接使用，第一人称旋转后沿相机的 -Z 轴。
export function createRifle(id) {
  id = resolveRifleSkin(id);
  const skin = rifleSkins[id];
  const root = new THREE.Group();
  root.name = id;
  const groups = Object.fromEntries(['枪身', '枪管', '护木', '弹匣', '枪托', '瞄具'].map(name => {
    const group = new THREE.Group();
    group.name = name;
    root.add(group);
    return [name, group];
  }));
  const { 枪身: body, 枪管: barrel, 护木: guard, 弹匣: magazine, 枪托: stock, 瞄具: sight } = groups;
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
  const enamel = id === 'jungle-temple'
    ? physical(0xffffff, { ...surface, transmission: .3, thickness: .05, clearcoat: .6, clearcoatRoughness: .2 })
    : standard(0xffffff, surface);
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

  const wood = ['shanhai-secret-realm', 'jungle-temple'].includes(id)
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

  box(sight, hardware, .066, .138, 0, .192, .026, .102);
  const sightPosts = (mat, y = .185) => {
    for (const z of [-.046, .046]) box(sight, mat, .046, y, z, .073, .079, .023, -.09);
    box(sight, mat, .046, y + .042, 0, .073, .017, .115, -.09);
  };
  sightPosts(accent);
  for (const z of [-.039, .039]) box(sight, dark, .741, .112, z, .053, .053, .024, -.19);
  box(sight, indicator, .739, .135, 0, .027, .012, .056);
  for (const z of [-.085, .085]) {
    for (const x of [-.223, .302]) tube(body, hardware, x, .008, z, .011, .010, 'z', .01, 8);
  }

  switch (id) {
    case 'underground-lab': {
      canister(skin.light, hardware);
      const alarm = glow('#ff252f', 2);
      for (const z of [-.063, .063]) tube(sight, alarm, .053, .18, z, .022, .018, 'z');
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
      const wetOptic = physical('#7196b7', { roughness: .13, clearcoat: 1 });
      box(sight, wetOptic, .046, .235, 0, .071, .013, .097);
      const rand = rifleRandom(175);
      for (let i = 0; i < 32; i++) {
        tube(body, drops, -.209 + rand() * .51, -.017 + rand() * .092, i % 2 ? .09 : -.09, .002 + rand() * .004, .004, 'z', 0, 6);
      }
      break;
    }
    case 'buried-tomb': {
      const lapis = physical('#1744a3', { roughness: .43, clearcoat: .55 });
      standardMagazine(lapis);
      for (const z of [-.06, .06]) tube(sight, lapis, .047, .186, z, .025, .009, 'z');
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
          line(sight, indicator, .037 + i * .005, .154 + i * .014, .052, .164 + i * .014, z, .004);
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
      const hologram = physical('#54caff', {
        emissive: '#2178f1', emissiveIntensity: 1.5, transparent: true, opacity: .46, depthWrite: false,
      });
      box(sight, hologram, .041, .19, 0, .012, .059, .066);
      tube(sight, indicator, .048, .192, 0, .007, .014);
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
      root.traverse(object => { if (object.isMesh) object.geometry.dispose(); });
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
