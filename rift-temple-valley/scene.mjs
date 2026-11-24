import {buildFacility,floorPlan} from '@level-kit/facility-map.mjs';
import {demolitionMission} from '@level-kit/rift-demolition.mjs';
import {realmModel} from '@level-kit/realm-model.mjs';

const areas=[
  ['南残碑营地','S',[-11,30,13,56]],['古城拱廊','H',[-32,16,30,36]],
  ['西竹林','W',[-40,-18,-20,20]],['墓道侧室','C',[-50,-22,-32,-7]],
  ['北断桥','B',[-29,-32,6,-20]],['桥西石阶','A',[-32,-26,-22,-12]],
  ['断桥祭殿','N',[-9,-44,13,-17]],['东崖石窟','E',[22,-30,44,6]],
  ['暗闩回廊','L',[11,-28,26,-22]],['石匠库','D',[14,1,33,20]],
].map(([name,tile,bounds])=>({name,tile,bounds}));
const ground=(x,z)=>Math.min(1,Math.max(0,(18-z)/40))*4.2;
const rule='从三处库房取任务弹，在地宫、祭殿与石窟安放。第三座门摧毁即胜，血月会加快尚存门的增援。';
const cases=[{name:'石匠库',at:[21,13]},{name:'墓道侧室',at:[-44,-14]},{name:'崖壁供案',at:[36,-4]}];
const gates=[
  {name:'地宫门',at:[-30,-9],retreat:[-29,3],bounds:[-38,-15,-22,4],delay:14,interval:13,cap:4,types:[0,0,2]},
  {name:'祭殿门',at:[3,-37],retreat:[1,-25],bounds:[-8,-42,11,-25],delay:21,interval:14,cap:4,types:[0,1,0]},
  {name:'石窟门',at:[36,-21],retreat:[31,-10],bounds:[24,-28,42,-12],delay:18,interval:15,cap:4,types:[2,0,0]},
];
const parts=[
  {name:'拱廊哨兵',count:4,bounds:[-18,17,12,28],anchor:[-9,22],types:[0]},
  {name:'竹林守卫',count:5,bounds:[-38,-9,-22,10],anchor:[-33,4]},
  {name:'殿前守卫',count:6,bounds:[-7,-41,10,-27],anchor:[5,-30]},
  {name:'东窟守卫',count:4,bounds:[24,-24,40,-8],anchor:[29,-18]},
];
const story=demolitionMission({name:'三殿驻防',rule,cases,gates,color:0x82c8c0,
  shortcut:{at:[18,-25],width:.45,depth:6,height:3.5,latch:[20,-25]},
  pressure:g=>g.encounter?.phase==='active'?1.65:1,victory:'三殿裂隙已封，山谷重归平静。'},parts,[0,0,2,0,1]);

function decorate({THREE,scene,solid,shape,box,sign}){
  scene.add(new THREE.HemisphereLight(0xffe0b1,0x698480,1.9));
  const sun=new THREE.DirectionalLight(0xffca92,2.1);sun.position.set(-29,42,-17);scene.add(sun);
  for(const [x,z] of [[-8,41],[8,41],[-15,22],[-2,22],[10,22]]){
    solid(x,z,1.2,1.5,4.3,0x817c70);box('trim',x,4.4,z,2.1,.4,1.9,0xc6b08d);
  }
  box('trim',0,4.92,41,19,.78,2.1,0x6e736a);
  // 远山围合谷地；祭殿的层檐高过廊墙，从营地即可辨认北方。
  for(const [x,z,w,h] of [[-45,-62,23,22],[-16,-74,27,33],[27,-67,24,29],[56,-43,22,25],
    [-63,-19,20,25],[-61,23,15,18],[62,19,17,22]]){
    shape('stone','wall',x,h*.35,z,w,h,w*.83,0x747e79,.46);
    shape('stone','trim',x-2,h*.61,z,w*.52,h*.56,w*.57,0x9ca39a,.19);
  }
  for(const [x,z,w,y] of [[2,-38,19,8.3],[2,-38,13,10.7],[0,41,20,5.9]]){
    for(const side of [-1,1])
      shape('box','trim',x+side*w*.23,y,z,w*.57,.53,6.8,0x617b70,0,0,-side*.24);
    box('trim',x,y+.6,z,.6,.58,7.6,0xa58c64);
  }
  for(const [x,z] of [[-35,9],[-23,4],[-37,-12],[-22,-11],[-34,16]]){
    for(let j=0;j<5;j++){
      const dx=(j%3)*.43,dz=Math.floor(j/3)*.67,h=4+(j%3);
      shape('cylinder','wall',x+dx,h/2,z+dz,.17,h,.17,0x557451);
      shape('stone','trim',x+dx,h-.7,z+dz,.9,.22,1.6,0x547858,j*1.3);
    }
    solid(x+.3,z+.3,1.3,1.25,.83,0x788071);
  }
  for(const x of [-19,-9])for(const z of [-29,-22])solid(x,z,1.1,1.1,2.5,0x8b7969);
  for(const x of [-5,9]){solid(x,-39,1.6,1.6,5.4,0x94715e);box('trim',x,5.6,-39,2.5,.7,2.5,0x786957);}
  box('trim',2,6.0,-39,18,.76,3.4,0x63736b);
  for(const [x,z] of [[27,-6],[40,-17],[25,-24],[38,1],[-16,30],[-25,-24],[7,-26],[-38,-18]]){
    solid(x,z,2.0,1.35,1.05,0x807c75);
    shape('stone','wall',x,1.23,z,1.9,.7,1.4,0x9f9783);
  }
  sign('石匠库　／　东崖',21,2.4,12,4.0,.65);
  sign('古城西廊　竹林地宫',-22,2.4,19,4.4,.6);
  sign('内闩　／　断桥',20.8,1.8,-26.8,2.8,.5);
  const moon=new THREE.Mesh(new THREE.SphereGeometry(5,20,12),new THREE.MeshBasicMaterial({color:0xeec79b}));
  moon.position.set(5,23,-67);scene.add(moon);return {sun,moon};
}
function createEncounter({mapData}){
  return {reset(){this.phase='calm';this.status=null;},update(g){
    const active=g.time%52>=26 && g.time%52<44;
    this.phase=active?'active':g.time%52>=21 && g.time%52<26?'warning':'calm';
    mapData.moon.material.color.setHex(active?0xea614b:0xeec79b);
    mapData.sun.color.setHex(active?0xff8e83:0xffca92);
    this.status=this.phase==='calm'?null:{title:active?'血月照谷':'血月将升',detail:'血月期间尚存裂隙增援加快'};
  }};
}
const facility={ground,wallHeight:2.2,wallColor:0x87867b,roughness:.91,metalness:.08,
  spots:{spawn:[1,49],gate:[3,-37],bossSpawn:[3,-33],bossAnchor:[2,-28]},decorate,
  floorTexture(g,w,h){g.fillStyle='#888373';g.fillRect(0,0,w,h);g.strokeStyle='#706e63';
    for(let i=0;i<4;i++){g.strokeRect(i*32,0,32,60+i%2*24);g.strokeRect(i*32,60+i%2*24,32,68);}}};
export default {pageTitle:'裂隙三殿',weaponSkin:'rift-temple-valley',story,grid:floorPlan(areas,54,60),
  config:{map:{cell:2,navCell:1,fog:.009},beasts:{sight:22}},buildMap:ctx=>buildFacility(ctx,facility),
  buildBeastModel:realmModel,background:0xc7aa94,fog:0xb2ac99,terrain:{ground},createEncounter,
  portal:{shield:false,visible:false},manualLoot:true,
  ammo:[[3,42],[-16,24],[-29,8],[-20,-25],[1,-24],[25,10],[31,-12]],health:[[-24,19,24],[0,-29,26],[31,-8,23]],
  loot:[[2,50,'残碑拓片',80],[8,32,'石匠铜尺',85],[-44,-18,'竹简星图',240],[-22,11,'青玉珠',95],
    [-15,-26,'桥桩铜环',110],[8,-34,'古殿香盒',135],[27,-25,'月纹璧',115],[37,-6,'石窟壁签',100],
    [20,8,'墨斗',95],[-24,26,'破印石',90]],
  area:(x,z)=>areas.find(({bounds:[a,b,c,d]})=>x>=a&&x<c&&z>=b&&z<d)?.name??'山谷',
  text:{title:'裂隙三殿',tag:'环形山谷 / 爆破',enter:'进入残碑营地',brief:rule,objective:rule,safe:'残碑营地',
    bossName:'山谷巨兽',winBrief:'三处裂隙均已封闭。'}};
