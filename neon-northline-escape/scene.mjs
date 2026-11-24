import {buildFacility,floorPlan} from '@level-kit/facility-map.mjs';
import {escapeRoute} from '@level-kit/escape-route.mjs';
import {machineModel} from '@level-kit/machine-model.mjs';

const areas=[
  ['管道市场','M',[-12,26,12,66]],['升街坡道','S',[8,28,32,42]],
  ['夜市后街','S',[22,2,36,40]],['牌楼横街','N',[-30,-6,36,8]],
  ['地下诊所南廊','D',[-30,28,-10,38]],['诊所外廊','D',[-32,2,-18,32]],
  ['维修梯口','T',[-30,-18,-12,0]],['检修台阶','T',[-28,-42,-16,-16]],
  ['西端桥台','H',[-30,-50,-14,-36]],['桥下车场','P',[-18,-50,38,-34]],
  ['高架桥下街','P',[10,-36,30,0]],
].map(([name,tile,bounds])=>({name,tile,bounds}));
const clip=v=>Math.max(0,Math.min(1,v));
function ground(x,z){
  const market=-3.2*clip((z-2)/26)*(1-clip((x-8)/16));
  return market+6*clip((-z-14)/24)*clip((-x-8)/10);
}
const exit=[25,6,-42],rule='穿过地下诊所或沿坡道上夜市，经西侧检修梯跨过高架，到北线接应车撤离。';
const parts=[
  {name:'市场机器犬',count:4,bounds:[-8,31,9,43],anchor:[1,37],types:[0]},
  {name:'诊所外廊守卫',count:5,bounds:[-30,5,-20,28],anchor:[-25,20]},
  {name:'夜市后街炮组',count:8,bounds:[24,6,34,27],anchor:[29,17]},
  {name:'牌楼追堵队',count:8,bounds:[-14,-5,16,6],anchor:[4,-1]},
  {name:'检修梯前哨',count:5,bounds:[-28,-14,-15,-5],anchor:[-22,-10]},
  {name:'高架下巡逻',count:7,bounds:[12,-32,28,-8],anchor:[20,-22]},
];
const story=escapeRoute({name:'北线追堵',rule,exit,label:'登上高架，抵达北线接应车',parts,
  mix:[0,0,1,0,2,0,2],victory:'接应车驶离北线立交，你带出了本局物资。'});
function paving(g,w,h){
  g.fillStyle='#667682';g.fillRect(0,0,w,h);
  for(let i=0;i<4;i++){
    g.fillStyle='#414f62';g.fillRect(i*32,0,2,h);g.fillRect(0,i*32,w,2);
    for(const j of [6,25]){g.fillStyle='#a0a4a2';g.fillRect(i*32+j,6,2,2);g.fillRect(i*32+j,117,2,2);}
  }
  g.fillStyle='#747a79';g.fillRect(4,32,24,60);
}
function boundary({x,z,w,d,dc,dr,line,start},{solid,box}){
  const market=z>23 && x<18,bridge=z< -30, height=market?5.8:bridge?2.1:8.0;
  solid(x,z,w,d,height,market?0x394c52:0x465769,-.4);
  const stripe=(y,h,span,depth,color)=>box('trim',x-dc*.22,y,z-dr*.22,dc?depth:span,h,dr?depth:span,color);
  stripe(.4,.26,dr?w:d,.13,0xbba65f);
  if(!bridge){
    stripe(3,.65,Math.min(3.2,dr?w:d),.14,market?0x297778:0x725375);
    if((line+start)%3===0)stripe(4.45,1.2,1.35,.22,0x325870);
  }
  return true;
}
function decorate({THREE,scene,level,box,solid,shape,sign}){
  scene.add(new THREE.HemisphereLight(0xb7dfe9,0x816781,1.85));
  const sun=new THREE.DirectionalLight(0xffd6cb,1.7);sun.position.set(23,45,32);scene.add(sun);
  // 地下市场上方是悬挂的给排水管，西口可由诊所条纹识别，东口坡道有露天招牌。
  for(const x of [-8,8]){
    for(const z of [33,43,53,61])shape('cylinder','wall',x,4.4,z,.72,10,.72,0x767d74,0,Math.PI/2);
    for(const z of [40,50,59])shape('cylinder','trim',x,4.4,z,.87,.3,.87,0xc0a16b,0,Math.PI/2);
  }
  for(const [x,z] of [[-8,48],[8,30],[-26,20],[32,16],[6,5],[23,-12]]){
    solid(x,z,3.0,1.6,1.28,0x536a70);
    box('trim',x,1.34,z,3.1,.14,1.75,0xba9862);
  }
  for(const z of [9,18,27]){
    box('trim',-31,2.6,z,.56,.27,5.9,0x6eb7aa);
    solid(-30.5,z,1,2,.85,0x707c80);
  }
  sign('义体诊所  +',-23,2.95,29,5.5,.92,0,'#bcf2da','#245454');
  for(const z of [13,22,30]){
    solid(33,z,1.4,1.4,4.55,0x40555f);
    box('light',32.2,3.77,z,.24,2.9,1.8,0xb9798b);
    solid(32,z,3.45,4.5,.21,0x775469,2.84);
  }
  sign('N 線　北线',-20,3.18,1,6.3,1,0,'#e7e9a4','#3f4e42');
  for(let z=-15;z>=-37;z-=1.25)box('trim',-22,.055,z,9,.07,.18,0xb99b6b);
  // 桥面是可站立的实体；下方车场使用自己的地面。车辆和护栏按上层坐标参与碰撞。
  const deck=level.box(5,-42,54,7,5.45,6,true);level.viewOccluders.push(deck);
  box('wall',5,5.725,-42,54,.55,7,0x5e6877);
  for(const x of [-7,8,25]){
    solid(x,-44.25,1.7,1.6,5.45,0x6f7980);
    box('trim',x,4.95,-42,1.92,.7,5.8,0x828a83);
  }
  function bridgeBox(x,y,z,w,h,d,color){
    box('wall',x,y-ground(x,z),z,w,h,d,color);
    level.box(x,z,w,d,y-h/2,y+h/2);
  }
  for(const z of [-45.32,-38.68]){
    bridgeBox(7,6.75,z,49,.18,.23,0x98a9ac);
    for(let x=-17;x<=31;x+=4)bridgeBox(x,6.44,z,.19,.88,.22,0x677581);
  }
  bridgeBox(30,7.27,-42,3.45,2.54,3.4,0x527478);
  box('glass',28.25,7.6,-42,.08,.88,2.68,0x80cee5);
  sign('北线接应',29.9,8.8,-40.26,3.65,.7);
  // 自供电的琥珀灯和实体编号在 EMP 中继续指引玩家，与正常霓虹使用不同的灯色。
  for(const [x,z] of [[-9,31],[-24,32],[-28,13],[-23,4],[17,31],[26,19],[24,4],[4,1],[-19,-5],[-24,-14],[-24,-23],[-24,-32],[-22,-40]]){
    box('light',x,.17,z,.36,.28,1.35,0xffb35f);
  }
  for(let x=-17;x<=26;x+=4)box('light',x,6.10-ground(x,-44.7),-44.7,1.6,.12,.27,0xffb35f);
  for(let z=-8;z>=-35;z-=3){
    for(const x of [-25.6,-18.4])box('light',x,.12,z,.52,.18,1.2,0xffbe70);
  }
  sign('N ↑ 检修梯',-22,3.15,-15.2,4.4,.88,0,'#ffe4ae','#4c402d');
  const neon=new THREE.Group();scene.add(neon);
  const mat=new THREE.MeshBasicMaterial({color:0x5ed9dd});
  for(const [x,z] of [[-7,48],[-28,16],[29,19],[11,2]]){
    const strip=new THREE.Mesh(new THREE.BoxGeometry(3.8,.12,.2),mat);
    strip.position.set(x,ground(x,z)+3.1,z);neon.add(strip);
  }
  return {neon};
}
function createEncounter({mapData}){
  return {reset(){this.phase='calm';this.hudOffline=this.beastsDisabled=false;this.status=null;mapData.neon.visible=true;},
    update(g){
      const age=(g.time+16)%32,down=age>=26;
      this.phase=down?'off':age>=23?'warning':'calm';
      if(this.hudOffline!==down)g.ui.tick=0;
      this.hudOffline=this.beastsDisabled=down;mapData.neon.visible=!down;
      this.status=down?{title:'EMP 断电',detail:'沿琥珀灯上检修梯',remaining:32-age}:
        this.phase==='warning'?{title:'EMP 预警',detail:'准备借停机窗口推进',remaining:26-age}:null;
    }};
}
const plan={spots:{spawn:[0,53],gate:[25,-42],bossAnchor:[18,-25],bossSpawn:[23,-22]},ground,
  roughness:.56,metalness:.38,wallHeight:7,wallColor:0x4b5c6a,floorTexture:paving,edge:boundary,decorate};
export default{pageTitle:'霓城北线撤离',weaponSkin:'neon-northline-escape',story,grid:floorPlan(areas,46,70),
  config:{map:{cell:2,navCell:1,fog:.009},player:{safeTime:1.4},beasts:{sight:22,memory:6}},
  buildMap(ctx){const map=buildFacility(ctx,plan);ctx.level.gate.y=6;return map;},
  buildBeastModel:machineModel,buildRageModel:h=>machineModel(3,h,true),createEncounter,
  navigationApproach(p,t){
    if(t.y===6 && t.z===-42 && t.x===25 && p.y<5.75)return {x:-22,y:6,z:-41};
    if(t.y===6 && t.z===-42 && t.x===25 && Math.abs(p.z+42)>1.1)return {x:p.x,y:p.y,z:-42};
    return t;
  },
  terrain:{ground},background:0x293a50,fog:0x425164,portal:{shield:false},manualLoot:true,
  ammo:[[-5,47],[8,35],[-25,20],[28,24],[11,3],[-22,-10],[-22,-30]],
  loot:[[-5,58,'市场识别片',75],[-24,15,'义肢校准盒',245],[27,12,'雨棚电池',135],[0,2,'北线行车图',110],[-24,-23,'检修号牌',120],[25,-42,'接应电签',170,6]],
  area:(x,z)=>areas.find(({bounds:[a,b,c,d]})=>x>=a&&x<c&&z>=b&&z<d)?.name??'北线立交',
  text:{title:'霓城北线撤离',tag:'下城北线 / 突围',enter:'进入管道市场',brief:rule,objective:rule,safe:'管道市场入口',
    bossName:'北线机甲',winBrief:'你已登上高架接应车。'}};
