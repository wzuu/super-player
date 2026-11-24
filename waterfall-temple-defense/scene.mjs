import {buildFacility,floorPlan} from '@level-kit/facility-map.mjs';
import {defenseMission} from '@level-kit/defense.mjs';
import {jungleBeast} from '@level-kit/jungle-model.mjs';

const areas=[
  ['南河滩','B',[-17,34,17,62]],['下石梯','S',[-15,17,-3,42]],['蓄水阶庭','A',[-17,12,12,24]],
  ['南栈梯','S',[-4,-12,6,18]],['主祭台','T',[-26,-32,8,-8]],['布幔补给庭','T',[-35,-30,-21,-16]],
  ['东瀑木栏','E',[6,-20,34,-10]],['水磨深池','W',[26,-25,42,2]],['林缘木板回路','W',[8,-5,36,17]],
  ['北溶洞','C',[-22,-52,-12,-30]],['矿泉洞厅','C',[-29,-62,0,-46]],['上游石滩','W',[-5,-55,38,-43]],
  ['临瀑外环','W',[30,-49,42,-18]],
].map(([name,tile,bounds])=>({name,tile,bounds}));
const clip=x=>Math.max(0,Math.min(1,x));
function ground(x,z){
  const east=clip((34-x)/25),north=clip((z+52)/18);
  const rock=(2.2*clip((39-z)/16)+3.2*clip((14-z)/18)+1.6*clip((-5-z)/10))*Math.min(east,north);
  const boardwalk=1.58*clip((x-34)/2)*clip((2-z)/4)*clip((z+26)/7);
  return Math.max(rock,boardwalk);
}
const rule='在瀑顶祭台发出救援信号，守住三处木栏。低地涨水时留意改道的敌群。';
const lanes=[
  {name:'南栈梯',barrier:[1,-5,10,.46],strength:256,delay:0,path:[[1,12],[1,-3.45]],inside:[1,-11]},
  {name:'东瀑木栏',barrier:[10,-15,.5,10],strength:245,delay:8,
    path:[[32,-15],[11.65,-15]],detour:[[36,-4],[36,-18],[24,-18],[11.65,-15]],inside:[5,-15]},
  {name:'北溶洞',barrier:[-17,-35,10,.5],strength:220,delay:18,path:[[-17,-45],[-17,-36.65]],inside:[-17,-28]},
];
const parts=[
  {name:'河岸猎群',count:5,bounds:[-14,26,5,40],anchor:[-8,34],types:[0]},
  {name:'布幔补给庭',count:4,bounds:[-32,-28,-22,-17],anchor:[-27,-22]},
  {name:'祭台守卫',count:4,bounds:[-19,-26,2,-12],anchor:[-12,-18]},
  {name:'南栈梯',count:8,bounds:[-13,12,9,21],anchor:[0,17]},
  {name:'东瀑木栏',count:7,bounds:[27,-6,39,1],anchor:[32,-3]},
  {name:'北溶洞',count:7,bounds:[-26,-58,-9,-46],anchor:[-18,-50]},
];
const story=defenseMission({name:'瀑顶防线',rule,beacon:[-9,-23],seconds:55,railColor:0x775038,
  flooded:g=>g.encounter?.phase==='flood',approach:'从河滩沿两段石梯前往高台',victory:'瀑顶救援队接到信号，防线守住了。',lanes},parts,[0,0,2,1,0,2]);
function decorate({THREE,scene,solid,box,shape,sign}){
  scene.add(new THREE.HemisphereLight(0xd2e5d0,0x74533c,1.9));
  const sun=new THREE.DirectionalLight(0xf1dcaa,1.85);sun.position.set(24,45,-19);scene.add(sun);
  for(const [x,z] of [[-22,-27],[-2,-27],[-22,-12],[-2,-12]]){
    solid(x,z,1.65,1.65,4.2,0x798775);
    box('trim',x,3.94,z,2.3,.55,2.2,0xb9ac7c);
    for(const h of [.45,1.85,3.1])box('trim',x,h,z,1.82,.17,1.81,0x556f5d);
  }
  for(const x of [-22,-2])box('trim',x,4.55,-20,2.6,.66,17,0x647968);
  for(const z of [-28,-12])box('trim',-12,4.92,z,22,.66,2.9,0x748b70);
  solid(-9,-26,2.6,2.1,.88,0x8b8467);shape('stone','light',-9,1.9,-26,.81,1.84,.81,0x93efd1);
  sign('高台救援信标',-9,2.1,-24.8,3.5,.6);
  for(const [x,z] of [[-6,-12],[-17,-26],[-23,-21],[3,-23],[-12,18],[-8,35],[28,-21]]){
    solid(x,z,2.8,1.3,1.13,0x758171);box('trim',x,1.18,z,2.95,.14,1.42,0x91a27b);
  }
  for(const z of [0,3,6,9,12,15])box('trim',1,.08,z,6,.14,.66,0x92795a);
  for(const x of [15,18,21,24,27])box('trim',x,.08,-15,.53,.14,7.5,0x8f7359);
  for(let z=-23;z<1;z+=.85)box('trim',37.8,.075,z,4.2,.14,.76,0x986f52);
  for(const z of [-21,-16,-11,-6])solid(40,z,.3,.35,1.1,0x74664a);
  for(const z of [-42,-46,-50]){
    for(const x of [-22.6,-11.2])solid(x,z,1.4,2.6,4.7,0x576860);
    box('wall',-17,4.85,z,13,.92,2.9,0x657266);
  }
  for(const x of [-34,-22])solid(x,-28,.56,.56,3,0x70644e);
  shape('box','trim',-28,3.04,-26.5,12.4,.18,5.9,0x996d4d,0,.08);
  for(const [x,z] of [[8,45],[-12,54],[31,12],[39,-34],[5,-50],[-31,-21]]){
    shape('cylinder','wall',x,2.55,z,.91,5.1,.91,0x6f634e);
    for(let j=0;j<4;j++)shape('stone','trim',x+Math.sin(j)*1.3,4.9+j*.15,z+Math.cos(j)*1.3,3.7,1.8,3.7,0x526f52);
  }
  const waterMaterial=new THREE.MeshStandardMaterial({color:0x519b9a,transparent:true,opacity:.7,roughness:.32});
  const stream=new THREE.Mesh(new THREE.PlaneGeometry(14,19),waterMaterial);stream.rotation.x=-Math.PI/2;
  stream.position.set(35,.24,-8);scene.add(stream);
  const veil=new THREE.Group();scene.add(veil);
  for(let j=0;j<9;j++){
    const x=-28-(j%3)*2.1,z=-5-j*1.13,h=10+(j%4)*1.18;
    shape('stone','wall',x,3.8,z,5.1,h,4.3,j%2?0x597064:0x667f70);
  }
  for(let i=0;i<9;i++){
    const drop=new THREE.Mesh(new THREE.CylinderGeometry(.35,.46,12,6),new THREE.MeshBasicMaterial({
      color:i%2?0xb0e3d4:0x7bb8b7,transparent:true,opacity:.58,depthWrite:false}));
    drop.position.set(-25.6-i*.25,6.65,-6-i*.85);veil.add(drop);
  }
  return {stream,veil};
}
function createEncounter({mapData}){
  return {reset(){this.phase='calm';this.status=null;this.depth=0;},
    update(g){const t=g.time%36;this.phase=t<11?'calm':t<15?'warning':t<28?'flood':'calm';
      this.depth=clip((t-15)/3)*clip((31-t)/3);mapData.stream.position.y=.22+this.depth;
      mapData.veil.position.y=Math.sin(g.time*4)*.27;
      this.status=this.phase==='calm'?null:{title:this.phase==='warning'?'上游水声增强':'水磨深池涨水',detail:'临瀑木板回路可通行'};
    }};
}
const facility={ground,solidGround:true,roughness:.83,metalness:.12,wallHeight:1.8,wallColor:0x657c6b,
  spots:{spawn:[1,54],gate:[-9,-23],bossAnchor:[-9,-15],bossSpawn:[-12,-16]},
  floorTexture(g,w,h){g.fillStyle='#829286';g.fillRect(0,0,w,h);for(let j=0;j<4;j++){g.fillStyle='#617363';g.fillRect(j*32,0,1.3,h);g.fillRect(0,j*32,w,2);g.fillStyle='#8f9b80';g.fillRect(j*38%w,j*23%h,19,3);}},
  decorate};
export default {pageTitle:'瀑顶神庙防线',weaponSkin:'waterfall-temple-defense',story,
  grid:floorPlan(areas,48,66),config:{map:{cell:2,navCell:1,fog:.012},beasts:{sight:22}},
  buildMap:ctx=>buildFacility(ctx,facility),buildBeastModel:jungleBeast,buildRageModel:h=>jungleBeast(3,h,true),
  background:0x829c94,fog:0x90a89e,terrain:{ground,moveScale:(x,z,y,g)=>
    x>30 && x<35 && z<1 && z>-15 && g?.encounter?.depth>.65 ? .58 : 1},
  portal:{shield:false,visible:false},manualLoot:true,createEncounter,
  ammo:[[-7,48],[-10,24],[5,15],[-24,-17],[-3,-24],[-18,-27],[4,-16]],health:[[-7,17,22],[-28,-24,24]],
  loot:[[0,51,'河滩渔牌',75],[-8,30,'石阶浮刻',100],[-28,-21,'翡翠雨神像',245],[-4,19,'旧藤索',75],
    [13,10,'外环木榫',85],[34,-12,'水磨石印',115],[-19,-51,'溶洞钟乳片',110],[-16,-20,'仪式木碗',95],
    [-5,-29,'青玉嵌片',110],[2,-14,'巡台符签',140]],
  area:(x,z)=>areas.find(({bounds:[a,b,c,d]})=>x>=a&&x<c&&z>=b&&z<d)?.name??'瀑顶',
  text:{title:'瀑顶神庙防线',tag:'瀑布溶洞 / 坚守',enter:'进入河滩',brief:rule,objective:rule,safe:'南河滩',bossName:'羽蛇守护者',winBrief:'瀑顶防线已获救援。'}};
