export function seaModel(type,{THREE,shapes,mergeGeometries}){
  const solid=[],lit=[],transform=new THREE.Object3D();
  const facet=new THREE.IcosahedronGeometry(1,0);
  const spike=new THREE.ConeGeometry(.50,1,5);
  const joint=new THREE.CylinderGeometry(.36,.50,1,6);
  const umbrella=new THREE.SphereGeometry(.50,12,6,0,Math.PI*2,0,Math.PI/2);
  function stamp(to,primitive,color,x,y,z,w,h,d,pitch=0,yaw=0,roll=0){
    const g=primitive.index?primitive.toNonIndexed():primitive.clone();
    transform.position.set(x,y,z);transform.scale.set(w,h,d);transform.rotation.set(pitch,yaw,roll,'YXZ');
    transform.updateMatrix();g.applyMatrix4(transform.matrix);
    const tint=new THREE.Color(color),data=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<data.length;i+=3){data[i]=tint.r;data[i+1]=tint.g;data[i+2]=tint.b;}
    g.setAttribute('color',new THREE.BufferAttribute(data,3));to.push(g);
  }
  const hull=(...p)=>stamp(solid,facet,...p);
  const plate=(...p)=>stamp(solid,shapes.box,...p);
  const fin=(...p)=>stamp(solid,spike,...p);
  const limb=(...p)=>stamp(solid,joint,...p);
  const light=(...p)=>stamp(lit,facet,...p);
  const navy=0x294d60,teal=0x496e76,lightTeal=0x72a599,ink=0x2a5561,copper=0x825b68;
  if(type===0){
    hull(teal,0,.72,-.11,.34,.29,.56);
    hull(navy,0,.66,.39,.25,.19,.33);
    fin(lightTeal,0,1.01,-.19,.10,.40,.31,-.46);
    for(const d of [-1,1]){
      fin(ink,d*.23,.60,.08,.17,.34,.12,.53,0,-d*.95);
      fin(lightTeal,0,.75+d*.14,-.71,.08,.34,.25,Math.PI/2+d*.62);
      light(0x80ffdf,d*.19,.79,.51,.061,.046,.042);
      light(0x62c8e3,d*.27,.66,.12,.040,.056,.16);
    }
  }else if(type===1){
    hull(copper,0,.96,-.17,.70,.51,.55);
    hull(teal,0,1.18,.18,.66,.30,.49);
    hull(navy,0,.88,.44,.49,.32,.29);
    for(const d of [-1,1]){
      for(let j=0;j<4;j++){
        limb(copper,d*(.54+j*.03),.46,.35-j*.25,.15,.67,.15,.13,0,d*-.84);
        fin(navy,d*(.76+j*.03),.235,.40-j*.25,.09,.30,.10,Math.PI,0,d*.44);
      }
      limb(teal,d*.57,.78,.44,.26,.46,.28,1.02,0,-d*.66);
      hull(copper,d*.69,.88,.66,.29,.25,.33);
      fin(teal,d*.81,.92,.90,.24,.48,.21,1.21,0,d*.52);
      fin(teal,d*.56,.84,.91,.18,.37,.19,1.21,0,-d*.41);
      fin(navy,d*.37,1.48,-.16,.25,.31,.25,-.43,0,-d*.17);
      light(0xffb7a8,d*.19,1.16,.57,.065,.050,.065);
    }
  }else if(type===2){
    stamp(solid,umbrella,0x769aad,0,1.33,-.06,1.02,1.34,1.04);
    hull(navy,0,1.31,.01,.47,.18,.48);
    hull(0x5f80a0,0,1.57,.10,.30,.22,.36);
    for(let j=0;j<8;j++){
      const a=j/8*2*Math.PI;
      const x=Math.cos(a)*.31,z=Math.sin(a)*.30;
      limb(0x39677a,x,1.005,z,.073,.62,.080,x*.89,0,z*.79);
      limb(teal,x*1.33,.52,z*1.24,.057,.48,.056,-z*.77,0,-x*.67);
      light(0x83d8ff,x,1.24,z,.070,.042,.075);
      light(0x66bfee,x*1.30,.333,z*1.22,.046,.045,.051);
    }
    light(0x87d8ff,0,1.40,.46,.147,.059,.046);
  }else{
    hull(navy,0,1.89,-.10,1.04,.93,.94);
    hull(teal,0,2.02,.63,.86,.66,.82);
    hull(ink,0,1.78,.99,.82,.39,.54);
    hull(navy,0,1.47,1.05,.71,.31,.52);
    hull(navy,0,1.58,-1.04,.43,.41,.88);
    fin(lightTeal,0,2.64,-.51,.26,1.19,.41,-.34);
    fin(ink,0,1.94,-1.72,.14,1.02,.43,-.26);
    for(const d of [-1,1]){
      hull(ink,d*.85,1.64,.19,.64,.22,.65,0,d*.41);
      fin(teal,d*1.14,1.45,.06,.40,.95,.36,.82,0,d*-1.06);
      fin(navy,d*.72,2.36,.49,.31,.69,.42,-.44,0,d*-.67);
      for(let j=0;j<3;j++)fin(0x9dc6c2,d*(.24+j*.16),1.87,1.24,.135,.27,.15,Math.PI,.13);
      light(0x80f1ec,d*.48,2.16,1.14,.13,.09,.080);
      light(0x6ecbf2,d*.69,1.89,.86,.070,.070,.096);
    }
    limb(ink,0,3.09,.62,.148,1.02,.151,.67);
    light(0x78ffdd,0,3.49,1.02,.19,.19,.18);
  }
  const g=[mergeGeometries(solid),mergeGeometries(lit)];
  for(const part of [...solid,...lit,facet,spike,joint,umbrella])part.dispose();
  return g;
}
