import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function createShotgun(id, skin) {
  const root = new THREE.Group(),
    magazine = new THREE.Group();
  root.name = id;
  root.add(magazine);
  const parts = new Map();
  function piece(group, color, geo, x, y, z, roll = 0) {
    geo.rotateZ(roll).translate(x, y, z);
    const shape = geo.toNonIndexed();
    geo.dispose();
    const key = group.id + color;
    if (!parts.has(key)) parts.set(key, { group, color, shapes: [] });
    parts.get(key).shapes.push(shape);
  }
  const box = (g, c, x, y, z, w, h, d, r = 0) => piece(g, c, new THREE.BoxGeometry(w, h, d), x, y, z, r);
  const tube = (g, c, x, y, z, r, len) =>
    piece(g, c, new THREE.CylinderGeometry(r, r, len, 14), x, y, z, Math.PI / 2);
  box(root, skin.dark, -0.43, -0.02, 0, 0.37, 0.145, 0.12, 0.12);
  box(root, skin.base, -0.05, 0.012, 0, 0.47, 0.17, 0.144);
  box(root, skin.dark, -0.13, -0.099, 0, 0.085, 0.18, 0.11, -0.25);
  tube(root, skin.trim, 0.52, 0.06, 0, 0.048, 0.78);
  tube(root, skin.base, 0.46, -0.032, 0, 0.043, 0.68);
  for (let i = 0; i < 6; i++)
    tube(magazine, i % 2 ? skin.dark : skin.trim, 0.29 + i * 0.036, -0.027, 0, 0.065, 0.035);
  for (let i = 0; i < 4; i++)
    piece(
      root,
      skin.trim,
      new THREE.CylinderGeometry(0.018, 0.018, 0.096, 8),
      -0.15 + i * 0.055,
      0.01,
      0.085,
      0.14,
    );
  box(root, skin.light, 0.83, 0.12, 0, 0.035, 0.035, 0.02);
  for (const { group, color, shapes } of parts.values()) {
    group.add(
      new THREE.Mesh(
        mergeGeometries(shapes),
        new THREE.MeshStandardMaterial({ color, roughness: skin.roughness, metalness: skin.metalness }),
      ),
    );
    shapes.forEach((geo) => geo.dispose());
  }
  return {
    root,
    magazine,
    muzzle: new THREE.Vector3(0.92, 0.06, 0),
    update(time, signals) {
      magazine.position.x = signals?.shot ? -0.07 : 0;
    },
    dispose() {
      root.removeFromParent();
      root.traverse((part) => {
        if (part.isMesh) {
          part.geometry.dispose();
          part.material.dispose();
        }
      });
    },
  };
}
