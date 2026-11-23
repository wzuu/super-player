const variants = { 3: 'hold', 6: 'escort', 9: 'timed' };
export const missionNames = {
  classic: '围剿首领',
  hold: '坚守撤离区',
  escort: '护送勘探无人机',
  timed: '限时撤离',
  endless: '无尽生存',
};
export function campaignMission(stage) {
  return variants[stage] ?? 'classic';
}
export function createObjective(stage, { THREE, scene }, config) {
  const drone = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.42),
    new THREE.MeshBasicMaterial({ color: 0x8effdb }),
  );
  scene.add(drone);
  drone.visible = false;

  const trail = [];
  let hold, deadline, wave, escorted, waiting, mode;
  const goal = {
    reset(selected, game) {
      mode = selected || campaignMission(stage);
      goal.mode = mode;
      hold = 0;
      deadline = null;
      wave = 1;
      escorted = waiting = false;
      trail.length = 0;
      goal.reinforcements = 0;
      drone.visible = mode === 'escort';
      drone.position.set(game.level.spawn.x, game.level.spawn.y + 1, game.level.spawn.z);
    },
    step(dt, g) {
      const p = g.player;
      if (mode === 'hold' && g.nearGate()) hold = Math.min(45, hold + dt);
      if (mode === 'timed' && g.core) {
        deadline ??= g.time + 90;
        if (g.time >= deadline && !g.blast) g.finish(false);
      }
      if (mode === 'escort' && !escorted) {
        const pos = drone.position;
        const gap = Math.hypot(pos.x - p.x, pos.y - p.y - 1, pos.z - p.z);
        if (gap > 10) {
          waiting = true;
          trail.length = 0;
        }
        if (waiting && gap > 2) return;
        waiting = false;
        const last = trail.at(-1) ?? pos;
        if (Math.hypot(p.x - last.x, p.y + 1 - last.y, p.z - last.z) > 0.55 && trail.length < 256)
          trail.push(new THREE.Vector3(p.x, p.y + 1, p.z));
        if (trail.length) {
          const next = trail[0],
            dist = next.distanceTo(pos);
          pos.lerp(next, Math.min(1, (dt * 4.8) / Math.max(0.001, dist)));
          if (dist < 0.25) trail.shift();
        }
        escorted = Math.hypot(pos.x - g.level.gate.x, pos.y - 1 - g.level.gate.y, pos.z - g.level.gate.z) < 4;
      }
      if (mode === 'endless') {
        const next = 1 + Math.floor(g.time / 45);
        if (next > wave) {
          wave = next;
          goal.reinforcements = (wave - 1) * 2;
          g.ui.notify('第 ' + wave + ' 波增援', 2);
        }
      }
    },
    ready(g) {
      if (mode === 'hold') return hold >= 45;
      if (mode === 'escort') return escorted;
      if (mode === 'timed') return g.core && g.bossDead;
      if (mode === 'endless') return false;
      return g.kills >= config.beasts.killsToWin && g.bossDead && g.core;
    },
    label(g) {
      if (mode === 'hold') return '在撤离区内坚守 ' + Math.floor(hold) + ' / 45 秒';
      if (mode === 'timed')
        return deadline === null
          ? '夺取关键道具，90 秒内到达撤离区'
          : '撤离倒计时 ' + Math.max(0, Math.ceil(deadline - g.time)) + ' 秒';
      if (mode === 'escort')
        return (
          (waiting ? '返回无人机旁重新会合 · 距离 ' : '护送绿色无人机到撤离区 · 距离 ') +
          Math.round(Math.hypot(drone.position.x - g.player.x, drone.position.z - g.player.z)) +
          ' 米'
        );
      if (mode === 'endless') return '无尽生存 · 第 ' + wave + ' 波 · ' + Math.floor(g.time) + ' 秒';
      return '';
    },
  };
  return goal;
}
