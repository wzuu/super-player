import {creatureParts} from '@level-kit/stage-craft.mjs';

export function yokaiModel(type, helpers, rage = false) {
  const { add, finish } = creatureParts(helpers);
  const coal = 0x352c45,
    lacquer = 0xb95557,
    gold = 0xfbd793,
    paper = 0xf1ddd5,
    fur = 0xe8cab7;
  const eye = (x, y, z, w = 0.12) => add('gem', gold, x, y, z, w, 0.1, w, 0, 0, 0, true);
  if (type === 0) {
    add('horn', lacquer, 0, 0.81, 0, 0.95, 0.6, 0.95);
    add('cylinder', paper, 0, 0.58, 0.02, 0.42, 0.34, 0.42);
    add('box', coal, 0, 0.27, 0.0, 0.12, 0.55, 0.14);
    add('box', coal, 0, 0.08, 0.1, 0.3, 0.1, 0.4);
    eye(0, 0.68, 0.27, 0.21);
  } else if (type === 1) {
    add('gem', coal, 0, 0.89, -0.15, 1.35, 1.25, 1.6);
    add('gem', lacquer, 0, 1.38, 0.34, 0.95, 1.1, 0.86);
    for (const s of [-1, 1]) {
      add('horn', paper, 0.33 * s, 1.85, 0.4, 0.2, 0.8, 0.22, 0, -0.28 * s);
      for (let k = 0; k < 4; k++)
        add('box', coal, s * (0.48 + 0.05 * k), 0.48, -0.64 + 0.32 * k, 0.15, 1.04, 0.14, 0, 0.5 * s);
      eye(s * 0.21, 1.52, 0.72);
    }
  } else if (type === 2) {
    add('cylinder', lacquer, 0, 0.89, 0, 1.53, 0.26, 1.53, Math.PI / 2);
    add('cylinder', coal, 0, 0.89, 0.15, 1.12, 0.1, 1.12, Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      add('horn', gold, Math.sin(a) * 0.66, 0.89 + Math.cos(a) * 0.66, 0, 0.21, 0.54, 0.28, 0, -a);
    }
    add('gem', paper, 0, 0.91, 0.26, 0.63, 0.85, 0.44);
    eye(-0.14, 1.02, 0.44);
    eye(0.14, 1.02, 0.44);
  } else {
    add('gem', fur, 0, 1.55, 0, 1.68, 2.48, 1.79);
    add('gem', paper, 0, 2.92, 0.39, 1.34, 1.19, 1.18);
    add('horn', coal, 0, 2.82, 1.01, 0.59, 0.71, 0.62, Math.PI / 2);
    for (const s of [-1, 1]) {
      add('horn', lacquer, s * 0.43, 3.59, 0.32, 0.47, 0.85, 0.49, 0, -s * 0.18);
      for (const z of [-0.49, 0.42]) add('box', coal, s * 0.51, 0.58, z, 0.36, 1.06, 0.42);
      eye(s * 0.31, 3.02, 0.88, 0.17);
    }
    const tails = rage ? 9 : 4;
    for (let i = 0; i < tails; i++) {
      const a = (i - (tails - 1) / 2) * 0.2;
      add(
        'gem',
        rage ? gold : fur,
        Math.sin(a) * 1.85,
        1.86 + Math.cos(a) * 0.61,
        -1.15,
        0.45,
        2.2,
        0.54,
        -0.68,
        -a,
      );
    }
  }
  return finish();
}
