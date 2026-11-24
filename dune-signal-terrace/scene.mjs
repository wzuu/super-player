import {buildFacility,floorPlan} from '@level-kit/facility-map.mjs';
import {defenseMission} from '@level-kit/defense.mjs';
import {tombModel} from '@level-kit/tomb-model.mjs';

const areas=[
  ['南营沙丘','S',[-11,36,15,64]],['棕榈盆地','P',[-35,19,35,45]],
  ['西供水室','O',[-44,18,-25,36]],['西柱廊','W',[-24,-7,-12,22]],
  ['东运输坡','E',[10,-7,24,22]],['偏心陵台','T',[-32,-38,26,-6]],
  ['后补给龛','N',[-27,-49,-8,-32]],
].map(([name,tile,bounds])=>({name,tile,bounds}));
const clip=x=>Math.max(0,Math.min(1,x));
function ground(x,z){
  return 4.1*clip((20-z)/24)+1.55*clip((-6-z)/11);
}
const rule='穿过柱廊，在陵台点亮信号。守住两道挡栏，存活至救援倒计时结束。';
const lanes=[
  {name:'西柱廊',barrier:[-18,-4,12,.45],strength:280,delay:2,path:[[-18,16],[-18,-2.45]],inside:[-18,-9]},
  {name:'东运输坡',barrier:[17,-4,14,.45],strength:270,delay:11,path:[[17,16],[17,-2.45]],inside:[17,-9]},
];
const parts=[
  {name:'沙丘哨兵',count:4,bounds:[-8,25,10,39],anchor:[2,31],types:[0]},
  {name:'西柱廊',count:10,bounds:[-30,20,-13,35],anchor:[-20,25]},
  {name:'东运输坡',count:9,bounds:[12,20,29,36],anchor:[18,25]},
  {name:'供水室',count:4,bounds:[-42,20,-31,32],anchor:[-36,24]},
  {name:'陵台守卫',count:5,bounds:[-26,-29,6,-11],anchor:[-9,-20]},
];
const story=defenseMission({name:'陵台防守',rule,beacon:[-6,-23],seconds:50,railColor:0xa67442,
  approach:'沿东西柱廊上到信标所在的陵台',victory:'绿洲救援已抵达，信号班平安撤离。',lanes},parts,[0,0,2,1,0,2]);

function decorate({THREE,scene,shape,box,solid,sign}){
  scene.add(new THREE.HemisphereLight(0xffdfad,0x906f60,1.65));
  const sun=new THREE.DirectionalLight(0xffdc93,2);sun.position.set(-33,36,-25);scene.add(sun);
  // 陵台的两段阶壁之间留开射界，低处的驼队和水渠标出入口。
  for(const x of [-29,-8,4,24])for(const z of [-31,-13]){
    solid(x,z,1.3,1.3,4.6,0xb78551);
    box('trim',x,4.6,z,2.1,.45,2.1,0xe2be82);
    box('trim',x,.38,z,2.1,.68,2.1,0xa67d54);
  }
  for(const [x,z] of [[-26,-13],[-10,-10],[8,-15],[21,-20],[-22,-31],[-4,30],[12,37],[-25,27]]){
    solid(x,z,3.1,1.45,1.08,0xb88755);box('trim',x,1.15,z,3.44,.21,1.68,0xd9b580);
  }
  for(const x of [-23.1,-13.2])for(const z of [0,7,14]){
    solid(x,z,.82,.86,3.24,0xba8b5c);box('trim',x,3.18,z,1.27,.43,1.3,0xe1bc82);
  }
  for(const z of [0,14])box('trim',-18,3.50,z,10.5,.55,1.23,0xc8a16a);
  // 信标前留出操作位；方尖碑与天线从两条坡道均可辨认。
  solid(-6,-26,2.3,2.3,.9,0xbf9c62);
  shape('cylinder','wall',-6,3.7,-26,.72,6.2,.72,0xc8ab75);
  for(const y of [2.4,4.1,5.8])shape('cylinder','light',-6,y,-26,1.16,.13,1.16,0x75e7d1);
  shape('stone','light',-6,6.97,-26,.62,.54,.62,0x92fff0);
  sign('绿洲通信　／　信标',-6,2.1,-24.8,3.8,.58);
  sign('西柱廊',-18,2.82,14.8,3.6,.67);sign('东运输坡',17,2.2,17.9,3.3,.61);
  for(const [x,z] of [[-30,35],[-24,38],[29,31],[10,52],[-36,23]]){
    shape('cylinder','wall',x,2.5,z,.45,5,.55,0x836344);
    for(let j=0;j<7;j++){
      const a=j*.898;
      shape('stone','trim',x+Math.sin(a)*1.05,4.7,z+Math.cos(a)*1.05,.67,.39,3.12,0x718154,a);
    }
  }
  box('glass',-37,.08,29,6,.13,5,0x45bbaa);
  for(const x of [-8,11]){
    for(const dx of [-1.8,1.8])solid(x+dx,52,.16,.16,2.0,0x796346);
    for(const side of [-1,1])shape('box','trim',x+side*.97,2.19,52,2.32,.12,4.2,0x9a6343,0,0,-side*.32);
    box('trim',x,1.02,50.04,3.8,1.85,.14,0xaa7852);
  }
  for(const [x,z,h] of [[-34,-35,10],[19,-32,8]]){
    solid(x,z,2.1,2.1,h,0xb58d62);
    shape('stone','trim',x,h+.76,z,2.0,2.6,2.0,0xd4b477);
    for(let y=1.5;y<h-1;y+=1.5)box('trim',x,y,z+1.07,.65,.16,.07,0x7d6a54);
  }
  const dust=new THREE.Group();scene.add(dust);
  const mat=new THREE.PointsMaterial({color:0xe0bf86,size:.09,transparent:true,opacity:.65});
  const coords=new Float32Array(550*3);
  for(let i=0;i<coords.length;i+=3){coords[i]=(i*13.71)%90-45;coords[i+1]=.4+(i*1.43)%9;coords[i+2]=(i*19.31)%116-54;}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(coords,3));
  dust.add(new THREE.Points(geo,mat));return {dust};
}
function createEncounter({mapData,scene}){
  return {reset(){this.phase='calm';this.status=null;mapData.dust.visible=false;},
    update(g){const t=g.time%38;this.phase=t<13?'calm':t<17?'warning':t<29?'active':'calm';
      mapData.dust.visible=this.phase==='active';mapData.dust.position.x=(g.time*4)%6-3;
      if(scene.fog?.isFogExp2)scene.fog.density=this.phase==='active'?.036:.009;
      this.status=this.phase==='calm'?null:{title:this.phase==='active'?'沙幕横穿绿洲':'沙暴将至',detail:'留意两侧入口警报'};
    }};
}
const facility={ground,roughness:.92,metalness:.05,wallHeight:2.3,wallColor:0xc7a071,
  spots:{spawn:[2,55],gate:[-6,-23],bossAnchor:[9,-24],bossSpawn:[11,-26]},
  floorTexture(g,w,h){g.fillStyle='#bb996f';g.fillRect(0,0,w,h);for(let j=0;j<9;j++){g.fillStyle=j%2?'#c4a57d':'#ab8c64';g.fillRect(j*17%w,j*27%h,10+j,1);}},
  decorate};
export default {pageTitle:'沙海信号台',weaponSkin:'dune-signal-terrace',story,grid:floorPlan(areas,48,68),
  config:{map:{cell:2,navCell:1,fog:.009},beasts:{sight:23}},buildMap:ctx=>buildFacility(ctx,facility),
  buildBeastModel:tombModel,background:0xcab18b,fog:0xc5b18e,terrain:{ground},createEncounter,
  portal:{shield:false,visible:false},manualLoot:true,
  ammo:[[5,48],[-17,12],[19,14],[-24,-20],[7,-24],[-15,-40],[16,-12]],health:[[-8,33,22],[-22,-36,25]],
  loot:[[1,57,'营地水牌',80],[-7,44,'骆驼铃',85],[-36,26,'绿洲星盘',245],[25,34,'麻绳卷',85],
    [-17,7,'柱廊铭片',95],[18,8,'车队铜环',100],[-22,-16,'护壁砖记',100],[6,-18,'砂岩衬片',100],
    [-12,-45,'信号旧簿',130],[7,-31,'金边沙漏',145]],
  area:(x,z)=>areas.find(({bounds:[a,b,c,d]})=>x>=a&&x<c&&z>=b&&z<d)?.name??'绿洲',
  text:{title:'沙海信号台',tag:'绿洲陵台 / 坚守',enter:'进入南营沙丘',brief:rule,objective:rule,
    safe:'南营沙丘',bossName:'石甲守陵者',winBrief:'绿洲信号已收到回应。'}};
