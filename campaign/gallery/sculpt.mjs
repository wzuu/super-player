import * as T from 'three';

export const group = () => new T.Group();
export const metal = (color, metalness = 0.22, roughness = 0.62) =>
  new T.MeshStandardMaterial({ color, metalness, roughness });
export const glow = (color) => new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1 });

export function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const object = new T.Mesh(geometry, material);
  object.position.set(x, y, z);
  parent.add(object);
  return object;
}
export function oval(parent, material, at, scale) {
  const object = mesh(parent, new T.SphereGeometry(1, 24, 16), material, ...at);
  object.scale.set(...scale);
  return object;
}
export function plate(parent, material, at, size) {
  return mesh(parent, new T.BoxGeometry(...size), material, ...at);
}
export function tube(parent, material, points, radius) {
  const path = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)));
  return mesh(parent, new T.TubeGeometry(path, 24, radius, 9, false), material);
}
// 沿弯曲中心线收尖，角、獠牙和爪尖均有连续的锥度。
export function horn(parent, material, points, radius) {
  const path = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)));
  const geo = new T.TubeGeometry(path, 18, radius, 9, false);
  const vertices = geo.attributes.position;
  const v = new T.Vector3();
  for (let i = 0; i <= 18; i++) {
    const center = path.getPointAt(i / 18);
    for (let j = 0; j <= 9; j++) {
      const index = i * 10 + j;
      v.fromBufferAttribute(vertices, index)
        .sub(center)
        .multiplyScalar(1 - (i / 18) * 0.99)
        .add(center);
      vertices.setXYZ(index, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return mesh(parent, geo, material);
}

export function limbs(mat, claw, count = 4) {
  const legs = group();
  for (let i = 0; i < count; i++) {
    const side = i % 2 ? 1 : -1;
    const leg = group();
    leg.position.set(side * 0.53, 1.12, 0.64 - (1.28 * Math.floor(i / 2)) / (count / 2 - 1));
    legs.add(leg);
    oval(leg, mat, [0, -0.28, 0], [0.25, 0.48, 0.3]);
    oval(leg, mat, [side * 0.045, -0.73, 0.03], [0.15, 0.35, 0.18]);
    oval(leg, mat, [side * 0.05, -1, 0.13], [0.23, 0.13, 0.32]);
    for (let toe = -1; toe <= 1; toe++)
      horn(
        leg,
        claw,
        [
          [toe * 0.11, -0.98, 0.27],
          [toe * 0.13, -0.97, 0.38],
          [toe * 0.14, -1.08, 0.49],
        ],
        0.055,
      );
  }
  return legs;
}
export function face(base, trim, light, { boar = false } = {}) {
  const head = group();
  oval(head, base, [0, 0, 0], [0.55, 0.49, 0.46]);
  oval(head, trim, [0, -0.16, 0.37], boar ? [0.41, 0.23, 0.29] : [0.29, 0.21, 0.21]);
  for (const s of [-1, 1]) {
    oval(head, base, [s * 0.38, 0.36, -0.09], [0.18, 0.26, 0.13]).rotation.z = -s * 0.5;
    oval(head, light, [s * 0.265, 0.08, 0.38], [0.125, 0.074, 0.067]);
    oval(head, base, [s * 0.14, -0.14, boar ? 0.63 : 0.56], [0.053, 0.045, 0.027]);
    oval(head, trim, [s * 0.26, 0.2, 0.33], [0.2, 0.065, 0.1]).rotation.z = s * 0.25;
    if (boar)
      horn(
        head,
        trim,
        [
          [s * 0.29, -0.29, 0.42],
          [s * 0.54, -0.18, 0.5],
          [s * 0.61, 0.16, 0.42],
        ],
        0.11,
      );
  }
  return head;
}
export function texture(draw, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  map.wrapS = map.wrapT = T.RepeatWrapping;
  return map;
}
export function bronzePatina(base) {
  const mat = metal('#ffffff', 0.57, 0.52);
  mat.map = texture((ctx, n) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, n, n);
    for (let i = 0; i < 450; i++) {
      ctx.fillStyle = i % 3 ? '#4e867855' : '#342e2555';
      ctx.fillRect((i * 71) % n, (i * i * 13 + i * 7) % n, 2 + (i % 6), 2 + (i % 4));
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#c69b62';
    for (let x = 0; x < n; x += 32)
      for (let y = 0; y < n; y += 32) {
        ctx.beginPath();
        ctx.moveTo(x, y + 28);
        ctx.lineTo(x + 27, y + 28);
        ctx.lineTo(x + 27, y + 5);
        ctx.lineTo(x + 7, y + 5);
        ctx.lineTo(x + 7, y + 20);
        ctx.lineTo(x + 19, y + 20);
        ctx.lineTo(x + 19, y + 12);
        ctx.stroke();
      }
  });
  mat.map.repeat.set(3, 2);
  return mat;
}

export function halo(color) {
  const map = texture((ctx, n) => {
    const fade = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    fade.addColorStop(0, '#fff');
    fade.addColorStop(0.25, '#ffffff88');
    fade.addColorStop(1, '#fff0');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, n, n);
  }, 32);
  const sprite = new T.Sprite(
    new T.SpriteMaterial({
      map,
      color,
      blending: T.AdditiveBlending,
      transparent: true,
      opacity: 0.64,
      depthWrite: false,
    }),
  );
  sprite.raycast = () => {};
  return sprite;
}

export function disposeObject(root) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  root.traverse((node) => {
    if (node.geometry && !node.isSprite) geometries.add(node.geometry);
    if (node.isInstancedMesh) node.dispose();
    for (const material of [].concat(node.material || [])) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value?.isTexture && !value.isRenderTargetTexture) textures.add(value);
    }
    if (node.isReflector) node.getRenderTarget().dispose();
  });
  root.removeFromParent();
  geometries.forEach((value) => value.dispose());
  materials.forEach((value) => value.dispose());
  textures.forEach((value) => value.dispose());
}
