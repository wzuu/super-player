export function alienModel(type,{THREE,shapes,mergeGeometries},rage=false){
  const flesh=[],glow=[],m=new THREE.Object3D(),base=new THREE.IcosahedronGeometry(1,0);
  const spike=new THREE.ConeGeometry(.50,1,5),joint=new THREE.CylinderGeometry(.36,.50,1,6);
  function component(target,shape,tint,x,y,z,w,h,d,pitch=0,yaw=0,roll=0){
    const g=shape.index?shape.toNonIndexed():shape.clone();
    m.position.set(x,y,z);m.scale.set(w,h,d);m.rotation.set(pitch,yaw,roll,'YXZ');m.updateMatrix();g.applyMatrix4(m.matrix);
    const color=new THREE.Color(tint),data=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<data.length;i+=3){data[i]=color.r;data[i+1]=color.g;data[i+2]=color.b;}
    g.setAttribute('color',new THREE.BufferAttribute(data,3));target.push(g);
  }
  const skin=(...x)=>component(flesh,base,...x);
  const limb=(...x)=>component(flesh,joint,...x);
  const barb=(...x)=>component(flesh,spike,...x);
  const plate=(...x)=>component(flesh,shapes.box,...x);
  const lum=(...x)=>component(glow,base,...x);
  const dark=0x4f4c64,blue=0x687588,teal=0x547169,bone=0xa6a4a4,purple=0x726478;
  if(type===0){
    skin(dark,0,.32,-.19,.30,.18,.45);
    skin(blue,0,.46,.27,.27,.25,.25);
    barb(purple,0,.47,-.46,.15,.36,.20,-.75);
    for(const d of [-1,1]){
      for(let j=0;j<4;j++){
        const z=.32-j*.19;
        limb(j%2?dark:blue,d*.31,.21,z,.092,.32,.10,.24,0,d*-.86);
        plate(dark,d*.42,.063,z+.028,.10,.075,.17,.26,d*.31,d*.20);
      }
      barb(blue,d*.15,.69,.31,.105,.29,.10,-.13,0,-d*.33);
      barb(bone,d*.12,.40,.57,.092,.21,.083,1.62,0,-d*.32);
      lum(0xaeacf6,d*.13,.53,.46,.049,.033,.042);
    }
  }else if(type===1){
    skin(dark,0,.97,-.18,.63,.68,.64);
    skin(blue,0,1.18,.25,.65,.47,.57);
    skin(purple,0,1.02,.68,.34,.31,.29);
    for(const d of [-1,1]){
      skin(dark,d*.43,1.30,.10,.44,.49,.44);
      barb(blue,d*.46,1.65,-.16,.34,.55,.29,-.33,0,d*-.34);
      limb(purple,d*.49,.72,.42,.39,.76,.43,-.26,0,d*.23);
      plate(dark,d*.61,.34,.59,.32,.25,.41,-.23);
      limb(blue,d*.30,.34,-.46,.27,.64,.31,-.20,0,d*-.16);
      barb(bone,d*.24,1.00,.96,.185,.46,.177,1.08,0,d*-.23);
      lum(0xff9699,d*.175,1.16,.93,.057,.047,.045);
    }
  }else if(type===2){
    skin(teal,0,.78,-.21,.43,.51,.47);
    skin(dark,0,1.25,.12,.34,.35,.34,.24);
    skin(blue,0,1.29,.49,.32,.21,.31);
    skin(teal,0,1.12,.61,.25,.12,.23);
    for(const d of [-1,1]){
      skin(0x6b8d76,d*.36,.93,-.28,.27,.33,.30);
      barb(blue,d*.31,1.48,-.20,.20,.49,.23,-.48,0,d*-.39);
      limb(teal,d*.32,.35,.04,.23,.64,.23,.32,0,d*-.3);
      lum(0xb3fb88,d*.34,.99,-.43,.078,.10,.07);
      lum(0xa5ef9e,d*.149,1.42,.70,.055,.037,.04);
    }
    lum(0x89e67c,0,1.19,.781,.108,.045,.04);
  }else{
    skin(rage?0x826677:dark,0,1.48,-.58,.90,.69,1.08);
    skin(purple,0,2.30,.08,.79,.73,.70);
    skin(blue,0,2.82,.52,.50,.51,.50);
    skin(dark,0,2.63,.86,.45,.25,.38);
    for(const d of [-1,1]){
      for(let j=0;j<3;j++){
        const z=.56-j*.46;
        limb(purple,d*(.68+j*.075),.91,z,.29,1.24,.28,-.11,0,d*-.53);
        barb(blue,d*(.94+j*.074),.38,z+.095,.18,.66,.18,Math.PI,-d*.21,d*.26);
      }
      skin(dark,d*.75,2.35,.14,.37,.45,.35);
      barb(purple,d*.36,3.27,.39,.26,.73,.26,-.33,0,d*-.36);
      barb(bone,d*.22,2.61,1.12,.152,.36,.12,1.40,0,d*.18);
      if(!rage)plate(dark,d*.48,2.43,.59,.30,.65,.25,.08,0,d*.23);
      else lum(0xba91fc,d*.44,2.45,.60,.15,.27,.13,.10,0,d*.30);
      lum(rage?0xc5a9ff:0xb088d6,d*.252,2.97,.91,.09,.075,.054);
      lum(0xbd8fd2,d*.63,1.67,-.72,.12,.14,.13);
    }
    lum(rage?0xb28eff:0x765c91,0,1.94,-1.02,.31,.23,.36);
  }
  const geometries=[mergeGeometries(flesh),mergeGeometries(glow)];
  for(const geo of [...flesh,...glow,base,spike,joint])geo.dispose();
  return geometries;
}
