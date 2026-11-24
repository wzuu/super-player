export function machineModel(type,{THREE,shapes,mergeGeometries},rage=false){
  const shell=[],energy=[],transform=new THREE.Object3D();
  const facet=new THREE.IcosahedronGeometry(1,0);
  const pin=new THREE.CylinderGeometry(.43,.50,1,6);
  function step(dst,primitive,tint,x,y,z,w,h,d,pitch=0,yaw=0,roll=0){
    const g=primitive.index?primitive.toNonIndexed():primitive.clone();
    transform.position.set(x,y,z);transform.scale.set(w,h,d);transform.rotation.set(pitch,yaw,roll,'YXZ');
    transform.updateMatrix();g.applyMatrix4(transform.matrix);
    const color=new THREE.Color(tint),rgb=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<rgb.length;i+=3){rgb[i]=color.r;rgb[i+1]=color.g;rgb[i+2]=color.b;}
    g.setAttribute('color',new THREE.BufferAttribute(rgb,3));dst.push(g);
  }
  const plate=(...a)=>step(shell,shapes.box,...a);
  const hood=(...a)=>step(shell,facet,...a);
  const joint=(...a)=>step(shell,pin,...a);
  const glow=(...a)=>step(energy,shapes.box,...a);
  const dark=0x536277,blue=0x8193ac,armor=0x758194,steel=0x9a9da9;
  if(type===0){
    hood(armor,0,.53,-.11,.32,.243,.55);
    plate(blue,0,.62,-.15,.57,.16,.64,.10);
    hood(dark,0,.67,.44,.25,.22,.27);
    plate(blue,0,.59,.61,.29,.13,.27);
    for(const d of [-1,1]){
      joint(dark,d*.23,.28,.24,.117,.44,.13,-.23,0,-d*.13);
      joint(blue,d*.24,.28,-.37,.126,.40,.13,.31,0,-d*.17);
      plate(steel,d*.21,.15,.42,.15,.084,.23);
      plate(blue,d*.13,.79,.30,.084,.26,.103,.20,0,-d*.37);
      glow(0x7ffff0,d*.14,.68,.67,.076,.045,.045);
    }
  }else if(type===1){
    hood(armor,0,1.14,-.20,.63,.68,.56);
    plate(dark,0,1.52,.20,.65,.46,.48,-.19);
    plate(blue,0,1.40,.48,.46,.27,.39);
    for(const d of [-1,1]){
      hood(steel,d*.45,1.42,.23,.42,.39,.40);
      plate(dark,d*.47,.83,.36,.30,.59,.39,-.36,0,d*.18);
      plate(blue,d*.37,.51,.50,.34,.28,.43,-.36);
      joint(armor,d*.23,.39,-.31,.31,.66,.36,-.18,0,d*.23);
      glow(0xfab78a,d*.18,1.45,.692,.084,.058,.026);
    }
  }else if(type===2){
    hood(armor,0,.41,.02,.43,.248,.35);
    plate(blue,0,.57,.03,.57,.092,.51);
    for(const d of [-1,1]){
      plate(dark,d*.29,.41,-.04,.46,.14,.18,.08,d*.13);
      joint(steel,d*.44,.36,-.07,.29,.15,.29);
      joint(dark,d*.20,.24,.26,.108,.37,.12,Math.PI/2);
      glow(0x92e9ff,d*.44,.26,-.07,.24,.029,.22);
    }
    glow(0xf68cca,0,.47,.337,.218,.075,.04);
  }else{
    hood(rage?0x986078:dark,0,1.57,-.03,.86,.84,.59);
    plate(blue,0,2.34,.21,1.22,.88,.97,.10);
    plate(armor,0,2.89,.56,.83,.40,.67);
    plate(steel,0,3.06,.31,.69,.27,.52);
    for(const d of [-1,1]){
      joint(dark,d*.44,.74,-.27,.37,1.08,.40,-.17,0,d*.12);
      plate(blue,d*.45,.24,.02,.51,.33,.64,0,d*.18);
      joint(armor,d*.83,1.82,.23,.42,1.19,.42,-.16,0,d*.20);
      plate(steel,d*.89,1.33,.40,.43,.36,.36,-.24,0,d*.15);
      if(!rage)hood(steel,d*.72,2.61,.18,.60,.42,.50);
      else glow(0xf681c6,d*.60,2.52,.57,.23,.49,.07,.18,0,d*.33);
      plate(dark,d*.48,2.79,-.24,.19,.79,.31,-.21);
      glow(rage?0xffb5d7:0x91e6f9,d*.20,2.959,.904,.12,.066,.046);
    }
    glow(rage?0xfb92cb:0x7de5ed,0,2.23,.72,.29,.34,.056,.12);
  }
  const g=[mergeGeometries(shell),mergeGeometries(energy)];
  for(const o of [...shell,...energy,facet,pin])o.dispose();
  return g;
}
