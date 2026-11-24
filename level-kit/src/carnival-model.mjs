const PINK=0xff5e9e, AQUA=0x59efea, GOLD=0xffc26b;

export function carnivalModel(type, { THREE, shapes, mergeGeometries }, rage = false) {
  const body = [],
    glow = [],
    orb = new THREE.SphereGeometry(0.5, 8, 6),
    cone = new THREE.ConeGeometry(0.5, 1, 8);
  const stamp = new THREE.Object3D();
  function part(shape, color, x, y, z, w, h, d, rz = 0, lit = false) {
    const g = shape.index ? shape.toNonIndexed() : shape.clone();
    stamp.position.set(x, y, z);
    stamp.scale.set(w, h, d);
    stamp.rotation.set(0, 0, rz);
    stamp.updateMatrix();
    g.applyMatrix4(stamp.matrix);
    const rgb = new THREE.Color(color),
      attr = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < attr.length; i += 3) {
      attr[i] = rgb.r;
      attr[i + 1] = rgb.g;
      attr[i + 2] = rgb.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(attr, 3));
    (lit ? glow : body).push(g);
  }
  if (type === 0) {
    part(orb, 0x814d62, 0, 0.48, 0, 0.53, 0.64, 0.47);
    part(orb, 0xc39792, 0, 0.94, 0.06, 0.58, 0.54, 0.52, 0.15);
    for (const s of [-1, 1]) {
      part(orb, 0xc08b90, s * 0.23, 1.16, 0.02, 0.22, 0.22, 0.18);
      part(shapes.box, 0x996a80, s * 0.18, 0.18, -0.02, 0.18, 0.34, 0.22, s * 0.17);
      part(shapes.box, 0xc18e8f, s * 0.32, 0.57, 0.08, 0.16, 0.33, 0.21, s * 0.52);
      part(orb, s > 0 ? PINK : AQUA, s * 0.12, 0.97, 0.294, 0.09, 0.09, 0.055, 0, true);
    }
    part(shapes.box, 0x422f41, 0, 0.82, 0.307, 0.2, 0.035, 0.024, -0.19);
  } else if (type === 1) {
    part(orb, 0x6e465a, 0, 0.98, 0, 1.02, 1.17, 0.88);
    part(orb, 0xeac9b2, 0, 1.8, 0.09, 0.66, 0.63, 0.55);
    part(orb, PINK, 0, 1.76, 0.42, 0.2, 0.2, 0.17, 0, true);
    for (const s of [-1, 1]) {
      part(orb, 0xb65765, s * 0.48, 1.39, 0, 0.57, 0.53, 0.62);
      part(shapes.box, 0x797184, s * 0.59, 1.0, 0.07, 0.35, 0.62, 0.4, -s * 0.12);
      part(orb, 0xd39c79, s * 0.66, 0.79, 0.18, 0.44, 0.34, 0.42);
      part(shapes.box, 0x4d394b, s * 0.24, 0.38, 0, 0.38, 0.64, 0.39);
      part(orb, 0xcb697b, s * 0.26, 0.17, 0.19, 0.48, 0.24, 0.7);
      part(orb, 0xda5675, s * 0.35, 1.92, -0.04, 0.28, 0.42, 0.31);
      part(shapes.box, AQUA, s * 0.14, 1.9, 0.35, 0.13, 0.045, 0.045, s * 0.22, true);
    }
    part(cone, 0x625472, 0, 2.18, -0.03, 0.52, 0.46, 0.5);
  } else if (type === 2) {
    part(shapes.box, 0xbe8969, 0, 0.49, 0, 0.6, 0.46, 0.53);
    part(shapes.cylinder, 0x6e5368, 0, 0.62, 0.4, 0.3, 0.34, 0.53);
    for (const s of [-1, 1]) {
      part(shapes.box, 0xc4aa91, s * 0.22, 0.99, 0, 0.022, 0.8, 0.025, -s * 0.18);
      part(orb, s > 0 ? PINK : AQUA, s * 0.28, 1.4, 0, 0.59, 0.79, 0.57, 0, true);
    }
    part(orb, GOLD, 0, 1.66, -0.12, 0.55, 0.7, 0.54);
    part(orb, 0xdfbcae, 0, 0.83, 0.1, 0.36, 0.36, 0.3);
  } else {
    const scale = rage ? 1.16 : 1;
    part(cone, 0x8e344f, 0, 1.8, 0, 1.68 * scale, 1.9 * scale, 1.02 * scale);
    part(orb, 0xe8c2ae, 0, 3.08, 0.07, 0.91 * scale, 0.96 * scale, 0.77);
    part(shapes.cylinder, 0x292437, 0, 3.55, 0, 1.3, 0.13, 1.13);
    part(shapes.cylinder, 0x533647, 0, 3.82, 0, 0.82, 0.64, 0.76);
    part(shapes.box, GOLD, 0, 3.62, 0.39, 0.72, 0.12, 0.14, 0, true);
    for (const s of [-1, 1]) {
      part(shapes.box, 0x35283e, s * 0.35, 0.66, 0, 0.46, 1.21, 0.54);
      part(shapes.box, 0xc46d76, s * 0.89, 2.11, 0, 0.42, 1.01, 0.49, -s * (rage ? 0.9 : 0.28));
      part(orb, GOLD, s * 0.71, 2.56, 0.04, 0.55, 0.38, 0.47);
      part(shapes.box, rage ? AQUA : PINK, s * 0.19, 3.17, 0.43, 0.17, 0.069, 0.075, -s * 0.19, true);
      if (rage) part(cone, 0xc78495, s * 0.54, 3.39, -0.13, 0.36, 0.92, 0.4, -s * 0.56);
    }
    part(shapes.cylinder, 0xa28261, 1.08, 1.18, 0.18, 0.11, 2.35, 0.11);
    part(orb, AQUA, 1.08, 2.46, 0.18, 0.34, 0.41, 0.32, 0, true);
  }
  const meshes = [mergeGeometries(body), mergeGeometries(glow)];
  for (const g of [...body, ...glow, orb, cone]) g.dispose();
  return meshes;
}
