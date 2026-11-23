import { makeConfig } from '@level-kit/config.mjs';
import { createWorld, createGrid } from '@level-kit/world.mjs';
import { createRendering } from '@level-kit/rendering.mjs';
import { createEffectClasses } from '@level-kit/effects.mjs';
import { createSoundClass } from '@level-kit/audio.mjs';
import { createBeastClasses } from '@level-kit/beasts.mjs';
import { createPlayerClass } from '@level-kit/player.mjs';
import { createPickupClass } from '@level-kit/pickups.mjs';
import { createWeaponClass } from '@level-kit/weapon.mjs';
import { rifleSkins, resolveRifleSkin } from '@level-kit/rifle-skins.mjs';
import { createUIClass } from '@level-kit/ui.mjs';
import { preferences, storePreferences, keyName } from '@level-kit/preferences.mjs';
import { createFieldKit } from '@level-kit/field-kit.mjs';
import { createObjective, campaignMission, missionNames } from '@level-kit/objectives.mjs';
import { qualityMonitor } from '@level-kit/quality.mjs';
import { rotateLook } from '@level-kit/look.mjs';

export function startLevel(definition, campaign = null, campaignStage = 0) {
  if (typeof definition?.buildMap !== 'function') throw new TypeError('关卡需要实现 buildMap()');
  const $ = (id) => document.getElementById(id);
  const canvas = $('world');
  const menus = $('menu');
  const CONFIG = makeConfig(definition.config, campaignStage);
  const prefs = preferences();
  CONFIG.player.mouseSpeed *= prefs.sensitivity;
  CONFIG.player.incoming = { assist: 0.7, standard: 1, hard: 1.35 }[prefs.difficulty];
  CONFIG.player.steady = prefs.steady;
  CONFIG.feedback.hitShake = prefs.hitShake;
  CONFIG.feedback.directionIndicators = prefs.directionIndicators;
  CONFIG.audio.volume = prefs.volume / 100;
  CONFIG.audio.muted = prefs.muted;
  const GRID = createGrid(definition.grid, CONFIG.map.cell);
  const visual = createRendering({ CONFIG, definition, canvas });
  const { THREE, scene, camera, renderer, composer, bloom, weaponCamera, weaponPass } = visual;
  camera.fov = weaponCamera.fov = prefs.fov;
  const { clamp, lerp } = THREE.MathUtils;
  const V3 = THREE.Vector3;
  const TAU = Math.PI * 2;
  const Y_AXIS = new V3(0, 1, 0);
  const workColor = new THREE.Color();
  const brighter = (color, power = 1) => new THREE.Color(color).multiplyScalar(power);
  const randomRange = (a, b) => lerp(a, b, Math.random());
  const palette = definition.palette ?? {};
  const colors = {
    projectileTint: brighter(palette.projectile ?? 0x9bfa48, 2.3),
    ichor: new THREE.Color(palette.ichor ?? 0x9b4763),
    spark: brighter(palette.spark ?? 0xffc280, 3.3),
    coreTint: brighter(palette.core ?? 0xffa064, 2.6),
    rareTint: brighter(palette.rare ?? 0x84eccc, 1.7),
    ammoTint: brighter(palette.ammo ?? 0x7fc8ed, 1.1),
  };
  const TEXT = makeText(definition);
  const context = {
    ...visual,
    CONFIG,
    GRID,
    definition,
    TEXT,
    colors,
    $,
    clamp,
    lerp,
    V3,
    TAU,
    Y_AXIS,
    brighter,
    workColor,
    randomRange,
    seededRandom,
  };
  document.title = definition.pageTitle ?? TEXT.title;
  const { Level, Navigation } = createWorld(context);
  const { Effects, Rift, Projectiles } = createEffectClasses(context);
  const { BeastManager } = createBeastClasses(context);
  const Sound = createSoundClass(context);
  const Player = createPlayerClass(context);
  const Pickups = createPickupClass(context);
  const WeaponSystem = createWeaponClass(context);
  const UI = createUIClass(context);

  const level = new Level();
  const mapData = definition.buildMap({ ...context, level });
  const gate = definition.portal ?? {};
  const gateShield =
    gate.shield === false
      ? null
      : level.box(
          level.gate.x,
          level.gate.z,
          gate.width ?? 4.05,
          gate.depth ?? 0.15,
          level.gate.y + 0.1,
          level.gate.y + (gate.height ?? 4.72),
        );
  const nav = new Navigation(level);
  const look = new THREE.PerspectiveCamera();
  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === canvas && game.phase === 'play') {
      rotateLook(look.rotation, event.movementX, event.movementY, CONFIG.player.mouseSpeed);
    }
  });

  const input = {
    down: new Set(),
    fire: false,
    jump: false,
    reload: false,
    interact: false,
    clear() {
      this.down.clear();
      this.padFire = this.fire = this.jump = this.reload = this.interact = false;
    },
  };
  const sound = new Sound(),
    effects = new Effects();
  const environment = definition.createEnvironment?.({ ...context, level, mapData, sound });
  const rift = definition.createPortal?.({ ...context, level, mapData, sound }) ?? new Rift(level.gate);
  const player = new Player(level, look),
    beasts = new BeastManager(level, nav);
  const projectiles = new Projectiles(level, effects),
    pickups = new Pickups(level, effects);
  const skinId = resolveRifleSkin(campaign?.equippedSkin, resolveRifleSkin(definition.weaponSkin));
  const weapon = new WeaponSystem(skinId),
    ui = new UI(level);
  $('rifle-label').textContent = rifleSkins[skinId].name;
  const burstPoint = new V3();
  const blastTint = brighter(palette.blast ?? 0xb78cff, 2.8);
  const encounter = definition.createEncounter?.({ ...context, level, mapData, sound });

  const kit = createFieldKit(
    CONFIG,
    ['KeyQ', 'KeyE', 'Digit1', 'Digit2'].map((id) => keyName(prefs.keys[id])),
    visual,
  );
  const objective = createObjective(campaignStage, visual, CONFIG);
  const modeSelect = $('mission-mode');
  for (const id of new Set([campaignMission(campaignStage), 'classic', 'endless']))
    modeSelect.add(new Option(missionNames[id], id));
  let packed = null,
    preparing = false;
  const game = {
    kit,
    objective,
    level,
    player,
    beasts,
    pickups,
    weapon,
    effects,
    sound,
    projectiles,
    ui,
    encounter,
    phase: 'ready',
    time: 0,
    kills: 0,
    core: false,
    bossDead: false,
    loot: [],
    value: 0,
    hitStop: 0,
    shotAt: -Infinity,
    shotX: 0,
    shotY: 0,
    shotZ: 0,
    shotHearingScale: 1,
    footstep: { at: -Infinity, x: 0, y: 0, z: 0, radius: 0 },
    blast: 0,
    blastClock: 0,
    reset() {
      campaign?.reset();
      this.time = 0;
      this.kills = 0;
      this.core = false;
      this.bossDead = false;
      this.loot.length = 0;
      this.value = 0;
      this.shotAt = -Infinity;
      this.footstep.at = -Infinity;
      encounter?.reset?.();
      this.hitStop = 0;
      this.blast = 0;
      this.blastClock = 0;
      if (gateShield) gateShield.active = true;
      kit.reset(packed);
      packed = null;
      objective.reset(modeSelect.value, this);
      player.reset();
      beasts.reset(player);
      projectiles.reset();
      effects.reset();
      pickups.reset();
      weapon.reset();
      ui.reset();
      input.clear();
    },
    ready() {
      return objective.ready(this);
    },
    nearGate() {
      return (
        Math.abs(player.y - level.gate.y) < (gate.verticalRange ?? 2) &&
        Math.hypot(player.x - level.gate.x, player.z - level.gate.z) < (gate.useRadius ?? 4.55)
      );
    },
    trigger() {
      if (!this.ready() || !this.nearGate() || this.blast > 0) return;
      this.blast = 0.001;
      this.blastClock = 0;
      if (gateShield) gateShield.active = false;
      sound.blast();
      burstPoint.copy(level.gate);
      burstPoint.y += 1.8;
      effects.spray(burstPoint, colors.coreTint, 150, 15.5, 0.15, 'spark');
      burstPoint.y += 0.45;
      effects.spray(burstPoint, blastTint, 82, 9.2, 0.23, 'mist');
      player.shake = 1.34;
      weapon.group.visible = false;
      input.clear();
    },
    finish(won) {
      if (this.phase !== 'play') return;
      this.phase = won ? 'win' : 'fail';
      if (!won) {
        this.loot.length = 0;
        this.value = 0;
      }
      input.clear();
      sound.active(false);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      ui.nodes.hud.hidden = true;
      weapon.group.visible = false;
      $('equipment-hud').hidden = true;
      modeSelect.disabled = false;
      if (campaign) $('preparation').hidden = false;
      ui.menu(this.phase, this);
      campaign?.finish({
        won,
        kills: this.kills,
        durationMs: Math.round(this.time * 1000),
        loot: this.loot,
        remaining: kit.remaining(),
      });
    },
    step(dt) {
      this.time += dt;
      if (!this.blast) {
        objective.step(dt, this);
        if (this.phase !== 'play') return;
        kit.step(dt, this);
      }
      encounter?.update(this, dt);
      if (this.phase !== 'play') return;
      const frozen = Math.min(dt, this.hitStop);
      this.hitStop -= frozen;
      if (!this.blast) {
        weapon.combat.passive(dt, this);
        player.update(dt - frozen, input, this);
        const interact = input.interact;
        input.interact = false;
        if (interact && !pickups.takeKey(player, this)) {
          if (this.nearGate()) {
            if (!this.ready()) ui.notify(objective.label(this) || TEXT.locked, 1.55);
            this.trigger();
          } else if (encounter?.interactionHint?.(this) || !pickups.takeAimed(player,this)) {
            encounter?.interact?.(this);
          }
        }
        if (!this.blast) {
          player.positionCamera(0);
          weapon.update(dt, input, this);
          if (encounter?.beastsDisabled) beasts.fadeHitFlashes(dt, this);
          else beasts.update(dt - frozen, player, this);
          projectiles.update(dt - frozen, player, this);
          if (this.phase !== 'play') return;
          pickups.update(dt, player, this);
        }
      } else {
        this.blastClock += dt;
        this.blast = clamp(this.blastClock / CONFIG.effects.gateDuration, 0.001, 1);
        player.shake = Math.max(player.shake, (1 - this.blast) * 0.7);
        if (this.blast >= 1) this.finish(true);
      }
      effects.update(dt);
      player.positionCamera(dt);
      if (this.phase === 'play') sound.updateThreats(this);
      weapon.render(dt, player, this);
      ui.update(dt, this);
    },
  };

  function pause() {
    if (game.phase !== 'play') return;
    if (lastFrame !== null) pendingTime += Math.max(0, (performance.now() - lastFrame) / 1000);
    game.phase = 'pause';
    input.clear();
    sound.active(false);
    $('equipment-hud').hidden = true;
    ui.menu('pause', game);
  }

  function startGame() {
    if (!canvas.requestPointerLock) {
      ui.text('menu-status', '此浏览器无法锁定鼠标，请使用支持 Pointer Lock 的桌面浏览器。');
      return;
    }
    if (document.pointerLockElement === canvas) return;
    ui.text('menu-status', '');
    try {
      // 在点击事件中请求锁定，保留浏览器所需的用户激活状态。
      const result = canvas.requestPointerLock();
      result?.catch(lockError);
      sound.open();
    } catch {
      lockError();
    }
  }

  function lockError() {
    ui.text('menu-status', '鼠标锁定未成功。请聚焦此窗口，再点击进入游戏。');
  }

  document.addEventListener('pointerlockchange', async () => {
    if (document.pointerLockElement !== canvas) {
      pause();
      return;
    }
    if (preparing) return;
    if (game.phase !== 'pause') {
      if (campaign && !packed) {
        preparing = true;
        try {
          packed = await campaign.prepare();
        } catch (error) {
          ui.text('menu-status', error.message);
          document.exitPointerLock();
          return;
        } finally {
          preparing = false;
        }
        if (document.pointerLockElement !== canvas) return;
      }
      game.reset();
      pendingTime = 0;
    }
    if (menus.open) menus.close();
    lastFrame = performance.now();
    game.phase = 'play';
    $('equipment-hud').hidden = false;
    $('preparation').hidden = true;
    modeSelect.disabled = true;
    ui.nodes.hud.hidden = false;
    weapon.group.visible = game.blast === 0;
    sound.active(true);
    ui.update(0, game);
  });
  document.addEventListener('pointerlockerror', lockError);
  menus.addEventListener('cancel', (event) => event.preventDefault());
  $('start').addEventListener('click', startGame);
  $('sound').addEventListener('click', () => {
    sound.toggle();
    try {
      storePreferences({ ...preferences(), muted: !sound.enabled });
    } catch {
      /* 本局音效仍可切换 */
    }
    $('sound').setAttribute('aria-pressed', String(sound.enabled));
    ui.text('sound', sound.enabled ? '音效开启' : '音效关闭');
  });

  const keyMap = new Map(Object.entries(prefs.keys).map(([action, code]) => [code, action]));
  if (prefs.keys.ShiftLeft === 'ShiftLeft' && !keyMap.has('ShiftRight'))
    keyMap.set('ShiftRight', 'ShiftLeft');
  const capturedKeys = new Set(Object.keys(prefs.keys));
  const names = (ids) => ids.map((id) => keyName(prefs.keys[id])).join(' / ');
  const guide = $('guide').querySelectorAll('dt');
  guide[0].textContent = names(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
  guide[2].textContent = names(['ShiftLeft', 'Space']);
  guide[3].textContent = names(['KeyR', 'KeyF']) + ' / Esc';
  guide[4].textContent = names(['KeyC']);
  guide[5].textContent = names(['KeyQ', 'KeyE']);
  guide[6].textContent = names(['Digit1', 'Digit2']);
  CONFIG.interactLabel = keyName(prefs.keys.KeyF);
  function pressAction(code) {
    if (code === 'KeyR') input.reload = true;
    if (code === 'Space') input.jump = true;
    if (code === 'KeyF') input.interact = true;
    const slot = ['KeyQ', 'KeyE', 'Digit1', 'Digit2'].indexOf(code);
    if (slot >= 0) game.kit?.use(slot, game);
  }
  if (CONFIG.player.crouch) capturedKeys.add('KeyC');
  document.addEventListener('keydown', (event) => {
    if (game.phase !== 'play') return;
    if (event.code === 'Escape' && document.pointerLockElement === canvas) {
      event.preventDefault();
      document.exitPointerLock();
      return;
    }
    const code = keyMap.get(event.code);
    if (!capturedKeys.has(code)) return;
    event.preventDefault();
    input.down.add(code);
    if (event.repeat) return;
    pressAction(code);
  });
  document.addEventListener('keyup', (event) => input.down.delete(keyMap.get(event.code)));
  document.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || game.phase !== 'play' || document.pointerLockElement !== canvas) return;
    event.preventDefault();
    input.fire = true;
  });
  document.addEventListener('mouseup', (event) => {
    if (event.button === 0) input.fire = false;
  });
  window.addEventListener('blur', input.clear.bind(input));
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  const padDown = new Set(),
    previousButtons = new Set();
  function pollPad(dt) {
    if (!prefs.gamepad) return;
    let pad;
    try { pad = [...(navigator.getGamepads?.() ?? [])].find(p => p?.mapping === 'standard'); }
    catch { prefs.gamepad=false; }
    padDown.clear();
    input.padFire = false;
    if (!pad) {
      previousButtons.clear();
      return;
    }
    const [x, y, rx, ry] = pad.axes;
    if (Math.abs(x) > 0.22) padDown.add(x > 0 ? 'KeyD' : 'KeyA');
    if (Math.abs(y) > 0.22) padDown.add(y > 0 ? 'KeyS' : 'KeyW');
    if (pad.buttons[10]?.pressed) padDown.add('ShiftLeft');
    if (pad.buttons[1]?.pressed) padDown.add('KeyC');
    rotateLook(
      look.rotation,
      Math.abs(rx) > 0.15 ? rx * dt * 850 : 0,
      Math.abs(ry) > 0.15 ? ry * dt * 850 : 0,
      CONFIG.player.mouseSpeed,
    );
    input.padFire = pad.buttons[7]?.pressed;
    for (const [index, action] of [
      [0, 'Space'],
      [2, 'KeyR'],
      [3, 'KeyF'],
      [4, 'KeyQ'],
      [5, 'KeyE'],
      [12, 'Digit1'],
      [13, 'Digit2'],
    ]) {
      if (pad.buttons[index]?.pressed) {
        if (!previousButtons.has(index)) pressAction(action);
        previousButtons.add(index);
      } else previousButtons.delete(index);
    }
  }
  input.held = (code) => input.down.has(code) || padDown.has(code);
  let pixelScale = 1;
  function resize() {
    const width = canvas.clientWidth || window.innerWidth,
      height = canvas.clientHeight || window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, CONFIG.graphics.maxPixelRatio) * pixelScale;
    camera.aspect = weaponCamera.aspect = width / height;
    camera.updateProjectionMatrix();
    weaponCamera.updateProjectionMatrix();
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(ratio);
    composer.setSize(width, height);
    bloom.setSize(width * ratio * CONFIG.graphics.bloomScale, height * ratio * CONFIG.graphics.bloomScale);
  }

  let lastFrame = null,
    pendingTime = 0,
    worldTime = 0,
    requested = 0;
  let catchUpTimer = 0;
  const farFrames = CONFIG.beasts.farUpdateFrames;
  const reflectors = [];
  scene.traverse((node) => {
    if (node.isReflector || node.type === 'Reflector') reflectors.push(node);
  });
  const measure = qualityMonitor(prefs.quality, (tier) => {
    const low = tier === 'low',
      high = tier === 'high';
    CONFIG.graphics.particleScale = high ? 1 : low ? 0.3 : 0.65;
    CONFIG.beasts.farUpdateFrames = farFrames * (high ? 1 : low ? 3 : 2);
    for (const surface of reflectors) surface.visible = !low;
    bloom.enabled = !low;
    pixelScale = high ? 1 : low ? 0.65 : 0.85;
    resize();
  });
  function advanceSimulation() {
    if (game.phase !== 'play' || document.hidden) return;
    // 长帧拆成最多 40 毫秒的步长。分批让出事件循环，极低帧率下也能结清前台时间。
    const steps = Math.min(8, Math.ceil(pendingTime / 0.04));
    if (!steps) return;
    const step = Math.min(0.04, pendingTime / steps);
    for (let i = 0; i < steps && game.phase === 'play'; i++) game.step(step);
    pendingTime = Math.max(0, pendingTime - step * steps);
    if (pendingTime > 1e-9 && game.phase === 'play' && !catchUpTimer) {
      catchUpTimer = setTimeout(() => {
        catchUpTimer = 0;
        advanceSimulation();
      }, 0);
    }
  }
  function animate(now) {
    requested = 0;
    if (document.hidden) return;
    const dt = lastFrame === null ? 0 : Math.max(0, (now - lastFrame) / 1000);
    lastFrame = Math.max(lastFrame ?? now, now);
    worldTime += dt;
    // 失焦时暂停模拟和 WebGL 绘制，重新进入页面不补算隐藏期间的时间。
    if (game.phase === 'play') {
      pollPad(Math.min(dt, 0.1));
      const sample = measure(dt);
      if (sample && prefs.metrics) {
        $('performance').hidden = false;
        $('performance').textContent =
          sample.fps +
          ' FPS · 凶兽 ' +
          beasts.live +
          ' · Draw ' +
          renderer.info.render.calls +
          ' · ' +
          sample.tier;
      }
      pendingTime += dt;
      advanceSimulation();
    }
    if (game.phase === 'play' || game.phase === 'pause' || game.phase === 'win' || game.phase === 'fail') {
      beasts.render(
        game.phase === 'play' && !game.encounter?.beastsDisabled ? dt : 0,
        game.time,
        game.encounter?.beastsDisabled,
      );
    }
    pickups.render(game.phase === 'ready' ? worldTime : game.time);
    environment?.update(worldTime, game.phase === 'play', game);
    rift.update(worldTime, game.ready(), game.blast);
    renderer.info.reset();
    weaponPass.enabled = weapon.group.visible;
    composer.render(dt);
    requested = requestAnimationFrame(animate);
  }

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (requested) cancelAnimationFrame(requested);
      pause();
      requested = 0;
      lastFrame = null;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      if (sound.ctx?.state === 'running') sound.ctx.suspend().catch(() => {});
    } else if (!requested) {
      requested = requestAnimationFrame(animate);
    }
  });
  pickups.reset();
  resize();
  $('sound').setAttribute('aria-pressed', String(sound.enabled));
  ui.text('sound', sound.enabled ? '音效开启' : '音效关闭');
  $('start').disabled = false;
  ui.menu('ready', game);
  requested = requestAnimationFrame(animate);

  return { game, scene, camera, renderer, config: CONFIG, grid: GRID, nav };
}

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function makeText(definition) {
  const theme = definition.text ?? {};
  const enemy = theme.enemy ?? '凶兽';
  const keyItem = theme.keyItem ?? '关键道具';
  const portal = theme.portal ?? '传送门';
  const loot = theme.loot ?? '宝物';
  const bossName = theme.bossName ?? '首领凶兽';
  return {
    tag: '地图关卡',
    title: '走位射击',
    enter: '进入关卡',
    brief: '沿开阔路线边打边退，击杀凶兽，夺取关键道具并引爆传送门，带走沿途找到的宝物。',
    pauseBrief: '返回地图后，战斗会从暂停处继续。',
    winBrief: `你已引爆${portal}，带着搜集到的${loot}成功撤离。`,
    failBrief: `你在战斗中倒下，本局拾取的${loot}已丢失。`,
    objective: `清除${enemy}，击杀${bossName}并夺取${keyItem}`,
    exitObjective: `前往${portal}，按 F 引爆`,
    detonating: `${portal}屏障崩解中`,
    coreCollected: `已取得${keyItem}，前往${portal}`,
    bossDefeated: `${bossName}已倒下，靠近拾取${keyItem}`,
    rage: `${bossName}狂暴，群攻体正在聚集`,
    locked: `解除封印需要达到击杀目标并取得${keyItem}`,
    safe: '出生安全区',
    enemy,
    portal,
    bossName,
    keyItem,
    loot,
    ...theme,
  };
}
