import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { createRifle, createRifleEnvironment } from '@level-kit/rifle-model.mjs';
import { rifleSkins } from '@level-kit/rifle-skins.mjs';
import { rifleRandom, rifleTexture } from '@level-kit/rifle-textures.mjs';

const atmosphere = {
  'rain-city': { kind: 'rain', color: '#a4daff', speed: -1.8, size: .082, opacity: .5 },
  'buried-tomb': { kind: 'dust', color: '#efc58d', speed: .12, size: .045, opacity: .65 },
  'polar-station': { kind: 'dust', color: '#f0fcff', speed: -.25, size: .059, opacity: .82 },
  'drowned-city': { kind: 'bubble', color: '#baffff', speed: .32, size: .087, opacity: .56 },
  'ember-fortress': { kind: 'dust', color: '#ff9864', speed: .35, size: .056, opacity: .63 },
  'derelict-station': { kind: 'dust', color: '#c6dcff', speed: 0, size: .036, opacity: .79 },
  'neon-undercity': { kind: 'rain', color: '#d09bff', speed: -1.6, size: .063, opacity: .55 },
  'jungle-temple': { kind: 'mist', color: '#a0cdbc', speed: .067, size: .59, opacity: .30 },
  'bloodmoon-castle': { kind: 'bat', color: '#bb5b72', speed: .055, size: .11, opacity: .73 },
  'sakura-night-town': { kind: 'petal', color: '#ffc7d2', speed: -.24, size: .066, opacity: .88 },
  'brass-factory': { kind: 'dust', color: '#aaa093', speed: .13, size: .042, opacity: .65 },
  'haunted-midway': { kind: 'confetti', color: '#ffffff', speed: -.18, size: .052, opacity: .8 },
};

function makeParticles({ kind, color, speed, size, opacity }) {
  const count = kind === 'mist' ? 23 : kind === 'bat' ? 24 : 160;
  const geometry = new THREE.BufferGeometry();
  const points = new Float32Array(count * 3), origin = new Float32Array(count * 3);
  const random = rifleRandom(3241);
  const bat = kind === 'bat';
  for (let i = 0; i < count; i++) {
    origin[3 * i] = random() * 5 - 2.5;
    origin[3 * i + 1] = random() * 2.4;
    origin[3 * i + 2] = random() * 3.2 - 2.8;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
  if (kind === 'confetti') {
    const palette = ['#f86aa7', '#68ddda', '#ffc75a'].map(tint => new THREE.Color(tint));
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) palette[i % palette.length].toArray(colors, i * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  const map = rifleTexture(THREE, 64, 64, ctx => {
    ctx.fillStyle = '#fff';
    if (kind === 'rain') {
      ctx.beginPath(); ctx.moveTo(47, 0); ctx.lineTo(48, 11);
      ctx.lineTo(20, 64); ctx.lineTo(17, 58); ctx.fill();
    } else if (kind === 'bubble') {
      ctx.strokeStyle = '#fffd'; ctx.lineWidth = 3; ctx.beginPath();
      ctx.arc(32, 32, 23, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(32, 32, 16, 3.7, 4.8); ctx.stroke();
    } else if (kind === 'petal') {
      ctx.beginPath(); ctx.moveTo(12, 49); ctx.quadraticCurveTo(11, 18, 40, 9);
      ctx.lineTo(39, 17); ctx.lineTo(52, 12); ctx.quadraticCurveTo(55, 35, 12, 49); ctx.fill();
    } else if (kind === 'confetti') {
      ctx.translate(32, 32); ctx.rotate(.5); ctx.fillRect(-9, -22, 18, 44);
    } else if (bat) {
      ctx.beginPath(); ctx.moveTo(3, 19); ctx.quadraticCurveTo(20, 14, 29, 30);
      ctx.lineTo(29, 23); ctx.lineTo(33, 29); ctx.lineTo(38, 23); ctx.lineTo(39, 30);
      ctx.quadraticCurveTo(49, 13, 62, 19); ctx.quadraticCurveTo(53, 23, 53, 38);
      ctx.quadraticCurveTo(46, 31, 33, 45); ctx.quadraticCurveTo(22, 31, 12, 38);
      ctx.quadraticCurveTo(14, 24, 3, 19); ctx.fill();
    } else {
      const fade = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
      fade.addColorStop(0, '#fff'); fade.addColorStop(kind === 'mist' ? .39 : .18, '#ffffff85');
      fade.addColorStop(1, '#fff0'); ctx.fillStyle = fade; ctx.fillRect(0, 0, 64, 64);
    }
  });
  const material = new THREE.PointsMaterial({ color, map, size, opacity, vertexColors: kind === 'confetti', transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Points(geometry, material);
  mesh.frustumCulled = false;
  return {
    mesh,
    update(t) {
      for (let i = 0; i < count; i++) {
        const index = i * 3;
        const drift = speed === 0 ? 0 : t * (bat ? .37 : speed * .24);
        points[index] = THREE.MathUtils.euclideanModulo(origin[index] + drift + 2.5, 5) - 2.5;
        points[index + 1] = -.31 + THREE.MathUtils.euclideanModulo(origin[index + 1] + t * speed, 2.4);
        points[index + 2] = origin[index + 2] + (speed ? Math.sin(t * .64 + i) * .09 : 0);
      }
      geometry.attributes.position.needsUpdate = true;
    },
    dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); map.dispose(); },
  };
}

export function createWeaponPreview(canvas, reset) {
  const stage = canvas.parentElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  const scene = new THREE.Scene();
  scene.environment = createRifleEnvironment();
  const camera = new THREE.PerspectiveCamera(36, 1, .06, 18);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minPolarAngle = .38; controls.maxPolarAngle = 1.75;
  const ambient = new THREE.AmbientLight(0xe2ecff, 1.27);
  const key = new THREE.DirectionalLight(0xffe4c5, 3.1);
  const fill = new THREE.DirectionalLight(0x80bfff, 1.9);
  const boilerLamp = new THREE.PointLight(0xffad57, 1.4, 4);
  boilerLamp.position.set(.65, .72, .6); boilerLamp.visible = false;
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -1.7, right: 1.7, top: 1.2, bottom: -1.25, near: .15, far: 8 });
  key.shadow.normalBias = .027;
  key.position.set(-1.6, 3.2, 2.1);
  fill.position.set(1.5, .9, -1.2);
  scene.add(ambient, key, fill, boilerLamp);

  // 收藏切换时只切换显隐。管道和铸铁窗架置于展台后方，让枪身轮廓保持清楚。
  const workshop = new THREE.Group();
  workshop.visible = false; scene.add(workshop);
  const iron = new THREE.MeshStandardMaterial({ color: '#343336', metalness: .59, roughness: .78 });
  const copper = new THREE.MeshStandardMaterial({ color: '#654637', metalness: .67, roughness: .67 });
  const pipe = new THREE.CylinderGeometry(1, 1, 1, 10);
  const girder = new THREE.BoxGeometry(1, 1, 1);
  const stamp = new THREE.Object3D();
  function scenery(geometry, material, parts) {
    const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
    parts.forEach(([x, y, z, w, h, d, angle = 0], i) => {
      stamp.position.set(x, y, z); stamp.scale.set(w, h, d); stamp.rotation.z = angle;
      stamp.updateMatrix(); mesh.setMatrixAt(i, stamp.matrix);
    });
    workshop.add(mesh);
  }
  scenery(pipe, copper, [
    [-1.75,.42,-1.55,.085,1.6,.085], [-1.48,.64,-1.64,.055,2.03,.055],
    [.15,1.16,-1.78,.065,4.15,.065,Math.PI/2], [.15,1.41,-1.8,.04,4.15,.04,Math.PI/2],
    [1.78,.36,-1.72,.12,1.48,.12], [1.78,.22,-1.72,.15,.065,.15], [1.78,.76,-1.72,.15,.065,.15],
  ]);
  scenery(girder, iron, [
    [-1.3,.55,-2.15,.09,2.1,.12], [1.13,.55,-2.15,.09,2.1,.12],
    [0,.86,-2.12,3.8,.07,.1], [0,.33,-2.12,3.8,.055,.1],
    [-.62,.61,-2.13,.048,1.17,.09,-1.10], [.43,.61,-2.13,.048,1.17,.09,1.10],
  ]);

  const deck = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({
    color: '#293339', roughness: .83, metalness: .13,
  }));
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = -.375;
  deck.receiveShadow = true;
  scene.add(deck);

  // 展示台光斑使用程序化纹理。深海预览额外移动焦散纹，霓雨预览启用平面反射。
  const poolTexture = rifleTexture(THREE, 128, 128, ctx => {
    const glow = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    glow.addColorStop(0, '#ffffffe8'); glow.addColorStop(.32, '#ffffff8c'); glow.addColorStop(1, '#fff0');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, 128, 128);
  });
  const pools = [];
  for (const x of [-1, 1]) {
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.7), new THREE.MeshBasicMaterial({
      map: poolTexture, transparent: true, opacity: .12, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x * .93, -.371, -.5);
    pools.push(pool); scene.add(pool);
  }
  const caustics = rifleTexture(THREE, 256, 256, ctx => {
    ctx.lineWidth = 2; ctx.shadowColor = '#b6ffff'; ctx.shadowBlur = 8;
    for (let i = -8; i < 22; i++) {
      ctx.beginPath();
      for (let x = 0; x <= 256; x += 3) {
        const y = i * 22 + Math.sin(x * .024 + i * .72) * 31 + Math.sin(x * .05 - i * .4) * 12;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = i % 3 ? '#68dddf94' : '#c8fff6cf'; ctx.stroke();
    }
  });
  caustics.wrapS = caustics.wrapT = THREE.RepeatWrapping;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), new THREE.MeshBasicMaterial({
    map: caustics, transparent: true, opacity: .38, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, -.369, -.4); water.visible = false;
  scene.add(water);
  const reflection = Reflector.ReflectorShader;
  const mirror = new Reflector(new THREE.PlaneGeometry(40, 40), {
    color: 0x686077, textureWidth: 512, textureHeight: 384, clipBias: .004,
    shader: {
      ...reflection,
      uniforms: { ...reflection.uniforms, ...THREE.UniformsLib.fog },
      vertexShader: reflection.vertexShader
        .replace('#include <common>', '#include <common>\n#include <fog_pars_vertex>')
        .replace('gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
          'vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );\ngl_Position = projectionMatrix * mvPosition;\n#include <fog_vertex>'),
      fragmentShader: reflection.fragmentShader
        .replace('#include <logdepthbuf_pars_fragment>', '#include <logdepthbuf_pars_fragment>\n#include <fog_pars_fragment>')
        .replace('#include <colorspace_fragment>', '#include <colorspace_fragment>\n#include <fog_fragment>'),
    },
  });
  mirror.material.fog = true;
  mirror.rotation.x = -Math.PI / 2; mirror.position.y = -.376;
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: .38, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -.374; shadow.receiveShadow = true; shadow.visible = false;
  scene.add(shadow);

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let model, id, frame = 0, active = false, time = 0, last = 0;
  let particles = [];
  const signals = {};
  const target = new THREE.Vector3(.205, -.025, 0);
  function resetView() {
    controls.target.copy(target);
    const distance = Math.max(1, 1.39 / camera.aspect);
    camera.position.set(.76, .61, 2.06).sub(target).multiplyScalar(distance).add(target);
    controls.minDistance = .92 * distance;
    controls.maxDistance = 4.1 * distance;
    controls.update();
  }
  reset.addEventListener('click', resetView);
  const offset = new THREE.Vector3();
  const orbit = new THREE.Spherical();
  canvas.addEventListener('keydown', event => {
    orbit.setFromVector3(offset.copy(camera.position).sub(controls.target));
    switch (event.key) {
      case 'ArrowLeft': orbit.theta -= .11; break;
      case 'ArrowRight': orbit.theta += .11; break;
      case 'ArrowUp': orbit.phi -= .09; break;
      case 'ArrowDown': orbit.phi += .09; break;
      case '+':
      case '=': orbit.radius *= .9; break;
      case '-': orbit.radius *= 1.11; break;
      default: return;
    }
    event.preventDefault();
    orbit.phi = THREE.MathUtils.clamp(orbit.phi, controls.minPolarAngle, controls.maxPolarAngle);
    orbit.radius = THREE.MathUtils.clamp(orbit.radius, controls.minDistance, controls.maxDistance);
    camera.position.copy(offset.setFromSpherical(orbit).add(controls.target));
    controls.update();
  });

  const observer = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (width < 1 || height < 1) return;
    renderer.setPixelRatio(Math.min(1.7, devicePixelRatio || 1));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (active) schedule();
  });
  observer.observe(stage);
  document.addEventListener('visibilitychange', schedule);

  function schedule() {
    if (active && !document.hidden) {
      if (!frame) frame = requestAnimationFrame(draw);
    } else {
      cancelAnimationFrame(frame); frame = 0; last = 0;
    }
  }

  function draw(now) {
    frame = 0;
    if (!active || document.hidden) return;
    if (last && !motion.matches) time += Math.min(.05, (now - last) / 1000);
    last = now;
    const cycle = time % 11;
    signals.bloodMoon = cycle > 6;
    signals.shot = cycle < 3 ? Number(time % .3 < .12) : 0;
    signals.pressure = Math.min(1, cycle / 3);
    signals.emp = cycle > 6 && cycle < 7.8;
    signals.empRecovery = cycle > 7.8 && cycle < 8.65 ? 8.65 - cycle : 0;
    model?.update(time, signals);
    particles.forEach(effect => effect.update(time));
    if (water.visible) {
      caustics.offset.set(time * .046, time * .027);
      water.material.opacity = .34 + Math.sin(time * 1.5) * .07;
      fill.intensity = 1.9 + Math.sin(time * 2.1) * .22;
    }
    if (id === 'shanhai-secret-realm') key.color.set(signals.bloodMoon ? '#ff9378' : rifleSkins[id].key);
    controls.enableDamping = !motion.matches;
    controls.update();
    renderer.render(scene, camera);
    schedule();
  }

  return {
    show(next, visible) {
      if (visible && id !== next) {
        model?.dispose();
        particles.forEach(effect => effect.dispose());
        id = next; time = 0; last = 0;
        const skin = rifleSkins[id];
        model = createRifle(id);
        scene.add(model.root);
        const effects = atmosphere[id] ? [atmosphere[id]] : [];
        boilerLamp.visible = id === 'brass-factory';
        workshop.visible = boilerLamp.visible;
        if (id === 'haunted-midway') effects.push({ kind: 'mist', color: '#a77eac', speed: .04, size: .47, opacity: .21 });
        if (id === 'bloodmoon-castle') {
          effects.push({ kind: 'mist', color: '#b53f64', speed: .039, size: .77, opacity: .32 });
        }
        particles = effects.map(makeParticles);
        for (const effect of particles) scene.add(effect.mesh);
        scene.background = new THREE.Color(skin.backdrop);
        scene.fog = new THREE.FogExp2(skin.backdrop, .22);
        deck.material.color.set(skin.backdrop);
        key.color.set(skin.key); fill.color.set(skin.fill);
        fill.intensity = 1.9;
        key.position.set(-1.65, id === 'buried-tomb' ? 1.2 : 3.2, 2.1);
        pools[0].material.color.set(skin.fill); pools[1].material.color.set(skin.key);
        water.visible = id === 'drowned-city';
        const reflective = id === 'neon-undercity';
        deck.visible = !reflective; shadow.visible = reflective;
        if (reflective) scene.add(mirror); else mirror.removeFromParent();
        const bounds = stage.getBoundingClientRect();
        if (bounds.height > 0) camera.aspect = bounds.width / bounds.height;
        camera.updateProjectionMatrix();
        resetView();
      }
      active = visible;
      schedule();
    },
  };
}
