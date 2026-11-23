import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 经典脚本可以从 file:// 加载，再把同一套本地依赖提供给关卡的 ES 模块。
globalThis.levelThreeModules = () => {
  const modules = {
    three: THREE,
    'three/addons/controls/PointerLockControls.js': { PointerLockControls },
    'three/addons/controls/OrbitControls.js': { OrbitControls },
    'three/addons/objects/Reflector.js': { Reflector },
    'three/addons/postprocessing/EffectComposer.js': { EffectComposer },
    'three/addons/postprocessing/RenderPass.js': { RenderPass },
    'three/addons/postprocessing/UnrealBloomPass.js': { UnrealBloomPass },
    'three/addons/postprocessing/OutputPass.js': { OutputPass },
    'three/addons/postprocessing/ShaderPass.js': { ShaderPass },
    'three/addons/utils/BufferGeometryUtils.js': { mergeGeometries },
  };
  globalThis.levelThreeExports = modules;
  return Object.fromEntries(Object.entries(modules).map(([name, values]) => {
    const source = `export const {${Object.keys(values).join(',')}} = globalThis.levelThreeExports[${JSON.stringify(name)}];`;
    return [name, URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))];
  }));
};
