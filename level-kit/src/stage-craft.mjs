// 供街町与机坊共用的造景工具。尺寸统一用米，实体地形与可见网格由同一参数生成。
export function stageBuilder(context, palette, texture) {
  const { THREE, scene, level, GRID, StaticBatches, shapes } = context;
  const materials = Object.fromEntries(
    Object.entries(palette).map(([name, color]) => [name, new THREE.MeshLambertMaterial({ color })]),
  );
  materials.light = new THREE.MeshBasicMaterial({ color: 0xffffff });
  if (texture) materials.surface = new THREE.MeshLambertMaterial({ map: texture });
  const geometry = {
    ...shapes,
    roof: new THREE.CylinderGeometry(0.28, 0.72, 1, 4, 1, false, Math.PI / 4),
    cone: new THREE.ConeGeometry(0.5, 1, 10),
    orb: new THREE.IcosahedronGeometry(0.55, 1),
    ring: new THREE.TorusGeometry(0.5, 0.065, 6, 22),
  };
  const batch = new StaticBatches(materials, geometry);
  const part = (...args) => batch.add(...args);
  function block(material, x, z, w, d, y0, y1, solid = false, climb = false) {
    part('box', material, x, (y1 + y0) / 2, z, w, y1 - y0, d);
    if (solid) level.box(x, z, w, d, y0, y1, climb);
  }
  function column(material, x, z, diameter, y0, y1, solid = false) {
    part('cylinder', material, x, (y1 + y0) / 2, z, diameter, y1 - y0, diameter);
    if (solid) level.box(x, z, diameter * 0.84, diameter * 0.84, y0, y1);
  }
  function beam(material, start, end, width, shape = 'box') {
    const a = new THREE.Vector3(...start),
      delta = new THREE.Vector3(...end).sub(a);
    const center = a.addScaledVector(delta, 0.5),
      length = delta.length();
    const e = new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()),
    );
    part(shape, material, center.x, center.y, center.z, width, length, width, 0xffffff, e.y, e.x, e.z);
  }
  function floor(material) {
    block(material, 0, 0, GRID.halfX * 2, GRID.halfZ * 2, -0.24, -0.015);
  }
  function lighting(sky, ground, rim, locations) {
    scene.add(new THREE.HemisphereLight(sky, ground, 1.65));
    const moon = new THREE.DirectionalLight(rim, 1.7);
    moon.position.set(-26, 48, -35);
    scene.add(moon);
    for (const [x, y, z, color, intensity, range] of locations) {
      const light = new THREE.PointLight(color, intensity, range, 1.45);
      light.position.set(x, y, z);
      scene.add(light);
    }
  }
  return { part, block, column, beam, floor, lighting, flush: () => batch.flush() };
}

// 三段式平台可由两端上下。视觉踏步与基础地形采用相同阶高，寻路和拾取可直接使用地表高度。
export function stairDeck(x, z, width, length, run, rise, axis = 'z') {
  const steps = Math.ceil(rise / 0.24);
  function coordinates(distance, lateral = 0) {
    return axis === 'z' ? [x + lateral, z + distance] : [x + distance, z + lateral];
  }
  function height(px, pz) {
    const along = Math.abs(axis === 'z' ? pz - z : px - x);
    const across = Math.abs(axis === 'z' ? px - x : pz - z);
    if (across > width / 2 || along >= length / 2 + run) return 0;
    if (along <= length / 2) return rise;
    return (rise * Math.ceil((1 - (along - length / 2) / run) * steps)) / steps;
  }
  function draw(builder, material) {
    const segment = (s, l, h) => {
      const [cx, cz] = coordinates(s);
      builder.block(material, cx, cz, axis === 'z' ? width : l, axis === 'z' ? l : width, -0.02, h, true, true);
    };
    segment(0, length, rise);
    for (const sign of [-1, 1])
      for (let i = 0; i < steps; i++) {
        segment(
          sign * (length / 2 + ((i + 0.5) * run) / steps),
          run / steps + 0.002,
          (rise * (steps - i)) / steps,
        );
      }
  }
  return { height, draw };
}

// 每种轮廓仅合并一次，普通与发光部件沿用共享实例化凶兽对象池。
export function creatureParts({ THREE, shapes, mergeGeometries }) {
  const body = [],
    light = [];
  const gem = new THREE.IcosahedronGeometry(0.55, 0),
    horn = new THREE.ConeGeometry(0.5, 1, 6);
  const source = { ...shapes, gem, horn };
  const stamp = new THREE.Object3D();
  function add(shape, color, x, y, z, w, h, d, pitch = 0, roll = 0, yaw = 0, luminous = false) {
    const base = source[shape];
    const geometry = base.index ? base.toNonIndexed() : base.clone();
    stamp.position.set(x, y, z);
    stamp.scale.set(w, h, d);
    stamp.rotation.set(pitch, yaw, roll);
    stamp.updateMatrix();
    geometry.applyMatrix4(stamp.matrix);
    const rgb = new THREE.Color(color),
      values = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < values.length; i += 3) rgb.toArray(values, i);
    geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
    (luminous ? light : body).push(geometry);
  }
  function finish() {
    const result = [mergeGeometries(body), mergeGeometries(light)];
    for (const geo of [...body, ...light, gem, horn]) geo.dispose();
    return result;
  }
  return { add, finish };
}

export function skySpecks({ THREE, scene, seededRandom }, count, span, color, size, seed) {
  const random = seededRandom(seed),
    positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (random() - 0.5) * span;
    positions[i * 3 + 1] = 2 + random() * 13;
    positions[i * 3 + 2] = (random() - 0.5) * span;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size,
      color,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  scene.add(points);
  return points;
}
