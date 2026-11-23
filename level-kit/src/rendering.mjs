import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRifleEnvironment } from '@level-kit/rifle-model.mjs';

export function createRendering({ CONFIG, definition, canvas }) {
  const stamp = new THREE.Object3D();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(definition.background ?? 0x283b59);
  scene.fog = new THREE.FogExp2(definition.fog ?? 0x344865, CONFIG.map.fog);
  const camera = new THREE.PerspectiveCamera(73, 1, 0.045, 155);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.07;
  renderer.info.autoReset = false;
  const composer = new EffectComposer(renderer);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.52, 0.63, 0.75);
  composer.addPass(new RenderPass(scene, camera));
  // 武器单独清深度，避免穿墙时被裁去，同时保留模型自身遮挡和透明材质。
  const weaponScene = new THREE.Scene();
  const weaponCamera = new THREE.PerspectiveCamera(camera.fov, 1, camera.near, 5);
  weaponScene.environment = createRifleEnvironment();
  const weaponAmbient = new THREE.HemisphereLight(0xe6f4ff, 0x736863, 1.35);
  const weaponKey = new THREE.DirectionalLight(0xffedda, 1.7);
  const weaponFill = new THREE.DirectionalLight(0xaddbff, .82);
  weaponKey.position.set(-1.4, 1.9, 1.4);
  weaponFill.position.set(1, .5, -2);
  weaponScene.add(weaponAmbient, weaponKey, weaponFill);
  class WeaponPass extends RenderPass {
    render(renderer, writeBuffer, readBuffer) {
      renderer.setRenderTarget(readBuffer);
      super.render(renderer, writeBuffer, readBuffer);
    }
  }
  const weaponPass = new WeaponPass(weaponScene, weaponCamera);
  weaponPass.clear = false;
  weaponPass.clearDepth = true;
  weaponPass.enabled = false;
  composer.addPass(weaponPass);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function canvasTexture(w, h, paint, tiled = false) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    paint(canvas.getContext('2d'), w, h);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    if (tiled) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  const shapes = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
    stone: new THREE.DodecahedronGeometry(0.65, 0),
    plane: new THREE.PlaneGeometry(1, 1),
  };

  class StaticBatches {
    constructor(materials, geometries = shapes) {
      this.groups = new Map();
      this.materials = materials;
      this.geometries = geometries;
    }
    add(kind, mat, x, y, z, w, h, d, color = 0xffffff, yaw = 0, pitch = 0, roll = 0) {
      const key = kind + '/' + mat;
      if (!this.groups.has(key)) this.groups.set(key, { kind, mat, rows: [] });
      stamp.position.set(x, y, z); stamp.rotation.set(pitch, yaw, roll); stamp.scale.set(w, h, d);
      stamp.updateMatrix();
      this.groups.get(key).rows.push({ matrix: stamp.matrix.clone(), color: color?.isColor ? color : new THREE.Color(color) });
    }
    flush(parent = scene) {
      for (const { kind, mat, rows } of this.groups.values()) {
        const mesh = new THREE.InstancedMesh(this.geometries[kind], this.materials[mat], rows.length);
        for (let i = 0; i < rows.length; i++) {
          mesh.setMatrixAt(i, rows[i].matrix); mesh.setColorAt(i, rows[i].color);
        }
        mesh.computeBoundingSphere();
        parent.add(mesh);
      }
      this.groups.clear();
    }
  }

  function dynamicMesh(geometry, material, capacity) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  }

  function updateMesh(mesh, count) {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  function setInstance(mesh, i, x, y, z, w, h, d, color, yaw = 0, pitch = 0, roll = 0) {
    stamp.position.set(x, y, z); stamp.scale.set(w, h, d); stamp.rotation.set(pitch, yaw, roll, 'YXZ');
    stamp.updateMatrix(); mesh.setMatrixAt(i, stamp.matrix);
    if (color) mesh.setColorAt(i, color);
  }

  return { THREE, scene, camera, renderer, composer, bloom, weaponScene, weaponCamera, weaponPass,
    canvasTexture, shapes, StaticBatches, stamp, dynamicMesh, updateMesh, setInstance, mergeGeometries };
}
