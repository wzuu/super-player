export function jungleBeast(type, { THREE, shapes, mergeGeometries }, rage = false) {
  const solid = [], luminous = [], pivot = new THREE.Object3D();
  const facet = new THREE.IcosahedronGeometry(.70, 0);
  const joint = new THREE.CylinderGeometry(.44, .54, 1, 6);
  const spike = new THREE.ConeGeometry(.52, 1, 5);
  const wedge = new THREE.OctahedronGeometry(.75, 0);
  function join(parts, shape, color, x, y, z, w, h, d, pitch = 0, yaw = 0, roll = 0) {
    const geo = shape.index ? shape.toNonIndexed() : shape.clone();
    pivot.position.set(x, y, z);
    pivot.rotation.set(pitch, yaw, roll, 'YXZ');
    pivot.scale.set(w, h, d);
    pivot.updateMatrix();
    geo.applyMatrix4(pivot.matrix);
    const tint = new THREE.Color(color), values = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < values.length; i += 3) {
      values[i] = tint.r; values[i + 1] = tint.g; values[i + 2] = tint.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(values, 3));
    parts.push(geo);
  }
  const body = (...p) => join(solid, facet, ...p);
  const plate = (...p) => join(solid, shapes.box, ...p);
  const limb = (...p) => join(solid, joint, ...p);
  const tooth = (...p) => join(solid, spike, ...p);
  const feather = (...p) => join(solid, wedge, ...p);
  const eye = (...p) => join(luminous, facet, ...p);

  if (type === 0) {
    const fur = 0xba8d41, dark = 0x423026, cream = 0xd5c093;
    body(fur, 0, .59, -.10, .42, .33, .78);
    body(fur, 0, .66, .29, .39, .36, .42);
    body(0xc59c52, 0, .76, .53, .275, .23, .25);
    body(cream, 0, .685, .676, .182, .106, .16);
    body(dark, 0, .725, .763, .073, .065, .062);
    limb(fur, 0, .59, -.72, .097, .58, .10, -1.25);
    limb(dark, .04, .73, -.99, .085, .39, .084, -1.06, 0, -.28);
    for (const side of [-1, 1]) {
      body(fur, side * .126, .884, .472, .096, .104, .059);
      eye(0xffd173, side * .121, .770, .665, .040, .027, .040);
      for (const k of [-1, 1]) {
        const z = k * .31;
        body(fur, side * .20, .466, z, .137, .27, .165);
        limb(fur, side * .203, .247, z + k * .057, .112, .355, .101, k * -.29);
        body(cream, side * .202, .073, z + .045, .112, .081, .148);
      }
      for (let i = 0; i < 6; i++) {
        body(dark, side * (.208 + .052 * (i % 3 === 1)), .59 + .084 * (i % 2), -.48 + i * .133,
          .086, .044, .055);
      }
    }
  } else if (type === 1) {
    body(0x404537, 0, .78, -.18, .80, .75, 1.06);
    body(0x57654b, 0, .74, .43, .65, .62, .61);
    body(0x687055, 0, .60, .76, .41, .29, .36);
    body(0x98977e, 0, .63, .94, .35, .23, .13);
    for (let i = 0; i < 5; i++) {
      plate(i % 2 ? 0x959d79 : 0x788a6d, 0, 1.29 + .073 * Math.sin(i * .79), -.65 + i * .28,
        .66, .21, .25, -.14);
    }
    for (const side of [-1, 1]) {
      feather(0x6e8164, side * .34, 1.18, .35, .25, .48, .18, -.29, 0, side * -.50);
      tooth(0xcfd5ac, side * .26, .69, .92, .16, .47, .18, .79, 0, -.28 * side);
      for (const z of [-.52, .38]) {
        limb(0x565943, side * .35, .37, z, .25, .56, .26, .14);
        plate(0x343d32, side * .35, .094, z + .055, .21, .14, .24);
      }
      plate(0x7d8f6a, side * .42, .96, -.13, .20, .38, .67, 0, .07 * side, side * .29);
      eye(0xffa842, side * .30, .876, .75, .062, .048, .064);
    }
  } else if (type === 2) {
    const cloth = 0x587749, dark = 0x365645, mask = 0xa7af72;
    limb(cloth, 0, .80, -.025, .66, .96, .45);
    feather(dark, 0, 1.08, .015, .54, .54, .41);
    body(0x826e4a, 0, 1.47, .043, .35, .34, .31);
    plate(mask, 0, 1.48, .228, .36, .286, .09);
    plate(0x617544, 0, 1.607, .174, .526, .086, .20);
    limb(0x977d4c, .283, 1.27, .40, .102, .83, .112, Math.PI / 2);
    limb(0xc2ab61, .283, 1.27, .825, .118, .06, .121, Math.PI / 2);
    for (const side of [-1, 1]) {
      limb(0x877256, side * .13, .295, .015, .14, .53, .17, -.16 * side);
      body(0x56604b, side * .13, .077, .108, .126, .095, .19);
      limb(0x927751, side * .29, 1.10, .24, .115, .47, .128, side * .91);
      feather(side < 0 ? 0x8db177 : 0x729550, side * .20, 1.60, -.128, .14, .34, .17, -.21, 0, side * -.45);
      eye(0xbaff75, side * .115, 1.492, .283, .056, .028, .04);
    }
  } else {
    const shell = rage ? 0x4b8568 : 0x7e8a74;
    const scale = rage ? 0x287b54 : 0x566e59;
    const edge = rage ? 0x9ec96e : 0xa2a382;
    body(scale, 0, .37, -.06, 1.39, .53, 1.55);
    body(shell, 0, .80, -.35, 1.10, .77, .95);
    body(scale, 0, 1.30, -.16, .74, .83, .76);
    body(shell, 0, 1.91, .09, .65, .82, .71);
    body(scale, 0, 2.31, .37, .66, .78, .70);
    body(shell, 0, 2.61, .61, .82, .61, .72);
    body(edge, 0, 2.48, 1.00, .73, .31, .57);
    body(0x354932, 0, 2.26, .90, .60, .29, .53, rage ? .22 : .04);
    for (const side of [-1, 1]) {
      body(scale, side * .64, .74, -.39, .60, .46, .80);
      body(shell, side * .74, .38, .20, .63, .39, .78);
      for (let i = 0; i < 6; i++) {
        const s = i / 5, x = side * (.44 + Math.sin(s * Math.PI) * (rage ? .87 : .57));
        feather(i % 2 === 0 ? edge : scale, x, 2.94 - s * 1.65, .36 - .35 * s,
          .30 + .11 * s, .81, .27, -.38, .16 * side, side * (-.26 - s * 1.51));
      }
      for (let i = 0; i < 3; i++) {
        tooth(0xc9d4aa, side * (.19 + i * .137), 2.32, 1.10 - i * .091, .12, .20, .12, Math.PI, 0, side * .18);
      }
      eye(rage ? 0xfdc860 : 0xc6f39c, side * .39, 2.70, .992, .129, .093, .113);
      if (rage) {
        eye(0x8fff9c, side * .34, 2.24, .84, .081, .22, .095);
        eye(0xf6d977, side * .58, 1.34, .07, .085, .361, .13, .14, 0, side * -.38);
      } else {
        plate(shell, side * .57, 1.64, .17, .24, .89, .53, -.23, 0, side * -.44);
        plate(edge, side * .39, 2.51, .94, .17, .19, .21, .28);
      }
    }
    tooth(edge, 0, 3.20, .31, .33, .90, .36, -.56);
    eye(rage ? 0xffcf75 : 0x9ae884, 0, 2.89, .84, .14, .21, .11);
  }
  const model = [mergeGeometries(solid), mergeGeometries(luminous)];
  for (const g of [...solid, ...luminous, facet, joint, spike, wedge]) g.dispose();
  return model;
}
