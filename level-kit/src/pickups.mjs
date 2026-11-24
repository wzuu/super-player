import { createPickupVisuals } from '@level-kit/pickup-visuals.mjs';

export function createPickupClass(context) {
  const { CONFIG, THREE, V3, camera, definition, TEXT } = context;
  const cfg = CONFIG.pickups;
  class Pickups {
    constructor(level, effects) {
      this.level = level;
      this.effects = effects;
      this.objects = Array.from({ length: CONFIG.pickups.pool }, () => ({ active: false, kind: '', born: 0 }));
      this.ammoStations = new Set();
      this.draw = createPickupVisuals(context);
      this.direction = new V3();
      this.aim = new V3();
      this.tint = new THREE.Color();
      this.where = new V3();
      this.age = 0;
    }
    reset(game) {
      this.age = 0;
      this.deepSupplies = false;
      this.ammoScale = game?.variation?.ammo ?? 1;
      this.ammoStations.clear();
      this.keyItem = null;
      for (const p of this.objects) p.active = false;
      for (const [x,z,amount] of definition.health ?? [])
        this.add('health', x, z, this.level.base(x,z), '应急医疗补给', amount, true);
      for (const [x, z, name, value, height] of definition.loot ?? []) {
        this.add(
          'rare',
          x,
          z,
          this.level.surface(x, z, height === 'top' ? Infinity : this.level.base(x, z) + 0.16),
          name,
          value,
          true,
        );
      }
      for (const [x, z] of definition.ammo ?? []) {
        const box = this.add('ammo', x, z, this.level.base(x, z), '补给弹药', this.cacheAmount(), true);
        if (game?.objective.mode === 'endless' && box) this.ammoStations.add(box);
      }
    }
    cacheAmount(rifleRounds = cfg.ammoCache) {
      return Math.ceil(rifleRounds * this.ammoScale / (CONFIG.weapon.pellets ? 6 : 1));
    }
    refillAmmoStations(waveCount) {
      if (!this.ammoStations.size || this.deepSupplies) return;
      const perBox = Math.max(cfg.ammoCache, waveCount * cfg.roundsPerGuard / this.ammoStations.size);
      for (const box of this.ammoStations) {
        box.value = this.cacheAmount(perBox);
        box.active = true;
      }
    }
    dropFromKill(b, y, stage, healing) {
      const elite = Boolean(b.affixes?.length);
      if (!elite && !healing) return;
      const odds = cfg.killDrops;
      // 一次抽取的不重叠区间，精英在血月或游行中也只会掉一件。
      let roll = Math.random();
      if (elite) {
        if (roll < odds.eliteMaterial) return this.add('rare', b.x, b.z, y, '精英改装材料·穿透弹芯', 520);
        roll -= odds.eliteMaterial;
        if (roll < odds.eliteBadge) return this.add('rare', b.x, b.z, y, '精英徽记', 240 + stage * 8);
        roll -= odds.eliteBadge;
      }
      if (healing && roll < odds.eventHealing) return this.add('health', b.x, b.z, y, '圣露', healing);
    }
    add(kind, x, z, y, name, value, permanent = false) {
      if (this.deepSupplies && !permanent && ['ammo','health','grenade'].includes(kind)) return;
      if (!permanent && ['ammo', 'health', 'grenade'].includes(kind)) {
        for (const p of this.objects) {
          if (!p.active || p.permanent || p.kind !== kind || p.name !== name || Math.abs(y - p.y) > 0.25) continue;
          this.where.set(x, y + 0.25, z);
          const distance = this.direction.set(p.x - x, p.y - y, p.z - z).length();
          if (
            distance > cfg.mergeRange ||
            (distance && !this.level.visible(this.where, this.direction.divideScalar(distance), distance))
          )
            continue;
          p.value += value;
          p.born = this.age;
          return p;
        }
      }
      // 在长局中稀有掉落可以占满普通槽。给两件宝库奖励、秘藏、传奇和任务核心留位。
      if (kind === 'core' && this.keyItem?.active) return this.keyItem;
      const end = this.objects.length - (permanent && kind === 'rare' ? 1 : 5);
      // 无尽弹箱领取完仍保留其原位，下波可在掉落池已满时补货。
      let object = kind === 'core' ? this.objects.at(-1) :
        this.objects.find((p, i) => i < end && !p.active && !this.ammoStations.has(p));
      if (!object) {
        let oldestUnclaimedRare = null;
        for (let i = 0; i < end; i++) {
          const p = this.objects[i];
          if (!p.active || p.permanent) continue;
          if (permanent && p.kind === 'rare' && p.origin === 'drop' &&
              (!oldestUnclaimedRare || p.born < oldestUnclaimedRare.born))
            oldestUnclaimedRare = p;
          if (
            ['ammo', 'health', 'grenade'].includes(p.kind) &&
            (!object || p.born < object.born)
          )
            object = p;
        }
        // 先回收普通消耗品。全池只剩未领取的随机稀有时，固定配给仍能落地。
        object ??= oldestUnclaimedRare;
      }
      if (!object) return;
      if (kind === 'core') this.keyItem = object;
      const style = kind === 'rare' && value >= cfg.preciousValue ? 'precious' : kind;
      Object.assign(object, { style, active: true, kind, x, z, y, name, value, permanent, manual:false,
        origin: kind === 'rare' && !permanent ? 'drop' : null, born: this.age });
      return object;
    }
    withinReach(item, player) {
      const dx = item.x - player.x, dy = item.y - player.y, dz = item.z - player.z;
      if (Math.abs(dy) > 1.25 || dx * dx + dz * dz > cfg.grab * cfg.grab) return false;
      this.where.set(player.x, player.y + 0.35, player.z);
      const distance = this.direction.set(dx, dy, dz).length();
      return !distance || this.level.visible(this.where, this.direction.divideScalar(distance), distance);
    }
    nearKey(player) {
      return this.keyItem?.active && this.withinReach(this.keyItem, player);
    }
    nearbyReward(player) {
      let nearest=null, best=Infinity;
      for (const item of this.objects) {
        if (!item.active || !item.manual || !this.withinReach(item,player)) continue;
        const distance=(item.x-player.x)**2+(item.y-player.y)**2+(item.z-player.z)**2;
        if (distance<best) {nearest=item;best=distance;}
      }
      return nearest;
    }
    takeNearbyReward(player,game) {
      const item=this.nearbyReward(player);
      return Boolean(item && this.collect(item,player,game));
    }
    takeKey(player, game) {
      if (!this.nearKey(player)) return false;
      this.keyItem.active = false;
      this.keyItem = null;
      game.core = true;
      game.sound.pickup(true);
      game.sound.stageEvent('clear',game,player);
      game.ui.notify('获得 ' + TEXT.keyItem + ' ×1 · ' + TEXT.coreCollected, 2);
      return true;
    }
    update(dt, player, game) {
      this.age += dt;
      for (const item of this.objects) {
        if (!item.active) continue;
        if (
          !item.permanent &&
          item.kind !== 'core' &&
          item.kind !== 'rare' &&
          this.age - item.born >= cfg.lifetime
        ) {
          item.active = false;
          continue;
        }
        if (item.kind !== 'core' && !item.manual && this.withinReach(item, player)) this.collect(item, player, game);
      }
    }
    takeAimed(player, game) {
      camera.getWorldDirection(this.aim);
      const candidates = [];
      for (const item of this.objects) {
        if (!item.active || item.kind === 'core' || Math.abs(player.y - item.y) > 1.25) continue;
        if (item.manual && !this.withinReach(item,player)) continue;
        this.direction.set(item.x, item.y + 0.4, item.z).sub(camera.position);
        const length = this.direction.length();
        if (length <= 0 || length > cfg.nameRange) continue;
        this.direction.divideScalar(length);
        const aim = this.direction.dot(this.aim);
        if (aim > 0.985 && this.level.visible(camera.position, this.direction, length)) {
          candidates.push({item, aim, length});
        }
      }
      candidates.sort((a, b) => b.aim - a.aim || a.length - b.length);
      return candidates.some(({item}) => this.collect(item, player, game));
    }
    collect(item, player, game) {
      if (!item.active) return false;
      let amount = 1,
        detail = '';
      if (item.kind === 'rare') {
        const value = Math.round(item.value * (game.variation?.value ?? 1));
        game.loot.push({ name: item.name, value, origin:item.origin ?? 'main' });
        game.value += value;
        const supply = item.origin !== 'drop' && !this.deepSupplies && game.kit?.supply();
        detail = ' · 价值 ' + value + (supply ? ' · 补给 ' + supply : '');
        item.active = false;
      } else {
        if (item.kind === 'health') {
          amount = Math.min(CONFIG.player.health - player.hp, item.value);
          player.hp += amount;
        } else if (item.kind === 'grenade') {
          amount = game.kit?.supply('grenade') ? 1 : 0;
        } else {
          amount = Math.min(CONFIG.weapon.maxReserve - game.weapon.reserve, item.value);
          game.weapon.reserve += amount;
        }
        if (amount <= 0) return false;
        item.value -= amount;
        item.active = item.value > 0.00001;
      }
      game.ui.notify('获得 ' + item.name + ' ×' + Math.ceil(amount) + detail, 1.5);
      game.sound.pickup(item.kind !== 'ammo');
      this.where.set(item.x, item.y + 0.42, item.z);
      this.effects.spray(this.where, this.tint.set(cfg.styles[item.style].color), 8, 2.5, 0.041, 'spark');
      return true;
    }
    render(t) {
      this.draw(this.objects, t, this.age);
    }
  }

  return Pickups;
}
