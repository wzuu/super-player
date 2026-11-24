// 护送对象只走标定通路。与玩家分离时停在原地，停靠点须由玩家近身交接。
import {watchRooms} from '@level-kit/room-guards.mjs';

export function convoyMission(plan,parts,mix){
  const last=plan.track.at(-1);
  return {type:'convoy',defaultMode:'escort',modes:['escort','endless'],turnDirections:true,watchRooms,
    convoy:{...plan,createMotion:createConvoy},locks:plan.locks??[],walls:plan.walls??[],
    route:[{kind:'convoy',name:plan.group,at:last.at,label:plan.rule,parts,mix,escort:true,
      entries:parts.map(part=>part.anchor),count:parts.reduce((n,part)=>n+part.count,0)}]};
}
function createConvoy(THREE, mesh, plan) {
  const body={x:0,y:0,z:0,radius:plan.radius??.47,height:plan.height??1.65};
  const eye=new THREE.Vector3(),ray=new THREE.Vector3();
  let index,waiting,dock,finished,track;
  function contact(g,range) {
    const p=g.player;
    eye.set(body.x,body.y+1,body.z);
    ray.set(p.x-eye.x,p.y+p.eye-eye.y,p.z-eye.z);
    const length=ray.length();
    return length<range && (length<.01 || g.level.visible(eye,ray.divideScalar(length),length));
  }
  function sync(){mesh.position.set(body.x,body.y+1,body.z);}
  return {
    get dock(){return dock;},
    get waiting(){return waiting;},
    get finished(){return finished;},
    get index(){return index;},
    reset(g){
      track=plan.track.map(({at,name,stop,door})=>{
        const [x,z]=at;
        return {x,z,y:g.level.base(x,z),name,stop,door};
      });
      Object.assign(body,track[0]);index=1;dock=null;waiting=false;finished=false;
      sync();
    },
    resume(g){
      if(!dock || !contact(g,3.4))return false;
      g.journal?.complete(g,dock.stop);
      g.sound.stageEvent?.('clear',g,mesh.position);
      dock=null;waiting=false;
      return true;
    },
    step(dt,g){
      if(finished || dock)return;
      const gap=Math.hypot(g.player.x-body.x,g.player.y-body.y,g.player.z-body.z);
      if(gap>9){
        if(!waiting)g.sound.stageEvent?.('warning',g,mesh.position);
        waiting=true;
      }
      if(waiting && !contact(g,3.4))return;
      waiting=false;
      if(plan.canAdvance && !plan.canAdvance(g,body))return;
      const target=track[index],dx=target.x-body.x,dz=target.z-body.z,d=Math.hypot(dx,dz);
      if(d>.16){
        const stride=Math.min(d,dt*(plan.speed??3.3));
        g.level.move(body,dx/d*stride,dz/d*stride,.45);
        body.y=g.level.foot(body.x,body.z,body.y+.45,body.radius);
        mesh.rotation.y=Math.atan2(dx,dz);sync();
        return;
      }
      index++;
      finished=index===track.length;
      if(target.stop){
        dock=target;
        g.sound.stageEvent?.('warning',g,mesh.position);
      }
    },
    guide(g,interactLabel){
      const next=track[index]??track.at(-1);
      const near=Boolean(dock && contact(g,3.4));
      const title=dock ? (near?'按 '+interactLabel+' ':'返回停靠点 · ')+dock.stop :
        waiting?'返回'+plan.name+'旁重新会合':'护送'+plan.name+' · '+next.name;
      return {stage:'convoy-'+index+(dock?'-dock':waiting?'-wait':''),title,
        target:dock||waiting?{x:body.x,y:body.y,z:body.z}:next};
    },
  };
}
