import { floorPlan, buildFacility } from '@level-kit/facility-map.mjs';
import { watchRooms } from '@level-kit/room-guards.mjs';
import { createEncounter, beastSurface, undeadModel } from '@level-kit/castle-undead.mjs';

const areas = [
  ['吊桥','B',[-24,48,-16,74]], ['马厩背廊','H',[-28,6,-12,48]],
  ['南下墓道','K',[-52,24,-26,32]], ['墓穴管理室','C',[-66,2,-48,38]],
  ['北上墓道','K',[-52,6,-22,12]], ['封印门厅','H',[-26,0,-10,12]],
  ['鞍具间','S',[-8,20,12,42]], ['马厩侧门','H',[-14,28,-6,34]],
  ['教堂南廊','A',[-10,0,32,10]], ['东柱廊','A',[22,-40,32,8]],
  ['钟楼短桥','A',[30,-28,42,-20]], ['绞盘房','T',[40,-40,64,-12]],
  ['花园小门','G',[12,-22,24,-14]], ['月桂花园','G',[-10,-34,14,-10]],
  ['北回廊','A',[-2,-42,32,-36]], ['钟楼栅门','V',[-2,-50,6,-40]],
  ['彩窗大厅','V',[-22,-76,20,-48]],
].map(([name,tile,bounds])=>({name,tile,bounds}));
const saturate=t=>Math.max(0,Math.min(1,t));
function ground(x,z) {
  if(z>=0 && x< -26) return -3.6*saturate((-26-x)/22);
  if(z<0) return 2.8*saturate((-z-1)/34);
  return 0;
}
const gates=[
  ['bridge',-20,48,8,.55,5.7], ['chapel',-10,5,.5,10,5.7], ['choir',2,-46,8,.58,6.4],
];
const tomb='墓穴管理室', tower='绞盘房';
const stableGuards=[
  {name:'背廊游哨',count:1,anchor:[-21,22],bounds:[-26,18,-17,25],types:[0]},
  {name:'马厩门卫',count:5,anchor:[-19,11],bounds:[-26,6,-13,16]},
  {name:tomb,count:9,anchor:[-57,20],bounds:[-64,6,-50,34],reward:{at:[-58,15],name:'守墓人家谱',value:120}},
  {name:'鞍具间',count:5,anchor:[3,30],bounds:[-6,21,11,40]},
];
const chapelGuards=[
  {name:'南廊巡夜者',count:1,anchor:[15,5],bounds:[13,2,19,8],types:[0]},
  {name:'东廊卫队',count:9,anchor:[27,-14],bounds:[23,-36,31,-4]},
  {name:tower,count:11,anchor:[50,-26],bounds:[42,-38,62,-14],reward:{at:[55,-31],name:'铜钟铸印',value:165}},
  {name:'月桂花园',count:7,anchor:[4,-21],bounds:[-9,-32,12,-11],reward:{at:[-5,-25],name:'月桂银胸针',value:365}},
];
function defend(name,parts,requiredRoom,at) {
  return {kind:'fight',name,requiredRoom,at,parts,entries:parts.map(p=>p.anchor),
    count:parts.reduce((n,p)=>n+p.count,0),mix:[0,0,1,0,2,0],label:'清除'+requiredRoom+'守卫'};
}
const route=[
  {kind:'use',door:'bridge',at:[-20,49.4],label:'开启马厩桥门'},
  defend('马厩与墓穴',stableGuards,tomb,[-20,49.4]),
  {kind:'use',terminalKind:'card',at:[-61,14],label:'从管理室取走封印钥匙'},
  {kind:'use',door:'chapel',at:[-11.4,5],label:'用封印钥匙开启教堂侧门'},
  defend('教堂与钟楼',chapelGuards,tower,[-11.4,5]),
  {kind:'use',terminalKind:'breaker',door:'choir',at:[56,-30],label:'转动钟楼绞盘，升起栅门'},
  {kind:'reach',at:[2,-52],range:2.6,label:'穿过栅门，进入彩窗大厅'},
  {kind:'boss',label:'歼灭彩窗下的伯爵',victory:'伯爵倒下，古堡深处的钟声重新响起。'},
];
const rule='在墓穴管理室取钥匙，穿过教堂侧门到钟楼升起栅门，在彩窗下歼灭伯爵。';
function decorateDoor({THREE,id,mesh,width,depth,height}) {
  const vertical=width<depth;
  const span=vertical?depth:width;
  const trim=new THREE.MeshLambertMaterial({color:0x4e4b58});
  mesh.material.color.setHex(id==='choir'?0x594c56:0x76564b);
  mesh.material.emissive.setHex(0x170e0a);
  const face=vertical?width:depth;
  for(const side of [-1,1]) {
    for(let i=0;i<9;i++) {
      const bar=new THREE.Mesh(new THREE.BoxGeometry(vertical?.08:.14,height,vertical?.14:.08),trim);
      const u=span*(i-4)/9;
      bar.position.set(vertical?side*face/2:u,0,vertical?u:side*face/2);mesh.add(bar);
    }
    for(const y of [-height*.33,.1,height*.33]) {
      const strap=new THREE.Mesh(new THREE.BoxGeometry(vertical?.12:width,.18,vertical?depth:.12),trim);
      strap.position.set(vertical?side*face/2:0,y,vertical?0:side*face/2);mesh.add(strap);
    }
  }
  return {raised:id==='choir'};
}
const story={type:'annihilation',classicAction:'歼灭',classicRule:rule,watchRooms,turnDirections:true,
  route,walls:gates,decorateDoor,terminals:route.filter(s=>s.kind==='use').map(({at,terminalKind:kind})=>({at,kind})),
  locks:gates.map(([id,x,z],i)=>({id,at:[x,z],why:['从吊桥一侧开启','需在墓穴管理室领取封印钥匙','需在钟楼升起栅门'][i]}))};

const stone=0x716a73, ash=0xada299, timber=0x755149, iron=0x434654, candle=0xffc581;
function paving(g,w,h) {
  g.fillStyle='#4b4b52';g.fillRect(0,0,w,h);
  for(let r=0;r<4;r++) for(let c=-1;c<4;c++) {
    const light=111+((r*29+c*37+128)%27);
    g.fillStyle='rgb('+[light,light-3,light-2].join(',')+')';
    g.fillRect(c*48+(r%2)*24+1,r*32+1,46,30);
    g.fillStyle='#beb6ac';g.fillRect(c*48+(r%2)*24+2,r*32+2,43,1);
  }
}
function perimeter({x,z,w,d,dc,span},{box,solid}) {
  if(dc && z>48 && (x===-24 || x===-16)) {
    solid(x,z,w,d,1.15,stone);
    box('trim',x,1.22,z,w+.2,.16,d,ash);
    return true;
  }
  if(z>=48) return false;
  const h=z<=-48?10.2:5.7;
  solid(x,z,w,d,h+.25,stone,-.25);
  box('trim',x,.65,z,w+(dc?.15:0),.26,d+(dc?0:.15),ash);
  box('trim',x,h-.38,z,w+(dc?.25:0),.22,d+(dc?0:.25),ash);
  if(span>2 && dc && z < -48) box('trim',x,h/2,z,.83,h,.75,ash);
  return true;
}
function decorate({THREE,scene,shape,box,solid,floor,sign,canvasTexture,seededRandom}) {
  const ambient=new THREE.HemisphereLight(0xe5dafa,0xa08b80,1.4);
  const moonlight=new THREE.DirectionalLight(0xcbd2ff,1.8);
  moonlight.position.set(-25,38,-35);scene.add(ambient,moonlight);
  const moon=new THREE.Mesh(new THREE.SphereGeometry(4,24,16),new THREE.MeshBasicMaterial({color:0xe4deeb,fog:false}));
  moon.position.set(-26,24,-43);scene.add(moon);
  // 吊桥两座尖顶门塔提供从南到北的第一条视线，链条和横铺木板标出桥面边界。
  for(const x of [-25.6,-14.4]) {
    solid(x,48,3.1,4,7,stone);
    shape('stone','trim',x,8.2,48,3.4,4.5,3.4,0x605771);
    box('light',x,4.5,50.04,.6,1.25,.11,candle);
    for(let z=51;z<74;z+=1) {
      const t=(z-51)/23;
      box('trim',x+(x< -20?.97:-.97),1.3+3*(1-t)**2,z,.15,.17,1.08,iron);
    }
  }
  box('trim',-20,6.1,48,12.5,.9,2.2,ash);
  for(let x=-26;x<=-14;x+=1.5)box('wall',x,6.8,48,.75,.9,1.6,stone);
  sign('马 厩 桥 门',-20,6.08,49.13,3.65,.7,0,'#e7c795','#4d3c41');
  for(let z=48.9;z<74;z+=.85)box('trim',-20,.026,z,7.68,.05,.78,timber);
  for(const z of [41,35,29]) {
    solid(-26.5,z,2.1,1.9,1.65,timber);
    for(const x of [-27.3,-25.7])box('trim',x,1.85,z,.16,.7,2,iron);
  }
  for(const [x,z,w,d,h] of [[-16,36,4,2,2.1],[-22,16,3,1.7,1.6],
    [-61,28,5,2,1.55],[-53,10,2.5,3,1.4],[5,35,3,4,1.45],
    [13,2,3,1.4,1.55],[30,-13,2.3,3.4,1.9],[44,-29,2.5,4,1.8],
    [-11,-60,3,3,1.5],[13,-66,3,3,1.5]]) solid(x,z,w,d,h,stone);
  sign('西墓穴　←',-16,1.58,37.03,2.25,.55,0,'#ffe2ad','#453731');
  for(const z of [12,20,31]) {
    box('trim',-65.6,2.05,z,.7,2.8,3.5,iron);
    box('light',-65.22,2.17,z,.07,.30,1.15,candle);
  }
  for(const z of [-3,-12,-21,-30]) {
    for(const x of [22.8,31.2]) {
      solid(x,z,1.15,1.35,5.8,ash);
      shape('box','trim',x+(x<27?1.9:-1.9),6.36,z,4.8,.52,.8,ash,0,0,x<27?.43:-.43);
    }
  }
  // 绞盘卷筒、钢索和铜钟位于同一个房间。交互杆紧邻卷筒而放在可走地面上。
  shape('cylinder','wall',56,1.75,-33,2.2,4.4,2.2,timber,0,0,Math.PI/2);
  for(const x of [53.8,58.2]) solid(x,-33,1.1,2.7,2.55,iron);
  for(const x of [54.8,55.6,56.4,57.2]) box('trim',x,4.4,-33,.12,5.4,.12,iron);
  shape('cylinder','trim',56,6.5,-33,3.6,1.8,3.6,0x967342);
  shape('stone','trim',56,5.4,-33,.48,.85,.48,iron);
  const rng=seededRandom(107);
  for(const [x,z] of [[-6,-30],[8,-29],[2,-13]]) {
    solid(x,z,1.1,1.1,2.3,timber);
    for(let i=0;i<8;i++)shape('stone','wall',x+(rng()-.5)*3,2.1+rng()*1.3,z+(rng()-.5)*3,2.3,2.1,2.3,0x435e51);
  }
  for(const x of [-17,16])for(const z of [-54,-62,-70]){
    solid(x,z,1.35,1.45,8.6,ash);
    shape('box','trim',x+(x<0?2.8:-2.8),8.45,z,6.9,.65,1.1,ash,0,0,x<0?.42:-.42);
  }
  // 以铅条连成的玫瑰窗放在北端墙面。彩玻只在有色玻璃图形内自发光。
  const map=canvasTexture(512,512,(g,w,h)=>{
    g.clearRect(0,0,w,h);g.translate(w/2,h/2);g.lineWidth=6;g.strokeStyle='#3c3446';
    const colors=['#859fce','#b98192','#9bb4a1','#d4a475'];
    for(let ring=1;ring<=4;ring++) for(let i=0;i<12;i++){
      const a=i*Math.PI/6,b=a+Math.PI/6;
      g.beginPath();g.arc(0,0,ring*59,a,b);g.arc(0,0,(ring-1)*59,b,a,true);g.closePath();
      g.fillStyle=colors[(i+ring)%4];g.fill();g.stroke();
    }
    g.beginPath();g.arc(0,0,24,0,Math.PI*2);g.fillStyle='#e7cdaa';g.fill();g.stroke();
  });
  const rose=new THREE.Mesh(new THREE.PlaneGeometry(8.4,8.4),new THREE.MeshBasicMaterial({map,transparent:true}));
  rose.position.set(-1,5.55+floor(-1,-75),-75.78);scene.add(rose);
  return {moon,moonlight};
}
const plan={spots:{spawn:[-20,69],gate:[-2,-74],bossAnchor:[0,-65],bossSpawn:[-2,-70]},
  ground,floorTexture:paving,edge:perimeter,decorate,wallColor:stone,wallHeight:5.7,roughness:.92,metalness:.06};
export default {
  pageTitle:'月下彩窗堡',weaponSkin:'moonlit-stained-glass-keep',grid:floorPlan(areas,70,78),story,
  config:{map:{cell:2,navCell:1,fog:.011},beasts:{sight:22,memory:5.8,bossFight:{hpScale:7.2}},feedback:{chargeWindup:.83},
    bloodMoon:{period:70,warning:6,duration:14,speed:1.12,damage:1.16,health:9,veilDuration:1.4}},
  ammo:[[-20,55],[-24,33],[-53,29],[-21,9],[9,7],[26,-22],[54,-27],[3,-39],[-15,-56],[12,-69]],
  loot:[[-18,56,'桥头纹章',90],[-15,39,'马蹄铁徽记',80],[3,27,'铜饰马镫',130],
    [-58,32,'墓室拓片',115],[-31,9,'石匠印章',110],[8,4,'玻璃原片',105],
    [24,-32,'祈祷录',120],[47,-34,'铸钟小锤',135],[8,-24,'玫瑰书签',140],[-13,-70,'银灯座',160]],
  manualLoot:true,portal:{shield:false},background:0x29273c,fog:0x474251,terrain:{ground},
  buildMap:ctx=>buildFacility(ctx,plan),createEncounter,beastSurface,buildBeastModel:undeadModel,
  buildRageModel:helpers=>undeadModel(3,helpers,true),
  createEnvironment({mapData:{moon,moonlight}}){return {update(t,playing,g){
    const active=g.encounter?.phase==='active';
    moon.material.color.setHex(active?0xdd797a:0xe4deeb);
    moonlight.color.setHex(active?0xffb4a9:0xcbd2ff);
  }};},
  area(x,z){return areas.find(({bounds:[x0,z0,x1,z1]})=>x>=x0&&x<x1&&z>=z0&&z<z1)?.name??'古堡回廊';},
  text:{title:'月下彩窗堡',enter:'踏上吊桥',tag:'钟楼 / 歼灭',bossName:'彩窗伯爵',safe:'吊桥',
    brief:rule,objective:rule,winBrief:'伯爵已被歼灭，带回的古堡藏品已结算。'},
};
