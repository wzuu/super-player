import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function createShotgun(id, skin) {
  const root=new THREE.Group(), magazine=new THREE.Group();
  root.name=id; root.add(magazine);
  const parts=new Map();
  function piece(group,color,geo,x,y,z,roll=0) {
    geo.rotateZ(roll).translate(x,y,z);
    const shape=geo.toNonIndexed(); geo.dispose();
    const key=group.id+color;
    if (!parts.has(key)) parts.set(key,{group,color,shapes:[]});
    parts.get(key).shapes.push(shape);
  }
  const box=(g,c,x,y,z,w,h,d,r=0)=>piece(g,c,new THREE.BoxGeometry(w,h,d),x,y,z,r);
  const tube=(g,c,x,y,z,r,len)=>piece(g,c,new THREE.CylinderGeometry(r,r,len,14),x,y,z,Math.PI/2);
  box(root,skin.dark,-.43,-.02,0,.37,.145,.12,.12);
  box(root,skin.base,-.05,.012,0,.47,.17,.144);
  box(root,skin.dark,-.13,-.099,0,.085,.18,.11,-.25);
  tube(root,skin.trim,.52,.06,0,.048,.78);
  tube(root,skin.base,.46,-.032,0,.043,.68);
  for (let i=0;i<6;i++) tube(magazine,i%2?skin.dark:skin.trim,.29+i*.036,-.027,0,.065,.035);
  for (let i=0;i<4;i++) piece(root,skin.trim,new THREE.CylinderGeometry(.018,.018,.096,8),-.15+i*.055,.01,.085,.14);
  box(root,skin.light,.83,.12,0,.035,.035,.02);
  for (const {group,color,shapes} of parts.values()) {
    group.add(new THREE.Mesh(mergeGeometries(shapes),new THREE.MeshStandardMaterial({color,roughness:skin.roughness,metalness:skin.metalness})));
    shapes.forEach(geo=>geo.dispose());
  }
  return {root,magazine,muzzle:new THREE.Vector3(.92,.06,0),
    update(time,signals) {magazine.position.x=signals?.shot ? -.07 : 0;},
    dispose() {root.removeFromParent();root.traverse(part=>{if(part.isMesh){part.geometry.dispose();part.material.dispose();}});}};
}
