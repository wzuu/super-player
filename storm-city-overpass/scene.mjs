import {buildFacility,floorPlan} from '@level-kit/facility-map.mjs';
import {escapeRoute} from '@level-kit/escape-route.mjs';

const areas=[
  ['封锁地铁口','M',[-10,40,10,62]],['排水街','W',[-10,18,10,42]],
  ['积水沿街','W',[-6,-6,8,20]],['西侧铺廊','S',[-32,22,-8,30]],
  ['连排商铺','S',[-38,-6,-24,30]],['后巷','A',[-38,-10,12,2]],
  ['钟楼外街','C',[6,-10,46,2]],['折线匝道','R',[30,-46,46,-8]],
  ['高架接应区','B',[18,-64,50,-42]],
].map(([name,tile,bounds])=>({name,tile,bounds}));
const exit=[34,-55];
const rule='从地铁口突围。沿积水街或穿过西侧商铺抵达钟楼，再沿匝道进入桥下接应区。';
const parts=[
  {name:'排水街前排',count:4,anchor:[1,32],bounds:[-6,23,7,35],types:[0]},
  {name:'沿街封锁队',count:8,anchor:[1,8],bounds:[-5,0,7,17]},
  {name:'穿堂散敌',count:5,anchor:[-31,18],bounds:[-36,3,-25,25]},
  {name:'后巷追击队',count:6,anchor:[-17,-4],bounds:[-27,-8,-7,0]},
  {name:'钟楼外街',count:9,anchor:[22,-4],bounds:[11,-9,35,0]},
  {name:'匝道拦截队',count:6,anchor:[38,-29],bounds:[32,-40,44,-19]},
];
const story=escapeRoute({name:'钟楼外街封锁',rule,exit,label:'抵达高架桥下的救援车',
  victory:'救援车接到了你，带出的物资已入库。',parts,mix:[0,0,2,0,1,0]});
const clamp=v=>Math.min(1,Math.max(0,v));
function ground(x,z){
  // 地铁浅坡上街，积水主路低于商铺；匝道向桥下车场缓升。
  const subway=-1.6*clamp((z-40)/12);
  const gutter=-.55*clamp((10-Math.abs(x))/4)*clamp((35-z)/8)*clamp((z+6)/8);
  return subway+gutter+1.7*clamp((x-25)/5)*clamp((-z-12)/26);
}
function asphalt(g,w,h){
  g.fillStyle='#747f88';g.fillRect(0,0,w,h);
  for(let i=0;i<1200;i++){
    const x=(i*73)%w,y=(i*29+Math.floor(i/11)*7)%h;
    g.fillStyle=i%5?'#67747b':'#a5adb0';g.fillRect(x,y,1+i%3,1);
  }
  g.strokeStyle='#454f54';g.beginPath();g.moveTo(0,63);g.lineTo(35,59);g.lineTo(54,67);g.lineTo(80,64);g.stroke();
}
function facade({x,z,w,d,dr,dc,start,line},{solid,box}){
  if(dr===-1 && z===-10 && x>=10 && x<=28){
    // 钟楼前是倒塌的路段。矮护墙保持碰撞边界，从两条来路都能看见表盘。
    solid(x,z,w,d,1.25,0x71665e,-.2);
    box('trim',x,1.08,z,w,.15,.52,0xa69c85);
    return true;
  }
  const shop=x< -8 && z>0;
  const height=shop?4.8:7+((line*11+Math.floor(start/4))%4)*1.5;
  solid(x,z,w,d,height,shop?0x584e4b:0x465260,-.55);
  const face=(mat,y,width,h,thick,color,offset)=>box(mat,x-dc*offset,y,z-dr*offset,
    dc?thick:width,h,dr?thick:width,color);
  if(shop){
    face('trim',3.1,dr?w:d,.38,.62,0x935c43,.25);
    face('glass',1.65,(dr?w:d)*.78,1.73,.07,0x87afba,.22);
  }else{
    for(let y=3.6;y<height-.4;y+=3.1)
      face((start+line)%4===0?'light':'trim',y,(dr?w:d)*.57,1.2,.09,(start+line)%4===0?0xad956b:0x283844,.21);
  }
  return true;
}
function decorate({THREE,scene,box,shape,solid,sign}){
  scene.add(new THREE.HemisphereLight(0xd8edff,0x78818b,1.7));
  const sky=new THREE.DirectionalLight(0xc2dcff,1.9);sky.position.set(-25,43,30);scene.add(sky);
  // 开局站棚、黄黑隔离栏和纵向排水箅子将视线引向北面。
  for(const x of [-8,8]){
    solid(x,50,.65,.65,3.8,0x29495b);
    solid(x,57,.65,.65,3.8,0x29495b);
  }
  solid(0,54,18,10,.32,0x435567,3.8);
  sign('M2  地铁 · 末班停运',0,2.9,41,6,.82,0, '#dce9da','#23454f');
  for(const z of [36,30,24,18,12,6,0]){
    box('trim',0,.022,z,1.05,.035,2.4,0x25343b);
    for(let i=-2;i<=2;i++)box('trim',0,.049,z+i*.41,.94,.025,.11,0x798890);
  }
  for(const [x,z] of [[6,28],[-4,13],[18,-8],[33,-24]]) {
    solid(x,z,2.8,.95,1.05,0x647580);
    box('trim',x,.73,z+.49,2.6,.18,.035,0xdba544);
  }
  // 商铺屋顶保护穿堂路线，柜台之间留出退路，后门直达钟楼外街。
  for(const z of [20,9,-1]){
    solid(-32,z,10.8,5,.28,0x534d48,3.65);
    solid(-35,z,2.1,3.2,.98,0x825e47);
    for(const y of [1.25,1.92])box('trim',-35.7,y,z,1.2,.12,2.6,0xaa9073);
  }
  sign('配钥匙　钟表修理',-24.4,2.5,25,5.1,.75,Math.PI/2);
  // 钟楼实体位于折角内侧。四面表盘能从后巷和排水街分别辨认。
  solid(19,-16,7.4,7.4,12.7,0x655952);
  solid(19,-16,8.3,8.3,.6,0x353e47,12.5);
  const roof=new THREE.Mesh(new THREE.ConeGeometry(5.8,3.7,4),new THREE.MeshStandardMaterial({color:0x4a535e}));
  roof.rotation.y=Math.PI/4;roof.position.set(19,14.7,-16);scene.add(roof);
  for(let side=0;side<4;side++){
    const angle=side*Math.PI/2,x=19+3.8*Math.sin(angle),z=-16+3.8*Math.cos(angle);
    shape('cylinder','light',x,10.5,z,3,.16,3,0xcdbf90,angle,Math.PI/2);
    box('trim',x+.11*Math.sin(angle),11,z+.11*Math.cos(angle),.13,1.12,.14,0x283039);
    box('trim',x+.18*Math.sin(angle),10.55,z+.18*Math.cos(angle),1.35,.14,.14,0x283039,angle);
  }
  for(const z of [-48,-61]){
    solid(21,z,1.2,2,6.7,0x65727e);solid(47,z,1.2,2,6.7,0x65727e);
    solid(34,z,28,2,1.2,0x4c5865,5.8);
  }
  solid(34,-54,31,19,.8,0x555d6b,7);
  solid(41,-55,3.45,6,2.6,0x607d73);
  box('trim',41,1.85,-51.92,3.02,1.06,.1,0x29444e);
  for(const x of [39.8,42.2])box('light',x,.7,-51.9,.5,.28,.1,0xf2cf90);
  sign('救援接应',41,2.93,-51.8,3.1,.62);
  // 湿路有铺装反光与积水边线；水面高度服从实际地面，街两侧可避水。
  for(const z of [30,23,16,9,3])box('glass',3,.03,z,3.6,.035,4.8,0x709cb5);
}
function rain({THREE,scene,seededRandom}){
  const rand=seededRandom(99),vertices=[],tails=[];
  for(let i=0;i<1600;i++){
    const x=rand()*94-43,z=rand()*134-68,y=rand()*22;
    vertices.push(x,y,z,x-.12,y+.68,z);
    tails.push(0,.68);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('tail',new THREE.Float32BufferAttribute(tails,1));
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0}},
    vertexShader:'uniform float time; attribute float tail; void main(){vec3 p=position;p.y=mod(position.y-tail-time*10.,22.)+tail;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',
    fragmentShader:'void main(){gl_FragColor=vec4(.64,.78,.91,.24);}'});
  const drops=new THREE.LineSegments(geometry,material);scene.add(drops);
  return {update(t){material.uniforms.time.value=t;}};
}
const plan={spots:{spawn:[0,46],gate:exit,bossAnchor:[35,-46],bossSpawn:[30,-54]},ground,
  metalness:.24,roughness:.68,wallHeight:7,wallColor:0x4a5660,floorTexture:asphalt,edge:facade,decorate};
export default{
  pageTitle:'雨城高架接应',weaponSkin:'storm-city-overpass',story,grid:floorPlan(areas,54,68),
  config:{map:{cell:2,navCell:1,fog:.009},player:{safeTime:1.3},beasts:{sight:23,memory:6}},
  buildMap:ctx=>buildFacility(ctx,plan),createEnvironment:rain,background:0x384c61,fog:0x576c80,
  terrain:{ground,moveScale:(x,z)=>ground(x,z)<-.18 && z<35 ? .88 : 1},
  ammo:[[4,48],[-7,29],[-30,13],[4,7],[12,-5],[36,-17],[28,-50]],
  loot:[[-4,50,'末班车票',70],[-34,7,'修表匠的怀表',230],[4,14,'排涝队铭牌',110],
    [-18,-5,'失物招领册',95],[28,-3,'旧钟楼照片',115],[44,-46,'救援灯芯',125]],portal:{shield:false,visible:false},manualLoot:true,
  area:(x,z)=>areas.find(({bounds:[a,b,c,d]})=>x>=a&&x<c&&z>=b&&z<d)?.name??'封锁街区',
  text:{title:'雨城高架接应',tag:'雨城 / 突围',enter:'进入封锁街区',brief:rule,objective:rule,
    safe:'封锁地铁口',bossName:'街区巨兽',winBrief:'你已抵达桥下救援车。'},
};
