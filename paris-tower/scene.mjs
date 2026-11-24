import { stageBuilder, skySpecks } from '@level-kit/stage-craft.mjs';

const height = 7.2;
const platform = {x0:-11,x1:11,z0:-9,z1:9,y:height};
const beacon = [0,height,2], rescue = [10,height,-3];
const climbs = [[-1,1],[1,-1],[1,1],[-1,-1]].map(([sx,sz]) =>
  [[sx*20,0,sz*17],[sx*16,2.4,sz*14],[sx*12.6,4.8,sz*11],[sx*9.8,height,sz*7.7]]);
const story = {type:'tower', platform, beacon, rescue, climbs,
  ascent:{kind:'fight',id:'approach',name:'铁塔南梯口',at:[0,30],label:'清理铁塔南梯口',
    entries:[[-8,24],[8,24]],cap:8,interval:.36,mix:[0,0,2]},
  sectors:[
  {name:'战神广场',cap:9,interval:0.33,at:[-6,28],entries:[[-9,24],[9,24]]},
  {name:'塔脚钢架',cap:11,interval:0.29,at:[-16,13],entries:[[-23,12],[-18,4]]},
]};
const grid = Array.from({length:25},(_,i)=>i===0||i===24?'#'.repeat(25):'#'+'.'.repeat(23)+'#');
function ground(x,z) {
  if (Math.abs(x)<=11 && Math.abs(z)<=9) return height;
  if (Math.abs(x) <= 2.8 && Math.abs(z)>9 && Math.abs(z)<29)
    return height * Math.ceil((29-Math.abs(z))/20*36)/36;
  return 0;
}
const loot = [
  [-30,22,'花市明信片',110], [30,25,'望远镜目镜',150], [-21,-17,'铁匠铆钉',190],
  [28,-23,'号角乐谱',220], [0,18,'扶梯铭牌',280], [-7,4,'观景台门券',300],
  [5,-7,'无线电日志',370], [-8,-6,'塔灯透镜',390], [9,6,'航线罗盘',440], [-25,2,'巡展铜章',260],
];
const ammo = [[0,30],[4,23],[-5,5],[6,3],[-6,-6],[6,-6],[21,-12],[-19,12],[0,-25],[-31,-4]];

function buildMap(context) {
  const {level, seededRandom} = context, random = seededRandom(1515);
  const b=stageBuilder(context,{iron:0x76513d, brass:0xd09d63, floor:0x526471, stone:0x8d8983, sky:0x37445b, light:0xffdd8a});
  b.floor('stone');
  // 四条向内收束的桁架、交叉腹杆和塔冠构成远近一致的铁塔轮廓。
  const rings = [[0,18],[7.2,10],[12,7.1],[20,3.8],[27,2.2],[35,1.1]];
  for (let i=1;i<rings.length;i++) {
    const [y0,r0]=rings[i-1],[y1,r1]=rings[i];
    for (const sx of [-1,1]) for (const sz of [-1,1]) {
      const a=[sx*r0,y0,sz*r0*.86], b1=[sx*r1,y1,sz*r1*.86];
      b.beam('iron',a,b1,i===1?.66:.32);
      b.beam('brass',[sx*(r0-.7),y0,sz*r0*.86],[sx*(r1-.5),y1,sz*r1*.86],.11);
      if (i===1) continue;
      for (const axis of [0,2]) {
        const far=[...b1]; far[axis]*=-1;
        b.beam('iron',a,far,.14);
      }
      if (sx>0) b.beam('brass',b1,[-sx*r1,y1,sz*r1*.86],.15);
    }
  }
  b.column('brass',0,0,.3,35,41);
  // 塔脚四个拱跨和铆接腹杆从广场上即可辨认。从两侧绕行不受装饰网格影响。
  for(const sign of [-1,1]) for(const axis of [0,2]) {
    const arch=(u,y) => axis===0?[u,y,sign*(15-y*.79)]:[sign*(17-y*.88),y,u*.86];
    for(let j=0;j<18;j++) {
      const u=(j-9)*1.7, v=u+1.7, h=6.7*Math.sqrt(Math.max(0,1-(u/15.3)**2)),
        h2=6.7*Math.sqrt(Math.max(0,1-(v/15.3)**2));
      b.beam('brass',arch(u,h),arch(v,h2),.26);
      b.beam('iron',arch(u,h),arch(v,7.1),.11);
    }
  }
  for(const sx of [-1,1]) for(const sz of [-1,1]) {
    for(let i=0;i<6;i++) {
      const near=18-i*1.33, far=near-1.33, y=i*1.2;
      b.beam('iron',[sx*(near-1.3),y,sz*near*.86],[sx*far,y+1.2,sz*far*.86],.19);
      b.beam('brass',[sx*near,y,sz*near*.86],[sx*(far-1.3),y+1.2,sz*far*.86],.12);
      b.beam('iron',[sx*(near-1.3),y,sz*near*.86],[sx*(far-1.3),y+1.2,sz*far*.86],.20);
    }
  }
  b.part('orb','light',0,41,0,.62,.62,.62,0xff9e57);
  b.block('floor',0,0,22,18,height-.35,height,true,true);
  for (const s of [-1,1]) {
    for (let j=0;j<36;j++) {
      const z=s*(29-(j+.5)*20/36), y=(j+1)*height/36;
      b.block('iron',0,z,5.6,20/36+.005,0,y,true,true);
      b.block('brass',0,z,5.5,.065,y,y+.025);
    }
    for(const x of [-7,7]) for(const z of [-9,9]) {
      // 角落保留登台缺口，楼梯口和东侧登机口畅通。
      if (s<0) continue;
      b.block('brass',x,z,3.6,.12,height+.75,height+.87,true);
      for(const dx of [-1.6,1.6]) b.column('iron',x+dx,z,.13,height,height+.85);
    }
    b.block('iron',s*4,0,1.55,2.4,height,height+.95,true);
    b.block('stone',s*15,20,4,1.5,0,1,true);
    b.block('stone',s*23,-6,1.65,4,0,1.15,true);
  }
  for(let i=0;i<52;i++) {
    const a=i*Math.PI*2/52, r=51+random()*13, x=Math.cos(a)*r, z=Math.sin(a)*r;
    const h=4+random()*8;
    b.block('sky',x,z,4+random()*4,3.5,-.1,h);
    b.part('roof','iron',x,h+1.2,z,5,2.5,4);
    for(let j=-1;j<=1;j++) b.part('box','light',x+j,h*.65,z-Math.sign(z)*1.78,.38,.65,.05,0xffbe74);
  }
  for(const side of [-1,1]) for(let j=-3;j<=3;j++) {
    const z=j*12;
    b.block('floor',side*30,z,7.5,9.8,-.02,.055);
    b.part('box','iron',side*29,.46,z,3,.6,.73,0x455e4d);
    b.column('iron',side*24,z,.19,0,3.7);
    b.part('orb','light',side*24,3.9,z,.49,.57,.49,0xffd883);
  }
  b.column('iron',beacon[0],beacon[2],.46,height,height+1.6);
  b.part('orb','light',0,height+1.8,2,.5,.5,.5,0x7affdf);
  for(let i=0;i<4;i++) {
    const [x,,z]=climbs[i][0]; b.part('box','light',x,.09,z,1.3,.13,1.3,0xffa84e);
  }
  b.lighting(0xe0e7ff,0x87654a,0xffcc8b,[[0,10,2,0x6affdf,12,13],[0,19,0,0xffbb69,48,30]]);
  level.spawn.set(0,0,35); level.gate.set(...rescue);
  level.stairs={x:0,z:0,baseY:0,topY:height,deckWidth:22,stairWidth:5.6,deckLength:18,run:20};
  level.bossSpawn.set(-24,0,-16); level.bossAnchor.copy(level.bossSpawn);
  b.flush();
}

function createEnvironment(context) {
  const {THREE,scene,shapes,setInstance}=context;
  const helicopter=new THREE.Group(), rotor=new THREE.Group();
  function piece(group,shape,color,x,y,z,w,h,d) {
    const part=new THREE.Mesh(shape,new THREE.MeshLambertMaterial({color}));
    part.position.set(x,y,z); part.scale.set(w,h,d); group.add(part); return part;
  }
  const shell=new THREE.SphereGeometry(1,12,8);
  piece(helicopter,shell,0xb69b71,0,0,0,1.45,.95,2.5);
  piece(helicopter,shell,0x7eb6c7,0,.15,1.35,1.23,.66,1.25);
  piece(helicopter,shapes.box,0x745e43,0,.2,-3.2,.48,.5,3.6);
  piece(helicopter,shapes.box,0xf5b54a,0,.77,-4.9,.16,1.6,.79);
  for (const sign of [-1,1]) {
    piece(helicopter,shapes.box,0x444753,sign,-1.1,0,.15,.17,3.8);
    for(const z of [-1,1]) piece(helicopter,shapes.box,0x55535b,sign,-.8,z,.17,.65,.18);
  }
  rotor.position.y=1.15;
  piece(rotor,shapes.box,0x373741,0,0,0,8.7,.08,.25);
  piece(rotor,shapes.box,0x373741,0,0,0,.25,.08,8.7);
  helicopter.add(rotor);
  const cone=new THREE.Mesh(new THREE.ConeGeometry(1.7,6.5,12,1,true),
    new THREE.MeshBasicMaterial({color:0xffe6a0,transparent:true,opacity:.16,depthWrite:false,side:THREE.DoubleSide}));
  cone.position.set(-.85,-3.45,.8); helicopter.add(cone); scene.add(helicopter);
  const body=new THREE.IcosahedronGeometry(.55,0);
  const head=body.clone().scale(.52,.65,.65).translate(0,.28,.54);
  const leg=shapes.box.toNonIndexed().scale(.15,.52,.17);
  // 群影批次只需位置与法线，与近处真实攀爬凶兽分开计数。
  for(const g of [body,head,leg]) g.deleteAttribute('uv');
  const silhouette=context.mergeGeometries([body,head,...[-1,1].flatMap(s=>[-1,1].map(f=>leg.clone().translate(.23*s,-.38,.32*f)))]);
  // 每只群影保留独立步相。轨道整体旋转，静态实例矩阵只上传一次。
  const crowdSize=96, phases=Float32Array.from({length:crowdSize},(_,i)=>i);
  silhouette.setAttribute('gaitPhase',new THREE.InstancedBufferAttribute(phases,1));
  const stride={value:0}, material=new THREE.MeshBasicMaterial({color:0x373448});
  material.onBeforeCompile=shader=>{
    shader.uniforms.gaitTick=stride;
    shader.vertexShader='attribute float gaitPhase;\nuniform float gaitTick;\n'+shader.vertexShader
      .replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.y += .125 * sin(gaitTick + gaitPhase);');
  };
  const silhouettes=new THREE.InstancedMesh(silhouette,material,crowdSize);
  silhouettes.name='Paris distant horde';
  for(let i=0;i<crowdSize;i++) {
    const a=i*2.39996, r=28+(i%7)*1.8;
    setInstance(silhouettes,i,Math.sin(a)*r,.4,Math.cos(a)*r,.9,.8,1.35,null,a);
  }
  silhouettes.computeBoundingSphere();
  silhouettes.boundingSphere.radius+=.1;
  scene.add(silhouettes);
  skySpecks(context,105,115,0xe9c59c,.065,15);
  let lastTick=-1,departure=null;
  return {update(t,playing,game) {
    const clock=game.time, state=game.story?.stage;
    if(state!=='boarded')departure=null;
    const inbound=state==='defend' && game.story.elapsed>=game.story.rescueDuration-3;
    if(state==='boarded')departure??=t;
    const leave=departure===null?0:Math.min(4,t-departure);
    helicopter.visible=inbound||state==='rescue'||state==='boarded' && leave<4;
    if (helicopter.visible) {
      const arrival=inbound?Math.min(1,Math.max(0,(game.story.rescueDuration-game.story.elapsed)/3)):0;
      helicopter.position.set(13+arrival*22+leave*6,9+arrival*7+leave*3+Math.sin(clock*2)*.12,-3-arrival*15);
      if(playing) {
        game.sound.stageEvent('rotor',game,helicopter.position);
        if(arrival===0 && !helicopter.userData.landed) game.sound.stageEvent('clear',game,helicopter.position);
      }
      helicopter.userData.landed=arrival===0;
      rotor.rotation.y=(clock+leave)*29;
    } else helicopter.userData.landed=false;
    const tick=Math.floor((game.phase==='ready'?t:clock)*8);
    if (lastTick===tick) return;
    lastTick=tick;
    silhouettes.rotation.y=.006*tick;
    stride.value=tick;
  }};
}

export default {grid, story, buildMap, createEnvironment, loot, ammo, weaponSkin:'paris-tower',
  lifts:[{x:12.5,z:3,width:3.2,depth:3.2,low:0,high:height}],
  createPortal:()=>({update(){}}),
  background:0x525776,fog:0x9b8792,config:{map:{cell:4,fog:.010},audio:{ambient:{frequency:600,activeGain:.065}}},
  terrain:{ground}, portal:{shield:false}, area(x,z){return ground(x,z)>6?'低层观景台':Math.abs(x)<3&&Math.abs(z)<29?'登塔阶梯':'战神广场';},
  text:{title:'巴黎铁塔：高塔救援',tag:'巴黎 / 战神广场',enter:'登上铁塔',bossName:'桁架巨兽',keyItem:'救援密钥',portal:'塔侧信标',
    brief:'沿广场阶梯登上观景台，点亮信标。守住平台后，前往东侧登机。'}};
