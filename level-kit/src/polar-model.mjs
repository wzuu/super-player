export function polarModel(type,{THREE,shapes,mergeGeometries},rage=false){
  const body=[],lit=[],tmp=new THREE.Object3D();
  const diamond=new THREE.IcosahedronGeometry(1,0);
  const tooth=new THREE.ConeGeometry(.5,1,5);
  const joint=new THREE.CylinderGeometry(.38,.50,1,6);
  function add(where,geom,tint,x,y,z,w,h,d,pitch=0,yaw=0,roll=0){
    const geometry=geom.index?geom.toNonIndexed():geom.clone();
    tmp.position.set(x,y,z);tmp.scale.set(w,h,d);tmp.rotation.set(pitch,yaw,roll,'YXZ');tmp.updateMatrix();
    geometry.applyMatrix4(tmp.matrix);
    const rgb=new THREE.Color(tint),colors=new Float32Array(geometry.attributes.position.count*3);
    for(let i=0;i<colors.length;i+=3){colors[i]=rgb.r;colors[i+1]=rgb.g;colors[i+2]=rgb.b;}
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));where.push(geometry);
  }
  const facet=(...x)=>add(body,diamond,...x);
  const pole=(...x)=>add(body,joint,...x);
  const spike=(...x)=>add(body,tooth,...x);
  const plate=(...x)=>add(body,shapes.box,...x);
  const emit=(...x)=>add(lit,diamond,...x);
  const hide=0x4c6278,blue=0x7395ad,ice=0xb6dce9,dark=0x354954;
  if(type===0){
    facet(hide,0,.51,-.17,.33,.23,.57);
    facet(blue,0,.63,.27,.32,.25,.26);
    facet(dark,0,.54,.51,.19,.13,.28);
    spike(blue,0,.53,-.70,.15,.39,.15,-1.05);
    for(const d of [-1,1]){
      pole(blue,d*.20,.24,.28,.133,.43,.15,-.20,0,d*-.12);
      pole(hide,d*.19,.25,-.40,.13,.43,.16,-.38,0,d*-.17);
      spike(ice,d*.14,.79,.34,.095,.25,.096,-.17,0,d*-.26);
      emit(0xc3f8ff,d*.12,.669,.50,.044,.033,.041);
    }
  }else if(type===1){
    facet(hide,0,.86,-.10,.62,.57,.60);
    facet(blue,0,1.08,.30,.60,.55,.52);
    facet(dark,0,.92,.72,.36,.35,.32);
    facet(ice,0,.84,.88,.32,.19,.27);
    for(const d of [-1,1]){
      facet(ice,d*.44,1.27,.24,.31,.44,.44,.15,0,d*.08);
      facet(blue,d*.45,.59,.29,.31,.43,.32,-.22,0,d*.12);
      plate(dark,d*.40,.29,.43,.34,.22,.44,-.17);
      pole(hide,d*.30,.34,-.43,.28,.61,.31,-.16,0,d*-.17);
      facet(blue,d*.27,1.17,.56,.15,.17,.18);
      emit(0x97e9ff,d*.20,1.028,.944,.066,.053,.038);
      spike(ice,d*.44,1.64,.07,.31,.59,.29,-.28,0,d*-.23);
    }
  }else if(type===2){
    facet(hide,0,.67,-.19,.41,.47,.48);
    facet(blue,0,1.16,.07,.34,.44,.33,.29);
    facet(dark,0,1.35,.44,.33,.25,.31,.18);
    facet(ice,0,1.20,.62,.29,.17,.25);
    for(const d of [-1,1]){
      pole(blue,d*.36,.34,.01,.21,.64,.23,.33,0,d*-.31);
      spike(ice,d*.32,1.28,-.30,.23,.72,.30,-.51,0,d*-.48);
      facet(0x78b9d7,d*.26,1.05,-.26,.26,.31,.31);
      emit(0x94eaff,d*.16,1.405,.675,.075,.055,.039);
    }
    emit(0x62cfff,0,1.207,.83,.067,.035,.06);
  }else{
    facet(0x263949,0,1.85,-.12,.85,1.13,.67);
    facet(rage?0x526883:blue,0,2.52,.10,.88,.73,.78);
    facet(dark,0,2.80,.68,.58,.54,.53);
    facet(0x8daab9,0,2.69,.97,.47,.27,.46);
    facet(hide,0,1.41,-.45,.65,.46,.46);
    for(const d of [-1,1]){
      pole(hide,d*.49,.51,-.30,.37,.96,.41,-.24,0,d*.11);
      plate(dark,d*.49,.18,-.02,.48,.26,.53,0,d*.18);
      facet(blue,d*.84,2.37,.18,.43,.59,.51);
      facet(hide,d*.98,1.48,.42,.30,.66,.41,.31,0,d*.11);
      plate(blue,d*1.01,.98,.62,.44,.42,.44,-.19);
      if(!rage){
        facet(ice,d*.78,2.79,.18,.60,.60,.53,.12,0,d*.21);
        spike(0xc3e3f5,d*.56,3.38,.02,.52,.91,.47,-.28,0,d*-.38);
        plate(0x94bcca,d*.45,2.38,.66,.29,.63,.30,.11,0,d*.26);
        facet(ice,d*.96,1.58,.49,.42,.52,.37);
      }else{
        spike(blue,d*.60,2.93,-.08,.27,.51,.29,-.46,0,d*-.27);
        emit(0x57cfff,d*.38,2.36,.64,.13,.30,.079,.15,0,d*.28);
      }
      emit(rage?0x95f9ff:0x8dc6f6,d*.246,2.942,1.03,.092,.061,.056);
    }
    emit(rage?0x59d9ff:0x728fa9,0,1.94,.61,.23,.38,.15);
  }
  const meshes=[mergeGeometries(body),mergeGeometries(lit)];
  for(const geo of [...body,...lit,diamond,tooth,joint])geo.dispose();
  return meshes;
}
