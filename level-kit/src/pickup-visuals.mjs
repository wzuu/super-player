// 所有标记共享实例批次。只有五块可复用的文字画布会随名称和数量改变。
export function createPickupVisuals({
  THREE,
  CONFIG,
  camera,
  scene,
  stamp,
  shapes,
  canvasTexture,
  dynamicMesh,
  updateMesh,
  setInstance,
  mergeGeometries,
}) {
  const cfg = CONFIG.pickups,
    styles = cfg.styles;
  const white = new THREE.Color(0xffffff),
    color = new THREE.Color(),
    point = new THREE.Vector3(),
    forward = new THREE.Vector3();
  const oct = new THREE.OctahedronGeometry(0.5),
    sphere = new THREE.SphereGeometry(0.5, 8, 6);
  function part(source, x, y, z, w, h, d) {
    const g = source.index ? source.toNonIndexed() : source.clone();
    return g.scale(w, h, d).translate(x, y, z);
  }
  const box = (...args) => part(shapes.box, ...args);
  const recipes = {
    case: [box(0, 0, 0, 0.45, 0.22, 0.23), ...[-0.13, 0, 0.13].map((x) => box(x, 0.13, 0, 0.05, 0.08, 0.2))],
    cross: [box(0, 0, 0, 0.44, 0.14, 0.18), box(0, 0, 0, 0.14, 0.43, 0.18)],
    ball: [part(sphere, 0, 0, 0, 0.35, 0.35, 0.35), box(0.04, 0.19, 0, 0.14, 0.09, 0.12)],
    vial: [part(shapes.cylinder, 0, 0, 0, 0.17, 0.4, 0.17), box(0, 0.23, 0, 0.2, 0.07, 0.2)],
    gem: [part(oct, 0, 0, 0, 0.42, 0.54, 0.39)],
    key: [
      part(oct, 0, 0.18, 0, 0.5, 0.42, 0.24),
      box(0, -0.1, 0, 0.13, 0.44, 0.14),
      box(0.1, -0.24, 0, 0.22, 0.09, 0.14),
    ],
  };
  const models = Object.fromEntries(Object.entries(recipes).map(([key, parts]) => [key, mergeGeometries(parts)]));
  for (const parts of Object.values(recipes)) for (const geometry of parts) geometry.dispose();
  oct.dispose();
  sphere.dispose();
  const material = (extra = {}) => new THREE.MeshBasicMaterial({ fog: false, toneMapped: false, ...extra });
  const batches = Object.fromEntries(
    Object.entries(styles).map(([kind, style]) => {
      const icon = canvasTexture(64, 64, (ctx) => {
        ctx.fillStyle = '#141d28';
        ctx.beginPath();
        ctx.arc(32, 32, 27, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = style.color;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = style.color;
        ctx.font = 'bold 41px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(style.glyph, 32, 33);
      });
      return [
        kind,
        {
          style,
          tint: new THREE.Color(style.color),
          count: 0,
          body: dynamicMesh(models[style.shape], material(), cfg.pool),
          icon: dynamicMesh(shapes.plane, material({ map: icon, alphaTest: 0.4 }), cfg.pool),
        },
      ];
    }),
  );
  const beamGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 4, 1, true);
  const beam = dynamicMesh(beamGeo, material({ transparent: true, opacity: 0.72, depthWrite: false }), cfg.pool);
  const coreBeam = dynamicMesh(beamGeo, material({ depthTest: false, depthWrite: false }), 1);
  coreBeam.renderOrder = 8;
  const rings = dynamicMesh(new THREE.RingGeometry(0.78, 1, 16), material({ side: THREE.DoubleSide }), cfg.pool);
  const labels = Array.from({ length: cfg.labelLimit }, () => {
    const texture = canvasTexture(512, 88, () => {});
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, fog: false, toneMapped: false, depthWrite: false }),
    );
    sprite.renderOrder = 9;
    scene.add(sprite);
    sprite.visible = false;
    return { sprite, texture, key: '' };
  });
  const candidates = [],
    placed = [];
  const labelPixels = () => Math.min(205, innerWidth * 0.34);
  function labelWidth(distance) {
    return (2 * distance * Math.tan((camera.fov * Math.PI) / 360) * labelPixels()) / innerHeight;
  }
  function label(slot, item, style, distance) {
    const manual = item.kind === 'core';
    const binding = CONFIG.interactLabel || 'F';
    const action = manual
      ? '靠近按 ' + binding + ' 拾取'
      : distance <= cfg.nameRange
        ? '靠近自动 · 瞄准按 ' + binding
        : '靠近自动拾取';
    const quantity = item.kind === 'rare' || manual ? 1 : item.value || 1;
    const title = item.name + ' ×' + quantity + (item.kind === 'rare' ? ' · 价值 ' + item.value : '');
    const key = title + action + style.color;
    if (slot.key !== key) {
      const ctx = slot.texture.image.getContext('2d');
      ctx.clearRect(0, 0, 512, 88);
      ctx.fillStyle = 'rgba(12,19,27,.94)';
      ctx.fillRect(4, 2, 504, 84);
      ctx.fillStyle = style.color;
      ctx.fillRect(4, 2, 7, 84);
      ctx.textAlign = 'center';
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText(title, 256, 37, 478);
      ctx.fillStyle = '#ffffff';
      ctx.font = '25px sans-serif';
      ctx.fillText(action, 256, 73);
      slot.key = key;
      slot.texture.needsUpdate = true;
    }
    const sprite = slot.sprite,
      w = labelWidth(distance);
    sprite.position.set(item.x, item.y + 1.23, item.z);
    sprite.scale.set(w, (w * 88) / 512, 1);
    sprite.material.depthTest = !manual;
    sprite.visible = true;
  }
  function finish(mesh, n) {
    mesh.visible = n > 0;
    updateMesh(mesh, n);
  }
  return function render(objects, t, age) {
    camera.getWorldDirection(forward);
    camera.updateMatrixWorld();
    let beams = 0,
      keys = 0,
      ringCount = 0;
    for (const batch of Object.values(batches)) batch.count = 0;
    candidates.length = 0;
    for (const p of objects) {
      if (!p.active) continue;
      const key = p.kind === 'core',
        valuable = key || p.kind === 'rare';
      if (!p.permanent && !valuable && age - p.born > cfg.lifetime - cfg.blinkTime && Math.sin(t * 15) < 0)
        continue;
      const batch = batches[p.style],
        { style, tint } = batch;
      const ageSinceDrop = age - p.born;
      const pop = !p.permanent && ageSinceDrop < 0.42 ? Math.sin((Math.PI * ageSinceDrop) / 0.42) * 0.46 : 0;
      const pulse = (1 + Math.sin(t * 5)) * 0.5;
      color.copy(tint);
      if (key) color.lerp(white, pulse);
      else if (pop) color.lerp(white, pop);
      const height = style.beam + (key ? pulse * 0.45 : 0);
      setInstance(
        key ? coreBeam : beam,
        key ? keys++ : beams++,
        p.x,
        p.y + height * 0.5,
        p.z,
        key ? 0.09 : 0.045,
        height,
        key ? 0.09 : 0.045,
        color,
      );
      point.set(p.x, p.y + 0.65, p.z).sub(camera.position);
      const distance = point.length(),
        depth = point.dot(forward);
      if (depth <= 0) continue;
      const aimed = depth > distance * 0.9995;
      if (distance > cfg.iconRange && !aimed) continue;
      if (distance <= cfg.iconRange) {
        const n = batch.count++,
          a = t + p.x * 0.17,
          radius = valuable ? 0.43 : 0.29;
        setInstance(batch.body, n, p.x, p.y + 0.36 + pop + Math.sin(a * 2) * 0.045, p.z, 1, 1, 1, color, a);
        setInstance(rings, ringCount++, p.x, p.y + 0.035, p.z, radius, radius, 1, color, a * 0.18, -Math.PI / 2);
        stamp.position.set(p.x, p.y + 0.88 + pop, p.z);
        stamp.quaternion.copy(camera.quaternion);
        const size = Math.max(0.22, distance * 0.029);
        stamp.scale.set(size, size, 1);
        stamp.updateMatrix();
        batch.icon.setMatrixAt(n, stamp.matrix);
      }
      if (distance <= (valuable ? cfg.rareNameRange : cfg.nameRange) || aimed) {
        point.set(p.x, p.y + 1.23, p.z).project(camera);
        p.screenX = (point.x * innerWidth) / 2;
        p.screenY = (point.y * innerHeight) / 2;
        if (Math.abs(point.x) < 1 && Math.abs(point.y) < 1) candidates.push(p);
        p.labelDistance = distance;
      }
    }
    finish(beam, beams);
    finish(coreBeam, keys);
    finish(rings, ringCount);
    for (const batch of Object.values(batches)) {
      finish(batch.body, batch.count);
      finish(batch.icon, batch.count);
    }
    candidates.sort((a, b) => a.labelDistance - b.labelDistance);
    placed.length = 0;
    for (const item of candidates) {
      if (
        placed.some(
          (other) =>
            Math.abs(other.screenX - item.screenX) < labelPixels() &&
            Math.abs(other.screenY - item.screenY) < (labelPixels() * 88) / 512,
        )
      )
        continue;
      placed.push(item);
      if (placed.length === labels.length) break;
    }
    labels.forEach((slot, i) => {
      const item = placed[i];
      if (item) label(slot, item, styles[item.style], item.labelDistance);
      else slot.sprite.visible = false;
    });
  };
}
