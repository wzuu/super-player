const TAU=2*Math.PI;

export function realmModel(type, { THREE, shapes, mergeGeometries }, rage = false) {
  const skin = [], luminous = [];
  const matrix = new THREE.Object3D();
  const rock = new THREE.IcosahedronGeometry(1, 0);
  const horn = new THREE.ConeGeometry(0.5, 1, 6);
  const limb = new THREE.CylinderGeometry(0.36, 0.5, 1, 6);
  function part(target, source, tint, x, y, z, w, h, d, pitch = 0, yaw = 0, roll = 0) {
    const piece = source.index ? source.toNonIndexed() : source.clone();
    matrix.position.set(x, y, z);
    matrix.rotation.set(pitch, yaw, roll, 'YXZ');
    matrix.scale.set(w, h, d);
    matrix.updateMatrix();
    piece.applyMatrix4(matrix.matrix);
    const c = new THREE.Color(tint);
    const colors = new Float32Array(piece.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
    piece.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    target.push(piece);
  }
  const bulk = (...p) => part(skin, rock, ...p);
  const tooth = (...p) => part(skin, horn, ...p);
  const segment = (...p) => part(skin, limb, ...p);
  const slab = (...p) => part(skin, shapes.box, ...p);
  const glow = (...p) => part(luminous, rock, ...p);
  const jade = 0x557e70, rust = 0x93504a, bone = 0xddd1a6, soot = 0x4f5153, brass = 0x9b7454;

  if (type === 0) {
    // 狰幼崽用低伏身形、额角和三根扇形尾毛区别于冲撞兽。
    bulk(rust, 0, 0.51, -0.18, 0.36, 0.31, 0.55);
    bulk(0xaf6853, 0, 0.70, 0.34, 0.30, 0.25, 0.31);
    bulk(soot, 0, 0.61, 0.58, 0.22, 0.14, 0.21);
    tooth(bone, 0, 0.95, 0.40, 0.14, 0.28, 0.12, 0.41);
    for (const side of [-1, 1]) {
      tooth(rust, side * 0.23, 0.88, 0.25, 0.14, 0.23, 0.10, -0.23, 0, -side * 0.26);
      glow(0xffb572, side * 0.145, 0.743, 0.584, 0.063, 0.043, 0.045);
      segment(soot, side * 0.24, 0.29, 0.25, 0.15, 0.49, 0.15, 0.25);
      segment(rust, side * 0.24, 0.27, -0.41, 0.17, 0.45, 0.15, -0.34);
      tooth(rust, side * 0.23, 0.58, -0.74, 0.15, 0.52, 0.11, -1.02, 0, -side * 0.42);
    }
    tooth(soot, 0, 0.63, -0.81, 0.19, 0.58, 0.13, -0.96);
  } else if (type === 1) {
    bulk(soot, 0, 1.0, -0.22, 0.57, 0.54, 0.74);
    bulk(brass, 0, 1.37, 0.32, 0.57, 0.46, 0.59);
    bulk(rust, 0, 1.25, 0.71, 0.39, 0.36, 0.42);
    slab(soot, 0, 1.03, 0.89, 0.50, 0.18, 0.27);
    for (const side of [-1, 1]) {
      tooth(bone, side * 0.33, 1.56, 1.02, 0.21, 0.56, 0.24, 1.24, 0, side * 0.25);
      tooth(brass, side * 0.47, 1.74, 0.18, 0.28, 0.63, 0.22, -0.48, 0, -side * 0.41);
      bulk(jade, side * 0.52, 1.24, 0.1, 0.31, 0.43, 0.56);
      segment(soot, side * 0.48, 0.47, 0.41, 0.28, 0.88, 0.32, -0.18);
      segment(brass, side * 0.40, 0.42, -0.55, 0.27, 0.70, 0.29, 0.35);
      glow(0xff6552, side * 0.243, 1.40, 1.001, 0.091, 0.057, 0.050);
      glow(0x93e4a2, side * 0.72, 1.31, 0.17, 0.04, 0.15, 0.12);
    }
    for (let i = 0; i < 3; i++) tooth(brass, 0, 1.54 - i * 0.10, 0.04 - i * 0.31, 0.48, 0.70, 0.25, -0.42);
  } else if (type === 2) {
    // 烛龙裔立起蛇颈，头冠与火囊提供远距离轮廓和攻击提示。
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5;
      bulk(i % 2 ? jade : 0x496961, Math.cos(a) * 0.30, 0.22, Math.sin(a) * 0.37 - 0.19, 0.28, 0.22, 0.30);
    }
    bulk(soot, 0, 0.66, 0.00, 0.33, 0.53, 0.34, 0.23);
    bulk(jade, 0, 1.03, 0.23, 0.29, 0.50, 0.29, 0.41);
    bulk(0xb0614b, 0, 1.44, 0.44, 0.36, 0.26, 0.35);
    bulk(brass, 0, 1.35, 0.65, 0.25, 0.16, 0.29);
    glow(0xff8644, 0, 1.00, 0.43, 0.195, 0.30, 0.14);
    for (const side of [-1, 1]) {
      tooth(brass, side * 0.23, 1.57, 0.29, 0.17, 0.40, 0.14, -0.58, 0, -side * 0.59);
      tooth(bone, side * 0.17, 1.29, 0.76, 0.09, 0.20, 0.078, Math.PI);
      glow(0xffcf8b, side * 0.17, 1.48, 0.69, 0.079, 0.06, 0.048);
      slab(jade, side * 0.35, 1.15, 0.17, 0.38, 0.32, 0.095, 0.24, 0, side * 0.42);
    }
  } else {
    const plate = rage ? 0xab5948 : 0x5c806f;
    const energy = rage ? 0xff5832 : 0xe6bc75;
    bulk(soot, 0, 1.67, -0.44, 0.88, 0.86, 0.83);
    bulk(plate, 0, 2.25, -0.09, 1.02, 0.71, 0.66);
    bulk(brass, 0, 2.67, 0.40, 0.82, 0.53, 0.55);
    slab(0x38202a, 0, 2.08, 0.76, 1.07, 0.42, 0.36);
    slab(plate, 0, 1.89, 0.88, 1.19, 0.19, 0.42);
    bulk(plate, 0, 2.52, 0.80, 0.61, 0.28, 0.37);
    for (const side of [-1, 1]) {
      bulk(plate, side * 0.73, 2.16, 0.11, 0.42, 0.53, 0.48);
      segment(soot, side * 0.76, 1.13, 0.44, 0.49, 1.82, 0.51, -0.20, 0, side * 0.20);
      bulk(plate, side * 0.77, 0.33, 0.56, 0.30, 0.31, 0.43);
      segment(brass, side * 0.52, 0.98, -0.47, 0.45, 1.68, 0.46, 0.35, 0, -side * 0.10);
      bulk(soot, side * 0.60, 0.20, -0.55, 0.33, 0.24, 0.38);
      tooth(bone, side * 0.57, 3.16, 0.26, 0.35, rage ? 1.23 : 0.93, 0.32, -0.42, 0, -side * 0.64);
      tooth(brass, side * 0.37, 3.15, -0.44, 0.40, 0.79, 0.38, -0.45, 0, -side * 0.19);
      glow(energy, side * 0.354, 2.76, 0.884, 0.16, 0.087, 0.074);
      glow(energy, side * 0.64, 2.38, 0.659, 0.084, 0.20, 0.055, -0.2, 0, side * 0.36);
      for (let i = 0; i < 3; i++) tooth(bone, side * (0.18 + i * 0.15), 2.14, 0.96, 0.13, 0.26, 0.13, Math.PI);
      if (rage) {
        for (let i = 0; i < 3; i++) {
          tooth(plate, side * (0.69 + i * 0.11), 2.59 - i * 0.31, -0.35 - i * 0.11, 0.30, 0.86, 0.31, -0.31, 0, -side * 0.82);
          glow(energy, side * 0.70, 1.92 - i * 0.29, 0.53, 0.085, 0.12, 0.067);
        }
      }
    }
    glow(energy, 0, 2.99, 0.70, 0.13, 0.18, 0.085);
  }
  const meshes = [mergeGeometries(skin), mergeGeometries(luminous)];
  for (const geometry of [...skin, ...luminous, rock, horn, limb]) geometry.dispose();
  return meshes;
}
