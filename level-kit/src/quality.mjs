export function qualityMonitor(mode, update) {
  const tiers = ['low', 'medium', 'high'];
  let tier = mode === 'auto' ? 2 : tiers.indexOf(mode);
  let seconds = 0,
    frames = 0,
    slow = 0,
    fast = 0;
  update(tiers[tier]);
  return (dt) => {
    if (!(dt > 0)) return;
    seconds += dt;
    frames++;
    if (seconds < 1) return;
    const fps = frames / seconds;
    seconds = frames = 0;
    slow = fps < 45 ? slow + 1 : 0;
    fast = fps > 57 ? fast + 1 : 0;
    if (mode === 'auto' && ((slow >= 3 && tier > 0) || (fast >= 12 && tier < 2))) {
      tier += slow ? -1 : 1;
      slow = fast = 0;
      update(tiers[tier]);
    }
    return { fps: Math.round(fps), tier: tiers[tier] };
  };
}
