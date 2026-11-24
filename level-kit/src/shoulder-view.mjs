// 肩后相机只参与画面投影。命中与交互统一在玩家眼部位置结算。
export function createShoulderView(THREE, scene, rifle) {
  const body = new THREE.Group();
  const uniform = new THREE.MeshStandardMaterial({color:0x445867,roughness:.82});
  const armor = new THREE.MeshStandardMaterial({color:0x23333c,roughness:.62});
  const box = new THREE.BoxGeometry();
  function part(x,y,z,w,h,d,material) {
    const mesh = new THREE.Mesh(box, material);
    mesh.position.set(x,y,z); mesh.scale.set(w,h,d);
    body.add(mesh);
    return mesh;
  }
  part(0,1.07,0,.46,.65,.32,uniform);
  part(0,1.22,.07,.50,.37,.33,armor);
  part(0,1.61,0,.31,.29,.32,armor);
  const legs = [-1,1].map(sign=>part(.13*sign,.43,0,.19,.82,.21,uniform));
  for (const sign of [-1,1]) part(.28*sign,1.15,-.16,.15,.19,.51,uniform);
  const gun = rifle.root.clone(true);
  gun.scale.setScalar(.72); gun.position.set(.23,1.22,-.35); body.add(gun);
  scene.add(body); body.visible = false;
  const eye = new THREE.Vector3(), ray = new THREE.Vector3(), target = new THREE.Vector3(), probe = new THREE.Vector3();
  return {body, update(camera,player,game) {
    eye.copy(camera.position);
    camera.getWorldDirection(ray);
    const {depth} = game.weapon.scanSight(game,eye,ray);
    target.copy(eye).addScaledVector(ray,depth);
    ray.set(.66,.45,2.65).applyQuaternion(camera.quaternion);
    const distance = ray.length(); ray.divideScalar(distance);
    game.level.hash.ray(eye,ray,distance);
    let reach = Math.max(0,game.level.hash.depth-.14);
    // 用相机近裁面的包围体检查墙边和窄门，射线只用来求中心的最大距离。
    for (let d=.09;d<=reach+.09;d+=.09) {
      probe.copy(eye).addScaledVector(ray,Math.min(d,reach));
      if (game.level.blocked(probe.x,probe.z,probe.y-.09,.11,.18) || probe.y<game.level.base(probe.x,probe.z)+.09) {
        reach=Math.max(0,d-.10); break;
      }
    }
    camera.position.addScaledVector(ray,reach);
    camera.updateMatrixWorld(true);
    body.visible=reach>.53;
    body.position.set(player.x,player.y,player.z); body.rotation.y=player.look.rotation.y;
    body.scale.y=player.crouched ? .68 : 1;
    legs.forEach((leg,i)=>{leg.rotation.x=Math.sin(player.bob+i*Math.PI)*player.speedMix*.32;});
    // 肩后机位只平移。准星投影到眼部弹道上，近敌掠过时不重新旋转画面。
    return reach === 0 ? target.set(0,0,0) : target.project(camera);
  }};
}
