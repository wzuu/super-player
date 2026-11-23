import { createPickupVisuals } from '@level-kit/pickup-visuals.mjs';

export function createPickupClass(context) {
  const { CONFIG, THREE, V3, camera, definition, TEXT } = context;
  const cfg = CONFIG.pickups;
  class Pickups {
    constructor(level, effects) {
      this.level = level;
      this.effects = effects;
      this.objects = Array.from({ length: CONFIG.pickups.pool }, () => ({ active: false, kind: '', born: 0 }));
      this.draw = createPickupVisuals(context);
      this.direction = new V3();
      this.aim = new V3();
      this.tint = new THREE.Color();
      this.where = new V3();
      this.age = 0;
    }
    reset() {
      this.age = 0;
      this.keyItem = null;
      for (const p of this.objects) p.active = false;
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
      for (const [x, z] of definition.ammo ?? [])
        this.add('ammo', x, z, this.level.base(x, z), '补给弹药', CONFIG.pickups.ammoCache, true);
    }
    add(kind, x, z, y, name, value, permanent = false) {
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
      let object = this.objects.find((p) => !p.active);
      if (!object) {
        for (const p of this.objects) {
          if (
            !p.permanent &&
            ['ammo', 'health', 'sample', 'grenade'].includes(p.kind) &&
            (!object || p.born < object.born)
          )
            object = p;
        }
      }
      if (!object) return;
      if (kind === 'core') this.keyItem = object;
      const style = kind === 'rare' && value >= cfg.preciousValue ? 'precious' : kind;
      Object.assign(object, { style, active: true, kind, x, z, y, name, value, permanent, born: this.age });
      return object;
    }
    nearKey(player) {
      const item = this.keyItem;
      return (
        item?.active &&
        Math.abs(player.y - item.y) <= 1.25 &&
        Math.hypot(player.x - item.x, player.z - item.z) <= CONFIG.pickups.grab
      );
    }
    takeKey(player, game) {
      if (!this.nearKey(player)) return false;
      this.keyItem.active = false;
      this.keyItem = null;
      game.core = true;
      game.sound.pickup(true);
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
        if (item.kind === 'core' || Math.abs(player.y - item.y) > 1.25) continue;
        const distance = this.direction.set(item.x - player.x, item.y - player.y, item.z - player.z).length();
        if (Math.hypot(player.x - item.x, player.z - item.z) > cfg.grab) continue;
        this.where.set(player.x, player.y + 0.35, player.z);
        if (distance && !this.level.visible(this.where, this.direction.divideScalar(distance), distance)) continue;
        this.collect(item, player, game);
      }
    }
    takeAimed(player, game) {
      camera.getWorldDirection(this.aim);
      let selected = null,
        best = 0.985;
      for (const item of this.objects) {
        if (!item.active || item.kind === 'core' || Math.abs(player.y - item.y) > 1.25) continue;
        this.direction.set(item.x, item.y + 0.4, item.z).sub(camera.position);
        const length = this.direction.length();
        if (length <= 0 || length > cfg.nameRange) continue;
        this.direction.divideScalar(length);
        const aim = this.direction.dot(this.aim);
        if (aim <= best || !this.level.visible(camera.position, this.direction, length)) continue;
        selected = item;
        best = aim;
      }
      return selected && this.collect(selected, player, game);
    }
    collect(item, player, game) {
      let amount = 1,
        detail = '';
      if (item.kind === 'rare') {
        game.loot.push({ name: item.name, value: item.value });
        game.value += item.value;
        const supply = game.kit?.supply();
        detail = ' · 价值 ' + item.value + (supply ? ' · 补给 ' + supply : '');
        item.active = false;
      } else if (item.kind === 'sample') {
        game.weapon.combat.samplePending = true;
        detail = ' · 下次换弹伤害提升 30%';
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
