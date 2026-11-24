export function lavaModel(type,{THREE,shapes,mergeGeometries},broken=false){
  const body=[],lit=[],matrix=new THREE.Object3D();
  const unit=new THREE.IcosahedronGeometry(1,0);
  const spike=new THREE.ConeGeometry(.5,1,5), joint=new THREE.CylinderGeometry(.39,.50,1,6);
  function addSolid(destination,shape,color,x,y,z,w,h,d,pitch=0,yaw=0,roll=0){
    const g=shape.index?shape.toNonIndexed():shape.clone();
    matrix.position.set(x,y,z);matrix.scale.set(w,h,d);matrix.rotation.set(pitch,yaw,roll,'YXZ');matrix.updateMatrix();
    g.applyMatrix4(matrix.matrix);
    const rgb=new THREE.Color(color),paint=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<paint.length;i+=3){paint[i]=rgb.r;paint[i+1]=rgb.g;paint[i+2]=rgb.b;}
    g.setAttribute('color',new THREE.BufferAttribute(paint,3));
    destination.push(g);
  }
  const rock=(...args)=>addSolid(body,unit,...args);
  const plate=(...args)=>addSolid(body,shapes.box,...args);
  const point=(...args)=>addSolid(body,spike,...args);
  const limb=(...args)=>addSolid(body,joint,...args);
  const coal=(...args)=>addSolid(lit,unit,...args);
  const dark=0x4c3e47,slate=0x655461,iron=0x78545a,skin=0x7b473c,rust=0x9d6048,glow=0xff8c54;
  if(type===0){
    rock(skin,0,.44,-.13,.32,.20,.56);
    rock(rust,0,.56,.27,.32,.24,.28);
    rock(dark,0,.49,.54,.22,.15,.27);
    for(let i=0;i<4;i++)point(iron,0,.64-i*.027,.01-i*.20,.106,.18-i*.026,.14,-.62);
    limb(skin,0,.40,-.59,.16,.40,.18,-1.09,0,.1);
    point(rust,.04,.53,-.89,.12,.35,.13,-1,0,-.40);
    for(const d of [-1,1]){
      limb(skin,d*.28,.23,.27,.13,.37,.14,.18,0,d*-.62);
      limb(dark,d*.25,.21,-.40,.14,.34,.14,-.42,0,d*-.58);
      plate(iron,d*.35,.074,.36,.172,.10,.21,.14,0,d*.10);
      coal(glow,d*.15,.652,.481,.054,.036,.048);
    }
  }else if(type===1){
    rock(dark,0,1.11,-.12,.68,.74,.66);
    rock(slate,0,1.28,.23,.63,.47,.55);
    rock(iron,0,1.00,.63,.45,.29,.36);
    for(const d of [-1,1]){
      rock(slate,d*.49,1.29,.14,.44,.48,.45);
      point(dark,d*.44,1.59,-.19,.31,.62,.34,-.30,0,d*-.36);
      rock(dark,d*.58,.79,.46,.34,.41,.36,.14);
      plate(slate,d*.52,.31,.56,.43,.31,.43,-.23,0,d*.14);
      limb(iron,d*.28,.34,-.45,.31,.59,.34,-.23,0,d*-.17);
      point(iron,d*.34,1.01,.82,.17,.40,.18,1.10,0,d*-.27);
      coal(0xffa76a,d*.185,1.17,.865,.066,.056,.052);
    }
  }else if(type===2){
    rock(skin,0,.70,-.19,.43,.41,.45);
    rock(iron,0,1.22,.09,.38,.42,.31,.31);
    rock(dark,0,1.38,.40,.33,.23,.29);
    rock(rust,0,1.21,.61,.27,.14,.23);
    for(const d of [-1,1]){
      rock(iron,d*.33,.73,-.32,.25,.37,.28);
      point(rust,d*.28,1.52,-.33,.22,.57,.27,-.49,0,d*-.37);
      limb(skin,d*.33,.34,.05,.22,.60,.21,.30,0,d*-.34);
      coal(0xffc283,d*.16,1.44,.62,.065,.047,.039);
      coal(0xff803d,d*.35,.91,-.44,.105,.14,.08);
    }
    coal(0xff9f56,0,1.27,.79,.105,.058,.056);
  }else{
    rock(broken?0x9f5141:dark,0,1.69,-.15,.84,.91,.68);
    rock(broken?0xa45949:slate,0,2.46,.11,.86,.67,.68);
    rock(slate,0,2.95,.57,.56,.49,.48);
    rock(skin,0,2.86,.96,.41,.20,.32);
    for(const d of [-1,1]){
      limb(dark,d*.44,.65,-.32,.37,1.04,.42,-.24,0,d*.11);
      plate(slate,d*.47,.22,.02,.49,.38,.51,0,d*.18);
      rock(iron,d*.82,2.45,.15,.47,.51,.46);
      rock(broken?skin:dark,d*.92,1.61,.32,.35,.69,.39,.24,0,d*.12);
      plate(iron,d*1.01,1.10,.56,.43,.38,.48,-.15);
      if(!broken){
        rock(slate,d*.74,2.79,.24,.59,.56,.57,.14,0,d*.23);
        point(0x7f666e,d*.56,3.46,.15,.49,.95,.44,-.23,0,d*-.39);
        plate(dark,d*.45,2.45,.66,.30,.69,.26,.17,0,d*.24);
        rock(slate,d*.92,1.63,.54,.46,.46,.45);
      }else{
        point(rust,d*.53,3.17,-.14,.28,.54,.28,-.39,0,d*-.22);
        coal(0xff8e45,d*.42,2.44,.70,.13,.35,.11,.10,0,d*.31);
        coal(0xff8566,d*.81,1.62,.64,.11,.22,.10);
      }
      coal(broken?0xffca86:glow,d*.218,3.063,.99,.093,.062,.055);
    }
    coal(broken?0xffb776:0xe16537,0,2.10,.69,.26,.40,.16);
  }
  const models=[mergeGeometries(body),mergeGeometries(lit)];
  for(const g of [...body,...lit,unit,spike,joint])g.dispose();
  return models;
}
