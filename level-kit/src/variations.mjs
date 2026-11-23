export const variations = [
  {
    id: 'fog',
    name: '浓雾',
    detail: '视距缩短，补给光柱增强',
    weight: 2,
    exclude: [5],
    fog: 1.75,
    beam: 1.55,
  },
  { id: 'blackout', name: '停电', detail: '照明降低，沿发光标记前进', weight: 1, light: 0.54 },
  {
    id: 'fury',
    name: '狂暴兽群',
    detail: '凶兽更快、攻击更强，宝物增值',
    weight: 2,
    speed: 1.15,
    damage: 1.16,
    value: 1.25,
  },
  { id: 'patrol', name: '精英巡逻', detail: '巡逻队有精英个体', weight: 1, elites: 2 },
  { id: 'plenty', name: '补给丰年', detail: '弹药补给增加，宝物价值降低', weight: 2, ammo: 1.5, value: 0.8 },
  { id: 'quiet', name: '静默', detail: '枪声和脚步更难引起远处凶兽注意', weight: 1, hearing: 0.55 },
];
export function drawVariation(stage, previous, random = Math.random) {
  const pool = variations.filter((v) => v.id !== previous && !v.exclude?.includes(stage));
  let cursor = random() * pool.reduce((sum, v) => sum + v.weight, 0);
  return pool.find((v) => (cursor -= v.weight) < 0) ?? pool.at(-1);
}
export function variationDeck(stage, config, visual, mode, node) {
  const key = 'super-player:variation:' + stage;
  let previous,
    pending,
    inRun = false;
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? '{}');
    previous = saved.previous;
    pending = variations.find((v) => v.id === saved.pending);
  } catch {}
  const exposure = visual.renderer.toneMappingExposure,
    fog = visual.scene.fog?.density ?? 0;
  const enabled = () => stage > 0 && mode.value !== 'endless';
  function preview() {
    pending ??= drawVariation(stage, previous);
    if (stage)
      try {
        localStorage.setItem(key, JSON.stringify({ previous, pending: pending.id }));
      } catch {}
    node.hidden = !enabled();
    node.textContent = enabled() ? '本局变奏 · ' + pending.name + ' / ' + pending.detail : '';
  }
  mode.addEventListener('change', preview);
  preview();
  return {
    start(game) {
      const v = enabled() && !game.training ? pending : null;
      game.variation = v;
      config.pickups.beamScale = v?.beam ?? 1;
      visual.renderer.toneMappingExposure = exposure * (v?.light ?? 1);
      if (visual.scene.fog) visual.scene.fog.density = fog * (v?.fog ?? 1);
      game.patrolRemaining = v?.elites ?? 0;
      if (v) {
        previous = v.id;
        try {
          localStorage.setItem(key, JSON.stringify({ previous }));
        } catch {}
      }
      inRun = true;
    },
    finish() {
      if (inRun) {
        inRun = false;
        pending = null;
        preview();
      }
    },
  };
}
