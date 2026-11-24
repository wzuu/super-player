const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const point = ({x,y,z}) => ({x,y,z});
const directions = [[1,0],[-1,0],[0,1],[0,-1],[.707,.707],[-.707,.707],[.707,-.707],[-.707,-.707]];

export function createRecovery({level,nav,definition,CONFIG}) {
  const {radius,height,step} = CONFIG.player;
  const history = [];
  let stage, latestGround, stageEntry, nextSample, route, recoveredHere;

  function supported(p) {
    return Number.isFinite(p.x+p.y+p.z) &&
      Math.abs(level.playerFloor(p.x,p.z,p.y+.07,radius,p.y+.025)-p.y)<.09 &&
      !level.blocked(p.x,p.z,p.y,radius,height);
  }
  function usable(p,g) {
    if (!supported(p) || definition.terrain?.routeOpen?.(p.x,p.z,level)===false ||
        g.encounter?.recoveryUnsafe?.(p) || g.story?.recoveryUnsafe(p)) return false;
    // 站在边沿一个角、紧贴天花板或只在半空踩到升降机时，不登记为可回退的位置。
    for (const [dx,dz] of directions) {
      if (Math.abs(level.surface(p.x+dx*radius,p.z+dz*radius,p.y+.07)-p.y)>step) return false;
    }
    for (const lift of g.lifts.lifts) {
      if (lift.y!==lift.to && Math.abs(p.x-lift.x)<lift.width/2+radius &&
          Math.abs(p.z-lift.z)<lift.depth/2+radius && Math.abs(p.y-lift.y)<.2) return false;
    }
    // 脱困后的第一帧不能代玩家拾取物资、走入伤害区或触发接触攻击。
    if (g.pickups.objects.some(i=>i.active && i.kind!=='core' && Math.abs(i.y-p.y)<=1.25 &&
        Math.hypot(i.x-p.x,i.z-p.z)<=CONFIG.pickups.grab)) return false;
    if (g.projectiles.puddles.some(h=>h.life>0 && Math.abs(h.pos.y-p.y)<.7 &&
        Math.hypot(h.pos.x-p.x,h.pos.z-p.z)<1.6+radius)) return false;
    if (g.field?.traps.some(t=>(t.falling>0 || t.lingering>g.time) && distance(t.p,p)<t.data.radius+.5)) return false;
    for (const b of g.beasts.pool) {
      if (!b.active || p.y>b.y+b.height+1 || p.y+height<b.y-1) continue;
      if (Math.hypot(p.x-b.x,p.z-b.z)<b.radius+radius+(b.type===3?4:2.4)) return false;
      const f=b.fight;
      if (f?.winding && Math.abs(p.y-f.aimY)<1.8 &&
          (Math.hypot(p.x-f.aimX,p.z-f.aimZ)<2.6+.5*f.stage ||
          (f.pattern===2 && f.stage>=1 && Math.hypot(p.x-f.nextX,p.z-f.nextZ)<2.9))) return false;
    }
    return true;
  }
  function capture(g,force) {
    const id=g.training?.recoveryStage ?? (g.field?.deep ||
      (g.story?.managed ? g.story.recoveryStage : g.field?.huntWon || g.objective.wave));
    const changed = stage!==id;
    if (changed) {
      stage=id;
      history.length=0;
      stageEntry=point(g.field?.deep ? level.gate : g.story?.managed ? g.story.recoveryEntry : level.spawn);
    }
    if (!force && !changed && g.time<nextSample) return;
    nextSample=g.time+.15;
    const p=g.player;
    if (!p.grounded || Math.abs(p.vy)>.02 || !supported(p)) return;
    latestGround=point(p);
    if (!usable(p,g) || history.length && distance(history.at(-1),p)<.85) return;
    if (history.length===64) history.shift();
    history.push(point(p));
  }
  // 验证格心与角色落脚点之间的实际通路，格心落在薄门另一侧时不能作为寻路起点。
  function connected(from,to) {
    route ??= nav.playerRoute();
    if (route.canWalk(from,to)) return true;
    // 导航需双向可通行，因此不会把单向可安全走下的跳台边当作边。
    // 从高向低另按角色真实足迹逐段走，检查下降沿途净空，不能穿楼板或关闭的门。
    if (from.y>to.y+step) {
      const probe={...point(from),radius,height};
      const n=Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.18);
      for (let i=1;i<=n;i++) {
        const x=from.x+(to.x-from.x)*i/n, z=from.z+(to.z-from.z)*i/n;
        if (definition.terrain?.routeOpen?.(x,z,level)===false) break;
        level.move(probe,x-probe.x,z-probe.z,step);
        if (Math.hypot(probe.x-x,probe.z-z)>.001) break;
        const floor=level.playerFloor(x,z,probe.y+.07,radius,probe.y+.025);
        if (probe.y-floor>CONFIG.player.safeDrop) break;
        while (probe.y>floor && !level.blocked(x,z,Math.max(floor,probe.y-.18),radius,height))
          probe.y=Math.max(floor,probe.y-.18);
        if (probe.y>floor+.001) break;
        if (i===n && Math.abs(probe.y-to.y)<.12) return true;
      }
    }
    route.rebuild(from.x,from.z);
    function links(p) {
      const result=[];
      for (let dz=-1;dz<=1;dz++) for (let dx=-1;dx<=1;dx++) {
        const i=route.index(p.x+dx*route.cell,p.z+dz*route.cell);
        if (route.routes[i] && route.canWalk(p,{x:route.x(i),y:route.floors[i],z:route.z(i)})) result.push(i);
      }
      return result;
    }
    const end=links(to);
    for (const i of links(from)) {
      route.rebuild(route.x(i),route.z(i));
      if (end.some(j=>route.dist[j]>=0)) return true;
    }
    return false;
  }
  function hasExit(p) {
    return directions.some(([dx,dz])=>{
      const probe={...p,radius,height};
      for (let i=0;i<5;i++) {
        level.move(probe,dx*.17,dz*.17,step);
        probe.y=level.playerFloor(probe.x,probe.z,probe.y+.07,radius,probe.y+.025);
      }
      return Math.hypot(probe.x-p.x,probe.z-p.z)>.78 && Math.abs(probe.y-p.y)<step;
    });
  }
  return {
    reset(g) {
      stage=undefined;
      latestGround=recoveredHere=null;
      nextSample=0;
      capture(g,true);
    },
    record(g) {
      if (g.phase==='play' && !g.blast) {
        recoveredHere=null;
        capture(g,false);
      }
    },
    recover(g) {
      if (g.phase!=='pause' || g.blast) return false;
      capture(g,false);
      const p=g.player;
      if (recoveredHere && distance(p,recoveredHere)<.01 && usable(p,g)) return true;
      // 被挤入墙内时以玩家最后实际站过的一侧为准，避免最近空格恰好位于锁门后方。
      const origin=[p,latestGround,...history.slice().reverse(),stageEntry].find(a=>a && supported(a));
      if (!origin) return false;
      let dest;
      const finite=Number.isFinite(p.x+p.y+p.z);
      const accept=q=>(!finite || distance(p,q)>.04) && usable(q,g) && hasExit(q) && connected(origin,q);
      for (const q of history.slice().reverse().sort((a,b)=>finite ? distance(a,p)-distance(b,p) : 0)) {
        if (accept(q)) { dest=q; break; }
      }
      if (!dest) {
        // 出生点、上一已完成站点、深入入口是各自阶段预设的退路。危险覆盖中心时
        // 在同一入口周边寻找有支撑且与玩家所在侧连通的空地，绝不选未完成目标。
        for (const r of [0,1.2,2.4,4,6,8]) {
          for (const [dx,dz] of directions) {
            const x=stageEntry.x+r*dx, z=stageEntry.z+r*dz;
            const q={x,z,y:level.surface(x,z,stageEntry.y+step)};
            if (Math.abs(q.y-stageEntry.y)<=step && accept(q)) { dest=q; break; }
            if (!r) break;
          }
          if (dest) break;
        }
      }
      if (!dest) return false;
      Object.assign(p,point(dest),{vy:0,fallPeak:dest.y,grounded:true,crouched:false,height,eye:CONFIG.player.eye,
        sprinting:false,speedMix:0,sway:0});
      g.kit.stopRoll();
      g.encounter?.stopPlayerPush?.();
      p.positionCamera(0);
      latestGround=recoveredHere=point(dest);
      return true;
    },
  };
}
