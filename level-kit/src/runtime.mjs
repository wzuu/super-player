import { makeConfig } from '@level-kit/config.mjs';
import { createWorld, createGrid } from '@level-kit/world.mjs';
import { createRendering } from '@level-kit/rendering.mjs';
import { createEffectClasses } from '@level-kit/effects.mjs';
import { createSoundClass } from '@level-kit/audio.mjs';
import { stageVoice } from '@level-kit/stage-voice.mjs';
import { createBeastClasses } from '@level-kit/beasts.mjs';
import { createPlayerClass } from '@level-kit/player.mjs';
import { createPickupClass } from '@level-kit/pickups.mjs';
import { createWeaponClass } from '@level-kit/weapon.mjs';
import { shotgunRules } from '@level-kit/weapon-classes.mjs';
import { rifleSkins, resolveRifleSkin } from '@level-kit/rifle-skins.mjs';
import { createUIClass } from '@level-kit/ui.mjs';
import { RED_DOT_AIM_ENABLED, preferences, aimInstructions, bindSoundControl, keyName } from '@level-kit/preferences.mjs';
import { createFieldKit } from '@level-kit/field-kit.mjs';
import { createObjective, missionRules } from '@level-kit/objectives.mjs';
import { createStory } from '@level-kit/story.mjs';
import { initBriefing } from '@level-kit/briefing.mjs';
import { qualityMonitor } from '@level-kit/quality.mjs';
import { BattlePerformance } from '@level-kit/battle-performance.mjs';
import { variationDeck } from '@level-kit/variations.mjs';
import { createFieldOperations } from '@level-kit/field-operations.mjs';
import { createLifts } from '@level-kit/lifts.mjs';
import { createRecovery } from '@level-kit/recovery.mjs';
import { BattleJournal } from '@level-kit/battle-journal.mjs';
import { createTraining } from '@level-kit/training.mjs';
import { applyMouseLook, requestMouseLock, StickLook } from '@level-kit/look.mjs';
import { createLookTrace } from '@level-kit/look-trace.mjs';

export function startLevel(definition, campaign = null, campaignStage = 0) {
  if (typeof definition?.buildMap !== 'function') throw new TypeError('关卡需要实现 buildMap()');
  const $ = (id) => document.getElementById(id);
  const canvas = $('world');
  const menus = $('menu');
  const CONFIG = makeConfig(definition.config, campaignStage);
  const prefs = preferences();
  const training = createTraining(CONFIG,prefs);
  CONFIG.player.mouseSpeed *= prefs.sensitivity;
  CONFIG.player.incoming = { assist: 0.7, standard: 1, hard: 1.35 }[prefs.difficulty];
  CONFIG.player.steady = prefs.steady;
  CONFIG.feedback.hitShake = prefs.hitShake;
  CONFIG.feedback.attackShake = prefs.attackShake;
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
  if (training) Object.assign(TEXT,{
    title:training.title, enter:'进入'+training.title, tag:'独立练习',
    brief:training.kind==='range'?'无限备弹、快速换弹和连续敌潮。':'进入练习场，跟随当前任务完成操作和撤离。',
    winBrief:'撤离成功可带回战利品并解锁下一关，失败会失去本局战利品。坚守需要守满时长，护送需要保护目标抵达，限时撤离须在时限内完成。无尽生存按波次记录，没有常规撤离胜利条件。',
  });
  const context = {
    ...visual,
    CONFIG,
    GRID,
    campaignStage,
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
  document.title = training?.title ?? definition.pageTitle ?? TEXT.title;
  const { Level, Navigation } = createWorld(context);
  const { Effects, Rift, Projectiles } = createEffectClasses(context);
  const { BeastManager } = createBeastClasses(context);
  const Sound = createSoundClass({...context,score:stageVoice(definition.weaponSkin)});
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
  const recovery = createRecovery({level, nav, definition, CONFIG});
  const lifts=createLifts({...context,level},definition.lifts);
  const story = createStory({...context,level,nav}, missionRules);
  const field=training?null:createFieldOperations({...context,level,nav},campaign);
  const look = new THREE.PerspectiveCamera();
  const lookTrace = createLookTrace(training?.kind ?? definition.weaponSkin, $('look-trace-download'));
  const stickLook = new StickLook();
  const padDown = new Set(), previousButtons = new Set();
  let padIndex = null, lockStartedAt = Infinity, pendingPointer = null;
  const recordMotion = lookTrace && ((dx,dy,time) => lookTrace.mouse(dx,dy,time,look.rotation));
  function moveLook(event) {
    if (document.pointerLockElement !== canvas || game.phase !== 'play') return;
    const pointer = event.type === 'pointermove';
    if (pointer && event.pointerType !== 'mouse') return;
    if (!pointer && pendingPointer) {
      // 同一次派发的兼容 MouseEvent 继承设备时间和外层位移；单独到来的后续移动仍须处理。
      const paired = event.timeStamp === pendingPointer.timeStamp &&
        event.movementX === pendingPointer.movementX && event.movementY === pendingPointer.movementY;
      pendingPointer = null;
      if (paired) return;
    }
    const used = applyMouseLook(look.rotation,event,CONFIG.player.mouseSpeed,lockStartedAt,recordMotion);
    if (pointer) pendingPointer = used ? event : null;
  }
  document.addEventListener('pointermove',moveLook);
  document.addEventListener('mousemove',moveLook);

  const input = {
    down: new Set(),
    aimPressed: false,
    fire: false,
    jump: false,
    reload: false,
    interact: false,
    clearPad() {
      this.padFire = false;
      padDown.clear();
      previousButtons.clear();
      stickLook.reset();
      padIndex = null;
    },
    clear() {
      this.down.clear();
      this.clearPad();
      this.fire = this.jump = this.reload = this.interact = false;
      this.aimPressed = player.aimRequested = player.aiming = false;
      player.ads = 0;
      player.positionCamera(0);
      ui.aimDot.hidden=true;
      ui.nodes.hud.removeAttribute('data-aim');
      weapon.shoulder.body.visible=false;
      weapon.aimScreen=null;
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
  const practiceWeapon=training ? $('practice-weapon').value : null;
  const skinId = resolveRifleSkin(practiceWeapon || campaign?.equippedSkin, resolveRifleSkin(definition.weaponSkin));
  if (rifleSkins[skinId].category === '霰弹枪') {
    const practiceRules=training ? {magazine:6,reloadTime:training.kind==='range' ? .32 : .49} : {};
    Object.assign(CONFIG.weapon,shotgunRules,practiceRules);
  }
  const weapon = new WeaponSystem(skinId),
    ui = new UI(level);
  $('rifle-label').textContent = rifleSkins[skinId].name;
  const burstPoint = new V3();
  const blastTint = brighter(palette.blast ?? 0xb78cff, 2.8);
  const encounter = definition.createEncounter?.({ ...context, level, mapData, sound });

  const slotKeys = ['KeyQ', 'KeyE', 'Digit1', 'Digit2'].map((id) => keyName(prefs.keys[id]));
  const kit = createFieldKit(CONFIG, slotKeys, visual);
  const objective = createObjective(campaignStage, visual, CONFIG);
  const modeSelect = $('mission-mode');
  CONFIG.interactLabel = keyName(prefs.keys.KeyF);
  CONFIG.crouchLabel = keyName(prefs.keys.KeyC);
  CONFIG.deepKey = keyName(prefs.keys.KeyG);
  CONFIG.supportsHunt=Boolean(field?.cfg.hunt);
  initBriefing(campaignStage, CONFIG, TEXT, slotKeys, campaign, definition.story?.classicAction);
  const deck=variationDeck(campaignStage,CONFIG,visual,modeSelect,$('run-variation'));
  let packed = null,
    preparing = false;
  const game = {
    training,
    field,
    lifts,
    kit,
    story,
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
    performance: new BattlePerformance(),
    journal: campaign ? new BattleJournal() : null,
    stageKillTarget: CONFIG.beasts.encounterSize,
    core: false,
    bossDead: false,
    loot: [],
    value: 0,
    hitStop: 0,
    attackPauseUntil:0,
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
      sound.resetStage();
      this.time = 0;
      this.kills = 0;
      this.performance.reset();
      this.core = false;
      this.bossDead = false;
      this.loot.length = 0;
      this.value = 0;
      this.shotAt = -Infinity;
      this.footstep.at = -Infinity;
      encounter?.reset?.();
      this.hitStop = 0;
      this.attackPauseUntil=0;
      this.blast = 0;
      this.blastClock = 0;
      if (gateShield) level.setBarrier(gateShield,null,true);
      kit.reset(training ? structuredClone(training.kit) : packed);
      objective.reset(training ? 'classic' : modeSelect.value, this);
      deck.start(this);
      player.reset();
      lifts.reset();
      this.journal?.start(this, { difficulty: prefs.difficulty, recordReplay: preferences().recordReplay }, packed);
      packed = null;
      story.prepare(training ? null : objective.mode);
      // 重开时，首波按本局已复位的门体和寻路网格选址。
      field?.resetDoors(!training);
      beasts.reset(player, this);
      projectiles.reset();
      effects.reset();
      pickups.reset(this);
      story.reset(this);
      nav.rebuild(player.x,player.z);
      field?.reset(this);
      weapon.reset();
      training?.reset(this);
      recovery.reset(this);
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
      if (gateShield) level.setBarrier(gateShield,null,false);
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
    finish(won, reason) {
      if (this.phase !== 'play') return;
      this.endReason = reason;
      const details = this.journal?.finish(this, won, reason);
      this.phase = won ? 'win' : 'fail';
      kit.clear();
      deck.finish();
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
      $('practice-weapon').disabled=false;
      $('loadout-pane').hidden = false;
      if (campaign) $('preparation').hidden = false;
      ui.menu(this.phase, this);
      campaign?.finish({
        won,
        kills: this.kills,
        durationMs: Math.round(this.time * 1000),
        loot: this.loot,
        remaining: kit.remaining(),
        ...details,
      });
    },
    step(dt) {
      this.time += dt;
      this.performance.step(this.time);
      if (!this.blast) {
        objective.step(dt, this);
        if (this.phase !== 'play') return;
        beasts.releaseSplits(this);
        if (!field?.deep) story.step(dt,this);
        if (this.phase !== 'play') return;
        field?.step(dt,this);
        if (this.phase !== 'play') return;
        lifts.step(dt,this);
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
        player.positionCamera(0);
        const interact = input.interact;
        input.interact = false;
        if (interact && !pickups.takeKey(player, this) && (field?.deep || !story.interact(this)) && !field?.interact(this) && !lifts.interact(this)) {
          if (this.nearGate()) {
            if (!this.ready()) ui.notify(objective.guide(this,TEXT).title, 1.55);
            this.trigger();
          } else if (encounter?.interactionHint?.(this) || (!pickups.takeNearbyReward(player,this) && !pickups.takeAimed(player,this))) {
            encounter?.interact?.(this);
          }
        }
        if (this.phase !== 'play') return;
        if (!this.blast) {
          weapon.update(dt, input, this);
          player.aiming = player.aimRequested && weapon.reloadLeft <= 0;
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
      if (this.phase === 'play') this.journal?.update(this);
      if (this.phase === 'play') training?.step(this,input);
      if (this.phase === 'play' && !this.blast) recovery.record(this);
      weapon.render(dt, player, this);
      ui.update(dt, this);
    },
  };

  function pause() {
    if (game.phase !== 'play') return;
    training?.paused();
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
      requestMouseLock(canvas,mode => lookTrace?.lock(document.pointerLockElement === canvas,mode)).catch(lockError);
      sound.open();
    } catch {
      lockError();
    }
  }

  function lockError() {
    if (document.pointerLockElement === canvas) return;
    ui.text('menu-status', '鼠标锁定未成功。请聚焦此窗口，再点击进入游戏。');
  }

  document.addEventListener('pointerlockchange', async (event) => {
    const locked = document.pointerLockElement === canvas;
    lookTrace?.lock(locked,'lockchange');
    // 同一画布再次请求锁定也可能收到通知。只有真正取得或失去锁时才切换游戏状态。
    if (locked === (lockStartedAt !== Infinity)) return;
    pendingPointer = null;
    if (!locked) {
      lockStartedAt = Infinity;
      pause();
      return;
    }
    lockStartedAt = event.timeStamp;
    ui.text('menu-status', '');
    if (preparing) return;
    if (game.phase !== 'pause') {
      if (campaign && !packed) {
        preparing = true;
        try {
          const [kit, stats] = await Promise.all([campaign.prepare(), campaign.statistics().catch(() => null)]);
          packed = kit;
          if (stats) weapon.savedKills = stats.reduce((sum,row) => sum + (row.weapon === weapon.skinId ? row.weaponKills ?? 0 : 0), 0);
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
    $('loadout-pane').hidden = true;
    $('preparation').hidden = true;
    modeSelect.disabled = true;
    $('practice-weapon').disabled=true;
    ui.nodes.hud.hidden = false;
    weapon.group.visible = game.blast === 0;
    sound.active(true);
    ui.update(0, game);
  });
  document.addEventListener('pointerlockerror', lockError);
  menus.addEventListener('cancel', (event) => event.preventDefault());
  $('start').addEventListener('click', startGame);
  $('unstuck').addEventListener('click', () => {
    if (game.phase !== 'pause' || game.blast) return;
    const recovered = recovery.recover(game);
    ui.text('menu-status', recovered ? '已回到安全位置。点击继续游戏。' : '附近暂时没有可用的安全位置。');
    if (recovered) $('start').focus({preventScroll:true});
  });
  if (training) {
    $('campaign-home').hidden = false;
    $('campaign-home').href = '../index.html';
    $('practice-controls').hidden = false;
    $('practice-bindings').textContent = training.controls;
    $('practice-restart').onclick = () => {game.phase='ready'; startGame();};
    $('next-level').href = '../underground-lab/index.html?campaign';
    $('next-level').textContent = '开始战役';
  }
  $('campaign-home').addEventListener('click', event => {
    if (campaign && game.phase === 'pause' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      game.phase = 'play';
      game.finish(false, '主动退出');
    }
  });
  bindSoundControl({
    shortcut: prefs.keys.KeyM,
    apply(current) {
      CONFIG.player.steady = current.steady;
      CONFIG.feedback.hitShake = current.hitShake;
      CONFIG.feedback.attackShake = current.attackShake;
      CONFIG.feedback.directionIndicators = current.directionIndicators;
      sound.setOutput(current.volume / 100, current.muted);
    },
  });

  const keyMap = new Map(Object.entries(prefs.keys).map(([action, code]) => [code, action]));
  if (prefs.keys.ShiftLeft === 'ShiftLeft' && !keyMap.has('ShiftRight'))
    keyMap.set('ShiftRight', 'ShiftLeft');
  const capturedKeys = new Set(Object.keys(prefs.keys));
  for (const label of $('guide').querySelectorAll('[data-keys]')) {
    label.textContent = label.dataset.keys.split(' ').map(id => keyName(prefs.keys[id])).join(' / ');
  }
  if (RED_DOT_AIM_ENABLED) {
    const row = $('aim-control');
    row.content.querySelector('dd').textContent = aimInstructions(prefs.aimMode);
    row.replaceWith(row.content);
  }
  $('deep-help').hidden = !field?.cfg.deep;
  if (definition.weaponSkin === 'buried-tomb')
    $('crouch-help').querySelector('dd').append('沙暴中配合停火可压低声响。');
  function pressAction(code) {
    if (code === 'KeyG') field?.deepen(game);
    if (code === 'KeyI' && !weapon.reloadLeft && !player.aiming && !player.sprinting) weapon.inspectTime = 2;
    if (code === 'KeyV') {
      player.aimRequested = player.aiming = false;
      player.thirdPerson = !player.thirdPerson;
    }
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
    if (game.phase !== 'play' || document.pointerLockElement !== canvas || ![0,2].includes(event.button)) return;
    event.preventDefault();
    if (event.button === 0) {
      input.fire = true;
      lookTrace?.button(event,true);
    }
    else if (RED_DOT_AIM_ENABLED) {
      if (!input.aimPressed) player.aimRequested = prefs.aimMode === 'hold' || !player.aimRequested;
      input.aimPressed = true;
    }
  });
  document.addEventListener('mouseup', (event) => {
    if (event.button === 0) {
      if (input.fire) lookTrace?.button(event,false);
      input.fire = false;
    }
    if (event.button === 2 && RED_DOT_AIM_ENABLED) {
      input.aimPressed = false;
      if (prefs.aimMode === 'hold') player.aimRequested = false;
    }
  });
  window.addEventListener('blur', () => {
    pause();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  });
  window.addEventListener('pagehide', event => {
    // BFCache 恢复属于同一局，保留暂停时的投掷物。
    pause();
    if (!event.persisted) kit.clear();
    sound.active(false);
    sound.ctx?.suspend().catch(()=>{});
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  window.addEventListener('gamepaddisconnected', event => {
    if (event.gamepad.index === padIndex) input.clearPad();
  });
  function pollPad(dt) {
    let pad;
    try {
      if (prefs.gamepad) pad = [...(navigator.getGamepads?.() ?? [])].find(p => p?.mapping === 'standard' && p.connected !== false);
    }
    catch { prefs.gamepad=false; }
    padDown.clear();
    input.padFire = false;
    const index = pad ? pad.index ?? 0 : null;
    if (index !== padIndex) {
      input.clearPad();
      padIndex = index;
    }
    if (!pad) { lookTrace?.pad(0,0); return; }
    const [x, y, rx, ry] = pad.axes;
    lookTrace?.pad(rx,ry);
    if (Math.abs(x) > 0.22) padDown.add(x > 0 ? 'KeyD' : 'KeyA');
    if (Math.abs(y) > 0.22) padDown.add(y > 0 ? 'KeyS' : 'KeyW');
    if (pad.buttons[10]?.pressed) padDown.add('ShiftLeft');
    if (pad.buttons[1]?.pressed) padDown.add('KeyC');
    stickLook.turn(look.rotation, rx, ry, dt, CONFIG.player.mouseSpeed);
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
  const reflectors = [];
  scene.traverse((node) => {
    if (node.isReflector || node.type === 'Reflector') reflectors.push(node);
  });
  beasts.visibility.setReflectors(reflectors);
  const measure = qualityMonitor(prefs.quality, (tier) => {
    beasts.visualQuality = tier;
    const low = tier === 'low',
      high = tier === 'high';
    CONFIG.graphics.particleScale = high ? 1 : low ? 0.3 : 0.65;
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
    if(!training) {
      const menu=game.phase==='ready' || game.phase==='pause';
      // 驱动可能同步编译/上传整份材质。只在菜单中预热，玩家操作帧保留可中断的寻路准备。
      if(menu)beasts.detailParts.prepareMaterial(renderer,scene,camera,composer.readBuffer);
      if(menu || game.phase==='play')beasts.prepareSpawnRoutes(performance.now()+2);
    }
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
    const drawn = game.phase!=='play' || game.time>=game.attackPauseUntil;
    if (drawn) composer.render(dt);
    if (game.phase==='play') lookTrace?.frame(game,camera,drawn,input.fire);
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
