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
      this.directions = $('directions');
      this.nodes.combo = $('combo');
      this.nodes['trait-label'] = $('trait-label');
      this.ring = $('reload-ring'); this.aimDot = $('aim-dot');
      for (const id of ['task-panel','task-update','objective-detail']) this.nodes[id] = $(id);
      const markers = (length, className) => Array.from({ length }, () => {
        const node = document.createElement('i');
        node.className = className; node.hidden = true;
        this.directions.append(node);
        return node;
      });
      this.damageArcs = markers(8, 'damage-arc');
      this.nearWarnings = markers(CONFIG.feedback.warningCount, 'near-warning');
      this.nearest = [];
      this.warningOrigin = new V3(); this.warningRay = new V3();
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
    drawMap(game, target) {
      const ctx = this.ctx;
      ctx.drawImage(this.base, 0, 0);
      definition.minimap?.overlay?.({ ctx, px: x => this.px(x), pz: z => this.pz(z), game });
      game.field?.minimap(ctx,x=>this.px(x),z=>this.pz(z),game);
      for(const lift of game.lifts?.lifts??[]) {
        ctx.fillStyle='#8feddb';ctx.font='bold 11px sans-serif';
        ctx.fillText(lift.y>game.player.y+1?'↑':lift.y<game.player.y-1?'↓':'↕',this.px(lift.x),this.pz(lift.z));
      }
      for (const b of game.beasts.pool) {
        if (!b.active || b.hunted && (!b.playerVisible || Math.hypot(b.x-game.player.x,b.z-game.player.z)>14)) continue;
        ctx.fillStyle = b.type === 3 ? '#ff9a71' : '#f45f76';
        ctx.beginPath(); ctx.arc(this.px(b.x), this.pz(b.z), b.type === 3 ? 3.2 : 1.5, 0, TAU); ctx.fill();
        if (b.statusEffects.has('marked')) {
          ctx.strokeStyle = '#ffd780'; ctx.beginPath(); ctx.arc(this.px(b.x), this.pz(b.z), 4.4, 0, TAU); ctx.stroke();
        }
      }
      for (const item of game.pickups.objects) {
        if (!item.active) continue;
        const x=this.px(item.x), z=this.pz(item.z);
        ctx.fillStyle=CONFIG.pickups.styles[item.style].color;
        if (item.kind!=='core') { ctx.fillRect(x-1,z-1,2.5,2.5); continue; }
        ctx.strokeStyle='#fff';ctx.strokeRect(x-3,z-3,6,6);
        const px=this.px(game.player.x), pz=this.pz(game.player.z);
        ctx.save();ctx.translate(px,pz);ctx.rotate(Math.atan2(z-pz,x-px));
        ctx.beginPath();ctx.moveTo(16,0);ctx.lineTo(9,-4);ctx.lineTo(9,4);ctx.fill();ctx.restore();
      }
      this.facing.set(0, 0, -1).applyQuaternion(game.player.look.quaternion);
      if (game.objective.mode==='escort') {
        const drone=game.objective.drone.position;
        ctx.fillStyle=game.objective.escortHealth<=40?'#ff9966':'#83f4ec';
        ctx.beginPath();ctx.arc(this.px(drone.x),this.pz(drone.z),3.5,0,TAU);ctx.fill();
      }
      if (target) {
        const x = this.px(target.x), z = this.pz(target.z);
        ctx.save(); ctx.translate(x,z); ctx.rotate(Math.PI/4);
        ctx.strokeStyle = '#9bffde'; ctx.lineWidth = 2; ctx.strokeRect(-4,-4,8,8); ctx.restore();
      }
      ctx.save();
      ctx.translate(this.px(game.player.x), this.pz(game.player.z));
      ctx.rotate(Math.atan2(this.facing.x, -this.facing.z));
      ctx.fillStyle = '#b0fff0'; ctx.strokeStyle = '#102738'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.6, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.6, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    text(name, value) {
      if (typeof value==='string' && CONFIG.interactLabel) value=value.replace('按 F','按 '+CONFIG.interactLabel);
      if (this.nodes[name].textContent !== value) this.nodes[name].textContent = value;
    }
    notify(text, duration) {
      this.notice = text; this.noticeTime = duration;
      this.text('hud-announcement', text);
    }
    hit(kind) {
      this.nodes.cross.dataset.hit = kind;
      this.hitTime = ({ hit: .10, weak: .15, kill: .20, 'critical-kill': .25 })[kind];
    }
    placeMarker(node, angle, width, height) {
      // 把世界方位投到矩形边界上，宽屏时左右斜角仍指向正确方向。
      const x = Math.sin(angle), y = -Math.cos(angle);
      const distance = Math.min(width / Math.max(.0001, Math.abs(x)), height / Math.max(.0001, Math.abs(y)));
      node.style.transform = `translate(${(x * distance).toFixed(1)}px,${(y * distance).toFixed(1)}px) rotate(${angle}rad)`;
      node.dataset.angle = String(angle);
      node.hidden = false;
    }
    updateDirections(game) {
      const cfg = CONFIG.feedback, p = game.player;
      this.directions.hidden = game.encounter?.hudOffline === true;
      if (this.directions.hidden) return;
      const width = innerWidth * .5, height = innerHeight * .5, yaw = p.look.rotation.y;
      this.damageArcs.forEach((node, i) => {
        const age = game.time - p.hitDirections[i];
        if (!cfg.directionIndicators || age >= cfg.arcDuration) { node.hidden = true; return; }
        this.placeMarker(node, yaw + i * TAU / this.damageArcs.length, width - 34, height - 18);
        node.style.opacity = String(1 - age / cfg.arcDuration);
      });
      const nearest = this.nearest;
      nearest.length = 0;
      this.warningOrigin.set(p.x, p.y + p.eye, p.z);
      for (const b of game.beasts.pool) {
        if (!b.active) continue;
        const dx = b.x - p.x, dz = b.z - p.z, dy = b.y - p.y;
        const range2 = dx * dx + dy * dy + dz * dz;
        if (range2 > cfg.warningRange ** 2) continue;
        let i = nearest.length;
        while (i && nearest[i - 1].range2 > range2) i--;
        if (i >= this.nearWarnings.length) continue;
        const distance = this.warningRay.set(dx, b.y + b.height * .55 - this.warningOrigin.y, dz).length();
        if (distance && !this.level.visible(this.warningOrigin, this.warningRay.divideScalar(distance), distance)) continue;
        nearest.splice(i, 0, { dx, dz, range2 });
        if (nearest.length > this.nearWarnings.length) nearest.pop();
      }
      this.nearWarnings.forEach((node, i) => {
        const target = nearest[i];
        if (!target) { node.hidden = true; return; }
        this.placeMarker(node, yaw + Math.atan2(target.dx, -target.dz), width - 48, height - 34);
        node.style.borderBottomColor = `hsl(${Math.round(48 * Math.min(1, Math.sqrt(target.range2) / cfg.warningRange))} 100% 65%)`;
      });
    }
    reset() {
      this.clearTask();
      this.tick = 0; this.hitTime = 0; this.noticeTime = 0;
      this.nodes.cross.dataset.hit = '';
      this.nodes.blast.style.opacity = '0'; this.nodes.injury.style.opacity = '0';
      this.nodes.message.hidden = true; this.nodes.boss.hidden = true;
      this.nodes.condition.hidden = true; this.nodes.posture.hidden = true;
      this.nodes.hud.removeAttribute('data-offline');
      this.nodes.hud.removeAttribute('data-critical');
      this.ring.hidden = this.aimDot.hidden = true;
      this.nodes.hud.removeAttribute('data-aim');
      for (const node of [...this.damageArcs, ...this.nearWarnings]) node.hidden = true;
      this.text('hud-announcement', '');
    }
    clearTask() {
      this.taskStage = null;
      this.taskChangedUntil = 0;
      this.nodes['task-panel'].removeAttribute('data-update');
      this.nodes['task-update'].hidden = this.nodes['objective-detail'].hidden = true;
      this.text('objective', ''); this.text('objective-detail', '');
    }
    showTask(task, game) {
      if (this.taskStage !== task.stage) {
        this.taskChangedUntil = game.time + 2.4;
        this.taskStage = task.stage;
      }
      const changed = game.time < this.taskChangedUntil;
      this.nodes['task-panel'].toggleAttribute('data-update', changed);
      this.nodes['task-update'].hidden = !changed;
      this.text('objective', task.title);
      let direction = '';
      if (task.target) {
        const dx = task.target.x - game.player.x, dz = task.target.z - game.player.z;
        const dy = task.target.y - game.player.y, range = Math.hypot(dx, dz);
        const compass = ['北','东北','东','东南','南','西南','西','西北'];
        const bearing = compass[(Math.round(Math.atan2(dx, -dz) * 4 / Math.PI) + 8) % 8];
        direction = (range > 1 ? bearing + ' ' : '') + Math.round(Math.hypot(range,dy)) + ' 米' +
          (dy > 1.5 ? ' · 上方' : dy < -1.5 ? ' · 下方' : '');
      }
      const detail = [task.detail, direction].filter(Boolean).join(' · ');
      this.text('objective-detail', detail);
      this.nodes['objective-detail'].hidden = !detail;
    }
    update(dt, game) {
      if (game.phase !== 'play') return;
      if (this.hitTime > 0) {
        this.hitTime -= dt;
        if (this.hitTime <= 0) this.nodes.cross.dataset.hit = '';
      }
      this.noticeTime -= dt;
      if (this.noticeTime <= 0) this.text('hud-announcement', '');
      const { player: p, weapon: w } = game;
      this.nodes.hud.toggleAttribute('data-steam',game.time<w.combat.mistUntil);
      const aimed = p.aiming && p.ads > .70;
      this.nodes.hud.toggleAttribute('data-aim',aimed);
      this.aimDot.hidden = !aimed;
      this.ring.hidden = w.reloadLeft <= 0 || game.blast > 0;
      if (!this.ring.hidden) this.ring.style.setProperty('--remaining',(w.reloadLeft/w.reloadTotal).toFixed(4)+'turn');
      const criticalAt = CONFIG.player.health * CONFIG.feedback.criticalHealth;
      const critical = p.hp > 0 && p.hp < criticalAt;
      this.nodes.hud.toggleAttribute('data-critical', critical);
      const pulse = critical ? .19 + .18 * (1 - p.hp / criticalAt) + .1 * Math.sin(game.time * Math.PI * 1.4) : 0;
      this.nodes.injury.style.opacity = Math.min(1, p.damageVignette * .81 + pulse).toFixed(3);
      const blast = game.blast;
      this.nodes.blast.style.opacity = blast > 0 && blast < 1 ? String(Math.sin(blast ** 0.47 * Math.PI) * 0.86) : '0';
      this.tick -= dt;
      if (this.tick > 0) return;
      this.tick = 0.062;
      this.updateDirections(game);
      const performance = game.performance;
      this.text('trait-label', game.beasts.traitLabel || '');
      this.text('combo', game.time < performance.noticeUntil ? performance.notice : '');
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
      if (offline) {game.story?.marker(null,game);return;}
      this.text('area', this.level.area(p.x, p.z, p.y));
      this.text('hp', String(Math.ceil(p.hp)));
      this.text('energy', String(Math.ceil(p.energy)));
      this.nodes.posture.hidden = !p.crouched;
      this.nodes.health.value = p.hp; this.nodes.stamina.value = p.energy;
      this.text('ammo', String(w.ammo).padStart(2, '0'));
      this.text('reserve', game.training?.kind === 'range' ? '/ ∞ 无限备弹' : '/ ' + w.reserve);
      this.text('weapon-state', w.reloadLeft > 0 ? '换弹中 ' + (Math.ceil(w.reloadLeft * 10) / 10).toFixed(1) + ' 秒' : w.ammo === 0 && w.reserve === 0 ? '弹药耗尽' : '');
      this.nodes.cross.style.setProperty('--gap', (7 + w.heat * 12 + (p.sprinting ? 5 : 0)).toFixed(1) + 'px');
      const baseLoot=game.loot.filter(item=>!item.origin || item.origin==='main').length;
      this.text('loot', baseLoot + ' / ' + (definition.loot?.length ?? 0) +
        (game.loot.length>baseLoot ? ' +'+(game.loot.length-baseLoot) : ''));
      this.text('kills', game.objective.mode && (game.objective.mode !== 'classic' || definition.story?.type==='lab') ? String(game.kills) : game.kills + ' / ' + CONFIG.beasts.killsToWin);
      const task = game.training?.guide(game) ?? game.objective.guide(game, TEXT);
      game.story?.marker(task,game);
      this.showTask(task, game);
      const boss = game.beasts.boss;
      this.nodes.boss.hidden = !boss || Math.hypot(boss.x - p.x, boss.z - p.z) > 28;
      if (!this.nodes.boss.hidden) {
        const f=boss.fight;
        this.text('boss-phase', f ? ['第一阶段','第二阶段','狂暴'][f.stage] + ' · ' +
          (game.time<f.transitionUntil?'转阶段':game.time<f.brokenUntil?'已破甲':game.time<f.weakUntil?'弱点暴露':f.winding?'蓄力':'装甲') +
          ' · 破甲 '+f.charge+'/'+f.rules.breakHits : boss.rage ? '狂暴' : '第一阶段');
        this.nodes['boss-health'].max=boss.maxHP;
        this.nodes['boss-health'].value = Math.max(boss.hp, 0);
      }
      let note = !blast && this.noticeTime > 0 ? this.notice : '';
      if (game.pickups.nearKey(p)) note = '按 F 拾取' + TEXT.keyItem;
      else if (game.nearGate()) {
        if (game.ready() && !game.blast) note = '按 F 引爆' + TEXT.portal;
        else if (!note && !game.blast) note = task.title;
      } else if (!note && !blast) {
        note = game.encounter?.interactionHint?.(game) ??
          (p.protected(game) ? TEXT.safe + ' / ' + Math.max(0, Math.ceil(CONFIG.player.safeTime - game.time)) + ' 秒' : '');
      }
      note = game.field?.hint(game) || game.lifts?.hint(p) || note;
      this.nodes.message.hidden = !note;
      if (note) this.text('message', note);
      this.drawMap(game, task.target);
    }
    menu(mode, game) {
      const overlay = this.nodes.menu;
      if (game.training) {
        document.getElementById('loadout-pane').hidden = true;
        document.getElementById('practice-restart').hidden = mode !== 'pause';
        document.getElementById('next-level').hidden = mode !== 'win' || game.training.kind !== 'tutorial';
      }
      this.text('menu-title', mode === 'pause' ? '行动暂停' : mode === 'win' ? '撤离成功' : mode === 'fail' ? '撤离失败' : TEXT.title);
      this.text('menu-text', mode === 'pause' ? TEXT.pauseBrief : mode === 'win' ? game.endReason || TEXT.winBrief : mode === 'fail' ? game.endReason || TEXT.failBrief : TEXT.brief);
      this.text('start', mode === 'pause' ? '继续游戏' : mode === 'ready' ? TEXT.enter : '再来一局');
      this.text('menu-status', '');
      const ended = mode === 'win' || mode === 'fail';
      if (mode!=='ready') game.story?.marker(null,game);
      if (ended) this.clearTask();
      if (ended) this.ring.hidden = this.aimDot.hidden = true;
      this.nodes.guide.closest('details').hidden = ended;
      this.nodes.guide.hidden = ended;
      this.nodes.summary.hidden = !ended;
      if (ended) this.text('summary', '评级 ' + game.performance.result(game, mode === 'win').grade +
        ' · 最高 ' + game.performance.maxCombo + ' 连杀 · 累计击杀 ' + game.kills + ' 只 / 带回 ' + game.loot.length + ' 件' + TEXT.loot + ' / 结算价值 ' + game.value);
      if (!overlay.open) overlay.showModal();
      this.nodes.start.focus({ preventScroll: true });
    }
  }

  return UI;
}
