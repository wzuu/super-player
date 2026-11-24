import {buildFacility,floorPlan} from '@level-kit/facility-map.mjs';
import {defenseMission} from '@level-kit/defense.mjs';

const areas=[
  ['战神广场南口','P',[-27,42,15,63]],['西塔脚梯','S',[-25,29,-15,48]],['旧售票室','O',[-37,26,-21,39]],
  ['下层折返平台','T',[-23,29,23,39]],['东折返梯','S',[13,13,23,34]],['检票桥','T',[-4,12,23,21]],
  ['南铁梯','S',[-4,-2,6,18]],['内侧信标台','D',[-18,-26,16,0]],['西观景翼','D',[-24,-20,-15,-6]],
  ['西维修梯','W',[-42,-18,-20,-10]],['西锚座','W',[-46,-24,-33,-4]],
  ['东缆索梯','E',[14,-18,42,-8]],['东锚座','E',[34,-20,46,-2]],
  ['北外架梯','N',[-4,-50,6,-24]],['北锚座','N',[-11,-57,13,-43]],
  ['救援悬臂','H',[14,-28,33,-22]],
].map(([name,tile,bounds])=>({name,tile,bounds}));
const clip=x=>Math.max(0,Math.min(1,x));
function ground(x,z){
  const rise=2.8*clip((48-z)/16)+2.9*clip((32-z)/15)+5.5*clip((16-z)/18);
  const wing=z>=-28 && z<=-22 && x>=14 ? 1:clip((45-Math.abs(x))/24);
  return rise*Math.min(wing,clip((z+55)/27));
}
const lanes=[
  {name:'南铁梯',barrier:[1,3,10,.5],delay:1,strength:285,path:[[1,14],[1,4.6]],inside:[1,-2]},
  {name:'西维修梯',barrier:[-25,-14,.48,8],delay:17,strength:265,path:[[-33,-14],[-26.65,-14]],inside:[-19,-14]},
  {name:'东缆索梯',barrier:[18,-13,.48,10],delay:30,strength:250,path:[[32,-13],[19.65,-13]],inside:[12,-13]},
  {name:'北外架梯',barrier:[1,-29,10,.48],delay:44,strength:235,path:[[1,-43],[1,-30.65]],inside:[1,-23]},
];
const parts=[
  {name:'广场来敌',count:4,bounds:[-23,33,-15,44],anchor:[-19,39],types:[0]},
  {name:'旧票厅看守',count:4,bounds:[-35,28,-24,37],anchor:[-29,33]},
  {name:'上层巡逻',count:5,bounds:[-16,-22,6,-7],anchor:[-9,-13]},
  {name:'南铁梯',count:7,bounds:[-1,13,17,20],anchor:[6,17]},
  {name:'西维修梯',count:7,bounds:[-43,-22,-33,-7],anchor:[-38,-15]},
  {name:'东缆索梯',count:8,bounds:[33,-17,43,-4],anchor:[37,-12]},
  {name:'北外架梯',count:7,bounds:[-8,-55,10,-44],anchor:[0,-48]},
];
const rule='启动观景台信标，守住四处攀爬口。救援需要 90 秒，直升机进场后到悬臂尽头登机。';
const story=defenseMission({name:'四面观景台',rule,beacon:[-5,-15],exit:[27,-25],boardGate:[18,-25,.52,6,2.28],
  seconds:90,railColor:0x897864,approach:'从西塔脚上折返梯，穿过检票桥',victory:'你从铁塔悬臂登上救援直升机。',lanes},parts,[0,0,1,2,0,1]);
function edge({x,z,w,d},{solid,box}){
  solid(x,z,w,d,1.64,0x687176,-.35);
  box('trim',x,1.4,z,w+.08,.17,d+.08,0xb49a73);
  return true;
}
function decorate({THREE,scene,solid,box,shape,sign}){
  scene.add(new THREE.HemisphereLight(0xcad8ed,0x8a685f,1.65));
  const sun=new THREE.DirectionalLight(0xffdab0,2.1);sun.position.set(-32,24,27);scene.add(sun);
  // 四根塔柱的桁架从广场延伸到观景台上方。梁架和护壁给每个入口留下独立射界。
  for(const [x,z] of [[-15,-22],[12,-22],[-15,-4],[12,-4]]){
    solid(x,z,1.25,1.32,14.4,0x725a4c);
    for(let h=2;h<16;h+=3)box('trim',x,h,z,1.62,.37,1.67,0xad906e);
  }
  for(const z of [-22,-4]){
    for(const y of [5.5,14.3])box('wall',-1.5,y,z,28,1,1.17,0x816955);
    for(let j=0;j<6;j++)shape('box','trim',-13+j*4.5,10,z,1,9.5,.73,0x997b62,0,0,(j%2?1:-1)*.45);
  }
  for(const x of [-15,12])for(const y of [6,14.3])box('wall',x,y,-13,1,1,19,0x866e58);
  // 从塔身腰部逐层收束到天线。四面的交叉撑与塔尖从南广场就能辨认。
  const rings=[[25.5,13.5,9],[32,8,5.5],[38,4.1,3.3],[44,2.3,1.9]];
  const up=new THREE.Vector3(0,1,0),direction=new THREE.Vector3(),rotation=new THREE.Euler(),q=new THREE.Quaternion();
  function beam(a,b,width,color){
    const [x,y,z]=a.map((v,i)=>(v+b[i])/2);
    direction.set(b[0]-a[0],b[1]-a[1],b[2]-a[2]);const length=direction.length();
    rotation.setFromQuaternion(q.setFromUnitVectors(up,direction.normalize()));
    shape('box','trim',x,y-ground(x,z),z,width,length,width,color,rotation.y,rotation.x,rotation.z);
  }
  function corners([h,rx,rz]){return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[-1.5+a*rx,h,-13+b*rz]);}
  for(let i=1;i<rings.length;i++){
    const a=corners(rings[i-1]),b=corners(rings[i]);
    for(let j=0;j<4;j++){
      const k=(j+1)%4;
      beam(a[j],b[j],.76,0x776556);beam(b[j],b[k],.70,0xa28a6d);
      beam(a[j],b[k],.30,0x93785e);beam(a[k],b[j],.30,0x93785e);
    }
  }
  beam([-1.5,44,-13],[-1.5,51,-13],.38,0xb39674);
  shape('stone','light',-1.5,51-ground(-1.5,-13),-13,.55,.65,.55,0xffbe77);
  for(const x of [-23,-16])for(const z of [42,45,48])solid(x,z,.65,.8,4.3,0x75685c);
  for(const z of [42,48])box('trim',-19.5,4.6,z,8.2,.78,1.04,0xa0896e);
  for(let z=15;z<31;z+=1.3)box('trim',18,.055,z,6.7,.10,.25,0xb5aaa0);
  for(let z=4;z<13;z+=1.1)box('trim',1,.055,z,6.7,.10,.25,0xb5aaa0);
  for(const [x,z] of [[-7,48],[-10,34],[16,26],[-10,-5],[8,-7],[-10,-21],[6,-20],[-19,-17]]){
    solid(x,z,2.8,1.2,1.13,0x777d78);box('trim',x,1.19,z,3,.16,1.4,0xb5a183);
  }
  solid(-7,-16,1.4,1.22,1.35,0x515f69);
  shape('cylinder','trim',-7,3.15,-16,.26,3.7,.26,0xa69b83);
  shape('stone','light',-7,5.15,-16,.64,.7,.64,0xe6bc82);
  sign('观景台救援频段',-7,1.45,-15.32,2.4,.5);
  sign('塔脚西梯',-19.5,3.73,48.6,4,.72);sign('东侧登机悬臂',13.6,2.68,-24,4.8,.63,-Math.PI/2);
  // 塔外城市轮廓与停机悬臂分开，不进入可行走面。
  for(let i=0;i<28;i++){
    const a=i*.225,h=4+((i*13)%18),r=62+((i*7)%12);
    box('wall',Math.cos(a)*r,-9+h*.5,Math.sin(a)*r,4+i%4,h,5,0x687382);
  }
  const heli=new THREE.Group(),rotor=new THREE.Group(),metal=new THREE.MeshStandardMaterial({color:0x657668}),
    glass=new THREE.MeshStandardMaterial({color:0x3d5868}),yellow=new THREE.MeshStandardMaterial({color:0xccab73});
  function piece(parent,geometry,mat,x,y,z,w,h,d){
    const m=new THREE.Mesh(geometry,mat);m.scale.set(w,h,d);m.position.set(x,y,z);parent.add(m);return m;
  }
  const cube=new THREE.BoxGeometry(1,1,1),round=new THREE.SphereGeometry(1,16,10);
  piece(heli,round,metal,0,.52,0,1.35,1.19,2.55);
  piece(heli,round,glass,0,.73,1.3,1.20,.93,1.25);
  piece(heli,cube,metal,0,.64,-3.33,.45,.57,3.8);
  piece(heli,cube,yellow,0,1.25,-4.94,.23,1.57,.8);
  for(const x of [-1,1]){
    piece(heli,cube,metal,x,-.69,0,.14,.72,1.2);
    piece(heli,cube,metal,x,-1.06,0,.21,.19,3.6);
  }
  for(const a of [0,Math.PI/2])piece(rotor,cube,glass,0,0,0,8.3,.075,.31).rotation.y=a;
  rotor.position.y=1.88;heli.add(rotor);scene.add(heli);
  return {heli,rotor};
}
function createEncounter({mapData}){
  return {reset(){this.phase='calm';this.status=null;mapData.heli.visible=false;},
    update(g){
      const timer=g.story.defense.elapsed,t=g.time%42;
      this.phase=t<23?'calm':t<27?'warning':t<34?'active':'calm';
      this.status=this.phase==='calm'?null:{title:this.phase==='warning'?'阵风接近':'塔身风噪',detail:'按各侧护栏耐久选择防守位'};
      mapData.heli.visible=g.objective.mode==='hold' && timer>=82;
      const left=clip((90-timer)/8);
      mapData.heli.position.set(29+left*29,ground(27,-25)+1.65+left*10,-25-left*17);
      mapData.rotor.rotation.y=g.time*27;
    }};
}
const facility={ground,solidGround:true,roughness:.66,metalness:.37,edge,wallHeight:2,wallColor:0x877d72,
  spots:{spawn:[4,54],gate:[27,-25],bossAnchor:[4,-14],bossSpawn:[3,-10]},
  floorTexture(g,w,h){g.fillStyle='#8b8881';g.fillRect(0,0,w,h);for(let j=0;j<8;j++){g.fillStyle='#626967';g.fillRect(j*16,0,1.25,h);g.fillRect(0,j*24,w,1.25);g.fillStyle='#b6aaa0';g.fillRect(j*16+3,j*24+3,2,2);}},
  decorate};
export default {pageTitle:'铁塔观景台防线',weaponSkin:'tower-observation-defense',story,grid:floorPlan(areas,50,66),
  config:{map:{cell:2,navCell:1,fog:.010},beasts:{sight:25}},buildMap:ctx=>buildFacility(ctx,facility),
  background:0x86869a,fog:0xa19ba3,terrain:{ground},portal:{shield:false,visible:false},manualLoot:true,createEncounter,
  ammo:[[-16,47],[-16,34],[17,16],[-11,-9],[6,-11],[3,-20],[-18,-14]],health:[[-18,32,23],[7,-17,25]],
  loot:[[2,54,'广场导览章',85],[-18,41,'铆钉样件',90],[-31,32,'铜版首日票',255],[-6,33,'检票钳',95],
    [15,17,'红色扳手',95],[-17,-12,'维修班牌',105],[5,-22,'信号陶瓷片',115],[-4,-47,'测风计盘',120],
    [36,-7,'旧缆绳扣',100],[24,-25,'机组记录牌',155]],
  area:(x,z)=>areas.find(({bounds:[a,b,c,d]})=>x>=a&&x<c&&z>=b&&z<d)?.name??'塔身',
  text:{title:'铁塔观景台防线',tag:'巴黎铁塔 / 坚守',enter:'进入战神广场',brief:rule,objective:rule,safe:'战神广场南口',bossName:'铁塔巨兽',winBrief:'救援直升机已离开观景台。'}};
