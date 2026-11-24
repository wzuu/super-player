import {creatureParts} from '@level-kit/stage-craft.mjs';

export function clockworkModel(type, helpers, rage = false) {
  const { add, finish } = creatureParts(helpers);
  const iron = 0x414957,
    bronze = 0xb77846,
    brass = 0xd7a966,
    fire = 0xffb64e;
  const lamp = (x, y, z, w, h = w) => add('gem', fire, x, y, z, w, h, w, 0, 0, 0, true);
  if (type === 0) {
    add('gem', bronze, 0, 0.47, 0, 0.67, 0.67, 1.01);
    add('horn', brass, 0, 0.47, 0.51, 0.43, 0.59, 0.41, Math.PI / 2);
    for (const s of [-1, 1]) {
      add('cylinder', iron, s * 0.25, 0.26, -0.22, 0.38, 0.13, 0.38, 0, Math.PI / 2);
      add('cylinder', brass, s * 0.23, 0.73, 0.2, 0.29, 0.11, 0.29, 0, Math.PI / 2);
      lamp(s * 0.16, 0.58, 0.39, 0.092);
    }
    add('horn', iron, 0, 0.4, -0.69, 0.11, 0.81, 0.13, -1.28);
  } else if (type === 1) {
    add('cylinder', bronze, 0, 1.13, -0.05, 1.1, 1.2, 0.97);
    add('box', iron, 0, 1.76, 0.12, 0.67, 0.51, 0.62);
    add('box', brass, 0, 1.28, 0.44, 0.9, 0.5, 0.2);
    lamp(0, 1.78, 0.44, 0.33, 0.16);
    for (const s of [-1, 1]) {
      add('cylinder', iron, s * 0.31, 0.38, 0.01, 0.38, 0.74, 0.41);
      add('box', bronze, s * 0.66, 0.92, 0.02, 0.34, 0.83, 0.49);
      add('cylinder', brass, s * 0.63, 1.48, 0.02, 0.58, 0.41, 0.58);
    }
  } else if (type === 2) {
    add('gem', iron, 0, 0.79, 0, 1.09, 0.76, 1.1);
    add('cylinder', bronze, 0, 1.16, 0.04, 0.73, 0.64, 0.77);
    add('cylinder', brass, 0, 1.41, 0.5, 0.27, 0.83, 0.27, Math.PI / 2);
    lamp(0, 1.44, 0.91, 0.18);
    for (const s of [-1, 1])
      for (let j = 0; j < 4; j++)
        add('box', bronze, s * 0.55, 0.46, -0.42 + 0.26 * j, 0.15, 1.05, 0.14, 0, s * 0.55);
  } else {
    add('cylinder', bronze, 0, 2.12, -0.12, 1.95, 1.68, 1.51);
    add('box', iron, 0, 3.09, 0.2, 1.25, 0.91, 1.14);
    lamp(0, 3.17, 0.81, 0.67, 0.23);
    for (let k = -2; k <= 2; k++)
      add('box', rage ? fire : brass, k * 0.22, 2.13, 0.69, 0.12, 0.89, 0.1, 0, 0, 0, rage);
    for (const s of [-1, 1]) {
      add('box', iron, s * 0.49, 0.68, 0.0, 0.57, 1.37, 0.75);
      add('cylinder', brass, s * 1.02, 2.48, 0.03, 0.83, 0.66, 0.85, 0, Math.PI / 2);
      add('box', bronze, s * 1.13, 1.67, 0.14, 0.58, 1.04, 0.67);
      add('cylinder', iron, s * 0.7, 3.02, -0.48, 0.32, rage ? 1.56 : 0.98, 0.32);
      if (rage) lamp(s * 0.7, 3.9, -0.48, 0.29, 0.42);
    }
  }
  return finish();
}
