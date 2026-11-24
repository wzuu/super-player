import {buildFacility,floorPlan} from '@level-kit/facility-map.mjs';
import {convoyMission} from '@level-kit/convoy.mjs';
import {clockworkModel} from '@level-kit/clockwork-model.mjs';

const areas=[
  ['卸货湾','B',[-20,35,3,62]],['机器棚横廊','M',[-17,25,30,43]],
  ['装配线底层','M',[10,-3,29,34]],['传送带侧廊','C',[-6,8,13,31]],
  ['零件库','C',[-16,8,0,26]],['下行轨道口','R',[-30,-6,29,9]],
  ['西折返台','R',[-30,-23,-12,3]],['压力阀坡道','R',[-25,-26,30,-11]],
  ['压力阀房','V',[12,-41,32,-16]],['装车走廊','E',[-19,-48,28,-31]],
].map(([name,tile,bounds])=>({name,tile,bounds}));
const clip=x=>Math.max(0,Math.min(1,x));
function ground(x,z){
  const lower=3*clip((7-x)/24)*clip((14-z)/7);
  const upper=clip((-z-7)/6)*(3+3.2*clip((x+13)/31));
  return Math.max(lower,upper,6.2*clip((-z-29)/7));
}
const station=(x,z,name,stop,door)=>({at:[x,z],name,stop,door});
const track=[station(-8,51,'卸货湾'),station(-8,34,'机器棚横廊'),station(18,34,'装配线底层'),
  station(18,19,'机器棚','放行满载检修车','workshop'),station(18,2,'下轨交接点'),
  station(-21,2,'西折返台'),station(-21,-18,'西端转向机'),station(21,-18,'压力阀房','确认压力表，开启装车闸','valve'),
  station(21,-38,'装车走廊'),station(-12,-38,'出厂升降机')];
const parts=[
  {name:'卸货机群',count:4,bounds:[-16,30,-3,40],anchor:[-9,34],types:[0]},
  {name:'机器棚来敌',count:6,bounds:[12,16,27,32],anchor:[21,26]},
  {name:'皮带侧翼',count:4,bounds:[-12,9,4,24],anchor:[-5,16]},
  {name:'下层轨道',count:7,bounds:[-17,-4,8,7],anchor:[0,3]},
  {name:'压力阀前哨',count:7,bounds:[-18,-24,14,-13],anchor:[-3,-18]},
  {name:'装车拦截组',count:5,bounds:[-14,-45,14,-33],anchor:[2,-39]},
];
function cart(THREE){
  const group=new THREE.Group(),brass=new THREE.MeshStandardMaterial({color:0xba914e,metalness:.55,roughness:.4}),
    iron=new THREE.MeshStandardMaterial({color:0x3c505a}),caseMat=new THREE.MeshStandardMaterial({color:0x688d7d});
  const add=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);group.add(m);return m;};
  add(new THREE.BoxGeometry(1.3,.24,1.82),iron,0,-.58,0);
  add(new THREE.BoxGeometry(.94,.75,1.18),caseMat,0,-.08,-.14);
  for(const x of [-.61,.61])for(const z of [-.61,.61]){
    const axle=add(new THREE.CylinderGeometry(.26,.26,.19,10),iron,x,-.74,z);axle.rotation.z=Math.PI/2;
  }
  for(const z of [-.49,.24])add(new THREE.BoxGeometry(1,.09,.16),brass,0,.34,z);
  add(new THREE.SphereGeometry(.18,8,6),brass,0,.52,.31);
  return group;
}
const rule='护送检修车沿双折返轨道上行，在机器棚和压力阀房放行，送入出厂升降机。';
const story=convoyMission({name:'检修车',group:'折返轨道守卫',rule,track,speed:3.6,radius:.72,model:cart,
  walls:[['workshop',18,13,5.8,.45,2.8],['valve',21,-26,5.8,.45,2.8]],
  canAdvance:(g,b)=>!(g.encounter?.phase==='active' && Math.abs(b.x-18)<3 && b.z>5 && b.z<11),
  loss:'检修车已损毁，校准设备受损',victory:'出厂升降机已接走检修车，校准设备完好。'},parts,[0,0,1,2,0,2]);
function paving(g,w,h){
  g.fillStyle='#8a8880';g.fillRect(0,0,w,h);
  for(let i=0;i<4;i++){
    g.fillStyle='#535e61';g.fillRect(i*32,0,1.6,h);g.fillRect(0,i*32,w,1.6);
    for(let j=0;j<4;j++){g.fillStyle='#c2ad84';g.fillRect(i*32+4,j*32+4,2,2);}
  }
}
function edge({x,z,w,d,dc,dr},{solid,box}){
  const h=z< -9?1.5:4.1;
  solid(x,z,w,d,h,0x586970,-.3);
  box('trim',x-dc*.15,h-.3,z-dr*.15,dc ? .52 : w,.26,dr ? .52 : d,0xad8757);
  return true;
}
function decorate({THREE,scene,solid,shape,box,sign}){
  scene.add(new THREE.HemisphereLight(0xf4d6aa,0x7a818a,1.85));
  const sun=new THREE.DirectionalLight(0xfce0b3,1.7);sun.position.set(19,38,28);scene.add(sun);
  // 轨枕随坡面逐段升高，错层处的栏杆保留交接端。侧廊的宽皮带另通零件库。
  for(let i=1;i<track.length;i++){
    const [ax,az]=track[i-1].at,[bx,bz]=track[i].at,dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz),
      nx=-dz/len,nz=dx/len,yaw=Math.atan2(dx,dz);
    const pieces=Math.ceil(len/1.15);
    for(let j=0;j<pieces;j++){
      const t=(j+.5)/pieces,x=ax+dx*t,z=az+dz*t;
      for(const side of [-1,1])box('trim',x+nx*.65*side,.07,z+nz*.65*side,.13,.14,len/pieces+.14,0xa4947b,yaw);
      if(j%2===0)box('trim',x,.035,z,1.82,.06,.25,0x554e47,yaw);
      if(i>=5 && i<=7 && j>=4 && j<pieces-4 && j%4===0)solid(x+nx*3.2,z+nz*3.2,.21,.24,1.14,0xb59b62);
    }
  }
  for(const z of [13,17,21,25])box('wall',4,.15,z,4.8,.27,3.85,0x516568);
  for(let z=11;z<28;z+=.74)box('trim',4,.33,z,4.4,.09,.13,0x889898);
  for(const [x,z] of [[-14,53],[-14,47],[-4,37],[26,25],[-12,18],[23,-13],[4,-44]]){
    solid(x,z,2.65,2.2,1.7,0x927556);box('trim',x,1.45,z,2.81,.18,2.33,0xc2a06a);
  }
  for(const x of [12,25]){
    for(const z of [18,26,32])solid(x,z,.65,.75,5.0,0x526369);
  }
  for(const z of [18,26,32])solid(18.5,z,13.6,1,.32,0xa8926e,4.6);
  sign('检修车道　01',18,3.7,26.6,5.3,.76);
  for(const [x,z] of [[26,7],[-27,-3],[-23,-24],[25,-22]]){
    shape('cylinder','wall',x,1.12,z,2.3,2.25,2.3,0x827767);
    box('trim',x,2.38,z,2.6,.28,2.4,0xc3a15c);
    shape('cylinder','light',x,2.8,z,1.0,.40,1.0,0xcfa563);
  }
  for(let x=-8;x<=10;x+=4)solid(x,-24,.38,.5,2.4,0x5b7476);
  sign('压力阀层',13,3.1,-23,4.6,.8);
  for(const x of [-17,-7])solid(x,-42,1,1,5.2,0x596b71);
  solid(-12,-42,11.1,1,.5,0xb38c50,4.83);
  sign('出厂升降机',-12,4.13,-41.38,5.3,.9);
  const jets=new THREE.Group();scene.add(jets);
  const steam=new THREE.MeshBasicMaterial({color:0xc2d4cf,transparent:true,opacity:.32,depthWrite:false});
  for(let i=0;i<7;i++){
    const plume=new THREE.Mesh(new THREE.SphereGeometry(1,7,5),steam);
    plume.position.set(15+i*.77,1.3+Math.sin(i*.7)*.4,8);plume.scale.set(.92,.8,.79);jets.add(plume);
  }
  return {jets};
}
function createEncounter({mapData}){
  return {reset(){this.phase='calm';this.status=null;this.nextBurn=0;mapData.jets.visible=false;},
    update(g,dt){
      const t=(g.time+5)%21,p=g.player;
      if(Math.abs(p.x-4)<2.2 && p.z>11 && p.z<27 && p.y-ground(p.x,p.z)<.5)
        g.level.move(p,0,-1.8*dt,.45);
      this.phase=t<11?'calm':t<14?'warning':t<18?'active':'calm';
      mapData.jets.visible=this.phase==='active';
      mapData.jets.position.y=Math.sin(g.time*6)*.17;
      this.status=this.phase==='calm'?null:{title:this.phase==='warning'?'压力表升高':'下轨蒸汽排放',
        detail:'车道暂缓，皮带侧廊可绕行',remaining:(this.phase==='warning'?14:18)-t};
      if(this.phase==='active' && Math.abs(p.x-18)<3.2 && Math.abs(p.z-8)<1.8 && g.time>=this.nextBurn){
        this.nextBurn=g.time+.8;p.hurt(6,g,.22,{x:18,y:p.y,z:8});
      }
    }};
}
const facility={spots:{spawn:[-8,54],gate:[-12,-38],bossAnchor:[1,-40],bossSpawn:[3,-41]},
  ground,roughness:.58,metalness:.36,wallHeight:4,wallColor:0x647078,floorTexture:paving,edge,decorate};
export default {pageTitle:'蒸汽检修线',weaponSkin:'steam-service-rail',story,grid:floorPlan(areas,40,66),
  config:{map:{cell:2,navCell:1,fog:.010},beasts:{sight:21,memory:6}},buildMap:ctx=>buildFacility(ctx,facility),
  buildBeastModel:clockworkModel,buildRageModel:h=>clockworkModel(3,h,true),createEncounter,
  portal:{shield:false,visible:false},manualLoot:true,background:0x625653,fog:0x837b70,terrain:{ground},
  ammo:[[-13,49],[-2,34],[21,18],[-14,1],[-18,-22],[23,-31],[4,-37]],health:[[-4,47,22],[16,-21,24]],
  loot:[[-12,52,'卸货班牌',85],[-7,39,'起重机铜钩',105],[24,31,'检修班手记',110],[-9,15,'黄铜校准规',245],
    [5,19,'皮带辊轴签',100],[-15,4,'轨枕样片',95],[-22,-11,'转向器销',105],[4,-21,'双刻压力表',130],
    [24,-32,'出厂单',95],[-7,-37,'升降机铭牌',155]],
  area:(x,z)=>areas.find(({bounds:[a,b,c,d]})=>x>=a&&x<c&&z>=b&&z<d)?.name??'机坊检修区',
  text:{title:'蒸汽检修线',tag:'黄铜机坊 / 护送',enter:'进入卸货湾',brief:rule,objective:rule,
    safe:'卸货湾',bossName:'巡轨重机',winBrief:'设备已从出厂升降机装运。'}};
