import { aimInstructions, keyName } from '@level-kit/preferences.mjs';

export function createTraining(config, prefs) {
  if (!document.body.hasAttribute('data-practice')) return null;
  const range = new URLSearchParams(location.search).get('mode') === 'range';
  const bind = (id) => keyName(prefs.keys[id]);
  Object.assign(config.beasts, {
    population: range ? 10 : 0,
    capacity: range ? 18 : 8,
  });
  Object.assign(config.weapon, { magazine: range ? 24 : 6, reloadTime: range ? 0.32 : 0.75 });
  config.player.crouch = { height: 1.05, eye: 0.96, speed: 0.58 };
  config.player.safeTime = range ? 3 : 0;
  if (!range) {
    Object.assign(config.beasts.types[0], { hp: 24, damage: 1 });
    Object.assign(config.beasts.types[3], { hp: 90, damage: 2, summonCount: 0 });
  }
  let stage, baseline, pauseSeen, used, directions, target, pickup;
  let wave, nextWave, waveEntries;
  function openRangeWave(g) {
    if (g.beasts.live || g.time < nextWave) return;
    const count = Math.min(config.beasts.capacity, config.beasts.population + wave * 2);
    waveEntries ??= Array.from({ length: count }, () => g.beasts.randomType());
    if (!g.beasts.spawnGroup(waveEntries).length) return;
    wave++;
    nextWave = g.time + 18;
    waveEntries = null;
  }
  function placeTarget(g, id) {
    [target] = g.beasts.spawnGroup([{ type: id === 'boss' ? 3 : 0, regular: false, anchor: g.level.bossSpawn }]);
  }
  const moveKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
  const aimHint = aimInstructions(prefs.aimMode);
  const tasks = [
    ['look', '移动鼠标或右摇杆转向'],
    ['walk', '向四个方向移动 · ' + moveKeys.map(bind).join(' / ')],
    ['sprint', '向前移动时按住 ' + bind('ShiftLeft') + ' 冲刺，观察体力条'],
    ['jump', '按 ' + bind('Space') + ' 跳跃'],
    ['crouch', '按住 ' + bind('KeyC') + ' 蹲伏'],
    ['pause', '按 Esc 释放鼠标，再选择继续战斗'],
    ...(aimHint ? [['aim', aimHint]] : []),
    ['shoot', '按鼠标左键射击一次，观察弹匣读数'],
    ['reload', '按 ' + bind('KeyR') + ' 提前换弹'],
    ['empty', '持续射击至空仓，等待自动换弹完成'],
    ['pickup', '按小地图指引靠近补给并拾取'],
    ['slot0', '按 ' + bind('KeyQ') + ' 使用翻滚'],
    ['slot1', '按 ' + bind('KeyE') + ' 使用冲击波'],
    ['slot2', '按 ' + bind('Digit1') + ' 使用急救包，观察生命恢复'],
    ['slot3', '瞄准空地，按 ' + bind('Digit2') + ' 投出手雷，观察抛物线和延时爆炸'],
    ['kill', '击败标记的训练目标'],
    ['boss', '击败教学首领'],
    ['core', '靠近首领掉落的关键物，按 ' + bind('KeyF') + ' 拾取'],
    ['gate', '抵达小地图标记的撤离点，按 ' + bind('KeyF') + ' 撤离'],
  ];
  function setup(g) {
    used = new Set();
    const p = g.player,
      w = g.weapon;
    baseline = {
      yaw: p.look.rotation.y,
      pitch: p.look.rotation.x,
      x: p.x,
      z: p.z,
      shots: g.performance.shots,
    };
    const id = tasks[stage][0];
    if (id === 'reload') w.ammo = Math.max(1, config.weapon.magazine - 2);
    if (id === 'empty') w.ammo = 3;
    if (id === 'pickup') {
      w.reserve = 0;
      const spawn = g.level.spawn;
      pickup = g.pickups.add('ammo', spawn.x, spawn.z - 4, spawn.y, '练习弹药', 12, true);
    }
    if (id === 'slot2') p.hp = Math.min(p.hp, 65);
    // 允许玩家提前试用道具，到教学步骤时至少有一次实操机会。
    const supply = id === 'slot2' ? 'medkit' : id === 'slot3' ? 'grenade' : null;
    if (supply && !g.kit.remaining()[supply]) g.kit.supply(supply);
    if (id === 'kill' || id === 'boss') placeTarget(g, id);
  }
  return {
    kind: range ? 'range' : 'tutorial',
    title: range ? '火力试验场' : '新手教程',
    kit: {
      skills: ['roll', 'pulse'],
      items: ['medkit', 'grenade'],
      counts: { medkit: 3, grenade: 3 },
      mods: {},
    },
    controls:
      '鼠标左键射击。' + (aimHint ? aimHint + '。' : '') +
      '按住 ' + bind('KeyC') + ' 蹲伏通过低矮通道，按 ' + bind('KeyF') + ' 操作机关与关键物。' +
      '遇到红色自爆体先拉开距离，在它膨胀时击杀。蓝环护盾体保护身边的同伴，瞄准核心可破盾。绿色孵化体蓄能时，射击可打断孵化和治疗。' +
      '战场图鉴列有元素反应，毒镖步枪配合手雷可触发毒爆。' +
      (prefs.gamepad
        ? ' 标准手柄：双摇杆移动和转向，右扳机射击，左摇杆按下冲刺，A 跳跃、B 蹲伏、X 换弹、Y 交互，肩键使用技能，方向键上下使用道具。'
        : ''),
    reset(g) {
      stage = 0;
      pauseSeen = false;
      directions = new Set();
      target = pickup = null;
      if (range) {
        g.weapon.reserve = Infinity;
        wave = nextWave = 0;
        waveEntries = null;
        openRangeWave(g);
        return;
      }
      setup(g);
    },
    paused() {
      pauseSeen = true;
    },
    did(action) {
      used?.add(action);
    },
    step(g, input) {
      if (range) {
        g.weapon.reserve = Infinity;
        openRangeWave(g);
        return;
      }
      const id = tasks[stage][0],
        p = g.player,
        w = g.weapon;
      if ((id === 'kill' || id === 'boss') && !target) placeTarget(g, id);
      if (id === 'walk' && Math.hypot(p.x - baseline.x, p.z - baseline.z) > 0.005) {
        for (const key of moveKeys) if (input.held(key)) directions.add(key);
        baseline.x = p.x;
        baseline.z = p.z;
      }
      if (id === 'empty' && w.ammo === 0 && w.reloadLeft > 0) used.add('empty');
      if (id === 'reload' && w.reloadLeft > 0) used.add('reload');
      const done =
        id === 'look'
          ? Math.abs(p.look.rotation.y - baseline.yaw) + Math.abs(p.look.rotation.x - baseline.pitch) > 0.08
          : id === 'walk'
            ? directions.size === 4
            : id === 'sprint'
              ? p.sprinting
              : id === 'jump'
                ? !p.grounded && p.vy > 0
                : id === 'crouch'
                  ? p.crouched
                  : id === 'pause'
                    ? pauseSeen
                    : id === 'aim'
                      ? p.aiming
                      : id === 'shoot'
                        ? g.performance.shots > baseline.shots
                        : id === 'empty' || id === 'reload'
                          ? used.has(id) && w.ammo > 0 && !w.reloadLeft
                          : id === 'pickup'
                            ? !pickup?.active && w.reserve > 0
                            : id.startsWith('slot')
                              ? used.has(id)
                              : id === 'kill'
                                ? g.kills > 0
                                : id === 'boss'
                                  ? g.bossDead
                                  : id === 'core'
                                    ? g.core
                                    : false;
      if (done && stage < tasks.length - 1) {
        stage++;
        if (tasks[stage][0] === 'pause') pauseSeen = false;
        setup(g);
      }
    },
    guide(g) {
      if (range)
        return {
          stage: 'range',
          title:
            '第 ' +
            wave +
            ' 波 · ' +
            Math.floor(g.time) +
            ' 秒 · ' +
            g.kills +
            ' 击杀',
          detail: (g.beasts.live ? '清空本波敌群' : '下一波倒计时 ' + Math.max(0, Math.ceil(nextWave - g.time)) + ' 秒') +
            ' · 无限备弹 · Esc 暂停、重开或返回首页',
        };
      const [id, title] = tasks[stage];
      return {
        stage: 'tutorial-' + id,
        title,
        detail: '训练 ' + (stage + 1) + ' / ' + tasks.length,
        target:
          id === 'pickup'
            ? pickup
            : id === 'kill' || id === 'boss'
              ? target
              : id === 'core'
                ? g.pickups.keyItem
                : id === 'gate'
                  ? g.level.gate
                  : null,
      };
    },
  };
}
