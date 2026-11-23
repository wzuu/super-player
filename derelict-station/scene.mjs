const CONFIG = {
  map: { cell: 4, fog: .0095, navCell: 1.25 },
  graphics: { maxPixelRatio: 1.16, bloomScale: .69, debris: 1450 },
  audio: { ambient: { filter: 'lowpass', frequency: 165, q: .84, activeGain: .12, pauseGain: .067 } },
  beasts: {
    types: [
      { hp: 61, radius: .39, height: 1.11 },
      { hp: 175, radius: .62, height: 2.04 },
      { hp: 104, radius: .48, height: 1.85, projectileSpeed: 13.5, hazardLife: 5.4 },
      { hp: 850, radius: 1.01, height: 3.88, summonCount: 7 },
    ],
  },
  pressure: {
    first: [50, 64], calm: [55, 78], warning: 8, duration: 120,
    damage: 8, tick: .40, playerPull: 6.65, beastPull: 11.4, eggDelay: 1.15,
  },
};

// 25 列乘 15 行。H 居住舱，A 农业舱，C 货运舱，B 指挥舱，R 反应堆，D 停靠舱，M 检修通道。
const MAP_GRID = [
  '#########################',
  '#.....M...........M.....#',
  '#...V...............V...#',
  '#.......................#',
  '#.....H...........A.....#',
  '#..........T............#',
  '#.......................#',
  '#...........R...........#',
  '#.......................#',
  '#............T..........#',
  '#.....C...........B.....#',
  '#.......................#',
  '#...V.......D.......V...#',
  '#.....M...........M.....#',
  '#########################',
];
const SECTORS = [
  { tag:'H', name:'居住舱', side:-1, x0:-49.8,x1:-13.8,z0:-18.1,z1:-5.0,z:-11.5 },
  { tag:'A', name:'农业舱', side: 1, x0:13.8,x1:49.8,z0:-18.1,z1:-5.0,z:-11.5 },
  { tag:'C', name:'货运舱', side:-1, x0:-49.8,x1:-13.8,z0:5.0,z1:18.1,z:11.5 },
  { tag:'B', name:'指挥舱', side: 1, x0:13.8,x1:49.8,z0:5.0,z1:18.1,z:11.5 },
];
const REACTOR_X=4.65;
const SHELL = { wall:48.30, ceiling:4.26, windowHalf:1.92, ejection:48.94 };
const GALLERY = { y:4.22, x:5.2, approach:12.6, z:-8.0, rampHalf:1.95, z0:-10.15, z1:-2.35 };
const LANDMARKS = {
  loot: [
    [-4.1,23.5,'航天徽章',170],[-26.1,-13.2,'个人数据板',220],[-22.1,-8.4,'备用氧气罐',180],
    [25.8,-14.8,'种子低温盒',210],[30.4,-9.1,'光谱培养记录',265],
    [-25.5,14.3,'能量电池',265],[-33.2,9.9,'钛合金校准件',235],
    [26.7,11.2,'指挥导航模块',325,'top'],[3.48,-6.7,'跃迁稳定器',400,'top'],[12.8,2.4,'冷却泵芯',210],
  ],
  ammo: [[2.9,23.8],[-23.2,23.2],[26,22.0],[-37.9,-11.5],[-29.0,-6.2],[41.0,-11.6],[25.5,-5.5],[22.1,6.0],[-19.7,11.6],[0,-22.3]],
};
const inside=(x,z,r)=>x>=r.x0&&x<=r.x1&&z>=r.z0&&z<=r.z1;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function stationRamp(x,z) {
  const ax=Math.abs(x);
  if(ax<GALLERY.x||ax>GALLERY.approach||Math.abs(z-GALLERY.z)>GALLERY.rampHalf)return 0;
  return GALLERY.y*(GALLERY.approach-ax)/(GALLERY.approach-GALLERY.x);
}

function buildMap({THREE,scene,GRID,level,StaticBatches,shapes,canvasTexture,seededRandom,brighter}) {
  const rng=seededRandom(803274);
  const tau=Math.PI*2;
  const wallTexture=canvasTexture(256,128,(ctx,w,h)=>{
    ctx.fillStyle='#adb6c2';ctx.fillRect(0,0,w,h);
    for(let segment=0;segment<4;segment++){
      const x=segment*64;
      ctx.fillStyle=segment%2?'#8997a9':'#a1adba';ctx.fillRect(x+1,0,62,h);
      ctx.strokeStyle='#55667492';ctx.lineWidth=1.6;ctx.strokeRect(x+5,9,54,h-17);
      ctx.fillStyle='#48586d';ctx.fillRect(x+3,h-14,58,3);
      ctx.fillStyle='#d6e4e9';ctx.fillRect(x+8,13,48,1);
      for(const at of [x+7,x+55])for(const y of [16,h-18]){
        ctx.beginPath();ctx.arc(at,y,1.8,0,tau);ctx.fillStyle='#617281';ctx.fill();
      }
    }
    for(let i=0;i<3100;i++){
      ctx.fillStyle=rng()>.51?'#dde1e836':'#344b5b38';
      ctx.fillRect(rng()*w,rng()*h,.6+rng()*2.1,.5+rng()*2.5);
    }
  },true);
  const floorTexture=canvasTexture(256,256,(ctx,w,h)=>{
    ctx.fillStyle='#657888';ctx.fillRect(0,0,w,h);
    for(let i=0;i<4;i++)for(let j=0;j<4;j++){
      const x=i*w/4,y=j*h/4;
      ctx.fillStyle=(i+j)%2?'#778999':'#6a8193';ctx.fillRect(x+1,y+1,w/4-2,h/4-2);
      ctx.strokeStyle='#3c5160';ctx.lineWidth=1.2;ctx.strokeRect(x+3,y+3,w/4-6,h/4-6);
      for(let p=0;p<3;p++){
        ctx.fillStyle='#5e758c';ctx.fillRect(x+6+p*5,y+55,2.9,3.6);
      }
    }
    for(let i=0;i<4900;i++){
      ctx.fillStyle=rng()>.48?'#bfdae140':'#2736474e';
      ctx.fillRect(rng()*w,rng()*h,.5+rng()*2.2,.3+rng()*1.9);
    }
  },true);
  const material={
    deck:new THREE.MeshLambertMaterial({map:floorTexture,color:0xb2bccb}),
    hull:new THREE.MeshLambertMaterial({map:wallTexture,color:0xb7c5d2}),
    divider:new THREE.MeshLambertMaterial({map:wallTexture,color:0x9faeaf}),
    ridge:new THREE.MeshLambertMaterial({color:0x818e9e}),
    dark:new THREE.MeshLambertMaterial({color:0x536576}),
    leaf:new THREE.MeshLambertMaterial({color:0xa3bbb7,side:THREE.DoubleSide}),
    shell:new THREE.MeshLambertMaterial({color:0x526d73}),
    light:new THREE.MeshBasicMaterial(),
  };
  const leaf=new THREE.BufferGeometry();
  leaf.setAttribute('position',new THREE.Float32BufferAttribute([
    0,0,0,-.14,.34,.25, .14,.34,.21, -.14,.34,.25,0,.66,.47,.14,.34,.21,
    0,.66,.47,-.14,.34,.25,-.09,.80,.65,.14,.34,.21,0,.66,.47,.12,.80,.60,
    -.09,.80,.65,.12,.80,.60,.01,.91,.92,
  ],3));
  leaf.computeVertexNormals();
  const geometries={...shapes,leaf,
    prism:new THREE.IcosahedronGeometry(.65,0),
    pipe:new THREE.CylinderGeometry(.50,.50,1,10),
    bracket:new THREE.ConeGeometry(.50,1,5),
  };
  const kit=new StaticBatches(material,geometries);
  const add=(...a)=>kit.add(...a),box=(m,...a)=>kit.add('box',m,...a);
  const solid=(m,x,z,w,d,y0,y1,tint,climb=false)=>{
    box(m,x,(y0+y1)/2,z,w,y1-y0,d,tint);
    return level.box(x,z,w,d,y0,y1,climb);
  };
  const cyan=brighter(0x6fcee9,2.15), white=brighter(0xb7daed,2.25), amber=brighter(0xff9b5e,2.05);
  const red=brighter(0xf35259,2.36), violet=brighter(0x93a2ff,2.30);
  const viewMaterial=new THREE.MeshBasicMaterial({
    color:0x9db8e4,transparent:true,opacity:.13,depthWrite:false,side:THREE.DoubleSide,
  });
  const fixtures=[],bulkheads=[];
  function sign(text,x,y,z,w,yaw=0) {
    const image=canvasTexture(256,64,(ctx,ww,h)=>{
      ctx.fillStyle='#152839';ctx.fillRect(0,0,ww,h);
      ctx.fillStyle='#597e8e';ctx.fillRect(10,h-10,ww-20,2);
      ctx.fillStyle='#d9f1f4';ctx.font='700 30px PingFang SC, sans-serif';
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,ww*.5,h*.47,ww-24);
    });
    const m=new THREE.Mesh(shapes.plane,new THREE.MeshBasicMaterial({ map:image,color:new THREE.Color(1.18,1.18,1.18) }));
    m.scale.set(w,w/4,1);m.position.set(x,y,z);m.rotation.y=yaw;scene.add(m);
  }
  function pointLight(color,intensity,x,y,z,distance=13){
    const light=new THREE.PointLight(color,intensity,distance,2);
    light.position.set(x,y,z);scene.add(light);return light;
  }
  function lamp(x,y,z,color=white) {
    box('dark',x,y+.073,z,1.33,.15,.36,0x7193a0);
    box('light',x,y,z,1.12,.038,.24,color);
  }
  // 舷窗仍有完整碰撞体。四个可破裂窗口使用独立的可开关碰撞盒。
  function hullPanel(axis,fixed,from,to) {
    const width=to-from;
    if(width<.04)return;
    const mid=(from+to)/2;
    const x=axis==='x'?mid:fixed,z=axis==='x'?fixed:mid;
    const w=axis==='x'?width:.38,d=axis==='x'?.38:width;
    solid('hull',x,z,w,d,0,1.36,0x9facba);
    solid('hull',x,z,w,d,3.30,SHELL.ceiling+.05,0xa4b2c2);
    level.box(x,z,w,d,1.34,3.32);
    box('ridge',x,1.384,z,axis==='x'?width:.49,.10,axis==='x'?.49:width,0x8d9aab);
    box('light',x,3.19,z,axis==='x'?width:.029,.036,axis==='x'?.029:width,cyan);
    const pane=new THREE.Mesh(shapes.plane,viewMaterial);
    pane.position.set(x,2.32,z);pane.scale.set(width,1.96,1);
    pane.rotation.y=axis==='x'?0:Math.PI/2;scene.add(pane);
    for(let j=Math.ceil(from/5.3);j*5.3<to-.13;j++){
      const a=j*5.3;
      box('ridge',axis==='x'?a:fixed,2.31,axis==='x'?fixed:a,axis==='x'?.12:.48,1.91,axis==='x'?.48:.12,0x8b9bad);
    }
  }
  function rupturePanel(data) {
    const x=SHELL.wall*data.side,z=data.z,width=SHELL.windowHalf*2;
    const collider=level.box(x,z,.38,width,0,SHELL.ceiling);
    const intact=new THREE.Group();intact.position.set(x,0,z);scene.add(intact);
    const panel=new THREE.Mesh(shapes.plane,new THREE.MeshBasicMaterial({
      color:0x95badf,side:THREE.DoubleSide,transparent:true,opacity:.25,depthWrite:false,
    }));
    panel.rotation.y=Math.PI/2;panel.position.y=2.21;panel.scale.set(width,4.12,1);intact.add(panel);
    const insert=new THREE.Mesh(shapes.box,material.hull);
    insert.position.y=.55;insert.scale.set(.18,1.10,width-.18);intact.add(insert);
    for(const edge of [-1,1]){
      box('ridge',x,2.21,z+edge*SHELL.windowHalf,.56,SHELL.ceiling,.19,0xa4b3c5);
      box('light',x-data.side*.23,3.42,z+edge*1.78,.045,.52,.09,red);
    }
    box('ridge',x,4.16,z,.57,.18,width+.24,0xa6b4c1);
    const beacon=pointLight(0xff454a,0,x-.66*data.side,3.43,z,12.0);
    bulkheads.push({ data,collider,intact,panel,beacon });
  }
  hullPanel('x',-28.22,-48.4,48.4);hullPanel('x',28.22,-48.4,48.4);
  for(const side of [-1,1]){
    let begin=-28.23;
    for(const hatch of SECTORS.filter(s=>s.side===side)){
      hullPanel('z',side*SHELL.wall,begin,hatch.z-SHELL.windowHalf);
      rupturePanel(hatch);
      begin=hatch.z+SHELL.windowHalf;
    }
    hullPanel('z',side*SHELL.wall,begin,28.23);
    for(const z of [-27.9,27.9])solid('ridge',side*48.05,z,.82,.93,0,4.47,0x9eacb9);
  }

  function roomShell(zone) {
    const x0=zone.side<0?-36:14,x1=zone.side<0?-14:36;
    const z0=zone.z0,z1=zone.z1,x=(x0+x1)/2,z=zone.z;
    function partition(axis,fixed,from,to,door,half){
      for(const [a,b] of [[from,door-half],[door+half,to]]){
        const mid=(a+b)/2,len=b-a;
        solid('divider',axis==='x'?mid:fixed,axis==='x'?fixed:mid,
          axis==='x'?len:.30,axis==='x'?.30:len,0,4.13,0x8ca0ae);
        box('dark',axis==='x'?mid:fixed,1.06,axis==='x'?fixed:mid,axis==='x'?len:.343,.19,axis==='x'?.343:len,0x6c8598);
      }
      solid('hull',axis==='x'?door:fixed,axis==='x'?fixed:door,
        axis==='x'?half*2:.36,axis==='x'?.36:half*2,2.49,4.13,0xa9b7c3);
      box('light',axis==='x'?door:fixed,2.445,axis==='x'?fixed:door,axis==='x'?half*1.7:.48,.065,axis==='x'?.48:half*1.7,cyan);
    }
    partition('z',x0,z0,z1,z,1.64);
    partition('z',x1,z0,z1,z,1.64);
    partition('x',z0,x0,x1,x,1.85);
    if(zone.tag==='B'){
      hullPanel('x',z1,x0,x-1.85);hullPanel('x',z1,x+1.85,x1);
      solid('hull',x,z1,3.70,.32,2.49,4.13,0xa9b7c3);
    }else partition('x',z1,x0,x1,x,1.85);
    for(const d of [-1,1]){
      lamp(x+d*5.25,4.196,z-2.8);
      lamp(x+d*5.25,4.196,z+2.8);
    }
    sign(zone.name,x,2.92,z0-.176,3.58,Math.PI);
    return [x,z];
  }

  function quarters(x,z) {
    for(const d of [-1,1]){
      solid('divider',x+d*6.35,z-2.05,7.76,.22,0,4.12,0xa0aeb6);
      for(const t of [-1,1]){
        const xx=x+d*5.25,zz=z+t*3.78;
        solid('dark',xx,zz,2.40,1.05,0,.58,0x7f99a4);
        box('ridge',xx,.63,zz,2.31,.13,.98,0x8da5bc);
        box('hull',xx+d*.82,.72,zz,.50,.09,.82,0xb2bac3);
        box('light',xx,1.71,zz-t*.44,.62,.052,.045,cyan);
        solid('ridge',x+d*8.83,zz+.72,.64,.72,0,1.79,0x869ca9);
      }
    }
  }
  function agriculture(x,z) {
    for(const dx of [-6.3,-2.94,2.94,6.4])for(const dz of [-3.82,3.78]){
      solid('shell',x+dx,z+dz,2.23,1.36,0,.62,0x86a8a1);
      box('dark',x+dx,.64,z+dz,2.17,.07,1.31,0x607d78);
      for(let k=0;k<12;k++){
        const xx=x+dx+(rng()-.5)*1.91,zz=z+dz+(rng()-.5)*1.06,h=.88+rng()*1.55;
        add('leaf','leaf',xx,.63,zz,.85+rng()*.51,h,.90+rng()*.71,
          [0x78a99f,0x478275,0x7ba28d,0x537d78][k%4],rng()*tau,(rng()-.5)*.34,(rng()-.5)*.29);
        if(k%5===0)add('prism','light',xx,.82+h*.72,zz+.22,.115,.14,.11,cyan);
      }
    }
    pointLight(0x76d6d2,30,x,3.55,z,11.0);
  }
  function cargo(x,z) {
    for(const side of [-1,1])for(const [offset,dx] of [-7.5,-3.97,3.82,7.51].entries()){
      const zz=z+side*(3.60+offset%2*.34),h=1.44+(offset%3)*.31;
      solid('hull',x+dx,zz,2.66,2.08,0,h,[0x799ba8,0x8f8f99,0xa1a5a1][offset%3]);
      box('dark',x+dx,h*.57,zz+side*1.06,2.44,.40,.060,0x688090);
      for(const edge of [-1,1]){
        box('ridge',x+dx+edge*1.21,h*.53,zz+side*1.085,.065,h*.86,.12,0xa0b2ba);
        box('light',x+dx+edge*.86,h*.55,zz+side*1.11,.14,.08,.027,amber);
      }
      if(offset===3)box('ridge',x+dx+.19,h+.23,zz,2.11,.39,1.63,0x8798a9);
    }
  }
  function bridgeRoom(x,z) {
    solid('deck',x,z,18.8,9.76,0,.29,0x91a9bc,true);
    for(const d of [-1,1]){
      solid('dark',x+d*3.88,z+3.78,4.80,.67,.29,1.12,0x7f9bab);
      box('ridge',x+d*3.88,1.13,z+3.79,4.76,.18,.80,0xa3b1bb,.0,.19);
      for(let j=0;j<3;j++)box('light',x+d*3.88+(j-1)*1.19,1.24,z+3.58,.87,.039,.34,j%2?violet:cyan,0,.19);
    }
    for(const d of [-1,1]){
      box('light',x+d*8.08,.321,z,.16,.042,8.15,cyan);
      box('hull',x+d*8.12,.42,z,1.05,.25,8.3,0x869cac);
    }
    sign('观察窗方向',x,2.97,z+6.67,3.58,0);
    pointLight(0xa3bfff,27,x,3.69,z,12.5);
  }

  function ramp(x0,x1,y0,y1,z,w) {
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute([x0,y0,z-w/2,x0,y0,z+w/2,x1,y1,z-w/2,x1,y1,z+w/2],3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,0,1,1,0,1,1],2));
    g.setIndex([0,1,2,2,1,3]);g.computeVertexNormals();
    scene.add(new THREE.Mesh(g,material.deck));
  }
  function reactor(x,z) {
    const gy=GALLERY.y;
    level.gate.set(x,gy,-5.2);
    level.bossAnchor.set(0,0,9.8);
    level.bossSpawn.set(2.8,0,9.6);
    for(const d of [-1,1]){
      if(d<0)ramp(-GALLERY.approach,-GALLERY.x,0,gy,GALLERY.z,GALLERY.rampHalf*2);
      else ramp(GALLERY.x,GALLERY.approach,gy,0,GALLERY.z,GALLERY.rampHalf*2);
      for(const e of [-1,1]){
        const xx=d*(GALLERY.approach+GALLERY.x)/2,zz=GALLERY.z+e*(GALLERY.rampHalf-.09);
        const length=Math.hypot(GALLERY.approach-GALLERY.x,gy);
        box('ridge',xx,gy*.5+.060,zz,length,.148,.12,0x9eafbf,0,0,-d*Math.atan(gy/(GALLERY.approach-GALLERY.x)));
        box('light',xx,gy*.5+.151,zz,length-.13,.046,.061,cyan,0,0,-d*Math.atan(gy/(GALLERY.approach-GALLERY.x)));
      }
    }
    solid('deck',0,(GALLERY.z0+GALLERY.z1)/2,GALLERY.x*2,GALLERY.z1-GALLERY.z0,gy-.21,gy,0x9aafd0,true);
    for(const d of [-1,1]){
      solid('ridge',d*4.64,-2.7,.34,.41,0,gy-.21,0xa0b5cb);
      box('light',d*4.49,gy+.036,-5.39,.11,.067,3.73,violet);
    }
    add('pipe','dark',REACTOR_X,1.35,4.75,3.46,2.70,3.46,0x8c9bbe);
    level.box(REACTOR_X,4.75,3.50,3.50,0,6.50);
    add('pipe','light',REACTOR_X,3.84,4.75,1.48,4.38,1.48,brighter(0x79c6ec,1.46));
    add('pipe','ridge',REACTOR_X,6.22,4.75,3.11,.65,3.11,0xa0aec2);
    for(let i=0;i<8;i++){
      const a=i/8*tau;
      box('hull',REACTOR_X+Math.sin(a)*1.52,3.45,4.75+Math.cos(a)*1.52,.18,5.18,.22,0x8397b1,a);
      box('light',REACTOR_X+Math.sin(a)*1.39,5.72,4.75+Math.cos(a)*1.39,.12,.49,.12,cyan,a);
    }
    for(const side of [-1,1])for(const d of [-1,1]){
      const xx=side*12.38,zz=d*10.25;
      solid('ridge',xx,zz,.70,.70,0,7.95,0x8399b2);
      box('light',xx,6.35,zz,.145,1.12,.175,cyan);
    }
    lamp(-5.9,7.96,5.5,cyan);lamp(5.9,7.96,5.5,violet);
    pointLight(0x8b93ff,46,0,6.44,-4.1,16.0);
  }

  function dock(x,z){
    const back=z+6.40;
    for(const d of [-1,1]){
      solid('hull',x+d*2.67,back,1.18,1.94,0,3.67,0x9bafc0);
      box('light',x+d*2.22,1.75,back-.98,.13,2.69,.046,cyan);
    }
    solid('hull',x,back,6.38,1.25,2.56,3.78,0x95a9bc);
    box('light',x,2.52,back-.64,4.0,.061,.058,cyan);
    sign('停靠舱',x,3.28,back-.64,3.45);
    level.spawn.set(x,0,z+3.8);
  }

  for(let row=0;row<GRID.rows;row++)for(let column=0;column<GRID.columns;column++){
    const x=GRID.x(column),z=GRID.z(row),mark=GRID.cells[row][column];
    const sector=SECTORS.find(s=>s.tag===mark);
    if(sector){
      const [cx,cz]=roomShell(sector);
      if(mark==='H')quarters(cx,cz);
      if(mark==='A')agriculture(cx,cz);
      if(mark==='C')cargo(cx,cz);
      if(mark==='B')bridgeRoom(cx,cz);
    }else if(mark==='R')reactor(x,z);
    else if(mark==='D')dock(x,z);
    else if(mark==='V'){
      const xx=x+(column<12?-1.28:1.28);
      box('hull',xx,.044,z,1.92,.087,1.18,0x96a7b8);
      for(let t=0;t<6;t++)box('ridge',xx+(t-2.5)*.235,.091,z,.072,.019,.84,0x8397a7);
      box('light',xx,.117,z+.52,.122,.053,.089,amber);
    }else if(mark==='M'){
      for(const d of [-1,1])box('light',x+d*.9,.032,z,.11,.035,1.95,amber);
    }else if(mark==='T'){
      box('light',x,.023,z,1.18,.028,.094,cyan);
    }
  }

  const hallX=13.0,hallZ=11.1,roomCeiling=SHELL.ceiling;
  for(const d of [-1,1]){
    solid('dark',d*(GRID.halfX+hallX)/2,0,GRID.halfX-hallX,60,roomCeiling,roomCeiling+.28,0x778a9c);
    solid('dark',0,d*(GRID.halfZ+hallZ)/2,hallX*2,GRID.halfZ-hallZ,roomCeiling,roomCeiling+.28,0x7c8e9e);
  }
  solid('dark',0,0,hallX*2,hallZ*2,8.06,8.38,0x7a8da5);
  for(const d of [-1,1]){
    for(const z of [12.0,16.40,20.8,25.3]){
      box('ridge',0,4.14,d*z,19.1,.19,.35,0x9eb0c2);
      box('ridge',d*7.8,4.10,z*d,.27,.20,2.40,0x90a5b9);
      box('light',-4.3,4.028,d*z,2.10,.040,.079,cyan);
      box('light',4.3,4.028,d*z,2.10,.040,.079,white);
    }
  }
  const deck=new THREE.PlaneGeometry(100,60),uv=deck.attributes.uv;
  for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*22.2,uv.getY(i)*14.8);
  const ground=new THREE.Mesh(deck,material.deck);
  ground.rotation.x=-Math.PI/2;scene.add(ground);
  // 主环线的定位灯与中央后撤通道标记。
  for(const d of [-1,1]){
    for(let x=-44;x<45;x+=4.60){
      box('light',x,.036,d*20.3,1.37,.038,.069,cyan);
      if(Math.abs(x)>14.4)lamp(x,4.209,d*22,white);
    }
    for(let z=-23;z<=23;z+=4.48){
      box('light',d*39.95,.035,z,.068,.035,1.31,cyan);
      if(Math.abs(z)>2.4)lamp(d*41.4,4.21,z,white);
    }
    for(let z=10;z<=23;z+=2.43)box('light',d*3.0,.028,z,.085,.035,.62,cyan);
    if(d<0)pointLight(0x86b9de,28,d*8.55,3.52,19.3,15.5);
  }
  for(const [x,y,z,turn] of [[-10.4,8.01,-6.9,0],[14.9,4.21,0,1],[-13.6,4.21,0,.8],[5.1,4.21,17.6,0]]){
    const m=new THREE.Mesh(shapes.box,new THREE.MeshBasicMaterial({color:0xffffff}));
    m.position.set(x,y,z);m.scale.set(.92,.065,.11);scene.add(m);fixtures.push({m,turn});
  }
  for(let i=0;i<151;i++){
    const x=(rng()-.5)*90,z=(rng()-.5)*48;
    if(level.blocked(x,z,0,.14,.20)||(Math.abs(x)<5.6&&z>11))continue;
    add('prism','dark',x,.03,z,.13+rng()*.42,.061+rng()*.19,.13+rng()*.45,0x8398a9,rng()*tau);
  }
  kit.flush();
  const ambient=new THREE.HemisphereLight(0xb5ceed,0x526978,1.43);
  const wash=new THREE.DirectionalLight(0x8ea6c8,.84);wash.position.set(-17,36,-32);
  scene.add(ambient,wash);
  level.bulkheads=bulkheads;
  return {bulkheads,fixtures};
}

function beastSurface(beast,player,level,floor,dt) {
  if(beast.type!==0){
    beast.y=Math.max(floor,beast.y-dt*8);
    return;
  }
  const near=Math.hypot(beast.x-player.x,beast.z-player.z);
  const ceiling=Math.abs(beast.x)<12.85&&Math.abs(beast.z)<10.94?8.06:SHELL.ceiling;
  let wall=0;
  // 探针命中真正的舱壁后才开始攀爬。接近玩家时会离开壁面回到攻击高度。
  if(near>4.1&&floor<1.2&&beast.stun<=0){
    const step=beast.radius+.45,y=Math.min(2.76,ceiling-.25);
    if(level.blocked(beast.x-step,beast.z,y,.08,.12))wall=-1;
    else if(level.blocked(beast.x+step,beast.z,y,.08,.12))wall=1;
    else if(level.blocked(beast.x,beast.z-step,y,.08,.12))wall=-1;
    else if(level.blocked(beast.x,beast.z+step,y,.08,.12))wall=1;
    if(wall){
      beast.clinging=true;
      beast.surfaceSide=wall;
    }
  }else beast.clinging=false;
  const ceilingCrawler=beast.id%3!==1;
  if(!ceilingCrawler&&!wall)beast.clinging=false;
  let target=floor,roll=0;
  if(beast.clinging){
    target=ceilingCrawler?ceiling-beast.height-.095:floor+1.34;
    const approaching=clamp((beast.y-1.05)/Math.max(.2,target-1.05),0,1);
    roll=beast.surfaceSide*(ceilingCrawler?Math.PI*(.47+.53*approaching):Math.PI*.49);
  }
  const dz=clamp(target-beast.y,-dt*8.8,dt*5.0);
  const next=Math.max(floor,beast.y+dz);
  if(!level.blocked(beast.x,beast.z,next,beast.radius,beast.height))beast.y=next;
  if(!beast.clinging&&beast.y<=floor+.04)roll=0;
  beast.surfaceRoll+=(roll-beast.surfaceRoll)*Math.min(1,dt*10);
  if(Math.abs(beast.surfaceRoll)<.002)beast.surfaceRoll=0;
}

function createEncounter({CONFIG:setup,level,THREE,brighter,sound,randomRange}) {
  const rules=setup.pressure;
  const readout={title:'',detail:'',remaining:0};
  const point=new THREE.Vector3(), sparks=brighter(0x9dd6ec,1.57), larva=brighter(0xac98f3,1.72);
  const eggs=Array.from({length:14},()=>({active:false,x:0,y:0,z:0,hatch:0}));
  function intact() {
    for(const {collider} of level.bulkheads)collider.active=true;
  }
  function evacuate(body,panel){
    const s=panel.data;
    if(body.x*s.side<=SHELL.wall-.19-body.radius||Math.abs(body.z-s.z)>SHELL.windowHalf+body.radius)return;
    body.x=s.side*(SHELL.wall-.33-body.radius);
  }
  function pull(body,s,speed,dt){
    if(!inside(body.x,body.z,s))return;
    const inner=s.side*body.x<35.45;
    const tx=s.side*(inner?37.60:50.24),tz=s.z;
    const dx=tx-body.x,dz=tz-body.z;
    const dist=Math.max(.06,Math.hypot(dx,dz));
    const vacuum=clamp(1-(SHELL.wall-s.side*body.x)/18,.36,1);
    const travel=Math.min(dist,speed*vacuum*dt);
    level.move(body,travel*dx/dist,travel*dz/dist,.46);
  }
  return {
    phase:'calm',panel:null,previous:-1,opens:0,seals:0,nextDamage:0,ejected:0,status:null,eggs,rules,
    reset(){
      intact();
      this.phase='calm';this.panel=null;this.previous=-1;this.nextDamage=0;this.ejected=0;this.status=null;
      this.opens=randomRange(...rules.first);this.seals=0;
      for(const egg of eggs)egg.active=false;
    },
    stage(x,y,z,game) {
      const egg=eggs.find(o=>!o.active);
      if(!egg)return false;
      egg.active=true;egg.x=x;egg.y=y;egg.z=z;egg.hatch=game.time+rules.eggDelay+randomRange(-.14,.47);
      return true;
    },
    update(game,dt=0) {
      const t=game.time, p=game.player;
      if(this.phase==='calm'&&t>=this.opens-rules.warning){
        const options=level.bulkheads.filter((_,i)=>i!==this.previous);
        this.panel=options[Math.floor(Math.random()*options.length)];
        this.previous=level.bulkheads.indexOf(this.panel);
        this.phase='warning';
        sound.tone(210,135,.56,.21,'triangle');
        game.ui.notify(this.panel.data.name+'失压预警，撤离至环廊',2.8);
      }
      if(this.phase==='warning'&&t>=this.opens){
        this.phase='open';this.seals=this.opens+rules.duration;this.nextDamage=t;
        this.panel.collider.active=false;
        sound.hiss(2.2,2400,220,.47);
        sound.tone(88,25,.87,.42,'triangle');
        game.ui.notify(this.panel.data.name+'舷窗破裂，舱段已失压',2.8);
      }
      if(this.phase==='open'&&t>=this.seals){
        evacuate(p,this.panel);
        for(const b of game.beasts.pool)if(b.active)evacuate(b,this.panel);
        this.panel.collider.active=true;
        game.ui.notify(this.panel.data.name+'自动封闭，压力恢复',2.6);
        sound.tone(155,79,.66,.24,'triangle');
        this.phase='calm';this.panel=null;this.opens=t+randomRange(...rules.calm);
      }
      for(const egg of eggs){
        if(!egg.active||egg.hatch>t||game.beasts.live>=game.beasts.pool.length)continue;
        if(level.blocked(egg.x,egg.z,egg.y,.40,1.13)){egg.active=false;continue;}
        const child=game.beasts.spawn(0,egg.x,egg.z,egg.y);
        if(!child)continue;
        child.alert=5.2;egg.active=false;
        point.set(egg.x,egg.y+.25,egg.z);
        game.effects.spray(point,larva,13,4.4,.076,'mist');
      }
      if(this.phase==='calm'){this.status=null;return;}
      const s=this.panel.data;
      this.status=readout;
      if(this.phase==='warning'){
        readout.title=s.name+'失压预警';readout.remaining=this.opens-t;
        readout.detail='红灯处的舷窗即将破裂，尽快换舱';
        return;
      }
      if(!game.blast){
        pull(p,s,rules.playerPull,dt);
        if(inside(p.x,p.z,s)&&t>=this.nextDamage&&p.hurt(rules.damage,game,.27)){
          this.nextDamage=t+rules.tick;
        }
        if(game.phase!=='play')return;
        for(const b of game.beasts.pool){
          if(!b.active)continue;
          pull(b,s,rules.beastPull*(b.type===3 ? .35 : 1),dt);
          if(s.side*b.x<SHELL.ejection||Math.abs(b.z-s.z)>=SHELL.windowHalf-.12)continue;
          if(!game.beasts.eject(b,game))continue;
          this.ejected++;
          point.set(b.x,b.y+.48,b.z);
          game.effects.spray(point,sparks,12,5.3,.051,'spark');
        }
      }
      readout.title=s.name+'正在失压';readout.remaining=this.seals-t;
      const cleared=this.ejected?'，已清除 '+this.ejected+' 只':'';
      readout.detail=inside(p.x,p.z,s)?'持续掉血，冲向舱门撤离'+cleared:'等待隔离板封闭'+cleared;
    },
  };
}

function mayEnter(body,x) {
  // 母体的体积大于破裂窗口，控制核心始终留在站内。
  return body.type!==3||Math.abs(x)<SHELL.wall-.39;
}

function createEnvironment({THREE,scene,camera,CONFIG:setup,mapData,seededRandom,canvasTexture,brighter,dynamicMesh,setInstance,updateMesh}) {
  const rng=seededRandom(750104),tau=Math.PI*2;
  const stars=new Float32Array(2280*3),starColors=new Float32Array(stars.length);
  for(let i=0;i<2280;i++){
    const a=rng()*tau, y=rng()*2-1,r=110+14*rng(),s=Math.sqrt(1-y*y)*r, value=.23+rng()*.77;
    stars.set([Math.cos(a)*s,y*r,Math.sin(a)*s],i*3);
    starColors.set([value*(.73+rng()*.25),value*(.82+rng()*.17),value],i*3);
  }
  const sky=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({
    vertexColors:true,size:1.18,sizeAttenuation:false,fog:false,
  }));
  sky.geometry.setAttribute('position',new THREE.BufferAttribute(stars,3));
  sky.geometry.setAttribute('color',new THREE.BufferAttribute(starColors,3));
  sky.frustumCulled=false;scene.add(sky);

  const planetEcho=canvasTexture(768,384,(ctx,w,h)=>{
    const band=ctx.createLinearGradient(0,0,0,h);
    for(const [at,c] of [[0,'#617990'],[.15,'#486786'],[.36,'#728fa5'],[.5,'#466d8d'],[.63,'#789ca8'],[.85,'#355269'],[1,'#75949f']])band.addColorStop(at,c);
    ctx.fillStyle=band;ctx.fillRect(0,0,w,h);
    for(let j=0;j<97;j++){
      const y=j*h/96,d=rng()*38,weight=.36+rng()*3.7;
      ctx.beginPath();
      for(let x=0;x<=w;x+=7){
        const v=y+Math.sin(x/w*tau*2.0+d+j*.13)*(1+rng()*2.7)+Math.sin(x/w*tau*6.0+j*.29)*1.12;
        if(x)ctx.lineTo(x,v);else ctx.moveTo(x,v);
      }
      ctx.strokeStyle=j%3?'#b8ccd343':'#2e455b59';ctx.lineWidth=weight;ctx.stroke();
    }
    for(let j=0;j<57;j++){
      const x=rng()*w,y=rng()*h,r=6+rng()*31;
      const blend=ctx.createRadialGradient(x,y,1,x,y,r);
      blend.addColorStop(0,j%2?'#d4e0e04b':'#334b6568');blend.addColorStop(1,'#7495b000');
      ctx.fillStyle=blend;ctx.fillRect(x-r,y-r,r*2,r*2);
    }
  });
  const planet=new THREE.Mesh(new THREE.SphereGeometry(14.2,46,26),new THREE.ShaderMaterial({
    fog:false,
    uniforms:{image:{value:planetEcho}},
    vertexShader:`
      varying vec2 mapUV; varying vec3 localNormal;
      void main(){
        mapUV=uv;localNormal=normalize(mat3(modelMatrix)*normal);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
      }
    `,
    fragmentShader:`
      uniform sampler2D image;
      varying vec2 mapUV; varying vec3 localNormal;
      void main(){
        vec3 tint=texture2D(image,mapUV).rgb;
        float day=clamp(dot(normalize(localNormal),normalize(vec3(-.52,.60,.47))),0.0,1.0);
        vec3 c=tint*(.18+day*1.06)+vec3(.043,.072,.12)*pow(1.0-day,4.0)*day;
        gl_FragColor=vec4(c,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }));
  planet.position.set(10.8,7.3,-69);planet.rotation.set(.22,.27,-.32);scene.add(planet);
  const halo=new THREE.Mesh(new THREE.SphereGeometry(14.36,36,20),new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,
    vertexShader:`
      varying vec3 norm,eye;
      void main(){
        vec4 p=modelViewMatrix*vec4(position,1.0);
        norm=normalize(normalMatrix*normal);eye=normalize(-p.xyz);
        gl_Position=projectionMatrix*p;
      }
    `,
    fragmentShader:`
      varying vec3 norm,eye;
      void main(){
        float edge=pow(1.0-max(0.0,dot(normalize(norm),normalize(eye))),3.8);
        gl_FragColor=vec4(.16,.38,.64,edge*.30);
      }
    `,
  }));
  halo.position.copy(planet.position);scene.add(halo);

  const beads=new Float32Array(setup.graphics.debris*3);
  for(let i=0;i<beads.length;i++)beads[i]=rng();
  const drift=new THREE.Points(new THREE.BufferGeometry(),new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,
    uniforms:{tick:{value:0}},
    vertexShader:`
      uniform float tick;
      varying float alpha;
      void main(){
        vec3 n=position,c=cameraPosition;
        float span=36.0;
        vec3 p=vec3(
          mod(n.x*span+tick*(.15+n.y*.66)-c.x,span)+c.x-span*.5,
          mod(n.y*4.2+tick*(.03+n.z*.14),4.2)+.04,
          mod(n.z*span+tick*(.07+n.x*.18)-c.z,span)+c.z-span*.5
        );
        p.x+=sin(tick*.56+n.z*20.0)*.18;
        vec4 v=viewMatrix*vec4(p,1.0);
        alpha=smoothstep(.47,1.33,-v.z)*(1.0-smoothstep(13.0,19.0,-v.z))*(.20+n.x*.54);
        gl_PointSize=clamp((2.7+n.z*7.1)/max(-v.z,1.0),1.0,4.9);
        gl_Position=projectionMatrix*v;
      }
    `,
    fragmentShader:`
      varying float alpha;
      void main(){
        float f=1.0-smoothstep(.11,.49,length(gl_PointCoord-.5));
        gl_FragColor=vec4(.67,.82,.97,alpha*f);
      }
    `,
  }));
  drift.geometry.setAttribute('position',new THREE.BufferAttribute(beads,3));
  drift.frustumCulled=false;scene.add(drift);

  const ventSeeds=new Float32Array(192*3);
  for(let i=0;i<ventSeeds.length;i++)ventSeeds[i]=rng();
  const vent=new THREE.Points(new THREE.BufferGeometry(),new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{tick:{value:0},side:{value:1},outlet:{value:-11.5}},
    vertexShader:`
      uniform float tick,side,outlet;
      varying float alpha;
      void main(){
        vec3 s=position;
        float age=fract(s.x+tick*(.45+s.y*.31));
        float p=pow(age,1.38);
        vec3 at=vec3(side*(36.3+p*17.6),
          1.94 +(s.y-.5)*2.9*(1.04-.52*p),
          outlet+(s.z-.5)*5.5*(1.0-.72*p)+sin(age*6.0+s.x*23.0)*.25);
        vec4 v=viewMatrix*vec4(at,1.0);
        alpha=smoothstep(.08,.20,age)*(1.0-smoothstep(.86,1.0,age))*.65;
        gl_PointSize=clamp(17.0/max(1.15,-v.z)+s.z*1.1,1.0,6.3);
        gl_Position=projectionMatrix*v;
      }
    `,
    fragmentShader:`
      varying float alpha;
      void main(){
        float a=1.0-smoothstep(.15,.48,length((gl_PointCoord-.5)*vec2(.72,1.74)));
        gl_FragColor=vec4(.63,.83,1.0,alpha*a);
      }
    `,
  }));
  vent.geometry.setAttribute('position',new THREE.BufferAttribute(ventSeeds,3));
  vent.frustumCulled=false;scene.add(vent);

  const crack=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({
    color:brighter(0xacdafa,2.0),transparent:true,opacity:.76,depthWrite:false,
  }));
  const crackVertices=[];
  for(const [y0,z0,y1,z1] of [[3.4,-1.5,2.8,-1.08],[2.8,-1.08,2.6,-.60],[2.6,-.60,2.43,.2],[2.43,.2,2.17,.7],[2.17,.7,2.12,1.40],
    [2.6,-.60,2.23,-.89],[2.23,-.89,1.86,-.81],[2.43,.2,2.85,.52],[2.85,.52,3.15,.69],[2.17,.7,1.59,.67]]){
    crackVertices.push(0,y0,z0,0,y1,z1);
  }
  crack.geometry.setAttribute('position',new THREE.Float32BufferAttribute(crackVertices,3));scene.add(crack);
  const alarm=new THREE.Group(), flares=[];
  for(const d of [-1,1]){
    const m=new THREE.Mesh(new THREE.ConeGeometry(.72,3.45,14,1,true),new THREE.MeshBasicMaterial({
      color:brighter(0xf24b5b,1.54),transparent:true,opacity:.10,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    }));
    m.position.set(d*1.62,-.21,0);m.rotation.z=d*Math.PI*.50;
    alarm.add(m);flares.push(m);
  }
  scene.add(alarm);
  const eggMesh=dynamicMesh(new THREE.SphereGeometry(.48,8,6),new THREE.MeshLambertMaterial({
    emissive:0x48345d,emissiveIntensity:.64,
  }),14);
  const eggTints=[brighter(0x8c95c5,.84),brighter(0xaa84b6,1.09)];
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  return {
    update(t,playing,game){
      const clock=reduce.matches?t*.35:t;
      planet.rotation.y=.27+clock*.058;
      drift.material.uniforms.tick.value=clock;
      const event=game.encounter,panel=event?.panel;
      for(const [i,item] of mapData.bulkheads.entries()){
        const highlighted=panel===item;
        item.intact.visible=item.collider.active!==false;
        const v=highlighted ? .65+.33*Math.sin(clock*3.05+i*.7):0;
        item.beacon.intensity=61*v;
      }
      for(const {m,turn} of mapData.fixtures){
        const power=.68+.22*Math.sin(clock*2.9+turn*8.0)+.11*Math.sin(clock*5.3+turn);
        m.material.color.setRGB(.67*power,1.43*power,1.92*power);
      }
      const active=event?.phase==='open'&&!!panel;
      vent.visible=active;crack.visible=!!panel;alarm.visible=!!panel&&!reduce.matches;
      if(panel){
        const s=panel.data;
        alarm.position.set(s.side*(SHELL.wall-.58),3.62,s.z);
        alarm.rotation.y=clock*1.62;
        flares[0].material.opacity=.093+.016*Math.sin(clock*3.1);
        flares[1].material.opacity=.072+.022*Math.sin(clock*3.1+.9);
        crack.position.set(s.side*(SHELL.wall-.23),0,s.z);
        crack.material.opacity=active ? .58:.85;
        vent.material.uniforms.tick.value=clock;
        vent.material.uniforms.side.value=s.side;
        vent.material.uniforms.outlet.value=s.z;
      }
      let count=0;
      for(const egg of event?.eggs??[]){
        if(!egg.active)continue;
        const elapsed=clamp(1-(egg.hatch-game.time)/event.rules.eggDelay,0,1);
        const beat=1+.07*Math.sin(clock*8+egg.x*.3),size=.35+elapsed*.31;
        setInstance(eggMesh,count++,egg.x,egg.y+.32,egg.z,size*beat,size*1.28,size*beat,eggTints[count%2],.20+egg.x,0,-.18);
      }
      updateMesh(eggMesh,count);
    },
  };
}

function createPortal({THREE,scene,level,brighter,dynamicMesh,setInstance,updateMesh,seededRandom}) {
  const base=new THREE.Group();base.position.copy(level.gate);scene.add(base);
  const aperture=new THREE.Mesh(new THREE.PlaneGeometry(5.4,4.1),new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    uniforms:{tick:{value:0},ready:{value:0},blast:{value:0}},
    vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`
      uniform float tick,ready,blast;
      varying vec2 p;
      void main(){
        vec2 w=p*2.0-1.0;
        float r=length(w),a=atan(w.y,w.x);
        float coil=sin(a*4.0-r*21.0+tick*3.6+sin(a*2.0+r*7.0)*.8);
        float galaxy=pow(max(0.0,coil),8.0);
        float rim=exp(-abs(r-.73-sin(a*5.0+tick*1.7)*.044)*24.0);
        float fade=(1.0-smoothstep(.72,.98,r))*smoothstep(.04,.17,r);
        vec3 tint=mix(vec3(.36,.28,1.39),vec3(.59,.53,1.58),ready);
        gl_FragColor=vec4(tint*(1.0+blast*2.65),(.10+galaxy*.62+rim*.54)*fade*(1.0-blast));
      }
    `,
  }));
  aperture.position.y=1.91;base.add(aperture);
  const rings=[];
  for(let i=0;i<3;i++){
    const m=new THREE.Mesh(new THREE.TorusGeometry(1.57+i*.21,.024+i*.006,6,48,Math.PI*(1.48+i*.15)),
      new THREE.MeshBasicMaterial({color:brighter(i%2?0xa59eff:0x81b2ff,2.12)}));
    m.position.set(0,1.89,-i*.08);base.add(m);rings.push(m);
  }
  const pulse=new THREE.Mesh(new THREE.TorusGeometry(1,.031,7,75),new THREE.MeshBasicMaterial({
    color:brighter(0x9d9eff,2.4),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  }));
  pulse.rotation.x=-Math.PI/2;pulse.position.y=.14;base.add(pulse);
  const rand=seededRandom(441210),pieces=[];
  for(let i=0;i<94;i++)pieces.push({az:rand()*Math.PI*2,r:2.45+rand()*10.5,y:.8+rand()*3.1,w:.034+rand()*.113,
    color:brighter(i%2?0x9b91f6:0x89c3fc,1.25+rand()*1.5)});
  const dust=dynamicMesh(new THREE.OctahedronGeometry(1,0),new THREE.MeshBasicMaterial({transparent:true,depthWrite:false}),pieces.length);
  return {
    update(t,ready,blast){
      const u=aperture.material.uniforms;
      u.tick.value=t;u.ready.value=Number(ready);u.blast.value=blast;
      aperture.rotation.set(Math.sin(t*.52)*.16,Math.sin(t*.48)*.38, t*.10);
      aperture.visible=blast<.88;
      for(const [i,m] of rings.entries()){
        m.rotation.set(Math.sin(t*.99+i)*.24,Math.cos(t*.67+i)*.24,t*(i%2?-.65:.56)+i*2.1);
        m.visible=blast<.80;m.scale.setScalar(1+blast*(2+i));
      }
      pulse.visible=blast>0&&blast<1;
      pulse.scale.setScalar(1+blast*14);
      pulse.material.opacity=(1-blast)*.8;
      let count=0;
      if(blast>0&&blast<1)for(const p of pieces){
        const r=.9+p.r*blast, y=.4+p.y*4*blast*(1-blast)-blast*1.1;
        setInstance(dust,count++,level.gate.x+Math.cos(p.az)*r,level.gate.y+y,level.gate.z+Math.sin(p.az)*r,
          p.w,p.w*.82,p.w*1.5,p.color,p.az+blast*4,p.az*blast,.21);
      }
      dust.material.opacity=1-blast;updateMesh(dust,count);
    },
  };
}

function alienModel(type,{THREE,shapes,mergeGeometries},rage=false){
  const flesh=[],glow=[],m=new THREE.Object3D(),base=new THREE.IcosahedronGeometry(1,0);
  const spike=new THREE.ConeGeometry(.50,1,5),joint=new THREE.CylinderGeometry(.36,.50,1,6);
  function component(target,shape,tint,x,y,z,w,h,d,pitch=0,yaw=0,roll=0){
    const g=shape.index?shape.toNonIndexed():shape.clone();
    m.position.set(x,y,z);m.scale.set(w,h,d);m.rotation.set(pitch,yaw,roll,'YXZ');m.updateMatrix();g.applyMatrix4(m.matrix);
    const color=new THREE.Color(tint),data=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<data.length;i+=3){data[i]=color.r;data[i+1]=color.g;data[i+2]=color.b;}
    g.setAttribute('color',new THREE.BufferAttribute(data,3));target.push(g);
  }
  const skin=(...x)=>component(flesh,base,...x);
  const limb=(...x)=>component(flesh,joint,...x);
  const barb=(...x)=>component(flesh,spike,...x);
  const plate=(...x)=>component(flesh,shapes.box,...x);
  const lum=(...x)=>component(glow,base,...x);
  const dark=0x4f4c64,blue=0x687588,teal=0x547169,bone=0xa6a4a4,purple=0x726478;
  if(type===0){
    skin(dark,0,.32,-.19,.30,.18,.45);
    skin(blue,0,.46,.27,.27,.25,.25);
    barb(purple,0,.47,-.46,.15,.36,.20,-.75);
    for(const d of [-1,1]){
      for(let j=0;j<4;j++){
        const z=.32-j*.19;
        limb(j%2?dark:blue,d*.31,.21,z,.092,.32,.10,.24,0,d*-.86);
        plate(dark,d*.42,.063,z+.028,.10,.075,.17,.26,d*.31,d*.20);
      }
      barb(blue,d*.15,.69,.31,.105,.29,.10,-.13,0,-d*.33);
      barb(bone,d*.12,.40,.57,.092,.21,.083,1.62,0,-d*.32);
      lum(0xaeacf6,d*.13,.53,.46,.049,.033,.042);
    }
  }else if(type===1){
    skin(dark,0,.97,-.18,.63,.68,.64);
    skin(blue,0,1.18,.25,.65,.47,.57);
    skin(purple,0,1.02,.68,.34,.31,.29);
    for(const d of [-1,1]){
      skin(dark,d*.43,1.30,.10,.44,.49,.44);
      barb(blue,d*.46,1.65,-.16,.34,.55,.29,-.33,0,d*-.34);
      limb(purple,d*.49,.72,.42,.39,.76,.43,-.26,0,d*.23);
      plate(dark,d*.61,.34,.59,.32,.25,.41,-.23);
      limb(blue,d*.30,.34,-.46,.27,.64,.31,-.20,0,d*-.16);
      barb(bone,d*.24,1.00,.96,.185,.46,.177,1.08,0,d*-.23);
      lum(0xff9699,d*.175,1.16,.93,.057,.047,.045);
    }
  }else if(type===2){
    skin(teal,0,.78,-.21,.43,.51,.47);
    skin(dark,0,1.25,.12,.34,.35,.34,.24);
    skin(blue,0,1.29,.49,.32,.21,.31);
    skin(teal,0,1.12,.61,.25,.12,.23);
    for(const d of [-1,1]){
      skin(0x6b8d76,d*.36,.93,-.28,.27,.33,.30);
      barb(blue,d*.31,1.48,-.20,.20,.49,.23,-.48,0,d*-.39);
      limb(teal,d*.32,.35,.04,.23,.64,.23,.32,0,d*-.3);
      lum(0xb3fb88,d*.34,.99,-.43,.078,.10,.07);
      lum(0xa5ef9e,d*.149,1.42,.70,.055,.037,.04);
    }
    lum(0x89e67c,0,1.19,.781,.108,.045,.04);
  }else{
    skin(rage?0x826677:dark,0,1.48,-.58,.90,.69,1.08);
    skin(purple,0,2.30,.08,.79,.73,.70);
    skin(blue,0,2.82,.52,.50,.51,.50);
    skin(dark,0,2.63,.86,.45,.25,.38);
    for(const d of [-1,1]){
      for(let j=0;j<3;j++){
        const z=.56-j*.46;
        limb(purple,d*(.68+j*.075),.91,z,.29,1.24,.28,-.11,0,d*-.53);
        barb(blue,d*(.94+j*.074),.38,z+.095,.18,.66,.18,Math.PI,-d*.21,d*.26);
      }
      skin(dark,d*.75,2.35,.14,.37,.45,.35);
      barb(purple,d*.36,3.27,.39,.26,.73,.26,-.33,0,d*-.36);
      barb(bone,d*.22,2.61,1.12,.152,.36,.12,1.40,0,d*.18);
      if(!rage)plate(dark,d*.48,2.43,.59,.30,.65,.25,.08,0,d*.23);
      else lum(0xba91fc,d*.44,2.45,.60,.15,.27,.13,.10,0,d*.30);
      lum(rage?0xc5a9ff:0xb088d6,d*.252,2.97,.91,.09,.075,.054);
      lum(0xbd8fd2,d*.63,1.67,-.72,.12,.14,.13);
    }
    lum(rage?0xb28eff:0x765c91,0,1.94,-1.02,.31,.23,.36);
  }
  const geometries=[mergeGeometries(flesh),mergeGeometries(glow)];
  for(const geo of [...flesh,...glow,base,spike,joint])geo.dispose();
  return geometries;
}

export default {
  weaponSkin: 'derelict-station',
  pageTitle:'失压环站 | 第八关',
  grid:MAP_GRID,
  config:CONFIG,
  loot:LANDMARKS.loot,
  ammo:LANDMARKS.ammo,
  background:0x070c18,
  fog:0x1c2c40,
  palette:{projectile:0xa6ec83,ichor:0x786489,spark:0xd5e1fa,core:0xb0b3ff,rare:0xc8d6ff,blast:0x9e99ff},
  buildMap,
  createEnvironment,
  createEncounter,
  createPortal,
  buildBeastModel:alienModel,
  buildRageModel(helpers){return alienModel(3,helpers,true);},
  beastSurface,
  stageBossSummon(x,y,z,game){return game.encounter.stage(x,y,z,game);},
  portal:{width:1.70,depth:1.20,verticalRange:.48,useRadius:3.85},
  terrain:{ramp:stationRamp,canEnter:mayEnter},
  area(x,z,level,y){
    if(y>GALLERY.y-.2&&Math.abs(x)<GALLERY.x+.2&&z>GALLERY.z0&&z<GALLERY.z1)return '反应堆上层平台';
    if(z>19.0&&Math.abs(x-level.spawn.x)<6.6)return '停靠舱入口';
    const s=SECTORS.find(r=>inside(x,z,r));
    if(s&&Math.abs(x)<36)return s.name;
    if(Math.abs(x)<13&&Math.abs(z)<11.1)return '反应堆大厅';
    if(Math.abs(z)<5.0&&Math.abs(x)>13.0&&Math.abs(x)<37.0)return '横向检修通道';
    return '环形主走廊';
  },
  minimap:{
    beforeTiles({ctx,px,pz,size}){
      ctx.fillStyle='#273648';ctx.fillRect(0,0,size,size);
      ctx.strokeStyle='#8fa9be';ctx.lineWidth=1.15;
      ctx.strokeRect(px(-48.3),pz(-28.22),px(48.3)-px(-48.3),pz(28.22)-pz(-28.22));
      for(const [i,r] of SECTORS.entries()){
        const x0=r.side<0?-36:14,x1=r.side<0?-14:36;
        ctx.fillStyle=['#465061','#376963','#5c5267','#464f77'][i];
        ctx.fillRect(px(x0),pz(r.z0),px(x1)-px(x0),pz(r.z1)-pz(r.z0));
      }
      ctx.fillStyle='#657faa';
      ctx.fillRect(px(-GALLERY.x),pz(GALLERY.z0),px(GALLERY.x)-px(-GALLERY.x),pz(GALLERY.z1)-pz(GALLERY.z0));
      ctx.fillStyle='#7883aa';
      ctx.fillRect(px(REACTOR_X-1.75),pz(3.0),px(REACTOR_X+1.75)-px(REACTOR_X-1.75),pz(6.50)-pz(3.0));
    },
    overlay({ctx,px,pz,game}){
      const event=game.encounter,s=event?.panel?.data;
      if(!s)return;
      ctx.fillStyle=event.phase==='open'?'#f85a7066':'#f2a36d44';
      ctx.strokeStyle=event.phase==='open'?'#ff7886':'#ffbd7c';
      const x=px(s.x0),z=pz(s.z0),w=px(s.x1)-x,d=pz(s.z1)-z;
      ctx.fillRect(x,z,w,d);ctx.strokeRect(x,z,w,d);
      ctx.fillStyle='#ffc8d0';
      ctx.fillRect(px(s.side*SHELL.wall)-1.5,pz(s.z)-2,3,4);
    },
  },
  text:{
    tag:'第八关 / 环形空间站',
    title:'失压环站',
    enter:'进入站体',
    brief:'从停靠舱进入环站，击败寄生母体，带着反应堆控制核心登上反应堆平台。舱段红灯预警时可撤到环廊，也可把虫群引向破裂舷窗。',
    bossName:'寄生母体',
    keyItem:'反应堆控制核心',
    portal:'跃迁裂隙',
    safe:'停靠舱入口安全区',
    objective:'清除异形，击败寄生母体并取得反应堆控制核心',
    exitObjective:'上到反应堆平台，在跃迁裂隙前按 E 引爆',
    detonating:'跃迁裂隙已解除封印，引爆中',
    rage:'寄生母体狂暴，卵囊将在附近孵化',
  },
};
