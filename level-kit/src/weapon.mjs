import { createRifle } from '@level-kit/rifle-model.mjs';
import { WeaponCombat } from '@level-kit/weapon-perks.mjs';

export function createWeaponClass({ CONFIG, THREE, V3, TAU, camera, weaponScene, definition, shapes, brighter, lerp, randomRange, colors }) {
  const { spark } = colors;
  const nativeSkin = definition.weaponSkin;
  const bloodMoonLevel = nativeSkin === 'shanhai-secret-realm' || nativeSkin === 'bloodmoon-castle';

  class WeaponSystem {
    constructor(skinId) {
      this.skinId = skinId;
      this.combat = new WeaponCombat(skinId, nativeSkin, CONFIG.weapon.damage);
      const from = new V3(), to = new V3(), sight = new V3();
      const tints = Object.fromEntries(Object.entries({
        stone: 0xb1a886, ice: 0x91eaff, arc: 0x8cffff, fire: 0xff792e, petal: 0xffabc9, steam: 0xe7e0d5,
      }).map(([name, tint]) => [name, brighter(tint, 1.8)]));
      const center = (out, b) => out.set(b.x, b.y + (b.height ?? 1.7) * .52, b.z);
      this.combat.visual = (b, game, kind) => {
        game.effects.spray(center(to, b), tints[kind], 8, 2.8, .07, kind === 'steam' || kind === 'petal' ? 'mist' : 'spark');
      };
      this.combat.arc = (a, b, game) => {
        game.effects.streak(center(from, a), center(to, b));
        this.combat.visual(b, game, 'arc');
      };
      this.combat.visible = (a, b, game) => {
        center(from, a); center(to, b);
        const length = sight.subVectors(to, from).length();
        return length < .01 || game.level.visible(from, sight.divideScalar(length), length);
      };
      this.group = new THREE.Group();
      weaponScene.add(this.group);
      this.rifle = createRifle(skinId, { firstPerson: true });
      this.rifle.root.rotation.y = Math.PI / 2;
      this.group.add(this.rifle.root);
      this.signals = {};
      this.empRecovery = 0;
      const glove = new THREE.MeshStandardMaterial({ color: 0x35373b, roughness: .86 });
      const sleeve = new THREE.MeshStandardMaterial({ color: 0x313c46, roughness: .88 });
      function component(group, geo, mat, x, y, z, w = 1, h = 1, d = 1, pitch = 0, yaw = 0, roll = 0) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.rotation.set(pitch, yaw, roll);
        group.add(mesh);
        return mesh;
      }
      // 手套随第一人称武器移动，收藏预览只展示武器本身。
      const hand = (mat, ...args) => component(this.group, shapes.box, mat, ...args);
      hand(sleeve, .024, -.171, .19, .115, .125, .39, -.41, .17, -.1);
      hand(glove, .016, -.118, .132, .115, .095, .115, -.35, .18, -.12);
      hand(glove, -.047, -.071, -.49, .141, .072, .12, -.21, .22, .15);
      hand(sleeve, -.117, -.155, -.26, .116, .112, .43, -.39, .48);

      this.flashGroup = new THREE.Group(); this.group.add(this.flashGroup);
      this.flashGroup.position.copy(this.rifle.muzzle).applyAxisAngle(new V3(0, 1, 0), Math.PI / 2);
      const outer = new THREE.MeshBasicMaterial({ color: brighter(0xff9c48, 4), transparent: true, depthWrite: false });
      const inner = new THREE.MeshBasicMaterial({ color: brighter(0xffe8a4, 6), transparent: true, depthWrite: false });
      const star = new THREE.ConeGeometry(0.064, 0.24, 5);
      component(this.flashGroup, star, outer, 0, 0, -0.08, 1, 1, 1, -Math.PI / 2).renderOrder = 15;
      component(this.flashGroup, new THREE.OctahedronGeometry(0.050, 0), inner, 0, 0, -0.065, 1.32, 1.32, 3).renderOrder = 16;
      for (let i = 0; i < 5; i++) {
        const a = i * TAU / 5;
        component(this.flashGroup, star, outer, Math.cos(a) * 0.039, Math.sin(a) * 0.039, -0.045, 0.45, 0.62, 0.45, -Math.PI / 2, Math.cos(a) * 0.62, Math.sin(a) * 0.57).renderOrder = 15;
      }
      this.dir = new V3(); this.origin = new V3(); this.end = new V3(); this.muzzle = new V3();
      this.reset();
    }
    reset() {
      this.ammo = CONFIG.weapon.magazine; this.reserve = CONFIG.weapon.reserve;
      this.heat = 0; this.cooldown = 0; this.reloadLeft = 0; this.kick = 0; this.flash = 0;
      this.emptyAt = -5;
      this.combat.reset();
      this.empRecovery = 0;
      this.signals.emp = false;
      this.flashGroup.visible = false;
      this.group.visible = false;
    }
    reload(game) {
      if (this.reloadLeft > 0 || this.ammo >= CONFIG.weapon.magazine || this.reserve <= 0) return;
      this.reloadLeft = CONFIG.weapon.reloadTime; game.sound.reload();
    }
    shoot(game) {
      const w = CONFIG.weapon, p = game.player;
      this.ammo--; this.heat = Math.min(1, this.heat + w.heatPerShot);
      this.kick = Math.min(0.21, this.kick + 0.081 + 0.028 * this.heat);
      this.flash = 0.047;
      p.recoil = Math.min(0.085, p.recoil + w.recoil * (1 + 1.1 * this.heat));
      p.recoilRoll += randomRange(-0.004, 0.004) * (1 + this.heat);
      game.shotAt = game.time; game.shotX = p.x; game.shotY = p.y; game.shotZ = p.z;
      game.shotHearingScale = this.combat.hearingScale(p);
      const penetrate = this.combat.beginShot();
      game.sound.shoot();
      const spread = lerp(w.baseSpread, w.maxSpread, this.heat ** 1.25) * (p.sprinting ? 1.45 : 1);
      const a = randomRange(0, TAU), s = Math.sqrt(Math.random()) * spread;
      this.dir.set(Math.cos(a) * s, Math.sin(a) * s, -1).normalize().applyQuaternion(camera.quaternion);
      this.origin.copy(camera.position);
      const cover = game.level.hash.ray(this.origin, this.dir, w.range);
      let limit = game.level.hash.depth;
      if (this.dir.y < -0.009) {
        const floor = game.level.base(this.origin.x, this.origin.z);
        const t = (floor - this.origin.y) / this.dir.y;
        if (t > 0) {
          const depth = (game.level.base(this.origin.x + this.dir.x * t, this.origin.z + this.dir.z * t) - this.origin.y) / this.dir.y;
          limit = Math.min(limit, Math.max(0, depth));
        }
      }
      const hit = game.beasts.hash.ray(this.origin, this.dir, limit);
      this.end.copy(this.origin).addScaledVector(this.dir, game.beasts.hash.depth);
      this.group.updateWorldMatrix(true, true);
      camera.localToWorld(this.flashGroup.getWorldPosition(this.muzzle));
      const streakLength = this.muzzle.distanceTo(this.end);
      if (streakLength > 0.28) game.effects.streak(this.muzzle, this.end);
      if (hit) {
        let dead = this.hitTarget(hit, game);
        if (penetrate) {
          const next = game.beasts.hash.ray(this.origin, this.dir, limit, hit);
          if (next) {
            this.end.copy(this.origin).addScaledVector(this.dir, game.beasts.hash.depth);
            game.effects.streak(this.muzzle, this.end);
            dead = this.hitTarget(next, game) || dead;
          }
        }
        game.sound.hit(dead);
        game.ui.hit(dead ? 'kill' : 'hit');
        game.hitStop = w.hitStop;
      } else {
        this.combat.miss();
        if (cover || limit < w.range) game.effects.spray(this.end, spark, 5, 3.2, 0.025, 'spark');
      }
    }
    hitTarget(target, game) {
      const hit = { damage: CONFIG.weapon.damage, headshot: this.end.y >= target.y + target.height * .75 };
      this.combat.hit(target, hit, game);
      return !target.active || game.beasts.takeHit(target, hit.damage, this.end, this.dir, game, hit);
    }
    update(dt, input, game) {
      this.cooldown = Math.max(-dt, this.cooldown - dt);
      this.heat = Math.max(0, this.heat - dt * CONFIG.weapon.heatRecovery * ((input.fire || input.padFire) && this.ammo > 0 && this.reloadLeft <= 0 ? 0.26 : 1));
      if (input.reload) { input.reload = false; this.reload(game); }
      if (this.reloadLeft > 0) {
        this.reloadLeft = Math.max(0, this.reloadLeft - dt);
        if (this.reloadLeft === 0) {
          const fill = Math.min(CONFIG.weapon.magazine - this.ammo, this.reserve);
          this.ammo += fill; this.reserve -= fill; game.sound.reload(true);
          this.combat.reloaded();
          this.cooldown = Math.max(0.08, this.cooldown);
        }
      }
      if (!input.fire) this.cooldown = Math.max(0, this.cooldown);
      if ((input.fire || input.padFire) && this.reloadLeft <= 0 && this.cooldown <= 0) {
        if (this.ammo > 0) {
          this.cooldown += 1 / (CONFIG.weapon.fireRate * this.combat.fireRate);
          this.shoot(game);
        } else if (this.reserve <= 0 && game.time - this.emptyAt > 0.45) {
          this.emptyAt = game.time; game.sound.tone(182, 100, 0.045, 0.095, 'square');
        }
      }
      // 打出最后一发即开始换弹；空仓时捡到备弹也走相同入口。
      if (this.ammo === 0 && this.reloadLeft === 0) this.reload(game);
    }
    render(dt, player, game) {
      const emp = Boolean(game.level.empActive);
      if (this.signals.emp && !emp) this.empRecovery = .88;
      this.empRecovery = Math.max(0, this.empRecovery - dt);
      this.signals.bloodMoon = bloodMoonLevel && game.encounter?.phase === 'active';
      this.signals.tide = game.level.tide?.rifleTide;
      this.signals.emp = emp;
      this.signals.shot = this.flash > 0 ? 1 : 0;
      this.signals.pressure = this.combat.charge / 15;
      this.signals.empRecovery = this.empRecovery;
      this.rifle.update(game.time, this.signals);
      this.kick *= Math.exp(-dt * 17);
      this.flash = Math.max(0, this.flash - dt);
      const cycle = this.reloadLeft > 0 ? Math.sin(Math.PI * this.reloadLeft / CONFIG.weapon.reloadTime) : 0;
      const sway = player.speedMix * Math.sin(player.bob);
      this.group.position.set(0.315 + sway * 0.028 + cycle * 0.075, -0.315 + sway * 0.023 - cycle * 0.29, -0.67 + this.kick * 0.8 + (player.sprinting ? 0.041 : 0));
      this.group.rotation.set(this.kick * 0.24 - cycle * 0.31, -0.045 + cycle * 0.26, -0.013 + player.sway * 0.026 - cycle * 0.62);
      this.rifle.magazine.position.y = -Math.sin(cycle * 1.56) * 0.18;
      this.flashGroup.visible = this.flash > 0;
      if (this.flashGroup.visible) {
        this.flashGroup.scale.setScalar(Math.max(0.55, this.flash * 18 + 0.25));
        this.flashGroup.rotation.z += 0.42;
      }
    }
  }

  return WeaponSystem;
}
