export function createUIClass({ CONFIG, GRID, TEXT, $, V3, TAU, definition }) {
  class UI {
    constructor(level) {
      this.level = level;
      this.nodes = {};
      for (const name of ['menu', 'menu-title', 'menu-tag', 'menu-text', 'loot-title', 'boss-title', 'menu-status', 'guide', 'summary', 'start', 'sound', 'hud', 'area', 'objective', 'kills', 'loot',
        'map', 'boss', 'boss-phase', 'boss-health', 'health', 'hp', 'stamina', 'energy', 'condition', 'condition-title', 'condition-time', 'condition-meter', 'condition-detail', 'hud-announcement', 'crouch-help', 'posture', 'ammo', 'reserve', 'weapon-state', 'cross', 'message', 'injury', 'blast']) this.nodes[name] = $(name);
      this.ctx = this.nodes.map.getContext('2d');
      this.size = this.nodes.map.width;
      this.facing = new V3();
      this.tick = 0; this.hitTime = 0; this.noticeTime = 0;
      this.base = document.createElement('canvas');
      this.base.width = this.base.height = this.size;
      this.drawBase();
      this.text('menu-tag', TEXT.tag);
      this.text('loot-title', TEXT.loot);
      this.text('boss-title', TEXT.bossName);
      this.nodes.boss.setAttribute('aria-label', TEXT.bossName + '状态');
      this.nodes['boss-health'].setAttribute('aria-label', TEXT.bossName + '生命值');
      this.nodes['crouch-help'].hidden = !CONFIG.player.crouch;
      this.nodes.health.max = CONFIG.player.health;
      this.nodes.stamina.max = CONFIG.player.stamina;
      this.nodes['boss-health'].max = CONFIG.beasts.types[3].hp;
    }
    px(x) { return (x + GRID.halfX) / (GRID.halfX * 2) * this.size; }
    pz(z) { return (z + GRID.halfZ) / (GRID.halfZ * 2) * this.size; }
    drawBase() {
      const ctx = this.base.getContext('2d'), size = this.size;
      ctx.fillStyle = '#152735'; ctx.fillRect(0, 0, size, size);
      const style = definition.minimap ?? {};
      const draw = { ctx, px: x => this.px(x), pz: z => this.pz(z), size };
      style.beforeTiles?.(draw);
      const palette = style.tiles ?? { '#': '#3a556b' };
      const w = size / GRID.columns, h = size / GRID.rows;
      for (let row = 0; row < GRID.rows; row++) {
        for (let column = 0; column < GRID.columns; column++) {
          const color = palette[GRID.cells[row][column]];
          if (!color) continue;
          ctx.fillStyle = color;
          ctx.fillRect(column * w + 0.42, row * h + 0.42, Math.max(0, w - 0.84), Math.max(0, h - 0.84));
        }
      }
      style.afterTiles?.(draw);
      ctx.strokeStyle = '#6d95bf2d'; ctx.lineWidth = 1;
      for (let i = 36; i < size; i += 36) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
      }
      ctx.fillStyle = '#ffb171'; ctx.fillRect(this.px(this.level.gate.x) - 3, this.pz(this.level.gate.z) - 3, 6, 6);
      ctx.fillStyle = '#a1a086'; ctx.fillRect(this.px(this.level.bossAnchor.x) - 2, this.pz(this.level.bossAnchor.z) - 2, 4, 4);
    }
    drawMap(game) {
      const ctx = this.ctx;
      ctx.drawImage(this.base, 0, 0);
      definition.minimap?.overlay?.({ ctx, px: x => this.px(x), pz: z => this.pz(z), game });
      for (const b of game.beasts.pool) {
        if (!b.active) continue;
        ctx.fillStyle = b.type === 3 ? '#ff9a71' : '#f45f76';
        ctx.beginPath(); ctx.arc(this.px(b.x), this.pz(b.z), b.type === 3 ? 3.2 : 1.5, 0, TAU); ctx.fill();
        if (b.statusEffects.has('marked')) {
          ctx.strokeStyle = '#ffd780'; ctx.beginPath(); ctx.arc(this.px(b.x), this.pz(b.z), 4.4, 0, TAU); ctx.stroke();
        }
      }
      if (game.bossDead && !game.core) {
        const core = game.pickups.objects.find(item => item.active && item.kind === 'core');
        if (core) {
          ctx.strokeStyle = '#ffd89a'; ctx.strokeRect(this.px(core.x) - 3, this.pz(core.z) - 3, 6, 6);
        }
      }
      this.facing.set(0, 0, -1).applyQuaternion(game.player.look.quaternion);
      ctx.save();
      ctx.translate(this.px(game.player.x), this.pz(game.player.z));
      ctx.rotate(Math.atan2(this.facing.x, -this.facing.z));
      ctx.fillStyle = '#b0fff0'; ctx.strokeStyle = '#102738'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.6, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.6, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    text(name, value) {
      if (this.nodes[name].textContent !== value) this.nodes[name].textContent = value;
    }
    notify(text, duration) {
      this.notice = text; this.noticeTime = duration;
      this.text('hud-announcement', text);
    }
    hit(kind) {
      this.nodes.cross.dataset.hit = kind;
      this.hitTime = kind === 'kill' ? 0.20 : 0.12;
    }
    reset() {
      this.tick = 0; this.hitTime = 0; this.noticeTime = 0;
      this.nodes.cross.dataset.hit = '';
      this.nodes.blast.style.opacity = '0'; this.nodes.injury.style.opacity = '0';
      this.nodes.message.hidden = true; this.nodes.boss.hidden = true;
      this.nodes.condition.hidden = true; this.nodes.posture.hidden = true;
      this.nodes.hud.removeAttribute('data-offline');
      this.text('hud-announcement', '');
    }
    update(dt, game) {
      if (this.hitTime > 0) {
        this.hitTime -= dt;
        if (this.hitTime <= 0) this.nodes.cross.dataset.hit = '';
      }
      this.noticeTime -= dt;
      if (this.noticeTime <= 0) this.text('hud-announcement', '');
      const { player: p, weapon: w } = game;
      this.nodes.injury.style.opacity = (p.damageVignette * 0.81).toFixed(3);
      const blast = game.blast;
      this.nodes.blast.style.opacity = blast > 0 && blast < 1 ? String(Math.sin(blast ** 0.47 * Math.PI) * 0.86) : '0';
      this.tick -= dt;
      if (this.tick > 0) return;
      this.tick = 0.062;
      const status = w.combat.status(game);
      const condition = game.encounter?.status ?? (status ? { title: '武器特性', detail: '' } : null);
      this.nodes.condition.hidden = !condition;
      if (condition) {
        this.text('condition-title', condition.title);
        const meter = this.nodes['condition-meter'];
        meter.hidden = !Number.isFinite(condition.value);
        if (!meter.hidden) meter.value = condition.value;
        const readout = condition.readout ?? (Number.isFinite(condition.remaining) ? Math.max(0, Math.ceil(condition.remaining)) + ' 秒' : '');
        this.text('condition-time', readout);
        this.text('condition-detail', [condition.detail, status].filter(Boolean).join(' / '));
      }
      const offline = game.encounter?.hudOffline === true;
      this.nodes.hud.toggleAttribute('data-offline', offline);
      if (offline) return;
      this.text('area', this.level.area(p.x, p.z, p.y));
      this.text('hp', String(Math.ceil(p.hp)));
      this.text('energy', String(Math.ceil(p.energy)));
      this.nodes.posture.hidden = !p.crouched;
      this.nodes.health.value = p.hp; this.nodes.stamina.value = p.energy;
      this.text('ammo', String(w.ammo).padStart(2, '0'));
      this.text('reserve', '/ ' + w.reserve);
      this.text('weapon-state', w.reloadLeft > 0 ? '换弹中 ' + (Math.ceil(w.reloadLeft * 10) / 10).toFixed(1) + ' 秒' : w.ammo === 0 && w.reserve === 0 ? '弹药耗尽' : '');
      this.nodes.cross.style.setProperty('--gap', (7 + w.heat * 12 + (p.sprinting ? 5 : 0)).toFixed(1) + 'px');
      this.text('loot', game.loot.length + ' / ' + (definition.loot?.length ?? 0));
      this.text('kills', game.kills + ' / ' + CONFIG.beasts.killsToWin);
      const remaining = Math.max(0, CONFIG.beasts.killsToWin - game.kills);
      const objective = blast ? TEXT.detonating : game.ready() ? TEXT.exitObjective :
        game.core ? `已取得${TEXT.keyItem}，还需击杀 ${remaining} 只${TEXT.enemy}` :
          game.bossDead ? '靠近掉落物，拾取' + TEXT.keyItem : TEXT.objective;
      this.text('objective', objective);
      const boss = game.beasts.boss;
      this.nodes.boss.hidden = !boss || Math.hypot(boss.x - p.x, boss.z - p.z) > 28;
      if (!this.nodes.boss.hidden) {
        this.text('boss-phase', boss.rage ? '狂暴' : '第一阶段');
        this.nodes['boss-health'].value = Math.max(boss.hp, 0);
      }
      let note = !blast && this.noticeTime > 0 ? this.notice : '';
      if (game.nearGate()) {
        if (game.ready() && !game.blast) note = '按 E 引爆' + TEXT.portal;
        else if (!note && !game.blast) note = ['屏障封印', remaining ? '还需击杀 ' + remaining + ' 只' : '', game.core ? '' : '需要' + TEXT.keyItem].filter(Boolean).join(' / ');
      } else if (!note && !blast) {
        note = game.encounter?.interactionHint?.(game) ??
          (p.protected(game) ? TEXT.safe + ' / ' + Math.max(0, Math.ceil(CONFIG.player.safeTime - game.time)) + ' 秒' : '');
      }
      this.nodes.message.hidden = !note;
      if (note) this.text('message', note);
      this.drawMap(game);
    }
    menu(mode, game) {
      const overlay = this.nodes.menu;
      this.text('menu-title', mode === 'pause' ? '行动暂停' : mode === 'win' ? '撤离成功' : mode === 'fail' ? '撤离失败' : TEXT.title);
      this.text('menu-text', mode === 'pause' ? TEXT.pauseBrief : mode === 'win' ? TEXT.winBrief : mode === 'fail' ? TEXT.failBrief : TEXT.brief);
      this.text('start', mode === 'pause' ? '继续游戏' : mode === 'ready' ? TEXT.enter : '再来一局');
      this.text('menu-status', '');
      const ended = mode === 'win' || mode === 'fail';
      this.nodes.guide.hidden = ended;
      this.nodes.summary.hidden = !ended;
      if (ended) this.text('summary', '累计击杀 ' + game.kills + ' 只 / 带回 ' + game.loot.length + ' 件' + TEXT.loot + ' / 结算价值 ' + game.value);
      if (!overlay.open) overlay.showModal();
      this.nodes.start.focus({ preventScroll: true });
    }
  }

  return UI;
}
