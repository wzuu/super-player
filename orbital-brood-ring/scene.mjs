import { floorPlan, buildFacility } from '@level-kit/facility-map.mjs';
import { watchRooms } from '@level-kit/room-guards.mjs';
import { alienModel } from '@level-kit/alien-model.mjs';

const areas = [
  ['停靠舱','D',[6,56,26,76]], ['转运廊','T',[8,14,24,56]],
  ['指挥舱控制室','C',[-16,18,6,42]], ['控制室门廊','T',[4,28,10,36]],
  ['东货舱','F',[28,8,50,34]], ['货舱连接桥','T',[22,18,30,24]],
  ['压差门厅','T',[6,4,26,16]], ['升高转接桥','W',[-40,2,10,12]],
  ['外窗西环','W',[-46,-40,-34,12]], ['北环冷却廊','N',[-46,-48,28,-36]],
  ['维修舱','M',[-68,-32,-50,-6]], ['维修短廊','W',[-52,-20,-44,-14]],
  ['休眠舱','S',[-30,-30,-12,-4]], ['休眠舱南口','S',[-36,-12,-28,-6]],
  ['休眠舱北口','S',[-36,-28,-28,-22]], ['反应堆喉口','R',[12,-36,20,-30]],
  ['反应堆母体巢','R',[0,-32,32,-8]],
].map(([name,tile,bounds]) => ({name,tile,bounds}));

const clamp01 = value => Math.max(0,Math.min(1,value));
function ground(x,z) {
  if (x>=0 && z<=-8 && z>=-36) return -1.2*clamp01((z+36)/6);
  if (z>12) return 0;
  return 2.4*clamp01((4-x)/36)*clamp01((z+42)/14);
}
const walls = [
  ['dock',16,56,8,.55,5], ['west',4,7,.55,10,5], ['reactor',16,-34,8,.55,5],
];
const command = '指挥舱控制室', workshop = '维修舱';
const first = [
  {name:'转运巡逻',count:1,bounds:[10,29,22,34],anchor:[16,32],types:[0]},
  {name:'转运门卫',count:7,bounds:[9,8,23,22],anchor:[16,14]},
  {name:command,count:10,bounds:[-15,19,2,40],anchor:[-7,29],reward:{at:[-10,24],name:'值班交接记录',value:105}},
  {name:'东货舱',count:6,bounds:[30,10,48,32],anchor:[39,19]},
];
const second = [
  {name:'转接桥巡逻',count:1,bounds:[-25,4,-18,10],anchor:[-22,7],types:[0]},
  {name:'外环门卫',count:8,bounds:[-44,-32,-36,-1],anchor:[-39,-11]},
  {name:workshop,count:12,bounds:[-67,-30,-52,-8],anchor:[-58,-19],reward:{at:[-61,-24],name:'压差校验片',value:150}},
  {name:'休眠舱',count:8,bounds:[-29,-29,-13,-5],anchor:[-22,-18],reward:{at:[-17,-17],name:'休眠舱日志',value:385}},
];
function fight(name,parts,requiredRoom,at) {
  return {kind:'fight',name,parts,requiredRoom,at,label:'清除'+requiredRoom+'驻防',
    count:parts.reduce((sum,part)=>sum+part.count,0),entries:parts.map(part=>part.anchor),
    mix:[0,0,2,0,1,0,0]};
}
const route = [
  {kind:'use',door:'dock',at:[16,57.3],label:'开启停靠舱转运门'},
  fight('转运廊',first,command,[16,57]),
  {kind:'use',terminalKind:'card',at:[-11,25.5],label:'领取指挥舱身份凭证'},
  {kind:'use',door:'west',at:[5.3,7],label:'验证凭证，开启西环'},
  fight('外窗西环',second,workshop,[5.3,7]),
  {kind:'use',terminalKind:'breaker',at:[-62,-22],label:'恢复维修舱压差联锁'},
  {kind:'use',door:'reactor',at:[16,-35.4],label:'开启反应堆压力门'},
  {kind:'reach',at:[16,-28],range:3,label:'进入下层反应堆母体巢'},
  {kind:'boss',label:'歼灭环轨母体',victory:'母巢停止活动，环轨战利品已封存。'},
];
const rule='在指挥舱取得身份凭证，恢复维修舱压差联锁，进入反应堆歼灭母体。';
const story={type:'annihilation',classicAction:'歼灭',classicRule:rule,watchRooms,turnDirections:true,route,walls,
  terminals:route.filter(stage=>stage.kind==='use').map(({at,terminalKind:kind})=>({at,kind})),
  locks:walls.map(([id,x,z],i)=>({id,at:[x,z],why:['先开启转运门','需指挥舱身份凭证','需恢复维修舱压差联锁'][i]}))};

function floorTexture(g,w,h) {
  g.fillStyle='#81949a';g.fillRect(0,0,w,h);
  g.fillStyle='#44555c';g.fillRect(0,0,2,h);g.fillRect(0,0,w,2);
  for(let x=13;x<120;x+=9) {
    g.fillStyle='#62757b';g.fillRect(x,9,4,19);g.fillRect(x,99,4,19);
  }
  for(const x of [7,121]) for(const y of [7,121]){
    g.fillStyle='#bac9c8';g.fillRect(x,y,2,2);
  }
}
const steel=0x435968, brass=0xcf894c, jade=0x81ded3;
function hullWindow({x,z,w,d,dc},{solid,box,level,floor}) {
  if(dc!==-1 || x!==-46 || z>8 || z< -38) return false;
  solid(x,z,w,d,1,steel);
  solid(x,z,w,d,.7,steel,4.3);
  box('glass',x,2.65,z,w,3.3,d,0x98c9ee);
  level.box(x,z,w,d,floor(x,z)+1,floor(x,z)+4.3);
  box('trim',x+.1,2.65,z-d/2+.12,.35,3.3,.24,brass);
  return true;
}
function decorate({scene,THREE,shape,box,solid,sign,seededRandom}) {
  const rng=seededRandom(104);
  const ambient=new THREE.HemisphereLight(0xd8efff,0x647682,1.6);
  const sun=new THREE.DirectionalLight(0xffdbc3,2.15);sun.position.set(-29,40,21);
  scene.add(ambient,sun);
  for(const x of [10,22]) solid(x,56,4,.6,5,steel);
  for(const x of [11.65,20.35]) {
    solid(x,56.6,.65,1.4,5.2,0x8197a2);
    box('light',x,2.75,57.33,.14,2.5,.04,jade);
    for(let i=0;i<4;i++) box('trim',x,.26+i*.34,57.33,.53,.14,.06,brass);
  }
  box('trim',16,5.35,56.6,9.4,1.1,1.3,steel);
  sign('转 运 廊   /   T R A N S I T',16,5.36,57.27,6.2,.94);
  sign('指挥舱   ←',20.8,2.05,26.73,3.3,.65);
  sign('西环   ←',16,2.8,4.23,3.4,.68);
  sign('维修舱   ←',-38,1.13,-6.47,1.75,.37);
  // 货臂伸在头顶，门口下方留出连续的撤回通道。
  for(const z of [60,67,74]) {
    for(const x of [7,25]) {
      solid(x,z,1.1,1.3,5.5,brass);
      box('trim',x+(x===7?1:-1),4.8,z,2.8,.8,.9,steel);
    }
    box('trim',16,5.5,z,19,.45,1.1,steel);
    box('light',16,5.22,z,5,.09,.3,jade);
  }
  for(const x of [8.8,23.2]) {
    for(const z of [63.3,70.3]) {
      solid(x,z,1.1,2.8,1.25,0x708494);
      for(const dz of [-1,1]) box('trim',x,1.28,z+dz,1.15,.13,.18,brass);
    }
    for(const z of [58.5,65.5,72.5]) {
      box('wall',x,5.85,z,5.1,.45,6.65,0x566979);
      shape('cylinder','trim',x,4.43,z,.21,6.55,.21,0x6a808c,0,Math.PI/2);
    }
  }
  for(const x of [10.1,21.9]) {
    box('trim',x,.014,65,.15,.024,16,brass);
    for(let z=58;z<73;z+=1.65) box('trim',x+(x<16?-.3:.3),.023,z,.7,.024,.13,brass,-.65);
  }
  for(const [x,z,w,d,h] of [[11,45,5,1.5,2.4],[20.8,26,5.6,1.4,2.7],
    [1,30,1.6,6,2.5],[-10,35,5,2,1.35],[33,24,4,3,2.9],[42,16,6,4,2],
    [-8,4,4,2.3,1.3],[-38,-8,2,3,1.5],[-54,-22,2,5,2.5],
    [7,-18,3,3,1.5],[25,-23,3,2.4,1.7]]) solid(x,z,w,d,h,steel);
  for(const z of [38,26,15]) {
    box('trim',-14.9,1.45,z,1.3,2.5,3.4,steel);
    box('light',-14.2,1.85,z,.08,1.1,2.7,0x83acba);
  }
  for(const x of [-64,-58]) {
    shape('cylinder','wall',x,1.55,-10,2.2,3.1,2.2,steel);
    shape('cylinder','trim',x,2.7,-10,2.27,.3,2.27,brass);
  }
  for(const z of [-9,-15,-21,-27]) {
    solid(-14,z,2.5,2.5,.92,steel);box('glass',-14,1.28,z,2,.75,2.1,0x92d8b4);
  }
  for(let x=-42;x<28;x+=6) {
    box('trim',x,3.95,-46,3,.25,.45,brass);
    box('light',x,3.8,-46,2.4,.08,.32,jade);
  }
  for(let i=0;i<28;i++) {
    const angle=i*2.39996,r=4.2+rng()*2.1,x=16+r*Math.cos(angle),z=-17+r*Math.sin(angle);
    shape('stone','wall',x,.42,z,1.1+rng(),1+rng(),1.3,0x675268);
  }
  for(let i=0;i<140;i++) {
    const r=.06+rng()*.13;
    shape('stone','light',-53-rng()*35,4+rng()*33,-43+rng()*65,r,r,r,0xc8dbe9);
  }
}
const plan={spots:{spawn:[16,70],gate:[16,-10],bossAnchor:[16,-16],bossSpawn:[16,-13]},
  ground,floorTexture,edge:hullWindow,decorate,wallColor:0x475b69,wallHeight:5,roughness:.69,metalness:.28};

// 西环和维修舱交替泄压，内侧连接道及远端联锁台始终保留可走的落脚处。
const breaches=[
  {name:'外窗西环',x:-46,z:-2,contains:(x,z)=>x< -34 && x>=-46 && z>=-7 && z<=8},
  {name:'维修舱',x:-68,z:-12,contains:(x,z)=>x< -50 && x>=-68 && z>=-19 && z<=-6},
];
function createEncounter({level,sound}) {
  return {
    reset(){this.cycle=-1;this.phase='calm';this.status=null;},
    update(g,dt) {
      const elapsed=g.time-21;
      if(elapsed<0)return;
      const cycle=Math.floor(elapsed/49),age=elapsed-cycle*49;
      const breach=breaches[cycle%breaches.length];
      const phase=age<5?'warning':age<16?'open':'calm';
      if(phase!==this.phase || cycle!==this.cycle) {
        this.cycle=cycle;this.phase=phase;
        if(phase==='open') sound.hiss(1.2,2100,350,.27);
        if(phase!=='calm') g.ui.notify(breach.name+(phase==='open'?'正在泄压，沿内侧通行':'即将泄压'),2);
      }
      this.status=phase==='calm'?null:{title:breach.name+(phase==='open'?'失压':'泄压预警'),detail:'沿内侧通行',remaining:(phase==='open'?16:5)-age};
      if(phase!=='open') return;
      const pull=body=>{
        if(!breach.contains(body.x,body.z))return;
        const dx=breach.x-body.x,dz=breach.z-body.z,dist=Math.max(1,Math.hypot(dx,dz));
        const step=Math.min(dist,dt*1.6);
        level.move(body,dx/dist*step,dz/dist*step,.46);
      };
      pull(g.player);
      for(const beast of g.beasts.pool) if(beast.active)pull(beast);
    }
  };
}
export default {
  pageTitle:'环轨母巢',weaponSkin:'orbital-brood-ring',grid:floorPlan(areas,72,78),story,
  config:{map:{cell:2,navCell:1.1,fog:.01},beasts:{sight:21,memory:5.4},feedback:{chargeWindup:.82}},
  ammo:[[16,61],[11,39],[-9,28],[18,9],[-31,8],[-58,-22],[-38,-38],[16,-37],[5,-25],[26,-15]],
  loot:[[9,68,'停泊铭牌',80],[19,46,'转运封签',90],[-8,35,'航图底片',105],[42,27,'货运样本',120],
    [17,7,'中继芯片',90],[-23,6,'环桥测距尺',110],[-55,-27,'维修磁钥',130],
    [-18,-23,'冬眠计时器',155],[-25,-44,'星光记录片',120],[27,-12,'母巢结晶',170]],
  background:0x0d1729,fog:0x283849,terrain:{ground},
  buildMap:ctx=>buildFacility(ctx,plan),createEncounter,buildBeastModel:alienModel,
  buildRageModel:helpers=>alienModel(3,helpers,true),
  area(x,z){return areas.find(({bounds:[x0,z0,x1,z1]})=>x>=x0&&x<x1&&z>=z0&&z<z1)?.name??'环轨设施';},
  text:{title:'环轨母巢',tag:'环轨设施 / 歼灭',enter:'进入停靠舱',brief:rule,objective:rule,
    safe:'停靠舱',bossName:'环轨母体',winBrief:'环轨母体已被歼灭，已带回收集的战利品。'},
};
