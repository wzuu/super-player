import {buildFacility,floorPlan} from '@level-kit/facility-map.mjs';
import {convoyMission} from '@level-kit/convoy.mjs';
import {polarModel} from '@level-kit/polar-model.mjs';

const areas=[
  ['装甲车雪埂','V',[-13,43,13,65]],['钻塔风障','S',[-31,33,12,49]],
  ['研究站前厅','H',[-31,7,-13,38]],['暖库','L',[-43,12,-28,30]],
  ['恒温连廊','H',[-26,7,1,21]],['净化通道','H',[-14,-8,2,15]],
  ['冰湖观测栈道','I',[-9,-10,30,4]],['湖岸风闸','I',[15,-36,32,0]],
  ['背风跑道','R',[-15,-54,30,-30]],['救援舱','E',[-16,-58,1,-41]],
].map(([name,tile,bounds])=>({name,tile,bounds}));
const clip=x=>Math.max(0,Math.min(1,x));
function ground(x,z){
  const runway=clip((-z-24)/9);
  return .90*clip((31-z)/12)*(1-runway)+1.65*runway;
}
function sheltered(x,z){return (x<=-13 && z>=8 && z<=32) || (x<0 && z>=6 && z<20);}
const station=(x,z,name,stop)=>({at:[x,z],name,stop});
const track=[station(0,54,'装甲车'),station(0,41,'钻塔风障'),station(-22,41,'研究站外沿'),
  station(-22,16,'研究站前厅','确认技术员与样本已回温'),station(-6,16,'恒温连廊'),
  station(-6,-3,'冰湖西端'),station(23,-3,'观测栈道'),station(23,-19,'湖岸风闸','核对栈道通行记录'),
  station(23,-38,'背风跑道'),station(6,-45,'跑道救援线'),station(-7,-48,'救援舱')];
const parts=[
  {name:'钻塔猎犬',count:4,bounds:[-16,35,5,46],anchor:[-6,40],types:[0]},
  {name:'前厅侧翼',count:6,bounds:[-29,11,-15,29],anchor:[-21,20]},
  {name:'暖库散敌',count:3,bounds:[-40,16,-31,27],anchor:[-35,22],types:[0]},
  {name:'观测台来敌',count:7,bounds:[-2,-8,24,1],anchor:[12,-3]},
  {name:'湖岸风闸',count:6,bounds:[18,-31,29,-11],anchor:[22,-21]},
  {name:'跑道拦截队',count:6,bounds:[-10,-50,17,-35],anchor:[3,-41]},
];
function technician(THREE){
  const root=new THREE.Group(),shell=new THREE.MeshStandardMaterial({color:0xe7a44f}),
    pants=new THREE.MeshStandardMaterial({color:0x34495c}),caseMat=new THREE.MeshStandardMaterial({color:0xcad4c9});
  function piece(x,y,z,w,h,d,mat){
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);root.add(m);
  }
  piece(0,.12,0,.64,.68,.42,shell);
  for(const x of [-.18,.18]){piece(x,-.54,0,.25,.70,.30,pants);piece(x,-.90,.05,.29,.17,.39,pants);}
  for(const x of [-.39,.39])piece(x,.02,.04,.16,.52,.23,shell);
  const hood=new THREE.Mesh(new THREE.SphereGeometry(.26,12,8),shell);hood.position.y=.64;root.add(hood);
  piece(0,.63,.2,.33,.13,.12,pants);piece(0,.13,-.32,.51,.52,.27,caseMat);
  piece(0,.2,-.47,.40,.10,.04,shell);return root;
}
const rule='保护携带样本的技术员经过回温站和观测栈道，陪同抵达跑道救援舱。';
const story=convoyMission({name:'技术员',group:'冰站撤运线',rule,track,model:technician,speed:3.15,
  loss:'携样技术员已阵亡，样本撤运失败',victory:'技术员带着封存样本进入救援舱。'},parts,[0,0,2,1,0,2]);
function snow(g,w,h){
  g.fillStyle='#c2d1d3';g.fillRect(0,0,w,h);
  for(let i=0;i<260;i++){
    g.fillStyle=i%4?'#b3c4cc':'#d8e1dd';const x=(i*83)%w,y=(i*41+Math.floor(i/7)*3)%h;
    g.fillRect(x,y,3+i%9,1);
  }
}
function edge({x,z,w,d,dr,dc},{solid,box}){
  const warm=sheltered(x,z),h=warm?3.85:z< -28?1.4:2.2;
  solid(x,z,w,d,h,warm?0x879ba2:0x96a9b2,-.3);
  box('wall',x,h-.27,z,dc ? .65 : w,.24,dr ? .65 : d,0xd6e2dc);
  if(warm)box('trim',x-dc*.22,1.36,z-dr*.22,dc ? .12 : w,.28,dr ? .12 : d,0xb15f40);
  return true;
}
function decorate({THREE,scene,solid,shape,box,sign,seededRandom}){
  scene.add(new THREE.HemisphereLight(0xc3e0ed,0x9ba7ac,1.85));
  const sun=new THREE.DirectionalLight(0xffdcad,1.75);sun.position.set(-31,32,24);scene.add(sun);
  // 半埋车辆只露出装甲舱和轮组上缘，钻塔在风障尽头给出第一次转向。
  solid(7,54,5.3,8.5,2.05,0x687e78);
  solid(7,54,4.5,4.2,.95,0x69837e,2.03);
  for(const z of [51.6,54,56.4])shape('cylinder','wall',4.3,.49,z,1.5,.4,1.5,0x384b53,0,0,Math.PI/2);
  for(const x of [-29,-24])for(const z of [36,41])solid(x,z,.55,.55,8.2,0x5c6c77);
  for(const y of [2.3,4.8,7.8]){
    solid(-26.5,38.5,5.7,5.7,.18,0x72878e,y);
    shape('box','trim',-26.5,y-1.2,36,.22,5.8,.24,0xad7153,0,0,1.13);
  }
  for(const x of [-16,-8,0])solid(x,35.5,5.8,.48,2.15,0x79929f);
  for(const [x,z] of [[-27,18],[-36,23],[-10,19],[-8,8]]){
    solid(x,z,1.34,2.0,1.22,0x9a6850);
    for(let i=0;i<4;i++)box('light',x+.68,.4+i*.17,z,.07,.07,1.45,0xf6ac69);
  }
  for(const z of [28,17,10]){
    for(const x of [-29,-15])solid(x,z,.55,.8,3.8,0xb38465);
    solid(-22,z,14.6,1.15,.28,0x798d98,3.8);
  }
  solid(-36,21,11,15,.26,0x8e9ba1,3.6);
  sign('回温前厅',-21,3.2,29,4.6,.86);
  for(let x=-6;x<=22;x+=2){
    box('wall',x,.04,-3,.27,.08,4.8,0x728c96);
    if(x>-4 && x<20)for(const z of [-6,.5])solid(x,z,.23,.28,1.07,0x67848e);
  }
  for(const x of [2,12,22])box('glass',x,.04,-8,8.2,.06,2.6,0x84b7c6);
  for(const [x,z] of [[-18,24],[-3,10],[26,-13],[18,-29],[14,-39],[-9,-38]]){
    solid(x,z,1.45,2.1,1.05,0x7f9192);box('trim',x,1.11,z,1.55,.13,2.2,0xb49865);
  }
  for(const z of [-14,-21,-28]){
    solid(28,z,.7,.8,4.0,0x84949b);
    box('trim',27.5,3.7,z,1.65,.20,.23,0xe5a365);
  }
  for(let x=-9;x<18;x+=3.5)box('light',x,.09,-42,1.1,.16,.32,0xe9b165);
  solid(-9,-53,7.8,5.1,2.85,0x92a4a5);
  box('wall',-9,3.0,-53,8.1,.42,5.6,0xd7ddd0);
  box('glass',-9,1.7,-50.38,4.6,1.15,.1,0x6fa3b6);
  sign('样本撤运 / 救援舱',-9,3.45,-50.3,6.5,.86);
  const rand=seededRandom(101),points=new Float32Array(740*3);
  for(let i=0;i<points.length;i+=3){points[i]=rand()*92-46;points[i+1]=rand()*16;points[i+2]=rand()*136-68;}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(points,3));
  const flakes=new THREE.Points(geo,new THREE.PointsMaterial({size:.07,color:0xf0f4f0,transparent:true,opacity:.65,depthWrite:false}));
  scene.add(flakes);return {flakes};
}
function createEncounter({mapData}){
  return {reset(){this.phase='calm';this.temperature=100;this.status=null;this.moveScale=this.beastSpeedScale=1;},
    update(g,dt){
      const t=(g.time+7)%37,p=g.player,inside=sheltered(p.x,p.z);
      this.phase=t<16?'calm':t<20?'warning':t<33?'active':'calm';
      const storm=this.phase==='active';
      this.temperature=Math.max(40,Math.min(100,this.temperature+dt*(inside?5:storm?-2.7:-.8)));
      this.moveScale=this.temperature<70 ? .85 : 1;this.beastSpeedScale=storm?1.13:1;
      this.status={title:inside?'室内回温':storm?'暴雪过境':this.phase==='warning'?'风暴预警':'室外寒冷',
        detail:'体温 '+Math.round(this.temperature)+' / 100'};
      mapData.flakes.visible=!inside;mapData.flakes.material.opacity=storm ? .83 : .32;
      mapData.flakes.position.set(Math.sin(g.time*1.3)*(storm?2.9:.4),-(g.time*(storm?3.2:1.4))%2,0);
    }};
}
const facility={spots:{spawn:[0,57],gate:[-7,-48],bossAnchor:[8,-41],bossSpawn:[6,-39]},
  ground,roughness:.79,metalness:.22,wallHeight:3,wallColor:0x96a6aa,floorTexture:snow,edge,decorate};
export default {pageTitle:'冰原样本撤运',weaponSkin:'frost-sample-escort',story,grid:floorPlan(areas,48,68),
  config:{map:{cell:2,navCell:1,fog:.010},beasts:{sight:21,memory:6}},buildMap:ctx=>buildFacility(ctx,facility),
  buildBeastModel:polarModel,buildRageModel:h=>polarModel(3,h,true),createEncounter,
  portal:{shield:false,visible:false},manualLoot:true,background:0x8097aa,fog:0xa9bcc6,terrain:{ground},
  ammo:[[-6,50],[-19,35],[-25,13],[-4,10],[12,-2],[27,-23],[8,-40]],
  health:[[-24,20,24],[20,-24,22]],
  loot:[[-4,57,'装甲车航标',80],[-17,45,'钻塔铜钩',100],[-24,24,'研究员手札',110],[-35,18,'封存冰藻',245],
    [-11,13,'恒温管样片',100],[-3,-4,'冰层读数卡',105],[12,-3,'观察镜盖',95],[26,-24,'风向测片',120],
    [2,-42,'撤运信标',110],[-12,-45,'救援舱通行签',145]],
  area:(x,z)=>areas.find(({bounds:[a,b,c,d]})=>x>=a&&x<c&&z>=b&&z<d)?.name??'冰站风口',
  text:{title:'冰原样本撤运',tag:'极圈研究站 / 护送',enter:'进入装甲车雪埂',brief:rule,objective:rule,
    safe:'装甲车雪埂',bossName:'极夜巨兽',winBrief:'样本与技术员已抵达救援舱。'}};
