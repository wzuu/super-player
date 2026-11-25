import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { createRifleEnvironment } from '@level-kit/rifle-model.mjs';
import { CONFIG } from './config.mjs';
import { taotie, hydra, chaos, taowu } from './mythic.mjs';
import { bone, lava, mech, shadow } from './constructs.mjs';
import { group, mesh, metal, texture, disposeObject } from './sculpt.mjs';

const sculptors = { taotie, hydra, chaos, taowu, bone, lava, mech, shadow };

function makePlinth(entry, budget) {
  const base = group(),
    water = entry.id === 'hydra';
  const surface = entry.id === 'shadow' ? new T.MeshBasicMaterial({ color: 0 }) : metal(entry.floor, 0.18);
  if (entry.id === 'taowu') {
    surface.map = texture((ctx, n) => {
      ctx.fillStyle = '#eaf5ff';
      ctx.fillRect(0, 0, n, n);
      for (let i = 0; i < 480; i++) {
        ctx.fillStyle = i % 3 ? '#b7d0dc' : '#ffffff';
        ctx.fillRect((i * 71) % n, (i * i * 13 + i * 7) % n, 2 + (i % 3), 1);
      }
    });
    surface.map.repeat.set(4, 4);
  }
  mesh(base, new T.CylinderGeometry(2.22, 2.29, 0.17, 72), surface, 0, -0.13, 0);
  if (water && budget.reflection) {
    const mirror = new Reflector(new T.CircleGeometry(2.19, 72), {
      color: 0x749ca7,
      textureWidth: budget.reflection,
      textureHeight: budget.reflection,
      clipBias: 0.003,
    });
    mirror.rotation.x = -Math.PI / 2;
    mirror.position.y = -0.025;
    base.add(mirror);
  }
  if (water) {
    const ripple = metal('#579aa2', 0.35, 0.2);
    ripple.transparent = true;
    ripple.opacity = 0.38;
    ripple.depthWrite = false;
    for (let i = 0; i < 4; i++) {
      const ring = mesh(base, new T.TorusGeometry(1.12 + i * 0.27, 0.009, 5, 80), ripple, 0, -0.017, 0);
      ring.rotation.x = -Math.PI / 2;
      ring.scale.y = 0.84;
    }
  }
  if (entry.id !== 'shadow') {
    const rim = mesh(
      base,
      new T.TorusGeometry(2.16, 0.014, 6, 80),
      metal(entry.palette[1], 0.55),
      0,
      -0.038,
      0,
    );
    rim.rotation.x = -Math.PI / 2;
  }
  return base;
}

function button(text, fn) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.onclick = fn;
  return b;
}

export function createGallery(dialog) {
  const el = (id) => dialog.querySelector('#gallery-' + id);
  const canvas = el('canvas'),
    stage = canvas.parentElement;
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.toneMapping = T.ACESFilmicToneMapping;
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(CONFIG.camera.fov, 1, 0.05, 70);
  scene.environment = createRifleEnvironment();
  const key = new T.DirectionalLight(0xffe3bd, 3.1),
    rim = new T.DirectionalLight(0xb0e2ff, 3);
  key.position.set(3, 6, 4);
  rim.position.set(-3, 3, -4);
  scene.add(key, rim, new T.HemisphereLight(0xe3f3ff, 0x87736c, 1.45));
  const orbit = new OrbitControls(camera, canvas);
  orbit.enablePan = false;
  orbit.maxPolarAngle = Math.PI * 0.49;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const ray = new T.Raycaster(),
    pointer = new T.Vector2(),
    hover = new T.Vector2(5, 5);
  const headPosition = new T.Vector3();
  let model,
    plinth,
    entry,
    budget,
    paused = false,
    last = 0,
    frame = 0,
    time = 0,
    look = 0;
  let action = '',
    started = 0,
    hp = 0;
  const highlighted = [];
  function clearHighlight() {
    for (const [object, original] of highlighted) {
      object.material.dispose();
      object.material = original;
    }
    highlighted.length = 0;
  }
  function selectPart(id) {
    clearHighlight();
    model.parts[id].traverse((node) => {
      // 子部位可以独立选择，因此父部位高亮不覆盖子部位。
      if (!node.isMesh || partOf(node) !== id) return;
      const original = node.material,
        selected = original.clone();
      if (original.uniforms?.highlight) {
        selected.uniforms = { ...original.uniforms, highlight: { value: 1 } };
      } else if (selected.emissive) {
        selected.emissive.set('#40dcb0');
        selected.emissiveIntensity = 0.76;
      } else selected.color?.set('#88f9cd');
      highlighted.push([node, original]);
      node.material = selected;
    });
    el('note').textContent = entry.parts[id].join(' · ');
    for (const b of el('parts').children) b.setAttribute('aria-pressed', String(b.dataset.part === id));
  }
  function partOf(node) {
    for (let object = node; object; object = object.parent)
      if (object.userData.part) return object.userData.part;
    return '';
  }
  function resetCamera() {
    if (!entry) return;
    const { azimuth, elevation, minZoom, maxZoom } = CONFIG.camera;
    const distance = (entry.height * CONFIG.camera.framing) / Math.min(1, camera.aspect * 0.86);
    orbit.target.set(0, entry.height * 0.42, 0);
    camera.position
      .setFromSphericalCoords(
        distance,
        Math.PI / 2 - elevation,
        CONFIG.camera.viewpoints[entry.id] ?? azimuth,
      )
      .add(orbit.target);
    orbit.minDistance = distance * minZoom;
    orbit.maxDistance = distance * maxZoom;
    orbit.update();
  }
  function resize() {
    if (!dialog.open || !entry || !canvas.clientWidth || !canvas.clientHeight) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio, budget.dpr));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);
  function clearModel() {
    clearHighlight();
    if (model) disposeObject(model.root);
    if (plinth) disposeObject(plinth);
    model = plinth = entry = null;
    renderer.renderLists.dispose();
  }
  function updateHealth() {
    el('hp').max = CONFIG.boss.health;
    el('hp').value = hp;
    el('health').textContent = hp + ' / ' + CONFIG.boss.health;
  }
  function updatePause() {
    el('pause').textContent = paused ? '继续动作' : '暂停动作';
    el('pause').setAttribute('aria-pressed', String(paused));
  }
  function play(id) {
    action = id;
    started = time;
    paused = false;
    updatePause();
    if (id === 'hit') {
      hp = Math.max(0, hp - CONFIG.boss.hit);
      updateHealth();
    }
  }
  function choose(next) {
    clearModel();
    entry = next;
    time = last = look = 0;
    action = '';
    paused = motion.matches;
    hover.set(5, 5);
    el('note').textContent = '选择模型或列表中的部位。';
    model = sculptors[entry.id](entry, budget);
    plinth = makePlinth(entry, budget);
    model.animate(0, 0, -1, 0, '');
    // 模型本地坐标供关节动画使用，外层按目录尺寸统一定标。
    const bounds = new T.Box3().setFromObject(model.root);
    const stand = group();
    stand.add(model.root);
    stand.scale.setScalar(entry.height / (bounds.max.y - bounds.min.y));
    model.root = stand;
    scene.add(stand, plinth);
    scene.background = new T.Color(entry.id === 'shadow' ? '#000000' : entry.floor).multiplyScalar(0.36);
    for (const [id, part] of Object.entries(model.parts)) part.userData.part = id;
    el('parts').replaceChildren(
      ...Object.entries(entry.parts).map(([id, [name]]) => {
        const b = button(name, () => selectPart(id));
        b.dataset.part = id;
        b.setAttribute('aria-pressed', 'false');
        return b;
      }),
    );
    for (const b of el('catalog').children) b.setAttribute('aria-pressed', String(b.dataset.id === entry.id));
    el('name').textContent = entry.name;
    el('replay').textContent = '重播 · ' + entry.action;
    const boss = entry.id === CONFIG.boss.id;
    el('boss').hidden = !boss;
    el('shake-label').hidden = !boss;
    hp = CONFIG.boss.health;
    updateHealth();
    updatePause();
    resize();
    resetCamera();
    schedule();
  }
  el('catalog').replaceChildren(
    ...CONFIG.exhibits.map((item) => {
      const b = button(item.name, () => choose(item));
      b.dataset.id = item.id;
      return b;
    }),
  );
  el('states').replaceChildren(
    ...Object.entries(CONFIG.boss.actions).map(([id, name]) => button(name, () => play(id))),
    button('重置生命', () => {
      hp = CONFIG.boss.health;
      updateHealth();
    }),
  );
  el('replay').onclick = () => play('signature');
  el('pause').onclick = () => {
    paused = !paused;
    updatePause();
  };
  el('reset').onclick = resetCamera;
  const setMotion = () => {
    el('shake').disabled = motion.matches;
    if (motion.matches) {
      paused = true;
      look = 0;
      updatePause();
    }
  };
  setMotion();
  motion.addEventListener('change', setMotion);
  function coords(event, target) {
    const rect = canvas.getBoundingClientRect();
    target.set(
      ((event.clientX - rect.left) * 2) / rect.width - 1,
      1 - ((event.clientY - rect.top) * 2) / rect.height,
    );
  }
  // 单指点选与拖动、双指缩放互斥，抬手后不会误选经过的部位。
  let tap = null;
  canvas.addEventListener('pointerdown', (event) => {
    tap =
      event.isPrimary && event.button === 0
        ? { id: event.pointerId, x: event.clientX, y: event.clientY }
        : null;
  });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse') coords(event, hover);
    if (tap && Math.hypot(tap.x - event.clientX, tap.y - event.clientY) > 5) tap = null;
  });
  canvas.addEventListener('pointerleave', () => hover.set(5, 5));
  canvas.addEventListener('pointercancel', () => {
    tap = null;
  });
  canvas.addEventListener('pointerup', (event) => {
    const click = tap?.id === event.pointerId;
    tap = null;
    if (!click || !model) return;
    coords(event, pointer);
    ray.setFromCamera(pointer, camera);
    const hits = ray.intersectObject(model.root).filter((hit) => {
      for (let node = hit.object; node; node = node.parent) if (!node.visible) return false;
      return !!partOf(hit.object);
    });
    // 内核透过半透明表皮可见，射线应穿过表皮选中光团。
    const hit =
      entry.id === 'chaos' && partOf(hits[0]?.object) === 'body'
        ? (hits.find((h) => partOf(h.object) === 'core') ?? hits[0])
        : hits[0];
    if (hit) selectPart(partOf(hit.object));
  });
  function schedule() {
    if (model && dialog.open && !document.hidden) {
      if (!frame) frame = requestAnimationFrame(draw);
    } else {
      cancelAnimationFrame(frame);
      frame = last = 0;
    }
  }
  function draw(now) {
    frame = 0;
    if (!dialog.open || document.hidden || !model) return;
    const dt = last ? Math.min(0.075, (now - last) / 1000) : 0;
    last = now;
    if (!paused) time += dt;
    const progress = action ? (time - started) / CONFIG.motion.duration : -1;
    if (progress >= 1) action = '';
    const u = action ? progress : -1,
      pulse = u < 0 ? 0 : Math.sin(Math.PI * u);
    const pivot = model.head ?? model.parts.heads;
    if (pivot) {
      pivot.getWorldPosition(headPosition);
      if (!model.head) headPosition.y = entry.height * 0.67;
      headPosition.project(camera);
      const dx = hover.x - headPosition.x,
        dy = hover.y - headPosition.y;
      const target =
        Math.hypot(dx, dy) < 0.85 ? T.MathUtils.clamp(dx * 2, -1, 1) * CONFIG.motion.headTurn : 0;
      if (motion.matches) look = 0;
      else if (!paused) look = T.MathUtils.lerp(look, target, 1 - Math.exp(-dt * 7));
      if (model.head) model.head.rotation.y = look;
    }
    const impact = model.animate(time, pulse, u, look, action) || 0;
    orbit.update();
    const shake = el('shake').checked && !motion.matches ? impact * CONFIG.motion.shake : 0;
    camera.position.y += shake;
    renderer.render(scene, camera);
    camera.position.y -= shake;
    schedule();
  }
  document.addEventListener('visibilitychange', schedule);
  return {
    open(quality) {
      const automatic = matchMedia('(max-width:720px)').matches ? 'medium' : 'high';
      budget = CONFIG.budget[quality] ?? CONFIG.budget[automatic];
      choose(CONFIG.exhibits[0]);
    },
    close() {
      clearModel();
      tap = null;
      schedule();
    },
  };
}
