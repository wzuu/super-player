import {watchRooms} from '@level-kit/room-guards.mjs';

export function demolitionMission(plan,parts,mix) {
  return {type:'rifts',defaultMode:'classic',modes:['classic','endless'],classicAction:'爆破',
    classicRule:plan.rule,turnDirections:true,watchRooms,rifts:{...plan,create:createRifts},
    route:[{kind:'rifts',name:plan.name,at:plan.cases[0].at,label:plan.rule,
      count:parts.reduce((n,part)=>n+part.count,0),parts,entries:parts.map(part=>part.anchor),mix}]};
}

function createRifts({THREE,level,scene},plan) {
  const point=([x,z])=>new THREE.Vector3(x,level.base(x,z),z);
  const casing=new THREE.MeshStandardMaterial({color:0x776148,roughness:.65});
  const signal=new THREE.MeshBasicMaterial({color:0x95e8bb});
  const cases=plan.cases.map(c=>{
    const mesh=new THREE.Group(),position=point(c.at);
    const box=new THREE.Mesh(new THREE.BoxGeometry(.94,.58,.61),casing);
    box.position.y=.29;mesh.add(box);
    for(const x of [-.29,.29]){
      const band=new THREE.Mesh(new THREE.BoxGeometry(.07,.61,.64),signal);
      band.position.set(x,.30,0);mesh.add(band);
    }
    mesh.position.copy(position);scene.add(mesh);
    return {...c,position,mesh};
  });
  const gates=plan.gates.map(config=>{
    const position=point(config.at),mesh=new THREE.Group();
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1.38,.15,7,30),
      new THREE.MeshStandardMaterial({color:plan.color,emissive:plan.color,emissiveIntensity:.45}));
    ring.position.y=1.6;mesh.add(ring);
    const veil=new THREE.Mesh(new THREE.CircleGeometry(1.23,30),new THREE.MeshBasicMaterial({
      color:plan.color,side:THREE.DoubleSide,transparent:true,opacity:.30,depthWrite:false}));
    veil.position.y=1.6;mesh.add(veil);
    mesh.rotation.y=config.yaw??0;mesh.position.copy(position);scene.add(mesh);
    return {...config,position,mesh,veil,ring,retreatPoint:point(config.retreat)};
  });
  const ray=new THREE.Vector3(),origin=new THREE.Vector3();
  const flash=new THREE.Color(plan.color);
  // 拉闩装在内侧。模型、碰撞与弹道共用同一块门板。
  let shortcut;
  if(plan.shortcut){
    const {at,width,depth,height,latch}=plan.shortcut,base=point(at);
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),
      new THREE.MeshStandardMaterial({color:0x79664e,roughness:.9}));
    mesh.position.copy(base);mesh.position.y+=height/2;scene.add(mesh);
    shortcut={mesh,position:point(latch),box:level.box(base.x,base.z,width,depth,base.y,base.y+height)};
  }
  let carried,broken,finished;
  function reachable(p,site){
    const t=site.position;
    if(t.distanceToSquared(p)>2.8**2)return false;
    origin.set(p.x,p.y+.95,p.z);ray.set(t.x-origin.x,t.y+.55-origin.y,t.z-origin.z);
    const d=ray.length();
    return d<.01 || level.visible(origin,ray.divideScalar(d),d);
  }
  function nearest(sites,p) {
    let best=null,distance=Infinity;
    for(const site of sites){
      const d=site.position.distanceToSquared(p);
      if(d<distance){distance=d;best=site;}
    }
    return best;
  }
  function usable(g){
    const sites=cases.filter(c=>!c.taken);
    if(carried)sites.push(...gates.filter(gate=>gate.state==='open'));
    return nearest(sites.filter(site=>reachable(g.player,site)),g.player);
  }
  function reinforce(g,gate,dt){
    gate.timer-=dt*(plan.pressure?.(g)??1);
    if(gate.timer>0)return;
    gate.timer=gate.interval;
    gate.members=gate.members.filter(({beast,generation})=>beast.active && beast.spawnGeneration===generation);
    if(gate.members.length>=gate.cap)return;
    const type=gate.types[gate.spawned%gate.types.length];
    const [left,back,right,front]=gate.bounds;
    const pack=g.beasts.spawnGroup([type],{anchors:[gate.position],safeDistance:8,
      accept:p=>p.x>=left && p.x<=right && p.z>=back && p.z<=front});
    for(const beast of pack){
      gate.members.push({beast,generation:beast.spawnGeneration});
      beast.alert=5;gate.spawned++;
    }
  }
  return {
    gates,cases,
    get countingDown(){return gates.some(gate=>gate.state==='armed');},
    minimap(ctx,px,pz){
      for(const c of cases)if(!c.taken){
        ctx.fillStyle='#a3edc0';ctx.fillRect(px(c.position.x)-2,pz(c.position.z)-2,4,4);
      }
      for(const gate of gates)if(gate.state!=='destroyed'){
        ctx.strokeStyle=gate.state==='armed'?'#ffc37b':'#d4b5ff';ctx.lineWidth=1.5;
        ctx.beginPath();ctx.arc(px(gate.position.x),pz(gate.position.z),3.5,0,Math.PI*2);ctx.stroke();
      }
    },
    result(){return {chargesCollected:cases.filter(c=>c.taken).length,riftsDestroyed:broken};},
    reset(enabled){
      carried=broken=0;finished=false;
      if(shortcut)level.setBarrier(shortcut.box,shortcut.mesh,enabled);
      for(const c of cases){c.taken=false;c.mesh.visible=enabled;}
      for(const gate of gates){
        gate.mesh.visible=enabled;gate.state='open';gate.fuse=0;gate.timer=gate.delay;
        gate.members=[];gate.spawned=0;gate.veil.visible=true;gate.ring.material.emissiveIntensity=.45;
      }
    },
    guide(g,key){
      const armed=gates.filter(gate=>gate.state==='armed').sort((a,b)=>a.fuse-b.fuse)[0];
      const detail='任务弹 '+carried+' 枚 · 已毁传送门 '+broken+' / '+gates.length;
      if(armed)return {stage:'fuse',title:armed.name+' · 引信 '+Math.ceil(armed.fuse)+' 秒，退回掩体',
        target:armed.retreatPoint,detail};
      if(shortcut?.mesh.visible && reachable(g.player,shortcut))
        return {stage:'shortcut',title:'按 '+key+' 拉开内闩',target:shortcut.position,detail};
      const site=usable(g)??nearest(carried?gates.filter(gate=>gate.state==='open'):cases.filter(c=>!c.taken),g.player);
      if(!site)return {stage:'complete',title:plan.victory,detail};
      const action=site.state?'安放任务弹':'领取任务弹';
      return {stage:site.state?'plant':'collect',target:site.position,detail,
        title:(reachable(g.player,site)?'按 '+key+' '+action:'前往'+site.name+'，'+action)};
    },
    interact(g){
      if(finished)return false;
      if(shortcut?.mesh.visible && reachable(g.player,shortcut)){
        level.setBarrier(shortcut.box,shortcut.mesh,false);
        g.ui.notify('内闩已打开，断桥与石窟之间可以通行',2);
        return true;
      }
      const site=usable(g);
      if(!site)return false;
      // 库房与门体均先改变状态，再发日志。连续按键不会重复领取或扣除任务弹。
      if(site.state){
        carried--;site.state='armed';site.fuse=3;
        g.sound.stageEvent?.('warning',g,site.position);
        g.ui.notify(site.name+'已启动引信，退回掩体',2);
      }else{
        carried++;site.taken=true;site.mesh.visible=false;
        g.ui.notify('已领取'+site.name+'的任务弹',2);
      }
      g.journal?.complete(g,site.name+(site.state?'已安放':'已取弹'));
      return true;
    },
    step(dt,g){
      if(finished)return;
      for(const gate of gates){
        if(gate.state==='destroyed')continue;
        gate.veil.material.opacity=.31+.12*Math.sin(g.time*(gate.state==='armed'?14:3));
        if(gate.state==='armed')gate.fuse-=dt;
        if(gate.state==='open' || gate.fuse>0){reinforce(g,gate,dt);continue;}
        gate.state='destroyed';gate.mesh.visible=false;broken++;
        origin.copy(gate.position);origin.y+=1.2;
        g.effects.spray(origin,flash,38,7,.09,'spark');
        g.sound.stageEvent?.('impact',g,gate.position);
        g.journal?.complete(g,gate.name+'已摧毁');
        if(broken===gates.length){
          finished=true;
          const record=g.story.encounters.at(-1);
          if(record)record.clearedAt=g.time;
          g.finish(true,plan.victory);return;
        }
        g.ui.notify(gate.name+'已摧毁，该处停止增援',2);
      }
    },
  };
}
