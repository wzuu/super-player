// 与武器回归共用原 96 只湿身幼体及霰弹/导电负载。
async function shotgunStress() {
  const g=run.game,w=g.weapon,p=g.player,b=g.beasts;
  let tick=0;
  const step=g.step; g.step=()=>{};p.look.rotation.set(0,0,0,'YXZ');
  Object.assign(p,{x:0,y:40,z:0,vy:0,recoil:0,shake:0});
  p.thirdPerson=false;p.positionCamera(0);w.render(0,p,g);
  b.pool.forEach(x=>x.active=false);b.live=0;b.boss=null;
  for(let i=0;i<96;i++){
    const enemy=b.spawn(0,(i%12-5.5)*.66,-6-Math.floor(i/12)*.62,40);
    enemy.hp=100000;enemy.statusEffects.set('wet',{type:'wet',until:Infinity,stacks:1});
  }
  b.refreshHash();
  const sample=async(active)=>{
    const frames=[];let last=await new Promise(requestAnimationFrame);
    for(let i=0;i<52;i++){
      g.time+=.033;
      if(i%15===0){
        w.shoot(g);
        if(active){
          w.combat.element(b.pool[48],'electric',g,'weapon');
          g.sound.stageEvent('warning',g,b.pool[48]);
        }
      }
      g.effects.update(.033);p.positionCamera(.033);w.render(.033,p,g);
      if(run.frame) run.frame(++tick*1000/60);
      const now=await new Promise(requestAnimationFrame);
      if(i>=8)frames.push(now-last);last=now;
    }
    frames.sort((a,b)=>a-b);return [+frames[22].toFixed(1),+frames[41].toFixed(1)];
  };
  const baseline=await sample(false), reactions=await sample(true);
  g.step=step;
  return {actors:b.live,baseline,reactions,firstDiscovery:localStorage.getItem('super-player:reaction-discoveries:v1')};
}
