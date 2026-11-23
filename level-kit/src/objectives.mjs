const variants = { 3: 'hold', 6: 'escort', 9: 'timed', 15: 'rescue' };
export const missionRules = { holdSeconds: 45, escapeSeconds: 90, waveSeconds: 45, demolitionSeconds: 10, rescueSeconds: 90 };
export const missionNames = {
  classic: '围剿首领',
  hold: '坚守撤离区',
  escort: '护送勘探无人机',
  timed: '限时撤离',
  endless: '无尽生存',
  rescue: '高塔救援',
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
  const reunionRay={x:0,y:0,z:0};
  let hold, deadline, wave, escorted, waiting, mode, underAttackUntil;
  const goal = {
    drone,
    reset(selected, game) {
      mode = selected || campaignMission(stage);
      goal.mode = mode;
      hold = 0;
      deadline = null;
      wave = 1;
      escorted = waiting = false;
      goal.escortHealth = 100;
      underAttackUntil = 0;
      drone.material?.color?.setHex(0x8effdb);
      trail.length = 0;
      goal.reinforcements = 0;
      drone.visible = mode === 'escort';
      drone.position.set(game.level.spawn.x, game.level.spawn.y + 1, game.level.spawn.z);
    },
    step(dt, g) {
      if (g.field?.deep) return;
      const p = g.player;
      if (mode === 'hold' && (!g.story?.managed || g.story.stage === 'hold') && g.nearGate())
        hold = Math.min(missionRules.holdSeconds, hold + dt);
      if (mode === 'timed' && g.core) {
        deadline ??= g.time + missionRules.escapeSeconds;
        if (g.time >= deadline && !g.blast) g.finish(false, '撤离倒计时结束');
      }
      if (mode === 'escort' && !escorted) {
        if (g.time >= underAttackUntil && drone.material) drone.material.color.setHex(goal.escortHealth <= 40 ? 0xff8957 : 0x8effdb);
        const pos = drone.position;
        const gap = Math.hypot(pos.x - p.x, pos.y - p.y - 1, pos.z - p.z);
        if (gap > 10) {
          if(!waiting) g.sound?.stageEvent?.('warning',g,pos);
          waiting = true;
          trail.length = 0;
        }
        if ((waiting && gap > 2) || g.story?.droneDocked) return;
        if (waiting && gap>.01 && g.level.visible) {
          reunionRay.x=(p.x-pos.x)/gap;
          reunionRay.y=(p.y+1-pos.y)/gap;
          reunionRay.z=(p.z-pos.z)/gap;
          if (!g.level.visible(pos,reunionRay,gap)) return;
        }
        if(waiting) g.sound?.stageEvent?.('clear',g,pos);
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
        escorted = !g.story?.blocksExit && Math.hypot(pos.x - g.level.gate.x, pos.y - 1 - g.level.gate.y, pos.z - g.level.gate.z) < 4;
      }
      if (mode === 'endless') {
        const next = 1 + Math.floor(g.time / missionRules.waveSeconds);
        if (next > wave) {
          wave = next;
          goal.reinforcements = (wave - 1) * 2;
          g.ui.notify('第 ' + wave + ' 波增援', 2);
        }
      }
    },
    ready(g) {
      if (g.field?.deep) return false;
      if (mode==='hunt') return g.field?.huntWon ?? false;
      if (g.story?.managed && g.story.blocksExit) return false;
      if (mode === 'hold') return hold >= missionRules.holdSeconds;
      if (mode === 'escort') return escorted;
      if (mode === 'timed') return g.core && g.bossDead;
      if (mode === 'endless') return false;
      return g.kills >= config.beasts.killsToWin && g.bossDead && g.core;
    },
    get held() { return hold; },
    damageDrone(amount, g) {
      if (mode !== 'escort' || escorted || goal.escortHealth <= 0) return;
      goal.escortHealth = Math.max(0, goal.escortHealth - amount);
      underAttackUntil = g.time + 2;
      drone.material.color.setHex(goal.escortHealth <= 40 ? 0xff8957 : 0xffcf67);
      g.sound.tone(510, 250, .16, .13, 'triangle');
      g.sound.stageEvent?.('impact',g,drone.position);
      g.ui.notify('无人机受袭 · 剩余耐久 ' + goal.escortHealth + '%', 1.6);
      if (!goal.escortHealth) g.finish(false, '勘探无人机已损毁');
    },
    result(g) {
      const deep = g.field?.deep ? {deepCompleted:Boolean(g.field.deepFinished),deepSeconds:Math.floor(g.time-g.field.deepAt)} : {};
      if (mode==='hunt') return {...deep,huntWon:g.field?.huntWon??false, huntSeconds:g.field?.huntTime ?? Math.floor(g.time)};
      if (mode === 'endless') return { wave };
      if (mode === 'hold') {
        const demolition=typeof g.story?.detonated==='boolean' ? {detonated:g.story.detonated} : {};
        return { ...deep,...demolition,holdSeconds: Math.floor(hold) };
      }
      if (mode === 'escort') return { ...deep,escortHealth: goal.escortHealth, escorted };
      if (mode === 'timed') return { ...deep,escapeSeconds: deadline === null ? null : Math.max(0, Math.ceil(deadline - g.time)) };
      if (mode === 'rescue') return { ...deep,holdSeconds: Math.floor(g.story.elapsed), boarded: g.story.stage === 'boarded' };
      return { ...deep,core: g.core, bossDead: g.bossDead };
    },
    label(g) {
      if (mode === 'hold') return '坚守 ' + Math.floor(hold) + ' / ' + missionRules.holdSeconds + ' 秒';
      if (mode === 'timed')
        return deadline === null
          ? '取得道具后 ' + missionRules.escapeSeconds + ' 秒内撤离'
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
    guide(g, text) {
      const optional=g.field?.guide(g);
      if(optional)return optional;
      const gate = g.level.gate;
      const step = (stage, title, target = null, detail = '') => ({ stage, title, target, detail });
      if (g.blast) return step('blast', text.detonating);
      const route = g.story?.guide(g,text);
      if (route && !(mode === 'escort' && waiting && !g.story.droneDocked))
        return mode === 'escort' ? { ...route, detail: [route.detail, underAttackUntil>g.time?'无人机受袭':'', '无人机耐久 ' + goal.escortHealth + '%'].filter(Boolean).join(' · ') } : route;
      if (mode === 'endless') return step('wave-' + wave, '击退第 ' + wave + ' 波凶兽', null,
        '下一波增援 ' + Math.max(0, Math.ceil(wave * missionRules.waveSeconds - g.time)) + ' 秒');
      if (goal.ready(g)) {
        const near = g.nearGate();
        return step(near ? 'interact' : 'exit', near ? '按 F 引爆' + text.portal : text.exitObjective,
          near ? null : gate, mode === 'timed' ? goal.label(g) : '');
      }
      if (mode === 'hold') {
        const near = g.nearGate();
        return step(near ? 'holding' : 'approach', near ? '守住' + text.portal : '前往' + text.portal + '坚守',
          near ? null : gate, goal.label(g));
      }
      if (mode === 'escort') {
        const health = (underAttackUntil > g.time ? '受袭 · ' : '') + '无人机耐久 ' + goal.escortHealth + '%';
        if (waiting) return step('regroup', '返回勘探无人机旁重新会合', drone.position, health);
        return step('escort', '护送无人机前往' + text.portal, gate,
          health + ' · 距撤离点 ' + Math.round(drone.position.distanceTo(gate)) + ' 米');
      }
      if (!g.bossDead) return step(g.kills >= config.beasts.killsToWin && mode === 'classic' ? 'boss-last' : 'boss',
        '击败' + text.bossName, g.beasts.boss ?? g.level.bossAnchor, mode === 'timed' ? goal.label(g) : '');
      if (!g.core) {
        const near = g.pickups.nearKey(g.player);
        return step(near ? 'collect' : 'find-core', (near ? '按 F 拾取' : '前往拾取') + text.keyItem,
          near ? null : g.pickups.keyItem);
      }
      return step('clear', '继续清剿' + text.enemy, null,
        '还需击败 ' + Math.max(0, config.beasts.killsToWin - g.kills) + ' 只');
    },
  };
  return goal;
}
