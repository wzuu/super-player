import * as T from 'three';
import { group, mesh, oval, metal, glow, limbs, face, horn, tube, bronzePatina } from './sculpt.mjs';

function sheepBody(bronze, hoof) {
  const body = limbs(bronze, hoof);
  oval(body, bronze, [0, 1.31, -0.15], [0.79, 0.65, 1.16]);
  oval(body, bronze, [0, 1.5, 0.66], [0.7, 0.67, 0.56]);
  return body;
}
function humanMask(bronze, gold) {
  const head = group();
  head.position.set(0, 1.81, 0.95);
  oval(head, bronze, [0, 0.1, 0], [0.53, 0.55, 0.28]);
  oval(head, gold, [0, 0.06, 0.27], [0.105, 0.22, 0.09]);
  for (const s of [-1, 1]) {
    oval(head, gold, [s * 0.22, 0.24, 0.22], [0.23, 0.07, 0.11]).rotation.z = s * 0.23;
    oval(head, gold, [s * 0.37, -0.03, 0.21], [0.14, 0.19, 0.095]);
    horn(
      head,
      gold,
      [
        [s * 0.38, 0.34, -0.06],
        [s * 0.75, 0.68, -0.12],
        [s * 0.87, 0.43, -0.31],
        [s * 0.66, 0.3, -0.42],
        [s * 0.56, 0.49, -0.38],
      ],
      0.16,
    );
    horn(
      head,
      gold,
      [
        [s * 0.31, -0.17, 0.29],
        [s * 0.32, -0.32, 0.34],
        [s * 0.26, -0.48, 0.32],
      ],
      0.075,
    );
  }
  oval(head, metal('#2a1c21'), [0, -0.25, 0.2], [0.39, 0.27, 0.1]);
  return head;
}
function lowerJaw(bronze, gold) {
  const jaw = group();
  jaw.position.set(0, -0.26, 0.04);
  oval(jaw, bronze, [0, -0.12, 0.21], [0.4, 0.12, 0.25]);
  for (let i = -2; i <= 2; i++)
    horn(
      jaw,
      gold,
      [
        [i * 0.125, -0.08, 0.36],
        [i * 0.13, 0.015, 0.37],
        [i * 0.13, 0.085, 0.34],
      ],
      0.045,
    );
  return jaw;
}
function armpitEyes(gold, light) {
  const eyes = group();
  for (const s of [-1, 1]) {
    const socket = group();
    socket.position.set(s * 0.695, 1.31, 0.66);
    socket.rotation.y = s * 0.94;
    eyes.add(socket);
    oval(socket, gold, [0, 0, 0], [0.25, 0.16, 0.1]);
    oval(socket, light, [0, 0, 0.075], [0.19, 0.1, 0.065]);
    oval(socket, metal('#14382d'), [0, 0, 0.133], [0.029, 0.079, 0.016]);
  }
  return eyes;
}
export function taotie({ palette }) {
  const [base, accent, eye] = palette,
    bronze = bronzePatina(base),
    gold = metal(accent, 0.63);
  const body = sheepBody(bronze, gold),
    head = humanMask(bronze, gold),
    jaw = lowerJaw(bronze, gold),
    eyes = armpitEyes(gold, glow(eye));
  body.add(eyes, head);
  head.add(jaw);
  return {
    root: body,
    parts: { body, head, jaw, eyes },
    head,
    animate(t, p) {
      body.scale.y = 1 + 0.014 * Math.sin(t * 2);
      jaw.rotation.x = 0.08 + 0.06 * Math.sin(t * 1.8) + 0.83 * p;
    },
  };
}

function hydraBack(base, trim) {
  const body = group();
  oval(body, base, [0, 0.56, -0.15], [1.04, 0.43, 0.79]);
  horn(
    body,
    base,
    [
      [0, 0.5, -0.45],
      [0.3, 0.45, -1.1],
      [0.77, 0.23, -1.64],
      [1.2, 0.18, -1.64],
    ],
    0.32,
  );
  for (let i = 0; i < 9; i++)
    oval(body, trim, [((i % 3) - 1) * 0.33, 0.89, -0.66 + Math.floor(i / 3) * 0.26], [0.23, 0.075, 0.2]);
  return body;
}
function hydraNecks(base) {
  const necks = group();
  for (let i = 0; i < 9; i++) {
    const a = (i - 4) * 0.295;
    const stalk = group();
    stalk.position.set(Math.sin(a) * 0.58, 0.68, Math.cos(a) * 0.24 - 0.22);
    const end = [Math.sin(a) * 1.14, 1.14 + Math.cos(a) * 0.84 + (i % 2) * 0.25, (i % 2) * 0.49 - 0.12];
    tube(
      stalk,
      base,
      [[0, 0, 0], [end[0] * 0.43, 0.67, -0.17], [end[0] * 0.89, end[1] * 0.78, end[2] - 0.16], end],
      0.09,
    );
    stalk.userData.tip = end;
    necks.add(stalk);
  }
  return necks;
}
function hydraHead(trim, eye, base, index) {
  const head = group();
  oval(head, trim, [0, 0.01, 0.09], [0.155, 0.14, 0.245]);
  oval(head, base, [0, -0.085, 0.19], [0.135, 0.055, 0.15]);
  for (const s of [-1, 1]) {
    oval(head, eye, [s * 0.113, 0.055, 0.19], [0.045, 0.038, 0.032]);
    horn(
      head,
      trim,
      [
        [s * 0.09, 0.09, -0.02],
        [s * 0.13, 0.19, -0.1],
        [s * 0.15, 0.25, -0.21],
      ],
      0.052,
    );
  }
  const breath = group();
  head.add(breath);
  const spray = glow(index % 2 ? '#8eeaff' : '#ff7438');
  for (let j = 0; j < 6; j++)
    oval(
      breath,
      spray,
      [Math.sin(j) * 0.035, 0.007 - j * j * 0.012, 0.28 + j * 0.115],
      [0.067 - j * 0.006, 0.057 - j * 0.005, 0.137],
    );
  head.userData.breath = breath;
  return head;
}
export function hydra({ palette }) {
  const [base, trim, eye] = [metal(palette[0]), metal(palette[1]), glow(palette[2])];
  const body = hydraBack(base, trim),
    necks = hydraNecks(base),
    heads = group();
  body.add(necks, heads);
  necks.children.forEach((_, i) => heads.add(hydraHead(trim, eye, base, i)));
  return {
    root: body,
    parts: { body, necks, heads },
    animate(t, p, progress, look) {
      necks.children.forEach((neck, i) => {
        neck.rotation.z = 0.063 * Math.sin(t * 1.3 + i);
        neck.rotation.x = 0.09 * Math.sin(t * 1.1 + i * 1.7);
        const head = heads.children[i];
        head.position.fromArray(neck.userData.tip).applyQuaternion(neck.quaternion).add(neck.position);
        head.rotation.y = look + (i - 4) * 0.14;
        const active = progress >= 0 && Math.min(8, Math.floor(progress * 9)) === i;
        head.userData.breath.visible = active;
        head.userData.breath.scale.z = 0.7 + 0.35 * Math.sin(t * 28);
      });
    },
  };
}

function chaosShell(base, budget) {
  const shell = group();
  const skin = new T.MeshPhysicalMaterial({
    color: base,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    roughness: 0.32,
    transmission: budget.transmission,
    thickness: 0.22,
  });
  oval(shell, skin, [0, 1.31, 0], [0.89, 0.76, 1.07]);
  return shell;
}
function lightCore(light) {
  const core = group();
  for (let i = 0; i < 5; i++) oval(core, light, [0, 1.3, 0], [0.16, 0.23, 0.22]);
  return core;
}
function fourWings(trim) {
  const wings = group();
  for (const s of [-1, 1])
    for (const z of [-0.39, 0.42]) {
      const wing = group();
      wing.position.set(s * 0.54, 1.52, z);
      const blade = oval(wing, trim, [s * 0.36, 0.28, -0.12], [0.5, 0.19, 0.23]);
      blade.rotation.z = s * 0.55;
      for (let k = 0; k < 3; k++)
        horn(
          wing,
          trim,
          [
            [s * 0.28, 0.26, -k * 0.075],
            [s * 0.64, 0.47, -k * 0.12],
            [s * (1 - k * 0.09), 0.68 - k * 0.1, -0.2 - k * 0.14],
          ],
          0.105,
        );
      wings.add(wing);
    }
  return wings;
}
export function chaos({ palette }, budget) {
  const shell = chaosShell(palette[0], budget),
    core = lightCore(glow(palette[2])),
    wings = fourWings(metal(palette[1]));
  const feet = limbs(metal(palette[0]), metal(palette[1]), 6),
    root = group();
  root.add(shell, core, feet, wings);
  const verts = shell.children[0].geometry.attributes.position,
    original = verts.array.slice();
  return {
    root,
    parts: { body: shell, core, feet, wings },
    animate(t, p) {
      for (let i = 0; i < verts.count; i++) {
        const x = original[i * 3],
          y = original[i * 3 + 1],
          z = original[i * 3 + 2];
        const k = 1 + (0.035 + 0.065 * p) * Math.sin(3 * x + 3 * z + t * 3) * Math.cos(2 * y - t * 2);
        verts.setXYZ(i, x * k, y * k, z * k);
      }
      verts.needsUpdate = true;
      core.children.forEach((o, i) =>
        o.position.set(
          0.44 * Math.sin(t + i),
          1.36 + 0.31 * Math.cos(t * 1.6 + i * 2),
          0.54 * Math.cos(t + i),
        ),
      );
      wings.children.forEach(
        (w, i) => (w.rotation.z = (i < 2 ? -1 : 1) * (0.09 + p * 0.35) * Math.sin(t * 3 + (i % 2))),
      );
    },
  };
}

function tigerBody(base, trim) {
  const body = limbs(base, trim);
  oval(body, base, [0, 1.32, -0.11], [0.73, 0.59, 1.11]);
  horn(
    body,
    base,
    [
      [0, 1.22, -0.9],
      [0.25, 1.36, -1.45],
      [0.55, 1.5, -1.6],
      [0.64, 1.69, -1.47],
    ],
    0.15,
  );
  for (const s of [-1, 1])
    for (let j = 0; j < 4; j++)
      oval(
        body,
        trim,
        [s * (0.67 - Math.abs(j - 1.5) * 0.03), 1.48, 0.53 - j * 0.32],
        [0.052, 0.26, 0.061],
      ).rotation.x = -0.34;
  return body;
}
function longMane(trim, count) {
  const mane = group();
  const hair = new T.InstancedMesh(new T.ConeGeometry(0.052, 0.53, 4), trim, count);
  mane.add(hair);
  hair.frustumCulled = false;
  const stem = new T.Object3D(),
    strands = [];
  for (let i = 0; i < count; i++) {
    const a = i * 2.39996,
      z = -0.87 + (1.7 * (i + 0.5)) / count,
      radius = Math.sqrt(1 - (z / 1.13) ** 2);
    strands.push([0.73 * Math.sin(a) * radius, 1.35 + Math.abs(Math.cos(a)) * 0.56 * radius, z, a]);
  }
  mane.userData.wind = (t, p) => {
    strands.forEach(([x, y, z, a], i) => {
      stem.position.set(x, y, z);
      stem.rotation.set(-0.95 + (0.12 + p * 0.37) * Math.sin(t * 3 + a), 0, -x * 0.95);
      stem.updateMatrix();
      hair.setMatrixAt(i, stem.matrix);
    });
    hair.instanceMatrix.needsUpdate = true;
  };
  return mane;
}
export function taowu({ palette }, budget) {
  const base = metal(palette[0]),
    trim = metal(palette[1]),
    body = tigerBody(base, trim),
    mane = longMane(trim, budget.fur);
  const head = face(base, trim, glow(palette[2]), { boar: true });
  head.position.set(0, 1.59, 0.97);
  body.add(mane, head);
  return {
    root: body,
    parts: { body, mane, head },
    head,
    animate(t, p) {
      mane.userData.wind(t, p);
      head.rotation.z = 0.14 * p * Math.sin(t * 12);
    },
  };
}
