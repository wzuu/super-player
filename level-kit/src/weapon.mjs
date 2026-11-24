import { createRifle } from '@level-kit/rifle-model.mjs';
import { WeaponCombat } from '@level-kit/weapon-perks.mjs';
import { createShoulderView } from '@level-kit/shoulder-view.mjs';
import { pelletDamage } from '@level-kit/weapon-classes.mjs';

export function createWeaponClass({ CONFIG, THREE, V3, TAU, camera, scene, weaponScene, definition, shapes, brighter, lerp, randomRange }) {
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
        game.effects.streak(center(from, a), center(to, b), 'arc');
        this.combat.visual(b, game, 'arc');
      };
      this.combat.visible = (a, b, game) => {
        center(from, a); center(to, b);
        const length = sight.subVectors(to, from).length();
        return length < .01 || game.level.visible(from, sight.divideScalar(length), length);
      };
      const seenKey='super-player:reaction-discoveries:v1';
      let discoveries;
      try { discoveries=new Set(JSON.parse(localStorage.getItem(seenKey) || '[]')); } catch {discoveries=new Set();}
      this.combat.announceReaction=(rule,game)=>{
        const first=!discoveries.has(rule.id);
        if(first) {
          discoveries.add(rule.id);
          try {localStorage.setItem(seenKey,JSON.stringify([...discoveries]));} catch { /* 本页记录仍有效 */ }
        }
        game.ui.notify(rule.name+(first?' · 已记录到战场图鉴':''),first?2.4:1);
        const tones={toxic:[168,38],conduct:[960,1800],shatter:[1840,400],vapor:[440,65]};
        game.sound.tone(...tones[rule.id],.16,.22,rule.id==='conduct'?'square':'triangle');
      };
      this.group = new THREE.Group();
      weaponScene.add(this.group);
      this.rifle = createRifle(skinId, { firstPerson: true });
      this.rifle.root.rotation.y = Math.PI / 2;
      this.group.add(this.rifle.root);
      this.shoulder = createShoulderView(THREE, scene, this.rifle);
      const shotgun = Boolean(CONFIG.weapon.pellets);
      this.adsHeight = shotgun ? .40 : .36;
      this.adsDistance = shotgun ? 1.09 : .99;
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
      this.inspectTime = 0;
      this.ammo = CONFIG.weapon.magazine; this.reserve = CONFIG.weapon.reserve;
      this.heat = 0; this.cooldown = 0; this.reloadLeft = 0; this.kick = 0; this.flash = 0;
      this.emptyAt = -5;
      this.reloadTotal = 0;
      this.shoulder.body.visible = false;
      this.lastImpact = -Infinity;
      this.combat.reset();
      this.empRecovery = 0;
      this.signals.emp = false;
      this.flashGroup.visible = false;
      this.group.visible = false;
    }
    reload(game) {
      if (this.reloadLeft > 0 || this.ammo >= CONFIG.weapon.magazine || this.reserve <= 0) return;
      this.reloadTotal = this.reloadLeft = CONFIG.weapon.reloadTime * (game.time < this.combat.fastLoadUntil ? .68 : 1);
      game.sound.reload();
    }
    shoot(game) {
      const w = CONFIG.weapon, p = game.player;
      this.ammo--; this.heat = Math.min(1, this.heat + w.heatPerShot);
      this.kick = Math.min(0.21, this.kick + 0.081 + 0.028 * this.heat);
      this.flash = lerp(.047,.031,p.ads);
      p.recoil = Math.min(0.085, p.recoil + w.recoil * (1 + 1.1 * this.heat));
      p.recoilRoll += randomRange(-0.004, 0.004) * (1 + this.heat);
      game.shotAt = game.time; game.shotX = p.x; game.shotY = p.y; game.shotZ = p.z;
      game.shotHearingScale = this.combat.hearingScale(p)*(game.variation?.hearing ?? 1);
      const innatePenetration = this.combat.beginShot();
      const penetrate = !w.split && (innatePenetration || w.pierce);
      game.sound.shoot(w.pellets);
      const spread = lerp(w.baseSpread, w.maxSpread, this.heat ** 1.25) * (p.sprinting ? 1.45 : 1);
      this.origin.copy(camera.position);
      this.group.updateWorldMatrix(true,true);
      camera.localToWorld(this.flashGroup.getWorldPosition(this.muzzle));
      const count = w.pellets ?? 1, rotation = randomRange(0,TAU);
      const middlePellet = Math.floor((count - 1) / 2);
      const lowDetail = CONFIG.graphics.particleScale <= .3;
      this.splitUsed=false; this.impactParticles=0;
      let hits = 0, rank = 0;
      for (let i=0;i<count;i++) {
        const angle = rotation + i*2.39996;
        const radius = spread*(count===1 ? Math.sqrt(Math.random()) : Math.sqrt(i/(count-1)));
        this.dir.set(Math.cos(angle)*radius,Math.sin(angle)*radius*(count===1?1:.72),-1).normalize().applyQuaternion(camera.quaternion);
        // 抽取扇面两侧的实际弹丸。低画质省去中央曳光，所有弹丸仍单独判定。
        const draw = i === middlePellet || i === count - 1 || (!lowDetail && i === 0);
        const result=this.trace(game,penetrate,draw);
        if (result) hits++;
        rank=Math.max(rank,result);
      }
      game.performance.shot(hits>0);
      if (hits) {
        this.impact(rank,game);
        if (count>1 && hits>=4) game.sound.tone(320+hits*32,130,.09,.20,'triangle');
      } else this.combat.miss();
    }
    trace(game,penetrate,draw) {
      const w=CONFIG.weapon;
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
      const hazard=game.field?.ray(this.origin,this.dir,limit);
      if(hazard) limit=hazard.distance;
      const hit = game.beasts.hash.ray(this.origin, this.dir, limit);
      this.end.copy(this.origin).addScaledVector(this.dir, game.beasts.hash.depth);
      const streakKind = w.pellets ? 'pellet' : 'rifle';
      if (hit) {
        let rank = this.hitTarget(hit, game);
        if (penetrate) {
          const next = game.beasts.hash.ray(this.origin, this.dir, limit, hit);
          if (next) {
            this.end.copy(this.origin).addScaledVector(this.dir, game.beasts.hash.depth);
            rank = Math.max(rank, this.hitTarget(next, game));
          }
        }
        if (draw && this.muzzle.distanceTo(this.end) > .28) game.effects.streak(this.muzzle, this.end, streakKind);
        return rank;
      }
      if (hazard) game.field.hit(hazard.trap,CONFIG.weapon.damage,game);
      if (draw && this.muzzle.distanceTo(this.end) > .28) game.effects.streak(this.muzzle, this.end, streakKind);
      if (draw && (cover || limit < w.range)) game.effects.impact(this.end, Boolean(w.pellets));
      return 0;
    }
    hitTarget(target, game) {
      const distance=this.origin.distanceTo(this.end);
      const hit = { damage: pelletDamage(distance,CONFIG.weapon), pellet:Boolean(CONFIG.weapon.pellets), heavy: CONFIG.weapon.pellets && distance<=CONFIG.weapon.falloffStart,
        quietImpact:this.impactParticles++>=3,
        headshot: this.end.y >= target.y + target.height * .75 &&
          (!target.fight || game.time >= target.fight.transitionUntil &&
            (game.time < target.fight.weakUntil || game.time < target.fight.brokenUntil)) };
      this.combat.hit(target, hit, game);
      if (CONFIG.weapon.split && !this.splitUsed) {
        this.splitUsed=true;
        this.combat.splash(target,hit.damage,game);
      }
      const killed = !target.active || game.beasts.takeHit(target, hit.damage, this.end, this.dir, game, hit);
      return (killed ? 3 : 1) + Number(hit.headshot || hit.weak === true);
    }
    impact(rank, game) {
      const kind = ['', 'hit', 'weak', 'kill', 'critical-kill'][rank];
      game.ui.hit(kind);
      game.sound.hit(rank, game.performance.combo);
      const feedback = CONFIG.feedback;
      if (CONFIG.graphics.particleScale <= .3 && game.time - this.lastImpact < feedback.lowAttackInterval) return;
      this.lastImpact = game.time;
      game.attackPauseUntil=Math.max(game.attackPauseUntil,game.time+feedback.attackStop[rank]);
      if (rank >= 3) game.player.attackKick = Math.max(game.player.attackKick, rank === 4 ? .28 : .15);
    }
    update(dt, input, game) {
      if (input.fire || input.padFire || input.reload || this.reloadLeft > 0 || game.player.aiming || game.player.sprinting)
        this.inspectTime = 0;
      this.cooldown = Math.max(-dt, this.cooldown - dt);
      this.heat = Math.max(0, this.heat - dt * CONFIG.weapon.heatRecovery * ((input.fire || input.padFire) && this.ammo > 0 && this.reloadLeft <= 0 ? 0.26 : 1));
      if (input.reload) { input.reload = false; this.reload(game); }
      const firing=input.fire || input.padFire;
      if (CONFIG.weapon.pellets && firing && this.ammo>0) this.reloadLeft=0;
      if (this.reloadLeft > 0) {
        this.reloadLeft = Math.max(0, this.reloadLeft - dt);
        if (this.reloadLeft === 0) {
          const fill = Math.min(CONFIG.weapon.magazine - this.ammo, this.reserve, CONFIG.weapon.pellets ? 1 : Infinity);
          this.ammo += fill; this.reserve -= fill; game.sound.reload(true);
          this.combat.reloaded();
          this.cooldown = Math.max(0.08, this.cooldown);
          if (CONFIG.weapon.pellets && !firing) this.reload(game);
        }
      }
      if (!input.fire && !input.padFire) this.cooldown = Math.max(0, this.cooldown);
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
      const cycle = this.reloadLeft > 0 ? Math.sin(Math.PI * this.reloadLeft / this.reloadTotal) : 0;
      const sway = player.speedMix * Math.sin(player.bob);
      this.group.position.set(0.315 + sway * 0.028 + cycle * 0.075, -0.315 + sway * 0.023 - cycle * 0.29, -0.67 + this.kick * 0.8 + (player.sprinting ? 0.041 : 0));
      this.group.rotation.set(this.kick * 0.24 - cycle * 0.31, -0.045 + cycle * 0.26, -0.013 + player.sway * 0.026 - cycle * 0.62);
      const ads = player.ads;
      this.rifle.setCount((this.savedKills ?? 0) + game.performance.weaponKills);
      this.inspectTime = Math.max(0,this.inspectTime-dt);
      if (this.inspectTime > 0) {
        const mix = Math.min(1, (2 - this.inspectTime) * 5, this.inspectTime * 4);
        this.group.position.x -= .30 * mix;
        this.group.position.y += .22 * mix;
        this.group.rotation.y -= 1.25 * mix;
        this.group.rotation.z += .18 * mix;
      }
      this.group.position.x *= 1-ads;
      this.group.position.y = lerp(this.group.position.y,-this.adsHeight,ads);
      this.group.position.z = lerp(this.group.position.z,-this.adsDistance,ads);
      this.group.rotation.set(this.group.rotation.x*(1-ads),this.group.rotation.y*(1-ads),this.group.rotation.z*(1-ads));
      const playing = game.phase === 'play' && !game.blast;
      const shoulder = playing && player.thirdPerson && !player.aimRequested && !this.inspectTime;
      this.group.visible = playing && !shoulder;
      this.shoulder.body.visible = false;
      if (shoulder) this.shoulder.update(camera,player,game);
      this.rifle.magazine.position.y = -Math.sin(cycle * 1.56) * 0.18;
      this.flashGroup.visible = this.flash > 0;
      if (this.flashGroup.visible) {
        this.flashGroup.scale.setScalar(Math.max(0.55, this.flash * 18 + 0.25) * lerp(1,.55,ads));
        this.flashGroup.rotation.z += 0.42;
      }
    }
  }

  return WeaponSystem;
}
