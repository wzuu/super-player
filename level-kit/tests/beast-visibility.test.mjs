import test from 'node:test';
import assert from 'node:assert/strict';
import '../vendor/three-r160.js';
import { BeastVisibility, wallCovers } from '../src/beast-visibility.mjs';

const modules = globalThis.levelThreeModules();
const THREE = globalThis.levelThreeExports.three;
for (const url of Object.values(modules)) URL.revokeObjectURL(url);

function setup() {
  const level = {viewOccluders:[], terrainRevision:0};
  const view = new BeastVisibility(THREE, {enabled:true, occlusion:true, occlusionRange:40}, level);
  const camera = new THREE.PerspectiveCamera(60, 1, .1, 200);
  camera.position.set(0,2,0);
  return {view, level, camera};
}

test('整片包围体投到实体墙内才遮挡，玻璃与跨层保留', () => {
  const {view, level, camera} = setup();
  const wall = {x0:-5,x1:5,z0:-5.1,z1:-4.9,y0:0,y1:4};
  view.begin(camera);
  assert.equal(view.visible(0,2,-12,1,1,1),true);
  level.viewOccluders.push(wall);
  level.terrainRevision++;
  view.begin(camera);
  assert.equal(view.visible(0,2,-12,1,1,1),false);
  assert.equal(view.visible(0,10,-12,1,1,1),true);
  assert.equal(wallCovers(wall,camera.position,12,2,-12,2,1,1),false);
  assert.equal(view.visible(0,2,-41,1,1,1),true);
  wall.active = false;
  assert.equal(view.visible(0,2,-12,1,1,1),true);
  wall.active = true;
  view.options.occlusion = false;
  assert.equal(view.visible(0,2,-12,1,1,1),true);
});

test('同格转身、视野变化和前景提示使用当帧相机与各自边界', () => {
  const {view, camera} = setup();
  view.begin(camera);
  assert.equal(view.visible(0,2,12,1,1,1),false);
  assert.equal(view.visible(0,2,-2,.1,.1,.5),true);
  camera.lookAt(0,2,12);
  view.begin(camera);
  assert.equal(view.visible(0,2,12,1,1,1),true);
  assert.equal(view.visible(5,2,10,.1,.1,.1),true);
  camera.fov = 24;
  camera.updateProjectionMatrix();
  view.begin(camera);
  assert.equal(view.visible(5,2,10,.1,.1,.1),false);
  view.options.enabled=false;
  assert.equal(view.visible(5,2,10,.1,.1,.1),true);
});

test('镜面开口保留主视野外的倒影，关闭镜面后恢复主视锥', () => {
  const {view, camera} = setup();
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(4,4));
  mirror.position.set(0,2,-6);
  view.setReflectors([mirror]);
  view.begin(camera);
  assert.equal(view.visible(0,2,3,.2,.2,.2,true),true);
  assert.equal(view.stats.reflectionKept,1);
  assert.equal(view.visible(10,2,3,.2,.2,.2),false);
  mirror.visible=false;
  view.begin(camera);
  assert.equal(view.visible(0,2,3,.2,.2,.2),false);
});
