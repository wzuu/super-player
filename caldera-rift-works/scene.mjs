import {floorPlan,buildFacility} from '@level-kit/facility-map.mjs';
import {demolitionMission} from '@level-kit/rift-demolition.mjs';
import {lavaModel} from '@level-kit/lava-model.mjs';

const areas=[
  ['南吊桥','S',[-6,29,6,58]],['环湖熔铸廊','H',[-40,18,40,34]],
  ['东高桥','E',[22,-25,32,20]],['检修库','D',[27,17,46,32]],
  ['东铸造房','F',[22,-17,50,4]],['西高桥','W',[-34,-24,-24,20]],
  ['箭塔地窖','T',[-52,-14,-26,9]],['冷却控制房','C',[-49,14,-31,29]],
  ['火口横梁','N',[-34,-33,32,-21]],['火口转运室','R',[-14,-51,16,-29]],
  ['桥头封存间','B',[12,-40,28,-24]],['可淹低沟','L',[-4,-26,4,22]],
].map(([name,tile,bounds])=>({name,tile,bounds}));
const ground=(x,z)=>3.8*Math.min(1,Math.max(0,(Math.abs(z)-7)/14, (Math.abs(x)-3)/11));
const low=(x,z)=>Math.abs(x)<4.2 && Math.abs(z)<15;
const rule='搜集三枚任务弹，摧毁炉芯、地窖和转运室的传送门。涨潮时沿高桥绕过低沟。';
const cases=[{name:'检修库',at:[39,25]},{name:'冷却控制房',at:[-42,21]},{name:'桥头封存间',at:[22,-35]}];
const gates=[
  {name:'炉芯门',at:[42,-10],retreat:[32,-4],bounds:[24,-15,48,2],delay:13,interval:14,cap:4,types:[0,0,2]},
  {name:'地窖门',at:[-44,-7],retreat:[-33,2],bounds:[-50,-12,-32,7],delay:20,interval:13,cap:4,types:[0,1,0]},
  {name:'转运室门',at:[4,-44],retreat:[1,-33],bounds:[-12,-49,14,-32],delay:16,interval:15,cap:5,types:[0,2,0]},
];
const parts=[
  {name:'湖廊巡查',count:4,bounds:[-14,20,12,28],anchor:[-7,24],types:[0]},
  {name:'铸造守卫',count:5,bounds:[29,-15,46,0],anchor:[38,-6]},
  {name:'箭塔驻防',count:5,bounds:[-49,-12,-29,6],anchor:[-37,-5]},
  {name:'转运守卫',count:6,bounds:[-10,-48,12,-32],anchor:[-5,-40]},
];
const story=demolitionMission({name:'三处火口设施',rule,cases,gates,color:0xff9065,
  victory:'三处火口传送门均已停息。'},parts,[0,0,2,1,0]);

function decorate({THREE,scene,shape,box,solid,sign}){
  scene.add(new THREE.HemisphereLight(0xffdec0,0x8a6474,1.8));
  const sun=new THREE.DirectionalLight(0xffac73,2.2);sun.position.set(32,43,-15);scene.add(sun);
  // 裂谷底板低于沟底和两座高桥，涨潮只淹没最低的中央通路。
  const lava=new THREE.Mesh(new THREE.PlaneGeometry(52,46),
    new THREE.MeshBasicMaterial({color:0xef6d37}));
  lava.rotation.x=-Math.PI/2;lava.position.y=-.85;scene.add(lava);
  // 吊桥索塔与铸造烟道是跨越裂谷时的方向参照。橙色炉口位于东岸。
  for(const z of [32,48]){
    for(const x of [-4.9,4.9]){
      solid(x,z,.66,.83,6.5,0x785d61);
      for(const side of [-1,1])shape('box','trim',x,3.7,z+side*3.7,.11,.14,9.6,0x9b857a,0,side*.65);
    }
    box('wall',0,6.45,z,11,.65,1.1,0x80666b);
  }
  for(const [x,z,h] of [[49,-13,12],[46,-8,16],[49,-2,10]]){
    shape('cylinder','wall',x,h/2,z,1.25,h,1.5,0x6f5860);
    for(const y of [.42,.82,.98])shape('cylinder','trim',x,h*y,z,1.62,.33,1.62,0xb18069);
  }
  for(const [x,z,h] of [[-52,-48,19],[22,-65,23],[57,-42,22],[-62,2,15]]){
    shape('stone','wall',x,h*.35,z,21,h,17,0x79656d,.7);
  }
  for(const x of [-17,15])for(const z of [-13,2,13]){
    shape('stone','wall',x,1.3,z,3.7,6.4,4.1,0x765c63,.6);
  }
  for(const x of [-32,-26,24,30])for(const z of [-19,-11,-3,5,13]){
    if((x===-32 || x===30) && z>-15 && z<9)continue;
    solid(x,z,.34,.4,1.2,0x78656b);
    box('light',x,1.24,z,.37,.13,.45,0xffb36a);
  }
  for(const x of [-47,-38])for(const z of [-11,4]){
    solid(x,z,1.4,1.4,6.1,0x745964);box('trim',x,6.23,z,1.94,.4,1.94,0xa28870);
  }
  box('trim',-42.5,6.6,-11,11,.6,1.65,0x6e5664);
  for(const z of [-13,-4]){
    solid(47,z,2.3,2.3,3.5,0x8e645d);
    shape('cylinder','wall',47,5.2,z,1.35,4.0,1.35,0x675360);
    shape('cylinder','light',47,3.4,z,2.55,.28,2.55,0xffac5d);
  }
  for(const x of [-10,11]){solid(x,-46,1.3,1.3,5.5,0x8c6c66);box('trim',x,5.8,-45,2,.44,3.5,0xb69a73);}
  box('trim',.5,6,-46,23,.46,1.6,0x9a7568);
  shape('box','wall',3,4.6,-46,.12,2.7,.15,0x51454a);
  for(const [x,z] of [[-18,25],[15,23],[32,-9],[-36,3],[-7,-36],[8,-27],[38,28],[-42,26]]){
    solid(x,z,2.3,1.3,1.03,0x856e65);box('trim',x,1.07,z,2.39,.15,1.41,0xd09c6d);
  }
  for(const x of [-4.8,4.8])for(const z of [39,52]){
    solid(x,z,.55,.65,3.8,0x73646b);box('light',x,3.5,z,.64,.24,.72,0xffbd78);
  }
  sign('东桥　炉芯室',26,2.3,17,4,.6);
  sign('西桥　箭塔',-29,2.3,17,4,.6);
  sign('低沟　当心涨潮',0,1.6,19,3.7,.55);
  sign('转运室',1,3.0,-36,4.3,.7);
  return {lava};
}
function createEncounter({level,mapData}){
  const tide={reset(){
    if(this.flooded)level.terrainChanged();
    this.flooded=false;this.phase='calm';this.status=null;mapData.lava.position.y=-.85;
  },update(g){
    const t=g.time%60;
    const height=t<24?-.85:t<30?-.85+(t-24)*.4:t<45?1.55:Math.max(-.85,1.55-(t-45)*.4);
    const flooded=height>.08;
    if(flooded!==this.flooded){this.flooded=flooded;level.terrainChanged();}
    this.phase=flooded?'flood':t>=19 && t<27?'warning':'calm';
    mapData.lava.position.y=height;
    this.status=this.phase==='calm'?null:{title:flooded?'岩浆漫过低沟':'低沟即将封闭',detail:'两侧高桥开放'};
  }};
  level.calderaTide=tide;return tide;
}
const facility={ground,wallHeight:1.8,wallColor:0x77646c,roughness:.77,metalness:.28,
  spots:{spawn:[0,52],gate:[4,-44],bossSpawn:[-3,-42],bossAnchor:[-5,-36]},decorate,
  floorTexture(g,w,h){g.fillStyle='#827777';g.fillRect(0,0,w,h);for(let i=0;i<4;i++){
    g.strokeStyle='#635b61';g.strokeRect(0,i*32,w,31);
    g.fillStyle='#a79a89';g.fillRect(6,i*32+4,3,3);g.fillRect(w-9,i*32+4,3,3);}}};
export default {pageTitle:'火口三门',weaponSkin:'caldera-rift-works',story,grid:floorPlan(areas,56,60),
  config:{map:{cell:2,navCell:1,fog:.009},beasts:{sight:23}},buildMap:ctx=>buildFacility(ctx,facility),
  buildBeastModel:lavaModel,background:0xb89588,fog:0xb1958e,terrain:{ground,
    canEnter:(b,x,z,y,level)=>!level.calderaTide?.flooded || !low(x,z) || low(b.x,b.z),
    routeOpen:(x,z,level)=>!level.calderaTide?.flooded || !low(x,z)},createEncounter,
  navigationApproach(p,target,level){
    if(!level.calderaTide?.flooded || !low(p.x,p.z))return target;
    const z=p.z<0?-18:18;
    return {x:p.x,z,y:level.base(p.x,z)};
  },
  portal:{shield:false,visible:false},manualLoot:true,
  ammo:[[2,38],[-18,22],[22,26],[28,0],[-30,5],[0,-28],[10,-39]],health:[[37,22,25],[-33,-7,25],[8,-34,22]],
  loot:[[2,50,'吊桥铜栓',85],[-17,26,'铸工牌',100],[40,27,'炉温色标',105],[-44,24,'蓝釉测温杯',255],
    [-40,4,'箭塔锁片',110],[29,-4,'火道陶芯',95],[38,-13,'耐热模头',105],[18,-35,'封存蜡记',115],
    [9,-41,'熔岩玻璃',145],[-26,-26,'转运铆钉',85]],
  area:(x,z)=>areas.find(({bounds:[a,b,c,d]})=>x>=a&&x<c&&z>=b&&z<d)?.name??'熔铸廊',
  text:{title:'火口三门',tag:'裂谷设施 / 爆破',enter:'进入南吊桥',brief:rule,objective:rule,safe:'南吊桥',
    bossName:'熔岩巨像',winBrief:'火口设施已切断增援。'}};
