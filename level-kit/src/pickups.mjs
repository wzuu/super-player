export function createPickupClass({ CONFIG, THREE, V3, shapes, workColor, dynamicMesh, updateMesh, setInstance, colors, definition, TEXT }) {
  const { coreTint, rareTint, ammoTint } = colors;
  const healthTint = new THREE.Color(0x86ed9f).multiplyScalar(1.30);

  class Pickups {
    constructor(level, effects) {
      this.level = level; this.effects = effects;
      this.objects = Array.from({ length: CONFIG.pickups.pool }, () => ({ active: false, kind: '', born: 0 }));
      this.boxes = dynamicMesh(shapes.box, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x1a2832 }), this.objects.length);
      this.marks = dynamicMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial(), this.objects.length);
      this.rings = dynamicMesh(new THREE.RingGeometry(0.79, 1, 15), new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide, transparent: true, depthWrite: false, opacity: 0.72,
      }), this.objects.length);
      this.where = new V3(); this.age = 0;
    }
    reset() {
      this.age = 0; this.keyItem=null;
      for (const p of this.objects) p.active = false;
      for (const [x, z, name, value, height] of (definition.loot ?? [])) {
        this.add('rare', x, z, this.level.surface(x, z, height === 'top' ? Infinity : this.level.base(x, z) + 0.16), name, value, true);
      }
      for (const [x, z] of (definition.ammo ?? [])) this.add('ammo', x, z, this.level.base(x, z), '补给弹药', CONFIG.pickups.ammoCache, true);
    }
    add(kind, x, z, y, name, value, permanent = false) {
      let object = this.objects.find(p => !p.active);
      if (!object) {
        for (const p of this.objects) {
          if (!p.permanent && ['ammo', 'health', 'sample'].includes(p.kind) && (!object || p.born < object.born)) object = p;
        }
      }
      if (!object) return;
      if (kind === 'core') this.keyItem=object;
      Object.assign(object, { active: true, kind, x, z, y, name, value, permanent, born: this.age });
    }
    nearKey(player) {
      const item=this.keyItem;
      return item?.active && Math.abs(player.y-item.y)<=1.25 && Math.hypot(player.x-item.x,player.z-item.z)<=CONFIG.pickups.grab;
    }
    takeKey(player,game) {
      if (!this.nearKey(player)) return false;
      this.keyItem.active=false;
      game.core=true;
      game.sound.pickup(true);
      game.ui.notify(TEXT.coreCollected,2);
      return true;
    }
    update(dt, player, game) {
      this.age += dt;
      for (const item of this.objects) {
        if (!item.active) continue;
        if (Math.abs(player.y - item.y) > 1.25 || Math.hypot(player.x - item.x, player.z - item.z) > CONFIG.pickups.grab) continue;
        if (item.kind === 'core') continue;
        if (item.kind === 'rare') {
          game.loot.push({ name: item.name, value: item.value }); game.value += item.value;
          game.ui.notify('已拾取 ' + item.name + ' / 价值 ' + item.value, 1.7);
        } else if (item.kind === 'sample') {
          game.weapon.combat.samplePending = true;
          game.ui.notify('已回收样本 / 下次换弹伤害提升 30%', 1.7);
        } else if (item.kind === 'health') {
          const restored = Math.min(CONFIG.player.health - player.hp, item.value);
          if (restored <= 0) continue;
          player.hp += restored;
          game.ui.notify(item.name + '恢复生命 ' + Math.ceil(restored), 1.2);
        } else {
          const added = Math.min(CONFIG.weapon.maxReserve - game.weapon.reserve, item.value);
          if (added <= 0) continue;
          game.weapon.reserve += added;
          game.ui.notify('备用弹药增加 ' + added, 1.05);
        }
        if (item.kind === 'rare') {
          const supply = game.kit?.supply();
          if (supply) game.ui.notify('已拾取 '+item.name+' · 补给 '+supply,1.7);
        }
        item.active = false;
        game.sound.pickup(item.kind !== 'ammo');
        this.where.set(item.x, item.y + 0.42, item.z);
        const tint = item.kind === 'core' ? coreTint : item.kind === 'rare' ? rareTint : item.kind === 'health' ? healthTint : ammoTint;
        this.effects.spray(this.where, tint, 8, 2.5, 0.041, 'spark');
      }
    }
    render(t) {
      let n = 0;
      for (const item of this.objects) {
        if (!item.active) continue;
        const core = item.kind === 'core', rare = item.kind === 'rare';
        const color = core ? coreTint : rare ? rareTint : item.kind === 'health' || item.kind === 'sample' ? healthTint : ammoTint;
        const a = t * 1.7 + item.x * 0.11;
        const offset = core ? 0.68 : rare ? 0.47 : 0.35;
        const float = Math.sin(a * 1.8) * 0.070;
        const size = core ? 0.22 : rare ? 0.117 : 0.076;
        setInstance(this.marks, n, item.x, item.y + offset + float, item.z, size, size * (core ? 1.46 : 1), size, color, a, 0.22);
        workColor.copy(color).multiplyScalar(0.44);
        setInstance(this.rings, n, item.x, item.y + 0.025, item.z, core ? 0.64 : rare ? 0.54 : 0.38, core ? 0.64 : rare ? 0.54 : 0.38, 1, workColor, 0, -Math.PI / 2);
        workColor.setHex(core ? 0xbb7147 : rare ? 0x6e9d91 : 0x617b8e);
        const w = rare ? 0.40 : 0.29;
        setInstance(this.boxes, n++, item.x, item.y + 0.126, item.z, w, 0.23, w * 0.72, workColor, a * 0.12);
      }
      updateMesh(this.boxes, n); updateMesh(this.marks, n); updateMesh(this.rings, n);
    }
  }

  return Pickups;
}
