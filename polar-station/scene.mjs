import { Reflector } from 'three/addons/objects/Reflector.js';

const CONFIG = {
  map: { cell: 4, fog: .022, navCell: 1.25 },
  player: { safeTime: 9 },
  graphics: { maxPixelRatio: 1.18, bloomScale: .68, snowCount: 3450, iceReflectionSize: 224, iceReflectionInterval: .09 },
  audio: { ambient: { filter: 'lowpass', frequency: 1060, activeGain: .18, pauseGain: .09, q: .73 } },
  beasts: {
    types: [
      { hp: 61, radius: .45, height: 1.06 },
      { hp: 176, radius: .67, height: 2.16, damage: 21 },
      { hp: 108, radius: .52, height: 1.83, slowScale: .72, slowDuration: 2.8 },
      { hp: 820, radius: 1.03, height: 3.90, summonCount: 7 },
    ],
  },
  cold: { outdoorLoss: 1.1, fissureLoss: 1.44, shelterGain: 6, fireGain: 10, fireRadius: 4.8, slowBelow: 68, minimumSpeed: .62 },
};

// 北在第一行。# 冰雪围界，L 冰湖，E 研究楼，W 钻探塔，N 冰洞，S 装甲车，A 客机，F 篝火，I 冰柱，R 冰石，B 路障。
const MAP_GRID = [
  '#########################',
  '#.......................#',
  '#.......................#',
  '#.........I...I.........#',
  '#.....I.....N.....I.....#',
  '#...I...............I.B.#',
  '#.B......I.....I........#',
  '#.....F.................#',
  '#....B...............B..#',
  '#..R....................#',
  '#.....................R.#',
  '#....W.............E....#',
  '#...........L...........#',
  '#.......................#',
  '#....B..................#',
  '#..R.............R...R..#',
  '#...................F...#',
  '#.....F.................#',
  '#....................R..#',
  '#...R...................#',
  '#.....R...........A...B.#',
  '#........R..............#',
  '#..R............R.....R.#',
  '#......R....S........R..#',
  '#########################',
];

function markers(symbol) {
  const c = CONFIG.map.cell, points = [];
  for (let row = 0; row < MAP_GRID.length; row++) for (let column = 0; column < MAP_GRID[row].length; column++) {
    if (MAP_GRID[row][column] !== symbol) continue;
    points.push([(column - (MAP_GRID[row].length - 1) / 2) * c, (row - (MAP_GRID.length - 1) / 2) * c]);
  }
  return points;
}

const [lake] = markers('L');
const [lab] = markers('E');
const [cave] = markers('N');
const LAB = { width:19.2, depth:23.2, roof:3.18 };
const CAVE = { x:cave[0], halfWidth:16.9, back:cave[1]-7.2, front:cave[1]+7.0, approach:cave[1]+13.9, rampX:12.2, rampWidth:3.7, depth:2.85 };
const campfires = markers('F');
const LANDMARKS = {
  loot: [
    [-3.1,35.8,'卫星电话',150], [21.4,25.0,'航机黑匣子',300],
    [-23.6,17.2,'燃料电池',185], [-30.9,-5.2,'钻探岩芯',250,'top'], [-22.2,-14.4,'地磁记录仪',170],
    [23.2,-10.7,'研究日志',210], [32.6,-10.0,'冷藏样本箱',380], [31.7,1.8,'校准探头',195],
    [11.7,-31.3,'远古沉积标本',320], [1.5,-35.2,'封存培养皿',285],
  ],
  ammo: [[2.4,39.4], [-11.4,23.2], [-24.0,17.8], [-33,2.8], [-20.1,-17.1],
    [28,-4], [34.2,12.8], [15.5,12.9], [-12.2,-26.4], [11.9,-33.4]],
};

function inCaveLane(x) {
  return Math.abs(Math.abs(x-CAVE.x)-CAVE.rampX) < CAVE.rampWidth / 2;
}
function groundHeight(x,z) {
  const c = CAVE;
  if (Math.abs(x-c.x) < c.halfWidth && z > c.back && z < c.front) return -c.depth;
  if (z >= c.front && z < c.approach && inCaveLane(x)) return -c.depth * (c.approach-z)/(c.approach-c.front);
  return 0;
}
function indoors(x,z,y) {
  const c = CAVE;
  return (Math.abs(x-lab[0]) < LAB.width/2 && Math.abs(z-lab[1]) < LAB.depth/2 && y < LAB.roof-.7) ||
    (y < -1.35 && z < c.front-.2 && z > c.back && Math.abs(x-c.x) < c.halfWidth);
}

function buildMap({ THREE, scene, GRID, level, StaticBatches, shapes, canvasTexture, seededRandom, brighter }) {
  const n = seededRandom(238129);
  const snow = canvasTexture(256,256,(ctx,w,h)=>{
    ctx.fillStyle='#d7e5ea';ctx.fillRect(0,0,w,h);
    for(let i=0;i<9600;i++){
      ctx.fillStyle=n()>.48?'#b7cddb4f':'#f3faff78';
      ctx.fillRect(n()*w,n()*h,.5+n()*2.5,.35+n()*1.25);
    }
    for(let i=0;i<32;i++){
      ctx.beginPath();
      const z=i*h/32;
      for(let x=0;x<=w;x+=5){
        const y=z + Math.sin(x*.032+i*.61)*3 + Math.sin(x*.074+i*.67)*1.2;
        if(x)ctx.lineTo(x,y);else ctx.moveTo(x,y);
      }
      ctx.strokeStyle=i%2?'#a4bac33e':'#ffffff64';ctx.lineWidth=.45+n()*.6;ctx.stroke();
    }
  },true);
  const panel = canvasTexture(128,128,(ctx,w,h)=>{
    ctx.fillStyle='#949eaa';ctx.fillRect(0,0,w,h);
    for(let x=0;x<w;x+=32){
      ctx.fillStyle='#495968';ctx.fillRect(x,0,1.5,h);
      ctx.fillStyle='#d8e2e7';ctx.fillRect(x+2,0,1,h);
    }
    for(let i=0;i<1900;i++){
      ctx.fillStyle=n()>.5?'#e7eff158':'#34425151';
      ctx.fillRect(n()*w,n()*h,.4+n()*2.4,.7+n()*1.6);
    }
    ctx.fillStyle='#3545537a';ctx.fillRect(0,h-8,w,2);
  });
  const material = {
    snow:new THREE.MeshLambertMaterial({map:snow,color:0xe0ecf3}),
    glacier:new THREE.MeshLambertMaterial({color:0xa8c7db}),
    ice:new THREE.MeshLambertMaterial({color:0x769eb8}),
    wall:new THREE.MeshLambertMaterial({map:panel,color:0xd5e2ed}),
    inside:new THREE.MeshLambertMaterial({map:panel,color:0xa5a8b1}),
    dark:new THREE.MeshLambertMaterial({color:0x52697b}),
    metal:new THREE.MeshLambertMaterial({color:0xb2bfcd}),
    asphalt:new THREE.MeshLambertMaterial({map:snow,color:0x70848e}),
    stripes:new THREE.MeshLambertMaterial({color:0xffffff}),
    light:new THREE.MeshBasicMaterial(),
  };
  const meshes = {
    ...shapes, spike:new THREE.ConeGeometry(.5,1,6), roofIce:new THREE.IcosahedronGeometry(.62,0),
    hemisphere:new THREE.SphereGeometry(.5,12,5,0,Math.PI*2,0,Math.PI/2),
    pipe:new THREE.CylinderGeometry(.5,.5,1,10),
  };
  const kit = new StaticBatches(material,meshes);
  const add = (...args)=>kit.add(...args);
  const box = (m,...args)=>kit.add('box',m,...args);
  const solid = (m,x,z,w,d,low,high,tint,climb=false)=>{
    box(m,x,(low+high)/2,z,w,high-low,d,tint);
    return level.box(x,z,w,d,low,high,climb);
  };
  const blue = brighter(0x75d2ff,2.25), scarlet = brighter(0xff4d50,3.0), amber = brighter(0xff974a,2.1);
  const emergency = [], fires = [];
  function pillar(x,z,height=3.7,y=0,tint=0xa6d3ec,s=1){
    add('roofIce','glacier',x,y+height*.33,z,s*2.2,height*1.05,s*1.95,tint,n()*Math.PI,(n()-.5)*.21,(n()-.5)*.28);
    add('spike','ice',x+.22,y+height*.64,z-.14,s*.84,height*.71,s*.94,0xb7dbea,0,0,.095);
    level.box(x,z,s*1.52,s*1.45,y,y+height*.72);
  }

  function sign(label,x,y,z,width,angle=0) {
    const texture = canvasTexture(256,64,(ctx,w,h)=>{
      ctx.fillStyle='#233747';ctx.fillRect(0,0,w,h);
      ctx.fillStyle='#df594b';ctx.fillRect(10,h-10,w-20,3);
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 31px PingFang SC, sans-serif';
      ctx.fillStyle='#e6f1f6';ctx.fillText(label,w/2,h/2-3,w-23);
    });
    const p=new THREE.Mesh(shapes.plane,new THREE.MeshBasicMaterial({map:texture,color:new THREE.Color(1.05,1.05,1.05)}));
    p.position.set(x,y,z);p.rotation.y=angle;p.scale.set(width,width/4,1);scene.add(p);
  }

  function research(x,z) {
    const hx=LAB.width/2, hz=LAB.depth/2, roof=LAB.roof, lo=0;
    // 墙段由开口列表生成，门洞宽度同时影响网格碰撞和实际渲染。
    function walls(fixed,a,b,openings,alongZ,inner=false){
      const thick=inner ? .24 : .37, height=inner ? 3.13 : roof;
      const components=[];
      let cursor=a;
      for(const [entry,exit] of openings){
        if(entry>cursor) components.push([cursor,entry]);
        cursor=exit;
      }
      if(cursor<b)components.push([cursor,b]);
      for(const [v0,v1] of components){
        const mid=(v0+v1)/2,len=v1-v0;
        const xx=alongZ?fixed:mid, zz=alongZ?mid:fixed;
        solid(inner?'inside':'wall',xx,zz,alongZ?thick:len,alongZ?len:thick,lo,height,inner?0xa5a4a9:0xd8e3ea);
      }
      for(const [entry,exit] of openings){
        const mid=(entry+exit)/2,len=exit-entry, xx=alongZ?fixed:mid, zz=alongZ?mid:fixed;
        solid('metal',xx,zz,alongZ?thick:len,alongZ?len:thick,2.34,height,0x9baeb9);
        box('light',xx,2.34,zz,alongZ?thick+.036:len-.18,.058,alongZ?len-.18:thick+.036,inner?scarlet:blue);
      }
    }
    for(const direction of [-1,1]){
      walls(z+direction*hz,x-hx,x+hx,[[x-1.62,x+1.62]],false);
      const sideDoor=direction<0?z-6.4:z+6.4;
      const openings=[[z-1.57,z+1.57],[sideDoor-1.07,sideDoor+1.07]].sort((a,b)=>a[0]-b[0]);
      walls(x+direction*hx,z-hz,z+hz,openings,true);
      walls(x+direction*2.15,z-hz,z+hz,[[z-7.8,z-5.05],[z-1.57,z+1.57],[z+5.05,z+7.8]],true,true);
      for(const offset of [-1.75,1.75]){
        const innerX=x+direction*(hx+2.15)/2;
        solid('inside',innerX,z+offset,hx-2.15,.25,0,3.13,0xafadb4);
      }
      const outer=x+direction*(hx+.065);
      for(const wz of [z-9.3,z-3.2,z+3.2,z+9.3]){
        box('dark',outer,1.73,wz,.13,1.21,1.82,0x4c6676);
        box('metal',outer+direction*.08,1.78,wz,.035,.83,1.49,0x7f9cad);
        box('light',outer+direction*.11,1.43,wz,.021,.048,1.29,scarlet);
      }
    }
    solid('dark',x,z,LAB.width+.64,LAB.depth+.72,roof,roof+.43,0x788b97);
    box('snow',x,roof+.485,z,LAB.width+.39,.15,LAB.depth+.52,0xf4f9ff);
    for(const side of [-1,1]){
      box('metal',x+side*5.1,roof+.60,z,3.5,.34,3.7,0x7a8e9b);
      box('snow',x+side*5.34,roof+.80,z,3.05,.08,3.39,0xe9f2f5);
      box('dark',x+side*5.1,roof+.92,z-.98,.56,.67,1.1,0x637b8a);
    }
    box('metal',x,.014,z,LAB.width-.31,.032,LAB.depth-.30,0x7e8e9b);
    for(const offset of [-5.8,0,5.8]) {
      box('light',x,3.12,z+offset,1.21,.057,.19,scarlet);
      const light=new THREE.PointLight(0xff4e4d,36,7.6,2);
      light.position.set(x,2.88,z+offset);scene.add(light);emergency.push(light);
    }
    for(const dx of [-6.4,6.4]) for(const dz of [-9.6,9.55]){
      solid('dark',x+dx,z+dz,2.25,.68,0,.88,0x637686);
      box('metal',x+dx,.94,z+dz,2.45,.12,.86,0x9cabb6);
      box('dark',x+dx-.42,1.18,z+dz,.56,.38,.11,0x536b7d);
      box('light',x+dx-.42,1.19,z+dz+.072,.42,.24,.025,blue);
    }
    sign('主研究楼',x,2.80,z+hz+.24,3.45);
    sign('应急通道',x-hx-.24,2.80,z-6.39,2.26,-Math.PI/2);
  }

  function drilling(x,z){
    const feet=[[-2.65,-2.5],[-2.65,2.5],[2.65,-2.5],[2.65,2.5]];
    solid('dark',x,z,6.6,6.2,0,.20,0x748996,true);
    for(const [dx,dz] of feet){
      solid('metal',x+dx,z+dz,.53,.51,.20,12.5,0x8798a5);
      box('snow',x+dx,.22,z+dz,1.05,.27,.96,0xe0eff6);
    }
    for(let j=0;j<4;j++){
      const y=1.7+j*3.16;
      for(const d of [-1,1]){
        box('dark',x,y,z+d*2.5,5.48,.24,.28,0xa1a9aa);
        box('metal',x,y,z+d*2.48,6.06,.15,.14,0x778d9b,0,0,j%2?-.48:.48);
        box('metal',x+d*2.65,y,z,.15,.17,5.78,0x738b9d,0,j%2?.07:-.07,j%2?.48:-.48);
      }
    }
    box('metal',x,12.48,z,6.0,.55,5.8,0x899ca8);
    box('snow',x,12.785,z,5.9,.15,5.75,0xeaf3fa);
    box('light',x,13.04,z+.71,.21,.36,.21,amber);
    add('pipe','metal',x,5.2,z,.88,10.8,.88,0x748fa0);
    level.box(x,z,.62,.62,.20,10.5);
    for(const [xx,zz,len] of [[x+5.1,z+3.9,8.4],[x-6.0,z-4.8,7.6]]){
      add('pipe','metal',xx,.75,zz,.79,len,.79,0x7c8fa0,0,0,Math.PI / 2);
      level.box(xx,zz,len,.80,0,1.12);
      for(const h of [-len*.37,len*.37]){
        add('pipe','dark',xx+h,.75,zz,.95,.15,.95,0x8398a8,0,0,Math.PI/2);
        box('metal',xx+h,.23,zz,.34,.46,1.19,0x8095a0);
      }
    }
    sign('钻探塔',x+1.68,2.42,z+2.63,2.82);
  }

  function aircraft(x,z) {
    add('pipe','metal',x,1.32,z,2.72,13.68,2.72,0xc2d1d7,0,Math.PI/2,Math.PI/2);
    add('spike','metal',x,1.34,z+7.34,2.67,2.2,2.67,0xcad9df,Math.PI/2);
    box('dark',x,2.26,z+5.14,1.64,.42,1.58,0x687f8a,0,.07);
    box('dark',x,1.05,z,2.74,.38,13.10,0x668292);
    level.box(x,z,2.79,13.78,0,2.62);
    for(const d of [-1,1]){
      const xx=x+d*4.18, zz=z-1.0+d*.36;
      box('metal',xx,1.12,zz,7.36,.22,1.45,0xb9ccd5,d*.31,0,d*.10);
      box('snow',xx,1.29,zz,6.68,.10,1.23,0xebf4f8,d*.31,0,d*.10);
      level.box(xx,zz,6.62,1.35,.54,1.50);
      add('pipe','dark',x+d*3.01,.79,z-.64,1.26,2.68,1.26,0x748d9d,Math.PI/2);
      level.box(x+d*3.01,z-.64,1.18,2.65,0,1.28);
      for(let j=0;j<7;j++)box('dark',x+d*1.28,1.82,z-3.63+j*1.03,.12,.24,.34,0x7f94a2);
    }
    box('metal',x,2.63,z-5.96,.31,2.67,2.01,0x839fae,-.51,0,-.12);
    box('light',x-.11,3.76,z-6.31,.16,.10,.17,scarlet);
  }

  function vehicle(x,z) {
    for(const d of [-1,1]){
      solid('dark',x+d*1.07,z,.83,5.17,0,.81,0x5f7281);
      for(let j=0;j<7;j++)add('pipe','metal',x+d*1.50,.42,z-1.91+j*.64,.59,.09,.58,0x8798a1,0,0,Math.PI/2);
    }
    solid('metal',x,z,2.68,4.53,.45,1.27,0x728c9e);
    box('snow',x,1.30,z+.20,2.55,.15,3.85,0xe6f5fc);
    box('dark',x,1.47,z-.79,1.96,.37,1.17,0x7a8d95,0,-.09);
    add('pipe','metal',x,1.76,z+.11,2.07,.56,2.11,0x8fa6af);
    level.box(x,z+.11,2.08,2.12,1.27,2.04);
    add('pipe','dark',x+.11,1.77,z-1.60,.26,2.33,.26,0x768d9f,Math.PI/2,0,.13);
    box('light',x+.64,1.21,z-2.31,.21,.10,.05,amber);
    level.spawn.set(x-.9,0,z-4.25);
  }

  function camp(x,z){
    add('cylinder','dark',x,.032,z,1.52,.065,1.49,0x627b8d);
    for(let i=0;i<7;i++){
      const a=i*2.3999;
      add('stone','ice',x+Math.cos(a)*.68,.13,z+Math.sin(a)*.66,.31,.24,.33,0x8fabbc,a);
    }
    for(const angle of [-.62,.58,1.63])box('dark',x,.12,z,.15,.13,1.14,0x756c61,angle,0,.13);
    const light=new THREE.PointLight(0xff9b5b,64,10.5,2);
    light.position.set(x,.76,z);scene.add(light);fires.push({x,z,light});
  }

  for(let r=0;r<GRID.rows;r++)for(let c=0;c<GRID.columns;c++){
    const x=GRID.x(c),z=GRID.z(r),mark=GRID.cells[r][c];
    if(mark==='#'){
      const h=2.8+n()*2.3;
      solid('ice',x,z,GRID.cell+.06,GRID.cell+.06,0,h,0x9ab7cd);
      add('roofIce','glacier',x+n()-.50,h-.13,z,GRID.cell*1.27,1.4+n()*2.6,3.4,0xd4e6ed,n()*3.6);
    }else if(mark==='R'){
      add('roofIce','glacier',x,.51,z,1.33+n()*.8,.59+n()*.9,1.42,0xc8dfe6,n()*3.7);
      level.box(x,z,1.28,1.18,0,.79);
    }else if(mark==='I')pillar(x,z,2.3+n()*2.7,0,0xbde0ee,.89+n()*.42);
    else if(mark==='B'){
      solid('dark',x,z,2.82,.64,0,.86,0x7e929b);
      for(let j=0;j<5;j++)box('stripes',x-1.03+j*.51,.58,z+.332,.23,.29,.024,0xcab981,0,0,.32);
    }else if(mark==='E')research(x,z);
    else if(mark==='W')drilling(x,z);
    else if(mark==='A')aircraft(x,z);
    else if(mark==='S')vehicle(x,z);
    else if(mark==='F')camp(x,z);
    else if(mark==='L'){
      level.gate.set(x,0,z);
      level.bossAnchor.set(x,0,z+6.0);
      level.bossSpawn.set(x+3.35,0,z+7.1);
      add('cylinder','ice',x,.023,z,4.82,.046,4.82,0xd6effc);
      for(let j=0;j<10;j++){
        const a=j*Math.PI*.2;
        box('light',x+Math.cos(a)*2.24,.053,z+Math.sin(a)*2.24,.19,.032,.083,blue, -a);
      }
    }
  }

  const c=CAVE;
  const chamberZ=(c.back+c.front)/2;
  solid('ice',c.x,chamberZ,c.halfWidth*2,c.front-c.back,-.47,0,0xa7ccd9,true);
  solid('glacier',c.x,c.back,c.halfWidth*2+.74,.41,-c.depth,.30,0xb8d9e8,true);
  for(const side of [-1,1]){
    solid('ice',c.x+side*c.halfWidth,chamberZ,.39,c.front-c.back+.28,-c.depth,.30,0xa7d2e5,true);
    const inside=c.rampX-c.rampWidth/2, outside=c.rampX+c.rampWidth/2;
    solid('glacier',c.x+side*(outside+c.halfWidth)/2,c.front,c.halfWidth-outside,.42,-c.depth,.36,0xc4e4f3);
    const xEntry=c.x+side*c.rampX;
    for(const edge of [-1,1]){
      const xx=xEntry+edge*c.rampWidth/2;
      for(let id=0;id<10;id++){
        const delta=(c.approach-c.front)/10,z=c.front+(id+.5)*delta;
        solid('ice',xx,z,.26,delta+.014,groundHeight(xx-edge*.06,z-delta/2),.25,0xc1d9eb);
      }
      add('roofIce','glacier',xx,.61,c.front+.23,1.08,1.38,1.36,0xc1e1ed,edge*.82);
    }
    solid('glacier',xEntry,c.front,c.rampWidth+.74,.63,-.45,.64,0xb9d8ed,true);
    box('light',xEntry,.28,c.front+.361,c.rampWidth-.33,.08,.044,blue);
    for(const x of [c.x+3.2*side,c.x+6.45*side,c.x+8.9*side]){
      pillar(x,c.back+2.9,2.35,-c.depth,0x9ec6df,.83);
      add('spike','glacier',x+.40,-1.02,c.front-1.76,.55,1.22,.47,0xa0c6de,0,0,Math.PI);
      box('light',x,-.49,c.front-2.14,.69,.027,.10,blue);
    }
    for(let j=0;j<4;j++){
      const x=c.x+side*(3.25+n()*.8), z=c.back+1.0+j*2.46;
      pillar(x,z,2.4+n()*2,0,0xd0e6f4,1.19);
    }
  }
  solid('ice',c.x,c.front,(c.rampX-c.rampWidth/2)*2,.55,-c.depth,.32,0xa8cadd);
  for(const [dx,z] of [[-5.8,c.front-3.45],[.0,c.front-1.82],[4.7,c.front-3.41]])pillar(c.x+dx,z,2.22,-c.depth,0x9fcbdc,.81);
  for(let i=0;i<38;i++){
    const x=c.x+(n()-.5)*29.3,z=c.back+.6+n()*(c.front-c.back-1.2);
    add('spike','ice',x,-.52-.30*n(),z,.22+n()*.42,.30+n()*.78,.24+n()*.29,0xa7d1e4,0,n()*5.9,Math.PI);
  }
  sign('冰洞入口',c.x-10.8,1.10,c.front+.38,2.85);

  // 把有坡度的冰洞出口刻入平面网格，回廊顶板与下方地面分别渲染。
  const xs=new Set([-GRID.halfX,GRID.halfX,c.x-c.halfWidth,c.x+c.halfWidth]);
  const zs=new Set([-GRID.halfZ,GRID.halfZ,c.back,c.front,c.approach]);
  for(let i=-48;i<=48;i+=4){xs.add(i);zs.add(i);}
  for(const side of [-1,1])for(const edge of [-1,1])xs.add(c.x+side*c.rampX+edge*c.rampWidth/2);
  const xx=[...xs].sort((a,b)=>a-b),zz=[...zs].sort((a,b)=>a-b);
  const coords=[[[],[]],[[],[]]];
  for(let j=0;j<zz.length-1;j++)for(let i=0;i<xx.length-1;i++){
    const l=xx[i],r=xx[i+1],a=zz[j],b=zz[j+1];
    const [p,u]=coords[Number(groundHeight((l+r)/2,(a+b)/2)<-.002)];
    for(const [x,z] of [[l,a],[l,b],[r,a],[r,a],[l,b],[r,b]]){
      p.push(x,groundHeight(x+(x===l ? .0001 : -.0001),z+(z===a ? .0001 : -.0001)),z);u.push(x/5.4,z/5.4);
    }
  }
  for(const [i,[p,u]] of coords.entries()){
    const mesh=new THREE.BufferGeometry();
    mesh.setAttribute('position',new THREE.Float32BufferAttribute(p,3));mesh.setAttribute('uv',new THREE.Float32BufferAttribute(u,2));mesh.computeVertexNormals();
    scene.add(new THREE.Mesh(mesh,i===0?material.snow:new THREE.MeshLambertMaterial({map:snow,color:0x52677e})));
  }

  box('asphalt',-.3,.027,34.2,17.5,.055,24.0,0x8fa5af);
  for(const side of [-1,1]){
    for(let z=24;z<45;z+=2.9){
      box('stripes',-.3+side*8.18,.063,z,.12,.02,1.42,0xc2d2da);
      box('light',-.3+side*8.9,.088,z,.19,.10,.17,blue);
    }
    for(let j=0;j<4;j++)box('stripes',-.3+side*(1.4+j*.66),.066,24.2,.34,.024,2.14,0xc1cfd5);
  }
  for(let z=27;z<45;z+=3.6)box('stripes',-.3,.064,z,.21,.022,2.02,0xb4c7d1);

  for(let i=0;i<65;i++){
    const a=i*Math.PI*2/65+n()*.10,r=51.2+n()*30.0;
    const x=Math.cos(a)*r,z=Math.sin(a)*r,h=5+n()*18.0;
    add('roofIce','glacier',x,h*.37-.71,z,6.5+n()*17.0,h,6+n()*12,0xc3deed,a,n()*.30,.09+n()*.33);
    if(i%3===0)add('hemisphere','snow',x+n()*2,-.48,z,6+n()*14,3+n()*6,5+n()*10,0xd0e7ef,a);
  }
  for(let id=0;id<230;id++){
    const x=n()*91-45.5,z=n()*91-45.5;
    if(groundHeight(x,z)<-.02 || indoors(x,z,0) || ((x-lake[0])/19)**2+((z-lake[1])/16)**2<.96)continue;
    if(Math.abs(x+.3)<8.65&&z>21.8)continue;
    if(level.blocked(x,z,0,.21,.38))continue;
    add('stone','glacier',x,.025,z,.18+n()*.63,.16+n()*.27,.17+n()*.67,0xd5e8f2,n()*6.3);
  }
  kit.flush();

  const ambience=new THREE.HemisphereLight(0xd6efff,0x9da6b4,1.43);
  const sun=new THREE.DirectionalLight(0xc8e6f9,1.35);
  sun.position.set(-44,28,-52);
  const gateLight=new THREE.PointLight(0x8bd8ff,47,18);
  gateLight.position.copy(level.gate).add(new THREE.Vector3(0,2.1,0));
  scene.add(ambience,sun,gateLight);
  return {fires,emergency,gateLight};
}

function createEncounter({ CONFIG: setup, THREE }) {
  const cold=setup.cold;
  const status={title:'体温',value:100,readout:'100%',detail:''};
  return {
    temperature:100, moveScale:1, shelter:false, warming:false, status,
    reset(){
      this.temperature=100; this.moveScale=1;this.shelter=false;this.warming=false;
      status.value=100;status.readout='100%';status.detail='室外暴风雪会消耗体温';
    },
    update(game,dt=0){
      const p=game.player;
      this.shelter=indoors(p.x,p.z,p.y);
      this.warming=Math.abs(p.y)<1.2&&campfires.some(([x,z])=>Math.hypot(p.x-x,p.z-z)<cold.fireRadius);
      const rate=this.warming?cold.fireGain:this.shelter?cold.shelterGain:
        -(p.z<CAVE.front&&Math.abs(p.x-CAVE.x)<CAVE.halfWidth?cold.fissureLoss:cold.outdoorLoss);
      this.temperature=THREE.MathUtils.clamp(this.temperature+dt*rate,0,100);
      this.moveScale=THREE.MathUtils.lerp(cold.minimumSpeed,1,Math.min(1,this.temperature/cold.slowBelow));
      const frost=game.time<p.slowUntil, loss=Math.round((1-this.moveScale)*100);
      status.value=this.temperature;
      status.readout=Math.ceil(this.temperature)+'%';
      const detail=this.warming?'篝火回温':this.shelter?'室内回温':loss>0?'低温移速降低 '+loss+'%':'室外暴风雪，前往研究楼或篝火回温';
      status.detail=frost?(loss>0?'冰弹减速中，低温效果叠加':'冰弹减速中'):detail;
    },
  };
}

function makeIceLake({ THREE, scene, CONFIG: setup, canvasTexture, seededRandom }) {
  const rng=seededRandom(61779);
  const frostMap=canvasTexture(512,512,(ctx,w,h)=>{
    for(let i=0;i<7100;i++){
      ctx.fillStyle=rng()>.53?'#daeffb2d':'#537d9d34';
      ctx.fillRect(rng()*w,rng()*h,.6+rng()*3,.6+rng()*2.2);
    }
    // 冰下的暗色脊骨与肋片在裂纹之间隐约可见。
    ctx.save();ctx.translate(w*.40,h*.58);ctx.rotate(-.52);
    ctx.fillStyle='#153c57a0';
    for(let j=0;j<8;j++){
      const bulge=Math.sin(j/8*Math.PI)*8;
      ctx.beginPath();ctx.ellipse(j*9,Math.sin(j*.55)*7,8,4+bulge*.55,.08,0,Math.PI*2);ctx.fill();
      if(j<2||j>6)continue;
      ctx.beginPath();
      ctx.moveTo(j*9,Math.sin(j*.55)*7);
      ctx.lineTo(j*9+12,18+bulge*2);
      ctx.lineTo(j*9-9,23+bulge*1.6);
      ctx.closePath();ctx.fill();
    }
    ctx.beginPath();ctx.moveTo(-15,-5);ctx.lineTo(6,-11);ctx.lineTo(7,5);ctx.lineTo(-11,10);ctx.closePath();ctx.fill();
    ctx.restore();
    for(let branch=0;branch<17;branch++){
      let angle=branch*2.399963+rng()*.32,x=w*.5+(rng()-.5)*88,y=h*.49+(rng()-.5)*95;
      ctx.beginPath();ctx.moveTo(x,y);
      const count=5+Math.floor(rng()*7);
      for(let i=0;i<count;i++){
        angle+=(rng()-.5)*.93;
        x+=Math.cos(angle)*(8+rng()*29);y+=Math.sin(angle)*(8+rng()*27);ctx.lineTo(x,y);
      }
      ctx.strokeStyle=branch%3?'#1b475caa':'#d7f7ffd6';ctx.lineWidth=.80+rng()*2.9;ctx.stroke();
    }
  });
  const base=Reflector.ReflectorShader;
  const shader={
    uniforms:{...base.uniforms,cracks:{value:frostMap},tick:{value:0}},
    vertexShader:base.vertexShader.replace('varying vec4 vUv;','varying vec4 vUv; varying vec2 lakeUV; varying float lakeDepth;')
      .replace('vUv =','lakeUV=uv; lakeDepth=-(modelViewMatrix*vec4(position,1.0)).z; vUv ='),
    fragmentShader:`
      uniform sampler2D tDiffuse,cracks;
      uniform float tick;
      varying vec4 vUv;
      varying vec2 lakeUV;
      varying float lakeDepth;
      void main(){
        vec2 p=lakeUV*2.0-1.0;
        float outline=length(p)+sin(p.x*11.0+p.y*4.0)*.035+sin(p.y*16.0-p.x*7.0)*.024;
        float mask=1.0-smoothstep(.81,1.0,outline);
        vec2 wobble=vec2(sin(p.x*90.0+p.y*59.0),cos(p.y*104.0+p.x*51.0))*.0009;
        vec3 reflection=texture2D(tDiffuse,vUv.xy/vUv.w+wobble).rgb;
        vec4 fracture=texture2D(cracks,lakeUV);
        float glaze=.75+.17*sin(p.x*37.0+p.y*21.0);
        vec3 tinted=mix(vec3(.21,.40,.54),reflection*vec3(.70,.86,.99),glaze*.73);
        tinted=mix(tinted,fracture.rgb,fracture.a*.80);
        tinted+=vec3(.065,.095,.105)*pow(max(0.0,sin(p.x*29.0-p.y*15.0+tick*.25)),16.0);
        float haze=1.0-exp(-pow(max(0.0,lakeDepth)*.017,2.0));
        tinted=mix(tinted,vec3(.66,.76,.86),haze*.56);
        gl_FragColor=vec4(tinted,mask*.91);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  };
  const size=setup.graphics.iceReflectionSize;
  const mesh=new Reflector(new THREE.PlaneGeometry(38,31),{shader,textureWidth:size,textureHeight:size,multisample:0,clipBias:.0025});
  mesh.position.set(lake[0],.017,lake[1]);mesh.rotation.x=-Math.PI/2;
  mesh.material.transparent=true;mesh.material.depthWrite=false;
  const capture=mesh.onBeforeRender;
  let last=-100;
  mesh.onBeforeRender=function(r,s,view){
    const t=mesh.material.uniforms.tick.value;
    if(t-last<setup.graphics.iceReflectionInterval||view.position.y<=.18)return;
    last=t;capture.call(this,r,s,view);
  };
  scene.add(mesh);
  return mesh.material.uniforms.tick;
}

function createEnvironment(context) {
  const {THREE,scene,camera,mapData,CONFIG:setup,seededRandom,dynamicMesh,setInstance,updateMesh,brighter}=context;
  const reflectionTime=makeIceLake(context);
  const rng=seededRandom(65942);
  const sky=new THREE.Mesh(new THREE.SphereGeometry(115,30,18),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,
    vertexShader:`
      varying vec3 direction;
      void main(){
        vec4 p=modelMatrix*vec4(position,1.0);
        direction=p.xyz-cameraPosition;
        gl_Position=projectionMatrix*viewMatrix*p;
      }
    `,
    fragmentShader:`
      varying vec3 direction;
      void main(){
        vec3 d=normalize(direction);
        float h=clamp(d.y,0.0,1.0);
        float streak=sin(d.x*13.0+sin(d.z*12.0+d.y*14.0)*1.5+d.y*20.0);
        float light=pow(max(0.0,dot(d,normalize(vec3(-.36,.28,-.81)))),8.0);
        vec3 cloud=mix(vec3(.65,.72,.80),vec3(.20,.30,.43),pow(h,.59));
        cloud+=vec3(.105,.125,.139)*light;
        cloud-=vec3(.07,.091,.108)*max(0.0,streak)*pow(1.0-h,2.0);
        gl_FragColor=vec4(cloud,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }));
  sky.renderOrder=-22;sky.frustumCulled=false;scene.add(sky);

  const points=new Float32Array(setup.graphics.snowCount*3);
  for(let i=0;i<points.length;i++)points[i]=rng();
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(points,3));
  const particles=new THREE.Points(geometry,new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,
    uniforms:{tick:{value:0},outside:{value:1}},
    vertexShader:`
      uniform float tick,outside;
      varying float opacity;
      void main(){
        vec3 seed=position,a=cameraPosition;
        float width=52.0, speed=9.0+seed.y*10.0, height=11.4;
        vec3 p;
        p.x=mod(seed.x*width+tick*speed-a.x,width)+a.x-width*.52;
        p.z=mod(seed.z*width+tick*(1.3+seed.x*3.0)-a.z,width)+a.z-width*.5;
        p.y=mod(seed.y*height-tick*(1.9+seed.x*2.0),height)+.02;
        vec4 v=viewMatrix*vec4(p,1.0);
        opacity=outside*smoothstep(.40,1.6,-v.z)*(1.0-smoothstep(17.0,28.0,-v.z))*(.34+seed.z*.45);
        gl_PointSize=clamp((4.2+seed.z*11.4)/max(1.35,-v.z),1.2,6.8);
        gl_Position=projectionMatrix*v;
      }
    `,
    fragmentShader:`
      varying float opacity;
      void main() {
        vec2 p=gl_PointCoord-.5;
        float dust=1.0-smoothstep(.17,.49,length(vec2(p.x*.92,p.y*1.80)));
        gl_FragColor=vec4(vec3(.90,.96,1.0),dust*opacity);
      }
    `,
  }));
  particles.frustumCulled=false;particles.layers.set(1);scene.add(particles);

  const streakSeeds=new Float32Array(560*6), ends=new Float32Array(560*2);
  for(let i=0;i<560;i++){
    for(let k=0;k<3;k++)streakSeeds[i*6+k]=streakSeeds[i*6+3+k]=rng();
    ends[i*2+1]=1;
  }
  const windGeometry=new THREE.BufferGeometry();
  windGeometry.setAttribute('position',new THREE.BufferAttribute(streakSeeds,3));
  windGeometry.setAttribute('endpoint',new THREE.BufferAttribute(ends,1));
  const wind=new THREE.LineSegments(windGeometry,new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,
    uniforms:{tick:{value:0},outside:{value:1}},
    vertexShader:`
      attribute float endpoint;
      uniform float tick,outside;
      varying float alpha;
      void main(){
        vec3 s=position,c=cameraPosition;
        float span=36.0;
        vec3 p=vec3(
          mod(s.x*span+tick*(15.0+s.y*11.0)-c.x,span)+c.x-span*.5,
          mod(s.y*7.2-tick*2.1,7.2)+.08,
          mod(s.z*span+tick*5.9-c.z,span)+c.z-span*.5
        );
        p += vec3(.17+s.x*.23,-.035,.105)*endpoint;
        vec4 v=viewMatrix*vec4(p,1.0);
        alpha=outside*smoothstep(.6,1.8,-v.z)*(1.0-smoothstep(12.0,19.0,-v.z))*mix(.11,.50,endpoint);
        gl_Position=projectionMatrix*v;
      }
    `,
    fragmentShader:'varying float alpha; void main(){gl_FragColor=vec4(vec3(.90,.96,1.0),alpha);}',
  }));
  wind.layers.set(1);wind.frustumCulled=false;scene.add(wind);

  const flame=dynamicMesh(new THREE.ConeGeometry(.26,.73,7),new THREE.MeshBasicMaterial({
    transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:.85,
  }),mapData.fires.length*3);
  const gold=brighter(0xff8b41,2.5),white=brighter(0xffe194,2.7);
  let outdoor=1, previous=0;
  return {
    update(t,active,game){
      const dt=Math.min(.045,t-previous);previous=t;
      const sheltered=indoors(game.player.x,game.player.z,game.player.y);
      outdoor=THREE.MathUtils.lerp(outdoor,sheltered?0:1,1-Math.exp(-dt*8.0));
      particles.material.uniforms.tick.value=t;
      particles.material.uniforms.outside.value=outdoor;
      wind.material.uniforms.tick.value=t;
      wind.material.uniforms.outside.value=outdoor;
      scene.fog.density=THREE.MathUtils.lerp(.011,setup.map.fog,outdoor);
      reflectionTime.value=t;
      for(const [i,light] of mapData.emergency.entries()){
        const p=Math.sin(t*5.4+i*2.41)*.23+Math.sin(t*16.1)*.07;
        light.intensity=36*(1+p);
      }
      let k=0;
      for(const [i,p] of mapData.fires.entries()){
        const f=Math.sin(t*12.8+i*2.6)*.25+Math.sin(t*18.1+1.7*i)*.12;
        p.light.intensity=64*(1+f);
        setInstance(flame,k++,p.x+.03,.52+f*.20,p.z,.99+f*.26,.89+f*.48,.87,gold,i+t*.4,.16,.20+f);
        setInstance(flame,k++,p.x+.12,.41+f*.13,p.z-.04,.66,.66,.69,gold,-.24+t*.23,-.39,-.20);
        setInstance(flame,k++,p.x-.015,.32+f*.11,p.z,.51,.57+f*.32,.53,white,t*.4,.15,.18+f);
      }
      updateMesh(flame,k);
      mapData.gateLight.intensity=47+Math.sin(t*3.04)*8+game.blast*(1-game.blast)*290;
    },
  };
}

function createPortal({THREE,scene,level,brighter,dynamicMesh,setInstance,updateMesh,seededRandom}) {
  const root=new THREE.Group();root.position.copy(level.gate);scene.add(root);
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.39,1.36,12.3,32,1,true),new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    uniforms:{tick:{value:0},ready:{value:0},blast:{value:0}},
    vertexShader:'varying vec2 st; void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`
      uniform float tick,ready,blast;
      varying vec2 st;
      void main(){
        float rays=pow(max(0.0,sin(st.x*122.0+sin(st.y*17.0-tick*2.0)*.81)),9.0);
        float glint=pow(max(0.0,sin(st.y*33.0-tick*(5.0+ready*2.0))),14.0)*.20;
        float falloff=(1.0-smoothstep(.1,1.0,st.y))*smoothstep(.0,.019,st.y);
        vec3 ice=mix(vec3(.21,.62,1.33),vec3(.66,1.12,1.65),ready);
        gl_FragColor=vec4(ice*(1.0+blast*3.1),(.24+rays*.62+glint)*falloff*(1.0-blast));
      }
    `,
  }));
  beam.position.y=6.15;root.add(beam);
  const glowMesh=new THREE.Mesh(new THREE.TorusGeometry(1.81,.047,7,55),new THREE.MeshBasicMaterial({
    color:brighter(0x8edbff,2.8),
  }));
  glowMesh.rotation.x=-Math.PI/2;glowMesh.position.y=.30;root.add(glowMesh);
  const ice=new THREE.Group();root.add(ice);
  const icy=new THREE.MeshLambertMaterial({color:0xa9dcf8,emissive:0x244354,emissiveIntensity:.68,flatShading:true});
  const spire=new THREE.ConeGeometry(.5,1,5);
  for(let i=0;i<13;i++){
    const a=i*2.39996,u=1.40+(i%3)*.31,h=1.1+(i%5)*.34;
    const shard=new THREE.Mesh(spire,icy);
    shard.position.set(Math.cos(a)*u,h*.45,Math.sin(a)*u);
    shard.scale.set(.55+(i%4)*.16,h,.55+(i%3)*.19);
    shard.rotation.set(Math.sin(a)*.32,a,Math.cos(a)*.28);
    ice.add(shard);
  }
  const shock=new THREE.Mesh(new THREE.TorusGeometry(1,.027,6,78),new THREE.MeshBasicMaterial({
    color:brighter(0x8bd6ff,3.2),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  }));
  shock.position.y=.13;shock.rotation.x=-Math.PI/2;root.add(shock);
  const rng=seededRandom(74091), fragments=[];
  for(let i=0;i<132;i++){
    const a=rng()*Math.PI*2;
    fragments.push({a,dist:3.6+rng()*19.6,rise:1.3+rng()*7.1,s:.08+rng()*.37,spin:rng()*12.3,tint:brighter(i%3?0xa7e4ff:0x58b9ff,1.08+rng()*1.8)});
  }
  const shaft=dynamicMesh(new THREE.OctahedronGeometry(1,0),new THREE.MeshBasicMaterial({transparent:true,depthWrite:false}),fragments.length);
  return {
    update(t,ready,blast){
      const u=beam.material.uniforms;
      u.tick.value=t;u.ready.value=ready?1:0;u.blast.value=blast;
      beam.rotation.y=t*.18;beam.visible=blast<.97;
      ice.visible=blast<.10;
      glowMesh.position.y=.29+Math.sin(t*1.64)*.09;glowMesh.rotation.z=t*.52;
      glowMesh.visible=blast<.69;
      shock.visible=blast>0&&blast<1;
      shock.scale.setScalar(1.1+blast*25);shock.material.opacity=.78*(1-blast);
      shaft.material.opacity=(1-blast)*.82;
      let j=0;
      if(blast>0&&blast<1)for(const p of fragments){
        const r=1.6+p.dist*blast, y=1.5+p.rise*4*blast*(1-blast)-blast*1.8;
        if(y<.10)continue;
        setInstance(shaft,j++,level.gate.x+Math.cos(p.a)*r,level.gate.y+y,level.gate.z+Math.sin(p.a)*r,
          p.s*.64,p.s*(2.2-blast),p.s*.66,p.tint,p.a+blast*p.spin,p.a*.15-blast*p.spin,.37+blast);
      }
      updateMesh(shaft,j);
    },
  };
}

function polarModel(type,{THREE,shapes,mergeGeometries},rage=false){
  const body=[],lit=[],tmp=new THREE.Object3D();
  const diamond=new THREE.IcosahedronGeometry(1,0);
  const tooth=new THREE.ConeGeometry(.5,1,5);
  const joint=new THREE.CylinderGeometry(.38,.50,1,6);
  function add(where,geom,tint,x,y,z,w,h,d,pitch=0,yaw=0,roll=0){
    const geometry=geom.index?geom.toNonIndexed():geom.clone();
    tmp.position.set(x,y,z);tmp.scale.set(w,h,d);tmp.rotation.set(pitch,yaw,roll,'YXZ');tmp.updateMatrix();
    geometry.applyMatrix4(tmp.matrix);
    const rgb=new THREE.Color(tint),colors=new Float32Array(geometry.attributes.position.count*3);
    for(let i=0;i<colors.length;i+=3){colors[i]=rgb.r;colors[i+1]=rgb.g;colors[i+2]=rgb.b;}
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));where.push(geometry);
  }
  const facet=(...x)=>add(body,diamond,...x);
  const pole=(...x)=>add(body,joint,...x);
  const spike=(...x)=>add(body,tooth,...x);
  const plate=(...x)=>add(body,shapes.box,...x);
  const emit=(...x)=>add(lit,diamond,...x);
  const hide=0x4c6278,blue=0x7395ad,ice=0xb6dce9,dark=0x354954;
  if(type===0){
    facet(hide,0,.51,-.17,.33,.23,.57);
    facet(blue,0,.63,.27,.32,.25,.26);
    facet(dark,0,.54,.51,.19,.13,.28);
    spike(blue,0,.53,-.70,.15,.39,.15,-1.05);
    for(const d of [-1,1]){
      pole(blue,d*.20,.24,.28,.133,.43,.15,-.20,0,d*-.12);
      pole(hide,d*.19,.25,-.40,.13,.43,.16,-.38,0,d*-.17);
      spike(ice,d*.14,.79,.34,.095,.25,.096,-.17,0,d*-.26);
      emit(0xc3f8ff,d*.12,.669,.50,.044,.033,.041);
    }
  }else if(type===1){
    facet(hide,0,.86,-.10,.62,.57,.60);
    facet(blue,0,1.08,.30,.60,.55,.52);
    facet(dark,0,.92,.72,.36,.35,.32);
    facet(ice,0,.84,.88,.32,.19,.27);
    for(const d of [-1,1]){
      facet(ice,d*.44,1.27,.24,.31,.44,.44,.15,0,d*.08);
      facet(blue,d*.45,.59,.29,.31,.43,.32,-.22,0,d*.12);
      plate(dark,d*.40,.29,.43,.34,.22,.44,-.17);
      pole(hide,d*.30,.34,-.43,.28,.61,.31,-.16,0,d*-.17);
      facet(blue,d*.27,1.17,.56,.15,.17,.18);
      emit(0x97e9ff,d*.20,1.028,.944,.066,.053,.038);
      spike(ice,d*.44,1.64,.07,.31,.59,.29,-.28,0,d*-.23);
    }
  }else if(type===2){
    facet(hide,0,.67,-.19,.41,.47,.48);
    facet(blue,0,1.16,.07,.34,.44,.33,.29);
    facet(dark,0,1.35,.44,.33,.25,.31,.18);
    facet(ice,0,1.20,.62,.29,.17,.25);
    for(const d of [-1,1]){
      pole(blue,d*.36,.34,.01,.21,.64,.23,.33,0,d*-.31);
      spike(ice,d*.32,1.28,-.30,.23,.72,.30,-.51,0,d*-.48);
      facet(0x78b9d7,d*.26,1.05,-.26,.26,.31,.31);
      emit(0x94eaff,d*.16,1.405,.675,.075,.055,.039);
    }
    emit(0x62cfff,0,1.207,.83,.067,.035,.06);
  }else{
    facet(0x263949,0,1.85,-.12,.85,1.13,.67);
    facet(rage?0x526883:blue,0,2.52,.10,.88,.73,.78);
    facet(dark,0,2.80,.68,.58,.54,.53);
    facet(0x8daab9,0,2.69,.97,.47,.27,.46);
    facet(hide,0,1.41,-.45,.65,.46,.46);
    for(const d of [-1,1]){
      pole(hide,d*.49,.51,-.30,.37,.96,.41,-.24,0,d*.11);
      plate(dark,d*.49,.18,-.02,.48,.26,.53,0,d*.18);
      facet(blue,d*.84,2.37,.18,.43,.59,.51);
      facet(hide,d*.98,1.48,.42,.30,.66,.41,.31,0,d*.11);
      plate(blue,d*1.01,.98,.62,.44,.42,.44,-.19);
      if(!rage){
        facet(ice,d*.78,2.79,.18,.60,.60,.53,.12,0,d*.21);
        spike(0xc3e3f5,d*.56,3.38,.02,.52,.91,.47,-.28,0,d*-.38);
        plate(0x94bcca,d*.45,2.38,.66,.29,.63,.30,.11,0,d*.26);
        facet(ice,d*.96,1.58,.49,.42,.52,.37);
      }else{
        spike(blue,d*.60,2.93,-.08,.27,.51,.29,-.46,0,d*-.27);
        emit(0x57cfff,d*.38,2.36,.64,.13,.30,.079,.15,0,d*.28);
      }
      emit(rage?0x95f9ff:0x8dc6f6,d*.246,2.942,1.03,.092,.061,.056);
    }
    emit(rage?0x59d9ff:0x728fa9,0,1.94,.61,.23,.38,.15);
  }
  const meshes=[mergeGeometries(body),mergeGeometries(lit)];
  for(const geo of [...body,...lit,diamond,tooth,joint])geo.dispose();
  return meshes;
}

export default {
  weaponSkin: 'polar-station',
  pageTitle:'极夜冰站 | 第五关',
  config:CONFIG,
  grid:MAP_GRID,
  loot:LANDMARKS.loot,
  ammo:LANDMARKS.ammo,
  background:0xa5b9cc,
  fog:0xa4b7c6,
  palette:{projectile:0x76d6ff,ichor:0x537c9d,spark:0xd3eaff,core:0x93ddff,rare:0xb8eaff,ammo:0x70cffa,blast:0x8abcf4},
  portal:{width:1.72,depth:1.18,useRadius:4.5},
  buildMap,
  createEnvironment,
  createEncounter,
  createPortal,
  buildBeastModel:polarModel,
  buildRageModel(helpers){return polarModel(3,helpers,true);},
  onBossRage(beast,game,{THREE,brighter}){
    const center=new THREE.Vector3(beast.x,beast.y+2.65,beast.z);
    game.effects.spray(center,brighter(0xbde8ff,1.85),75,10.8,.101,'spark');
    game.sound.hiss(.49,2900,440,.29);
  },
  terrain:{ground:groundHeight},
  area(x,z,level,y){
    if(y<-.6)return '北侧冰洞';
    if(Math.abs(x-lab[0])<LAB.width/2&&Math.abs(z-lab[1])<LAB.depth/2)return '主研究楼';
    if(z>32&&Math.abs(x-level.spawn.x)<7&&z>36)return '南侧装甲车残骸';
    if(z>20)return '机场跑道';
    if(z<-19)return '冰川裂缝';
    if(x<-17)return '西侧钻探塔';
    if(x>17)return '研究楼外围';
    return '开裂冰湖';
  },
  minimap:{
    tiles:{'#':'#819ead',I:'#b8c9d5',R:'#627c8d',F:'#e6a66a',B:'#657582'},
    beforeTiles({ctx,px,pz,size}){
      ctx.fillStyle='#233949';ctx.fillRect(0,0,size,size);
      ctx.fillStyle='#365d79';
      ctx.beginPath();ctx.ellipse(px(lake[0]),pz(lake[1]),size*.181,size*.147,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#597785';
      ctx.fillRect(px(lab[0]-LAB.width/2),pz(lab[1]-LAB.depth/2),LAB.width/100*size,LAB.depth/100*size);
      ctx.fillStyle='#52606e';ctx.fillRect(px(-9.05),pz(22.2),17.5/100*size,24/100*size);
      ctx.fillStyle='#1f2e40';ctx.fillRect(px(CAVE.x-CAVE.halfWidth),pz(CAVE.back),CAVE.halfWidth*2/100*size,(CAVE.front-CAVE.back)/100*size);
      ctx.fillStyle='#e3a573';
      for(const [x,z] of campfires){ctx.beginPath();ctx.arc(px(x),pz(z),2.4,0,Math.PI*2);ctx.fill();}
    },
  },
  text:{
    tag:'第五关 / 极地科考站',
    title:'极夜冰站',
    enter:'进入冰站',
    brief:'穿越冰湖和科考站，夺取冰核样本并引爆湖心光柱。体温过低会拖慢脚步，穿过研究楼或靠近篝火回温。',
    bossName:'冰封远古巨兽',
    keyItem:'冰核样本',
    portal:'湖心光柱',
    safe:'装甲车残骸安全区',
    objective:'清除凶兽，击败冰封远古巨兽并取得冰核样本',
    exitObjective:'返回开裂冰湖，在湖心光柱前按 E 引爆',
    detonating:'冰封崩解，冲击波扩散中',
    rage:'冰壳碎裂，远古巨兽召唤冰裂猎犬',
  },
};
