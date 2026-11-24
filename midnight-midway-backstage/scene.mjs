import {Reflector} from 'three/addons/objects/Reflector.js';
import {floorPlan,buildFacility} from '@level-kit/facility-map.mjs';
import {demolitionMission} from '@level-kit/rift-demolition.mjs';
import {carnivalModel} from '@level-kit/carnival-model.mjs';

const areas=[
  ['入口售票廊','S',[-10,30,12,56]],['票务库','O',[8,26,23,43]],
  ['三幕门厅','H',[-25,9,27,34]],['木马围场','C',[-50,-16,-19,17]],
  ['木马机房','W',[-48,-29,-29,-10]],['镜屋长廊','M',[-8,-26,6,12]],
  ['镜屋底厅','N',[-15,-44,13,-22]],['值班室','D',[-29,-34,-11,-19]],
  ['轨道短廊','T',[21,-15,32,15]],['维修站','E',[20,-34,48,-12]],
  ['后台折廊','B',[4,-30,24,-22]],['道具仓','P',[32,-12,47,6]],
  ['东后台绕行','A',[36,2,46,25]],['帷幕后廊','R',[21,18,42,26]],
].map(([name,tile,bounds])=>({name,tile,bounds}));
const ground=(x,z)=>1.7*Math.min(1,Math.max(0,(-z-7)/15));
const rule='在票务库、值班室和道具仓领取任务弹，自选顺序摧毁三座门。轨道过车时可由帷幕后绕行。';
const cases=[{name:'票务库',at:[17,36]},{name:'值班室',at:[-23,-26]},{name:'道具仓',at:[40,-4]}];
const gates=[
  {name:'木马机房门',at:[-40,-22],retreat:[-34,-12],bounds:[-46,-26,-31,-12],delay:13,interval:15,cap:4,types:[0,0,1]},
  {name:'镜屋底厅门',at:[3,-37],retreat:[1,-26],bounds:[-12,-41,11,-26],delay:19,interval:13,cap:4,types:[2,0,0]},
  {name:'车站维修门',at:[39,-26],retreat:[32,-17],bounds:[22,-31,46,-15],delay:16,interval:14,cap:4,types:[0,1,0]},
];
const parts=[
  {name:'检票巡查',count:4,bounds:[-15,12,11,26],anchor:[-9,19],types:[0]},
  {name:'木马守卫',count:5,bounds:[-47,-13,-23,4],anchor:[-37,-6]},
  {name:'镜厅守卫',count:5,bounds:[-12,-41,9,-26],anchor:[-6,-33]},
  {name:'车站守卫',count:6,bounds:[23,-31,45,-15],anchor:[31,-23]},
];
const story=demolitionMission({name:'三幕后台驻敌',rule,cases,gates,color:0xb98ffa,
  victory:'三处后台机房的传送门已全部关闭。'},parts,[0,0,2,0,1]);
function decorate({THREE,scene,shape,box,solid,sign}){
  scene.add(new THREE.HemisphereLight(0xf6d8dd,0x78759a,1.8));
  const lamp=new THREE.DirectionalLight(0xffd5b1,1.7);lamp.position.set(-18,27,35);scene.add(lamp);
  for(const x of [-8,9]){
    solid(x,39,1.5,2.4,3.0,0x815663);
    for(let j=0;j<3;j++)box('light',x,2.6,40.23+j*.02,.30,.21,.1,0xffcc86);
    box('trim',x,3.1,39,2.1,.34,3.0,0xae887b);
  }
  box('trim',.5,4.3,39,19.6,1.0,1.8,0x8c6068);sign('午夜游园　／　三幕后台',.5,4.4,40,8,.8);
  // 放射状门厅用三种轮廓标出游乐设施。东侧桁架的灯线接到安全后台。
  for(const [x,z,span,color] of [[-22,15,6,0xe4a07e],[-1,10,11,0x97d9d5],[26,13,8,0xd2a4da]]){
    for(const side of [-1,1]){
      solid(x+side*span*.5,z,.58,.7,4.3,0x806477);
      shape('box','trim',x+side*span*.25,4.85,z,span*.57,.5,.8,color,0,0,-side*.24);
    }
  }
  for(const z of [28,33])for(let i=0;i<11;i++){
    const x=-9+i*1.8,h=4.6+.009*x*x;
    box('trim',x,h,z,1.88,.07,.10,0x8a7684);
    shape('stone','light',x,h-.18,z,.22,.39,.22,i%2?0xffc781:0xb9a4ed);
  }
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6;
    shape('stone','trim',-34+Math.sin(a)*3.7,4.5,2+Math.cos(a)*3.7,2.3,1.9,2.2,i%2?0xaf7489:0xc89a83,a);
  }
  // 镜片背板是真实墙体。暖色出口灯连续沿地脚通到北厅，镜片方向只反射长廊。
  for(const [x,z,angle] of [[-7.2,-6,Math.PI/2],[4.8,-16,-Math.PI/2]]){
    solid(x,z,.63,6.7,3.1,0x796780);
    const mirror=new Reflector(new THREE.PlaneGeometry(6.3,2.6),
      {color:0xbdb2c4,textureWidth:160,textureHeight:160,clipBias:.008});
    mirror.rotation.y=angle;mirror.position.set(x+Math.sin(angle)*.35,ground(x,z)+1.55,z);scene.add(mirror);
  }
  for(let z=7;z>=-28;z-=4)box('light',1,.045,z,.26,.06,1.55,0xffcf81);
  sign('真出口　／　底厅',0,2.6,-21,4.1,.58);
  for(const [x,z] of [[-35,2],[-36,-19],[32,-27],[9,-32],[-18,19],[22,22],[41,-2]]){
    solid(x,z,2.1,1.4,1.06,0x846c7a);box('trim',x,1.12,z,2.17,.18,1.52,0xb49182);
  }
  const carousel=new THREE.Group();carousel.position.set(-34,ground(-34,2),2);scene.add(carousel);
  const paint=new THREE.MeshStandardMaterial({color:0xcc8584}),gold=new THREE.MeshStandardMaterial({color:0xdfbc87});
  for(let i=0;i<5;i++){
    const yaw=i*2*Math.PI/5,x=Math.sin(yaw)*4,z=Math.cos(yaw)*4;
    const animal=new THREE.Mesh(new THREE.BoxGeometry(.65,.78,1.45),paint);
    animal.position.set(x,1.08,z);animal.rotation.y=yaw+Math.PI/2;carousel.add(animal);
    const rod=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,3.2,6),gold);
    rod.position.set(x,1.7,z);carousel.add(rod);
  }
  shape('cylinder','trim',-34,3.9,2,10,.46,10,0xa97984);
  for(const x of [23,29])box('trim',x,.12,-1,.19,.19,25,0xbdacaa);
  for(let z=-12;z<12;z+=2.4)box('wall',26,.08,z,6.9,.12,.42,0x897467);
  const car=new THREE.Group();car.position.x=26;scene.add(car);
  const chassis=new THREE.Mesh(new THREE.BoxGeometry(5.4,1.15,3.2),paint);chassis.position.y=.91;car.add(chassis);
  for(const x of [-1.5,1.5]){
    const light=new THREE.Mesh(new THREE.SphereGeometry(.23,9,6),new THREE.MeshBasicMaterial({color:0xffbf62}));
    light.position.set(x,1.05,1.62);car.add(light);
  }
  sign('车站　／　轨道短路',26,2,13,4.2,.6);sign('安全后台',39,2.1,18,3.7,.57);
  sign('木马机房',-32,2.5,-12,3.9,.58);return {carousel,car};
}
function createEncounter({mapData}){
  let cooldown;
  return {reset(){cooldown=new WeakMap();this.phase='calm';this.status=null;},update(g){
    const t=g.time%18,angle=g.time*.55,car=mapData.car;
    mapData.carousel.rotation.y=angle;car.visible=t>=5 && t<12;
    car.position.z=-14+(t-5)*4;car.position.y=ground(26,car.position.z);
    this.phase=car.visible?'active':t>=2 && t<5?'warning':'calm';
    this.status=this.phase==='calm'?null:{title:car.visible?'维修车通过':'轨道灯闪烁',detail:'东侧后台通道保持开放'};
    for(const b of [g.player,...g.beasts.pool.filter(member=>member.active)]){
      if((cooldown.get(b)??0)>g.time)continue;
      const hitCar=car.visible && Math.abs(b.x-26)<2.8 && Math.abs(b.z-car.position.z)<1.75;
      const dx=b.x+34,dz=b.z-2;
      if(!hitCar && !(Math.abs(Math.hypot(dx,dz)-4)<.74 &&
        Math.cos((Math.atan2(dx,dz)-angle)*5)>.76))continue;
      cooldown.set(b,g.time+1.55);
      if(b===g.player)b.hurt(hitCar?14:6,g,undefined,hitCar?car.position:{x:-34,z:2});
      else g.beasts.damage(b,hitCar?27:12,g,'environment');
    }
  }};
}
const facility={ground,wallHeight:2.7,wallColor:0x716276,roughness:.75,metalness:.22,
  spots:{spawn:[0,50],gate:[3,-37],bossSpawn:[0,-35],bossAnchor:[4,-30]},decorate,
  floorTexture(g,w,h){g.fillStyle='#847785';g.fillRect(0,0,w,h);
    g.fillStyle='#786977';g.fillRect(0,0,w/2,h/2);g.fillRect(w/2,h/2,w/2,h/2);}};
export default {pageTitle:'午夜三幕后台',weaponSkin:'midnight-midway-backstage',story,grid:floorPlan(areas,54,60),
  config:{map:{cell:2,navCell:1,fog:.012},beasts:{sight:22}},buildMap:ctx=>buildFacility(ctx,facility),
  buildBeastModel:carnivalModel,background:0x675d73,fog:0x736a80,terrain:{ground},createEncounter,
  portal:{shield:false,visible:false},manualLoot:true,
  ammo:[[0,38],[-15,20],[-34,-8],[0,-19],[26,10],[38,-7],[31,-18]],health:[[17,30,24],[-26,-24,24],[35,-18,22]],
  loot:[[2,48,'铜票夹',85],[15,34,'检票钳',90],[-44,-20,'釉面木马徽章',250],[-27,5,'灯泡色样',85],
    [-22,-22,'值班表',90],[-6,-33,'半月镜坠',120],[26,21,'幕后通行牌',95],[38,1,'道具漆印',100],
    [32,-21,'车轴铭牌',100],[8,-29,'金边节目单',145]],
  area:(x,z)=>areas.find(({bounds:[a,b,c,d]})=>x>=a&&x<c&&z>=b&&z<d)?.name??'游园后台',
  text:{title:'午夜三幕后台',tag:'午夜游园 / 爆破',enter:'进入售票廊',brief:rule,objective:rule,safe:'售票廊',
    bossName:'狂欢团长',winBrief:'后台已恢复安静。'}};
