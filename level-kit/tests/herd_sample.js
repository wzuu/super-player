// 此文件仅注入性能测试的临时页面。游戏的模拟、渲染及武器沿用关卡实现。
function herdSetup([mode, sample, target]) {
  const {game:g, config, camera, input} = run;
  const rules = config.beasts;
  if (mode !== 'baseline') {
    rules.visibility.enabled = mode !== 'off';
    rules.visibility.occlusion = mode !== 'frustum';
    config.graphics.partialInstanceUploads = mode !== 'full-upload';
    rules.appearance.detailEnabled = ['diffuse','lod','full-upload','final'].includes(mode);
    rules.appearance.detailSpecular = mode !== 'diffuse';
    rules.simulation.farCadence = mode === 'final' || mode === 'full-upload';
  }
  g.reset(); g.phase = 'play';
  const menu = document.querySelector('#menu');
  if (menu.open) menu.close();
  document.querySelector('#hud').hidden = false;
  g.player.hurtDelay = Infinity;
  input.fire = true;
  if (sample === 'machine-room' || sample === 'street' || sample === 'legacy96') return;

  // 合成负载保留真实 AI、寻路和连续射击。固定数量与高生命只用于比较相同负载。
  const manager = g.beasts, level = g.level, player = g.player;
  g.story.step = () => {};
  g.objective.step = () => {};
  if (g.field) g.field.step = () => {};
  for (const b of manager.pool) b.active = false;
  manager.live = 0; manager.boss = null; manager.spawnTime = Infinity;
  const dense = sample === 'dense' || sample === 'boss-wave', arena = sample === 'open' || dense;
  const newLab = level.entryDoor?.z0 > 45;
  const [px,py,pz,yaw] = sample === 'indoor' ? (newLab ? [15,0,-22,0] : [27,0,1,0]) :
    sample === 'wall' ? (newLab ? [-5,0,23,0] : [-6,0,18,0]) : sample === 'mirror' ? [37,0,5,0] :
    sample === 'tower' ? [0,level.base(0,17),17,0] : [0,38,29,0];
  if (arena) level.box(0,0,82,82,37.8,38,true);
  Object.assign(player,{x:px,y:py,z:pz,fallPeak:py});
  player.look.rotation.set(-.035,yaw,0,'YXZ'); player.positionCamera(0);
  run.nav.rebuild(px,pz);
  // 开阔样板用前方扇形分布，保证 160 只确实同时进入画面。其余样板使用关卡实体地形。
  if (rules.simulation) {rules.simulation.profile = true; manager.resetSimulationStats();}
  let tries = 0;
  while (manager.live < target && tries++ < 25000) {
    const n = manager.live, type = n === target-1 ? 3 : n%7 < 4 ? 0 : n%7 < 6 ? 1 : 2;
    let x,z,y;
    if (arena) {
      const depth = 19 + Math.floor(n/12)*1.9;
      x = ((n%12)-5.5)*depth*.07; z = pz-depth; y = py;
      // 前排六只在撞晕恢复中，固定近模压力；后排继续正常追击与分频。
      if (n < 6) {x = (n-2.5)*1.05; z = pz-5.5;}
      if (dense) {
        const range = n < 48 || type === 3 ? 4.5+(n%5)*.65 : n < 96 ? 11+(n%7)*.7 : depth;
        x = ((n%12)-5.5)*range*.085; z = pz-range;
      }
    } else {
      x = (Math.random()*2-1)*(sample==='indoor' || sample==='wall' ? 35 : 39);
      z = (Math.random()*2-1)*34; y = level.base(x,z);
    }
    const b = manager.spawn(type,x,z,y,0);
    if (!b) continue;
    b.hp = b.maxHP = 1000000;
    if (dense || (arena && n < 6)) b.stun = 8;
    if (type === 3) b.summon = 0;
  }
  if (manager.live !== target) throw Error('样板生成失败 '+manager.live+'/'+target);
  window.birthCost = manager.simulationStats && {...manager.simulationStats};
  if (rules.simulation) rules.simulation.profile = false;
  manager.refreshHash();
  if (sample==='boss-wave' && mode!=='baseline') {
    window.bossWaveSample=true;
    const b=manager.boss,f=b.fight;
    Object.assign(f,{started:true,turn:1,next:g.time});
    b.playerVisible=true;
    manager.ai.update(b,player,g,1/60,0);
    if (!f.winding || f.attack!=='slam') throw Error('首领未准备砸地');
    f.next=g.time+.45; // 预热期末开始扩散，正式采样覆盖可见波前。
  }
  camera.updateMatrixWorld();
}

function herdMeshes(b) {
  // 所有凶兽主模型、部件及独立反馈。材质的双面二次绘制由 renderBufferDirect 实计。
  const meshes = new Set();
  function add(item) {
    if (!item) return;
    if (item.isInstancedMesh) meshes.add(item);
    else if (Array.isArray(item)) item.forEach(add);
    else if (item instanceof Map) item.forEach(add);
    else if (Object.getPrototypeOf(item) === Object.prototype) Object.values(item).forEach(add);
  }
  [b.modelBatches,b.detailParts,b.healthBG,b.healthFG,b.bossMarks,b.groundMarks,b.chargeMarks,b.shadows,b.badges].forEach(add);
  return meshes;
}

async function herdMeasure(frames) {
  const {game:g,config,renderer,camera} = run, b = g.beasts;
  const raf = () => new Promise(requestAnimationFrame);
  let tick = 0;
  function draw() {run.frame(++tick*1000/60);}
  for (let i=0;i<30;i++) {await raf(); draw();}
  const samples = [], shots = g.performance.shots;
  let last = await raf(), submittedMin = Infinity, waveFrames=0;
  const submitted = () => b.visibility?.stats.bodies ?? b.live;
  for (let i=0;i<frames;i++) {
    draw();
    if (b.boss?.fight?.ground?.live && b.groundMarks?.count) waveFrames++;
    submittedMin = Math.min(submittedMin,submitted());
    const now = await raf();
    samples.push(now-last); last = now;
  }
  if (window.bossWaveSample && !waveFrames) throw Error('采样未绘制进行中的首领冲击波');
  const shotsDuringSample = g.performance.shots-shots;
  if (config.beasts.simulation) {
    config.beasts.simulation.profile = true;
    b.resetSimulationStats();
  }
  // 计数在独立的诊断帧执行，指标计时器与 WebGL 钩子不参与上方整帧计时。
  const meshes = herdMeshes(b), versions = new Map();
  const probe = camera.position.clone();
  let centreInViewMin = Infinity;
  const cost = {draws:0, triangles:0, reflectionDraws:0, reflectionTriangles:0,
    writes:0, uploadBytes:0, instanceMs:0, frameDraws:0, frameTriangles:0, gridMs:0};
  const render = renderer.renderBufferDirect.bind(renderer);
  renderer.renderBufferDirect = (view,scene,geo,mat,mesh,group) => {
    const calls = renderer.info.render.calls, tris = renderer.info.render.triangles;
    render(view,scene,geo,mat,mesh,group);
    if (!meshes.has(mesh)) return;
    const main = view === camera;
    cost[main?'draws':'reflectionDraws'] += renderer.info.render.calls-calls;
    cost[main?'triangles':'reflectionTriangles'] += renderer.info.render.triangles-tris;
  };
  const attributes = [];
  for (const mesh of meshes) {
    const set = mesh.setMatrixAt.bind(mesh);
    mesh.setMatrixAt = (i,matrix) => {cost.writes++; set(i,matrix);};
    for (const attr of [mesh.instanceMatrix,mesh.instanceColor,mesh.geometry.attributes.beastFlash,mesh.geometry.attributes.beastLight]) {
      if (attr && !versions.has(attr)) {versions.set(attr,attr.version); attributes.push(attr);}
    }
  }
  const beastRender = b.render.bind(b);
  b.render = (...args) => {
    const start = performance.now(); beastRender(...args); cost.instanceMs += performance.now()-start;
    cost.gridMs += b.visibility?.stats.gridRebuildMs ?? 0;
    for (const a of attributes) {
      if (a.version === versions.get(a)) continue;
      versions.set(a,a.version);
      const floats = a.updateRanges?.length ? a.updateRanges.reduce((n,r)=>n+r.count,0) : a.array.length;
      cost.uploadBytes += floats*a.array.BYTES_PER_ELEMENT;
    }
  };
  const profileFrames = 24;
  let peakDraws=0, peakTriangles=0;
  for (let i=0;i<profileFrames;i++) {
    const beforeDraws=cost.draws, beforeTriangles=cost.triangles;
    draw(); await raf();
    peakDraws=Math.max(peakDraws,cost.draws-beforeDraws);
    peakTriangles=Math.max(peakTriangles,cost.triangles-beforeTriangles);
    let inside = 0;
    for (const actor of b.pool) {
      if (!actor.active) continue;
      probe.set(actor.x, actor.y+actor.height*.5, actor.z).project(camera);
      if (Math.max(Math.abs(probe.x),Math.abs(probe.y),Math.abs(probe.z))<=1) inside++;
    }
    centreInViewMin = Math.min(centreInViewMin,inside);
    cost.frameDraws += renderer.info.render.calls; cost.frameTriangles += renderer.info.render.triangles;
  }
  const round = value => Math.round(value*1000)/1000;
  const perFrame = Object.fromEntries(Object.entries(cost).map(([key,value])=>[key,round(value/profileFrames)]));
  const total = samples.reduce((sum,time)=>sum+time,0); samples.sort((a,b)=>a-b);
  return {gpu:herdGPU(),
    fps:round(1000*frames/total),p95:round(samples[Math.ceil(frames*.95)-1]), shots:shotsDuringSample,waveFrames,
    simulated:b.simulationStats?.steps ? round(b.simulationStats.actors/b.simulationStats.steps) : b.live,
    submittedMin, centreInViewMin, submitted:submitted(),lod:b.lodCounts ?? null,visibility:b.visibility?.stats ?? null,
    perFrame,peakDraws,peakTriangles,simulation:b.simulationStats ?? null,spawn:window.birthCost ?? null};
}

function herdGPU() {
  const gl = run.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
}
