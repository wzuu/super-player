import {buildFacility,floorPlan} from '@level-kit/facility-map.mjs';
import {convoyMission} from '@level-kit/convoy.mjs';
import {seaModel} from '@level-kit/sea-model.mjs';

const areas=[
  ['南潜水舱','D',[-27,40,-7,64]],['海藻林栈道','W',[-25,24,12,44]],
  ['珊瑚拱廊','A',[-4,-8,13,32]],['积水祭器室','P',[11,5,38,23]],
  ['浅水回廊','P',[24,-5,38,9]],['议事厅南廊','C',[-28,-12,38,1]],
  ['盘坡前庭','C',[-28,-29,-10,-7]],['外盘坡','R',[-26,-31,30,-17]],
  ['议事厅东台','R',[15,-49,32,-24]],['屋顶回收台','T',[-7,-55,31,-39]],
].map(([name,tile,bounds])=>({name,tile,bounds}));
const clip=x=>Math.max(0,Math.min(1,x));
function ground(x,z){
  // 祭器室两端的斜坡下到积水层，主线始终沿高栈道和盘坡走。
  const basin=clip((x-10)/11)*clip((z+7)/9);
  const ramp=clip((-z-13)/7)*clip((x+15)/34);
  return 1.25-2.8*basin+5.2*Math.max(ramp,clip((-z-34)/8));
}
const point=(x,z,name,stop)=>({at:[x,z],name,stop});
const track=[
  point(-16,53,'潜水舱'),point(-16,32,'海藻林栈道'),point(4,32,'珊瑚拱廊'),
  point(4,13,'珊瑚拱廊','核对拱廊采样记录'),point(4,-5,'议事厅南廊'),
  point(-17,-5,'盘坡前庭'),point(-17,-23,'盘坡脚','接通屋顶回收信标'),
  point(22,-23,'议事厅外盘坡'),point(22,-46,'东侧屋顶'),point(4,-46,'屋顶回收台'),
];
const parts=[
  {name:'海藻林前排',count:5,bounds:[-22,26,-9,39],anchor:[-15,33],types:[0]},
  {name:'拱廊伏兵',count:8,bounds:[-2,5,10,25],anchor:[5,15]},
  {name:'浅水侧翼',count:5,bounds:[20,7,34,20],anchor:[27,13]},
  {name:'珊瑚拦截队',count:7,bounds:[-23,-10,14,-2],anchor:[-9,-6]},
  {name:'坡脚驻守',count:5,bounds:[-25,-27,-12,-12],anchor:[-18,-22]},
  {name:'屋顶防卫',count:4,bounds:[8,-51,28,-40],anchor:[18,-45]},
];
function droneModel(THREE){
  const root=new THREE.Group(),hull=new THREE.MeshStandardMaterial({color:0xe5a854,metalness:.54,roughness:.4});
  const dark=new THREE.MeshStandardMaterial({color:0x235056});
  const pod=new THREE.Mesh(new THREE.SphereGeometry(.56,12,8),hull);
  pod.scale.set(1,.66,1.25);root.add(pod);
  for(const x of [-.57,.57])for(const z of [-.45,.45]){
    const duct=new THREE.Mesh(new THREE.TorusGeometry(.24,.07,5,14),dark);
    duct.position.set(x,0,z);duct.rotation.x=Math.PI/2;root.add(duct);
  }
  const lens=new THREE.Mesh(new THREE.SphereGeometry(.2,10,8),new THREE.MeshBasicMaterial({color:0x9dffee}));
  lens.position.set(0,.06,.60);root.add(lens);
  return root;
}
const rule='伴随勘探无人机经过拱廊和盘坡，在两个停靠点完成交接，送到议事厅屋顶。';
const story=convoyMission({name:'勘探无人机',group:'沉城回收路线',rule,track,model:droneModel,
  loss:'勘探无人机已损毁',victory:'屋顶吊架接住了勘探无人机，调查样本已装舱。'},parts,[0,2,0,1,0,0,2]);

function mosaic(g,w,h){
  g.fillStyle='#779795';g.fillRect(0,0,w,h);
  for(let j=0;j<4;j++)for(let i=-1;i<4;i++){
    const x=i*37+(j%2)*17,y=j*33;
    g.fillStyle=['#afbaa6','#8fa8a0','#91a29a'][(i+j+4)%3];g.fillRect(x,y,35,31);
    g.fillStyle='#6d8884';g.fillRect(x+3,y+27,18,2);
  }
}
function edge({x,z,w,d,dc,dr},{solid,box}){
  const sunken=x>13 && z>0, h=sunken?4.2:z< -15?1.05:2.75;
  solid(x,z,w,d,h,0x647f79,-.25);
  box('trim',x-dc*.12,h-.18,z-dr*.12,dc ? .56:w,.22,dr ? .56:d,0xbdb49b);
  return true;
}
function decorate({THREE,scene,box,solid,shape,sign}){
  scene.add(new THREE.HemisphereLight(0xc1e9df,0x6c8e91,1.95));
  const sun=new THREE.DirectionalLight(0xffe4be,1.8);sun.position.set(-26,45,27);scene.add(sun);
  // 圆舱的舷窗、橙色耐压框和舱顶吊索朝向第一段木栈道。
  for(const x of [-24,-9]){
    solid(x,53,1.15,11,2.7,0x526b70);
    for(const z of [50,54,58])shape('cylinder','glass',x,1.65,z,1.1,.32,1.1,0x9cd9df,0,0,Math.PI/2);
  }
  for(const x of [-21,-11])solid(x,42,.75,1.0,4.7,0xb48352);
  solid(-16,42,10.7,.95,.58,0x819498,4.15);
  sign('潜航舱  03',-16,3.85,42.51,4.3,.8);
  for(let z=33;z<=47;z+=1.35)box('trim',-16,.04,z,8.7,.08,.26,0x7b6752);
  for(let x=-16;x<5;x+=1.35)box('trim',x,.05,32,.25,.09,6.4,0x907c61);
  for(const [x,z] of [[-24,32],[-18,26],[-9,39],[-5,27],[12,28],[13,10],[28,16],[33,5]]){
    for(let i=0;i<5;i++)shape('stone','wall',x+Math.sin(i*2)*.8,1+i*.24,z+Math.cos(i*2)*.65,.4,2.2+i*.32,.4,
      i%2?0x487d67:0x699679,0,.15*Math.sin(i),.21*Math.cos(i));
  }
  // 拱顶由两侧肋骨合拢，中线留给无人机，侧边遗落祭器指向下层小室。
  for(const z of [22,12,2]){
    for(const side of [-1,1]){
      solid(4+side*5.4,z,1.15,1.7,4.4,0xad857c);
      shape('box','trim',4+side*3.5,4.9,z,4.8,.72,1.4,0xc89b88,0,0,-side*.34);
    }
    box('wall',4,5.48,z,3.7,.65,1.4,0xd1ab90);
  }
  for(const [x,z] of [[-20,31],[9,15],[32,15],[-9,-9],[-24,-17],[15,-28],[26,-44]]){
    solid(x,z,2.5,1.05,1.1,0x697e7b);box('trim',x,1.14,z,2.65,.18,1.18,0xc1b196);
  }
  for(const [x,z] of [[1,13],[-20,-23]]){
    solid(x,z,1.1,1.1,.94,0x778a83);box('light',x,1.04,z,.87,.19,.85,0x77f1d8);
  }
  for(let x=-14;x<=19;x+=2.4){
    box('trim',x,.04,-23,.28,.08,6.8,0xb2ad91);
    solid(x,-28,.33,.36,1.35,0x677e79);
  }
  for(const x of [0,9]){
    solid(x,-49,1.1,1.6,5.6,0x678582);
    box('trim',x,3.8,-49,1.25,.27,1.7,0xe4b576);
  }
  solid(4.5,-49,10.4,1.23,.7,0x8a9990,5.1);
  sign('议事厅 · 回收吊架',4.5,4.89,-48.28,6.4,.95);
  // 可见的破损穹顶肋骨位于地图边缘，泄水从东侧裂口进入下沉房间。
  const arch=new THREE.Mesh(new THREE.TorusGeometry(62,.65,6,60,Math.PI),new THREE.MeshStandardMaterial({color:0x678d89}));
  arch.position.set(0,-4,-12);scene.add(arch);
  const water=new THREE.Mesh(new THREE.PlaneGeometry(15,15),new THREE.MeshStandardMaterial({
    color:0x4caaa9,transparent:true,opacity:.62,roughness:.31,metalness:.39}));
  water.rotation.x=-Math.PI/2;water.position.set(28,-1.4,13.7);scene.add(water);
  return {water};
}
function createEncounter({mapData}){
  return {reset(){this.phase='calm';this.depth=.16;this.status=null;mapData.water.position.y=-1.55+this.depth;},
    update(g){
      const t=(g.time+9)%44;
      this.phase=t<17?'calm':t<21?'warning':t<35?'flood':'drain';
      this.depth=.16+1.15*clip((t-21)/4)*clip((42-t)/7);
      mapData.water.position.y=-1.55+this.depth;
      this.status=this.phase==='calm'?null:{title:this.phase==='warning'?'穹顶裂缝扩大':this.phase==='flood'?'侧室进水':'积水消退',
        detail:'屋顶主线保持干燥',remaining:(this.phase==='warning'?21:this.phase==='flood'?35:44)-t};
    }};
}
const facility={spots:{spawn:[-16,56],gate:[4,-46],bossAnchor:[18,-38],bossSpawn:[20,-36]},
  ground,roughness:.64,metalness:.18,wallHeight:3.2,wallColor:0x7b9288,floorTexture:mosaic,edge,decorate};
export default {pageTitle:'沉城屋顶回收',weaponSkin:'sunken-rooftop-recovery',story,grid:floorPlan(areas,44,68),
  config:{map:{cell:2,navCell:1,fog:.009},beasts:{sight:23,memory:6}},buildMap:ctx=>buildFacility(ctx,facility),
  buildBeastModel:seaModel,createEncounter,portal:{shield:false,visible:false},manualLoot:true,
  background:0x486e77,fog:0x759597,terrain:{ground,moveScale:(x,z,y,g)=>y<-.5 && g?.encounter?.depth>.6 ? .65 : 1},
  ammo:[[-20,50],[-12,34],[8,19],[3,0],[-23,-21],[14,-22],[23,-41]],
  health:[[-13,49,22],[-20,-18,25]],
  loot:[[-12,54,'潜航测深表',85],[-19,33,'海藻标本夹',110],[9,26,'古廊铭牌',90],[28,13,'珊瑚祭器',250],
    [31,1,'潜水铜镜',155],[-10,-4,'议事厅印片',120],[-17,-16,'压舱铅封',100],[8,-25,'盘坡量尺',95],
    [22,-38,'吊钩吊牌',110],[1,-43,'水下回收证',140]],
  area:(x,z)=>areas.find(({bounds:[a,b,c,d]})=>x>=a&&x<c&&z>=b&&z<d)?.name??'穹顶外缘',
  text:{title:'沉城屋顶回收',tag:'穹顶科考 / 护送',enter:'进入南潜水舱',brief:rule,objective:rule,
    safe:'潜水舱',bossName:'深海护卫',winBrief:'无人机已安全抵达屋顶吊架。'}};
