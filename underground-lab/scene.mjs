import { Reflector } from 'three/addons/objects/Reflector.js';

const CONFIG = {
  map: { cell: 2, navCell: 1, fog: 0.014 },
  graphics: { maxPixelRatio: 1.25, bloomScale: 0.62, reflectionSize: 256, reflectionInterval: 0.085 },
  audio: { ambient: { frequency: 190, q: 0.64, activeGain: 0.20, pauseGain: 0.12 } },
  player: { safeTime: 13, hurtCooldown: 0.36 },
  weapon: { recoil: 0.011, maxSpread: 0.030, hearingRadius: 22 },
  feedback: { chargeWindup: 0.90 },
  beasts: {
    spawnDistance: 18, sight: 21, memory: 5.5,
    types: [
      { hp: 56, damage: 7, speed: 4.6 },
      { hp: 144, damage: 15, speed: 3.0, chargeSpeed: 9.6, chargeTime: 1.05 },
      { hp: 84, speed: 3.5, reach: 16.5, damage: 9, projectileGravity: 5.2, hazardLife: 4.4 },
      { hp: 690, height: 3.45, summonCount: 7 },
    ],
  },
  pickups: { ammoCache: 420 },
  alarm: {
    streakKills: 5, streakWindow: 8, sustainedFire: 4, shotGap: 0.36,
    duration: 32, cooldown: 10, extraPopulation: 18,
  },
};

const AIRLOCK={x:0,z:60,width:7,depth:.55,height:3.48};
const HATCH={x:23,z:-27,width:4.5,depth:.5,height:3.1};
const DARK=0x192b35,STEEL=0x586f81,JADE=0x65dec6,ICE=0x92e3ff,AMBER=0xf29a54;
const wallBoxes=[], locks=[], course=[], sections=[], ammo=[],health=[],loot=[],decor=[];
function horizontal(x0,x1,z,depth=.65){wallBoxes.push([(x0+x1)/2,z,x1-x0,depth,5.3]);}
function vertical(x,z0,z1,width=.65){wallBoxes.push([x,(z0+z1)/2,width,z1-z0,5.3]);}
function mainDoor(id,z,why){
  horizontal(-23,-3.4,z);horizontal(3.4,23,z);
  locks.push([id,0,z,6.8,.58,5.3]);
  return {kind:'use',door:id,at:[0,z+1.25],label:why};
}
function sideWall(x,z0,z1,doorZ){
  vertical(x,z0,doorZ-3);vertical(x,doorZ+3,z1);
}
vertical(-23,-84,67);vertical(23,-84,-29.25);vertical(23,-24.75,67);
vertical(51,-42,-12);horizontal(23,51,-42);horizontal(23,51,-12);horizontal(-23,23,67);horizontal(-23,23,-84);
horizontal(-23,-3.5,60);horizontal(3.5,23,60);
for(const [n,c,title,lname,rname,mix] of [
  [0,36,'安检走廊','器材库','防疫站',[0,0,0,2]],
  [1,4,'培养走廊','培养室','样本室',[0,2,0,1,0]],
  [2,-28,'服务器走廊','供电间','机柜室',[0,1,0,2,0,1,2]]]){
  const z0=c-16,z1=c+16;
  const door=mainDoor(['security','samples','power'][n],z1,'开启'+title+'隔离门');
  course.push(door);
  const firstSide=n===1 ? 1 : -1;
  const sideDoorZ=[];
  for(const sign of [-1,1]){
    const first=sign===firstSide;
    const doorZ=c+(first ? 1.5 : -8.5);
    sideDoorZ.push(doorZ);
    sideWall(sign*7.7,z0,z1,doorZ);
    for(const v of [z0+3,z1-3])horizontal(sign<0?-23:7.7,sign<0?-7.7:23,v);
    // 实体消杀隔板让侧房守卫绕过门廊再接敌。远门仅在靠入口的一端与内室相通。
    vertical(sign*13,first ? c-6 : z0+3,first ? c+2.5 : c+3);
    decor.push([sign*17.3,c+sign*2,2.5,3,1.4,n]);
  }
  for(const [x,dz] of [[firstSide*5.2,-8],[-firstSide*5.1,8]])decor.push([x,c+dz,1.8,3,1.1,n]);
  const parts=[
    {name:title,count:48,bounds:[-7.15,z0+.8,7.15,z1-.8],anchor:[0,c-4]},
    {name:lname,count:26,bounds:[-22.5,z0+3.7,-9.7,z1-3.7],anchor:[-19,c+(firstSide<0 ? 4 : -6)]},
    {name:rname,count:26,bounds:[9.7,z0+3.7,22.5,z1-3.7],anchor:[19,c+(firstSide>0 ? 4 : -6)]}
  ];
  for (const part of parts.slice(1)) {
    part.reward = {name: part.name + '查获记录', value: 120, at: [Math.sign(part.anchor[0])*15.35,z0+5.7]};
  }
  sections.push({title,parts,z0,z1,sideDoorZ});
  course.push({kind:'fight',name:title,parts,at:[0,z1+1],range:4,entries:parts.map(s=>s.anchor),mix,
    label:'清剿'+title+'，确认两侧房间',bounds:parts.map(s=>s.bounds)});
  course.push({kind:'use',at:[0,z0+2.4],label:['领取安保卡','读取封存记录','恢复反应堆供电'][n]});
  ammo.push([.5,z1+1.5],[1.1,c+3],[-.7,z0+2.4]);
  health.push([-.8,z1+2,45],[0,c,60]);
  loot.push([0,c-9,title+'记录',90+n*17]);
}
course.push(mainDoor('reactor',-44,'打开反应堆主隔离门'),{kind:'boss',label:'击败零号实验体'},
  mainDoor('service',-76,'以核心权限卡解除撤离门封锁'),{kind:'reach',at:[0,-81],label:'撤离',win:true});
const bossSupplies=[[.4,-42],[9.5,-58.5],[-10,-63]];
ammo.push([2.5,62],...bossSupplies);health.push([-9,-63,65],[8,-53,60]);
for(const [x,z] of [[-7,-54],[7,-68],[-12.5,-67],[13,-54]])decor.push([x,z,2.1,2.8,1.4,3]);
const roomBounds = sections.flatMap(section => section.parts);
// 守卫在自己的驻点巡视。枪声只给出开火位置，看到玩家或被击中才交给追击 AI。
const guardNeighbors = [];
function watchRooms(b, g, dt, canSee, config) {
  const post = b.guardPost, p = g.player;
  const sense = (g.beasts.frame + b.id) % 6 === 0;
  if (b.hp < b.maxHP || b.stun > 0 || (sense && Math.hypot(p.x-b.x,p.z-b.z) < config.beasts.sight && canSee(b,p))) return false;
  if (g.time - g.shotAt < .35 && b.heardAt !== g.shotAt &&
      Math.hypot(g.shotX-b.x,g.shotZ-b.z) < config.weapon.hearingRadius * g.shotHearingScale) {
    b.heardAt = g.shotAt; b.heardX = g.shotX; b.heardZ = g.shotZ;
  }
  const listening = g.time - b.heardAt < config.beasts.memory;
  const angle = post.yaw + .9 * Math.sin(g.time * .65 + b.id);
  const heading = listening ? Math.atan2(b.heardX-post.x,b.heardZ-post.z) : angle;
  const pace = listening ? 2.4 : (b.id % 3 === 0 ? 1.15 * Math.sin(g.time * .48 + b.id) : 0);
  const [left,back,right,front] = b.roomBounds;
  const x = Math.max(left,Math.min(right,post.x + Math.sin(heading)*pace));
  const z = Math.max(back,Math.min(front,post.z + Math.cos(heading)*pace));
  const dx = x-b.x, dz = z-b.z, gap = Math.hypot(dx,dz);
  const step = Math.min(gap,dt * (listening ? .95 : .55) * b.perkMoveScale);
  b.stride = 0;
  if (gap > .08 && step > 0) {
    const mx = dx/gap*step, mz = dz/gap*step, range = b.radius + 1.5;
    const near = g.beasts.hash.query(b.x-range,b.z-range,b.x+range,b.z+range,guardNeighbors);
    const blocked = near.some(other => other !== b && Math.abs(other.y-b.y)<1.3 &&
      Math.hypot(b.x+mx-other.x,b.z+mz-other.z) < b.radius+other.radius+.08 &&
      (other.x-b.x)*mx + (other.z-b.z)*mz > 0);
    if (!blocked) b.stride = g.level.move(b,mx,mz,.47)/dt;
  }
  const facing = listening ? Math.atan2(b.heardX-b.x,b.heardZ-b.z) : angle;
  b.fx = Math.sin(facing); b.fz = Math.cos(facing); b.yaw = facing;
  return true;
}
const labStory={type:'lab',watchRooms,turnDirections:true,pulseAt:[8,-59],bossSupplies,walls:locks,
  terminals:course.filter(t=>t.kind==='use').map(t=>t.at),locks:locks.map(([id,x,z])=>({id,at:[x,z],why:'需完成上一项任务'})),route:course};
const MAP_GRID=Array.from({length:88},(_,i)=>{
 const z=i*2-87;
 return Array.from({length:54},(_,j)=>{
   const x=j*2-53;
   if((Math.abs(x)>23||z<-84||z>67)&&!(x>23&&x<51&&z>-42&&z< -12))return '#';
   if (wallBoxes.some(([cx,cz,w,d])=>Math.abs(cx-x)<=w/2 && Math.abs(cz-z)<=d/2)) return '#';
   if (x > 23) return 'A';
   if (z < -44 && z > -76) return 'B';
   if (Math.abs(x) < 7.7) return 'H';
   return '.';
 }).join('');
});
const CERAMIC=0x8faabf,METAL=0x334757;
const REACTOR={x:0,z:-62.5};
const LANDMARKS={spawn:[0,0,63],boss:[3.5,0,-56.5],gate:[0,.16,-82.8]};
const CABINETS=[[-17.3,-30],[-20.2,-19.5],[17.3,-26],[20.2,-35.7],[38.5,-36.7]];
const TANKS=[[-17.3,2,false],[-20.4,10,true],[17.3,6,false],[20,-2,false],[38.5,-17,true]];
const CRATES=[[-17.3,34,3.4,2.2],[-20.3,41.5,2.8,1.9],[17.3,38,2.8,2.2],[19.8,29,3.1,1.8],[33.6,-36.5,2.7,2]];
const STEAM=[[-21.7,11.7],[20.6,-20.5],[40,-26],[-16,-56]];
function buildMap(ctx) {
  const { THREE, scene, level, StaticBatches, shapes, canvasTexture, brighter, seededRandom } = ctx;
  const rng = seededRandom(1507);
  const panelMap = canvasTexture(256, 256, (g, w, h) => {
    const fade = g.createLinearGradient(0, 0, 0, h);
    fade.addColorStop(0, '#b8c4ce'); fade.addColorStop(0.42, '#87949f'); fade.addColorStop(1, '#66747f');
    g.fillStyle = fade; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 340; i++) {
      g.fillStyle = i % 2 ? '#e8f2ff0b' : '#15232f16';
      g.fillRect(rng() * w, rng() * h, 8 + rng() * w * 0.45, 1);
    }
    g.strokeStyle = '#24303a'; g.lineWidth = 5; g.strokeRect(3, 3, w - 6, h - 6);
    g.strokeStyle = '#9bafbd'; g.lineWidth = 1; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#46515d'; g.fillRect(11, h - 54, w - 22, 2);
    for (const a of [14, w - 14]) for (const b of [14, h - 14]) {
      g.beginPath(); g.arc(a, b, 2.3, 0, Math.PI * 2); g.fill();
    }
  });
  const deckMap = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#60717d'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = i % 2 ? '#c5e2f312' : '#0c182524';
      g.fillRect(rng() * w, rng() * h, 3 + rng() * 11, 1);
    }
    g.strokeStyle = '#142432'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2);
    g.strokeStyle = '#8ba2af'; g.lineWidth = 1; g.strokeRect(5, 5, w - 10, h - 10);
  }, true);
  deckMap.repeat.set(20, 20);
  const materials = {
    panel: new THREE.MeshStandardMaterial({ map: panelMap, roughness: 0.65, metalness: 0.22 }),
    metal: new THREE.MeshStandardMaterial({ roughness: 0.48, metalness: 0.37 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x7accf4, transparent: true, opacity: 0.20, roughness: 0.26, depthWrite: false, side: THREE.FrontSide }),
    tank: new THREE.MeshBasicMaterial({ color: 0x64d2c9, transparent: true, opacity: 0.17, depthWrite: false, side: THREE.DoubleSide }),
    emit: new THREE.MeshBasicMaterial(),
    signal: new THREE.MeshBasicMaterial({ color: brighter(ICE, 2.0) }),
  };
  const geometry = { ...shapes, round: new THREE.CylinderGeometry(0.5, 0.5, 1, 48) };
  const kit = new StaticBatches(materials, geometry);
  const box = (material, x, y, z, w, h, d, tint, yaw = 0) => kit.add('box', material, x, y, z, w, h, d, tint, yaw);
  const drum = (material, x, y, z, w, h, tint, smooth = false) =>
    kit.add(smooth ? 'round' : 'cylinder', material, x, y, z, w, h, w, tint);
  const glow = (x, y, z, w, h, d, tint = ICE, power = 2.0, yaw = 0) =>
    box('emit', x, y, z, w, h, d, brighter(tint, power), yaw);

  const deck = new THREE.Mesh(new THREE.PlaneGeometry(90, 154), new THREE.MeshStandardMaterial({
    map:deckMap,color:0x8599ab,roughness:.45,metalness:.38
  }));
  deck.rotation.x=-Math.PI/2;
  deck.position.z=-8.5;
  scene.add(deck);

  // 玻璃与门框都在实体墙线上，房内的实验体可提前看见，弹道和行走仍须经过门洞。
  for(const [x,z,w,d,height] of wallBoxes) {
    const alongZ=d>w, span=Math.max(w,d), thick=Math.min(w,d);
    const glass=alongZ && Math.abs(Math.abs(x)-7.7)<.01;
    const slab=(material,y,a,size,h,depth,color)=>{
      if(alongZ)box(material,x,y,z+a,depth,h,size,color);
      else box(material,x+a,y,z,size,h,depth,color);
    };
    const wall=level.box(x,z,w,d,0,height);
    if(!glass)level.viewOccluders.push(wall);
    const count=Math.ceil(span/3.3),width=span/count;
    for(let n=0;n<count;n++){
      const along=(n+.5)*width-span/2;
      if(glass){
        slab('panel',.52,along,width,1.04,thick,STEEL);
        slab('glass',1.98,along,width,1.84,.1,ICE);
        slab('panel',(height+2.9)/2,along,width,height-2.9,thick,CERAMIC);
        for(const y of [1.06,2.91])slab('metal',y,along,width,.11,thick+.08,METAL);
      }else{
        slab('panel',1.6,along,width,3.2,thick,CERAMIC);
        slab('metal',(height+3.2)/2,along,width,height-3.2,thick,STEEL);
      }
      slab('metal',height/2,along-width/2+.05,.11,height,thick+.08,METAL);
      slab('metal',.13,along,width,.25,thick+.04,DARK);
    }
  }

  const roofs=[
    [0,59.5,46,15,4.6], ...sections.map(s=>[0,(s.z0+s.z1)/2,46,32,5.5]),
    [0,-60,46,32,8.2], [0,-80,46,8,4.6], [37,-27,28,30,5.5]
  ];
  for(const [x,z,w,d,h] of roofs){
    box('panel',x,h+.13,z,w,.26,d,0x40535f);
    level.box(x,z,w,d,h,h+.26);
    for(let dz=-d/2+4;dz<d/2;dz+=8){
      box('metal',x,h-.11,z+dz,w,.24,.22,STEEL);
      for(const dx of [-w*.29,0,w*.29]){
        box('metal',x+dx,h-.23,z+dz,2.5,.14,.48,DARK);
        glow(x+dx,h-.32,z+dz,2.15,.08,.3,ICE,1.8);
      }
    }
  }

  // 中轴青绿双线持续指向更深的隔离门。房间支线从敞开侧门接到领取台。
  for(const {z0,z1,parts,sideDoorZ} of sections){
    const center=(z0+z1)/2;
    for(const side of [-1,1]){
      glow(side*1.72,.016,center,.072,.026,29,JADE,.95);
      const doorZ=sideDoorZ[side<0 ? 0 : 1];
      glow(side*5,.018,doorZ,6,.03,.075,ICE,.92);
      const part=parts[side<0?1:2];
      const [lx,lz]=part.reward.at;
      // 领取点前方保留无碰撞的空地，台座贴在后方实体墙上。
      box('metal',lx,.53,lz-1.4,1.8,1.06,.56,STEEL);
      level.box(lx,lz-1.4,1.8,.56,0,1.06);
      glow(lx,1.12,lz-1.4,1.56,.1,.38,JADE,1.7);
    }
  }
  for(const [i,[x,z,w,d,h]] of decor.entries()){
    const room=sections.find(s=>z>s.z0&&z<s.z1);
    // 侧房主设备使用下方的培养舱、机柜和货箱，走廊掩体保持一米左右。
    if(room && Math.abs(x)>13)continue;
    box('panel',x,h/2,z,w,h,d,i%2?0x597183:0x735e52);
    box('metal',x,h+.04,z,w+.06,.09,d+.06,DARK);
    glow(x,h*.76,z+d/2+.02,w*.65,.048,.03,AMBER,1.5);
    level.box(x,z,w,d,0,h);
  }
  function header(x, z, yaw, w, height, tint) {
    box('metal', x, height + 0.20, z, w + 0.46, 0.39, 0.74, DARK, yaw);
    box('signal', x, height - 0.018, z, w, 0.065, 0.18, 0xffffff, yaw);
    for (const s of [-1, 1]) {
      const axialX = Math.cos(yaw), axialZ = -Math.sin(yaw);
      box('metal', x + axialX * s * (w / 2 + 0.07), height / 2, z + axialZ * s * (w / 2 + 0.07),
        0.18, height, 0.70, METAL, yaw);
      glow(x + axialX * s * (w / 2 - 0.15), 2.12, z + 0.24, 0.055, 0.80, 0.072, tint, 1.65, yaw);
    }
  }
  const sign = (x, y, z, yaw, code, badge, title, color) => {
    const map = canvasTexture(512, 144, (g, w, h) => {
      g.fillStyle = '#080f17'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#344957'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
      g.fillStyle = color; g.fillRect(17, 18, 5, 108);
      g.font = '600 44px monospace'; g.fillText(code, 40, 93);
      g.font = '600 37px -apple-system, sans-serif'; g.fillText(title, 145, 72);
      g.fillStyle = '#9caeba'; g.font = '20px monospace'; g.fillText(badge, 149, 110);
    });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3.84, 1.08), new THREE.MeshBasicMaterial({ map }));
    board.position.set(x, y, z); board.rotation.y = yaw; scene.add(board);
  };
  const stationColors=['#ffbb71','#87e8c7','#9cceff'];
  for(const [i,section] of sections.entries()){
    const {title,z0,z1,parts}=section,c=(z0+z1)/2;
    const code=['S01','B02','E03'][i],tint=stationColors[i];
    header(0,z1,0,6.8,4.1,JADE);
    sign(0,4.85,z1+.39,0,code,'ISOLATION ACCESS',title,tint);
    for(const signX of [-1,1]){
      const east=signX>0, doorZ=section.sideDoorZ[east ? 1 : 0];
      header(7.7*signX,doorZ,Math.PI/2,6,3.76,ICE);
      sign(signX*7.29,4.34,doorZ,-signX*Math.PI/2,code+(east?'E':'W'),
        east?'EAST WING':'WEST WING',parts[east?2:1].name,tint);
      const [x0,back,x1]=parts[east?2:1].bounds;
      sign((x0+x1)/2,2.45,back+1.02,0,'LOG','CLEARANCE RECORD','清场后领取记录','#acf2cc');
    }
    sign(-4.95,2.95,z0+.39,0,code,'CLEARANCE TERMINAL','取证与供电',tint);
  }
  for(const [z,id,name] of [[60,'A00','入口气闸'],[-44,'R04','反应堆大厅'],[-76,'X05','检修撤离口']]){
    header(0,z,0,z===60?7:6.8,4.1,JADE);
    sign(0,4.85,z+.4,0,id,'AUTHORIZED PERSONNEL',name,'#a6eddb');
  }
  header(23,-27,Math.PI/2,4.5,3.6,AMBER);
  sign(22.62,4.18,-27,-Math.PI/2,'C07','OPTIONAL ARCHIVE','可选 · 冷藏档案','#ffc07d');
  for(const [x,z] of bossSupplies) {
    glow(x-1.14,.035,z,.08,.05,1.6,AMBER,1.2);glow(x+1.14,.035,z,.08,.05,1.6,AMBER,1.2);
  }
  // 反应堆基座留出一整圈可跨上的检修平台，核心筒贴合实体掩体。
  const { x: rx, z: rz } = REACTOR;
  box('metal', rx, 0.1625, rz, 9.38, 0.325, 9.38, 0x3f5362);
  drum('emit', rx, 0.329, rz, 9.16, 0.012, brighter(0x4782a6, 1.45), true);
  drum('metal', rx, 0.338, rz, 8.98, 0.012, 0x324956, true);
  level.box(rx, rz, 9.38, 9.38, 0, 0.325, true);
  drum('metal', rx, 0.58, rz, 4.6, 0.52, METAL, true);
  drum('emit', rx, 3.35, rz, 2.45, 5.0, brighter(0x8deaff, 3.05), true);
  drum('glass', rx, 3.35, rz, 3.57, 5.10, ICE, true);
  for (const y of [0.88, 1.14, 5.60, 5.78, 6.13, 6.52]) {
    drum('metal', rx, y, rz, y > 6 ? 4.45 : 4.02, 0.13, STEEL, true);
    drum('emit', rx, y - 0.09, rz, y > 6 ? 4.18 : 3.78, 0.04, brighter(ICE, 2.5), true);
  }
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    const c = Math.cos(a), s = Math.sin(a);
    box('metal', c * 1.67, 3.44, rz + s * 1.67, 0.18, 4.35, 0.26, STEEL, -a);
    glow(c * 1.80, 3.44, rz + s * 1.80, 0.052, 3.93, 0.052, ICE, 2.4);
    box('metal', c * 3.52, 0.35, rz + s * 3.52, 0.83, 0.05, 0.21, STEEL, -a);
    glow(c * 4.31, 0.365, rz + s * 4.31, 0.19, 0.075, 0.085, AMBER, 1.6, -a);
  }
  // 中段金属笼杆保持中空，中央的亮柱能从每个角度读出来。
  level.box(rx, rz, 3.46, 3.46, 0, 6.51);

  const rings = [];
  for (const [r, y, arc, tint] of [[2.7, 4.45, Math.PI * 1.76, ICE], [3.13, 4.94, Math.PI * 1.54, 0x609fff], [3.49, 5.52, Math.PI * 1.33, 0xd1f6ff]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.026, 7, 64, arc),
      new THREE.MeshBasicMaterial({ color: brighter(tint, 2.3) }));
    ring.position.set(rx, y, rz); scene.add(ring); rings.push(ring);
  }

  // 门底座与两侧场发生器。共享裂隙负责力场、漩涡和胜利瞬间的冲击波。
  const [gx, , gz] = LANDMARKS.gate;
  drum('metal', gx, 0.073, gz, 6.1, 0.146, 0x466078, true);
  drum('emit', gx, 0.137, gz, 5.95, 0.029, brighter(ICE, 1.0), true);
  drum('metal', gx, 0.152, gz, 5.68, 0.022, DARK, true);
  level.box(gx, gz, 5.75, 5.75, 0, 0.165, true);
  for (const s of [-1, 1]) {
    const x = s * 2.79;
    box('panel', x, 2.03, gz, 0.58, 4.04, 0.85, CERAMIC);
    box('metal', x, 0.35, gz, 0.94, 0.70, 1.16, STEEL);
    glow(x, 2.2, gz + 0.45, 0.11, 2.84, 0.045, ICE, 2.8);
    level.box(x, gz, 0.92, 1.15, 0, 4.04);
  }

  for (const [x, z] of CABINETS) {
    box('metal', x, 1.63, z, 1.60, 3.26, 3.20, DARK);
    box('panel', x, 3.27, z, 1.68, 0.13, 3.23, STEEL);
    level.box(x, z, 1.60, 3.20, 0, 3.35);
    for (const s of [-1, 1]) {
      box('panel', x + s * 0.79, 1.48, z, 0.09, 2.73, 2.96, 0x526a80);
      for (const zOffset of [-1.0, 0, 1.0]) for (let h = 0; h < 6; h++) {
        box('metal', x + s * 0.86, 0.60 + h * 0.385, z + zOffset, 0.12, 0.23, 0.87, METAL);
        const add = (h + Math.round(zOffset) + Math.round(x)) % 7 === 0 ? 'signal' : 'emit';
        box(add, x + s * 0.934, 0.61 + h * 0.385, z + zOffset - 0.22, 0.025, 0.034, 0.18,
          add === 'signal' ? 0xffffff : brighter(h % 3 ? ICE : JADE, 1.6));
      }
    }
    glow(x, 2.95, z + 1.619, 0.67, 0.038, 0.025, ICE, 1.7);
  }

  const splitCylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1, true, 1.2, Math.PI * 1.25);
  geometry.shattered = splitCylinder;
  const specimens = [];
  for (const [i, [x, z, broken]] of TANKS.entries()) {
    drum('metal', x, 0.34, z, 3.02, 0.64, DARK, true);
    drum('emit', x, 0.65, z, 2.89, 0.09, brighter(JADE, 2.4), true);
    drum('metal', x, 3.81, z, 2.9, 0.22, STEEL, true);
    drum('emit', x, 3.66, z, 2.70, 0.052, brighter(ICE, 2.0), true);
    kit.add(broken ? 'shattered' : 'round', 'tank', x, broken ? 1.88 : 2.15, z,
      2.44, broken ? 2.28 : 3.0, 2.44, 0xffffff, broken ? i * 0.48 : 0);
    level.box(x, z, 2.55, 2.55, 0, broken ? 1.46 : 3.78);
    for (const s of [-1, 1]) {
      box('metal', x + s * 1.33, 2.2, z - 0.21, 0.17, 3.1, 0.21, STEEL);
      glow(x + s * 1.33, 2.21, z - 0.069, 0.057, 2.6, 0.04, JADE, 1.6);
    }
    if (broken) {
      for (let n = 0; n < 9; n++) {
        const a = rng() * Math.PI * 2, r = 1.3 + rng() * 0.74;
        kit.add('stone', 'metal', x + Math.cos(a) * r, 0.045, z + Math.sin(a) * r, 0.28, 0.094, 0.39, 0x68c7c4, a);
      }
      drum('metal', x, 0.04, z + 1.25, 3.4, 0.035, 0x1e6865, true);
    } else {
      const shape = new THREE.IcosahedronGeometry(1, 1);
      const geo = new THREE.Mesh(shape, new THREE.MeshStandardMaterial({
        color: 0x2b5148, emissive: 0x459579, emissiveIntensity: 0.52, roughness: 0.54,
      }));
      geo.position.set(x, 2.18, z); geo.scale.set(0.62, 1.03, 0.64); scene.add(geo); specimens.push(geo);
    }
  }

  for (const [i, [x, z, w, d]] of CRATES.entries()) {
    const tint = i % 2 ? 0x445b71 : 0x8b6650;
    box('panel', x, 1.09, z, w, 2.18, d, tint);
    level.box(x, z, w, d, 0, 2.18);
    for (let offset = -w / 2 + 0.24; offset < w / 2; offset += 0.49) {
      box('metal', x + offset, 1.08, z, 0.11, 1.96, d + 0.065, tint);
    }
    for (const y of [0.14, 2.05]) box('metal', x, y, z, w + 0.08, 0.17, d + 0.11, STEEL);
    glow(x, 1.82, z + d / 2 + 0.06, 0.74, 0.068, 0.045, AMBER, 1.7);
  }
  for (const [i, [x, z]] of STEAM.entries()) {
    const h = 2.5 + i % 2 * 0.4;
    drum('metal', x, h / 2, z, 0.60, h, STEEL);
    level.box(x, z, 0.59, 0.59, 0, h);
    drum('metal', x, 0.21, z, 0.91, 0.42, DARK);
    drum('emit', x, 1.45, z, 0.65, 0.075, brighter(AMBER, 1.75));
    kit.add('cylinder', 'metal', x + 0.42, 0.73, z, 0.23, 0.65, 0.23, METAL, 0, 0, Math.PI / 2);
  }
  const lights=[];
  const sky=new THREE.HemisphereLight(0xc4e8f4,0x64798a,1.58);
  scene.add(sky);
  for(const [x,y,z,tint,strength,range] of [
    [0,4,56,0xc9e5ff,60,25], [0,4.5,36,0xffce97,78,31],[-4,4.35,4,0x70ead2,74,32],
    [3,4.6,-28,0x8fbbff,86,32], [32,4,-27,0x86ebca,50,22],
    [0,6.4,-57,0x7dcfff,98,32],[0,5.9,-70,0x899dff,62,26]
  ]){
    const light=new THREE.PointLight(tint,strength,range,1.53);
    light.position.set(x,y,z);scene.add(light);
    lights.push({light,normal:light.color.clone(),strength});
  }
  kit.flush();
  level.spawn.set(...LANDMARKS.spawn);
  level.bossSpawn.set(...LANDMARKS.boss);
  level.bossAnchor.copy(level.bossSpawn);
  level.gate.set(...LANDMARKS.gate);
  const airlock = buildDoor(ctx, AIRLOCK, materials, false);
  level.entryDoor = airlock.collider;
  const hatch = buildDoor(ctx, HATCH, materials, true);
  // 静态导航保留闸口单元，开局即使闸门闭合也能在安全区外布置实验体。
  level.serviceHatch = hatch.collider;
  return { airlock, hatch, rings, specimens, lights, sky, signal: materials.signal };
}


function buildDoor({ THREE, scene, level, brighter }, spec, materials, hidden) {
  const { x, z, width, depth, height } = spec;
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  if (hidden) group.rotation.y = Math.PI / 2;
  scene.add(group);
  const pane = width / 2 - 0.021;
  const parts = [-1, 1].map(s => {
    const leaf = new THREE.Group();
    group.add(leaf);
    const detail = (w, h, d, x, y, z, mat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z); leaf.add(mesh);
    };
    const shell = materials.panel.clone();
    shell.color.set(hidden ? 0x637a8d : 0x718598);
    const shellTrim = materials.metal.clone();
    shellTrim.color.set(hidden ? DARK : STEEL);
    const lit = new THREE.MeshBasicMaterial({ color: brighter(hidden ? JADE : AMBER, 2.3) });
    detail(pane, height, depth, 0, height / 2, 0, shell);
    for (const face of [-1, 1]) {
      const surface = face * (depth / 2 + 0.025);
      if (hidden) {
        // 保留面板纹理，仅用一颗很小的检修指示灯提示可交互位置。
        detail(0.061, 0.064, 0.047, -s * 0.42, 1.33, surface, lit);
      } else {
        for (const y of [0.44, 0.71, height - 0.43]) detail(pane - 0.25, 0.085, 0.07, 0, y, surface, shellTrim);
        detail(0.22, 1.65, 0.092, -s * (pane / 2 - 0.20), 1.80, surface, shellTrim);
        detail(0.058, 0.84, 0.085, -s * (pane / 2 - 0.20), 1.80, surface * 1.14, lit);
      }
    }
    // 只有完全闭合的两片实心门叶可用于遮挡。动画期间保留门缝和两侧视线。
    const cx = hidden ? x : x + s * width / 4, cz = hidden ? z - s * width / 4 : z;
    const dx = (hidden ? depth : pane) / 2, dz = (hidden ? pane : depth) / 2;
    const occluder = {x0:cx-dx, x1:cx+dx, y0:0, y1:height, z0:cz-dz, z1:cz+dz};
    level.viewOccluders.push(occluder);
    return { leaf, sign: s, occluder };
  });
  const collider = level.box(x, z, hidden ? depth : width, hidden ? width : depth, 0, height);
  collider.active = false;
  const door = {
    collider, progress: 0,
    pose() {
      for (const { leaf, sign, occluder } of parts) {
        leaf.position.x = sign * (width / 4 + this.progress * (pane + 0.16));
        occluder.active = this.progress === 0;
      }
    },
    set(open, dt = Infinity) {
      this.progress = open ? Math.min(1, this.progress + dt * 1.85) : Math.max(0, this.progress - dt * 1.45);
      // 门叶从中间向两侧滑动。直到动画结束的安全开度才放开碰撞。
      const active = this.progress < 0.94;
      level.setBarrier(collider, null, active);
      this.pose();
    },
  };
  door.pose();
  return door;
}

function createEncounter({ CONFIG: setup, mapData, sound }) {
  const rules = setup.alarm;
  const { airlock, hatch } = mapData;
  const nearHatch = player => Math.abs(player.x - HATCH.x) < 1.85 && Math.abs(player.z - HATCH.z) < 1.37;
  const nearAirlock = body => Math.abs(body.x) < 4.65 && Math.abs(body.z - AIRLOCK.z) < 4.3;
  const crossingAirlock = body =>
    body.y < AIRLOCK.height && body.y + body.height > 0 &&
    Math.abs(body.x) < AIRLOCK.width / 2 + body.radius &&
    Math.abs(body.z - AIRLOCK.z) < AIRLOCK.depth / 2 + body.radius;
  const killTimes = [];

  const alarm = {
    status: null,
    reset() {
      this.alarmUntil = -Infinity;
      this.cooldownUntil = -Infinity;
      this.sirenAt = Infinity;
      this.lastShot = this.fireSince = -Infinity;
      this.countedKills = 0;
      this.alarmGroup = null;
      this.hatchOpen = false;this.archiveTag=null;this.archiveLoot=false;
      killTimes.length = 0;
      this.setAlarm(false);
      airlock.set(false);
      hatch.set(false);
    },
    setAlarm(active) {
      this.active = active;
      if (!active) this.status = null;
    },
    interactionHint(game) {
      return !this.hatchOpen && nearHatch(game.player) ? '按 F 开启冷藏档案室 · 可选战斗' : null;
    },
    interact(game) {
      if (!this.interactionHint(game)) return;
      hatch.set(true);
      const members=game.beasts.spawnGroup(Array.from({length:100},(_,i)=>({type:[0,0,2,0,1][i%5],
        anchor:{x:42,z:-27,y:0},angle:Math.PI/2})),{
        accept:site=>site.x>23.8 && site.x<50.2 && site.z> -41 && site.z< -13});
      if(members.length!==100){hatch.set(false);return false;}
      this.archiveTag={};
      for(const b of members)b.archiveTag=this.archiveTag;
      this.hatchOpen = true;
      sound.hiss(0.46, 950, 135, 0.15);
      game.ui.notify('冷藏档案室已开启 · 清除守卫后领取研究档案', 2.1);
    },
    update(game, dt) {
      const now = game.time;
      // 玩家感应才可开门；防夹只保护已进入开放门洞的实体。
      const open = nearAirlock(game.player) || (!airlock.collider.active &&
        game.beasts.pool.some(beast => beast.active && crossingAirlock(beast)));
      const wasOpen = airlock.progress > 0;
      airlock.set(open, dt);
      hatch.set(this.hatchOpen, dt);
      if (open !== wasOpen && (open || airlock.progress === 0)) sound.hiss(0.42, 740, 185, 0.12);

      if(this.archiveTag && !this.archiveLoot &&
        !game.beasts.pool.some(b=>b.active && b.archiveTag===this.archiveTag) &&
        !game.beasts.traits.splits.some(child=>child.archiveTag===this.archiveTag)){
        const treasure=game.pickups.add('rare',38,-27,0,'冷藏疫株研究档案',460,true);
        if(treasure){treasure.origin='vault';treasure.manual=true;this.archiveLoot=true;}
      }
      if (game.blast) return;
      if (this.active && now >= this.alarmUntil) {
        this.setAlarm(false);
        this.cooldownUntil = now + rules.cooldown;
        game.ui.notify('警报解除', 2.8);
      }
      if (this.active || now < this.cooldownUntil) {
        this.countedKills = game.kills;
        this.lastShot = game.shotAt;
      } else if (!game.story?.managed) {
        while (killTimes.length && now - killTimes[0] > rules.streakWindow) killTimes.shift();
        while (this.countedKills < game.kills) {
          killTimes.push(now);
          this.countedKills++;
        }
        if (game.shotAt > this.lastShot) {
          if (!Number.isFinite(this.fireSince) || game.shotAt - this.lastShot > rules.shotGap) this.fireSince = game.shotAt;
          this.lastShot = game.shotAt;
        }
        const loud = Number.isFinite(this.fireSince) && now - this.lastShot <= rules.shotGap &&
          this.lastShot - this.fireSince >= rules.sustainedFire;
        if (loud || killTimes.length >= rules.streakKills || this.alarmGroup) {
          this.alarmGroup ??= Array.from({length:rules.extraPopulation}, () => game.beasts.randomType());
          if (!game.beasts.spawnGroup(this.alarmGroup).length) return;
          this.alarmGroup = null;
          this.setAlarm(true);
          this.alarmUntil = now + rules.duration;
          this.sirenAt = now;
          this.fireSince = -Infinity;
          killTimes.length = 0;
          game.ui.notify(loud ? '持续枪声触发红色警报' : '连续击杀触发红色警报', 2.9);
        }
      }
      if (!this.active) return;
      if (now >= this.sirenAt) {
        sound.tone(415, 615, 0.69, 0.115, 'triangle');
        sound.tone(615, 355, 0.74, 0.097, 'triangle', 0.66);
        this.sirenAt = now + 4.2;
      }
      this.status = { title: '红色警报', detail: game.story?.managed ? '反应堆封锁中' : '警戒群已出动', remaining: this.alarmUntil - now };
    },
  };
  alarm.reset();
  return alarm;
}

function createEnvironment({ THREE, scene, mapData, CONFIG: setup, canvasTexture, seededRandom, brighter }) {
  const { rings, specimens, lights, sky, signal } = mapData;
  const red = new THREE.Color(0xff362a);
  const skyNormal = sky.color.clone(), groundNormal = sky.groundColor.clone();
  const skyRed = new THREE.Color(0xff8b70), groundRed = new THREE.Color(0x884458);
  const signalNormal = brighter(ICE, 1.9), signalRed = brighter(0xff493c, 2.45);
  let alarmMix = 0, lastTime = 0;

  // 反射只覆盖大厅中轴的抛光甲板，低分辨率并限制更新率，保留相邻的金属地砖。
  const base = Reflector.ReflectorShader;
  const shader = {
    uniforms: base.uniforms,
    vertexShader: base.vertexShader.replace('varying vec4 vUv;', 'varying vec4 vUv; varying vec2 deckUv;')
      .replace('vUv =', 'deckUv = uv; vUv ='),
    fragmentShader: `
      uniform sampler2D tDiffuse;
      varying vec4 vUv;
      varying vec2 deckUv;
      void main() {
        vec2 edge = min(deckUv, 1.0-deckUv);
        float fade = smoothstep(0.0, 0.12, min(edge.x, edge.y));
        vec3 mirror = texture2DProj(tDiffuse, vUv).rgb;
        gl_FragColor = vec4(mirror * vec3(0.48, 0.67, 0.84), fade * 0.48);
      }
    `,
  };
  const size = setup.graphics.reflectionSize;
  const reflection = new Reflector(new THREE.PlaneGeometry(21, 27.1), {
    shader, textureWidth: size, textureHeight: size, multisample: 0, clipBias: 0.003,
  });
  reflection.position.set(REACTOR.x, .008, REACTOR.z);
  reflection.rotation.x = -Math.PI / 2;
  reflection.material.transparent = true;
  reflection.material.depthWrite = false;
  const renderReflection = reflection.onBeforeRender;
  let reflectedAt = -Infinity;
  reflection.onBeforeRender = function (renderer, world, view) {
    if (lastTime - reflectedAt < setup.graphics.reflectionInterval) return;
    reflectedAt = lastTime;
    renderReflection.call(this, renderer, world, view);
  };
  scene.add(reflection);

  const rng = seededRandom(230071);
  const motes = Array.from({ length: 145 }, () => [rng() * 43 - 21.5, rng() * 3.4 + 0.35, rng() * 145 - 81, rng() * 6.28]);
  const steam = STEAM.flatMap(([x, z]) => Array.from({ length: 20 }, () => [x + 0.7, z, rng(), rng()]));
  const puff = canvasTexture(64, 64, (g, w, h) => {
    const gradient = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, '#effaffbb'); gradient.addColorStop(0.48, '#e7f5ff55'); gradient.addColorStop(1, '#e7f5ff00');
    g.fillStyle = gradient; g.fillRect(0, 0, w, h);
  });
  function points(count, material) {
    const geo = new THREE.BufferGeometry();
    const positions = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', positions);
    const batch = new THREE.Points(geo, new THREE.PointsMaterial({
      ...material, map: puff, depthWrite: false, transparent: true,
    }));
    batch.frustumCulled = false;
    scene.add(batch);
    return positions;
  }
  const dustPositions = points(motes.length, { color: 0xaddbff, size: 0.068, opacity: 0.58 });
  const steamPositions = points(steam.length, { color: 0xb6c8d9, size: 1.02, opacity: 0.24 });

  return {
    update(t, playing, game) {
      const dt = Math.min(0.05, t - lastTime);
      lastTime = t;
      const active = game.encounter?.active && !game.blast && (game.phase === 'play' || game.phase === 'pause');
      alarmMix = THREE.MathUtils.lerp(alarmMix, active ? 1 : 0, 1 - Math.exp(-6.5 * dt));
      const pulse = 0.86 + Math.sin(t * 3.1) * 0.14;
      sky.color.copy(skyNormal).lerp(skyRed, alarmMix * 0.87);
      sky.groundColor.copy(groundNormal).lerp(groundRed, alarmMix);
      signal.color.copy(signalNormal).lerp(signalRed, alarmMix).multiplyScalar(0.92 + 0.08 * Math.sin(t * 5.6) - alarmMix * (1 - pulse) * 0.47);
      for (const { light, normal, strength } of lights) {
        light.color.copy(normal).lerp(red, alarmMix);
        light.intensity = strength * (1 + alarmMix * (0.38 + pulse * 0.22));
      }
      for (const [i, ring] of rings.entries()) {
        ring.rotation.set(Math.PI / 2 + Math.sin(t * 0.85 + i) * 0.18, i * 0.23, t * (i % 2 ? -0.73 : 0.52) + i * 2.2);
      }
      for (const [i, sample] of specimens.entries()) {
        sample.rotation.y = t * (i ? -0.40 : 0.30);
        sample.position.y = 2.16 + Math.sin(t * 1.3 + i * 3) * 0.16;
      }
      for (const [i, [x, y, z, seed]] of motes.entries()) {
        dustPositions.setXYZ(i, x + Math.sin(t * 0.39 + seed) * 0.24, y + Math.sin(t * 0.50 + seed) * 0.29,
          z + Math.cos(t * 0.34 + seed) * 0.35);
      }
      dustPositions.needsUpdate = true;
      for (const [i, [x, z, phase, spread]] of steam.entries()) {
        const age = (phase + t * (0.25 + spread * 0.13)) % 1;
        steamPositions.setXYZ(i, x + age * 2.6, 0.73 + age * (1.35 + spread * 0.74),
          z + Math.sin(i * 2.4 + t * 0.92) * age * 0.7);
      }
      steamPositions.needsUpdate = true;
    },
  };
}

function buildBeastModel(type, { THREE, shapes, mergeGeometries }, rage = false) {
  const body = [], emit = [], transform = new THREE.Object3D();
  const flesh = new THREE.IcosahedronGeometry(1, 0);
  const claw = new THREE.ConeGeometry(0.5, 1, 4);
  const plate = 0x536e80, collar = 0x263b49, skin = 0x776c7b, bone = 0xb6afbe;
  function add(target, shape, color, x, y, z, w, h, d, pitch = 0, roll = 0) {
    const g = shape.index ? shape.toNonIndexed() : shape.clone();
    transform.position.set(x, y, z); transform.scale.set(w, h, d);
    transform.rotation.set(pitch, 0, roll); transform.updateMatrix();
    g.applyMatrix4(transform.matrix);
    const { r, g: green, b } = new THREE.Color(color);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = r; colors[i + 1] = green; colors[i + 2] = b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); target.push(g);
  }
  const hide = (t, ...v) => add(body, flesh, t, ...v);
  const panel = (t, ...v) => add(body, shapes.box, t, ...v);
  const tooth = (t, ...v) => add(body, claw, t, ...v);
  const light = (t, ...v) => add(emit, flesh, t, ...v);

  if (type === 0) {
    hide(skin, 0, 0.59, -0.15, 0.33, 0.26, 0.52);
    hide(bone, 0, 0.63, 0.43, 0.27, 0.22, 0.41);
    panel(collar, 0, 0.66, 0.16, 0.49, 0.33, 0.12, -0.25);
    tooth(skin, 0, 0.51, -0.67, 0.16, 0.41, 0.14, -1.24);
    for (const s of [-1, 1]) {
      for (const z of [-0.36, 0.29]) {
        panel(skin, s * 0.24, 0.25, z, 0.105, 0.46, 0.19, z > 0 ? -0.25 : 0.34, s * -0.32);
        tooth(bone, s * 0.33, 0.10, z + 0.15, 0.094, 0.17, 0.095, 1.5);
      }
      light(0xffad75, s * 0.125, 0.68, 0.68, 0.059, 0.041, 0.041);
    }
  } else if (type === 1) {
    hide(skin, 0, 1.11, -0.14, 0.54, 0.65, 0.52);
    panel(plate, 0, 1.49, 0.33, 0.92, 0.54, 0.48, 0.20);
    panel(collar, 0, 1.61, 0.57, 0.48, 0.22, 0.24);
    light(0xff9e68, 0, 1.62, 0.71, 0.19, 0.033, 0.045);
    for (const s of [-1, 1]) {
      panel(plate, s * 0.50, 1.42, 0.11, 0.35, 0.53, 0.63, 0.20, s * 0.21);
      panel(collar, s * 0.48, 0.66, 0.34, 0.26, 0.70, 0.32, -0.26);
      panel(plate, s * 0.51, 0.42, 0.51, 0.32, 0.26, 0.41);
      hide(skin, s * 0.32, 0.42, -0.37, 0.23, 0.46, 0.30);
      light(0xffad75, s * 0.46, 1.60, 0.443, 0.077, 0.030, 0.030);
    }
  } else if (type === 2) {
    hide(0x58766c, 0, 0.97, -0.15, 0.45, 0.57, 0.49);
    hide(0x8a9f88, 0, 1.36, 0.36, 0.33, 0.29, 0.39);
    panel(collar, 0, 1.19, 0.62, 0.43, 0.13, 0.21);
    light(0xb7ff68, 0, 1.21, 0.742, 0.11, 0.06, 0.047);
    for (const s of [-1, 1]) {
      hide(0x729c78, s * 0.39, 1.18, -0.36, 0.26, 0.41, 0.30);
      light(0x88e953, s * 0.56, 1.21, -0.26, 0.14, 0.28, 0.17);
      panel(skin, s * 0.30, 0.43, -0.21, 0.18, 0.62, 0.24, -0.29, -s * 0.27);
      panel(plate, s * 0.35, 0.50, 0.26, 0.16, 0.72, 0.19, 0.54, s * 0.20);
      light(0xbdff75, s * 0.15, 1.46, 0.625, 0.057, 0.043, 0.041);
    }
  } else {
    const tint = rage ? 0xff644c : 0x85d9ff;
    hide(rage ? 0x885060 : skin, 0, 2.00, -0.14, 0.74, 1.10, 0.64);
    hide(bone, 0, 2.76, 0.60, 0.44, 0.44, 0.43);
    panel(collar, 0, 2.74, 0.89, 0.71, 0.24, 0.31);
    panel(plate, 0, 2.07, 0.45, 0.90, 0.74, 0.21, -0.24);
    light(tint, 0, 2.12, 0.66, 0.29, 0.25, 0.107);
    for (const s of [-1, 1]) {
      hide(skin, s * 0.69, 2.29, 0.21, 0.41, 0.51, 0.51);
      panel(plate, s * 0.74, 2.55, 0.12, 0.46, 0.31, 0.64, s * 0.16, s * -0.32);
      panel(collar, s * 0.85, 1.47, 0.53, 0.42, 1.03, 0.55, -0.30, s * -0.13);
      hide(bone, s * 0.87, 0.92, 0.77, 0.31, 0.35, 0.37);
      panel(plate, s * 0.43, 0.65, -0.23, 0.44, 1.06, 0.49, -0.23);
      hide(skin, s * 0.44, 0.19, -0.049, 0.28, 0.22, 0.47);
      light(tint, s * 0.20, 2.85, 0.988, 0.098, 0.056, 0.042);
      light(tint, s * 0.83, 1.61, 0.83, 0.089, 0.28, 0.046);
      if (rage) {
        tooth(0xe8a2a4, s * 0.55, 3.07, 0.14, 0.29, 0.74, 0.31, -0.36, s * -0.56);
        light(0xff8d57, s * 0.46, 2.38, 0.505, 0.07, 0.32, 0.06);
      }
    }
  }
  const models = [mergeGeometries(body), mergeGeometries(emit)];
  [...body, ...emit, flesh, claw].forEach(geometry => geometry.dispose());
  return models;
}

export default {
  story:labStory, health,
  secretLockReason: game => game.encounter.archiveLoot ? null : '先清除档案区守卫，再打开证物柜', initialPopulationAnchor:[0,55], weaponSkin:'underground-lab',config:CONFIG,
  grid:MAP_GRID, loot,ammo,buildMap,createEncounter,createEnvironment,buildBeastModel,
  buildRageModel:helpers=>buildBeastModel(3,helpers,true),
  inSafeZone:(x,z,_spawn,margin)=>Math.abs(x)<6+margin && z>59.4-margin,
  navigationApproach(player,target,level){
    if(level.entryDoor.active&&(player.z>60)!==(target.z>60))
      return {x:0,y:0,z:60+(player.z>60?2:-2)};
    return target;
  },
  area(x, z) {
    if (x > 23 && z > -42 && z < -12) return '可选 · 冷藏档案室';
    const part = roomBounds.find(({bounds: [left, back, right, front]}) =>
      x >= left && x <= right && z >= back && z <= front);
    if (part) return part.name;
    if (z < -76) return '北侧检修气闸';
    return z < -44 ? '反应堆大厅' : z > 52 ? '入口气闸舱' : '隔离区门禁';
  },
  minimap: {tiles: {'#':'#263441', '.':'#506573', H:'#386270', B:'#496e6e', A:'#80684a'}},
  background:0x101e2c,fog:0x172a39,portal:{width:4.9,depth:.22,height:4.9},
  text: {
    tag: '第一关 / 地下研究设施',
    title: '地下实验室',
    enter: '进入气闸舱',
    enemy: '实验体',
    bossName: '零号实验体',
    keyItem: '核心权限卡',
    portal: '能量裂隙',
    loot: '研究物资',
    safe: '气闸安全缓冲区',
    rage: '零号实验体挣脱拘束，变异幼体正在聚集',
    brief: '沿青绿地线依次清剿安检、培养与服务器走廊，两侧房间保存各自的研究记录。恢复机房供电后进入反应堆，取得零号权限卡，从北端检修气闸撤离。',
  },
};
