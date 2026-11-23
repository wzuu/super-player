export function createPlayerClass({ CONFIG, THREE, V3, camera, clamp, lerp, randomRange }) {
  class Player {
    constructor(level, look) {
      this.level = level; this.look = look;
      this.radius = CONFIG.player.radius; this.height = CONFIG.player.height;
      this.box = {};
      this.forward = new V3(); this.visual = new THREE.Euler(0, 0, 0, 'YXZ');
      this.rot = new THREE.Quaternion();
      this.baseFov = camera.fov;
      this.hitDirections = new Float64Array(8);
      this.reset();
    }
    reset() {
      const p = CONFIG.player;
      this.x = this.level.spawn.x; this.z = this.level.spawn.z;
      this.y = this.level.spawn.y;
      this.escaped = false;
      this.crouched = false; this.height = p.height; this.eye = p.eye;
      this.hp = p.health; this.energy = p.stamina;
      this.vy = 0; this.grounded = true; this.tired = false;
      this.sprinting = false; this.lastHurt = -Infinity; this.hurtDelay = 0;
      this.slowUntil = -Infinity; this.slowScale = 1;
      this.damageVignette = 0; this.shake = 0; this.bob = 0; this.sway = 0;
      this.hitDirections.fill(-Infinity);
      this.impactLeft = this.impactStrength = this.impactBearing = 0;
      this.recoil = 0; this.recoilRoll = 0; this.speedMix = 0;
      this.look.rotation.set(this.level.spawnPitch, this.level.spawnYaw, 0, 'YXZ');
      this.positionCamera(0);
    }
    bounds() {
      const b = this.box;
      b.x0 = this.x - this.radius; b.x1 = this.x + this.radius;
      b.z0 = this.z - this.radius; b.z1 = this.z + this.radius;
      b.y0 = this.y; b.y1 = this.y + this.height;
      return b;
    }
    protected(game) {
      return !this.escaped && this.level.inSafeZone(this.x, this.z) && game.time < CONFIG.player.safeTime;
    }
    hurt(amount, game, cooldown = CONFIG.player.hurtCooldown, source, kind = source?.type) {
      if (game.phase !== 'play' || this.hurtDelay > 0 || this.protected(game) || game.kit?.protected(game.time)) return false;
      const feedback = CONFIG.feedback, damage = amount * CONFIG.player.incoming;
      this.hp = Math.max(0, this.hp - damage); this.hurtDelay = cooldown; this.lastHurt = game.time;
      const severity = clamp(damage / CONFIG.player.health * 3, 0, 1);
      this.damageVignette = Math.min(1, this.damageVignette * .5 + .22 + severity + .18 * (1 - this.hp / CONFIG.player.health));
      this.impactLeft = feedback.impactDuration;
      this.impactStrength = .3 + .7 * severity;
      this.impactBearing = NaN;
      if (source && (source.x !== this.x || source.z !== this.z)) {
        this.impactBearing = Math.atan2(source.x - this.x, this.z - source.z);
        const count = this.hitDirections.length;
        const sector = (Math.round(this.impactBearing * count / (2 * Math.PI)) + count) % count;
        if (!game.encounter?.hudOffline && game.time - this.hitDirections[sector] >= feedback.mergeWindow) {
          this.hitDirections[sector] = game.time;
        }
      }
      game.hitStop = Math.max(game.hitStop, feedback.hitStop);
      game.sound.hurt(kind);
      if (this.hp <= 0) game.finish(false);
      return true;
    }
    slow(scale, duration, now) {
      if (now >= this.slowUntil || scale <= this.slowScale) {
        this.slowUntil = now + duration; this.slowScale = scale;
      }
    }
    update(dt, input, game) {
      if (dt <= 0) return;
      const p = CONFIG.player;
      const forward = Number(input.held('KeyW')) - Number(input.held('KeyS'));
      const strafe = Number(input.held('KeyD')) - Number(input.held('KeyA'));
      if (p.crouch) {
        this.crouched = input.held('KeyC') ||
          (this.crouched && this.level.blocked(this.x, this.z, this.y, this.radius, p.height));
        this.height = this.crouched ? p.crouch.height : p.height;
      }
      const impairment = game.time < this.slowUntil ? this.slowScale : 1;
      const shift = input.held('ShiftLeft') || input.held('ShiftRight');
      if (this.tired && this.energy >= p.sprintResume) this.tired = false;
      this.sprinting = impairment > 0 && !this.crouched && shift && (forward > 0 || forward === 0 && strafe !== 0) && !this.tired;
      if (this.sprinting) {
        this.energy = Math.max(0, this.energy - p.sprintUse * dt);
        if (this.energy <= 0) { this.tired = true; this.sprinting = false; }
      } else {
        this.energy = Math.min(p.stamina, this.energy + dt * p.staminaRegen);
      }
      this.forward.set(0, 0, -1).applyQuaternion(this.look.quaternion);
      const norm = Math.max(0.0001, Math.hypot(this.forward.x, this.forward.z));
      const x = this.forward.x / norm, z = this.forward.z / norm;
      const stride = this.sprinting ? p.sprint : p.walk * (forward < 0 ? p.backward : 1) * (this.crouched ? p.crouch.speed : 1);
      const exposure = game.encounter?.moveScale ?? 1;
      const terrain = game.weapon.combat.terrainScale(this.level.movementScale(this.x, this.z, this.y, game)) * game.weapon.combat.moveSpeed;
      const scale = dt * stride * exposure * impairment * terrain / Math.max(1, Math.hypot(forward, strafe));
      const floorBefore = this.level.foot(this.x, this.z, this.y + 0.052, this.radius);
      this.grounded = this.y <= floorBefore + 0.07 && this.vy <= 0;
      if (input.jump) {
        input.jump = false;
        if (this.grounded && !this.crouched && impairment > 0) { this.vy = p.jump; this.grounded = false; }
      }
      const moved = this.level.move(this, (x * forward - z * strafe) * scale, (z * forward + x * strafe) * scale, this.grounded ? p.step : 0.06);
      const floor = this.level.foot(this.x, this.z, this.y + 0.06, this.radius);
      if (this.grounded && this.y <= floor + 0.16) {
        this.y = floor; this.vy = 0;
      } else if (this.y > floor + 0.001 || this.vy > 0) {
        this.vy -= p.gravity * dt;
        const target = Math.max(floor, this.y + this.vy * dt);
        if (this.vy > 0 && this.level.blocked(this.x, this.z, target, this.radius, this.height)) this.vy = -0.25;
        else this.y = target;
        if (this.y <= floor + 0.001) this.vy = 0;
      } else {
        this.y = floor; this.vy = 0;
      }
      if (!this.level.inSafeZone(this.x, this.z)) this.escaped = true;
      const encounter = game.encounter;
      if (encounter?.hearingOnly && this.grounded && moved > 0.003 && !this.crouched) {
        const footstep = game.footstep;
        footstep.x = this.x; footstep.y = this.y; footstep.z = this.z; footstep.at = game.time;
        footstep.radius = this.sprinting ? encounter.runHearing : encounter.walkHearing;
      }
      this.speedMix = lerp(this.speedMix, clamp(moved / Math.max(0.001, dt * p.walk), 0, 1.3), 1 - Math.exp(-14 * dt));
      this.bob += dt * (this.sprinting ? 13.0 : 8.3) * (0.25 + this.speedMix * 0.8);
      this.sway = lerp(this.sway, strafe * this.speedMix, Math.min(1, dt * 9));
      this.hurtDelay = Math.max(0, this.hurtDelay - dt);
      if (game.time - this.lastHurt >= p.healDelay) this.hp = Math.min(p.health, this.hp + dt * p.healRate);
    }
    positionCamera(dt) {
      this.damageVignette *= Math.exp(-dt * 4.8);
      this.shake *= Math.exp(-dt * 12);
      this.recoil *= Math.exp(-dt * 13.3);
      this.recoilRoll *= Math.exp(-dt * 10);
      const wobble = this.speedMix * Math.sin(this.bob * 2) * 0.028;
      const p = CONFIG.player;
      const feedback = CONFIG.feedback;
      this.impactLeft = Math.max(0, this.impactLeft - dt);
      const impact = p.steady ? 0 : (this.impactLeft / feedback.impactDuration) ** 2 * this.impactStrength * feedback.hitShake;
      const fov = this.baseFov - feedback.impactFov * impact;
      if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
      const targetEye = this.crouched ? p.crouch.eye : p.eye;
      this.eye = lerp(this.eye, targetEye, 1 - Math.exp(-dt * 17));
      camera.position.set(this.x, this.y + this.eye + wobble, this.z);
      camera.position.x += Math.sin(this.bob * 0.48) * this.speedMix * 0.012;
      this.visual.set(this.recoil + randomRange(-0.028, 0.028) * this.shake,
        randomRange(-0.021, 0.021) * this.shake,
        this.recoilRoll - this.sway * 0.012 + randomRange(-0.031, 0.031) * this.shake, 'YXZ');
      if (impact && Number.isFinite(this.impactBearing)) {
        const angle = this.impactBearing + this.look.rotation.y;
        this.visual.x -= Math.cos(angle) * feedback.impactAngle * impact;
        this.visual.z -= Math.sin(angle) * feedback.impactAngle * impact;
      }
      if (p.steady) this.visual.set(0,0,0,'YXZ');
      this.rot.setFromEuler(this.visual);
      camera.quaternion.copy(this.look.quaternion).multiply(this.rot);
      camera.updateMatrixWorld(true);
    }
  }

  return Player;
}
