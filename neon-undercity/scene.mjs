import { Reflector } from 'three/addons/objects/Reflector.js';

const CONFIG = {
  map:{cell:4,fog:.0119,navCell:1.25},
  graphics:{maxPixelRatio:1.14,bloomScale:.68,rain:2650,mirrorSize:224,mirrorInterval:.091},
  audio:{ambient:{filter:'bandpass',frequency:1470,q:.54,activeGain:.20,pauseGain:.105}},
  beasts:{
    types:[
      {hp:58,radius:.41,height:1.12},
      {hp:177,radius:.65,height:2.09},
      {hp:96,radius:.48,height:1.02,projectileSpeed:15.6,hazardLife:0},
      {hp:864,radius:1.04,height:3.93,summonCount:7},
    ],
  },
  emp:{first:38,period:55,warning:5,duration:7.2},
  drone:{hover:1.37,fallGravity:12,crashRadius:3.75,playerDamage:27,beastDamage:62},
};

// 北在首行。# 高楼墙，P 广场，B 高架，C 诊所，M 摊位，U 管道集市，S 车站，T 楼，V 车辆，R 路障。
const MAP_GRID=[
  '#########################',
  '#.......................#',
  '#.......................#',
  '#.....T..R.....R.T......#',
  '#.......................#',
  '#...T.......B.......T...#',
  '#.......................#',
  '#.....R..........R....T.#',
  '#..TV...................#',
  '#....................V..#',
  '#..................M....#',
  '#..................MM...#',
  '#....C......P.........T.#',
  '#..T...............M....#',
  '#...................M...#',
  '#..................M....#',
  '#.T.V................V.T#',
  '#.....R............R....#',
  '#.......................#',
  '#..R.T.............T..R.#',
  '#...........U...........#',
  '#...V.R...........R..V..#',
  '#...T...............T...#',
  '#...........S...........#',
  '#########################',
];
const OVERPASS={x:13,reach:25,h:3.48,z:-28,half:2.46};
const LOWER={x:17.2,north:25.5,south:38.5,shaft:10.65,half:1.77,entry:18.2,depth:2.65};
const LANDMARKS={
  loot:[
    [-4.55,42.6,'限量酒瓶',140],[-10.6,31.3,'旧街区记账板',185],
    [5.3,32.5,'加密硬盘',355],[-25.9,-1.55,'义体零件',220],
    [-29.6,2.6,'黑客工具盘',230],[29.9,5.4,'夜市会员卡',135],
    [34.0,11.3,'数据芯片',260],[-7.3,-28.0,'高架检修钥匙',245,'top'],
    [31.6,-21.2,'无人机电容',250],[-11.6,3.8,'广告信号解码器',310],
  ],
  ammo:[[3.75,41.1],[10.65,28.2],[-12.8,14.0],[-24.6,0],[35.9,-3.7],[38.0,12.2],
    [12.3,-17.5],[-11.2,-19.6],[0,-34.8],[-40.7,8.3]],
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const shaft=x=>Math.abs(Math.abs(x)-LOWER.shaft)<LOWER.half;
function groundHeight(x,z){
  if(Math.abs(x)<LOWER.x&&z>LOWER.north&&z<LOWER.south)return -LOWER.depth;
  if(z>=LOWER.entry&&z<=LOWER.north&&shaft(x))return -LOWER.depth*(z-LOWER.entry)/(LOWER.north-LOWER.entry);
  return 0;
}
function rampHeight(x,z){
  const ax=Math.abs(x),b=OVERPASS;
  if(ax<b.x||ax>b.reach||Math.abs(z-b.z)>b.half)return 0;
  return b.h*(b.reach-ax)/(b.reach-b.x);
}

function buildMap({THREE,scene,GRID,level,StaticBatches,shapes,canvasTexture,seededRandom,brighter}) {
  const rng=seededRandom(957311);
  const skyFacade=canvasTexture(192,256,(ctx,w,h)=>{
    ctx.fillStyle='#455267';ctx.fillRect(0,0,w,h);
    for(let y=3;y<h;y+=12.6)for(let x=5;x<w;x+=19){
      ctx.fillStyle='#1c283b';ctx.fillRect(x,y,12.5,8.1);
      const r=rng();
      ctx.fillStyle=r>.84?'#b08d95':r>.62?'#5586a1':r>.5?'#6a637b':'#34455e';
      ctx.fillRect(x+.9,y+1.0,10.7,5.4);
      ctx.fillStyle='#8497a965';ctx.fillRect(x+5.8,y+1,.55,5.7);
    }
    for(let j=0;j<1200;j++){
      ctx.fillStyle=rng()>.5?'#b0bed337':'#2b334e58';
      ctx.fillRect(rng()*w,rng()*h,.56+rng()*2,.41+rng()*2.0);
    }
  },true);
  const metal=canvasTexture(192,128,(ctx,w,h)=>{
    ctx.fillStyle='#8192a1';ctx.fillRect(0,0,w,h);
    for(let x=0;x<w;x+=24){
      ctx.fillStyle='#516879';ctx.fillRect(x,0,1.8,h);
      ctx.fillStyle='#c3cfcd';ctx.fillRect(x+2,1,1.4,h-1);
    }
    for(let j=0;j<2600;j++){
      ctx.fillStyle=rng()>.52?'#c8d1db41':'#4a576a52';
      ctx.fillRect(rng()*w,rng()*h,.45+rng()*2.2,.56+rng()*2.9);
    }
  });
  const asphalt=canvasTexture(256,256,(ctx,w,h)=>{
    ctx.fillStyle='#5e6a78';ctx.fillRect(0,0,w,h);
    for(let j=0;j<7200;j++){
      ctx.fillStyle=rng()>.48?'#93a0ae46':'#2c3c505d';
      ctx.fillRect(rng()*w,rng()*h,.47+rng()*2.7,.46+rng()*1.9);
    }
  },true);
  const mat={
    floor:new THREE.MeshLambertMaterial({map:asphalt,color:0xa3a9b6}),
    tower:new THREE.MeshLambertMaterial({map:skyFacade,color:0xb4b6ca}),
    metal:new THREE.MeshLambertMaterial({map:metal,color:0xb5b8c6}),
    dark:new THREE.MeshLambertMaterial({color:0x5d687d}),
    paint:new THREE.MeshLambertMaterial({color:0xb6bac3}),
    awning:new THREE.MeshLambertMaterial({color:0xa9a3b3,side:THREE.DoubleSide}),
    tubes:new THREE.MeshLambertMaterial({color:0x77899a}),
    powered:new THREE.MeshBasicMaterial(),
  };
  const geometry={...shapes,
    pipe:new THREE.CylinderGeometry(.50,.50,1,9),
    crusher:new THREE.IcosahedronGeometry(.60,0),
    edge:new THREE.ConeGeometry(.5,1,4),
  };
  const kit=new StaticBatches(mat,geometry),add=(...a)=>kit.add(...a),box=(m,...a)=>kit.add('box',m,...a);
  const solid=(m,x,z,w,d,y0,y1,color,climb=false)=>{
    box(m,x,(y0+y1)/2,z,w,y1-y0,d,color);
    return level.box(x,z,w,d,y0,y1,climb);
  };
  const aqua=brighter(0x55e9e9,2.23),pink=brighter(0xf467a8,2.18);
  const violet=brighter(0x9a85f1,2.28),orange=brighter(0xf4a271,1.91);
  const lightList=[], powered=[], signals=[], vents=[];
  function lamp(tint,power,x,y,z,reach=15) {
    const light=new THREE.PointLight(tint,power,reach,2);
    light.position.set(x,y,z);scene.add(light);lightList.push({light,power});
  }
  function sign(label,x,y,z,width,angle,color,ratio=.24) {
    const tex=canvasTexture(384,96,(ctx,w,h)=>{
      ctx.fillStyle='#162438';ctx.fillRect(0,0,w,h);
      ctx.strokeStyle='#6c7d8c';ctx.lineWidth=2;ctx.strokeRect(5,5,w-10,h-10);
      ctx.fillStyle=color;ctx.fillRect(10,h-13,w-20,2);
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font='700 47px PingFang SC, sans-serif';ctx.fillStyle='#e4eeec';
      ctx.fillText(label,w/2,h*.50,w-31);
    });
    const mesh=new THREE.Mesh(shapes.plane,new THREE.MeshBasicMaterial({map:tex,color:new THREE.Color(1.96,1.58,1.85)}));
    mesh.position.set(x,y,z);mesh.scale.set(width,width*ratio,1);
    mesh.rotation.y=angle;scene.add(mesh);powered.push(mesh);signals.push(mesh);
    return mesh;
  }
  function lightStrip(x,y,z,wide,depth,tint){
    box('dark',x,y+.047,z,wide+.12,.12,depth+.07,0x7a7c87);
    box('powered',x,y,z,wide,.042,depth,tint);
  }

  function tower(x,z,w,d,h,boundary=false) {
    solid('tower',x,z,w,d,0,h,0xa5abc5);
    box('metal',x,1.63,z,w+.14,3.26,d+.11,0x798292);
    for(const yy of [4.15,9.12,16.85]){
      box('dark',x,yy,z,w+.29,.32,d+.29,0x7f8196);
    }
    if(rng()>.53){
      const front=z>0?-1:1;
      box('powered',x-w*.22,4.6+rng()*6,z+front*(d/2+.095),.16,2.4+rng()*5.3,.058,rng()>.51?pink:violet);
    }
    if(!boundary&&rng()>.24){
      box('dark',x+w*.21,3.82,z+d*.51,1.35,.87,.28,0x8497a4);
      box('powered',x+w*.21,3.49,z+d*.548,1.18,.073,.045,aqua);
    }
  }
  function vehicle(x,z){
    const orientation=rng()>.49?0:1,w=orientation?4.42:2.09,d=orientation?2.09:4.42;
    solid('dark',x,z,w,d,0,.90,0x8991a2);
    solid('metal',x,z,w*.66,d*.65,.90,1.46,0xa6a8b9);
    for(const side of [-1,1]){
      box('powered',x+side*w*.32,.67,z-d*.506,.23,.075,.041,orange);
      box('powered',x+side*w*.32,.66,z+d*.506,.23,.070,.041,pink);
      for(const front of [-1,1])add('pipe','dark',x+side*w*.41,.38,z+front*d*.31,.57,.26,.57,0x72808d,0,0,Math.PI*.5);
    }
  }
  function stall(x,z,j){
    const h=2.04,c=j%2===0?aqua:pink;
    solid('metal',x,z,2.75,1.43,0,.98,0xa5aab4);
    box('dark',x,1.04,z,2.82,.14,1.60,0xa5a2a8);
    for(const edge of [-1,1]){
      box('tubes',x+edge*1.28,1.73,z,.115,1.43,.12,0x8e9aa4);
      box('powered',x+edge*.93,1.15,z+.67,.37,.15,.034,c);
    }
    box('awning',x,h+.42,z,3.42,.13,2.34,j%2?0xa78eb0:0x81999d,.0,-.20);
    lightStrip(x,h+.30,z+.76,1.84,.112,c);
    for(let a=0;a<3;a++)box('paint',x-.75+a*.67,1.21,z-.24,.22,.22,.17,0xb9b299);
  }
  function clinic(x,z){
    const hx=5.55,hz=5.0;
    for(const side of [-1,1]){
      for(const [offset,len] of [[-3.44,3.11],[3.44,3.11]]){
        solid('metal',x+side*hx,z+offset,.35,len,0,3.38,0x9eacbe);
        solid('metal',x+offset,z+side*hz,len+.6,.35,0,3.38,0xa5a9bb);
      }
      solid('dark',x+side*hx,z,.35,3.77,2.42,3.38,0x99a3b7);
      solid('dark',x,z+side*hz,3.22,.35,2.42,3.38,0x97a9b7);
      lightStrip(x+side*3.24,3.31,z,.93,.20,side>0?pink:aqua);
      solid('dark',x+side*3.7,z-2.65,2.41,.83,0,1.03,0x99a8b6);
      box('powered',x+side*3.72,1.17,z-2.24,.93,.22,.035,side>0?aqua:violet);
      box('powered',x+side*.97,1.79,z+4.77,.12,.50,.043,pink);
    }
    solid('dark',x,z,11.59,10.55,3.41,3.72,0x8f96a7);
    sign('义体诊所',x,2.92,z+hz+.23,3.58,0,'#59d5c9');
    sign('黑客终端',x-hx-.22,2.85,z+.08,3.13,-Math.PI/2,'#d890df');
    lamp(0xad6ef2,27,x,2.95,z-1.12,12.8);
  }
  function bridge() {
    const p=OVERPASS;
    solid('dark',0,p.z,p.x*2+0.035,p.half*2, p.h-.34,p.h,0x8b9ba8,true);
    for(const side of [-1,1]){
      const a=side*p.x,b=side*p.reach,w=p.half*2;
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute([a,p.h,p.z-w/2,a,p.h,p.z+w/2,b,0,p.z-w/2,b,0,p.z+w/2],3));
      g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,0,1,1,0,1,1],2));
      g.setIndex(side>0?[0,1,2,2,1,3]:[0,2,1,2,3,1]);g.computeVertexNormals();
      scene.add(new THREE.Mesh(g,mat.metal));
      for(const t of [-1,1]){
        const at=p.z+t*(p.half-.11);
        box('dark',side*9.7,p.h+.22,at,6.7,.26,.16,0x929bad);
        box('powered',side*6.8,p.h+.37,at,11.2,.047,.074,side>0?aqua:pink);
        solid('metal',side*9.92,p.z+t*1.68,.57,.52,0,p.h-.28,0x8e9da9);
      }
      const length=Math.hypot(p.reach-p.x,p.h),tilt=-side*Math.atan(p.h/(p.reach-p.x));
      box('metal',side*(p.x+p.reach)*.50,p.h*.50+.05,p.z+p.half-.11,length,.109,.118,0x98a9b4,0,0,tilt);
      box('powered',side*(p.x+p.reach)*.50,p.h*.50+.16,p.z+p.half-.11,length-.30,.046,.065,aqua,0,0,tilt);
    }
    sign('北环空中走廊',0,2.93,p.z+p.half+.14,4.18,0,'#6ccbd3');
    lamp(0x739fda,29,0,2.70,p.z+.70,12.9);
  }

  function plaza(x,z){
    level.gate.set(x,0,z);
    level.bossAnchor.set(0,0,-8.8);level.bossSpawn.set(4.6,0,-7.9);
    add('pipe','metal',x,.055,z,4.73,.11,4.73,0x738698);
    for(let j=0;j<14;j++){
      const a=j/14*Math.PI*2;
      box('powered',x+Math.cos(a)*2.2,.14,z+Math.sin(a)*2.2,.30,.040,.085,j%2?aqua:pink,-a);
    }
    for(const side of [-1,1]){
      solid('dark',side*8.27,z-2.35,.92,.84,0,4.25,0x92a0b0);
      box('powered',side*8.27,3.0,z-1.904,.107,1.72,.040,side<0?pink:aqua);
    }
    sign('全息广告广场',-8.20,4.48,z-1.93,4.04,0,'#ec81ca');
    lamp(0x4adcf2,76,5.23,4.55,5.81,19);
    lamp(0xf069ce,70,-5.31,4.44,-3.1,18);
  }
  function station(x,z){
    for(const side of [-1,1]){
      solid('metal',x+side*2.77,z,1.42,2.52,0,3.53,0x9daab8);
      box('powered',x+side*2.64,1.64,z-1.274,.114,2.37,.065,aqua);
    }
    solid('dark',x,z,6.81,1.97,2.58,3.67,0x8a9caf);
    sign('地下车站出口',x,3.22,z-1.05,4.63,Math.PI,'#5be2ea');
    level.spawn.set(x,0,z-3.78);
    lamp(0x64cbe0,39,x,3.5,z-1.62,14.5);
  }

  let booths=0;
  for(let row=0;row<GRID.rows;row++)for(let col=0;col<GRID.columns;col++){
    const x=GRID.x(col),z=GRID.z(row),mark=GRID.cells[row][col];
    if(mark==='#')tower(x,z,GRID.cell+.027,GRID.cell+.027,35+rng()*23,true);
    else if(mark==='T')tower(x,z,5.0+rng()*1.7,4.92+rng()*1.95,16+rng()*17);
    else if(mark==='R'){
      solid('dark',x,z,2.67,.81,0,.91,0x8093a2);
      for(let j=0;j<4;j++)box('paint',x+(j-1.5)*.47,.60,z+.421,.11,.24,.037,0xb38f92,0,0,.38);
      if(rng()>.51)vents.push([x,z]);
    }else if(mark==='V')vehicle(x,z);
    else if(mark==='M')stall(x,z,booths++);
    else if(mark==='C')clinic(x,z);
    else if(mark==='P')plaza(x,z);
    else if(mark==='S')station(x,z);
    else if(mark==='B')bridge();
  }
  sign('深夜小吃',30.1,3.42,-1.9,4.72,0,'#f38acf');
  sign('停靠服务',33.5,3.16,9.85,3.53,-Math.PI/2,'#eda782');
  lamp(0xf0739d,34,30.1,3.08,4.2,12.5);

  // 地面与地下集市分别成形。两条坡道从北侧下沉，地表路可以从顶板跨过。
  const lower=LOWER;
  const mid=(lower.north+lower.south)/2;
  solid('dark',0,mid,lower.x*2,lower.south-lower.north,-.41,0,0x82909f,true);
  solid('metal',0,lower.south,lower.x*2+.44,.35,-lower.depth,.29,0x9499a7,true);
  for(const side of [-1,1]){
    const x=side*lower.x;
    solid('metal',x,mid,.35,lower.south-lower.north+.25,-lower.depth,.28,0x9299a9,true);
    const entry=side*lower.shaft,inn=lower.shaft-lower.half,out=lower.shaft+lower.half;
    solid('metal',side*(out+lower.x)/2,lower.north,lower.x-out,.41,-lower.depth,.27,0x929cac);
    solid('dark',entry,lower.north,lower.half*2+.53,.58,-.42,.35,0x8e9cac,true);
    for(const position of [-1,1]){
      const xx=entry+position*lower.half;
      for(let i=0;i<10;i++){
        const step=(lower.north-lower.entry)/10,z=lower.entry+(i+.5)*step;
        solid('metal',xx,z,.25,step+.019,groundHeight(xx-position*.045,z+step/2),.19,0x8b9ba6);
      }
      box('powered',xx,.28,lower.north-.35,.13,.16,.24,orange);
    }
    add('pipe','tubes',entry,-.72,mid, .29,lower.south-lower.north-.3,.29,0x9a8c9b,0,Math.PI/2);
    add('pipe','tubes',side*5.2,-.61,mid,.31,lower.south-lower.north-.51,.31,0x7a9ca2,0,Math.PI/2);
    for(const dx of [4.97,13.9]){
      const x=side*dx,z=lower.south-2.64;
      solid('metal',x,z,2.4,1.31,-lower.depth,-lower.depth+.81,0xa4aeac);
      box('powered',x,-lower.depth+1.17,z-.69,1.36,.20,.029,side>0?pink:aqua);
    }
    lightStrip(side*8.2,-.445,mid,1.7,.17,side<0?aqua:violet);
    vents.push([side*2.62,lower.north-3.3]);
  }
  solid('metal',0,lower.north,2*(lower.shaft-lower.half),.44,-lower.depth,.29,0x93a8b2);
  sign('管道集市',-10.65,.73,lower.north+.12,2.94,0,'#f2a47b');
  lamp(0xde6ed6,27,0,-.75,31.4,12.3);

  const xs=new Set([-50,50,-lower.x,lower.x]),zs=new Set([-50,50,lower.entry,lower.north,lower.south]);
  for(let i=-48;i<=48;i+=4){xs.add(i);zs.add(i);}
  for(const d of [-1,1])for(const e of [-1,1])xs.add(d*lower.shaft+e*lower.half);
  const a=[...xs].sort((x,y)=>x-y),b=[...zs].sort((x,y)=>x-y),positions=[],uv=[];
  for(let j=0;j<b.length-1;j++)for(let i=0;i<a.length-1;i++){
    const x0=a[i],x1=a[i+1],z0=b[j],z1=b[j+1];
    for(const [x,z] of [[x0,z0],[x0,z1],[x1,z0],[x1,z0],[x0,z1],[x1,z1]]){
      positions.push(x,groundHeight(x+(x===x0 ? .0001 : -.0001),z+(z===z0 ? .0001 : -.0001)),z);
      uv.push(x/5.1,z/5.1);
    }
  }
  const street=new THREE.BufferGeometry();
  street.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  street.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));street.computeVertexNormals();
  scene.add(new THREE.Mesh(street,mat.floor));
  const roofDeck=new THREE.PlaneGeometry(lower.x*2-.04,lower.south-lower.north-.03);
  const deckUV=roofDeck.attributes.uv;
  for(let i=0;i<deckUV.count;i++)deckUV.setXY(i,deckUV.getX(i)*6.86,deckUV.getY(i)*2.55);
  const roofRoad=new THREE.Mesh(roofDeck,mat.floor);
  roofRoad.rotation.x=-Math.PI/2;roofRoad.position.set(0,.008,mid);scene.add(roofRoad);
  for(const d of [-1,1]){
    for(let z=26.7;z<=38;z+=2.81){
      box('paint',d*4.86,.027,z,.084,.021,1.58,0xa0a6b6);
      box('powered',d*5.32,.055,z+.41,.125,.074,.131,d<0?pink:aqua);
    }
    box('powered',d*16.8,.052,mid,.053,.045,11.7,d<0?violet:aqua);
  }
  for(const d of [-1,1])for(let z=-19;z<18;z+=3.65){
    box('paint',d*6.18,.026,z,.073,.027,1.76,0x9b9eb1);
    if(Math.abs(z)>8.3)box('powered',d*6.55,.049,z,.14,.038,.14,d>0?aqua:pink);
  }
  for(let i=0;i<190;i++){
    const x=(rng()-.5)*88,z=(rng()-.5)*88;
    if((Math.abs(x)<7&&z>-20)||groundHeight(x,z)<-.02||level.blocked(x,z,0,.12,.21))continue;
    add('crusher','dark',x,.031,z,.15+rng()*.46,.063+rng()*.145,.17+rng()*.44,0x8892a1,rng()*6.28);
  }
  kit.flush();
  for(const o of scene.children)if(o.isInstancedMesh&&o.material===mat.powered)powered.push(o);
  const amb=new THREE.HemisphereLight(0xc8c7e7,0x8192ad,1.38);
  const fill=new THREE.DirectionalLight(0x9db6e2,1.02);fill.position.set(-20,40,-22);
  scene.add(amb,fill);
  return {powered,signals,lightList,amb,fill,vents};
}

function beastSurface(b,p,level,floor,dt,game){
  if(b.type!==2){
    b.y=Math.max(floor,b.y-dt*8);
    return;
  }
  // 支撑面与悬浮高度分开计算，飞过高架下方时不会吸到桥面上。
  const support=level.surface(b.x,b.z,Math.max(floor,b.y-1.12));
  const head=game.encounter?.rules.drone.hover??CONFIG.drone.hover;
  const target=Math.min(support+head+Math.sin(game.time*3.2+b.blink)*.13,
    Math.abs(b.x)<LOWER.x&&b.z>LOWER.north&&b.z<LOWER.south&&b.y<-.43 ? -.60-b.height : Infinity);
  const next=Math.max(floor,b.y+clamp(target-b.y,-dt*5,dt*4));
  if(!level.blocked(b.x,b.z,next,b.radius,b.height))b.y=next;
}

function wreckLanding(beast,level){
  return level.surface(beast.x,beast.z,beast.y-.09);
}

function createEncounter({CONFIG:setup,level,THREE,brighter,sound}){
  const emp=setup.emp,drone=setup.drone;
  const readout={title:'',detail:'',remaining:0};
  const wrecks=Array.from({length:26},()=>({active:false,x:0,y:0,z:0,impact:0,vy:0,yaw:0,roll:0,born:0}));
  const point=new THREE.Vector3(),dir=new THREE.Vector3(),target=new THREE.Vector3(),fallPoint=new THREE.Vector3();
  const sparks=brighter(0xffb77e,2.1),smoke=brighter(0xa48297,1.29);
  function unobstructed(x,y,z,radius){
    const distance=dir.set(x-point.x,y-point.y,z-point.z).length();
    if(distance>radius)return false;
    if(distance<.02)return true;
    return level.visible(point,dir.divideScalar(distance),distance);
  }
  function contact(wreck,game) {
    wreck.active=false;
    point.set(wreck.x,wreck.impact+.29,wreck.z);
    game.effects.spray(point,sparks,43,8.2,.074,'spark');
    game.effects.spray(point,smoke,18,5,.109,'mist');
    sound.hiss(.27,2100,170,.32);
    const p=game.player;
    if(unobstructed(p.x,p.y+.48,p.z,drone.crashRadius))p.hurt(drone.playerDamage,game);
    if(game.phase!=='play')return;
    for(const b of game.beasts.pool){
      if(!b.active||!unobstructed(b.x,b.y+.24,b.z,drone.crashRadius))continue;
      target.set(b.x,b.y+.45,b.z);
      game.beasts.takeHit(b,drone.beastDamage,target,dir,game,null,'electric-environment');
    }
  }
  return {
    phase:'calm',next:emp.first,ends:0,started:0,beastsDisabled:false,hudOffline:false,status:null,wrecks,
    crashCount:0,rules:{drone,emp},
    reset(){
      this.phase='calm';this.next=emp.first;this.ends=0;this.started=0;this.status=null;
      this.beastsDisabled=false;this.hudOffline=false;this.crashCount=0;level.empActive=false;
      for(const body of wrecks)body.active=false;
    },
    stage(beast,game){
      const wreck=wrecks.find(w=>!w.active);
      if(!wreck)return false;
      Object.assign(wreck,{active:true,x:beast.x,y:beast.y,z:beast.z,
        impact:wreckLanding(beast,level),vy:0,yaw:beast.yaw,roll:0,born:game.time});
      fallPoint.set(beast.x,beast.y+.36,beast.z);
      game.effects.spray(fallPoint,sparks,12,3.3,.044,'spark');
      return true;
    },
    update(game,dt=0){
      const t=game.time;
      if(this.phase==='calm'&&t>=this.next-emp.warning){
        this.phase='warning';game.ui.tick=0;
        game.ui.notify('电磁波动增强，EMP 即将到达',2.4);
        sound.tone(182,74,.58,.24,'triangle');
      }
      if(this.phase==='warning'&&t>=this.next){
        this.phase='off';this.started=t;this.ends=this.next+emp.duration;
        this.beastsDisabled=true;this.hudOffline=true;level.empActive=true;game.ui.tick=0;
        game.ui.notify('EMP 切断电力，机械敌人已瘫痪',2.8);
        sound.hiss(.71,2410,92,.34);sound.tone(73,34,.48,.33,'triangle');
      }
      if(this.phase==='off'&&t>=this.ends){
        this.phase='calm';
        this.next+=emp.period;
        if(this.next<=t)this.next=t+emp.period;
        this.beastsDisabled=false;this.hudOffline=false;level.empActive=false;game.ui.tick=0;
        game.ui.notify('电力恢复，机械敌人已重新启动',2.3);
        sound.tone(125,261,.49,.22,'triangle');
      }
      if(this.phase==='warning'){
        readout.title='EMP 干扰预警';readout.remaining=this.next-t;
        readout.detail='照明和战斗读数即将中断';
      }
      if(this.phase==='off'){
        readout.title='EMP 供电中断';readout.remaining=this.ends-t;
        readout.detail='机械敌人瘫痪，抓紧反击';
      }
      this.status=this.phase==='calm'?null:readout;
      if(game.blast)return;
      for(const wreck of wrecks){
        if(!wreck.active||wreck.born>=t)continue;
        wreck.vy-=drone.fallGravity*dt;
        wreck.y+=wreck.vy*dt;wreck.roll+=dt*7.6;wreck.yaw+=dt*2.4;
        if(wreck.y>wreck.impact)continue;
        this.crashCount++;
        contact(wreck,game);
        if(game.phase!=='play')break;
      }
    },
  };
}

function createEnvironment({THREE,scene,camera,CONFIG:setup,mapData,seededRandom,brighter,canvasTexture,dynamicMesh,setInstance,updateMesh,$}) {
  const rng=seededRandom(318042);
  const base=Reflector.ReflectorShader;
  const wetShader={
    uniforms:{...base.uniforms,tick:{value:0}},
    vertexShader:base.vertexShader.replace('varying vec4 vUv;','varying vec4 vUv; varying vec2 roadUV;')
      .replace('vUv =','roadUV=uv; vUv ='),
    fragmentShader:`
      uniform sampler2D tDiffuse;
      uniform float tick;
      varying vec4 vUv;
      varying vec2 roadUV;
      void main(){
        vec2 p=roadUV;
        float edge=min(min(p.x,1.0-p.x)*2.3,min(p.y,1.0-p.y)*4.7);
        float cuts=sin(p.y*44.0+p.x*12.0)*.040+sin(p.y*127.0-p.x*51.0)*.024;
        vec2 ripple=vec2(sin(p.y*174.0+p.x*67.0+tick*9.4),cos(p.y*282.0-p.x*43.0-tick*7.2))*.00124;
        vec2 q=vUv.xy/vUv.w+ripple;
        vec3 ray=texture2D(tDiffuse,q).rgb;
        float coverage=smoothstep(.035,.22,edge+cuts);
        float gloss=.84+.065*sin(p.x*62.0+p.y*83.0-tick*.57);
        gl_FragColor=vec4(ray*vec3(.66,.76,.89),coverage*gloss);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  };
  const size=setup.graphics.mirrorSize;
  const wet=new Reflector(new THREE.PlaneGeometry(27.0,47.5),{
    shader:wetShader,textureWidth:size,textureHeight:size,multisample:0,clipBias:.004,
  });
  wet.rotation.x=-Math.PI/2;wet.position.set(0,.018,-6.3);
  wet.material.transparent=true;wet.material.depthWrite=false;
  const reflect=wet.onBeforeRender;let last=-10,black=null;
  wet.onBeforeRender=function(r,s,v){
    const tick=wet.material.uniforms.tick.value;
    if(tick-last<setup.graphics.mirrorInterval||v.position.y<=.12)return;
    last=tick;reflect.call(this,r,s,v);
  };
  scene.add(wet);

  const count=setup.graphics.rain,seeds=new Float32Array(count*6),ends=new Float32Array(count*2);
  for(let i=0;i<count;i++){
    for(let j=0;j<3;j++)seeds[i*6+j]=seeds[i*6+3+j]=rng();
    ends[i*2+1]=1;
  }
  const rain=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,
    uniforms:{tick:{value:0},strength:{value:1}},
    vertexShader:`
      attribute float endpoint;
      uniform float tick,strength;
      varying float alpha;
      void main(){
        vec3 n=position,c=cameraPosition;
        float span=51.0;
        vec3 p=vec3(
          mod(n.x*span-tick*3.48-c.x,span)+c.x-span*.50,
          mod(n.y*16.0-tick*(13.4+n.z*5.9)-c.y,16.0)+c.y-3.0,
          mod(n.z*span+tick*1.36-c.z,span)+c.z-span*.50
        );
        p+=vec3(.086,.35+n.x*.38,-.03)*endpoint;
        vec4 v=viewMatrix*vec4(p,1.0);
        float fade=smoothstep(.59,2.14,-v.z)*(1.0-smoothstep(13.9,24.2,-v.z));
        alpha=fade*strength*mix(.23,.51,n.x)*mix(.29,1.0,endpoint);
        gl_Position=projectionMatrix*v;
      }
    `,
    fragmentShader:`
      varying float alpha;
      void main(){gl_FragColor=vec4(.44,.64,.84,alpha);}
    `,
  }));
  rain.geometry.setAttribute('position',new THREE.BufferAttribute(seeds,3));
  rain.geometry.setAttribute('endpoint',new THREE.BufferAttribute(ends,1));
  rain.layers.set(1);rain.frustumCulled=false;scene.add(rain);

  const steamSeeds=new Float32Array(mapData.vents.length*38*3),steamSite=new Float32Array(mapData.vents.length*38*2);
  for(const [i,[x,z]] of mapData.vents.entries())for(let n=0;n<38;n++){
    const index=i*38+n;
    steamSeeds.set([rng(),rng(),rng()],index*3);steamSite.set([x,z],index*2);
  }
  const steam=new THREE.Points(new THREE.BufferGeometry(),new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,
    uniforms:{tick:{value:0}},
    vertexShader:`
      attribute vec2 site;
      uniform float tick;
      varying float alpha;
      void main(){
        vec3 n=position;
        float life=fract(n.y+tick*(.24+n.z*.17)),a=n.x*6.28318+tick*.6;
        vec3 p=vec3(site.x+cos(a)*life*(.7+n.x)+life*.92,.21+life*(3.05+n.z*1.83),site.y+sin(a)*life*(.6+n.x));
        vec4 v=viewMatrix*vec4(p,1.0);
        alpha=(1.0-life)*smoothstep(.2,1.7,-v.z)*(1.0-smoothstep(15.0,28.0,-v.z))*.17;
        gl_PointSize=clamp((39.0+life*30.0)/max(1.0,-v.z),2.4,25.0);
        gl_Position=projectionMatrix*v;
      }
    `,
    fragmentShader:`
      varying float alpha;
      void main(){
        float cloud=1.0-smoothstep(.05,.49,length(gl_PointCoord-.5));
        gl_FragColor=vec4(.54,.68,.86,cloud*cloud*alpha);
      }
    `,
  }));
  steam.geometry.setAttribute('position',new THREE.BufferAttribute(steamSeeds,3));
  steam.geometry.setAttribute('site',new THREE.BufferAttribute(steamSite,2));
  steam.frustumCulled=false;scene.add(steam);

  function hologram(label,x,y,z,w,h){
    const graphic=canvasTexture(448,216,(ctx,ww,hh)=>{
      const shade=ctx.createLinearGradient(0,0,ww,hh);
      shade.addColorStop(0,'#4ac2d079');shade.addColorStop(.64,'#785fa749');shade.addColorStop(1,'#e477b17d');
      ctx.fillStyle=shade;ctx.fillRect(0,0,ww,hh);
      ctx.strokeStyle='#b6f1f9';ctx.lineWidth=3;ctx.strokeRect(9,9,ww-18,hh-18);
      ctx.font='700 60px PingFang SC, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#e9fbf6';
      ctx.fillText(label,ww*.50,hh*.43,ww-33);
      ctx.strokeStyle='#f58cc8';ctx.beginPath();ctx.moveTo(38,hh*.72);ctx.lineTo(ww-38,hh*.72);ctx.stroke();
      for(let i=0;i<16;i++){ctx.fillStyle=i%3?'#96d8de':'#e6a0c7';ctx.fillRect(41+i*23,hh*.81, 6+(i%5)*2, 4);}
    });
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.ShaderMaterial({
      transparent:true,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false,
      uniforms:{image:{value:graphic},tick:{value:0}},
      vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:`
        uniform sampler2D image;
        uniform float tick;
        varying vec2 p;
        void main(){
          float line=pow(max(0.0,sin(p.y*212.0)),10.0)*.18;
          float shift=.004*sin(p.y*61.0+tick*1.7)*pow(max(0.0,sin(tick*.8+p.y*6.2)),10.0);
          vec4 c=texture2D(image,vec2(p.x+shift,p.y));
          float sweep=pow(max(0.0,sin(p.y*8.0-tick*1.43)),9.0);
          gl_FragColor=vec4(c.rgb*(1.72+sweep*.27),c.a*(.78-line));
        }
      `,
    }));
    mesh.position.set(x,y,z);scene.add(mesh);
    return mesh;
  }
  const ads=[hologram('下层夜市',-7.25,7.21,-3.3,8.30,3.51),hologram('义体调校',8.65,6.85,-4.75,5.5,2.38)];
  ads[0].rotation.y=.17;ads[1].rotation.y=-.19;
  const wreckMesh=dynamicMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshLambertMaterial(),26);
  const wreckColor=brighter(0x8ba7bc,.70);
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  const flash=$('blast');
  flash.style.background='radial-gradient(ellipse at center,#9fdfff60,#a59fff31 48%,transparent 86%)';
  return {
    update(t,playing,game){
      const event=game.encounter,off=event?.phase==='off';
      const motion=reduce.matches?t*.42:t;
      if(off!==black){
        black=off;last=-10;
        for(const obj of mapData.powered)obj.visible=!off;
        for(const bill of ads)bill.visible=!off;
        mapData.amb.intensity=off ? .52 : 1.38;
        mapData.fill.intensity=off ? .31 : 1.02;
      }
      for(const [i,{light,power}] of mapData.lightList.entries()){
        const pulse=.94+.08*Math.sin(motion*3.64+i*1.39)+.040*Math.sin(motion*5.3-i*2.3);
        light.intensity=off?0:power*pulse;
      }
      for(const [i,m] of mapData.signals.entries()){
        const v=1-.21*Math.pow(Math.max(0,Math.sin(motion*.73+i*3.06)),13);
        m.material.color.setRGB(1.96*v,1.58*v,1.85*v);
      }
      for(const ad of ads)ad.material.uniforms.tick.value=motion;
      wet.material.uniforms.tick.value=t;
      rain.material.uniforms.tick.value=motion;
      rain.material.uniforms.strength.value=game.player.y<-.65 ? .16 : 1;
      steam.material.uniforms.tick.value=motion;
      if(reduce.matches)flash.style.opacity='0';
      else if(!game.blast)flash.style.opacity=off?String(.57*Math.max(0,1-(game.time-event.started)/.42)):'0';
      let index=0;
      for(const w of event?.wrecks??[])if(w.active){
        setInstance(wreckMesh,index++,w.x,w.y+.31,w.z,.92,.24,.51,wreckColor,w.yaw,.31,w.roll);
      }
      updateMesh(wreckMesh,index);
    },
  };
}

function createPortal({THREE,scene,level,brighter,dynamicMesh,setInstance,updateMesh,seededRandom}){
  const root=new THREE.Group();root.position.copy(level.gate);scene.add(root);
  const code=new THREE.Mesh(new THREE.CylinderGeometry(.52,1.58,10.3,34,1,true),new THREE.ShaderMaterial({
    side:THREE.DoubleSide,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,
    uniforms:{tick:{value:0},ready:{value:0},blast:{value:0},power:{value:1}},
    vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`
      uniform float tick,ready,blast,power;
      varying vec2 p;
      float bits(vec2 q){
        return fract(sin(dot(q,vec2(116.7,83.1)))*43758.5453);
      }
      void main(){
        float twist=p.x + p.y*.88+sin(p.y*15.7-tick*2.66)*.058;
        vec2 grid=vec2(twist*51.0,p.y*39.0-tick*5.7);
        vec2 cell=floor(grid),f=fract(grid);
        float slot=step(.60,bits(cell))*step(.22,f.x)*step(f.x,.69)*step(.20,f.y)*step(f.y,.67);
        float stream=pow(max(0.0,sin(twist*94.0+tick*1.81)),7.0);
        float fade=(1.0-smoothstep(.29,1.0,p.y))*smoothstep(.0,.022,p.y);
        vec3 tint=mix(vec3(.10,1.19,1.34),vec3(1.40,.49,.80),.5+.5*sin(p.y*8.0+twist*2.31));
        gl_FragColor=vec4(tint*(1.0+ready*.31+blast*2.0),(.18+slot*.66+stream*.28)*fade*(1.0-blast)*power);
      }
    `,
  }));
  code.position.y=5.14;root.add(code);
  const rings=[];
  for(let j=0;j<3;j++){
    const m=new THREE.Mesh(new THREE.TorusGeometry(1.44+j*.18,.024+j*.006,6,50,Math.PI*(1.57+j*.10)),
      new THREE.MeshBasicMaterial({color:brighter(j%2?0xf685cd:0x68f3ef,2.2)}));
    m.position.y=.34+j*.70;root.add(m);rings.push(m);
  }
  const wave=new THREE.Mesh(new THREE.TorusGeometry(1,.027,7,80),new THREE.MeshBasicMaterial({
    color:brighter(0x9bdcfe,2.22),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  }));
  wave.position.y=.21;wave.rotation.x=-Math.PI/2;root.add(wave);
  const rng=seededRandom(39264),bits=[];
  for(let i=0;i<112;i++)bits.push({
    az:rng()*Math.PI*2,r:2.6+rng()*13.2, y:1.2+rng()*4.3,w:.034+rng()*.146,
    color:brighter(i%2?0x82eff7:0xec9ede,1.25+rng()*1.38),
  });
  const burst=dynamicMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({
    transparent:true,depthWrite:false,
  }),bits.length);
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  return {
    update(time,ready,blast){
      const t=motion.matches?time*.42:time;
      const u=code.material.uniforms;
      u.tick.value=t;u.ready.value=Number(ready);u.blast.value=blast;u.power.value=level.empActive ? .22 : 1;
      code.visible=blast<.98;code.rotation.y=t*.28;
      for(const [i,m] of rings.entries()){
        m.rotation.set(-Math.PI/2+Math.sin(t*.86+i)*.24,Math.sin(t*.63+i)*.16,t*(i%2?-.60:.83)+i*2.35);
        m.visible=blast<.85&&!level.empActive;
      }
      wave.visible=blast>0&&blast<1;
      wave.scale.setScalar(1+blast*25);wave.material.opacity=(1-blast)*.73;
      let n=0;
      if(blast>0&&blast<1)for(const p of bits){
        const r=.85+p.r*blast,y=.43+p.y*(4*blast*(1-blast))-blast*.89;
        setInstance(burst,n++,level.gate.x+Math.cos(p.az)*r,level.gate.y+y,level.gate.z+Math.sin(p.az)*r,
          p.w,p.w*.92,p.w*.72,p.color,p.az+blast*3.6,blast*2.2,.18);
      }
      burst.material.opacity=(1-blast)*.83;updateMesh(burst,n);
    },
  };
}

function machineModel(type,{THREE,shapes,mergeGeometries},rage=false){
  const shell=[],energy=[],transform=new THREE.Object3D();
  const facet=new THREE.IcosahedronGeometry(1,0);
  const pin=new THREE.CylinderGeometry(.43,.50,1,6);
  function step(dst,primitive,tint,x,y,z,w,h,d,pitch=0,yaw=0,roll=0){
    const g=primitive.index?primitive.toNonIndexed():primitive.clone();
    transform.position.set(x,y,z);transform.scale.set(w,h,d);transform.rotation.set(pitch,yaw,roll,'YXZ');
    transform.updateMatrix();g.applyMatrix4(transform.matrix);
    const color=new THREE.Color(tint),rgb=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<rgb.length;i+=3){rgb[i]=color.r;rgb[i+1]=color.g;rgb[i+2]=color.b;}
    g.setAttribute('color',new THREE.BufferAttribute(rgb,3));dst.push(g);
  }
  const plate=(...a)=>step(shell,shapes.box,...a);
  const hood=(...a)=>step(shell,facet,...a);
  const joint=(...a)=>step(shell,pin,...a);
  const glow=(...a)=>step(energy,shapes.box,...a);
  const dark=0x536277,blue=0x8193ac,armor=0x758194,steel=0x9a9da9;
  if(type===0){
    hood(armor,0,.53,-.11,.32,.243,.55);
    plate(blue,0,.62,-.15,.57,.16,.64,.10);
    hood(dark,0,.67,.44,.25,.22,.27);
    plate(blue,0,.59,.61,.29,.13,.27);
    for(const d of [-1,1]){
      joint(dark,d*.23,.28,.24,.117,.44,.13,-.23,0,-d*.13);
      joint(blue,d*.24,.28,-.37,.126,.40,.13,.31,0,-d*.17);
      plate(steel,d*.21,.15,.42,.15,.084,.23);
      plate(blue,d*.13,.79,.30,.084,.26,.103,.20,0,-d*.37);
      glow(0x7ffff0,d*.14,.68,.67,.076,.045,.045);
    }
  }else if(type===1){
    hood(armor,0,1.14,-.20,.63,.68,.56);
    plate(dark,0,1.52,.20,.65,.46,.48,-.19);
    plate(blue,0,1.40,.48,.46,.27,.39);
    for(const d of [-1,1]){
      hood(steel,d*.45,1.42,.23,.42,.39,.40);
      plate(dark,d*.47,.83,.36,.30,.59,.39,-.36,0,d*.18);
      plate(blue,d*.37,.51,.50,.34,.28,.43,-.36);
      joint(armor,d*.23,.39,-.31,.31,.66,.36,-.18,0,d*.23);
      glow(0xfab78a,d*.18,1.45,.692,.084,.058,.026);
    }
  }else if(type===2){
    hood(armor,0,.41,.02,.43,.248,.35);
    plate(blue,0,.57,.03,.57,.092,.51);
    for(const d of [-1,1]){
      plate(dark,d*.29,.41,-.04,.46,.14,.18,.08,d*.13);
      joint(steel,d*.44,.36,-.07,.29,.15,.29);
      joint(dark,d*.20,.24,.26,.108,.37,.12,Math.PI/2);
      glow(0x92e9ff,d*.44,.26,-.07,.24,.029,.22);
    }
    glow(0xf68cca,0,.47,.337,.218,.075,.04);
  }else{
    hood(rage?0x986078:dark,0,1.57,-.03,.86,.84,.59);
    plate(blue,0,2.34,.21,1.22,.88,.97,.10);
    plate(armor,0,2.89,.56,.83,.40,.67);
    plate(steel,0,3.06,.31,.69,.27,.52);
    for(const d of [-1,1]){
      joint(dark,d*.44,.74,-.27,.37,1.08,.40,-.17,0,d*.12);
      plate(blue,d*.45,.24,.02,.51,.33,.64,0,d*.18);
      joint(armor,d*.83,1.82,.23,.42,1.19,.42,-.16,0,d*.20);
      plate(steel,d*.89,1.33,.40,.43,.36,.36,-.24,0,d*.15);
      if(!rage)hood(steel,d*.72,2.61,.18,.60,.42,.50);
      else glow(0xf681c6,d*.60,2.52,.57,.23,.49,.07,.18,0,d*.33);
      plate(dark,d*.48,2.79,-.24,.19,.79,.31,-.21);
      glow(rage?0xffb5d7:0x91e6f9,d*.20,2.959,.904,.12,.066,.046);
    }
    glow(rage?0xfb92cb:0x7de5ed,0,2.23,.72,.29,.34,.056,.12);
  }
  const g=[mergeGeometries(shell),mergeGeometries(energy)];
  for(const o of [...shell,...energy,facet,pin])o.dispose();
  return g;
}

export default {
  weaponSkin: 'neon-undercity',
  pageTitle:'霓雨下城 | 第九关',
  grid:MAP_GRID,
  config:CONFIG,
  loot:LANDMARKS.loot,
  ammo:LANDMARKS.ammo,
  background:0x101827,
  fog:0x273249,
  palette:{projectile:0xf48dba,ichor:0x648896,spark:0xcfeef9,core:0x8cfff4,rare:0xe1b9eb,blast:0x8ce1f5},
  buildMap,
  createEncounter,
  createEnvironment,
  createPortal,
  beastSurface,
  beastDropHeight(beast,level){return beast.type===2 ? wreckLanding(beast,level) : beast.y;},
  onBeastDefeated(beast,game){return beast.type===2&&game.encounter.stage(beast,game);},
  buildBeastModel:machineModel,
  buildRageModel(helpers){return machineModel(3,helpers,true);},
  portal:{width:1.35,depth:1.04,verticalRange:.50,useRadius:4.10},
  terrain:{ground:groundHeight,ramp:rampHeight},
  area(x,z,level,y){
    if(y<-.65)return '南侧地下管道集市';
    if(z>36&&Math.abs(x-level.spawn.x)<8)return '地下车站出口';
    if(z<-22)return y>1.05?'北立交空中走廊':'北立交桥下';
    if(x>17&&z>-19&&z<14.6)return '东侧夜市小吃街';
    if(x<-17&&z>-17&&z<15)return '西侧义体诊所与黑客据点';
    if(Math.hypot(x,z)<13.5)return '全息广告广场';
    return '下城后撤主街';
  },
  minimap:{
    tiles:{'#':'#68758d',T:'#46536c',V:'#65758c',C:'#807196',M:'#866881',R:'#667187'},
    beforeTiles({ctx,px,pz,size}){
      ctx.fillStyle='#253246';ctx.fillRect(0,0,size,size);
      ctx.fillStyle='#34475c';ctx.fillRect(px(-12),pz(-38),px(12)-px(-12),pz(42)-pz(-38));
      ctx.strokeStyle='#79b3bc';ctx.strokeRect(px(-14),pz(-13),px(14)-px(-14),pz(13)-pz(-13));
      ctx.fillStyle='#71889b';ctx.fillRect(px(-OVERPASS.reach),pz(OVERPASS.z-OVERPASS.half),px(OVERPASS.reach)-px(-OVERPASS.reach),pz(OVERPASS.z+OVERPASS.half)-pz(OVERPASS.z-OVERPASS.half));
      ctx.fillStyle='#46415c';ctx.fillRect(px(-LOWER.x),pz(LOWER.north),px(LOWER.x)-px(-LOWER.x),pz(LOWER.south)-pz(LOWER.north));
      for(const side of [-1,1]){
        const x=side*LOWER.shaft;
        ctx.fillRect(px(x-LOWER.half),pz(LOWER.entry),px(x+LOWER.half)-px(x-LOWER.half),pz(LOWER.north)-pz(LOWER.entry));
      }
    },
  },
  text:{
    tag:'第九关 / 永夜下层街区',
    title:'霓雨下城',
    enter:'进入下城',
    brief:'走出地下车站，击败失控巨型机甲。取得主控密钥后，到全息广告广场引爆数据裂隙。EMP 到达时，趁机械敌人停机反击。',
    bossName:'失控巨型机甲',
    keyItem:'主控密钥',
    portal:'数据裂隙',
    safe:'地下车站出口安全区',
    objective:'清除失控机械，击败巨型机甲并取得主控密钥',
    exitObjective:'回到全息广告广场，在数据裂隙前按 E 引爆',
    detonating:'数据裂隙解封，电磁脉冲扩散中',
    rage:'机甲进入过载，失控机械犬正在增援',
  },
};
