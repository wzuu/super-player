const CONFIG = {
  map: { cell: 3.6, fog: .0175, navCell: 1.25 },
  graphics: { maxPixelRatio: 1.16, bloomScale: .68, motes: 1650 },
  audio: { ambient: { filter: 'lowpass', frequency: 310, q: .83, activeGain: .15, pauseGain: .085 } },
  beasts: {
    types: [
      { hp: 60, radius: .40, height: 1.25 },
      { hp: 166, radius: .70, height: 1.99 },
      { hp: 102, radius: .51, height: 2.17, projectileSpeed: 14.2, slowScale: 0, slowDuration: .72 },
      { hp: 840, radius: 1.12, height: 3.89, summonCount: 7 },
    ],
  },
  breach: {
    first: [42, 58], calm: [48, 72], warning: 5, duration: 120, rise: 4, drain: 9,
    depth: 1.20, deepSpeed: .43, shallowDepth: .22, shallowSpeed: .78, shore: .82,
  },
};

// 北在首行。# 围墙，O 议事厅，T 积水神殿，W 废墟，N 船桥，S 潜水舱，F 海藻，C 珊瑚，R 岩，B 断墙。
const MAP_GRID = [
  '#########################',
  '#.......................#',
  '#.......................#',
  '#..................R....#',
  '#...R.......N...........#',
  '#.......................#',
  '#....B.........C....B...#',
  '#.......C...............#',
  '#..R.C..................#',
  '#...C.................R.#',
  '#.......................#',
  '#....W...............C..#',
  '#...........O......T....#',
  '#..R..................R.#',
  '#......C................#',
  '#....................C..#',
  '#...B...C............B..#',
  '#.......................#',
  '#...R...F...............#',
  '#.....F.........F..F....#',
  '#.R....F..F......F..F...#',
  '#........F........F..F..#',
  '#.....F.F.......F....R..#',
  '#...........S...........#',
  '#########################',
];

const REGIONS = [
  { name: '东侧积水神殿', x0: 17.6, x1: 44.0, z0: -17.0, z1: 16.7, wall: [46.2, 4.7, 2.8], yaw: -Math.PI / 2 },
  { name: '西侧珊瑚废墟', x0: -44.0, x1: -17.6, z0: -16.8, z1: 17.0, wall: [-46.2, 4.8, -4.5], yaw: Math.PI / 2 },
  { name: '北侧沉船桥廊', x0: -37.0, x1: 37.0, z0: -44.0, z1: -18.0, wall: [-4.5, 5.0, -46.2], yaw: 0 },
  { name: '南侧海藻森林', x0: -37.0, x1: 37.0, z0: 18.0, z1: 43.4, wall: [6.6, 4.9, 46.2], yaw: Math.PI },
];
const BASIN = { x0: 18.4, x1: 34.3, z0: -8.3, z1: 10.8 };
const HALL = { radius: 9.48, roof: 4.62, stairWidth: 3.30, first: 16.20, tread: .50, steps: 14 };
const LANDMARKS = {
  loot: [
    [-4.1,33.1,'潜水头盔',165], [14.8,25.5,'发光珊瑚',215], [28.4,7.0,'潮汐石印',220],
    [32.0,-5.0,'祭司贝饰',155], [-24.5,7.0,'古代金币',160], [-34.5,-7.1,'釉纹陶瓶',195],
    [6.4,-28.8,'沉船海图',300,'top'], [-12.6,-25.0,'船长航海钟',260],
    [2.18,-2.2,'议事长权杖',380,'top'], [5.5,11.7,'宝石潮汐盘',215],
  ],
  ammo: [[2.2,34.7],[-13.4,25.2],[15.1,15.0],[23.7,11.5],[33.6,1.9],[-22.0,14.0],[-33.3,-13.4],[-10.1,-24.6],[13.5,-23.3],[0,10.8]],
};

function insideBox(x,z,b){
  return x>=b.x0 && x<=b.x1 && z>=b.z0 && z<=b.z1;
}
function shoreFactor(x,z,b,margin){
  return Math.min(1, Math.max(0, Math.min(x-b.x0,b.x1-x,z-b.z0,b.z1-z)/margin));
}
function waterScale(x,z,y,game){
  const settings=game.encounter?.settings ?? CONFIG.breach;
  let factor=1;
  if(y<settings.shallowDepth && insideBox(x,z,BASIN)){
    factor=1-(1-settings.shallowSpeed)*shoreFactor(x,z,BASIN,settings.shore)*Math.min(1,(settings.shallowDepth-y)/settings.shallowDepth);
  }
  const event=game.encounter;
  if(event?.region && event.height>y && insideBox(x,z,event.region)){
    const depth=Math.min(1,(event.height-y)/settings.depth);
    factor=Math.min(factor,1-(1-settings.deepSpeed)*shoreFactor(x,z,event.region,settings.shore)*depth);
  }
  return factor;
}

// 焦散使用同一套世界坐标。石块、柱体和铺地接缝之间的花纹保持连续。
function seaCaustics(material, tick, strength=.39) {
  material.onBeforeCompile=shader=>{
    shader.uniforms.seaTime=tick;
    shader.uniforms.seaStrength={value:strength};
    shader.vertexShader='varying vec3 seaPosition;\n'+shader.vertexShader.replace('#include <worldpos_vertex>',`
      #include <worldpos_vertex>
      vec4 seaWorld = vec4(transformed,1.0);
      #ifdef USE_INSTANCING
        seaWorld = instanceMatrix * seaWorld;
      #endif
      seaPosition = (modelMatrix * seaWorld).xyz;
    `);
    shader.fragmentShader='varying vec3 seaPosition; uniform float seaTime,seaStrength;\n'+shader.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      vec2 sea = seaPosition.xz * .69 + seaPosition.y * vec2(.29,.47);
      float u = sin(sea.x * 1.7 + sin(sea.y * .82 - seaTime*.68)*1.51);
      float v = sin(sea.y * 1.52 + cos(sea.x * .96 + seaTime*.57)*1.43);
      float caustic = pow(1.0 - min(1.0,abs(u+v)*.88),6.0);
      float dapple = pow(max(0.0,sin(sea.x*.57-sea.y*.40+seaTime*.53)),1.2);
      diffuseColor.rgb *= vec3(1.0) + vec3(.29,.78,.83)*caustic*dapple*seaStrength;
    `);
  };
  return material;
}

function buildMap({ THREE, scene, GRID, level, StaticBatches, shapes, canvasTexture, seededRandom, brighter }) {
  const rng=seededRandom(506304);
  const tau=2*Math.PI, tick={value:0};
  const stone=canvasTexture(192,128,(ctx,w,h)=>{
    ctx.fillStyle='#77989a';ctx.fillRect(0,0,w,h);
    for(let j=0;j<5;j++){
      const side=j%2?-21:0;
      for(let x=side;x<w;x+=42){
        const n=120+Math.floor(rng()*45);
        ctx.fillStyle='rgb('+[n-14,n+10,n+13].join(',')+')';
        ctx.fillRect(x+1,j*26+1,40,24);
        ctx.fillStyle='#c0d5cd61';ctx.fillRect(x+2,j*26+2,37,1.2);
        ctx.fillStyle='#273d4b69';ctx.fillRect(x+1,j*26+24,41,1.4);
      }
    }
    for(let i=0;i<3500;i++){
      ctx.fillStyle=rng()>.48?'#c8d1bb34':'#284c5445';
      ctx.fillRect(rng()*w,rng()*h,.6+rng()*3,.7+rng()*2.7);
    }
  });
  const slate=canvasTexture(256,256,(ctx,w,h)=>{
    ctx.fillStyle='#9ca9a2';ctx.fillRect(0,0,w,h);
    for(let row=0;row<5;row++){
      const pos=row*51.2,d=row%2?-31:0;
      for(let x=d;x<w;x+=63){
        const mid=133+rng()*26;
        ctx.fillStyle='rgb('+[mid-12,mid+10,mid+11].map(Math.round).join(',')+')';
        ctx.fillRect(x+1.3,pos+1.3,60.7,48.8);
        ctx.fillStyle='#475f6666';ctx.fillRect(x+1.3,pos+47.7,61.0,2.5);
      }
    }
    for(let i=0;i<3700;i++){
      ctx.fillStyle=rng()>.51?'#d0d8cc39':'#52687736';
      ctx.fillRect(rng()*w,rng()*h,.4+rng()*2.7,.35+rng()*1.75);
    }
  },true);
  const ornament=canvasTexture(256,80,(ctx,w,h)=>{
    ctx.fillStyle='#526e70';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#99bbab';ctx.fillRect(0,9,w,2);ctx.fillRect(0,h-10,w,2);
    ctx.strokeStyle='#8eac9f';ctx.lineWidth=3;
    for(let i=0;i<8;i++){
      const x=i*32+16;
      ctx.beginPath();ctx.moveTo(x-8,h/2);ctx.lineTo(x,h/2-17);ctx.lineTo(x+8,h/2);
      ctx.lineTo(x,h/2+17);ctx.closePath();ctx.stroke();
      ctx.fillStyle='#a5bba0';ctx.fillRect(x-1,h/2-3,3,6);
    }
  });
  const material={
    floor:seaCaustics(new THREE.MeshLambertMaterial({map:slate,color:0xb5c6c3}),tick,.92),
    wall:seaCaustics(new THREE.MeshLambertMaterial({map:stone,color:0xa8bfbb}),tick,.70),
    chalk:seaCaustics(new THREE.MeshLambertMaterial({color:0xbdcbc3}),tick,.49),
    rock:new THREE.MeshLambertMaterial({color:0x65848b}),
    decor:seaCaustics(new THREE.MeshLambertMaterial({map:ornament,color:0xa2c6bd}),tick,.62),
    wood:new THREE.MeshLambertMaterial({color:0x788e86}),
    dark:new THREE.MeshLambertMaterial({color:0x486974}),
    seaweed:new THREE.MeshLambertMaterial({color:0xb7c6ad,side:THREE.DoubleSide}),
    glow:new THREE.MeshBasicMaterial(),
  };
  const kelp=new THREE.BufferGeometry();
  kelp.setAttribute('position',new THREE.Float32BufferAttribute([
    0,0,0, .12,.45,.06,-.12,.46,-.05,
    -.12,.46,-.05, .12,.45,.06,.09,.78,.10,
    -.12,.46,-.05, .09,.78,.10,-.055,.82,.12,
    -.055,.82,.12, .09,.78,.10, -.17,1.04,.19,
  ],3));
  kelp.computeVertexNormals();
  const assets={
    ...shapes,kelp,
    archColumn:new THREE.CylinderGeometry(.43,.50,1,9),
    reef:new THREE.IcosahedronGeometry(.64,0),
    spire:new THREE.ConeGeometry(.50,1,6),
    ringRoof:new THREE.CylinderGeometry(.50,.50,1,56),
  };
  const kit=new StaticBatches(material,assets);
  const add=(...args)=>kit.add(...args);
  const box=(m,...args)=>kit.add('box',m,...args);
  const solid=(m,x,z,w,d,bottom,top,color,climb=false)=>{
    box(m,x,(bottom+top)/2,z,w,top-bottom,d,color);
    level.box(x,z,w,d,bottom,top,climb);
  };
  const cyan=brighter(0x6dfcdc,2.2), blue=brighter(0x7acaff,2.25), lemon=brighter(0xb3ecd0,1.75);
  const coralColors=[0xa3708b,0xb08486,0x78a59e,0x86b5a0];
  const lamps=[];
  function lantern(x,y,z,color,intensity){
    add('reef','glow',x,y,z,.35,.42,.35,color);
    add('archColumn','dark',x,y-.28,z,.31,.22,.31,0x839fa0);
    const light=new THREE.PointLight(color,intensity,12,2);
    light.position.set(x,y,z);lamps.push(light);scene.add(light);
  }
  function column(x,z,height,y=0){
    solid('chalk',x,z,1.21,1.21,y,y+.19,0xaec3bb,true);
    add('archColumn','chalk',x,y+height/2,z,.77,height,.77,0xbbcbc5);
    level.box(x,z,.77,.77,y+.18,y+height);
    add('archColumn','decor',x,y+height-.17,z,.90,.29,.90,0xb2d0ba);
    box('chalk',x,y+height,z,1.05,.19,1.06,0xbacfc6);
  }
  function coral(x,z,scale=1,y=0){
    const tone=coralColors[Math.floor(rng()*coralColors.length)];
    add('reef','rock',x,y+.093,z,.69*scale,.32*scale,.65*scale,0x7f9b93,rng()*tau);
    for(let branch=0;branch<6;branch++){
      const a=rng()*tau, h=(.34+rng()*.90)*scale, r=(.13+rng()*.27)*scale;
      add('archColumn','chalk',x+Math.cos(a)*r,y+h*.48,z+Math.sin(a)*r,.11*scale,h,.11*scale,tone,a,(rng()-.5)*.53,(rng()-.5)*.5);
      add('reef',branch%4===0?'glow':'chalk',x+Math.cos(a)*r,y+h*.86,z+Math.sin(a)*r,.18*scale,.18*scale,.17*scale,branch%4===0?lemon:tone,a);
    }
  }

  function hall(x,z) {
    const r=HALL.radius,y=HALL.roof;
    level.gate.set(x,y,z);
    // 成体魔鱼在议事厅南门外驻守，保留厅内原有净高和登顶路线。
    level.bossAnchor.set(x,0,z+13.5);
    level.bossSpawn.set(x+2,0,z+13.5);
    add('ringRoof','wall',x,y-.25,z,r*2,.50,r*2,0xb5c7be);
    add('ringRoof','chalk',x,y+.014,z,r*2-.31,.022,r*2-.31,0xadbdb3);
    const band=.56;
    for(let zz=-r;zz<r;zz+=band){
      const far=Math.max(Math.abs(zz),Math.abs(Math.min(r,zz+band)));
      const span=Math.sqrt(Math.max(0,r*r-far*far));
      if(span>.025)level.box(x,z+zz+band/2,span*2,band+.009,y-.51,y,true);
    }
    for(let i=0;i<20;i++){
      const a=(i+.5)/20*tau;
      const dx=Math.cos(a)*8.15,dz=Math.sin(a)*8.15;
      if(Math.abs(dz)>1.6 && Math.abs(dx)>1.23)column(x+dx,z+dz,y-.52);
      const ax=x+Math.cos(a)*8.92,az=z+Math.sin(a)*8.92;
      box('decor',ax,y-.18,az,2.90,.31,.19,0xb9cebd,Math.PI/2-a);
      if(i%3===0)box('glow',ax,y-.005,az,1.5,.05,.078,cyan,Math.PI/2-a);
    }
    for(const side of [-1,1]){
      for(let j=0;j<HALL.steps;j++){
        const radius=HALL.first-j*HALL.tread, top=(j+1)*.33;
        solid('chalk',x+side*radius,z,HALL.tread+.02,HALL.stairWidth,0,top,0xb9cabf,true);
        box('decor',x+side*(radius+.18),top+.013,z,.12,.026,HALL.stairWidth-.12,0x9fbdad);
      }
    }
    add('ringRoof','decor',x,y+.045,z,5.20,.09,5.20,0xb7cabc);
    add('ringRoof','wall',x,.026,z,5.68,.052,5.68,0xa4c5bd);
    for(let j=0;j<12;j++){
      const a=j*tau/12;
      box('glow',x+Math.cos(a)*2.38,y+.095,z+Math.sin(a)*2.38,.32,.027,.091,blue,-a);
      box('chalk',x+Math.cos(a)*3.47,.055,z+Math.sin(a)*3.47,.66,.10,.12,0xb8cfc5,-a);
    }
  }

  function temple(x,z) {
    const dz=3.8;
    solid('wall',x,z,4.12,2.55,0,.70,0xaec3b9,true);
    solid('decor',x,z-.67,2.50,.88,.70,1.03,0xc0c7b2);
    box('glow',x,1.06,z-.59,.65,.08,.29,cyan);
    for(const side of [-1,1]){
      for(const off of [-dz*1.5,0,dz*1.55]){
        column(x+side*4.84,z+off,3.85+(rng()-.5)*.28);
      }
      box('decor',x+side*4.86,3.88,z+2.95,.70,.45,6.39,0x91b7a8);
      for(const at of [-8.1,8.5]){
        solid('wall',x+side*3.7,z+at,2.70,.38,0,.90,0xc0cec1);
        coral(x+side*5.27,z+at+.61,1.05);
      }
    }
    for(const dz of [-1.56,2.0]){
      box('decor',x,.045,z+dz,3.65,.068,.29,0xacbaac);
    }
    lantern(x-3.4,2.18,z+3.35,cyan,18);
  }

  function ruinedStreet(x,z) {
    for(const [dx,dz,w,d,h] of [
      [-6,-5.25,5.45,.47,2.40],[-8,-1.2,.49,5.35,1.95],[-3.75,-1.05,.51,3.19,2.55],
      [4.6,-4.15,3.87,.54,1.72],[5.75,1.18,.55,4.45,2.12],
      [-6.6,6.2,4.81,.60,1.28],[1.28,7.5,4.30,.56,1.54],
    ]) {
      solid('wall',x+dx,z+dz,w,d,0,h,0xa4bcb2);
      add('reef','chalk',x+dx+(rng()-.5)*w*.62,h,z+dz,.19+w*.45,.48,.36+d*.51,0xb4c1b0,rng()*tau);
      coral(x+dx+.51,z+dz+.68,.73+rng()*.65);
    }
    for(const [sx,sz] of [[-5.9,1.1],[2.8,3.4],[2.94,-7.7]]){
      column(x+sx,z+sz,2.6);
      coral(x+sx+.79,z+sz,1.10);
    }
    add('archColumn','chalk',x-1.49,.42,z-5.1,.67,3.55,.66,0xadc1b6,-.56,0,1.45);
    level.box(x-1.49,z-5.1,2.92,.85,0,.72);
    lantern(x-3.2,1.46,z+3.2,lemon,15);
  }

  function ship(x,z) {
    const h=1.16, deck=2.70;
    solid('wood',x,z,24.26,deck,0,h,0x899b8d,true);
    for(const side of [-1,1]){
      for(let j=0;j<4;j++){
        const distance=14.11-j*.60;
        solid('wood',x+side*distance,z,.62,deck,0,(j+1)*.29,0x84998f,true);
      }
      for(let i=0;i<21;i++){
        const xx=x+side*(.05+i*.565);
        box('dark',xx,h+.012,z,.041,.037,deck-.04,0x67877d);
      }
      for(let i=0;i<7;i++){
        const xx=x+side*(1.89+i*1.23),zz=z-2.9-i*.31;
        const wind=1.77+rng()*1.80;
        box('wood',xx,wind*.45,zz,.26,wind,2.20,0x8b9e91,.12*side,-.30*side,side*.38);
        level.box(xx,zz,.35,1.36,0,wind*.75);
        if(i%2===0)coral(xx,zz+.68,.64);
        box('wood',xx,1.83+rng()*.61,z+4.17+i*.11,.22,2.2,.58,0x749292,.48,side*.12,.19);
      }
      for(let i=0;i<4;i++){
        const xx=x+side*(2.85+i*2.05);
        solid('wood',xx,z-1.28,.17,.16,h,h+.94,0x7b9387);
        box('wood',xx+side*.4,h+.80,z-1.27,1.21,.14,.11,0x809995);
      }
    }
    box('wood',x+8.4,2.9,z-3.95,.32,5.82,.35,0x748983,-.22,0,.39);
    box('wood',x+8.63,4.76,z-3.55,2.87,.26,.27,0x95a699,.11,0,.26);
    for(const f of [-8.3,8.2])box('glow',x+f,h+.09,z+1.10,.58,.045,.11,blue);
  }

  function forest(x,z) {
    for(let j=0;j<9;j++){
      const a=rng()*tau, r=.41+rng()*1.28, h=2.15+rng()*3.35;
      const tint=[0x3d8a77,0x589d83,0x2c6f64,0x52988d][j%4];
      add('kelp','seaweed',x+Math.cos(a)*r,.006,z+Math.sin(a)*r,.85+rng()*.64,h,1.17+rng()*.62,tint,a,(rng()-.5)*.31,(rng()-.5)*.32);
      if(j%3===0)add('reef','glow',x+Math.cos(a)*r+.14,h*.84,z+Math.sin(a)*r,.091,.12,.09,lemon,a);
    }
    add('reef','rock',x,.085,z,1.22,.24,1.04,0x7c9d93,rng()*tau);
  }

  function hatch(x,z) {
    for(const side of [-1,1]){
      solid('wall',x+side*2.45,z,1.37,3.15,0,2.55,0xb1c1bd);
      box('decor',x+side*2.39,1.42,z-1.61,.96,1.69,.08,0xb7ccbe);
      box('glow',x+side*2.44,1.72,z-1.65,.17,.55,.05,cyan);
    }
    solid('wall',x,z,6.31,2.76,2.51,3.47,0xa9c7bc);
    box('decor',x,3.07,z-1.40,4.83,.39,.079,0xc0d6c5);
    add('archColumn','dark',x,1.42,z+1.52,4.31,.56,4.31,0x688e8b,Math.PI/2);
    level.box(x,z+2.15,4.1,1.10,0,2.53);
    box('glow',x,2.40,z-.64,3.34,.074,.09,blue);
    level.spawn.set(x,0,z-4.05);
    lantern(x-1.72,1.46,z-1.67,cyan,15);
  }

  for(let r=0;r<GRID.rows;r++)for(let c=0;c<GRID.columns;c++){
    const x=GRID.x(c), z=GRID.z(r), mark=GRID.cells[r][c];
    if(mark==='#'){
      const h=2.05+rng()*2.01;
      solid('rock',x,z,GRID.cell+.019,GRID.cell+.019,0,h,0x7c9c9d);
      if((r+c)%4!==0)add('reef','rock',x+(rng()-.5)*1.42,h,z,3.75,1.23+rng()*.97,3.16,0x799f9f,rng()*tau);
    }else if(mark==='B'){
      solid('wall',x,z,2.8,.68,0,.98,0xb2c9ba);
      box('decor',x,1.01,z,2.81,.15,.64,0x9abbb1);
    }else if(mark==='R'){
      add('reef','rock',x,.43,z,1.69+rng()*.81,.95+rng()*.41,1.58,0x789a9f,rng()*tau);
      level.box(x,z,1.51,1.14,0,.77);
    }else if(mark==='C')coral(x,z,1.02+rng()*.69);
    else if(mark==='F')forest(x,z);
    else if(mark==='O')hall(x,z);
    else if(mark==='T')temple(x,z);
    else if(mark==='W')ruinedStreet(x,z);
    else if(mark==='N')ship(x,z);
    else if(mark==='S')hatch(x,z);
  }

  const base=new THREE.PlaneGeometry(GRID.halfX*2,GRID.halfZ*2);
  const uv=base.attributes.uv;
  for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*16.54,uv.getY(i)*16.54);
  const paving=new THREE.Mesh(base,material.floor);
  paving.rotation.x=-Math.PI/2;scene.add(paving);
  for(const d of [-1,1])for(let z=13.7;z<34;z+=2.42){
    box('decor',d*2.14,.017,z,.49,.035,.26,0xa7c4b5);
    if(z>19)box('glow',d*2.14,.043,z,.107,.044,.097,cyan);
  }
  for(let i=0;i<180;i++){
    const x=(rng()-.5)*82,z=(rng()-.5)*82;
    if((Math.abs(x)<8&&z>10)||level.blocked(x,z,0,.18,.23))continue;
    add('reef','rock',x,.036,z,.12+rng()*.48,.081+rng()*.19,.16+rng()*.52,0x859f99,rng()*tau);
  }
  for(let i=0;i<59;i++){
    const a=i*tau/59+rng()*.13,r=51+rng()*34,h=3.6+rng()*19.6;
    add('reef','rock',Math.cos(a)*r,h*.44-2,Math.sin(a)*r,5.3+rng()*19,h,7.5+rng()*15,0x527578,a,rng()*.48,rng()*.18);
  }
  kit.flush();

  const ambient=new THREE.HemisphereLight(0x9be2e7,0x415d65,1.48);
  const ray=new THREE.DirectionalLight(0xa5e2dd,1.30);
  ray.position.set(-22,28,-45);
  const portalLight=new THREE.PointLight(0x56caff,55,16,2);
  portalLight.position.copy(level.gate).add(new THREE.Vector3(0,2.2,0));
  scene.add(ambient,ray,portalLight);
  return {tick,lamps,portalLight};
}

function createEncounter({CONFIG: setup, sound, randomRange}) {
  const tune=setup.breach,status={title:'',detail:'',remaining:undefined,readout:undefined};
  return {
    settings:tune,phase:'calm',region:null,last:-1,height:0,opens:0,seals:0,status:null,
    reset(){
      this.phase='calm';this.region=null;this.last=-1;this.height=0;this.status=null;
      this.opens=randomRange(...tune.first);this.seals=0;
    },
    update(game){
      const t=game.time;
      if(this.phase==='calm' && t>=this.opens-tune.warning){
        // 从其他区选一个裂口，防止同一区域连续失守。
        const available=REGIONS.filter((_,index)=>index!==this.last);
        this.region=available[Math.floor(Math.random()*available.length)];
        this.last=REGIONS.indexOf(this.region);
        this.phase='warning';
        game.ui.notify('穹顶破裂预警，'+this.region.name+'即将进水',2.5);
        sound.tone(109,53,.58,.22,'triangle');
      }
      if(this.phase==='warning' && t>=this.opens){
        this.phase='flood';
        this.seals=this.opens+tune.duration;
        sound.hiss(2.8,2100,220,.42);
        sound.tone(86,22,1.13,.42,'triangle');
        game.ui.notify(this.region.name+'穹顶破裂，海水涌入',2.8);
      }
      if(this.phase==='flood' && t>=this.seals){
        this.phase='drain';
        sound.tone(67,42,.59,.21,'sine');
        game.ui.notify(this.region.name+'裂口已封闭',2.1);
      }
      if(this.phase==='drain' && t>=this.seals+tune.drain){
        this.phase='calm';this.region=null;this.height=0;this.opens=t+randomRange(...tune.calm);
      }
      const smooth=t=>{const c=Math.max(0,Math.min(1,t));return c*c*(3-2*c);};
      if(this.phase==='flood')this.height=tune.depth*smooth((t-this.opens)/tune.rise);
      if(this.phase==='drain')this.height=tune.depth*(1-smooth((t-this.seals)/tune.drain));

      const p=game.player, impaired=game.time<p.slowUntil && p.slowScale===0;
      status.readout=undefined;
      status.remaining=undefined;
      if(this.phase==='warning'){
        status.title='穹顶破裂预警';status.remaining=this.opens-t;
        status.detail=this.region.name+'即将进水，准备转移';
      }else if(this.phase==='flood'){
        status.title=this.region.name+'进水';
        status.remaining=this.seals-t;
        status.detail=insideBox(p.x,p.z,this.region)?'深水减速，沿主街转移':'绕开深水区，等待穹顶再封闭';
      }else if(this.phase==='drain'){
        status.title='裂口已封闭';status.remaining=this.seals+tune.drain-t;
        status.detail=this.region.name+'退水中';
      }else if(impaired){
        status.title='电弧麻痹';status.readout=(p.slowUntil-t).toFixed(1)+' 秒';status.detail='移动暂时受限';
      }
      if(impaired && this.phase!=='calm')status.detail='电弧麻痹中 / '+status.detail;
      this.status=this.phase==='calm'&&!impaired?null:status;
    },
  };
}

function createWater({THREE,scene},box,depth) {
  const w=box.x1-box.x0,d=box.z1-box.z0;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,
    uniforms:{tick:{value:0},scale:{value:new THREE.Vector2(w,d)},height:{value:depth},fogDepth:{value:.0175}},
    vertexShader:`
      varying vec2 field; varying float viewDepth;
      void main(){
        field=uv;
        vec4 v=modelViewMatrix*vec4(position,1.0);
        viewDepth=-v.z;
        gl_Position=projectionMatrix*v;
      }
    `,
    fragmentShader:`
      uniform float tick,height,fogDepth;
      uniform vec2 scale;
      varying vec2 field; varying float viewDepth;
      void main(){
        vec2 p=field*scale;
        float edge=min(min(p.x,scale.x-p.x),min(p.y,scale.y-p.y));
        float shore=smoothstep(.0,.82,edge);
        float a=sin(p.x*1.57+p.y*.49+tick*2.7);
        float b=sin(p.y*1.31-p.x*.36-tick*2.1);
        float shimmer=pow(max(0.0,sin(a*1.7+b*.79+p.y*.35-tick*.85)),11.0);
        float foam=exp(-edge*2.8)*pow(max(0.0,sin(p.x*.89+p.y*.72+tick*2.8)),4.0);
        vec3 shade=mix(vec3(.04,.19,.20),vec3(.025,.29,.36),clamp(height*.9,0.0,1.0));
        shade+=shimmer*vec3(.10,.32,.32)+foam*vec3(.16,.25,.17);
        float fog=1.0-exp(-pow(max(0.0,viewDepth)*fogDepth,2.0));
        gl_FragColor=vec4(mix(shade,vec3(.029,.104,.147),fog),shore*(.47+.18*clamp(height,0.0,1.0)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }));
  mesh.rotation.x=-Math.PI/2;
  mesh.position.set((box.x0+box.x1)/2,depth,(box.z0+box.z1)/2);
  scene.add(mesh);
  return mesh;
}

function createEnvironment(context) {
  const {THREE,scene,camera,CONFIG:setup,mapData,seededRandom,brighter}=context;
  const rng=seededRandom(592067), tau=Math.PI*2;
  const shallow=createWater(context,BASIN,setup.breach.shallowDepth);
  const flooded=REGIONS.map(r=>{const m=createWater(context,r,1.20);m.visible=false;return m;});
  const sea=new THREE.Mesh(new THREE.SphereGeometry(124,32,21),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,
    vertexShader:`
      varying vec3 ray;
      void main(){
        vec4 p=modelMatrix*vec4(position,1.0);
        ray=p.xyz-cameraPosition;
        gl_Position=projectionMatrix*viewMatrix*p;
      }
    `,
    fragmentShader:`
      varying vec3 ray;
      void main(){
        vec3 d=normalize(ray);
        float up=clamp(d.y+.19,0.0,1.0);
        float beam=pow(max(0.0,dot(d,normalize(vec3(.16,.68,-.55)))),6.0);
        float vein=pow(max(0.0,sin(d.x*23.0+d.y*8.0+d.z*3.0)),8.0)*beam*.18;
        vec3 tint=mix(vec3(.018,.075,.117),vec3(.059,.245,.284),pow(up,.72));
        gl_FragColor=vec4(tint+vec3(.071,.29,.28)*(beam*.56+vein),1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }));
  sea.renderOrder=-25;sea.frustumCulled=false;scene.add(sea);
  function domeXZ(x,z){
    const len=Math.hypot(x,z);
    if(len<.0001)return [0,0];
    const power=10;
    const f=46.9/Math.pow(Math.abs(x/len)**power+Math.abs(z/len)**power,1/power);
    return [x*f,z*f];
  }
  const roof=new THREE.SphereGeometry(1,64,23,0,tau,0,Math.PI/2);
  const roofPosition=roof.attributes.position;
  for(let i=0;i<roofPosition.count;i++){
    const [x,z]=domeXZ(roofPosition.getX(i),roofPosition.getZ(i));
    roofPosition.setXYZ(i,x,roofPosition.getY(i)*36.8-1.15,z);
  }
  roof.computeVertexNormals();
  const glass=new THREE.Mesh(roof,new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.BackSide,
    vertexShader:`
      varying vec3 norm,view;
      void main(){
        vec4 p=modelViewMatrix*vec4(position,1.0);
        norm=normalize(normalMatrix*normal);view=normalize(-p.xyz);
        gl_Position=projectionMatrix*p;
      }
    `,
    fragmentShader:`
      varying vec3 norm,view;
      void main(){
        float glancing=pow(1.0-abs(dot(normalize(norm),normalize(view))),2.5);
        gl_FragColor=vec4(vec3(.21,.60,.64),.035+glancing*.13);
      }
    `,
  }));
  scene.add(glass);
  const ribVertices=[];
  function domePoint(a,p){
    const k=Math.cos(p),[x,z]=domeXZ(Math.cos(a)*k,Math.sin(a)*k);
    return [x,Math.sin(p)*36.75-1.10,z];
  }
  for(let i=0;i<16;i++){
    const a=i/16*tau;
    for(let j=0;j<25;j++)ribVertices.push(...domePoint(a,j/25*Math.PI/2),...domePoint(a,(j+1)/25*Math.PI/2));
  }
  for(const p of [.24,.51,.80,1.07,1.31]){
    for(let i=0;i<72;i++)ribVertices.push(...domePoint(i/72*tau,p),...domePoint((i+1)/72*tau,p));
  }
  const ribs=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({
    color:0x90d6d7,transparent:true,opacity:.20,depthWrite:false,fog:false,
  }));
  ribs.geometry.setAttribute('position',new THREE.Float32BufferAttribute(ribVertices,3));
  scene.add(ribs);

  // 巨影在压力穹顶外侧游动，与关卡内可攻击的首领分开。
  const shadow=new THREE.Group();
  const shade=new THREE.MeshBasicMaterial({color:0x10262f,fog:false});
  const shape=new THREE.SphereGeometry(1,16,8),tailFin=new THREE.ConeGeometry(1,1,3);
  for(const [x,y,z,w,h,d] of [[0,0,0,3.6,2.10,11.8],[0,-.4,9.1,2.43,1.48,4.9],[0,.18,-9.6,1.19,1.11,5.5]]){
    const m=new THREE.Mesh(shape,shade);m.position.set(x,y,z);m.scale.set(w,h,d);shadow.add(m);
  }
  for(const d of [-1,1]){
    const f=new THREE.Mesh(tailFin,shade);
    f.position.set(d*3.64,-.66,1.79);f.scale.set(3.40,5.37,.26);
    f.rotation.set(-.43,.25,d*1.07);shadow.add(f);
  }
  const fin=new THREE.Mesh(tailFin,shade);
  fin.position.set(0,2.38,-.32);fin.scale.set(.32,4.35,4.18);fin.rotation.x=-.49;shadow.add(fin);
  const tail=new THREE.Group();tail.position.z=-12.4;shadow.add(tail);
  for(const d of [-1,1]){
    const f=new THREE.Mesh(tailFin,shade);
    f.position.set(0,d*1.54,-.2);f.scale.set(.28,5.23,2.03);
    f.rotation.x=d*.53;f.rotation.z=d<0?Math.PI:0;tail.add(f);
  }
  scene.add(shadow);

  const data=new Float32Array(setup.graphics.motes*3);
  for(let i=0;i<data.length;i++)data[i]=rng();
  const drift=new THREE.Points(new THREE.BufferGeometry(),new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,
    uniforms:{tick:{value:0}},
    vertexShader:`
      uniform float tick;
      varying float opacity,bubble;
      void main(){
        vec3 s=position,c=cameraPosition;
        float span=55.0;
        bubble=step(.79,s.z);
        vec3 p=vec3(
          mod(s.x*span+tick*(.32+s.y*.67)-c.x,span)+c.x-span*.5+sin(tick+s.y*31.0)*.30,
          mod(s.y*12.0+tick*(.24+bubble*.86+s.z*.22),12.0)+.13,
          mod(s.z*span-tick*(.16+s.x*.19)-c.z,span)+c.z-span*.5
        );
        vec4 v=viewMatrix*vec4(p,1.0);
        float fade=smoothstep(.63,2.0,-v.z)*(1.0-smoothstep(20.0,26.0,-v.z));
        opacity=fade*(.24+s.x*.36+bubble*.15);
        gl_PointSize=clamp((3.8+s.y*5.5+bubble*11.0)/max(-v.z,1.0),1.1,6.8);
        gl_Position=projectionMatrix*v;
      }
    `,
    fragmentShader:`
      varying float opacity,bubble;
      void main(){
        float r=length(gl_PointCoord-.5);
        float dotMask=1.0-smoothstep(.13,.49,r);
        float ring=1.0-smoothstep(.042,.108,abs(r-.34));
        gl_FragColor=vec4(vec3(.62,.95,.90),opacity*mix(dotMask,ring,bubble));
      }
    `,
  }));
  drift.geometry.setAttribute('position',new THREE.BufferAttribute(data,3));drift.frustumCulled=false;scene.add(drift);

  const leak=new THREE.Group();scene.add(leak);
  const cuts=[
    [-1.38,.33,-.84,.13],[-.84,.13,-.42,.24],[-.42,.24,-.11,.04],[-.11,.04,.39,.15],[.39,.15,.72,-.08],[.72,-.08,1.32,.19],
    [-.42,.24,-.60,.55],[-.60,.55,-.53,.88],[.39,.15,.48,.51],[.48,.51,.71,.69],[-.11,.04,-.22,-.42],[-.22,-.42,.12,-.69],
  ];
  const edges=[];
  for(const [ax,ay,bx,by] of cuts)edges.push(ax,ay,.10,bx,by,.10);
  const crack=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({
    color:brighter(0x6bddff,2.65),transparent:true,opacity:.9,depthWrite:false,fog:false,
  }));
  crack.geometry.setAttribute('position',new THREE.Float32BufferAttribute(edges,3));leak.add(crack);
  const streams=[];
  for(let j=0;j<3;j++){
    const stream=new THREE.Mesh(new THREE.PlaneGeometry(1.82,4.75),new THREE.ShaderMaterial({
      transparent:true,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false,
      uniforms:{tick:{value:0},phase:{value:j*2.23},energy:{value:0}},
      vertexShader:'varying vec2 p; void main(){p=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:`
        uniform float tick,energy,phase;
        varying vec2 p;
        void main(){
          float v=p.x-.5 + .06*sin(p.y*12.0+tick*4.0+phase);
          float flow=pow(max(0.0,sin(v*92.0+p.y*8.0-phase)),7.0);
          float spray=pow(max(0.0,sin(p.y*58.0+tick*17.0+v*17.0)),4.0);
          float edge=1.0-smoothstep(.08,.47,abs(v));
          float falloff=smoothstep(0.0,.2,p.y)*(1.0-smoothstep(.9,1.0,p.y));
          gl_FragColor=vec4(vec3(.22,.66,.96),(.26+flow*.53+spray*.22)*edge*falloff*energy);
        }
      `,
    }));
    stream.position.set((j-1)*.36,-2.03,1.35+j*.20);
    stream.rotation.x=-.61;
    stream.rotation.y=(j-1)*.33;leak.add(stream);streams.push(stream);
  }
  return {
    update(t,playing,game){
      mapData.tick.value=t;
      for(const [i,light] of mapData.lamps.entries())light.intensity=(i===0?18:15)*(1+Math.sin(t*2.8+i*2.7)*.17);
      mapData.portalLight.intensity=55+Math.sin(t*2.8)*9+game.blast*(1-game.blast)*300;
      drift.material.uniforms.tick.value=t;
      const a=t*.14-Math.PI/2-.53;
      shadow.position.set(Math.cos(a)*71,19+Math.sin(t*.59)*2.9,Math.sin(a)*71);
      shadow.rotation.set(Math.sin(t*.6)*.08,Math.atan2(-Math.sin(a),Math.cos(a)),Math.sin(t*.73)*.11);
      tail.rotation.y=Math.sin(t*2.0)*.28;
      const encounter=game.encounter;
      const region=encounter?.region;
      shallow.visible=!(region===REGIONS[0]&&encounter.height>setup.breach.shallowDepth+.016);
      shallow.material.uniforms.tick.value=t;
      for(const [i,m] of flooded.entries()){
        const active=REGIONS[i]===region&&encounter.height>.015;
        m.visible=active;
        if(active){
          m.position.y=encounter.height;
          m.material.uniforms.height.value=encounter.height;
          m.material.uniforms.tick.value=t;
        }
      }
      leak.visible=!!region && encounter.phase!=='drain';
      if(leak.visible){
        leak.position.set(...region.wall);
        leak.rotation.y=region.yaw;
        crack.material.opacity=encounter.phase==='warning' ? .40+Math.sin(t*8)*.21:.89;
        for(const m of streams){
          m.material.uniforms.tick.value=t;
          m.material.uniforms.energy.value=encounter.phase==='flood'?1:0;
        }
      }
      const forest=game.player.z>18.5&&Math.abs(game.player.x)>6.5&&Math.abs(game.player.x)<28.5;
      scene.fog.density = (setup.map.fog + (forest ? .014 : 0)) * (game.variation?.fog ?? 1);
    },
  };
}

function createPortal({THREE,scene,level,brighter,seededRandom,dynamicMesh,setInstance,updateMesh}){
  const base=new THREE.Group();base.position.copy(level.gate);scene.add(base);
  const vortex=new THREE.Mesh(new THREE.PlaneGeometry(6.1,5.57),new THREE.ShaderMaterial({
    transparent:true,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{tick:{value:0},ready:{value:0},blast:{value:0}},
    vertexShader:'varying vec2 coord;void main(){coord=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`
      uniform float tick,ready,blast;
      varying vec2 coord;
      void main(){
        vec2 p=coord*2.0-1.0;
        float r=length(p),a=atan(p.y,p.x);
        float spiral=sin(a*4.0-r*24.0+tick*3.3+sin(a*3.0+r*8.0)*.9);
        float arms=pow(max(0.0,spiral),8.0);
        float brim=exp(-abs(r-.78-sin(a*5.0+tick*1.9)*.042)*27.0);
        float eye=(1.0-smoothstep(.03,.28,r))*.93;
        float cover=(1.0-smoothstep(.72,1.0,r))*smoothstep(.05,.20,r);
        vec3 shade=mix(vec3(.12,.44,.89),vec3(.28,1.06,.98),ready);
        gl_FragColor=vec4(shade*(1.0+blast*3.0),(.09+arms*.64+brim*.59+eye*.12)*cover*(1.0-blast));
      }
    `,
  }));
  vortex.position.set(0,2.61,0);base.add(vortex);
  const rings=[];
  for(let j=0;j<3;j++){
    const m=new THREE.Mesh(new THREE.TorusGeometry(2.01+j*.23,.026+j*.005,6,61,Math.PI*(1.65+j*.09)),
      new THREE.MeshBasicMaterial({color:brighter(j%2?0x5bf3cf:0x64cfff,2.4)}));
    m.position.set(0,2.55,-j*.09);
    base.add(m);rings.push(m);
  }
  const surge=new THREE.Mesh(new THREE.CylinderGeometry(.92,.66,1,28,1,true),new THREE.ShaderMaterial({
    transparent:true,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{tick:{value:0},opacity:{value:0}},
    vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`
      uniform float tick,opacity;
      varying vec2 p;
      void main(){
        float v=pow(max(0.0,sin(p.x*89.0+sin(p.y*16.0-tick*4.0)*1.81)),7.0);
        float wave=pow(max(0.0,sin(p.y*46.0-tick*20.0+p.x*60.0)),5.0);
        float ends=smoothstep(.0,.12,p.y)*(1.0-smoothstep(.60,1.0,p.y));
        gl_FragColor=vec4(vec3(.30,.72,1.19),(.24+v*.52+wave*.26)*ends*opacity);
      }
    `,
  }));
  base.add(surge);
  const circles=[];
  for(const [i,y] of [.13,-HALL.roof+.15].entries()){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1,.031,7,71),new THREE.MeshBasicMaterial({
      color:brighter(i?0x61dbff:0x88fce8,2.65),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    }));
    ring.rotation.x=-Math.PI/2;ring.position.y=y;base.add(ring);circles.push(ring);
  }
  const rng=seededRandom(203359),droplets=[];
  for(let i=0;i<138;i++){
    droplets.push({a:rng()*Math.PI*2,reach:2.5+rng()*18.4,height:2.3+rng()*8.1,
      size:.075+rng()*.30,spin:rng()*12.0,color:brighter(i%4?0x82defe:0x6cffe0,1.1+rng()*1.35)});
  }
  const drops=dynamicMesh(new THREE.OctahedronGeometry(1,0),new THREE.MeshBasicMaterial({
    transparent:true,opacity:.80,depthWrite:false,
  }),droplets.length);
  return {
    update(t,ready,blast){
      const u=vortex.material.uniforms;
      u.tick.value=t;u.ready.value=Number(ready);u.blast.value=blast;
      vortex.rotation.set(.12+Math.sin(t*.58)*.14,Math.sin(t*.43)*.46,t*.13);
      vortex.visible=blast<.86;
      for(const [i,ring] of rings.entries()){
        ring.visible=blast<.78;
        ring.rotation.set(Math.sin(t*.71+i)*(.24+i*.06),Math.cos(t*.51+i)*(.22+i*.078),t*(i%2?-.51:.49)+i*1.8);
        ring.scale.setScalar(1+blast*(2+i));
      }
      const columnHeight=1.6+Math.sin(blast*Math.PI*.86)*13.0;
      surge.visible=blast>0&&blast<.99;
      surge.position.y=columnHeight*.49;surge.scale.set(.76+blast*3.5,columnHeight,.76+blast*3.5);
      surge.rotation.y=t*.39;
      surge.material.uniforms.tick.value=t;
      surge.material.uniforms.opacity.value=(1-blast)*1.15;
      for(const [i,circle] of circles.entries()){
        const x=Math.max(0,blast-i*.13);
        circle.visible=x>0&&blast<1;
        circle.material.opacity=(1-blast)*.82;
        circle.scale.setScalar(1.3+x*(i?32:15));
      }
      let count=0;
      if(blast>0&&blast<1)for(const p of droplets){
        const r=1.32+p.reach*blast,y=.55+p.height*4*blast*(1-blast)-blast*3.6;
        if(y<-.29)continue;
        setInstance(drops,count++,level.gate.x+Math.cos(p.a)*r,level.gate.y+y,level.gate.z+Math.sin(p.a)*r,
          p.size*.55,p.size*1.61,p.size*.59,p.color,p.a+p.spin*blast,p.spin*blast,.36);
      }
      drops.material.opacity=(1-blast)*.82;
      updateMesh(drops,count);
    },
  };
}

function seaModel(type,{THREE,shapes,mergeGeometries}){
  const solid=[],lit=[],transform=new THREE.Object3D();
  const facet=new THREE.IcosahedronGeometry(1,0);
  const spike=new THREE.ConeGeometry(.50,1,5);
  const joint=new THREE.CylinderGeometry(.36,.50,1,6);
  const umbrella=new THREE.SphereGeometry(.50,12,6,0,Math.PI*2,0,Math.PI/2);
  function stamp(to,primitive,color,x,y,z,w,h,d,pitch=0,yaw=0,roll=0){
    const g=primitive.index?primitive.toNonIndexed():primitive.clone();
    transform.position.set(x,y,z);transform.scale.set(w,h,d);transform.rotation.set(pitch,yaw,roll,'YXZ');
    transform.updateMatrix();g.applyMatrix4(transform.matrix);
    const tint=new THREE.Color(color),data=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<data.length;i+=3){data[i]=tint.r;data[i+1]=tint.g;data[i+2]=tint.b;}
    g.setAttribute('color',new THREE.BufferAttribute(data,3));to.push(g);
  }
  const hull=(...p)=>stamp(solid,facet,...p);
  const plate=(...p)=>stamp(solid,shapes.box,...p);
  const fin=(...p)=>stamp(solid,spike,...p);
  const limb=(...p)=>stamp(solid,joint,...p);
  const light=(...p)=>stamp(lit,facet,...p);
  const navy=0x294d60,teal=0x496e76,lightTeal=0x72a599,ink=0x2a5561,copper=0x825b68;
  if(type===0){
    hull(teal,0,.72,-.11,.34,.29,.56);
    hull(navy,0,.66,.39,.25,.19,.33);
    fin(lightTeal,0,1.01,-.19,.10,.40,.31,-.46);
    for(const d of [-1,1]){
      fin(ink,d*.23,.60,.08,.17,.34,.12,.53,0,-d*.95);
      fin(lightTeal,0,.75+d*.14,-.71,.08,.34,.25,Math.PI/2+d*.62);
      light(0x80ffdf,d*.19,.79,.51,.061,.046,.042);
      light(0x62c8e3,d*.27,.66,.12,.040,.056,.16);
    }
  }else if(type===1){
    hull(copper,0,.96,-.17,.70,.51,.55);
    hull(teal,0,1.18,.18,.66,.30,.49);
    hull(navy,0,.88,.44,.49,.32,.29);
    for(const d of [-1,1]){
      for(let j=0;j<4;j++){
        limb(copper,d*(.54+j*.03),.46,.35-j*.25,.15,.67,.15,.13,0,d*-.84);
        fin(navy,d*(.76+j*.03),.235,.40-j*.25,.09,.30,.10,Math.PI,0,d*.44);
      }
      limb(teal,d*.57,.78,.44,.26,.46,.28,1.02,0,-d*.66);
      hull(copper,d*.69,.88,.66,.29,.25,.33);
      fin(teal,d*.81,.92,.90,.24,.48,.21,1.21,0,d*.52);
      fin(teal,d*.56,.84,.91,.18,.37,.19,1.21,0,-d*.41);
      fin(navy,d*.37,1.48,-.16,.25,.31,.25,-.43,0,-d*.17);
      light(0xffb7a8,d*.19,1.16,.57,.065,.050,.065);
    }
  }else if(type===2){
    stamp(solid,umbrella,0x769aad,0,1.33,-.06,1.02,1.34,1.04);
    hull(navy,0,1.31,.01,.47,.18,.48);
    hull(0x5f80a0,0,1.57,.10,.30,.22,.36);
    for(let j=0;j<8;j++){
      const a=j/8*2*Math.PI;
      const x=Math.cos(a)*.31,z=Math.sin(a)*.30;
      limb(0x39677a,x,1.005,z,.073,.62,.080,x*.89,0,z*.79);
      limb(teal,x*1.33,.52,z*1.24,.057,.48,.056,-z*.77,0,-x*.67);
      light(0x83d8ff,x,1.24,z,.070,.042,.075);
      light(0x66bfee,x*1.30,.333,z*1.22,.046,.045,.051);
    }
    light(0x87d8ff,0,1.40,.46,.147,.059,.046);
  }else{
    hull(navy,0,1.89,-.10,1.04,.93,.94);
    hull(teal,0,2.02,.63,.86,.66,.82);
    hull(ink,0,1.78,.99,.82,.39,.54);
    hull(navy,0,1.47,1.05,.71,.31,.52);
    hull(navy,0,1.58,-1.04,.43,.41,.88);
    fin(lightTeal,0,2.64,-.51,.26,1.19,.41,-.34);
    fin(ink,0,1.94,-1.72,.14,1.02,.43,-.26);
    for(const d of [-1,1]){
      hull(ink,d*.85,1.64,.19,.64,.22,.65,0,d*.41);
      fin(teal,d*1.14,1.45,.06,.40,.95,.36,.82,0,d*-1.06);
      fin(navy,d*.72,2.36,.49,.31,.69,.42,-.44,0,d*-.67);
      for(let j=0;j<3;j++)fin(0x9dc6c2,d*(.24+j*.16),1.87,1.24,.135,.27,.15,Math.PI,.13);
      light(0x80f1ec,d*.48,2.16,1.14,.13,.09,.080);
      light(0x6ecbf2,d*.69,1.89,.86,.070,.070,.096);
    }
    limb(ink,0,3.09,.62,.148,1.02,.151,.67);
    light(0x78ffdd,0,3.49,1.02,.19,.19,.18);
  }
  const g=[mergeGeometries(solid),mergeGeometries(lit)];
  for(const part of [...solid,...lit,facet,spike,joint,umbrella])part.dispose();
  return g;
}

export default {
  story:{
    type:'escort',
    sectors:[{name:'海藻林廊',at:[-8,23],entries:[[-15,20],[0,18]]},
      {name:'议事厅前庭',at:[0,11],entries:[[-10,9],[10,10]]}],
    route:[{kind:'fight',name:'海藻林补给点',label:'掩护停靠无人机，拦截伏击者',escort:true,at:[-8,23],
        entries:[[-15,20],[-6,15]],mix:[0,2,0,1],range:8},
      {kind:'fight',name:'议事厅坡道',label:'保护无人机，打通议事厅坡道',escort:true,at:[12,10],
        entries:[[19,10],[9,3]],mix:[0,1,0,2],range:8}],
  },
  weaponSkin: 'drowned-city',
  pageTitle: '沉穹古都 | 第六关',
  grid: MAP_GRID,
  config: CONFIG,
  loot: LANDMARKS.loot,
  ammo: LANDMARKS.ammo,
  background: 0x1e5064,
  fog: 0x235362,
  palette:{projectile:0x8ad5ff,ichor:0x528882,spark:0xbef9f0,core:0x80ffda,rare:0xacffe0,blast:0x68bae7},
  buildMap,
  createPortal,
  createEncounter,
  createEnvironment,
  buildBeastModel:seaModel,
  portal:{width:1.24,depth:1.22,verticalRange:.48,useRadius:4.30},
  terrain:{moveScale:waterScale},
  area(x,z,level,y){
    if(y>=HALL.roof-.09&&Math.hypot(x-level.gate.x,z-level.gate.z)<HALL.radius+.5)return '议事厅穹顶平台';
    if(z>33&&Math.abs(x-level.spawn.x)<8)return '南侧潜水舱入口';
    if(z>18)return '南侧海藻森林';
    if(z<-18)return '北侧沉船桥廊';
    if(x>17.6)return '东侧积水神殿';
    if(x<-17.6)return '西侧珊瑚废墟';
    if(Math.hypot(x,z)<9.45)return '圆形议事厅';
    return '穹顶主街';
  },
  minimap:{
    tiles:{'#':'#668f96', B:'#667d7a', R:'#61777a', C:'#698f88', F:'#397f72'},
    beforeTiles({ctx,px,pz,size}){
      ctx.fillStyle='#193941';ctx.fillRect(0,0,size,size);
      ctx.fillStyle='#315864';
      ctx.fillRect(px(BASIN.x0),pz(BASIN.z0),px(BASIN.x1)-px(BASIN.x0),pz(BASIN.z1)-pz(BASIN.z0));
      ctx.strokeStyle='#658d8f';
      ctx.beginPath();ctx.ellipse(px(0),pz(0),HALL.radius*size/90,HALL.radius*size/90,0,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='#625f60';ctx.fillRect(px(-12.3),pz(-30.1),px(12.3)-px(-12.3),pz(-27.5)-pz(-30.1));
    },
    overlay({ctx,px,pz,game}){
      const event=game.encounter,r=event?.region;
      if(!r)return;
      const x=px(r.x0),z=pz(r.z0),w=px(r.x1)-x,d=pz(r.z1)-z;
      ctx.fillStyle=event.phase==='warning'?'#f1ac6728':'#39bedf36';
      ctx.strokeStyle=event.phase==='warning'?'#ffbc76':'#79e7ff';
      ctx.lineWidth=1.0;
      ctx.fillRect(x,z,w,d);ctx.strokeRect(x,z,w,d);
    },
  },
  text:{
    tag:'第六关 / 穹顶海底都市',
    title:'沉穹古都',
    enter:'进入穹顶',
    brief:'从潜水舱进入沉城，击败深海魔鱼，带着深渊珍珠登上议事厅。穹顶破裂时，离开进水区可恢复跑动速度。',
    bossName:'巨型深海魔鱼',
    keyItem:'深渊珍珠',
    portal:'议事厅漩涡',
    safe:'潜水舱入口安全区',
    objective:'清除凶兽，击败巨型深海魔鱼并取得深渊珍珠',
    exitObjective:'登上圆形议事厅，在屋顶漩涡前按 F 引爆',
    detonating:'深海封印解除，水柱冲击波扩散中',
    rage:'深海魔鱼狂暴，鱼群向议事厅聚集',
  },
};
