import * as T from 'three';
import { group, mesh, oval, metal, glow, plate, tube, horn, limbs, texture, halo } from './sculpt.mjs';

function ribCage(bone) {
  const ribs = group();
  for (let i = 0; i < 9; i++) {
    const z = 0.83 - i * 0.22,
      span = 0.65 - 0.025 * Math.abs(3 - i);
    oval(ribs, bone, [0, 1.68, z], [0.17, 0.13, 0.15]);
    horn(
      ribs,
      bone,
      [
        [0, 1.73, z],
        [0, 1.88, z - 0.05],
        [0, 1.99, z - 0.12],
      ],
      0.09,
    );
    for (const s of [-1, 1])
      tube(
        ribs,
        bone,
        [
          [s * 0.08, 1.65, z],
          [s * span * 0.84, 1.61, z + 0.04],
          [s * span, 1.28, z + 0.07],
          [s * span * 0.6, 0.98, z + 0.1],
          [s * 0.13, 0.89, z + 0.11],
        ],
        0.065,
      );
  }
  return ribs;
}
function skeletalLegs(bone) {
  const legs = group();
  for (const s of [-1, 1])
    for (const z of [-0.69, 0.65]) {
      const leg = group();
      leg.position.set(s * 0.49, 1.38, z);
      legs.add(leg);
      const knee = [s * 0.12, -0.64, -0.09];
      tube(leg, bone, [[0, 0, 0], [s * 0.07, -0.33, -0.03], knee], 0.115);
      oval(leg, bone, knee, [0.15, 0.14, 0.13]);
      tube(leg, bone, [knee, [s * 0.1, -0.94, 0.02], [s * 0.07, -1.22, 0.07]], 0.073);
      for (let i = -1; i <= 1; i++)
        horn(
          leg,
          bone,
          [
            [s * 0.07, -1.23, 0.06],
            [s * 0.07 + i * 0.07, -1.29, 0.2],
            [s * 0.07 + i * 0.12, -1.32, 0.4],
          ],
          0.066,
        );
    }
  return legs;
}
function hornedSkull(bone) {
  const head = group();
  head.position.set(0, 1.69, 0.94);
  oval(head, bone, [0, 0.01, 0], [0.46, 0.37, 0.34]);
  oval(head, bone, [0, -0.17, 0.33], [0.27, 0.18, 0.32]);
  const dark = metal('#252735');
  for (const s of [-1, 1]) {
    oval(head, dark, [s * 0.29, 0.037, 0.24], [0.16, 0.13, 0.1]);
    horn(
      head,
      bone,
      [
        [s * 0.32, 0.2, -0.09],
        [s * 0.6, 0.5, -0.19],
        [s * 0.65, 0.86, -0.48],
      ],
      0.15,
    );
    horn(
      head,
      bone,
      [
        [s * 0.19, -0.23, 0.49],
        [s * 0.2, -0.35, 0.52],
        [s * 0.16, -0.46, 0.52],
      ],
      0.07,
    );
    oval(head, dark, [s * 0.09, -0.17, 0.595], [0.046, 0.08, 0.037]);
  }
  return head;
}
function soulFire(light) {
  const fire = group();
  for (const s of [-1, 1]) {
    const wisp = group();
    wisp.position.set(s * 0.29, 0.04, 0.315);
    fire.add(wisp);
    oval(wisp, light, [0, 0, 0.02], [0.097, 0.08, 0.06]);
    horn(
      wisp,
      light,
      [
        [0, 0.01, 0],
        [s * 0.04, 0.14, 0],
        [0, 0.28, -0.05],
      ],
      0.075,
    );
  }
  return fire;
}
export function bone({ palette }) {
  const root = group(),
    ribs = ribCage(metal(palette[0])),
    legs = skeletalLegs(metal(palette[0]));
  const head = hornedSkull(metal(palette[1])),
    flame = soulFire(glow(palette[2]));
  head.add(flame);
  root.add(ribs, legs, head);
  return {
    root,
    parts: { ribs, head, flame, legs },
    head,
    animate(t, p) {
      legs.children.forEach(
        (o, i) => (o.rotation.x = (i === 0 || i === 3 ? 1 : -1) * Math.sin(t * 6) * (0.035 + 0.48 * p)),
      );
      flame.children.forEach((o, i) => (o.scale.y = 1 + 0.21 * Math.sin(t * 13 + i)));
    },
  };
}

function basaltArmor(base, trim, light) {
  const flowing = light.clone();
  flowing.emissiveMap = texture((ctx, n) => {
    const img = ctx.createImageData(n, n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const u = (x * 2 * Math.PI) / n,
          v = (y * 2 * Math.PI) / n;
        const heat = 0.5 + 0.5 * Math.sin(u * 3 + 2 * Math.sin(v * 2) + Math.sin(u + v));
        img.data.set([100 + 155 * heat, 35 + 212 * heat, 20 + 100 * heat, 255], (y * n + x) * 4);
      }
    ctx.putImageData(img, 0, 0);
  });
  flowing.color.set('#9c2916');
  const body = group(),
    core = oval(body, flowing, [0, 1.3, -0.12], [0.71, 0.56, 1.02]);
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 9; col++) {
      const a = ((col + row * 0.45) * Math.PI * 2) / 9,
        z = (row - 2) * 0.39,
        k = Math.sqrt(1 - (z / 1.16) ** 2);
      const stone = mesh(
        body,
        new T.DodecahedronGeometry(1),
        (row + col) % 3 ? base : trim,
        Math.cos(a) * 0.71 * k,
        1.31 + Math.sin(a) * 0.58 * k,
        z - 0.12,
      );
      stone.rotation.set(0.19 * col, a, 0.31 * row);
      stone.scale.set(0.26 * k, 0.24 * k, 0.235);
    }
  body.userData.core = core;
  return body;
}
function furnaceHead(stone, light) {
  const head = group();
  head.position.set(0, 1.68, 0.99);
  const mask = mesh(head, new T.IcosahedronGeometry(0.5, 1), stone);
  mask.scale.set(1.08, 0.94, 0.82);
  for (const s of [-1, 1]) {
    const brow = plate(head, stone, [s * 0.29, 0.13, 0.28], [0.38, 0.19, 0.24]);
    brow.rotation.z = s * 0.21;
    oval(head, light, [s * 0.24, 0.025, 0.379], [0.14, 0.039, 0.04]);
    horn(
      head,
      stone,
      [
        [s * 0.33, 0.22, -0.1],
        [s * 0.52, 0.41, -0.21],
        [s * 0.61, 0.59, -0.42],
      ],
      0.13,
    );
  }
  return head;
}
function crystal(stone, at, budget) {
  const part = group();
  part.position.set(...at);
  oval(part, stone, [0, 0, 0], [0.2, 0.16, 0.17]);
  mesh(part, new T.OctahedronGeometry(0.155), glow('#ffe593'), 0, 0.09, 0.07).scale.set(0.86, 1.4, 0.81);
  if (budget.sparks > 8) {
    const bloom = halo('#ff9f3c');
    bloom.position.set(0, 0.11, 0.1);
    bloom.scale.setScalar(0.65);
    part.add(bloom);
  }
  return part;
}
function embers(light, count) {
  const sparks = group();
  for (let i = 0; i < count; i++) mesh(sparks, new T.TetrahedronGeometry(0.035), light);
  return sparks;
}
export function lava({ palette }, budget) {
  const base = metal(palette[0]),
    trim = metal(palette[1]),
    light = glow(palette[2]);
  const root = group(),
    plates = basaltArmor(base, trim, light),
    head = furnaceHead(trim, light),
    legs = limbs(base, trim);
  const crown = crystal(base, [0, 0.32, 0.28], budget),
    left = crystal(base, [0.66, 1.67, 0.59], budget),
    right = crystal(base, [-0.66, 1.67, 0.59], budget);
  head.add(crown);
  root.add(plates, legs, head, left, right);
  const sparks = embers(light, budget.sparks);
  root.add(sparks);
  const summons = group();
  root.add(summons);
  for (const side of [-1, 1]) {
    const spawn = group();
    spawn.position.set(side * 1.39, 0, 0.48);
    summons.add(spawn);
    const shell = mesh(spawn, new T.DodecahedronGeometry(0.31), trim, 0, 0.32, 0);
    shell.scale.z = 1.28;
    for (const s of [-1, 1]) {
      horn(
        spawn,
        base,
        [
          [s * 0.18, 0.4, 0.02],
          [s * 0.25, 0.64, -0.12],
          [s * 0.3, 0.76, -0.2],
        ],
        0.09,
      );
      oval(spawn, light, [s * 0.11, 0.34, 0.31], [0.06, 0.032, 0.05]);
      for (const z of [-0.17, 0.18]) oval(spawn, base, [s * 0.2, 0.13, z], [0.09, 0.15, 0.1]);
    }
  }
  return {
    root,
    parts: { plates, legs, head, crown, left, right },
    head,
    animate(t, p, progress, look, action) {
      const stomp = action === 'signature' && progress >= 0,
        burst = stomp ? Math.max(0, (progress - 0.48) * 2) : 0;
      legs.children[0].rotation.x =
        stomp && progress < 0.48 ? -Math.sin((progress / 0.48) * Math.PI) * 0.84 : 0;
      root.position.z = action === 'charge' ? p * 1.12 : 0;
      root.rotation.x = action === 'hit' ? -0.18 * p : 0;
      head.rotation.x = action === 'roar' ? -0.58 * p : 0;
      const raging = action === 'rage' ? p : 0;
      summons.visible = action === 'summon' && progress >= 0;
      summons.scale.y = Math.max(0.01, p);
      light.emissiveIntensity = 1.05 + 0.25 * Math.sin(t * 3.6) + raging * 3.2;
      plates.userData.core.scale.y = 0.56 + 0.025 * Math.sin(t * 3);
      plates.userData.core.material.emissiveMap.offset.set(t * 0.095, t * 0.041);
      sparks.children.forEach((spark, i) => {
        const summon = action === 'summon' && progress >= 0;
        spark.visible = summon || (burst > 0 && burst < 1);
        const angle = i * 2.39996 + (summon ? t : 0);
        const radius = summon ? 1.4 : burst * (0.7 + (i % 5) * 0.17);
        spark.position.set(
          (summon ? 0 : -0.53) + radius * Math.cos(angle),
          summon ? 0.2 + p * (1 + (i % 4) * 0.26) : 0.07 + Math.sin(burst * Math.PI) * (0.4 + (i % 6) * 0.13),
          (summon ? 0 : 0.77) + radius * Math.sin(angle),
        );
        spark.scale.setScalar(summon ? 2 + p * 2 : 1);
      });
      return stomp && burst > 0 ? Math.sin(burst * 34) * (1 - burst) ** 3 : 0;
    },
  };
}

function steelHull(base, trim) {
  const body = group();
  for (const s of [-1, 1])
    for (const z of [-0.63, 0.68]) {
      const hip = [s * 0.53, 1.23, z],
        knee = [s * 0.73, 0.69, z - 0.11],
        ankle = [s * 0.62, 0.22, z + 0.13];
      tube(body, trim, [hip, [s * 0.66, 0.94, z - 0.03], knee], 0.135);
      const hinge = mesh(body, new T.CylinderGeometry(0.18, 0.18, 0.18, 12), base, ...knee);
      hinge.rotation.z = Math.PI / 2;
      tube(body, trim, [knee, [s * 0.66, 0.47, z + 0.02], ankle], 0.085);
      plate(body, base, [s * 0.62, 0.13, z + 0.16], [0.32, 0.18, 0.47]);
    }
  plate(body, base, [0, 1.28, 0], [1.06, 0.74, 1.74]);
  for (const s of [-1, 1])
    for (let i = 0; i < 4; i++) {
      const panel = plate(body, trim, [s * 0.56, 1.45, 0.61 - i * 0.42], [0.21, 0.47, 0.35]);
      panel.rotation.z = -s * 0.28;
      oval(body, base, [s * 0.675, 1.51, 0.61 - i * 0.42], [0.033, 0.057, 0.057]);
    }
  return body;
}
function visorHead(base, trim, light) {
  const head = group();
  head.position.set(0, 1.59, 0.99);
  plate(head, base, [0, 0, 0], [0.77, 0.56, 0.62]);
  plate(head, trim, [0, 0.23, 0.09], [0.91, 0.12, 0.66]);
  for (const s of [-1, 1]) plate(head, light, [s * 0.22, 0.07, 0.32], [0.27, 0.068, 0.035]);
  plate(head, trim, [0, -0.17, 0.34], [0.48, 0.15, 0.21]);
  return head;
}
function conduits(trim) {
  const pipes = group();
  for (const s of [-1, 1])
    for (let i = 0; i < 3; i++) {
      const x = s * (0.6 + 0.06 * i);
      tube(
        pipes,
        trim,
        [
          [s * 0.44, 1.65, 0.82],
          [x, 1.3, 0.59],
          [x, 1.04 - i * 0.06, -0.15],
          [x, 1.23, -0.65],
          [s * 0.49, 1.55, -0.82],
        ],
        0.036,
      );
    }
  return pipes;
}
function radiator(base, light) {
  const vents = group();
  for (let i = 0; i < 6; i++) {
    plate(vents, base, [0, 1.72, 0.59 - i * 0.245], [0.52, 0.14, 0.13]);
    plate(vents, light, [0, 1.8, 0.59 - i * 0.245], [0.33, 0.025, 0.055]);
  }
  return vents;
}
export function mech({ palette }) {
  const base = metal(palette[0], 0.69, 0.32),
    trim = metal(palette[1], 0.74, 0.27),
    light = glow(palette[2]);
  const body = steelHull(base, trim),
    head = visorHead(base, trim, light),
    pipes = conduits(trim),
    vents = radiator(base, light);
  body.add(head, pipes, vents);
  const steam = group();
  vents.add(steam);
  for (let i = 0; i < 14; i++) {
    const mist = new T.MeshBasicMaterial({ color: '#d6e8ee', transparent: true, depthWrite: false });
    oval(steam, mist, [0, 0, 0], [0.1, 0.08, 0.1]);
  }
  return {
    root: body,
    parts: { body, head, pipes, vents },
    head,
    animate(t, p) {
      steam.visible = p > 0;
      steam.children.forEach((o, i) => {
        const u = (t * 1.3 + i * 0.17) % 1;
        o.position.set(Math.sin(i + t * 2) * u * 0.18, 1.81 + u * 0.8, 0.55 - (i % 6) * 0.24);
        o.scale.setScalar(0.055 + 0.17 * u);
        o.material.opacity = (1 - u) * p * 0.5;
      });
    },
  };
}

function smokeMaterial(trim) {
  return new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      clock: { value: 0 },
      dissolve: { value: 0 },
      edge: { value: new T.Color(trim) },
      highlight: { value: 0 },
    },
    vertexShader: `varying vec3 spot, normalView, toEye;
    void main(){spot=position;vec4 mv=modelViewMatrix*vec4(position,1.);
      normalView=normalMatrix*normal;toEye=-mv.xyz;gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 spot,normalView,toEye;
    uniform float clock,dissolve,highlight;uniform vec3 edge;
    float field(vec3 q){return sin(q.x+sin(q.y*1.8))*sin(q.z+cos(q.x));}
    void main(){vec3 q=spot*3.+vec3(.12,-.5,.14)*clock;
      float n=.5+.28*field(q)+.15*field(q*2.1)+.07*field(q*4.2);
      float rim=pow(1.-abs(dot(normalize(normalView),normalize(toEye))),1.6);
      float density=smoothstep(dissolve*.88-.22,dissolve*.88+.18,n);
      vec3 tint=mix(edge,vec3(.25,1.,.72),highlight);
      gl_FragColor=vec4(tint*(.12+2.2*rim+n*n),(.18+.63*n+.25*rim)*density);
      #include <colorspace_fragment>
    }`,
  });
}
function smokeBody(mat) {
  const body = limbs(mat, mat);
  oval(body, mat, [0, 1.29, -0.13], [0.64, 0.53, 1.13]);
  for (let i = 0; i < 4; i++)
    horn(
      body,
      mat,
      [
        [0, 1.26, -0.8],
        [0.15 * i - 0.21, 1.48, -1.23],
        [0.24 * i - 0.36, 1.77 + i * 0.08, -1.69],
      ],
      0.19,
    );
  return body;
}
function smokeCrown(mat) {
  const head = group();
  head.position.set(0, 1.73, 0.84);
  oval(head, mat, [0, 0, 0], [0.45, 0.4, 0.43]);
  oval(head, mat, [0, -0.12, 0.3], [0.3, 0.23, 0.38]);
  for (const s of [-1, 1])
    horn(
      head,
      mat,
      [
        [s * 0.28, 0.18, -0.1],
        [s * 0.34, 0.44, -0.16],
        [s * 0.46, 0.71, -0.28],
      ],
      0.16,
    );
  return head;
}
function nightEyes(light) {
  const eyes = group();
  for (const s of [-1, 1]) oval(eyes, light, [s * 0.25, 0.065, 0.34], [0.092, 0.059, 0.055]);
  return eyes;
}
export function shadow({ palette }) {
  const smoke = smokeMaterial(palette[1]),
    body = smokeBody(smoke),
    head = smokeCrown(smoke),
    eyes = nightEyes(glow(palette[2]));
  head.add(eyes);
  body.add(head);
  return {
    root: body,
    parts: { body, head, eyes },
    head,
    animate(t, p) {
      smoke.uniforms.clock.value = t;
      smoke.uniforms.dissolve.value = p;
    },
  };
}
