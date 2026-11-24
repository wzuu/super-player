import {bossDangerAt} from '@level-kit/boss-ground.mjs';
// 两层同向折箭用深色轮廓区分明暗地面，与攻击警戒圈使用不同的形状。
export function createGroundDirections(THREE,scene,level) {
  const positions=[], colors=[], indices=[];
  function chevron(width,length,thickness,y,color) {
    const base=positions.length/3, tint=new THREE.Color(color);
    for (const [x,z] of [[-width,-length],[0,length],[width,-length],
                         [width-thickness,-length],[0,length-thickness],[-width+thickness,-length]]) {
      positions.push(x,y,z);colors.push(tint.r,tint.g,tint.b);
    }
    for (const i of [0,1,5,5,1,4,4,1,3,3,1,2]) indices.push(base+i);
  }
  chevron(.40,.34,.22,0,0x153e40);
  chevron(.34,.265,.12,.006,0x80efce);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);
  const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({
    vertexColors:true,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,
    polygonOffsetFactor:-2,polygonOffsetUnits:-2,toneMapped:false,
  }),16);
  mesh.name='ground-directions';mesh.count=0;mesh.visible=false;mesh.frustumCulled=false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  const stamp=new THREE.Object3D();
  const charges=[];
  function occupied(x,y,z,g) {
    const near=(p,r)=>Math.abs(p.y-y)<1 && Math.hypot(p.x-x,p.z-z)<r;
    if (g.pickups.objects.some(p=>p.active && near(p,.85))) return true;
    if (g.projectiles.puddles.some(p=>p.life>0 && near(p.pos,1.85))) return true;
    if (g.field?.traps.some(t=>(t.falling || t.lingering>g.time || t.flashUntil>g.time) && near(t.p,t.data.radius+.45))) return true;
    // 冲撞预警沿地面分段绘制，楼上的指引可以保留，当前楼层的箭头须让开冲锋带。
    for (const b of charges) {
      const dx=x-b.x, dz=z-b.z, along=dx*b.fx+dz*b.fz;
      if (along<0 || along>=b.chargeMarkCount*b.chargeMarkLength || Math.abs(dz*b.fx-dx*b.fz)>.55) continue;
      const part=Math.floor(along/b.chargeMarkLength);
      if (Math.abs(y-(b.chargeHeights[part]+b.chargeHeights[part+1])*.5)<1) return true;
    }
    return bossDangerAt(g.beasts.boss?.fight,g.time,level,x,y,z,.6);
  }
  return (path,g)=>{
    mesh.count=0;
    charges.length=0;
    if (path?.length && !g.encounter?.beastsDisabled)
      for (const b of g.beasts.pool)
        if (b.active && b.type===1 && b.mode==='windup' && b.chargeMarkLength>0) charges.push(b);
    let start=g.player, travel=0;
    for (const end of path ?? []) {
      const dx=end.x-start.x, dz=end.z-start.z, len=Math.hypot(dx,dz);
      if (len>.8) {
        const ux=dx/len, uz=dz/len;
        // 从前方拐点往回排，沿走廊前进时地标固定在同一段地面。
        let d=(len-.42)%2.45;
        if (d<.7) d+=2.45;
        for (;d<len && d+travel<=34 && mesh.count<mesh.instanceMatrix.count;d+=2.45) {
          const x=start.x+ux*d,z=start.z+uz*d,expected=start.y+(end.y-start.y)*d/len;
          const y=level.surface(x,z,expected+.45);
          const front=level.surface(x+ux*.34,z+uz*.34,expected+.46);
          const back=level.surface(x-ux*.34,z-uz*.34,expected+.46);
          if (Math.abs(y-expected)>.5 || Math.abs(front-back)>.49 || Math.abs(y-(front+back)/2)>.15 ||
              level.blocked(x,z,y,.39, .15) || occupied(x,y,z,g)) continue;
          stamp.position.set(x,y+.046,z);
          stamp.rotation.set(-Math.atan2(front-back,.68),Math.atan2(ux,uz),0,'YXZ');stamp.updateMatrix();
          mesh.setMatrixAt(mesh.count++,stamp.matrix);
        }
      }
      travel+=len;
      if (travel>34 || mesh.count===mesh.instanceMatrix.count) break;
      start=end;
    }
    mesh.visible=mesh.count>0;
    if (mesh.visible) mesh.instanceMatrix.needsUpdate=true;
  };
}
