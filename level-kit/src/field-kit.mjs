import { supplies,applyBranches } from '@level-kit/gear.mjs';
import { createFieldGrenades } from '@level-kit/field-grenades.mjs';

export function createFieldKit(config, keys, visual) {
  const { THREE, scene } = visual;
  const grenades = createFieldGrenades(config, visual);
  const marker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.44, 0.18, 8),
    new THREE.MeshBasicMaterial({ color: 0xffa947 }),
  );
  scene.add(marker);
  marker.visible = false;
  const nearby = [],
    point = new THREE.Vector3(),
    tint = new THREE.Color(0x64dfea);
  let kit, cooldown, healing, invulnerable, roll, hurtAt, nextHud;
  const hud = document.getElementById('equipment-hud');
  const slots = keys.map((key) => {
    const node = document.createElement('span');
    node.className = 'kit-slot';
    const label = document.createElement('kbd');
    label.textContent = key;
    const text = document.createElement('span');
    node.append(label, text);
    hud.append(node);
    return { node, text };
  });
  const treatment = document.createElement('span');
  hud.append(treatment);
  const baseWeapon = { ...config.weapon };
  function area(game, x, y, z, radius, apply) {
    const targets = game.beasts.hash.query(x - radius, z - radius, x + radius, z + radius, nearby);
    let count = 0;
    for (const b of targets) {
      if (!b.active || Math.hypot(b.x - x, b.y - y, b.z - z) > radius) continue;
      count++;
      apply(b);
    }
    return count;
  }
  function burst(game, x, y, z) {
    game.effects.spray(point.set(x, y + 0.5, z), tint, 32, 6, 0.09, 'spark');
    game.sound.tone(330, 85, 0.22, 0.2, 'triangle');
  }
  const effects = {
    roll(g) {
      roll = 0.3;
      invulnerable = g.time + 0.3;
    },
    shield(g) {
      invulnerable = g.time + 3;
    },
    pulse(g) {
      const p = g.player;
      area(g, p.x, p.y, p.z, 6, (b) => {
        g.weapon.combat.element(b,'heavy',g);
        if(!b.active) return;
        const d = Math.max(0.01, Math.hypot(b.x - p.x, b.z - p.z)),
          power = b.type === 3 ? 28 : 56;
        b.perkPushX = ((b.x - p.x) / d) * power;
        b.perkPushZ = ((b.z - p.z) / d) * power;
      });
    },
    slow(g) {
      const p = g.player;
      area(g, p.x, p.y, p.z, 8, (b) => {
        g.weapon.combat.element(b,'ice',g);
        if (!b.active) return;
        b.statusEffects.set('slowed', { until:g.time+4, scale:b.type===3 ? .78 : .45 });
        if(Math.hypot(b.x-p.x,b.z-p.z)<2.7) {
          const kind=b.type===3?'brittle':'frozen';
          b.statusEffects.set(kind,{type:kind,until:g.time+1.2,stacks:1});
        }
      });
    },
    decoy(g) {
      const p = g.player;
      area(g, p.x, p.y, p.z, 9, (b) =>
        b.statusEffects.set('confused', { until: g.time + (b.type === 3 ? 1 : 3), angle: Math.PI / 2 }),
      );
    },
    grenade: grenades.launch,
    medkit(g) {
      if (g.player.hp >= config.player.health || healing > 0) return false;
      healing = 1.5;
      hurtAt = g.player.lastHurt;
    },
    ammo(g) {
      if (g.weapon.reserve >= config.weapon.maxReserve) return false;
      g.weapon.reserve = Math.min(config.weapon.maxReserve, g.weapon.reserve + config.weapon.magazine * 2);
    },
    mine(g) {
      if (marker.visible) return false;
      marker.position.set(g.player.x, g.player.y + 0.1, g.player.z);
      marker.visible = true;
    },
    cache(g) {
      g.player.hp = Math.min(config.player.health, g.player.hp + 18);
      g.weapon.reserve = Math.min(config.weapon.maxReserve, g.weapon.reserve + config.weapon.magazine);
    },
  };
  return {
    clear() {
      grenades.clear();
      marker.visible = false;
    },
    reset(loadout) {
      kit = loadout ?? {
        skills: ['roll', null],
        items: ['medkit', 'grenade'],
        counts: { medkit: 1, grenade: 1 },
        mods: {},
      };
      applyBranches(config.weapon,baseWeapon,kit.mods);
      cooldown = {};
      healing = roll = invulnerable = 0;
      this.clear();
      nextHud = 0;
    },
    remaining() {
      return { ...kit.counts };
    },
    protected(now) {
      return now < invulnerable;
    },
    stopRoll() {
      roll = 0;
    },
    supply(requested) {
      const id = kit.items.find((id) => id && (!requested || requested === id) && (kit.counts[id] ?? 0) < (supplies[id]?.limit ?? 2));
      if (id) kit.counts[id] = (kit.counts[id] ?? 0) + 1;
      return id ? (supplies[id]?.name ?? '战备箱') : '';
    },
    use(slot, g) {
      if (!kit || g.phase !== 'play' || g.blast) return;
      const id = slot < 2 ? kit.skills[slot] : kit.items[slot - 2];
      if (!id || (cooldown[id] ?? 0) > g.time || (slot >= 2 && !kit.counts[id]))
        return g.ui.notify('槽位空置、冷却中或物资已用尽', 1);
      const effect = effects[id] ?? effects.cache;
      if (effect(g) === false) return g.ui.notify('当前无法使用此装备', 1);
      g.training?.did('slot'+slot);
      if (slot < 2) cooldown[id] = g.time + supplies[id].cooldown;
      else kit.counts[id]--;
      if (id !== 'grenade') burst(g, g.player.x, g.player.y, g.player.z);
      g.ui.notify(supplies[id]?.name ?? '战备箱', 1);
    },
    step(dt, g) {
      grenades.step(dt, g);
      const p = g.player;
      if (roll > 0) {
        const distance = (Math.min(dt, roll) * 5) / 0.3,
          yaw = p.look.rotation.y;
        for (let i = 0; i < 4; i++)
          g.level.move(
            p,
            (-Math.sin(yaw) * distance) / 4,
            (-Math.cos(yaw) * distance) / 4,
            config.player.step,
          );
        roll = Math.max(0, roll - dt);
      }
      if (healing > 0) {
        if (p.lastHurt !== hurtAt) {
          healing = 0;
          g.ui.notify('急救被打断', 1);
        } else {
          healing -= dt;
          if (healing <= 0) p.hp = Math.min(config.player.health, p.hp + config.player.health * 0.3);
        }
      }
      if (marker.visible) {
        const { x, y, z } = marker.position;
        if (area(g, x, y, z, 2, () => {})) {
          marker.visible = false;
          const impact = { blastOrigin: { x, z } };
          area(g, x, y, z, 5, (b) => g.beasts.damage(b, config.beasts.types[0].hp * 2, g, 'equipment',impact));
          burst(g, x, y, z);
        }
      }
      if (g.time < nextHud) return;
      nextHud = g.time + 0.1;
      [...kit.skills, ...kit.items].forEach((id, i) => {
        const { node, text } = slots[i],
          left = Math.max(0, (cooldown[id] ?? 0) - g.time);
        const name = supplies[id]?.name ?? '战备箱';
        const label = id
          ? name + ' ' + (i < 2 ? (left ? Math.ceil(left) + 's' : '就绪') : '×' + kit.counts[id])
          : '空槽';
        if (text.textContent !== label) text.textContent = label;
        node.style.setProperty('--cooldown', (left / (supplies[id]?.cooldown ?? 1)) * 100 + '%');
      });
      treatment.textContent = healing > 0 ? '急救 ' + healing.toFixed(1) + 's' : '';
    },
  };
}
