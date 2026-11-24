import {buildFacility,floorPlan} from '@level-kit/facility-map.mjs';
import {escapeRoute} from '@level-kit/escape-route.mjs';
import {watchRooms} from '@level-kit/room-guards.mjs';
import {yokaiModel} from '@level-kit/yokai-model.mjs';

const areas=[
  ['低街木户','L',[-32,42,-16,66]],['灯笼横巷','L',[-32,34,14,48]],
  ['纸行长街','L',[2,8,16,36]],['织坊前院','S',[-22,18,-10,36]],
  ['染织穿堂','S',[-22,12,4,24]],['药铺南廊','S',[14,21,29,31]],
  ['药铺后院','S',[22,1,32,23]],['河岸小巷','A',[2,-2,32,10]],
  ['石拱桥','B',[4,-20,14,0]],['桥北参道','H',[-25,-28,14,-18]],
  ['杉林石阶','H',[-28,-52,-16,-22]],['神社参道','H',[-28,-58,18,-46]],
  ['避难门前庭','T',[6,-67,26,-48]],
].map(([name,tile,bounds])=>({name,tile,bounds}));
const clip=x=>Math.max(0,Math.min(1,x));
function ground(x,z){
  const bridge=1.15*clip((3-z)/10)*clip((z+22)/9);
  const hill=5*clip((-z-24)/24);
  return bridge+hill+1.4*clip((x+19)/26)*clip((-z-40)/6);
}
const exit=[17,-59], rule='穿过灯笼巷，走石桥和折返参道抵达避难门。织坊与药铺都能绕回主街。';
const parts=[
  {name:'木户前哨',count:3,bounds:[-30,35,-18,46],anchor:[-24,39],types:[0]},
  {name:'低街巡游',count:9,bounds:[-14,35,12,46],anchor:[-5,39]},
  {name:'织坊看守',count:4,bounds:[-20,13,-11,30],anchor:[-15,20]},
  {name:'药铺来敌',count:4,bounds:[23,3,31,24],anchor:[27,12]},
  {name:'桥前伏兵',count:7,bounds:[3,0,17,15],anchor:[9,5]},
  {name:'石阶拦路鬼',count:6,bounds:[-26,-46,-17,-25],anchor:[-21,-35]},
  {name:'参道后队',count:4,bounds:[-10,-56,5,-47],anchor:[-2,-52]},
];
const story=escapeRoute({name:'夜巡封街',exit,label:'进入山腰神社的避难门',rule,parts,
  mix:[0,0,1,0,2,0,0],victory:'你穿过了避难门，身后的灯巷仍有百鬼游行。'});
const procession=[[8,40],[9,5],[9,-23],[-22,-23],[-22,-51],[12,-52]];
story.watchRooms=(b,g,dt,visible,config)=>{
  if(!g.encounter?.parading || b.sectionRoom!=='低街巡游')return watchRooms(b,g,dt,visible,config);
  if(b.hp<b.maxHP || (Math.hypot(b.x-g.player.x,b.z-g.player.z)<config.beasts.sight && visible(b,g.player)))return false;
  // 整队沿街依次转弯。各排的行进位置错开，转身后仍能从侧面绕过队尾。
  if(b.processionPost!==b.guardPost){b.processionPost=b.guardPost;b.processionLeg=0;}
  const [x,z]=procession[b.processionLeg];
  const lane=(b.id%3-1)*1.5, dx=x+lane-b.x,dz=z+(b.id%2)*1.2-b.z;
  const dist=Math.hypot(dx,dz);
  if(dist<1.3){if(b.processionLeg<procession.length-1)b.processionLeg++;return true;}
  b.yaw=Math.atan2(dx,dz);b.fx=dx/dist;b.fz=dz/dist;
  b.stride=g.level.move(b,b.fx*dt*2.35,b.fz*dt*2.35,.47)/dt;
  return true;
};
function stone(g,w,h){
  g.fillStyle='#6c6875';g.fillRect(0,0,w,h);
  for(let row=0;row<4;row++)for(let col=-1;col<3;col++){
    const x=col*61+(row%2)*28,y=row*33;
    g.fillStyle=['#94909d','#83828d','#99909b'][(row+col+3)%3];
    g.fillRect(x,y,58,30);g.fillStyle='#77717b';g.fillRect(x+3,y+25,21,2);
  }
}
const cedar=0x664336,vermilion=0xb95339,stoneGrey=0x6c7383;
function courtyard({x,z,w,d,dr,dc},{box,solid}){
  if(z< -16) {
    solid(x,z,w,d,1.32,stoneGrey,-.3);
    box('trim',x,1.12,z,dc ? .70 : w,.22,dr ? .70 : d,0x4d5563);
  }else{
    solid(x,z,w,d,3.45,0xb3a395,-.25);
    box('wall',x,3.38,z,dc?1.12:w,.35,dr?1.12:d,0x393845);
    box('trim',x-dc*.20,1.43,z-dr*.20,dc ? .11 : w,.18,dr ? .11 : d,cedar);
    box('trim',x-dc*.22,1.67,z-dr*.22,dc ? .12 : .15,3.25,dr ? .12 : .15,cedar);
  }
  return true;
}
function decorate({THREE,scene,box,shape,solid,sign}){
  scene.add(new THREE.HemisphereLight(0xe2d5ea,0x817780,1.8));
  const sun=new THREE.DirectionalLight(0xffc398,1.6);sun.position.set(-25,40,17);scene.add(sun);
  function torii(x,z,width){
    for(const s of [-1,1]){
      solid(x+s*width*.4,z,.68,.68,5.45,vermilion);
      shape('cylinder','trim',x+s*width*.4,.42,z,.99,.84,.99,stoneGrey);
    }
    solid(x,z,width,.62,.36,vermilion,4.25);
    solid(x,z,width+1.4,.85,.45,vermilion,5.15);
    box('wall',x,5.72,z,width+2,.25,1.08,0x413a43);
  }
  torii(-24,58,9);torii(9,-17,8);torii(17,-58,11);
  for(const [x,z] of [[-27,46],[-17,36],[-9,45],[0,36],[13,35],[4,24],[14,12],[4,4],[-22,-32],[-19,-42]]){
    solid(x,z,.23,.23,3.6,cedar);box('trim',x,3.6,z,1.32,.13,.14,cedar);
    for(const side of [-1,1]){
      shape('cylinder','light',x+side*.52,3.12,z,.56,.73,.56,side<0?0xf09c65:0xffc68b);
      for(const h of [2.76,3.46])shape('cylinder','trim',x+side*.52,h,z,.48,.06,.48,0x593c3e);
    }
  }
  // 织坊以实木机架和挂布留出中间通道；另一侧药铺是成排矮柜和有盖连廊。
  for(const z of [19,27]){
    solid(-19,z,2.3,2.8,1.12,cedar);
    for(let i=0;i<4;i++)box('trim',-19.9+i*.55,1.17,z,.22,.14,2.7,0xb59d7a);
    box('trim',-20,2.5,z,.15,1.5,2.2,z===19?0x7373a9:0xaf6875);
  }
  for(const z of [6,14,21])solid(30,z,2.2,2.8,1.15,0x6f513a);
  sign('紬　织坊',-16,3.42,34,4.2,.90);sign('生药行',25,3.1,23,4.2,.80);
  for(const x of [4.5,13.5])for(let z=-17;z<=0;z+=3.5){
    solid(x,z,.42,.42,1.4,stoneGrey);
    solid(x,z,.26,3.6,.19,0x7e5951,.93);
  }
  for(let z=-46;z< -24;z+=1.25)box('trim',-22,.04,z,8.5,.075,.16,0xb5a690);
  for(const [x,z] of [[-32,-37],[-13,-39],[-29,-57],[-9,-63],[4,-62],[24,-65],[19,-45]]){
    shape('cylinder','wall',x,3.8,z,1,7.6,1,cedar);
    for(const [h,width] of [[5.8,4.8],[7.9,3.9],[9.5,2.6]])
      shape('stone','wall',x,h,z,width,3.1,width,0x354b49);
  }
  solid(17,-65,15,3.2,3.6,0x826256);
  box('wall',17,4.0,-65,17,.82,5.4,0x363a46);
  sign('避難所　神社',17,3.1,-63.3,6.1,1.0);
}
function createEncounter(){
  return {reset(){this.phase='calm';this.parading=false;this.status=null;this.beastSpeedScale=1;},
    update(g){const age=(g.time+5)%34;
      this.parading=age>=9 && age<22;this.beastSpeedScale=this.parading?1.18:1;
      this.phase=this.parading?'active':age>=6 && age<9?'warning':'calm';
      this.status=this.parading?{title:'百鬼过街',detail:'注意队尾与转角',remaining:22-age}:
        age>=6 && age<9?{title:'夜巡将至',detail:'灯巷传来木屐声',remaining:9-age}:null;
    }};
}
const plan={spots:{spawn:[-24,55],gate:exit,bossAnchor:[15,-53],bossSpawn:[19,-54]},ground,
  roughness:.85,metalness:.07,wallHeight:3.4,wallColor:cedar,floorTexture:stone,edge:courtyard,decorate};
export default {pageTitle:'灯巷神社撤离',weaponSkin:'lantern-shrine-escape',grid:floorPlan(areas,42,72),story,
  config:{map:{cell:2,navCell:1,fog:.009},player:{safeTime:1.4},beasts:{sight:19,memory:5}},
  buildBeastModel:yokaiModel,buildRageModel:h=>yokaiModel(3,h,true),createEncounter,buildMap:ctx=>buildFacility(ctx,plan),
  terrain:{ground},background:0x43405b,fog:0x685767,portal:{shield:false,visible:false},manualLoot:true,
  ammo:[[-19,53],[-13,40],[4,29],[-14,16],[25,7],[9,-20],[-22,-41],[14,-55]],
  loot:[[-27,51,'灯节木札',80],[-15,20,'织坊锦样',250],[27,15,'药行香囊',180],[7,7,'夜巡手绘图',110],
    [-22,-38,'石狐狸护符',135],[11,-52,'神社风铃',140],[-10,43,'木屐扣',85],[13,22,'纸行水印',90],
    [18,6,'河灯木模',105],[-12,-24,'桥头奉纳签',100]],
  area:(x,z)=>areas.find(({bounds:[a,b,c,d]})=>x>=a&&x<c&&z>=b&&z<d)?.name??'神社山道',
  text:{title:'灯巷神社撤离',tag:'百鬼灯巷 / 突围',enter:'进入低街',brief:rule,objective:rule,safe:'木户街角',
    bossName:'百鬼头领',winBrief:'你已安全抵达山腰神社。'}};
