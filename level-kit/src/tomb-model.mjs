export function tombModel(type, { THREE, shapes, mergeGeometries }) {
  const hull = [], lit = [];
  const oval = new THREE.IcosahedronGeometry(1, 0);
  const horn = new THREE.ConeGeometry(.5, 1, 5);
  const phalanx = new THREE.CylinderGeometry(.42, .50, 1, 6);
  const tmp = new THREE.Object3D();
  function part(group, primitive, color, x, y, z, a, b, c, pitch = 0, yaw = 0, roll = 0) {
    const geo = primitive.index ? primitive.toNonIndexed() : primitive.clone();
    tmp.position.set(x, y, z); tmp.scale.set(a, b, c); tmp.rotation.set(pitch, yaw, roll, 'YXZ'); tmp.updateMatrix();
    geo.applyMatrix4(tmp.matrix);
    const rgb = new THREE.Color(color), data = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < data.length; i += 3) { data[i] = rgb.r; data[i+1] = rgb.g; data[i+2] = rgb.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(data, 3));
    group.push(geo);
  }
  const rock = (...a) => part(hull, oval, ...a);
  const box = (...a) => part(hull, shapes.box, ...a);
  const spike = (...a) => part(hull, horn, ...a);
  const rod = (...a) => part(hull, phalanx, ...a);
  const light = (...a) => part(lit, oval, ...a);
  const sand = 0xaa6a40, dark = 0x4f3630, gold = 0xd8994d, teal = 0x46786f;
  if (type === 0) {
    rock(sand, 0,.27,-.07, .32,.16,.43);
    rock(gold, 0,.27,.27, .27,.145,.26);
    for (const s of [-1, 1]) {
      for (let j = 0; j < 4; j++) {
        const z = .25 - j*.19;
        rod(dark,s*.33,.155,z,.086,.35,.085,.17,0,s*-.95);
        box(gold,s*.43,.065,z+.04,.10,.06,.18,.24,s*.35,s*.23);
      }
      rod(dark,s*.22,.21,.42,.105,.34,.115,1.18,s*.47);
      rock(gold,s*.29,.23,.60,.139,.091,.15);
      spike(dark,s*.35,.235,.71,.09,.12,.08,1.58);
      spike(sand,s*.22,.225,.71,.08,.11,.085,1.57);
      light(0xff8b4b,s*.105,.325,.44,.049,.034,.04);
    }
    for (let j = 0; j < 5; j++) {
      const d = j / 4;
      rock(j % 2 ? sand : dark,0,.29 + d*.45, -.37 - Math.sin(d*Math.PI*.82)*.20, .095-d*.026,.104,.103);
    }
    spike(sand,0,.77,-.46,.092,.27,.096,1.49);
  } else if (type === 1) {
    rock(dark,0,.48,-.10,.56,.39,.64);
    for (const s of [-1, 1]) {
      rock(teal,s*.22,.88,-.17,.35,.47,.61,0,s*.14,s*.14);
      rock(sand,s*.31,.68,.19,.24,.25,.36,.27);
      for (let j = 0; j < 3; j++) rod(j % 2 ? dark : sand,s*.48,.23,.25-j*.30,.17,.56,.19,.31,0,s*-.55);
      spike(gold,s*.28,.62,.65,.25,.49,.24,1.15,0,s*.33);
      light(0xffbc54,s*.17,.65,.62,.074,.055,.044);
    }
    rock(gold,0,.60,.49,.32,.28,.28);
    box(gold,0,1.30,-.22,.075,.12,.77,.06);
    spike(sand,0,1.48,-.48,.25,.62,.26,-.64);
  } else if (type === 2) {
    rock(dark,0,.28,-.16,.39,.19,.46);
    rock(sand,.15,.33,.05,.27,.22,.37,0,-.29);
    rod(teal,0,.84,0,.48,.95,.39,-.13);
    rod(gold,0,1.11,.05,.54,.10,.43,-.13);
    rock(teal,0,1.59,.05,.42,.31,.15,0,0,.04);
    rock(dark,0,1.70,.19,.25,.22,.23);
    rock(sand,0,1.60,.37,.24,.11,.15);
    for (const s of [-1,1]) {
      rod(teal,s*.25,1.01,.16,.13,.51,.13,-.43,0,s*-.29);
      light(0xcaff7a,s*.122,1.747,.340,.058,.045,.040);
      spike(gold,s*.079,1.52,.405,.06,.12,.065,Math.PI);
    }
    rod(gold,.37,1.04,.27,.066,1.50,.066,-.15,0,-.17);
    light(0xb8ff5d,.50,1.77,.16,.094,.14,.093);
  } else {
    rock(0x605249,0,1.58,-.03,.64,.66,.42);
    rock(dark,0,2.44,.07,.83,.72,.47);
    rock(teal,0,2.61,.35,.63,.37,.25);
    box(gold,0,1.79,.37,.78,.17,.18,.03);
    box(gold,0,2.68,.57,.48,.13,.10,.04);
    rock(gold,0,3.29,.04,.48,.44,.35);
    rock(dark,0,3.35,.26,.35,.30,.34);
    rock(0x7b654e,0,3.22,.50,.254,.17,.37,.02);
    for (const s of [-1, 1]) {
      rock(0x78614c,s*.42,.52,-.03,.29,.54,.34,.14,0,s*.16);
      box(dark,s*.40,.155,.20,.46,.26,.64,0,s*.16);
      rod(0x82705a,s*.86,1.94,.14,.39,1.18,.39,-.23,0,s*.20);
      box(gold,s*.96,1.54,.33,.38,.45,.37,-.31,0,s*.15);
      rock(teal,s*.75,2.65,.12,.38,.31,.40,.28,s*.27);
      spike(dark,s*.27,3.73,.12,.24,.56,.23,-.13,0,s*-.14);
      light(0xffba59,s*.16,3.44,.51,.075,.054,.060);
    }
    light(0xff9839,0,2.43,.57,.145,.135,.092);
  }
  const meshes = [mergeGeometries(hull), mergeGeometries(lit)];
  for (const g of [...hull, ...lit, oval, horn, phalanx]) g.dispose();
  return meshes;
}
