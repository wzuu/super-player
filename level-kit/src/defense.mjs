// 栏杆的实体、模型、耐久与敌人推进共用状态。信标启动之后才封闭入口。
import {watchRooms} from '@level-kit/room-guards.mjs';

export function defenseMission(plan,parts,mix) {
  const laneNames=new Set(plan.lanes.map(l=>l.name));
  function group(kind,rooms,name){
    return {kind,at:plan.beacon,name,label:plan.rule,parts:rooms,mix,
      count:rooms.reduce((sum,room)=>sum+room.count,0),entries:rooms.map(room=>room.anchor)};
  }
  return {type:'defense',defaultMode:'hold',modes:['hold','endless'],turnDirections:true,watchRooms,
    defense:{...plan,create:createDefense},route:[
      group('signal',parts.filter(room=>!laneNames.has(room.name)),'进场守卫'),
      group('fortify',parts.filter(room=>laneNames.has(room.name)),plan.name),
    ]};
}

function createDefense({THREE,level,scene},plan) {
  function position([x,z]){return {x,y:level.base(x,z),z};}
  const signal=position(plan.beacon),exit=position(plan.exit??plan.beacon);
  let boarding;
  if(plan.boardGate){
    const [x,z,width,depth,height]=plan.boardGate,y=level.base(x,z);
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),
      new THREE.MeshStandardMaterial({color:0xd4a169,roughness:.64}));
    mesh.position.set(x,y+height/2,z);scene.add(mesh);
    boarding={mesh,box:level.box(x,z,width,depth,y,y+height)};
  }
  const lanes=plan.lanes.map(lane=>{
    const [x,z,width,depth]=lane.barrier,y=level.base(x,z),height=lane.height??1.8;
    const mesh=new THREE.Group(),material=new THREE.MeshStandardMaterial({color:plan.railColor}),colliders=[];
    function slat(dx,h,dz,w,t,d){
      const part=new THREE.Mesh(new THREE.BoxGeometry(w,t,d),material);
      part.position.set(dx,h,dz);mesh.add(part);
      colliders.push(level.box(x+dx,z+dz,w,d,y+h-t/2,y+h+t/2));
    }
    const alongX=width>depth,span=Math.max(width,depth),posts=Math.ceil(span/1.6);
    for(let i=0;i<=posts;i++){
      const k=(i/posts-.5)*(span-.24);
      slat(alongX?k:0,height*.5,alongX?0:k,.23,height,.23);
    }
    slat(0,.30,0,width,.60,depth);
    for(const h of [.58,.96])slat(0,height*h,0,width,.16,depth);
    mesh.position.set(x,y,z);scene.add(mesh);
    return {...lane,colliders,mesh,material,point:position([x,z]),alongX};
  });
  function setLane(l,closed){
    l.mesh.visible=closed;
    for(const box of l.colliders)level.setBarrier(box,null,closed);
  }
  let started,boardable,finished,age,routes;
  const ray=new THREE.Vector3(),origin=new THREE.Vector3(),neighbors=[];
  const near=(p,t)=>Math.hypot(p.x-t.x,p.y-t.y,p.z-t.z)<2.8;
  function sight(from,to){
    origin.set(from.x,from.y+.9,from.z);
    ray.set(to.x-origin.x,to.y+.75-origin.y,to.z-origin.z);
    const d=ray.length();
    return d<.01 || level.visible(origin,ray.divideScalar(d),d);
  }
  function bars(){return lanes.map(l=>l.name+' '+(l.hp?Math.ceil(100*l.hp/l.strength)+'%':'破口')).join(' · ');}
  function finish(g){
    if(finished)return;
    const record=g.story.encounters.at(-1);
    if(record)record.clearedAt=g.time;
    finished=true;g.journal?.complete(g,plan.victory);g.finish(true,plan.victory);
  }
  return {
    get elapsed(){return age;},
    get started(){return started;},
    get boardable(){return boardable;},
    result(){return {holdSeconds:Math.floor(age),...(plan.exit?{boarded:finished}:{})};},
    get lanes(){return lanes;},
    get target(){return boardable?exit:signal;},
    canInteract(g){return near(g.player,this.target) && sight(g.player,this.target);},
    reset(enabled){
      started=boardable=finished=false;age=0;routes=new WeakMap();
      if(boarding)level.setBarrier(boarding.box,boarding.mesh,enabled);
      for(const l of lanes){
        l.hp=l.strength;l.warned=false;l.lastNotice=-Infinity;l.slots=null;
        l.material.color.setHex(plan.railColor);setLane(l,false);
      }
    },
    guide(g,key){
      const t=this.target;
      const threatened=started && !boardable && lanes.filter(l=>l.warned)
        .sort((a,b)=>Math.max(b.lastNotice,b.delay)-Math.max(a.lastNotice,a.delay))[0];
      const title=!started?(near(g.player,t)?'按 '+key+' 启动救援信标':'登上平台，启动救援信标'):
        boardable?(near(g.player,t)?'按 '+key+' 登机撤离':'救援到达，前往登机口'):
        '守住防线 · 救援还有 '+Math.ceil(plan.seconds-age)+' 秒';
      const watch=threatened?position(threatened.inside):t;
      return {stage:!started?'signal':boardable?'board':'defending',target:watch,title,detail:started?bars():plan.approach};
    },
    interact(g){
      if(!this.canInteract(g))return false;
      if(boardable){finish(g);return true;}
      if(started)return false;
      started=true;
      for(const l of lanes)setLane(l,true);
      g.sound.stageEvent?.('warning',g,signal);
      g.journal?.complete(g,'启动救援信标');
      return true;
    },
    step(dt,g){
      if(!started || finished)return;
      age=Math.min(plan.seconds,age+dt);
      for(const l of lanes)if(!l.warned && age>=l.delay){
        l.warned=true;g.ui.notify(l.name+'发现敌群',2);g.sound.stageEvent?.('warning',g,l.point);
      }
      if(age<plan.seconds || boardable)return;
      if(!plan.exit){finish(g);return;}
      boardable=true;
      if(boarding)level.setBarrier(boarding.box,boarding.mesh,false);
      g.sound.stageEvent?.('clear',g,exit);g.ui.notify('救援到达，可以登机',3);
    },
    stepBeast(b,g,dt){
      const lane=lanes.find(l=>l.name===b.sectionRoom);
      if(!lane || !b.storyWave)return false;
      if(!started || age<lane.delay+2){
        b.stride=0;
        return true;
      }
      let route=routes.get(b);
      if(!route || route.generation!==b.spawnGeneration){
        // 两个坡口各保留自己的冲线，展开到不同栏段，避免所有敌人叠到一根栏柱上。
        const span=lane.barrier[lane.alongX?2:3]-4.2;
        if(!lane.slots){
          const axis=lane.alongX?'x':'z';
          const team=g.beasts.pool.filter(member=>member.active && member.sectionRoom===lane.name)
            .sort((a,b)=>a[axis]-b[axis]);
          lane.slots=new Map(team.map((member,i)=>[member,(Math.min(4,Math.floor(i*5/team.length))/4-.5)*span]));
        }
        const offset=lane.slots.get(b)??0,spread=([x,z])=>position([x+(lane.alongX?offset:0),z+(lane.alongX?0:offset)]);
        const approach=lane.detour && plan.flooded?.(g) ? lane.detour : lane.path;
        route={generation:b.spawnGeneration,points:approach.map(spread),inside:spread(lane.inside),index:0,nextHit:0};
        routes.set(b,route);
      }
      const outside=route.points.at(-1),approaching=route.index<route.points.length;
      if(route.entered)return false;
      if(!approaching && lane.hp>0){
        b.stride=0;
        if(b.stun>0 || !sight(b,outside)){route.nextHit=0;b.mode='move';return true;}
        if(!route.nextHit)route.nextHit=g.time+.9;
        b.mode=route.nextHit-g.time<.65?'windup':'move';
        if(g.time>=route.nextHit){
          route.nextHit=g.time+1.7;lane.hp=Math.max(0,lane.hp-(b.type===1?8:4));
          lane.material.color.setHex(lane.hp>lane.strength/2?plan.railColor:0xc97c4d);
          if(!lane.hp){
            lane.lastNotice=age;
            setLane(lane,false);g.ui.notify(lane.name+'出现破口',3);
            g.sound.stageEvent?.('danger',g,lane.point);
          }else if(age-lane.lastNotice>2){
            lane.lastNotice=age;g.sound.stageEvent?.('impact',g,lane.point);
          }
        }
        return true;
      }
      if(b.mode==='windup')b.mode='move';
      const target=approaching?route.points[route.index]:route.inside;
      const dx=target.x-b.x,dz=target.z-b.z,d=Math.hypot(dx,dz);
      if(d<.32){
        if(!approaching){route.entered=true;b.roomAlert=true;b.alert=6;return false;}
        route.index++;return true;
      }
      if(b.stun<=0){
        const stride=Math.min(d,dt*(b.type===1?2.1:2.8)*b.perkMoveScale);
        // 同一入口分列靠近。前排仍占据攻击位时，后排留出碰撞体间距。
        const range=b.radius+2.8,nearby=g.beasts.hash.query(b.x-range,b.z-range,b.x+range,b.z+range,neighbors);
        if(approaching && route.index===route.points.length-1 && d<3 && nearby.some(other=>other!==b && other.active && Math.abs(b.y-other.y)<1.3 &&
            (other.x-b.x)*dx+(other.z-b.z)*dz>0 &&
            Math.hypot(b.x+dx/d*stride-other.x,b.z+dz/d*stride-other.z)<b.radius+other.radius+.04)){
          b.stride=0;return true;
        }
        b.stride=level.move(b,dx/d*stride,dz/d*stride,.47)/Math.max(.001,dt);
        b.y=level.foot(b.x,b.z,b.y+.45,b.radius);b.yaw=Math.atan2(dx,dz);
        b.fx=dx/d;b.fz=dz/d;
      }
      return true;
    },
  };
}
