// 机位都在正常碰撞内。洞口与商店从室内向外看，保留门洞后仍能交战的目标。
const campaignCameras = {
  'shanhai-secret-realm': { cover: [-31, 10.5, -19, 6.5] },
  'rain-city': { cover: [31.1, 14.2, 22, 9.7] },
  'underground-lab': {
    open: [0, 51, 0, 34],
    cover: [-9, 32, -20, 33],
    archive: [21.8, -27, 42, -28],
    reactor: [0, -45.1, 1.5, -60],
  },
};
const nextFrame = () => new Promise(requestAnimationFrame);
const tenth = (value) => Math.round(value * 10) / 10;

function viewCounts() {
  const { game: g, camera } = run;
  const eye = camera.position,
    ray = eye.clone(),
    center = eye.clone();
  camera.updateMatrixWorld(true);
  let active = 0,
    visible = 0,
    clearance = Infinity;
  for (const b of g.beasts.pool) {
    if (!b.active) continue;
    if (b.y < g.player.y + g.player.height && b.y + b.height > g.player.y)
      clearance = Math.min(
        clearance,
        Math.hypot(b.x - g.player.x, b.z - g.player.z) - b.radius - g.player.radius,
      );
    if (b.storyWave || b.archiveTag || b.type === 3) active++;
    center.set(b.x, b.y + b.height * 0.7, b.z);
    const distance = ray.subVectors(center, eye).length();
    if (!distance || !g.level.visible(eye, ray.divideScalar(distance), distance - 0.1)) continue;
    center.project(camera);
    if (Math.max(Math.abs(center.x), Math.abs(center.y), Math.abs(center.z)) <= 1) visible++;
  }
  return {
    missionCount: active,
    actualLive: g.beasts.live,
    visible,
    nearestClearanceMetres: tenth(clearance),
  };
}

async function prepareCampaignView([stage, view]) {
  const { game: g, nav, renderer } = run,
    p = g.player,
    m = g.beasts,
    story = g.story;
  const batches = [],
    spawn = m.spawnGroup.bind(m);
  m.spawnGroup = (entries, options) => {
    const start = performance.now(),
      team = spawn(entries, options);
    if (team.length) batches.push({ count: team.length, cpuMs: tenth(performance.now() - start) });
    return team;
  };
  const stand = (x, z, y = g.level.surface(x, z, g.level.base(x, z) + 0.46)) => {
    if (g.level.blocked(x, z, y, p.radius, p.height)) throw Error('固定机位在碰撞体内 ' + [x, y, z]);
    Object.assign(p, { x, y, z });
    nav.rebuild(x, z);
  };
  const beginPlay = () => {
    g.reset();
    g.phase = 'play';
    if (g.ui.nodes.menu.open) g.ui.nodes.menu.close();
    g.ui.nodes.hud.hidden = false;
    g.weapon.group.visible = true;
    document.getElementById('equipment-hud').hidden = false;
  };
  let activate = beginPlay;
  if (stage === 'underground-lab') {
    beginPlay();
    // 顺序与任务一致。后部取景先处理之前的战区，只计量最后一次真实开门。
    for (let step = 0; step < 170; step++) {
      const t = story.target;
      if (story.stage === 'boss' && view === 'reactor') {
        activate = () => {};
        break;
      }
      if (story.stage === 'fight' && story.encounters.length === 3 && view === 'archive') {
        stand(22.05, -27);
        activate = () => {
          g.encounter.interact(g);
          g.encounter.update(g, 1);
        };
        break;
      }
      if (story.stage === 'use' && t) {
        stand(t.x, t.z, t.y);
        if (view === 'open' || view === 'cover') {
          activate = () => story.interact(g);
          break;
        }
        if (!story.interact(g)) throw Error('旧阶段门无法打开');
      } else for (const b of m.pool) if (b.active && b.storyWave) m.damage(b, 1e7, g);
      g.time += 0.25;
      m.releaseSplits(g);
      story.step(0.25, g);
      if (step === 169) throw Error('无法抵达实验室取景区 ' + view);
    }
  }
  batches.length = 0;
  const first = await nextFrame(),
    start = performance.now();
  activate();
  const activationMs = tenth(performance.now() - start);
  const coords = campaignCameras[stage][view];
  if (coords) {
    const [x, z, lookX, lookZ] = coords;
    // 档案入口可能有机柜室守卫，取最近且无身体重叠的真实站位。
    const offsets = [
      [0, 0],
      ...Array.from({ length: 4 }, (_, i) => i + 1).flatMap((r) =>
        Array.from({ length: 12 }, (_, i) => [
          Math.cos((i * Math.PI) / 6) * r * 0.65,
          Math.sin((i * Math.PI) / 6) * r * 0.65,
        ]),
      ),
    ];
    const free = offsets.find(([dx, dz]) => {
      const a = x + dx,
        b = z + dz,
        y = g.level.surface(a, b, g.level.base(a, b) + 0.46);
      return (
        !g.level.blocked(a, b, y, p.radius, p.height) &&
        !m.pool.some(
          (enemy) =>
            enemy.active &&
            enemy.y < y + p.height &&
            enemy.y + enemy.height > y &&
            Math.hypot(a - enemy.x, b - enemy.z) < enemy.radius + p.radius + 0.35,
        )
      );
    });
    if (!free) throw Error('取景位置缺少驻敌之间的可站立净空 ' + view);
    stand(x + free[0], z + free[1]);
    p.look.rotation.set(-0.025, Math.atan2(p.x - lookX, p.z - lookZ), 0, 'YXZ');
  }
  p.hurtDelay = 1000;
  // 首个完整模拟步也负责把持枪模型从初始局部原点摆到正常持枪位置。
  g.step(1 / 60);
  p.positionCamera(0);
  g.ui.update(0.016, g);
  const drawStart = performance.now();
  window.campaignViewTime = first;
  renderScenarioFrame(first);
  const firstDrawCpuMs = tenth(performance.now() - drawStart);
  const after = await nextFrame();
  m.spawnGroup = spawn;
  const gl = renderer.getContext(),
    ext = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    ...viewCounts(),
    resolution: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    viewport: [innerWidth, innerHeight],
    gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    position: [p.x, p.y, p.z].map(tenth),
    firstPresentedMs: tenth(after - first),
    activationMs,
    firstDrawCpuMs,
    batches,
  };
}

async function sampleCampaignView(frames) {
  const { game, renderer } = run,
    samples = [],
    submitted = [];
  // 截图的 PNG 编码时间不计入推进。模拟钟固定步进，帧间隔来自显示刷新回调。
  let tick = window.campaignViewTime;
  for (let i = 0; i < 20; i++) {
    await nextFrame();
    renderScenarioFrame((tick += 1000 / 60));
  }
  let last = await nextFrame(),
    liveMin = game.beasts.live;
  for (let i = 0; i < frames; i++) {
    renderScenarioFrame((tick += 1000 / 60));
    liveMin = Math.min(liveMin, game.beasts.live);
    submitted.push(game.beasts.visibility.stats.bodies);
    const now = await nextFrame();
    samples.push(now - last);
    last = now;
  }
  samples.sort((a, b) => a - b);
  submitted.sort((a, b) => a - b);
  const quantile = (data, q) => data[Math.ceil(data.length * q) - 1];
  return {
    frames,
    liveMin,
    visibleLast: viewCounts().visible,
    submittedMedian: quantile(submitted, 0.5),
    fps: tenth((1000 * frames) / samples.reduce((sum, x) => sum + x, 0)),
    p50Ms: tenth(quantile(samples, 0.5)),
    p95Ms: tenth(quantile(samples, 0.95)),
    p99Ms: tenth(quantile(samples, 0.99)),
    drawCalls: renderer.info.render.calls,
  };
}
