import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const CONFIG = {
  map: { cell: 3.6, fog: .0155, navCell: 1.25 },
  graphics: { maxPixelRatio: 1.16, bloomScale: .69, embers: 1900, heat: .0058 },
  audio: { ambient: { filter: 'lowpass', frequency: 250, q: .80, activeGain: .16, pauseGain: .08 } },
  beasts: {
    types: [
      { hp: 58, radius: .43, height: 1.09 },
      { hp: 169, radius: .64, height: 2.01 },
      { hp: 103, radius: .49, height: 1.91, projectileSpeed: 13.8, hazardLife: 5.4 },
      { hp: 835, radius: 1.02, height: 3.92, summonCount: 7 },
    ],
  },
  tide: { period: 120, warning: 8, rise: 6, hold: 30, retreat: 8, peak: .37, damage: 8, tick: .55 },
};

// 北在首行。O 湖心、F 工坊、W 城墙、N 北桥、S 吊桥，B 断墙、R 岩、V 喷气口。
const MAP_GRID = [
  '#########################',
  '#.......................#',
  '#.......................#',
  '#.......R........R......#',
  '#.......................#',
  '#....R...B..N..B..R.....#',
  '#.......................#',
  '#.....V..........V......#',
  '#...B...............B...#',
  '#.R...................R.#',
  '#.......................#',
  '#..................F....#',
  '#.R..W......O.........R.#',
  '#.......................#',
  '#.......................#',
  '#.......................#',
  '#...B...............B...#',
  '#.....V............V....#',
  '#.......................#',
  '#..R.....V......V.....R.#',
  '#......R.........R......#',
  '#..B....................#',
  '#...R...............R...#',
  '#...........S...........#',
  '#########################',
];
const LAKE = { inner: 5.05, outer: 12.72, base: -.35, bed: -1.20, deck: .84, bridge: 1.63, edge: 13.18, approach: 16.15 };
const CHANNELS = [
  { name: '北缘沟道', x0: -8.4, x1: 8.4, z0: -27.7, z1: -21.8 },
  { name: '工坊卸料道', x0: 19.5, x1: 24.8, z0: 6.5, z1: 13.1 },
  { name: '西墙外沟', x0: -29.2, x1: -23.1, z0: 10.9, z1: 17.7 },
  { name: '南灰烬洼地', x0: -8.2, x1: -1.0, z0: 22.0, z1: 28.0 },
];
const NORTH = { x: 0, halfWidth: 1.38, back: -27.7, front: -21.8, backRamp: -31.5, frontRamp: -18.7, top: .92 };
const BED = -.26;
const LANDMARKS = {
  loot: [
    [-4.2,34.4,'古战旗',165], [-6.0,24.0,'裂纹铜制号角',150],
    [25.5,-6.8,'熔铸金锭',270], [30.55,-5.4,'刻纹铁钳',170], [22.0,9.3,'火晶',235],
    [-28.2,5.0,'黑曜石雕像',295], [-31.4,-9.8,'要塞守卫徽记',160],
    [0,-24.5,'赤铁路标',180], [3.0,-32.8,'火山测绘石板',275], [2.96,-1.51,'旧王火玉',380],
  ],
  ammo: [[2.9,34.2],[-13.3,22.6],[11.2,18.0],[17.1,9.8],[25.2,-3.6],[-21.3,8.4],[-34.8,-7],[-9.8,-21.2],[14.0,-23.1],[0,-33.0]],
};
const inside=(x,z,r)=>x>=r.x0&&x<=r.x1&&z>=r.z0&&z<=r.z1;
const clamp01=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const t=clamp01(value);return t*t*(3-2*t);};

function groundHeight(x,z) {
  const r=Math.hypot(x,z);
  if(r<=LAKE.inner)return LAKE.deck;
  const axis=Math.max(Math.abs(x),Math.abs(z)), lateral=Math.min(Math.abs(x),Math.abs(z));
  if(lateral<=LAKE.bridge&&axis<=LAKE.approach){
    return LAKE.deck*clamp01((LAKE.approach-axis)/(LAKE.approach-LAKE.edge));
  }
  if(r<LAKE.outer)return LAKE.bed;
  if(Math.abs(x-NORTH.x)<=NORTH.halfWidth && z>=NORTH.backRamp && z<=NORTH.frontRamp){
    return NORTH.top*Math.min(1,(z-NORTH.backRamp)/(NORTH.back-NORTH.backRamp),(NORTH.frontRamp-z)/(NORTH.frontRamp-NORTH.front));
  }
  return CHANNELS.some(box=>inside(x,z,box))?BED:0;
}

// 涨潮时拒绝从干燥支撑面跨入熔岩，已被淹没的角色仍能在原区域内移动并撤出。
function lavaRegion(x,z,height,flooded) {
  const r2=x*x+z*z;
  if(r2>LAKE.inner**2&&r2<LAKE.outer**2 && Math.min(Math.abs(x),Math.abs(z))>LAKE.bridge) return 0;
  if(!flooded || height<BED+.025)return -1;
  for(let i=0;i<CHANNELS.length;i++){
    if(!inside(x,z,CHANNELS[i]))continue;
    if(i===0 && Math.abs(x-NORTH.x)<=NORTH.halfWidth && z>=NORTH.back && z<=NORTH.front) return -1;
    return i+1;
  }
  return -1;
}
function blockedLava(x,z,level) {
  return lavaRegion(x,z,level.tide?.height??LAKE.base,level.tide?.flooded??false);
}
function canEnter(body,x,z,_y,level) {
  const next=blockedLava(x,z,level);
  return next<0 || next===blockedLava(body.x,body.z,level);
}
function lavaColorShader(THREE, width, length, annulus=false) {
  return new THREE.ShaderMaterial({
    fog:false,
    uniforms:{tick:{value:0},extents:{value:new THREE.Vector2(width,length)},ring:{value:annulus?1:0},heat:{value:1}},
    vertexShader:`
      varying vec2 surface; varying float depth;
      void main(){
        surface=uv;
        vec4 v=modelViewMatrix*vec4(position,1.0);
        depth=-v.z;
        gl_Position=projectionMatrix*v;
      }
    `,
    fragmentShader:`
      uniform float tick,ring,heat;
      uniform vec2 extents;
      varying vec2 surface; varying float depth;
      vec2 hash(vec2 p){
        return fract(sin(vec2(dot(p,vec2(124.6,311.7)),dot(p,vec2(269.5,183.3))))*43758.54);
      }
      void main(){
        vec2 p=(surface-.5)*extents;
        float radius=length(p);
        if(ring>.5 && (radius<5.045 || radius>12.725))discard;
        vec2 q=p*.61+vec2(tick*.15,-tick*.083);
        q+=vec2(sin(p.y*.43+tick*.62),cos(p.x*.42-tick*.53))*.33;
        vec2 tile=floor(q),f=fract(q);
        float a=10.0,b=10.0;
        for(int ix=-1;ix<=1;ix++)for(int iy=-1;iy<=1;iy++){
          vec2 o=vec2(float(ix),float(iy));
          vec2 cell=o+hash(tile+o)-f; float d=dot(cell,cell);
          if(d<a){b=a;a=d;}else if(d<b){b=d;}
        }
        float seam=pow(1.0-clamp((b-a)*1.68,0.0,1.0),3.3);
        float stream=.5+.5*sin(p.x*1.30+p.y*.69+tick*1.2);
        float crust=pow(clamp(a*.74,0.0,1.0),1.1);
        vec3 darker=vec3(.31,.018,.013)+vec3(.67,.10,.009)*crust;
        vec3 hot=vec3(3.4,.69,.045)+stream*vec3(1.0,.67,.041);
        vec3 glow=mix(darker,hot,seam*.87)*heat;
        if(ring>.5) glow+=vec3(.71,.16,.013)*exp(-min(abs(radius-5.1),abs(radius-12.6))*2.1);
        float fog=1.0-exp(-pow(max(0.0,depth)*.012,2.0));
        gl_FragColor=vec4(mix(glow,vec3(.13,.035,.026),fog*.71),1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function buildMap({THREE,scene,GRID,level,StaticBatches,shapes,canvasTexture,seededRandom,brighter}) {
  const random=seededRandom(520707), tau=2*Math.PI;
  const basalt=canvasTexture(192,128,(ctx,w,h)=>{
    ctx.fillStyle='#544342';ctx.fillRect(0,0,w,h);
    for(let r=0;r<6;r++)for(let i=-1;i<6;i++){
      const x=i*40+(r%2)*20,y=r*22,v=Math.round(62+random()*25);
      ctx.fillStyle='rgb('+[v+15,v+4,v+2].join(',')+')';ctx.fillRect(x+1,y+1,38,19.8);
      ctx.fillStyle='#a7826d5a';ctx.fillRect(x+2,y+1,37,1.1);
      ctx.fillStyle='#261b218b';ctx.fillRect(x+1,y+20,38,1.5);
    }
    for(let i=0;i<3600;i++){
      ctx.fillStyle=random()>.5?'#b2977870':'#22202b62';ctx.fillRect(random()*w,random()*h,.4+random()*3,.3+random()*2);
    }
  },true);
  const ash=canvasTexture(256,256,(ctx,w,h)=>{
    ctx.fillStyle='#5b4543';ctx.fillRect(0,0,w,h);
    for(let i=0;i<8800;i++){
      ctx.fillStyle=random()>.49?'#b48b6b3c':'#221c294f';ctx.fillRect(random()*w,random()*h,.6+random()*3.1,.6+random()*2.1);
    }
    for(let j=0;j<32;j++){
      ctx.beginPath();
      for(let x=0;x<=w;x+=5){
        const y=j*h/32+Math.sin(x*.018+j*.63)*3.1+Math.sin(x*.037+j*.24)*1.49;
        if(x)ctx.lineTo(x,y);else ctx.moveTo(x,y);
      }
      ctx.strokeStyle=j%2?'#70575775':'#58414a58';ctx.lineWidth=.47+random()*.83;ctx.stroke();
    }
  },true);
  const materials={
    ash:new THREE.MeshLambertMaterial({map:ash,color:0xa99796}),
    basalt:new THREE.MeshLambertMaterial({map:basalt,color:0x9c8780}),
    stone:new THREE.MeshLambertMaterial({color:0xa38980}),
    dark:new THREE.MeshLambertMaterial({color:0x64525a}),
    obsidian:new THREE.MeshLambertMaterial({color:0x494452,emissive:0x18121b,emissiveIntensity:.53}),
    bronze:new THREE.MeshLambertMaterial({color:0xa28c6c}),
    light:new THREE.MeshBasicMaterial(),
  };
  const geom={...shapes,
    rock:new THREE.IcosahedronGeometry(.65,0),
    point:new THREE.ConeGeometry(.50,1,5),
    disk:new THREE.CylinderGeometry(.50,.50,1,64),
    bowl:new THREE.CylinderGeometry(.50,.30,1,9),
  };
  const kit=new StaticBatches(materials,geom);
  const add=(...args)=>kit.add(...args);
  const box=(m,...args)=>kit.add('box',m,...args);
  const solid=(m,x,z,w,d,low,high,tint,climb=false)=>{
    box(m,x,(low+high)/2,z,w,high-low,d,tint);
    return level.box(x,z,w,d,low,high,climb);
  };
  const ember=brighter(0xff701e,2.36), gold=brighter(0xffbb63,2.25), dim=brighter(0xe55118,1.6);
  const lights=[], vents=[];
  function brazier(x,y,z,energy=24) {
    add('bowl','bronze',x,y-.16,z,.68,.30,.68,0xa48961);
    add('point','light',x,y+.12,z,.27,.60,.27,ember,0,.1,.13);
    add('point','light',x-.046,y+.02,z,.14,.40,.15,gold,0,.17,-.22);
    const light=new THREE.PointLight(0xff722e,energy,11,2);
    light.position.set(x,y+.29,z);scene.add(light);lights.push({light,energy});
  }
  function pillar(x,z,h,tint=0x9d8477) {
    solid('stone',x,z,1.25,1.25,0,.22,0xa88e7d,true);
    solid('basalt',x,z,.79,.78,.22,h,tint);
    box('bronze',x,h-.17,z,.87,.23,.86,0xa47d51);
    box('stone',x,h+.017,z,1.04,.158,1.02,0xb19b87);
  }
  function ramp(a,b,w,ha,hb,axis,center,material=materials.stone){
    const vertices=[],uv=[];
    for(const [point,side] of [[0,-1],[0,1],[1,-1],[1,-1],[0,1],[1,1]]){
      const d=point?b:a,y=point?hb:ha, lateral=center+side*w/2;
      vertices.push(axis==='x'?d:lateral,y+.007,axis==='x'?lateral:d);
      uv.push(point,(side+1)/2);
    }
    const geometry=new THREE.BufferGeometry();
    const index=axis==='x' ? (b>a?[0,1,2,3,4,5]:[0,2,1,3,5,4]) : (b>a?[0,2,1,3,5,4]:[0,1,2,3,4,5]);
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geometry.setIndex(index);geometry.computeVertexNormals();
    scene.add(new THREE.Mesh(geometry,material));
  }
  function lake(x,z) {
    level.gate.set(x,LAKE.deck,z);
    level.bossAnchor.set(x,0,z+14.6);
    level.bossSpawn.set(x+4.75,0,z+15.4);
    add('disk','basalt',x,(LAKE.deck-.65)/2,z,LAKE.inner*2,LAKE.deck+.65,LAKE.inner*2,0xa38c84);
    add('disk','stone',x,LAKE.deck+.009,z,LAKE.inner*1.94,.022,LAKE.inner*1.94,0x9b8982);
    for(let j=0;j<24;j++){
      const a=j/24*tau, d=4.47;
      box('bronze',x+Math.cos(a)*d,LAKE.deck+.029,z+Math.sin(a)*d,.71,.045,.108,0xab8759,-a);
      if(j%3===0)box('light',x+Math.cos(a)*d,LAKE.deck+.056,z+Math.sin(a)*d,.23,.028,.095,dim,-a);
    }
    for(const axis of ['x','z'])for(const sign of [-1,1]){
      const avg=sign*(LAKE.inner+LAKE.edge)/2, width=LAKE.bridge*2;
      box('basalt',axis==='x'?avg:0,(LAKE.deck-.85)/2,axis==='z'?avg:0,
        axis==='x'?LAKE.edge-LAKE.inner+.28:width,LAKE.deck+.85,axis==='z'?LAKE.edge-LAKE.inner+.28:width,0xa58d89);
      ramp(LAKE.edge*sign,LAKE.approach*sign,width,LAKE.deck,0,axis,0);
      for(let n=0;n<8;n++){
        const at=sign*(5.57+n*.90);
        box('stone',axis==='x'?at:0,LAKE.deck+.017,axis==='z'?at:0,
          axis==='x'?.40:width-.21,.021,axis==='z'?.40:width-.21,0xa18a7d);
      }
      for(const edge of [-1,1]){
        const at=sign*7.92, side=edge*(LAKE.bridge-.11);
        box('obsidian',axis==='x'?at:side,LAKE.deck+.115,axis==='z'?at:side,
          axis==='x'?4.36:.15,.22,axis==='z'?4.36:.15,0x6b5b60);
      }
    }
    for(const side of [-1,1]){
      add('point','obsidian',x+side*2.35,LAKE.deck+1.02,z+.16,.86,2.27,.71,0x706470,0,0,side*-.25);
      box('light',x+side*2.21,LAKE.deck+.68,z+.41,.065,.70,.056,ember,0,0,side*-.19);
    }
    brazier(0,1.12,11.9,23);
  }

  function foundry(x,z) {
    const hx=6.3,hz=5.4;
    // 主工作间的三面开口相连，可以从工坊穿过去。
    function split(axis,fixed,center,half,opening){
      for(const dir of [-1,1]){
        const len=half-opening, anchor=center+dir*(opening+half)/2;
        solid('basalt',axis==='x'?anchor:fixed,axis==='x'?fixed:anchor,
          axis==='x'?len:.47,axis==='x'?.47:len,0,3.25,0x9b8276);
      }
      solid('basalt',axis==='x'?center:fixed,axis==='x'?fixed:center,
        axis==='x'?opening*2:.53,axis==='x'?.53:opening*2,2.36,3.25,0xb09987);
    }
    split('z',x-hx,z,hz,1.65);split('z',x+hx,z,hz,1.65);
    split('x',z+hz,x,hx,1.45);
    solid('basalt',x,z-hz,hx*2,.49,0,3.25,0x92766e);
    solid('obsidian',x,z,13.2,11.22,3.26,3.61,0x836d72);
    box('basalt',x,3.70,z,12.95,.22,10.99,0x9c8376);
    for(const side of [-1,1]){
      solid('dark',x+side*3.18,z-3.62,2.66,1.19,0,1.52,0x8a7374);
      box('light',x+side*3.17,1.07,z-3.00,1.60,.58,.07,ember);
      box('bronze',x+side*3.17,1.57,z-3.63,2.69,.16,1.25,0xaf7857);
      box('obsidian',x+side*3.19,3.92,z-3.81,.63,1.02,.72,0x837379);
    }
    solid('obsidian',x+2.84,z+2.80,1.06,.72,0,.67,0x71636b);
    box('bronze',x+2.84,.74,z+2.80,1.64,.15,.80,0x7c686f);
    add('point','dark',x+3.69,.737,z+2.80,.49,.53,.51,0x7b6868,0,0,-Math.PI/2);
    for(let i=0;i<4;i++)box('bronze',x-3.0+i*.23,.14,z+3.42,.10,.25,.70,0xa58463,0,.22);
    brazier(x-3.2,1.27,z-2.86,29);
    brazier(x+3.2,1.27,z-2.87,26);
    box('bronze',x,2.89,z+5.69,3.43,.22,.075,0x9d7f55);
  }

  function walls(x,z) {
    for(const d of [-1,1]){
      const zz=z+d*6.35;
      for(const arm of [-1,1]){
        solid('basalt',x+arm*3.83,zz,4.44,1.24,0,2.34,0x9a7c75);
        for(let j=0;j<3;j++)box('obsidian',x+arm*3.83-1.42+j*1.38,2.57,zz,.75,.49,1.22,0x807079);
      }
      for(const side of [-1,1]){
        const xx=x+side*6.62;
        solid('obsidian',xx,zz,2.63,2.64,0,4.39,0x90797c);
        box('basalt',xx,4.36,zz,3.16,.35,3.12,0x9d8580);
        for(const e of [-1,1]){
          box('obsidian',xx+e*1.15,4.79,zz,.71,.57,3.07,0x8f7a80);
          box('light',xx+e*1.34,3.73,zz,.048,.29,.15,dim);
        }
      }
    }
    for(const d of [-1,1])pillar(x+d*5.28,z,2.34,0x836f70);
    brazier(x+2.7,1.48,z+1.9,22);
  }

  function northBridge(x,z) {
    const width=NORTH.halfWidth*2;
    box('basalt',x,(NORTH.top-.34)/2,(NORTH.back+NORTH.front)/2,width,NORTH.top+.34,NORTH.front-NORTH.back+.04,0x928282);
    ramp(NORTH.backRamp,NORTH.back,width,0,NORTH.top,'z',x);
    ramp(NORTH.front,NORTH.frontRamp,width,NORTH.top,0,'z',x);
    for(const edge of [-1,1]){
      box('obsidian',x+edge*(NORTH.halfWidth-.08),NORTH.top+.12,z,.13,.21,4.98,0x75656b);
      box('light',x+edge*1.16,NORTH.top+.018,z-1.79,.14,.038,.18,ember);
    }
    for(const side of [-1,1])pillar(x+side*2.11,NORTH.frontRamp+.77,1.91,0x857374);
    brazier(-2.74,.87,NORTH.backRamp-1.32,18);
  }

  function entry(x,z) {
    for(const side of [-1,1]){
      solid('basalt',x+side*2.66,z,1.37,2.33,0,3.67,0xa58a7e);
      box('bronze',x+side*2.55,2.05,z-.65,.09,3.33,.14,0xab855e);
      for(let j=0;j<4;j++){
        const at=z-2.9-j*.67;
        box('dark',x+side*1.64,1.55-j*.37,at,.082,.088,.92,0x9a8b78,0,.08*side);
      }
    }
    solid('basalt',x,z,6.65,1.76,2.59,3.74,0x9b847b);
    box('bronze',x,3.17,z-.93,4.92,.22,.095,0xa98254);
    box('dark',x,.044,z-1.8,3.6,.090,4.55,0x8d7470);
    for(let j=0;j<8;j++)box('bronze',x,.096,z-3.92+j*.55,3.42,.024,.11,0x9c8063);
    level.spawn.set(x,0,z-4.42);
    brazier(x-2.22,1.51,z-1.43,20);
  }

  for(let row=0;row<GRID.rows;row++)for(let column=0;column<GRID.columns;column++){
    const x=GRID.x(column),z=GRID.z(row),mark=GRID.cells[row][column];
    if(mark==='#'){
      const h=2.55+random()*2.73;
      solid('dark',x,z,GRID.cell+.028,GRID.cell+.028,0,h,0x8f7778);
      add('rock','obsidian',x+(random()-.5)*1.30,h-.14,z,3.76,1.44+random()*2.79,3.08,0x8d777a,random()*tau,random()*.34,random()*.29);
    }else if(mark==='R'){
      add('rock','dark',x,.40,z,1.4+random()*.82,.76+random()*.63,1.52,0x86747a,random()*tau);
      level.box(x,z,1.37,1.17,0,.76);
    }else if(mark==='B'){
      solid('basalt',x,z,2.51,.69,0,.94,0x997e71);
      box('stone',x,.965,z,2.60,.16,.74,0x9f8c80);
    }else if(mark==='V'){
      add('rock','obsidian',x,.14,z,1.17,.40,1.18,0x7e6c75,random()*tau);
      box('light',x,.048,z,.53,.04,.13,dim,random()*tau);
      vents.push([x,z]);
    }else if(mark==='O')lake(x,z);
    else if(mark==='F')foundry(x,z);
    else if(mark==='W')walls(x,z);
    else if(mark==='N')northBridge(x,z);
    else if(mark==='S')entry(x,z);
  }

  // 上层铺地在岩浆湖与低沟处开孔，低处另有实际地面与沟壁。
  const masks=CHANNELS.map(r=>`(rim.x>${r.x0.toFixed(3)} && rim.x<${r.x1.toFixed(3)} && rim.y>${r.z0.toFixed(3)} && rim.y<${r.z1.toFixed(3)})`).join(' || ');
  const surfaceMaterial=materials.ash.clone();
  surfaceMaterial.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec2 rim;\n'+shader.vertexShader.replace('#include <worldpos_vertex>',
      '#include <worldpos_vertex>\n rim=(modelMatrix*vec4(transformed,1.0)).xz;');
    shader.fragmentShader='varying vec2 rim;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>',`
      #include <clipping_planes_fragment>
      float rr=dot(rim,rim);
      if((rr>${LAKE.inner**2} && rr<${LAKE.outer**2}) || ${masks}) discard;
    `);
  };
  function flat(x,y,z,w,d,m){
    const g=new THREE.PlaneGeometry(w,d);
    const uv=g.attributes.uv;
    for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*w/6.2,uv.getY(i)*d/6.2);
    const mesh=new THREE.Mesh(g,m);mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);scene.add(mesh);
  }
  flat(0,0,0,90,90,surfaceMaterial);
  flat(0,LAKE.bed,0,LAKE.outer*2,LAKE.outer*2,materials.ash);
  for(const r of CHANNELS){
    const x=(r.x0+r.x1)/2,z=(r.z0+r.z1)/2,w=r.x1-r.x0,d=r.z1-r.z0;
    flat(x,BED,z,w,d,materials.ash);
    for(const side of [-1,1]){
      box('dark',x+side*w/2,BED/2,z,.08,-BED,d,0x79696e);
      box('dark',x,BED/2,z+side*d/2,w,-BED,.08,0x79696e);
    }
  }
  for(let i=0;i<66;i++){
    const a=i/66*tau+random()*.11,r=47+random()*34,h=6.6+random()*17;
    add('rock','dark',Math.cos(a)*r,h*.34-1,Math.sin(a)*r,
      7+random()*15,h,7+random()*15,0x716370,a,random()*.57,random()*.37);
  }
  for(let i=0;i<205;i++){
    const x=(random()-.5)*84,z=(random()-.5)*84;
    if(Math.hypot(x,z)<16.2||groundHeight(x,z)!==0||(Math.abs(x)<7 && z>18))continue;
    if(level.blocked(x,z,0,.17,.20))continue;
    add('rock','dark',x,.023,z,.17+random()*.43,.10+random()*.23,.17+random()*.52,0x8f7676,random()*tau);
  }
  kit.flush();
  const ambient=new THREE.HemisphereLight(0xeebba5,0x897484,1.66);
  const sky=new THREE.DirectionalLight(0xffa68a,1.62);sky.position.set(23,26,-38);
  const gateLight=new THREE.PointLight(0xff6c22,61,19,2);gateLight.position.set(0,3.26,0);
  scene.add(ambient,sky,gateLight);
  return {lights,gateLight,vents};
}

function createEncounter({CONFIG: settings,level,sound}) {
  const tune=settings.tide;
  const status={title:'',detail:'',remaining:0};
  const tide={
    phase:'calm',height:LAKE.base,flooded:false,status:null,wave:0,nextBurn:0,
    get rifleTide(){return (this.height-LAKE.base)/(tune.peak-LAKE.base);},
    reset(){
      if(this.flooded)level.terrainChanged();
      this.phase='calm';this.height=LAKE.base;this.flooded=false;this.status=null;this.wave=0;this.nextBurn=0;
    },
    update(game){
      const t=game.time, cycle=Math.floor(t/tune.period), elapsed=t-cycle*tune.period;
      const crest=tune.rise+tune.hold, close=crest+tune.retreat;
      let phase='calm', height=LAKE.base;
      if(cycle>0 && elapsed<close){
        if(elapsed<tune.rise){
          phase='rise';
          height=LAKE.base+(tune.peak-LAKE.base)*smooth(elapsed/tune.rise);
        }else if(elapsed<crest){
          phase='high';height=tune.peak;
        }else{
          phase='retreat';
          height=tune.peak+(LAKE.base-tune.peak)*smooth((elapsed-crest)/tune.retreat);
        }
      }else if(tune.period-elapsed<=tune.warning)phase='warning';
      if(phase!==this.phase){
        if(phase==='warning'){
          sound.tone(118,56,.56,.33,'triangle');
          game.ui.notify('岩浆潮汐预警，避开低处沟道',2.6);
        }else if(phase==='rise'){
          sound.hiss(2.35,680,88,.38);
          game.ui.notify('岩浆开始上涨，沿高路撤离',2.4);
        }else if(phase==='calm'&&this.phase==='retreat'){
          game.ui.notify('岩浆已退去，低洼通道恢复',2.2);
        }
      }
      const flooded=height>=BED+.025;
      if(flooded!==this.flooded)level.terrainChanged();
      this.phase=phase;this.height=height;this.flooded=flooded;this.wave=cycle;
      const p=game.player;
      const region=lavaRegion(p.x,p.z,height,flooded);
      const scorching=region>=0&&p.y<=height+.07&&!game.blast;
      if(scorching&&t>=this.nextBurn){
        if(p.hurt(tune.damage,game,.30)){
          this.nextBurn=t+tune.tick;
          sound.hiss(.23,1250,310,.20);
        }
      }
      if(phase==='warning'){
        status.title='岩浆潮汐预警';status.remaining=tune.period-elapsed;
        status.detail='低沟即将被淹，沿环湖主路转移';
      }else if(phase==='rise'||phase==='high'){
        status.title=phase==='rise'?'岩浆正在上涨':'岩浆高水位';
        status.remaining=crest-elapsed;
        status.detail=scorching?'持续灼伤，立刻撤向高处':'避开低沟，环湖主路与高桥可通行';
      }else if(phase==='retreat'){
        status.title='岩浆退潮';status.remaining=close-elapsed;
        status.detail=scorching?'持续灼伤，向高地撤离':flooded?'等待低沟露出':'低处通道恢复';
      }
      this.status=phase==='calm'?null:status;
    },
  };
  level.tide=tide;
  return tide;
}

function createEnvironment({THREE,scene,camera,composer,CONFIG: settings,mapData,seededRandom,dynamicMesh,setInstance,updateMesh,brighter}) {
  const random=seededRandom(471772);
  function lava(x,z,w,d,ring,depth){
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,d),lavaColorShader(THREE,w,d,ring));
    mesh.rotation.x=-Math.PI/2;mesh.position.set(x,depth,z);
    scene.add(mesh);
    return mesh;
  }
  const lake=lava(0,0,LAKE.outer*2+.02,LAKE.outer*2+.02,true,LAKE.base);
  const pools=CHANNELS.map(r=>{
    const m=lava((r.x0+r.x1)/2,(r.z0+r.z1)/2,r.x1-r.x0,r.z1-r.z0,false,BED);
    m.visible=false;
    return m;
  });
  const flame=new THREE.ConeGeometry(.28,.72,6);
  const groundFire=dynamicMesh(flame,new THREE.MeshBasicMaterial({
    transparent:true,depthWrite:false,opacity:.71,blending:THREE.AdditiveBlending,
  }),settings.effects.pools*5);
  const fireTint=[brighter(0xf16928,1.7),brighter(0xffaf5a,1.95)];
  const sky=new THREE.Mesh(new THREE.SphereGeometry(121,32,19),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,
    vertexShader:`
      varying vec3 ray;
      void main(){
        vec4 p=modelMatrix*vec4(position,1.0);
        ray=p.xyz-cameraPosition;gl_Position=projectionMatrix*viewMatrix*p;
      }
    `,
    fragmentShader:`
      varying vec3 ray;
      void main(){
        vec3 d=normalize(ray);
        float h=clamp(d.y+.10,0.0,1.0);
        float right=pow(max(0.0,dot(d,normalize(vec3(.44,.04,-.85)))),5.0);
        float veil=pow(.5+.5*sin(d.x*9.0+d.y*37.0+sin(d.z*11.0)*1.9),3.0);
        vec3 lower=mix(vec3(.22,.044,.035),vec3(.42,.097,.049),right);
        vec3 shade=mix(lower,vec3(.042,.026,.050),pow(h,.59));
        shade+=vec3(.086,.032,.027)*veil*(1.0-h)*right;
        gl_FragColor=vec4(shade,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }));
  sky.renderOrder=-25;sky.frustumCulled=false;scene.add(sky);

  const data=new Float32Array(settings.graphics.embers*3);
  for(let i=0;i<data.length;i++)data[i]=random();
  const sparks=new THREE.Points(new THREE.BufferGeometry(),new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,
    uniforms:{tick:{value:0},force:{value:0}},
    vertexShader:`
      uniform float tick,force;
      varying float alpha,hue;
      void main(){
        vec3 s=position,c=cameraPosition;
        float span=52.0;
        vec3 p=vec3(
          mod(s.x*span+tick*(.68+s.y*1.98)-c.x,span)+c.x-span*.5,
          mod(s.y*10.2+tick*(.46+s.z*1.53+force*.69),10.2)+.05,
          mod(s.z*span+tick*(.31+s.x*.44)-c.z,span)+c.z-span*.5
        );
        p.x+=sin(tick*1.2+s.y*17.0)*.64;
        vec4 view=modelViewMatrix*vec4(p,1.0);
        float fade=smoothstep(.60,2.0,-view.z)*(1.0-smoothstep(21.0,28.0,-view.z));
        hue=step(.61,s.z);
        alpha=fade*(.28+s.x*.54+hue*.10);
        gl_PointSize=clamp((3.4+s.y*7.7+hue*5.0)/max(-view.z,1.0),1.2,6.4);
        gl_Position=projectionMatrix*view;
      }
    `,
    fragmentShader:`
      varying float alpha,hue;
      void main(){
        vec2 p=gl_PointCoord-.5;
        float seed=1.0-smoothstep(.11,.5,length(vec2(p.x*.86,p.y*1.24)));
        vec3 color=mix(vec3(.76,.64,.58),vec3(1.0,.46,.14),hue);
        gl_FragColor=vec4(color,alpha*seed);
      }
    `,
  }));
  sparks.geometry.setAttribute('position',new THREE.BufferAttribute(data,3));
  sparks.frustumCulled=false;scene.add(sparks);

  const ventPos=new Float32Array(mapData.vents.length*44*3);
  const ventOrigins=new Float32Array(mapData.vents.length*44*2);
  for(const [i,[x,z]] of mapData.vents.entries()) for(let j=0;j<44;j++){
    const index=i*44+j;
    ventPos.set([random(),random(),random()],index*3);
    ventOrigins.set([x,z],index*2);
  }
  const vents=new THREE.Points(new THREE.BufferGeometry(),new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{tick:{value:0},force:{value:0}},
    vertexShader:`
      attribute vec2 origin;
      uniform float tick,force;
      varying float alpha;
      void main(){
        vec3 s=position;
        float a=6.28318*s.x+tick*.77, age=fract(s.y+tick*(.27+s.z*.19));
        float r=.13+age*(.91+s.x);
        vec3 p=vec3(origin.x+cos(a)*r,age*(2.9+s.x*1.24+force*.94),origin.y+sin(a)*r);
        vec4 view=modelViewMatrix*vec4(p,1.0);
        alpha=(1.0-age)*smoothstep(.75,2.2,-view.z)*(1.0-smoothstep(25.0,41.0,-view.z))*.58;
        gl_PointSize=clamp(24.0/max(-view.z,1.7)+2.0*age,1.0,6.0);
        gl_Position=projectionMatrix*view;
      }
    `,
    fragmentShader:'varying float alpha; void main(){float e=1.0-smoothstep(.14,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(.94,.42,.19,alpha*e);}',
  }));
  vents.geometry.setAttribute('position',new THREE.BufferAttribute(ventPos,3));
  vents.geometry.setAttribute('origin',new THREE.BufferAttribute(ventOrigins,2));
  vents.frustumCulled=false;scene.add(vents);

  // 热浪只扰动岩浆附近的画面，系统偏好减少动态效果时关闭这层可选变形。
  const heat=new ShaderPass({
    uniforms:{tDiffuse:{value:null},tick:{value:0},amount:{value:0},focus:{value:new THREE.Vector2(.5,.39)}},
    vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`
      uniform sampler2D tDiffuse;
      uniform float tick,amount;
      uniform vec2 focus;
      varying vec2 p;
      void main(){
        vec4 c=texture2D(tDiffuse,p);
        vec2 shape=(p-focus)*vec2(2.8,5.4);
        float local=exp(-dot(shape,shape))*smoothstep(focus.y-.13,focus.y+.07,p.y);
        float warm=clamp((c.r-c.b)*.76+.34,0.0,1.0);
        float wriggle=sin(p.y*120.0+p.x*35.0-tick*5.6) * cos(p.y*39.0-p.x*24.0+tick*1.4);
        float taper=smoothstep(.03,.10,p.x)*(1.0-smoothstep(.90,.97,p.x));
        vec2 offset=vec2(wriggle,sin(p.x*106.0+p.y*44.0+tick*2.7)*.17)*amount*local*warm*taper;
        gl_FragColor=texture2D(tDiffuse,p+offset);
      }
    `,
  });
  composer.insertPass(heat,1);
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  const target=new THREE.Vector3(),direction=new THREE.Vector3();
  return {
    update(t,playing,game){
      const tide=game.encounter,height=tide?.height??LAKE.base,force=clamp01((height-LAKE.base)/(settings.tide.peak-LAKE.base));
      lake.position.y=height;lake.material.uniforms.tick.value=t;
      for(const m of pools){
        m.visible=tide?.flooded===true;
        m.position.y=height;
        m.material.uniforms.tick.value=t;
      }
      for(const [i,{light,energy}] of mapData.lights.entries()){
        light.intensity=energy*(1+Math.sin(t*3.4+i*2.9)*.12+Math.sin(t*7.9+i)*.055);
      }
      mapData.gateLight.intensity=61+Math.sin(t*2.51)*9+game.blast*(1-game.blast)*330+force*12;
      for(const particles of [sparks,vents]){
        particles.material.uniforms.tick.value=reduce.matches?t*.48:t;
        particles.material.uniforms.force.value=force;
      }
      let visible=0;
      for(const patch of game.projectiles.puddles){
        if(patch.life<=0)continue;
        const energy=clamp01(patch.life/.70);
        for(let i=0;i<5;i++){
          const a=i*2.39996+.19*Math.sin(t*2.6+i),r=.36+i*.13;
          const wave=1+.21*Math.sin(t*9+i*2.7);
          setInstance(groundFire,visible++,patch.pos.x+Math.cos(a)*r,patch.pos.y+.16*energy,patch.pos.z+Math.sin(a)*r,
            energy*.67,energy*.57*wave,energy*.67,fireTint[i%2],a,.18,Math.sin(a)*.21);
        }
      }
      updateMesh(groundFire,visible);
      target.set(0,.18,0);
      direction.subVectors(target,camera.position);
      const distance=direction.length();
      camera.getWorldDirection(target);
      const front=target.dot(direction)>0;
      heat.enabled=front&&!reduce.matches&&distance<48;
      if(heat.enabled){
        target.set(0,.18,0).project(camera);
        heat.uniforms.focus.value.set(.5+target.x*.5,.5+target.y*.5);
        heat.uniforms.tick.value=t;
        heat.uniforms.amount.value=settings.graphics.heat*clamp01((48-distance)/26)*(1+force*.28);
      }
    },
  };
}

function createPortal({THREE,scene,level,brighter,dynamicMesh,setInstance,updateMesh,seededRandom}) {
  const root=new THREE.Group();root.position.copy(level.gate);scene.add(root);
  const pillar=new THREE.Mesh(new THREE.CylinderGeometry(.37,.98,10.5,28,1,true),new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    uniforms:{tick:{value:0},ready:{value:0},blast:{value:0}},
    vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`
      uniform float tick,ready,blast;
      varying vec2 p;
      void main(){
        float ray=pow(max(0.0,sin(p.x*105.0+sin(p.y*15.0-tick*2.0)*.92)),7.0);
        float glint=pow(max(0.0,sin(p.y*44.0-tick*7.3)),12.0);
        float end=pow(1.0-p.y,.86)*smoothstep(.0,.026,p.y);
        vec3 shade=mix(vec3(2.3,.33,.028),vec3(2.4,1.14,.22),ready+ray*.24);
        gl_FragColor=vec4(shade*(1.0+blast*3.0),(.31+ray*.61+glint*.18)*end*(1.0-blast));
      }
    `,
  }));
  pillar.position.y=5.18;root.add(pillar);
  const seals=new THREE.Group();root.add(seals);
  const rock=new THREE.IcosahedronGeometry(1,0), shell=new THREE.MeshLambertMaterial({
    color:0x413341,emissive:0x3c1c22,emissiveIntensity:.66,flatShading:true,
  });
  for(let i=0;i<11;i++){
    const a=i*2.39996,r=1.22+(i%3)*.25,h=1.31+(i%5)*.45;
    const shard=new THREE.Mesh(rock,shell);
    shard.position.set(Math.cos(a)*r,h*.47,Math.sin(a)*r);
    shard.scale.set(.39+(i%4)*.10,h*.63,.42+(i%3)*.14);
    shard.rotation.set(Math.sin(a)*.23,a,Math.cos(a)*.32);
    seals.add(shard);
  }
  const rings=[];
  for(let i=0;i<4;i++){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1.10+i*.15,.029,6,48,Math.PI*(1.65+i*.09)),new THREE.MeshBasicMaterial({
      color:brighter(i%2?0xff9b3a:0xff6627,2.5),
    }));
    ring.position.y=.28+i*.68;root.add(ring);rings.push(ring);
  }
  const shock=[];
  for(const [i,y] of [.16,-LAKE.deck+.13].entries()){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1,.035,7,76),new THREE.MeshBasicMaterial({
      color:brighter(i?0xff5c22:0xffbc65,2.58),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    }));
    ring.position.y=y;ring.rotation.x=-Math.PI/2;root.add(ring);shock.push(ring);
  }
  const flare=new THREE.Mesh(new THREE.ConeGeometry(1.5,1,24,1,true),new THREE.MeshBasicMaterial({
    color:brighter(0xff9226,1.72),transparent:true,depthWrite:false,opacity:.36,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
  }));
  root.add(flare);
  const random=seededRandom(423075), particles=[];
  for(let i=0;i<116;i++){
    particles.push({a:random()*Math.PI*2,reach:3.4+random()*19.4,height:3.6+random()*10.6,size:.08+random()*.25,
      spin:random()*11.0,color:brighter(i%4?0xff8a2d:0xffd791,1.2+random()*1.4)});
  }
  const sprays=dynamicMesh(new THREE.OctahedronGeometry(1,0),new THREE.MeshBasicMaterial({
    transparent:true,opacity:.84,depthWrite:false,
  }),particles.length);
  return {
    update(t,ready,blast){
      const u=pillar.material.uniforms;
      u.tick.value=t;u.ready.value=Number(ready);u.blast.value=blast;
      pillar.rotation.y=t*.18;pillar.visible=blast<.94;
      seals.visible=blast<.12;
      for(const [i,ring] of rings.entries()){
        ring.visible=blast<.75;
        ring.rotation.set(-Math.PI/2+Math.sin(t*.69+i)*.17,.16*i,t*(i%2?-.51:.62)+i*1.8);
        ring.scale.setScalar(1+blast*(2.0+i));
      }
      for(const [i,ring] of shock.entries()){
        const step=Math.max(0,blast-i*.12);
        ring.visible=step>0&&blast<1;
        ring.material.opacity=(1-blast)*.9;
        ring.scale.setScalar(1.3+step*(i?38:22));
      }
      const height=1+Math.sin(blast*Math.PI)*14.0;
      flare.visible=blast>0&&blast<.91;
      flare.position.y=height*.48;flare.scale.set(.65+blast*3.4,height,.65+blast*3.4);
      flare.material.opacity=(1-blast)*.43;
      let count=0;
      if(blast>0&&blast<1)for(const p of particles){
        const r=1.2+p.reach*blast,y=.53+p.height*4*blast*(1-blast)-blast*3.5;
        if(y<-.22)continue;
        setInstance(sprays,count++,level.gate.x+Math.cos(p.a)*r,level.gate.y+y,level.gate.z+Math.sin(p.a)*r,
          p.size*.59,p.size*(1.9-blast),p.size*.62,p.color,p.a+p.spin*blast,blast*p.spin,.28);
      }
      sprays.material.opacity=(1-blast)*.84;updateMesh(sprays,count);
    },
  };
}

function lavaModel(type,{THREE,shapes,mergeGeometries},broken=false){
  const body=[],lit=[],matrix=new THREE.Object3D();
  const unit=new THREE.IcosahedronGeometry(1,0);
  const spike=new THREE.ConeGeometry(.5,1,5), joint=new THREE.CylinderGeometry(.39,.50,1,6);
  function addSolid(destination,shape,color,x,y,z,w,h,d,pitch=0,yaw=0,roll=0){
    const g=shape.index?shape.toNonIndexed():shape.clone();
    matrix.position.set(x,y,z);matrix.scale.set(w,h,d);matrix.rotation.set(pitch,yaw,roll,'YXZ');matrix.updateMatrix();
    g.applyMatrix4(matrix.matrix);
    const rgb=new THREE.Color(color),paint=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<paint.length;i+=3){paint[i]=rgb.r;paint[i+1]=rgb.g;paint[i+2]=rgb.b;}
    g.setAttribute('color',new THREE.BufferAttribute(paint,3));
    destination.push(g);
  }
  const rock=(...args)=>addSolid(body,unit,...args);
  const plate=(...args)=>addSolid(body,shapes.box,...args);
  const point=(...args)=>addSolid(body,spike,...args);
  const limb=(...args)=>addSolid(body,joint,...args);
  const coal=(...args)=>addSolid(lit,unit,...args);
  const dark=0x4c3e47,slate=0x655461,iron=0x78545a,skin=0x7b473c,rust=0x9d6048,glow=0xff8c54;
  if(type===0){
    rock(skin,0,.44,-.13,.32,.20,.56);
    rock(rust,0,.56,.27,.32,.24,.28);
    rock(dark,0,.49,.54,.22,.15,.27);
    for(let i=0;i<4;i++)point(iron,0,.64-i*.027,.01-i*.20,.106,.18-i*.026,.14,-.62);
    limb(skin,0,.40,-.59,.16,.40,.18,-1.09,0,.1);
    point(rust,.04,.53,-.89,.12,.35,.13,-1,0,-.40);
    for(const d of [-1,1]){
      limb(skin,d*.28,.23,.27,.13,.37,.14,.18,0,d*-.62);
      limb(dark,d*.25,.21,-.40,.14,.34,.14,-.42,0,d*-.58);
      plate(iron,d*.35,.074,.36,.172,.10,.21,.14,0,d*.10);
      coal(glow,d*.15,.652,.481,.054,.036,.048);
    }
  }else if(type===1){
    rock(dark,0,1.11,-.12,.68,.74,.66);
    rock(slate,0,1.28,.23,.63,.47,.55);
    rock(iron,0,1.00,.63,.45,.29,.36);
    for(const d of [-1,1]){
      rock(slate,d*.49,1.29,.14,.44,.48,.45);
      point(dark,d*.44,1.59,-.19,.31,.62,.34,-.30,0,d*-.36);
      rock(dark,d*.58,.79,.46,.34,.41,.36,.14);
      plate(slate,d*.52,.31,.56,.43,.31,.43,-.23,0,d*.14);
      limb(iron,d*.28,.34,-.45,.31,.59,.34,-.23,0,d*-.17);
      point(iron,d*.34,1.01,.82,.17,.40,.18,1.10,0,d*-.27);
      coal(0xffa76a,d*.185,1.17,.865,.066,.056,.052);
    }
  }else if(type===2){
    rock(skin,0,.70,-.19,.43,.41,.45);
    rock(iron,0,1.22,.09,.38,.42,.31,.31);
    rock(dark,0,1.38,.40,.33,.23,.29);
    rock(rust,0,1.21,.61,.27,.14,.23);
    for(const d of [-1,1]){
      rock(iron,d*.33,.73,-.32,.25,.37,.28);
      point(rust,d*.28,1.52,-.33,.22,.57,.27,-.49,0,d*-.37);
      limb(skin,d*.33,.34,.05,.22,.60,.21,.30,0,d*-.34);
      coal(0xffc283,d*.16,1.44,.62,.065,.047,.039);
      coal(0xff803d,d*.35,.91,-.44,.105,.14,.08);
    }
    coal(0xff9f56,0,1.27,.79,.105,.058,.056);
  }else{
    rock(broken?0x9f5141:dark,0,1.69,-.15,.84,.91,.68);
    rock(broken?0xa45949:slate,0,2.46,.11,.86,.67,.68);
    rock(slate,0,2.95,.57,.56,.49,.48);
    rock(skin,0,2.86,.96,.41,.20,.32);
    for(const d of [-1,1]){
      limb(dark,d*.44,.65,-.32,.37,1.04,.42,-.24,0,d*.11);
      plate(slate,d*.47,.22,.02,.49,.38,.51,0,d*.18);
      rock(iron,d*.82,2.45,.15,.47,.51,.46);
      rock(broken?skin:dark,d*.92,1.61,.32,.35,.69,.39,.24,0,d*.12);
      plate(iron,d*1.01,1.10,.56,.43,.38,.48,-.15);
      if(!broken){
        rock(slate,d*.74,2.79,.24,.59,.56,.57,.14,0,d*.23);
        point(0x7f666e,d*.56,3.46,.15,.49,.95,.44,-.23,0,d*-.39);
        plate(dark,d*.45,2.45,.66,.30,.69,.26,.17,0,d*.24);
        rock(slate,d*.92,1.63,.54,.46,.46,.45);
      }else{
        point(rust,d*.53,3.17,-.14,.28,.54,.28,-.39,0,d*-.22);
        coal(0xff8e45,d*.42,2.44,.70,.13,.35,.11,.10,0,d*.31);
        coal(0xff8566,d*.81,1.62,.64,.11,.22,.10);
      }
      coal(broken?0xffca86:glow,d*.218,3.063,.99,.093,.062,.055);
    }
    coal(broken?0xffb776:0xe16537,0,2.10,.69,.26,.40,.16);
  }
  const models=[mergeGeometries(body),mergeGeometries(lit)];
  for(const g of [...body,...lit,unit,spike,joint])g.dispose();
  return models;
}

export default {
  story:{type:'regions',sectors:[
    {name:'吊桥灰原',at:[-8,25],entries:[[-14,19],[0,18]]},
    {name:'东侧铸造工坊',at:[17,10],entries:[[24,6],[12,14]]},
  ]},
  weaponSkin: 'ember-fortress',
  pageTitle:'烬火要塞 | 第七关',
  grid:MAP_GRID,
  config:CONFIG,
  loot:LANDMARKS.loot,
  ammo:LANDMARKS.ammo,
  background:0x402326,
  fog:0x47272b,
  palette:{projectile:0xff873b,ichor:0x934f41,spark:0xffc55c,core:0xffa14a,rare:0xffcf82,blast:0xe16e31},
  buildMap,
  createEnvironment,
  createPortal,
  createEncounter,
  buildBeastModel:lavaModel,
  buildRageModel(helpers){return lavaModel(3,helpers,true);},
  onBossRage(beast,game,{THREE,brighter}){
    const point=new THREE.Vector3(beast.x,beast.y+2.68,beast.z);
    game.effects.spray(point,brighter(0xc88069,1.35),60,9.7,.139,'spark');
    game.sound.hiss(.44,2200,220,.30);
  },
  portal:{width:1.83,depth:1.30,verticalRange:.42,useRadius:4.10},
  terrain:{ground:groundHeight,canEnter,routeOpen:(x,z,level)=>blockedLava(x,z,level)<0},
  area(x,z,level,y){
    const r=Math.hypot(x,z);
    if(r<LAKE.inner && y>LAKE.deck-.2)return '湖心炎印石台';
    if(z>32&&Math.abs(x-level.spawn.x)<8)return '南侧要塞吊桥入口';
    if(z>17)return '南侧灰烬平原';
    if(z<-18.7) return '北侧火山口石桥';
    if(x>17)return '东侧铸造工坊';
    if(x<-17)return '西侧黑曜石城墙';
    return '环湖主路';
  },
  minimap:{
    tiles:{'#':'#8a6d68',B:'#745b5c',R:'#6d5b5d',V:'#bf735c'},
    beforeTiles({ctx,px,pz,size}){
      ctx.fillStyle='#33252b';ctx.fillRect(0,0,size,size);
      ctx.fillStyle='#a44635';
      ctx.beginPath();ctx.arc(px(0),pz(0),LAKE.outer*size/90,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#6f5e60';
      ctx.beginPath();ctx.arc(px(0),pz(0),LAKE.inner*size/90,0,Math.PI*2);ctx.fill();
      ctx.fillRect(px(-LAKE.edge),pz(-LAKE.bridge),2*LAKE.edge*size/90,2*LAKE.bridge*size/90);
      ctx.fillRect(px(-LAKE.bridge),pz(-LAKE.edge),2*LAKE.bridge*size/90,2*LAKE.edge*size/90);
      ctx.fillStyle='#6e5657';ctx.fillRect(px(18.9),pz(-9),12.6*size/90,10.8*size/90);
    },
    overlay({ctx,px,pz,game}){
      const tide=game.encounter;
      if(!tide||(!tide.flooded&&tide.phase!=='warning'))return;
      ctx.fillStyle=tide.flooded?'#ff684762':'#ffe08c30';
      ctx.strokeStyle=tide.flooded?'#ff925c':'#efc775';
      ctx.lineWidth=.96;
      for(const r of CHANNELS){
        const x=px(r.x0),z=pz(r.z0),w=px(r.x1)-x,d=pz(r.z1)-z;
        ctx.fillRect(x,z,w,d);ctx.strokeRect(x,z,w,d);
      }
      ctx.fillStyle='#9c8381';
      ctx.fillRect(px(-NORTH.halfWidth),pz(NORTH.back),px(NORTH.halfWidth)-px(-NORTH.halfWidth),pz(NORTH.front)-pz(NORTH.back));
    },
  },
  text:{
    tag:'第七关 / 火山口远古要塞',
    title:'烬火要塞',
    enter:'进入要塞',
    brief:'穿过吊桥进入火山口，击败熔岩巨像。带着炎心走上高桥，在湖心引爆红金光柱。听到潮汐预警时，先撤离低沟。',
    bossName:'熔岩巨像',
    keyItem:'炎心',
    portal:'湖心炎印',
    safe:'要塞吊桥安全区',
    objective:'清除凶兽，击败熔岩巨像并取得炎心',
    exitObjective:'沿高桥抵达湖心，在红金光柱前按 F 引爆',
    detonating:'黑曜石封印瓦解，岩浆冲击波扩散中',
    rage:'岩壳崩裂，熔岩巨像召唤蜥群',
  },
};
