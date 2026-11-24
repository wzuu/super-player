import { distantBody, detailedBody, fitBeastModel, hideTexture } from '@level-kit/beast-visuals.mjs';
import { stageTactic } from '@level-kit/tactics.mjs';
import { SpatialHash } from '@level-kit/world.mjs';
import { resetTargetEffects } from '@level-kit/weapon-perks.mjs';
import { FoeTraits, roleRules, affixTitles } from '@level-kit/foe-traits.mjs';
import { bossDamage, bossStep, createBossFight } from '@level-kit/boss-fight.mjs';
import { stairWaypoint } from '@level-kit/stair-navigation.mjs';

export function createBeastClasses({ CONFIG, THREE, V3, TAU, stamp, shapes, canvasTexture, camera, workColor, brighter, clamp, lerp, randomRange, dynamicMesh, updateMesh, setInstance, mergeGeometries, colors, definition, TEXT, campaignStage }) {
  const tactic=stageTactic(definition?.weaponSkin);
  const { projectileTint, ichor, coreTint } = colors;
  const chargeSegments = 8;

  function beastModel(type) {
    const body = [], emit = [];
    const palette = definition.beastPalettes?.[type] ?? [
      [0x4d5966, 0x738793, 0xa34b61, 0xf98782],
      [0x354459, 0x8b96a1, 0x886958, 0xffad68],
      [0x3c6065, 0x6a8781, 0x779859, 0xbbff65],
      [0x494258, 0x7d788c, 0xaa526d, 0xff658e],
    ][type];
    function piece(which, shape, tint, x, y, z, w, h, d, pitch = 0, roll = 0) {
      const geo = shape.index ? shape.toNonIndexed() : shape.clone();
      stamp.position.set(x, y, z); stamp.scale.set(w, h, d); stamp.rotation.set(pitch, 0, roll); stamp.updateMatrix();
      geo.applyMatrix4(stamp.matrix);
      const rgb = new THREE.Color(tint), array = new Float32Array(geo.attributes.position.count * 3);
      for (let i = 0; i < array.length; i += 3) { array[i] = rgb.r; array[i + 1] = rgb.g; array[i + 2] = rgb.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(array, 3));
      which.push(geo);
    }
    const unit = new THREE.IcosahedronGeometry(1, 0), tooth = new THREE.ConeGeometry(0.5, 1, 4);
    const rock = (t, ...v) => piece(body, unit, palette[t], ...v);
    const block = (t, ...v) => piece(body, shapes.box, palette[t], ...v);
    const spike = (t, ...v) => piece(body, tooth, palette[t], ...v);
    const glow = (...v) => piece(emit, unit, palette[3], ...v);
    // 模型均面朝正 z，共用几何体与单一实例矩阵。各类按轮廓和发光色区分。
    if (type === 0) {
      rock(0, 0, 0.56, -0.10, 0.33, 0.25, 0.51);
      rock(1, 0, 0.68, 0.25, 0.34, 0.28, 0.28);
      rock(0, 0, 0.72, 0.56, 0.25, 0.25, 0.28);
      block(2, 0, 0.61, 0.72, 0.28, 0.12, 0.26, -0.15);
      spike(1, 0, 0.62, -0.65, 0.18, 0.48, 0.15, -1.0);
      for (const sign of [-1, 1]) {
        block(0, sign * 0.22, 0.25, -0.34, 0.145, 0.43, 0.16, -0.32);
        block(1, sign * 0.22, 0.27, 0.23, 0.13, 0.45, 0.17, 0.19);
        spike(2, sign * 0.16, 0.96, 0.43, 0.16, 0.25, 0.15, -0.35, sign * 0.22);
        glow(sign * 0.158, 0.766, 0.698, 0.05, 0.034, 0.032);
      }
    } else if (type === 1) {
      rock(0, 0, 1.20, -0.05, 0.49, 0.69, 0.46);
      block(1, 0, 1.43, 0.32, 0.81, 0.47, 0.41, 0.24);
      rock(2, 0, 1.4, 0.54, 0.31, 0.36, 0.21);
      for (const side of [-1, 1]) {
        rock(1, side * 0.39, 1.36, 0.20, 0.31, 0.38, 0.37);
        block(0, side * 0.43, 0.79, 0.25, 0.26, 0.67, 0.30, -0.24);
        block(2, side * 0.43, 0.51, 0.43, 0.28, 0.27, 0.38);
        block(0, side * 0.26, 0.37, -0.21, 0.28, 0.65, 0.36, 0.20);
        spike(1, side * 0.41, 1.70, 0.51, 0.18, 0.43, 0.17, 0.8, side * 0.28);
        glow(side * 0.14, 1.45, 0.717, 0.071, 0.047, 0.034);
      }
      spike(1, 0, 1.88, -0.05, 0.26, 0.34, 0.22, -0.5);
    } else if (type === 2) {
      rock(0, 0, 0.91, -0.10, 0.42, 0.51, 0.43);
      rock(2, 0, 1.06, -0.30, 0.40, 0.46, 0.28);
      rock(1, 0, 1.38, 0.24, 0.35, 0.32, 0.30);
      rock(2, 0, 1.25, 0.49, 0.24, 0.14, 0.19);
      for (const side of [-1, 1]) {
        block(0, side * 0.30, 0.39, -0.22, 0.18, 0.67, 0.23, -0.23, side * 0.25);
        rock(1, side * 0.37, 0.63, 0.15, 0.15, 0.48, 0.15, -0.43);
        spike(2, side * 0.22, 1.64, -0.22, 0.20, 0.31, 0.18, -0.25);
        glow(side * 0.16, 1.46, 0.443, 0.062, 0.052, 0.040);
        glow(side * 0.33, 1.09, -0.36, 0.14, 0.15, 0.095);
      }
      glow(0, 1.28, 0.634, 0.064, 0.03, 0.028);
    } else {
      rock(0, 0, 2.13, -0.15, 0.82, 1.26, 0.69);
      rock(1, 0, 2.68, 0.22, 0.72, 0.61, 0.74);
      rock(0, 0, 2.79, 0.70, 0.59, 0.54, 0.48);
      block(2, 0, 2.49, 1.0, 0.69, 0.24, 0.32);
      glow(0, 1.97, 0.43, 0.28, 0.42, 0.14);
      for (const side of [-1, 1]) {
        rock(1, side * 0.76, 2.43, 0.25, 0.51, 0.61, 0.62);
        block(0, side * 0.99, 1.50, 0.57, 0.43, 1.14, 0.58, 0.28, side * 0.10);
        rock(2, side * 1.00, 1.10, 0.86, 0.38, 0.42, 0.48);
        block(0, side * 0.46, 0.64, -0.38, 0.47, 1.07, 0.54, -0.33);
        rock(1, side * 0.46, 0.20, -0.19, 0.34, 0.24, 0.54);
        spike(2, side * 0.64, 3.28, 0.18, 0.30, 0.95, 0.32, -0.47, side * -0.30);
        spike(1, side * 0.32, 3.53, -0.27, 0.29, 0.78, 0.26, -0.38, side * -0.25);
        glow(side * 0.29, 2.91, 1.02, 0.14, 0.115, 0.074);
        glow(side * 0.57, 2.40, 0.64, 0.11, 0.24, 0.073);
      }
    }
    const models = [mergeGeometries(body), mergeGeometries(emit)];
    for (const g of body.concat(emit)) g.dispose();
    unit.dispose(); tooth.dispose();
    return models;
  }

  class BeastAI {
    constructor(level, nav, beasts) {
      this.level = level; this.nav = nav; this.beasts = beasts;
      this.from = new V3(); this.dir = new V3(); this.near = [];
    }

    patrol(b) {
      if (b.patrol <= 0 || b.stuck > 0.5) {
        const a = randomRange(0, TAU);
        b.fx = Math.sin(a); b.fz = Math.cos(a); b.patrol = randomRange(0.8, 2.6);
      }
      b.dx = b.fx * 0.23; b.dz = b.fz * 0.23;
      if (b.type === 3 && Math.hypot(b.x - this.level.bossAnchor.x, b.z - this.level.bossAnchor.z) > 6) {
        const angle = Math.atan2(this.level.bossSpawn.x - b.x, this.level.bossSpawn.z - b.z);
        b.dx = Math.sin(angle) * 0.24; b.dz = Math.cos(angle) * 0.24;
      }
    }

    chargeWindup(b, p, game, fx, fz) {
      const confusion = b.statusEffects.get('confused');
      const yaw = Math.atan2(fx, fz) + (confusion?.angle ?? 0);
      b.fx = Math.sin(yaw); b.fz = Math.cos(yaw);
      b.mode = 'windup'; b.phaseTime = CONFIG.feedback.chargeWindup;
      const stats = CONFIG.beasts.types[b.type];
      const groundScale = this.level.movementScale(b.x, b.z, b.y, game);
      const length = stats.chargeSpeed * stats.chargeTime * groundScale *
        (game.encounter?.beastSpeedScale ?? 1) * b.perkMoveScale;
      const step = length / chargeSegments;
      b.chargeMarkLength = step;
      b.chargeMarkCount = 0;
      const heights = b.chargeHeights ??= new Float32Array(chargeSegments + 1);
      heights[0] = b.y;
      for (let i = 1; i <= chargeSegments; i++) {
        const x = b.x + b.fx * step * i, z = b.z + b.fz * step * i;
        const floor = this.level.surface(x, z, heights[i-1] + .47);
        if (Math.abs(floor - heights[i-1]) > .47 || this.level.blocked(x, z, floor, b.radius, b.height) ||
            !this.level.canEnter(b, x, z, floor)) break;
        heights[i] = floor;
        b.chargeMarkCount++;
      }
      game.sound.spatialCue(b, p, 'charge');
    }
    listen(b, p, game) {
      const rules = game.encounter, step = game.footstep;
      const heardShot = game.time - game.shotAt < 0.35 &&
        Math.hypot(b.x - game.shotX, (b.y - game.shotY) * 2, b.z - game.shotZ) < rules.shotHearing * game.shotHearingScale;
      const heardStep = game.time - step.at < 0.28 &&
        Math.hypot(b.x - step.x, (b.y - step.y) * 2, b.z - step.z) < step.radius;
      if (heardShot || heardStep) {
        const shot = heardShot && (!heardStep || game.shotAt >= step.at);
        const at = shot ? game.shotAt : step.at;
        if (at > b.heardAt) {
          b.heardAt = at;
          b.heardX = shot ? game.shotX : step.x;
          b.heardY = shot ? game.shotY : step.y;
          b.heardZ = shot ? game.shotZ : step.z;
          b.alert = rules.memory;
        }
      }

      // 沙暴中只沿最后一次听到的位置搜索。贴身碰撞仍可能暴露玩家。
      const type = CONFIG.beasts.types[b.type];
      const contact = b.type !== 2 && Math.hypot(p.x - b.x, p.z - b.z) < Math.min(type.reach, 1.40) &&
        Math.abs(p.y - b.y) < 0.76;
      if (!contact && b.alert <= 0) { this.patrol(b); return; }
      const x = contact ? p.x : b.heardX, y = contact ? p.y : b.heardY, z = contact ? p.z : b.heardZ;
      const dx = x - b.x, dz = z - b.z, distance = Math.max(0.01, Math.hypot(dx, dz));
      this.from.set(b.x, b.y + type.height * 0.65, b.z);
      const rayLength = this.dir.set(dx, y + 0.72 - this.from.y, dz).length();
      const clear = this.level.visible(this.from, this.dir.divideScalar(Math.max(0.01, rayLength)), rayLength);
      if (clear && b.cooldown <= 0 && b.mode === 'move' && !p.protected(game)) {
        const charge = b.type === 1 && distance > 2.2 && distance < 12 && Math.abs(y - b.y) < 1.1;
        const shot = b.type === 2 && distance > 3.4 && distance < type.reach;
        if (contact || (game.time - b.heardAt < 0.37 && (charge || shot))) {
          if (charge) this.chargeWindup(b, p, game, dx/distance, dz/distance);
          else {
            b.mode = 'windup'; b.phaseTime = shot ? 0.45 : type.windup ?? 0.24;
            b.fx = dx / distance; b.fz = dz / distance;
            b.chargeMarkLength = 0;
          }
          b.aim.x = x; b.aim.y = y; b.aim.z = z;
          return;
        }
      }
      if (!contact && distance < 0.65) {
        b.alert = 0; this.patrol(b); return;
      }
      const route = this.nav.fields[b.type];
      const point = route.target;
      if ((!clear || b.stuck > 0.24) && point >= 0 && Math.hypot(this.nav.x(point) - x, this.nav.z(point) - z) < this.nav.cell * 2) {
        const next = route.next(b.x, b.z);
        if (next !== this.nav.index(b.x, b.z)) {
          const nx = this.nav.x(next) - b.x, nz = this.nav.z(next) - b.z;
          const n = Math.max(0.05, Math.hypot(nx, nz));
          b.dx = nx / n; b.dz = nz / n;
          return;
        }
      }
      const flank = b.type === 0 && distance > 3.5 ? b.lane * Math.min(0.52, distance * 0.035) : 0;
      b.dx = (dx - dz * flank) / distance; b.dz = (dz + dx * flank) / distance;
    }

    perceive(b, p, game) {
      if (game.encounter?.hearingOnly) { this.listen(b, p, game); return; }
      const type = CONFIG.beasts.types[b.type];
      const settings = CONFIG.beasts;
      const dx = p.x - b.x, dz = p.z - b.z;
      const distance = Math.max(0.01, Math.hypot(dx, dz));
      const towardX = dx / distance, towardZ = dz / distance;
      this.from.set(b.x, b.y + type.height * 0.65, b.z);
      const lineDistance = this.dir.set(dx, p.y + 1.1 - this.from.y, dz).length();
      this.dir.divideScalar(Math.max(0.01, lineDistance));
      const inSight = distance < settings.sight && (b.alert > 0 || distance < 4.5 || towardX * b.fx + towardZ * b.fz > settings.sightDot);
      const sees = inSight && this.level.visible(this.from, this.dir, lineDistance);
      const hearing = game.time - game.shotAt < 0.35 &&
        Math.hypot(b.x - game.shotX, b.z - game.shotZ) < CONFIG.weapon.hearingRadius * game.shotHearingScale;
      if (sees || hearing) b.alert = settings.memory;
      if (b.alert <= 0) { this.patrol(b); return; }

      b.playerVisible = sees;
      const stair = stairWaypoint(b,p,this.level,this.nav);
      if (stair && !(b.type===2 && Math.hypot(stair.x-b.x,stair.z-b.z)<1.1 && sees && distance<type.reach && b.cooldown<=0)) {
        const sx=stair.x-b.x, sz=stair.z-b.z, d=Math.hypot(sx,sz);
        b.dx=d>.18 ? sx/d : 0;b.dz=d>.18 ? sz/d : 0;
        return;
      }
      const yDiff = Math.abs(p.y - b.y);
      if (sees && b.cooldown <= 0 && b.mode === 'move' && !p.protected(game)) {
        if (b.type === 2 && distance < type.reach && distance > 3.4) {
          b.mode = 'windup'; b.phaseTime = 0.45; b.fx = towardX; b.fz = towardZ; return;
        }
        if (b.type === 1 && distance > 2.2 && distance < 12 && yDiff < 1.1) {
          this.chargeWindup(b, p, game, towardX, towardZ); return;
        }
        if (b.type !== 2 && distance < type.reach + 0.16 && yDiff < (b.type === 3 ? 1.6 : 0.95)) {
          b.chargeMarkLength = 0;
          b.mode = 'windup'; b.phaseTime = type.windup ?? 0.24; b.fx = towardX; b.fz = towardZ; return;
        }
      }

      let aimX = towardX, aimZ = towardZ, stride = 1;
      const waypoint = definition.chaseWaypoint?.(b, p, this.level);
      if (waypoint) {
        aimX = waypoint.x - b.x; aimZ = waypoint.z - b.z;
      } else if (!sees || b.stuck > 0.24) {
        const next = this.nav.fields[b.type].next(b.x, b.z);
        if (next !== this.nav.index(b.x, b.z)) {
          aimX = this.nav.x(next) - b.x; aimZ = this.nav.z(next) - b.z;
        }
      } else if (b.type === 2 && distance < 8.5) {
        aimX = -towardX - towardZ * b.lane * 0.48;
        aimZ = -towardZ + towardX * b.lane * 0.48;
        stride = 0.75;
      } else if (b.type === 2 && distance < 14.4) {
        aimX = -towardZ * b.lane; aimZ = towardX * b.lane; stride = 0.47;
      } else if (b.type === 0 && distance > 3.5 && distance < 20) {
        // 两侧领跑的犬群绕向玩家的侧翼。
        const flank = b.lane * Math.min(0.72, (distance - 3.5) * 0.09);
        aimX -= towardZ * flank; aimZ += towardX * flank;
      }
      const length = Math.max(0.05, Math.hypot(aimX, aimZ));
      b.dx = aimX / length * stride; b.dz = aimZ / length * stride;
    }

    update(b, p, game, dt, frame) {
      const type = CONFIG.beasts.types[b.type];
      const damage = type.damage * (game.encounter?.beastDamageScale ?? 1) * (game.variation?.damage ?? 1);
      b.flash = Math.max(0, b.flash - dt);
      b.stun = Math.max(0, b.stun - dt);
      b.cooldown = Math.max(0, b.cooldown - dt);
      b.patrol -= dt; b.alert -= dt; b.phaseTime -= dt;
      const distance = Math.hypot(p.x - b.x, p.z - b.z);
      const hearingOnly = Boolean(game.encounter?.hearingOnly);
      const justChanged = hearingOnly !== b.hearingOnly;
      if (justChanged) {
        b.hearingOnly = hearingOnly; b.heardAt = -Infinity; b.alert = 0;
        if (b.mode === 'windup') b.mode = 'move';
      }
      if (b.type === 3 && !b.rage && (b.fight ? b.fight.stage===2 : b.hp <= type.hp * 0.5)) {
        b.rage = true;
        game.sound.stageEvent?.('danger',game,b);
        if (!b.fight) b.summon = type.summonCount;
        if (!hearingOnly) b.alert = CONFIG.beasts.memory + 6;
        this.from.set(b.x, b.y + 2, b.z);
        game.effects.spray(this.from, coreTint, 47, 7.5, 0.14, 'mist');
        game.sound.tone(77, 31, 0.54, 0.50, 'sawtooth');
        definition.onBossRage?.(b, game, { THREE, brighter });
        game.ui.notify(TEXT.rage, 2.1);
      }

      if (b.fight && bossStep(b,game,p,this.level)) return;
      if (Math.abs(b.perkPushX) + Math.abs(b.perkPushZ) > .05) {
        this.level.move(b, b.perkPushX * dt, b.perkPushZ * dt, .47);
        const decay = Math.exp(-7 * dt);
        b.perkPushX *= decay; b.perkPushZ *= decay;
      }
      if (b.perkMoveScale === 0) {
        const hover = b.statusEffects.get('hover');
        if (hover) {
          hover.baseY ??= b.y;
          const y = hover.baseY + .75 * Math.sin(Math.PI * Math.min(1, hover.until - game.time));
          if (!this.level.blocked(b.x, b.z, y, b.radius, b.height)) b.y = y;
        }
        b.stride = 0;
        return;
      }
      if (game.field?.huntStep(b,game,dt) || game.story?.stepBeast(b,game,dt) || game.encounter?.stepScriptedBeast?.(b, game, dt)) return;
      const confusion = b.statusEffects.get('confused');
      let x = 0, z = 0;
      if (b.stun > 0) {
        x = b.knockX; z = b.knockZ;
        b.knockX *= Math.exp(-12 * dt); b.knockZ *= Math.exp(-12 * dt);
      } else if (b.mode === 'charge') {
        x = b.fx * type.chargeSpeed; z = b.fz * type.chargeSpeed;
        if (b.phaseTime <= 0) { b.mode = 'move'; b.cooldown = type.recovery; }
        if (distance < type.reach && Math.abs(p.y - b.y) < 1.32 && !b.chargeHit) {
          this.from.set(b.x, b.y + 0.8, b.z);
          const gap = this.dir.set(p.x - b.x, p.y + 0.7 - this.from.y, p.z - b.z).length();
          if ((!confusion || b.fx * (p.x - b.x) + b.fz * (p.z - b.z) > distance * .85) &&
              this.level.visible(this.from, this.dir.divideScalar(Math.max(0.001, gap)), gap)) {
            p.hurt(damage, game, undefined, b); b.chargeHit = true;
          }
        }
      } else if (b.mode === 'windup') {
        if (b.phaseTime <= 0) {
          if (b.type === 1 && b.chargeMarkLength > 0) {
            b.mode = 'charge'; b.phaseTime = type.chargeTime; b.chargeHit = false;
            x = b.fx * type.chargeSpeed; z = b.fz * type.chargeSpeed;
          } else {
            if (b.type === 2) {
              if (!p.protected(game)) {
                const aim = hearingOnly ? b.aim : p;
                if (confusion) {
                  const angle = Math.atan2(aim.x - b.x, aim.z - b.z) + confusion.angle;
                  this.from.set(b.x + Math.sin(angle) * distance, aim.y, b.z + Math.cos(angle) * distance);
                }
                game.projectiles.launch(b, confusion ? this.from : aim);
                if (distance < 17) game.sound.hiss(0.25, 2100, 490, 0.14);
              }
            } else if ((!confusion || Math.cos(confusion.angle) > .85) && distance < type.reach + 0.2 && Math.abs(p.y - b.y) < (b.type === 3 ? 1.65 : 1.02)) {
              this.from.set(b.x, b.y + b.height * 0.55, b.z);
              const length = this.dir.set(p.x - b.x, p.y + 0.8 - this.from.y, p.z - b.z).length();
              if (this.level.visible(this.from, this.dir.divideScalar(Math.max(0.001, length)), length)) p.hurt(b.rage ? damage * 1.24 : damage, game, undefined, b);
            }
            b.mode = 'move'; b.cooldown = type.recovery * (b.rage ? 0.68 : 1);
          }
        }
      } else {
        const period = distance > CONFIG.beasts.farDistance ? CONFIG.beasts.farUpdateFrames : 3;
        if (justChanged || (frame + b.id) % period === 0) this.perceive(b, p, game);
        if (b.mode === 'move') {
          const range = b.radius + 1.10;
          const nearby = this.beasts.hash.query(b.x - range, b.z - range, b.x + range, b.z + range, this.near);
          let separateX = 0, separateZ = 0;
          for (const other of nearby) {
            if (other === b || Math.abs(other.y - b.y) > 1.3) continue;
            const dx = b.x - other.x, dz = b.z - other.z;
            const limit = b.radius + other.radius + 0.18;
            const separation = dx * dx + dz * dz;
            if (separation > limit * limit) continue;
            if (separation < 0.0001) { separateX += b.lane * 0.37; continue; }
            const d = Math.sqrt(separation), strength = (limit - d) / limit / d;
            separateX += dx * strength; separateZ += dz * strength;
          }
          const speed = b.rage ? type.rageSpeed : type.speed;
          x = (b.dx + separateX * CONFIG.beasts.separation) * speed;
          z = (b.dz + separateZ * CONFIG.beasts.separation) * speed;
          const turn = b.playerVisible && !hearingOnly && !b.stairLeg ? tactic?.(b,game,distance) : 0;
          if (turn) {
            const oldX=x, cos=Math.cos(turn), sin=Math.sin(turn);
            x=oldX*cos-z*sin; z=oldX*sin+z*cos;
          }
          const magnitude = Math.hypot(x, z);
          if (magnitude > speed) { x *= speed / magnitude; z *= speed / magnitude; }
          if (magnitude > 0.24) {
            b.fx = lerp(b.fx, x / Math.min(magnitude, speed), Math.min(1, 10 * dt));
            b.fz = lerp(b.fz, z / Math.min(magnitude, speed), Math.min(1, 10 * dt));
          }
        }
      }
      if (p.protected(game) && this.level.inSafeZone(b.x + x * dt, b.z + z * dt, 2.6) &&
          !this.level.inSafeZone(b.x, b.z, 2.6)) {
        x = 0; z = 0;
      }
      const terrain = this.level.movementScale(b.x, b.z, b.y, game) * (game.encounter?.beastSpeedScale ?? 1) * b.traitSpeed;
      x *= terrain * b.perkMoveScale * (game.variation?.speed ?? 1); z *= terrain * b.perkMoveScale * (game.variation?.speed ?? 1);
      const moved = this.level.move(b, x * dt, z * dt, 0.47);
      const floor = this.level.foot(b.x, b.z, b.y + 0.27, b.radius);
      if (b.statusEffects.has('grounded')) {
        b.y = Math.max(floor, b.y - dt * 9); b.surfaceRoll *= Math.exp(-10 * dt);
      } else if (definition.beastSurface) definition.beastSurface(b, p, this.level, floor, dt, game);
      else b.y = Math.max(floor, b.y - dt * 8);
      b.stride = Math.hypot(x, z);
      if (b.stride > 0.9 && moved < dt * b.stride * 0.22) {
        b.stuck += dt;
        if (b.mode === 'charge') { b.mode = 'move'; b.stun = 0.95; b.cooldown = 2.0; b.flash = 0.16; game.sound.stageEvent?.('impact',game,b); }
      } else {
        b.stuck = Math.max(0, b.stuck - dt * 2);
      }
    }
  }

  class BeastManager {
    constructor(level, nav) {
      this.level = level; this.nav = nav;
      this.hash = new SpatialHash(CONFIG.map.hash);
      this.pool = Array.from({ length: CONFIG.beasts.capacity }, (_, id) => ({ id, active: false, mark: 0, aim: new V3() }));
      this.air = new V3(); this.line = new V3();
      const modelContext = { THREE, shapes, mergeGeometries, CONFIG };
      const appearance=CONFIG.beasts.appearance, textures=new Map();
      const surfaces=appearance.surfaces[definition.weaponSkin] ?? [];
      this.corpses=Array.from({length:appearance.corpses},()=>({until:0}));
      this.nextCorpse=0;
      const createBatch = ([body, eye], capacity, surface) => {
        if (surface && !textures.has(surface)) textures.set(surface,hideTexture(canvasTexture,surface));
        const texture=textures.get(surface);
        const material=surface ? new THREE.MeshPhongMaterial({
          vertexColors:true,map:texture,specularMap:texture,
          specular:surface==='metal'?0x565e69:0x241f1d,shininess:surface==='metal'?32:8,
        }) : new THREE.MeshLambertMaterial({vertexColors:true});
        // 把受击强度作为实例属性，保留原本的顶点色和各部位区分。
        const flash = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
        body.setAttribute('beastFlash', flash);
        material.onBeforeCompile = shader => {
          shader.vertexShader = 'attribute float beastFlash; varying float vBeastFlash;\n' + shader.vertexShader
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n vBeastFlash = beastFlash;');
          shader.fragmentShader = 'varying float vBeastFlash;\n' + shader.fragmentShader
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
              float edge = 1.0 - abs(dot(normal, normalize(vViewPosition)));
              totalEmissiveRadiance += vec3(1.25) * vBeastFlash
                + diffuseColor.rgb * edge * edge * ${Number(appearance.rim).toFixed(4)};`);
        };
        const eyes = new THREE.MeshBasicMaterial({ vertexColors: true, fog:false });
        return [dynamicMesh(body, material, capacity), dynamicMesh(eye, eyes, capacity)];
      };
      this.modelBatches=[];
      this.footprints=[];
      const far=[];
      CONFIG.beasts.types.forEach((stats,type)=>{
        const [body,eye]=definition.buildBeastModel?.(type,modelContext) ?? beastModel(type);
        const capacity=(type===3 ? 1 : this.pool.length)+appearance.corpses;
        const rage = type === 3 ? definition.buildRageModel?.(modelContext) ?? [body,eye.clone()] : null;
        const nearBody = detailedBody(modelContext,body,type,appearance);
        const farBody = type !== 3 ? distantBody(THREE,body,appearance.gridCells) : null;
        this.footprints.push(fitBeastModel(nearBody,eye,farBody,stats,appearance.scale[type][0]));
        this.modelBatches.push(createBatch([nearBody,eye],capacity,surfaces[type] ?? 'hide'));
        if(farBody) far.push(createBatch([farBody,eye],capacity,false));
        if(type===3){
          const [rageBody,rageEye]=rage;
          this.rageBatch=this.modelBatches.length;
          const detailed = detailedBody(modelContext,rageBody,type,appearance,true);
          this.footprints.push(fitBeastModel(detailed,rageEye,null,stats,appearance.scale[type][0]));
          this.modelBatches.push(createBatch([detailed,rageEye],capacity,surfaces[type] ?? 'hide'));
          if(rageBody!==body) rageBody.dispose();
        }
        body.dispose();
      });
      this.farStart=this.modelBatches.length;
      this.modelBatches.push(...far);
      this.chargeMarks = dynamicMesh(shapes.box,
        new THREE.MeshBasicMaterial({color: 0xffa447, fog:false, toneMapped:false}), this.pool.length * chargeSegments);
      this.healthBG = dynamicMesh(shapes.plane, new THREE.MeshBasicMaterial({ color: 0x101523, side: THREE.DoubleSide }), this.pool.length);
      this.healthFG = dynamicMesh(shapes.plane, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), this.pool.length);
      const shadowMap = canvasTexture(32, 32, ctx => {
        const fade = ctx.createRadialGradient(16,16,1,16,16,16);
        fade.addColorStop(0,'rgba(6,9,13,.68)'); fade.addColorStop(1,'rgba(6,9,13,0)');
        ctx.fillStyle = fade; ctx.fillRect(0,0,32,32);
      });
      this.shadows = dynamicMesh(shapes.plane, new THREE.MeshBasicMaterial({
        map:shadowMap, transparent:true, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-1,
      }), this.pool.length);
      this.ai = new BeastAI(level, nav, this);
      this.traits = new FoeTraits(campaignStage,CONFIG);
      this.bossTint=coreTint;
      this.bossMarks=dynamicMesh(new THREE.RingGeometry(.78,1,24),
        new THREE.MeshBasicMaterial({side:THREE.DoubleSide,depthWrite:false}),3);
      const badges = {
        shield: new THREE.TorusGeometry(.5,.085,4,12), brood: new THREE.ConeGeometry(.5,1,5),
        volatile: new THREE.IcosahedronGeometry(.5,0), elite: new THREE.OctahedronGeometry(.5),
      };
      this.badges = Object.fromEntries(Object.entries(badges).map(([name,geometry])=>[name,
        dynamicMesh(geometry,new THREE.MeshBasicMaterial({fog:false}),this.pool.length)]));
      this.counts = new Uint16Array(this.modelBatches.length);
    }
    bodyBounds(b) {
      const footprint = this.footprints[b.rage && b.type===3 ? this.rageBatch : b.type];
      const sin = Math.abs(Math.sin(b.yaw)), cos = Math.abs(Math.cos(b.yaw));
      const x = (footprint.x*cos + footprint.z*sin)*b.scale, z = (footprint.z*cos + footprint.x*sin)*b.scale;
      b.x0 = b.x - x; b.x1 = b.x + x;
      b.z0 = b.z - z; b.z1 = b.z + z;
      b.y0 = b.y + 0.025; b.y1 = b.y + b.height;
    }
    reset(player, game) {
      this.currentGame=game;
      this.traits.splits.length=0;
      this.live = 0; this.boss = null; this.frame = 0; this.spawnTime = 0; this.navTime = 0;
      for (const b of this.pool) b.active = false;
      for (const corpse of this.corpses) corpse.until=0;
      this.nav.rebuild(player.x, player.z); this.hash.clear();
      if (game?.training?.kind === 'tutorial' || game?.objective.mode==='hunt' || game?.story?.managed) {this.render();return;}
      const anchor = definition.initialPopulationAnchor;
      if (anchor) this.nav.rebuild(...anchor);
      const spawn = this.level.bossSpawn;
      if (!game?.training) this.spawn(3, spawn.x, spawn.z, spawn.y, 1);
      for (let i = 1; i < Math.min(CONFIG.beasts.population, this.pool.length); i++) {
        const type = this.randomType(), site = this.spawnSite(type, player, true, null);
        if (site !== -1) this.spawnRegular(type, this.nav.x(site), this.nav.z(site));
      }
      if (anchor) this.nav.rebuild(player.x, player.z);
      this.refreshHash(); this.render();
    }
    randomType() {
      const r = Math.random();
      return r < 0.66 ? 0 : r < 0.86 ? 1 : 2;
    }
    spawnRegular(type,x,z,y,elite=false) {
      const b=this.spawn(type,x,z,y);
      if (this.currentGame && b && !this.currentGame.training) {
        const patrol=this.currentGame.patrolRemaining>0;
        this.traits.assign(b,this.currentGame,elite||patrol);
        if(patrol && b.affixes) this.currentGame.patrolRemaining--;
      }
      return b;
    }
    spawn(type, x, z, y = this.level.base(x, z), angle = randomRange(0, TAU)) {
      const b = this.pool.find(item => !item.active);
      if (!b) return null;
      const stats = CONFIG.beasts.types[type];
      if (this.level.blocked(x, z, y, stats.radius, stats.height)) return null;
      Object.assign(b, {
        active: true, storyWave:null, droneRaider:false, droneAttack:0, climbRoute:null, stairLeg:null,
        farLOD:false, x, y, z, type, hp: stats.hp, radius: stats.radius, height: stats.height,
        maxHP:stats.hp,scale:1,traitSpeed:1,role:null,affixes:null,shield:0,charging:false,fight:null,hunted:false,fieldGroup:null,
        traitAt:(this.currentGame?.time ?? 0)+4,trailAt:0,broods:0,
        fx: Math.sin(angle), fz: Math.cos(angle), dx: Math.sin(angle) * 0.11, dz: Math.cos(angle) * 0.11,
        lane: Math.random() > 0.5 ? 1 : -1, yaw: angle, blink: randomRange(0, TAU), stride: 0, alert: 0,
        mode: 'move', phaseTime: 0, cooldown: randomRange(0.5, 1.3), stun: 0, flash: 0, patrol: randomRange(0.5, 2),
        knockX: 0, knockZ: 0, stuck: 0, rage: false, summon: 0, playerVisible: false,
        surfaceRoll: 0, clinging: false, surfaceSide: 1,
        hearingOnly: false, heardAt: -Infinity, heardX: x, heardY: y, heardZ: z, reinforcement: false,
      });
      resetTargetEffects(b);
      this.bodyBounds(b);
      this.live++;
      if (type === 3) {
        this.boss = b;
        if (campaignStage && !this.currentGame?.training) createBossFight(b,CONFIG,campaignStage);
      }
      return b;
    }
    refreshHash() {
      this.hash.clear();
      for (const b of this.pool) {
        if (!b.active) continue;
        this.bodyBounds(b);
        this.hash.insert(b);
      }
    }
    visibleToPlayer(x, y, z, viewDirection) {
      const dx = x - camera.position.x, dz = z - camera.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.001 && (viewDirection.x * dx + viewDirection.z * dz) / d <= 0.30) return false;
      const length = this.line.set(dx, y + 0.80 - camera.position.y, dz).length();
      return this.level.visible(camera.position, this.line.divideScalar(Math.max(length, 0.01)), length);
    }
    spawnSite(type, player, initial, viewDirection) {
      const sites = this.level.sites, cursor = Math.floor(Math.random() * sites.length);
      const stats = CONFIG.beasts.types[type];
      for (let k = 0; k < sites.length; k++) {
        const i = sites[(cursor + k) % sites.length];
        if (this.nav.fields[type].dist[i] < 0) continue;
        const x = this.nav.x(i), z = this.nav.z(i);
        const dx = x - player.x, dz = z - player.z, d = Math.hypot(dx, dz);
        if (d < CONFIG.beasts.spawnDistance || (initial && d > 76) || this.level.inSafeZone(x, z, 3)) continue;
        if (this.level.blocked(x, z, this.level.base(x, z), stats.radius, stats.height)) continue;
        let occupied = false;
        for (const b of this.pool) {
          if (b.active && (b.x - x) ** 2 + (b.z - z) ** 2 < (initial ? 1.65 : 2.3) ** 2) { occupied = true; break; }
        }
        if (occupied) continue;
        if (viewDirection && this.visibleToPlayer(x, this.level.base(x, z), z, viewDirection)) continue;
        return i;
      }
      return -1;
    }
    retire(b, game, source = 'environment', hit = null) {
      if (!b.active) return false;
      b.active = false;
      this.live--;
      game.kills++;
      game.performance.kill(game, b, source, hit);
      return true;
    }
    eject(b, game) {
      return b.type !== 3 && this.retire(b, game);
    }
    dropHeight(b) { return definition.beastDropHeight?.(b, this.level) ?? b.y; }
    takeHit(b, damage, at, dir, game, hit = null, source = hit?.electric ? 'electric' : hit ? 'weapon' : 'environment') {
      if (!b.active) return false;
      const type = b.type;
      b.flash = 0.115; b.stun = type === 3 ? 0.065 : 0.115;
      if(type===1 && definition.weaponSkin==='brass-factory') game.sound.stageEvent('impact',game,b);
      b.knockX = dir.x * (type === 3 ? 0.8 : 3.7); b.knockZ = dir.z * (type === 3 ? 0.8 : 3.7);
      if (!game.encounter?.hearingOnly) b.alert = CONFIG.beasts.memory;
      if (!hit?.quietImpact) game.effects.impact(at, hit?.pellet, ichor);
      return this.damage(b, damage, game, source, hit);
    }
    damage(b, amount, game, source = 'environment', hit = null) {
      if (game.phase !== 'play' || !b.active || !(amount > 0)) return false;
      const type = b.type, combat = game.weapon.combat;
      amount = this.traits.damage(b,amount,game,source,hit);
      amount *= combat.damageScale(b,source,game.time);
      const applied = Math.min(b.hp,b.fight ? bossDamage(b,amount,game,hit) : amount);
      b.hp -= applied;
      if (hit?.lifeSteal) game.player.hp = Math.min(CONFIG.player.health, game.player.hp + applied * hit.lifeSteal);
      if (b.hp > 0) return false;
      this.retire(b, game, source, hit);
      game.field?.defeated(b,game);
      const dropY = this.dropHeight(b);
      this.traits.defeated(b,game);
      if (source === 'weapon' || source === 'electric') combat.onKill(b, hit, game);
      if (type === 3) {
        game.bossDead = true; this.boss = null;
        const site = this.level.pickupSite(b.x,b.z,dropY,game.player,this.nav);
        game.pickups.add('core', site.x, site.z, site.y + 0.18, TEXT.keyItem, 0);
        game.ui.notify(TEXT.bossDefeated, 2.6);
      }
      if (!definition.onBeastDefeated?.(b, game, source)) {
        // 无人机残骸等由关卡接管死亡表现，普通凶兽才进入倒地池。
        const corpse = this.corpses[this.nextCorpse];
        this.nextCorpse = (this.nextCorpse + 1) % this.corpses.length;
        Object.assign(corpse, {
          x: b.x, y: b.y, z: b.z, yaw: b.yaw, roll: b.surfaceRoll, type, rage: b.rage,
          farLOD: b.farLOD, until: game.time + CONFIG.beasts.appearance.fallTime,
        });
        const origin = hit?.blastOrigin;
        const lift = Boolean(origin || hit?.pellet);
        const impulse = type === 0 && lift ? 1.1 : type === 3 ? .16 : .46;
        const pushX = origin ? b.x - origin.x : b.knockX;
        const pushZ = origin ? b.z - origin.z : b.knockZ;
        const length = Math.hypot(pushX, pushZ);
        corpse.slideX = corpse.slideZ = corpse.lift = 0;
        if (length > .01) {
          for (let step = 1; step <= 5; step++) {
            const dx = pushX / length * impulse * step / 5, dz = pushZ / length * impulse * step / 5;
            if (this.level.blocked(b.x + dx, b.z + dz, b.y, b.radius, b.height)) break;
            corpse.slideX = dx; corpse.slideZ = dz;
          }
        }
        if (type === 0 && lift && !this.level.blocked(b.x, b.z, b.y + .25, b.radius, b.height)) corpse.lift = .25;
        this.air.set(b.x, b.y + b.height * 0.52, b.z);
        game.effects.spray(this.air, ichor, type === 3 ? 65 : 18, type === 3 ? 10 : 6.4, 0.12, 'mist');
        game.effects.spray(this.air, type === 3 ? coreTint : projectileTint, type === 3 ? 28 : 7, 6.2, 0.061, 'spark');
      }
      const bonusAmmo = game.encounter?.bonusAmmo ?? 0;
      if (bonusAmmo > 0 || type === 3 || game.weapon.reserve < CONFIG.weapon.magazine || game.kills % 2 === 0) {
        const rounds = (CONFIG.pickups.ammoDrop + bonusAmmo) * (type === 3 ? 3 : 1) * (game.variation?.ammo ?? 1);
        const amount = Math.ceil(CONFIG.weapon.pellets ? rounds / 6 : rounds);
        game.pickups.add('ammo', b.x + 0.17, b.z, dropY, CONFIG.weapon.pellets ? '霰弹' : '步枪弹药', amount);
      }
      if (type !== 3 && game.kills % CONFIG.pickups.grenadeEvery === 0) {
        game.pickups.add('grenade', b.x-.20, b.z, dropY, '手雷', 1);
      }
      const bonusHealth = game.encounter?.bonusHealth ?? 0;
      if (bonusHealth > 0) {
        game.pickups.add('health', b.x - 0.26, b.z, dropY, '圣露', bonusHealth);
      }
      return true;
    }
    releaseSplits(game) {
      if (this.traits.splits.length) {
        for (const position of this.traits.splits.splice(0)) this.traits.offspring(position,game,2);
      }
    }
    update(dt, player, game) {
      if (dt <= 0) return;
      this.frame++;
      this.navTime -= dt;
      const encounter = game.encounter;
      if (this.navTime <= 0) {
        if (encounter?.hearingOnly) {
          const step = game.footstep;
          const latest = Math.max(game.shotAt, step.at);
          if (game.time - latest < encounter.memory) {
            this.nav.rebuild(game.shotAt >= step.at ? game.shotX : step.x, game.shotAt >= step.at ? game.shotZ : step.z);
          }
        } else this.nav.rebuild(player.x, player.z);
        this.navTime = 0.24;
      }
      this.refreshHash();
      this.releaseSplits(game);
      for (const b of this.pool) {
        if (!b.active) continue;
        if (b.role || b.affixes) this.traits.step(b,game,dt);
        if (!b.active || game.phase!=='play') continue;
        game.weapon.combat.updateTarget(b, game);
        if (!b.active) continue;
        this.ai.update(b, player, game, dt, this.frame);
      }
      this.spawnTime -= dt;
      if (this.spawnTime <= 0 && !game.story?.managed && !game.field?.hunting) {
        this.spawnTime = encounter?.spawnEvery ?? CONFIG.beasts.spawnEvery;
        const target = Math.min((encounter?.population ?? CONFIG.beasts.population) + (game.objective?.reinforcements ?? 0), this.pool.length);
        const burst = encounter?.spawnBurst ?? CONFIG.beasts.spawnBurst;
        camera.getWorldDirection(this.air);
        for (let i = 0; i < burst && this.live < target; i++) {
          const type = this.randomType(), spawn = this.spawnSite(type, player, false, this.air);
          if (spawn !== -1) {
            const child = this.spawnRegular(type, this.nav.x(spawn), this.nav.z(spawn));
            if (child) child.reinforcement = this.live > CONFIG.beasts.population;
          }
        }
        if (!encounter?.hearingOnly && this.live > target) {
          for (const b of this.pool) {
            if (this.live <= target) break;
            if (!b.active || !b.reinforcement || Math.hypot(player.x - b.x, player.z - b.z) < CONFIG.beasts.spawnDistance ||
                this.visibleToPlayer(b.x, b.y, b.z, this.air)) continue;
            b.active = false; this.live--;
          }
        }
      }
      if (this.boss?.summon > 0) {
        const b = this.boss;
        const a = Math.random() * TAU;
        const x = b.x + Math.cos(a) * 3.6, z = b.z + Math.sin(a) * 3.6;
        const floor = this.level.surface(x, z, b.y + 0.45);
        const swarm = CONFIG.beasts.types[0];
        if (this.live < this.pool.length && !this.level.blocked(x, z, floor, swarm.radius, swarm.height)) {
          const stage = definition.stageBossSummon;
          if (!stage || stage(x, floor, z, game)) {
            if (!stage) {
              const child = this.spawn(0, x, z, floor);
              if (!encounter?.hearingOnly) child.alert = CONFIG.beasts.memory;
            }
            b.summon--;
            this.air.set(x, floor + 0.28, z);
            game.effects.spray(this.air, ichor, 8, 4.2, 0.10, 'mist');
          }
        }
      }
      this.refreshHash();
    }
    fadeHitFlashes(dt, game) {
      for (const b of this.pool) {
        if (!b.active) continue;
        game.weapon.combat.updateTarget(b, game);
        if (b.flash > 0) b.flash = Math.max(0, b.flash - dt);
      }
    }
    render(dt = 0, t = 0, disabled = false) {
      this.counts.fill(0);
      const badges={shield:0,brood:0,volatile:0,elite:0};
      this.traitLabel='';
      let labelRange=28**2;
      let bars = 0, chargeMarks = 0, shadows = 0;
      for (const b of this.pool) {
        if (!b.active) continue;
        const type = b.type;
        const appearance=CONFIG.beasts.appearance;
        const range2=(camera.position.x-b.x)**2+(camera.position.z-b.z)**2+(camera.position.y-b.y)**2;
        const threshold=appearance.far+(b.farLOD?-appearance.hysteresis:appearance.hysteresis);
        b.farLOD=type!==3 && range2>threshold**2;
        const batch=b.farLOD ? this.farStart+type : b.rage && type===3 ? this.rageBatch : type;
        const i = this.counts[batch]++;
        const [body, luminous] = this.modelBatches[batch];
        const angle = Math.atan2(b.fx, b.fz);
        if (!disabled && b.type === 1 && b.mode === 'windup' && b.chargeMarkLength > 0) {
          const step = b.chargeMarkLength;
          for (let j = 0; j < b.chargeMarkCount; j++) {
            const along = (j + .5) * step;
            const y = (b.chargeHeights[j] + b.chargeHeights[j+1]) / 2 + .065;
            const dy = b.chargeHeights[j+1] - b.chargeHeights[j];
            setInstance(this.chargeMarks, chargeMarks++, b.x + b.fx * along, y, b.z + b.fz * along,
              .16, .035, Math.hypot(step,dy)*.88, null, angle, -Math.atan2(dy,step));
          }
        }
        const delta = Math.atan2(Math.sin(angle - b.yaw), Math.cos(angle - b.yaw));
        b.yaw += delta * Math.min(1, dt * 16);
        const walk = t * appearance.walkHz[type] + b.blink;
        const action = disabled ? 0 : b.mode === 'windup' ? appearance.windupTilt[type] : b.mode === 'charge' ? 0.23 : 0;
        const bob = (disabled ? 0 : Math.sin(walk * 2)) * 0.075 * clamp(b.stride / 3, 0.15, 1);
        body.geometry.attributes.beastFlash.setX(i, Math.min(1, b.flash * 12));
        const roll = b.surfaceRoll + (disabled ? 0 : Math.cos(walk) * 0.062);
        const visualY = b.y + bob + (b.surfaceRoll ? b.height * 0.5 * (1 - Math.cos(b.surfaceRoll)) : 0);
        const breath=disabled?1:1+.018*Math.sin(t*3+b.blink);
        setInstance(body, i, b.x, visualY, b.z, b.scale, breath*b.scale, b.scale, null, b.yaw, action, roll);
        workColor.setScalar(disabled ? 0.31 : b.rage ? 3.2 : b.mode === 'windup' ? 2.85 : appearance.eyeLight);
        setInstance(luminous, i, b.x, visualY, b.z, b.scale, breath*b.scale, b.scale, workColor, b.yaw, action, roll);
        const mark=b.role || (b.affixes && 'elite');
        if (mark && range2<40**2) {
          const size=b.charging?1+.3*Math.sin(t*16):1;
          workColor.setHex(({shield:b.shield>0?0x65daff:0x51869b,brood:0xb8ff84,volatile:0xff633a,elite:0xd68aff})[mark]);
          setInstance(this.badges[mark],badges[mark]++,b.x,b.y+b.height*.83,b.z,size*b.radius*2.3,
            size*b.height*.62,size*b.radius*1.6,workColor,b.yaw);
          if (range2<labelRange && b.playerVisible) {
            labelRange=range2;
            this.traitLabel=[b.affixes?'精英':'',roleRules[b.role]?.title,
              ...(b.affixes??[]).map(key=>affixTitles[key]),b.charging?'蓄能中':''].filter(Boolean).join(' · ');
          }
        }
        if (range2 < appearance.shadowRange ** 2) {
          const floor = this.level.surface(b.x,b.z,b.y+.05);
          setInstance(this.shadows,shadows++,b.x,floor+.025,b.z,b.radius*2.6,b.radius*3.1,1,null,b.yaw,-Math.PI/2);
        }
        if (range2 > 68 ** 2) continue;
        const w = type === 3 ? 1.83 : 0.93, h = type === 3 ? 0.099 : 0.059;
        const ratio = clamp(b.hp / b.maxHP, 0, 1);
        const y = Math.abs(b.surfaceRoll) > 2.10 ? b.y - 0.18 : b.y + b.height + 0.20;
        stamp.position.set(b.x, y, b.z);
        stamp.quaternion.copy(camera.quaternion); stamp.scale.set(w + 0.055, h + 0.035, 1);
        stamp.updateMatrix(); this.healthBG.setMatrixAt(bars, stamp.matrix);
        this.line.set(w * (ratio - 1) / 2, 0, 0.016).applyQuaternion(camera.quaternion);
        stamp.position.add(this.line);
        stamp.scale.set(w * ratio, h, 1); stamp.updateMatrix(); this.healthFG.setMatrixAt(bars, stamp.matrix);
        workColor.setHex(type === 3 || b.rage ? 0xff536a : b.mode === 'windup' ? 0xffae62 : 0xee755f);
        this.healthFG.setColorAt(bars++, workColor);
      }
      for(const c of this.corpses){
        if(c.until<=t) continue;
        const fall=1-(c.until-t)/CONFIG.beasts.appearance.fallTime;
        const batch=c.farLOD ? this.farStart+c.type : c.rage && c.type===3 ? this.rageBatch : c.type;
        const [body,eye]=this.modelBatches[batch], i=this.counts[batch]++;
        const x=c.x+c.slideX*fall, z=c.z+c.slideZ*fall;
        const y=c.y-.18*fall+c.lift*Math.sin(Math.PI*fall), roll=c.roll+fall*1.48;
        setInstance(body,i,x,y,z,1,1,1,null,c.yaw,0,roll);
        workColor.setScalar(1-fall);setInstance(eye,i,x,y,z,1,1,1,workColor,c.yaw,0,roll);
        body.geometry.attributes.beastFlash.setX(i,Math.max(0,1-5*fall));
      }
      for (let i = 0; i < this.counts.length; i++) {
        const [body, luminous] = this.modelBatches[i];
        body.visible=luminous.visible=this.counts[i]>0;
        body.geometry.attributes.beastFlash.needsUpdate = true;
        updateMesh(body, this.counts[i]); updateMesh(luminous, this.counts[i]);
      }
      this.chargeMarks.visible = chargeMarks > 0;
      let marks=0;
      const boss=this.boss, fight=boss?.fight;
      if (fight?.winding) {
        workColor.setHex(0xff9144);
        const radius=2.2+fight.stage*.5;
        setInstance(this.bossMarks,marks++,fight.aimX,fight.aimY+.09,fight.aimZ,radius,radius,1,workColor,0,-Math.PI/2);
        if(fight.pattern===2 && fight.stage>=1)
          setInstance(this.bossMarks,marks++,fight.nextX,fight.aimY+.09,fight.nextZ,2.5,2.5,1,workColor,0,-Math.PI/2);
      }
      if (fight && (fight.weakUntil>t || fight.brokenUntil>t)) {
        workColor.setHex(0xc7ff78);
        stamp.position.set(boss.x,boss.y+boss.height*.83,boss.z);
        stamp.quaternion.copy(camera.quaternion);stamp.translateZ(boss.radius*.8); stamp.scale.set(.45,.45,.45);stamp.updateMatrix();
        this.bossMarks.setMatrixAt(marks,stamp.matrix);this.bossMarks.setColorAt(marks++,workColor);
      }
      this.bossMarks.visible=marks>0; updateMesh(this.bossMarks,marks);
      for (const [name,count] of Object.entries(badges)) {
        this.badges[name].visible=count>0;
        updateMesh(this.badges[name],count);
      }
      updateMesh(this.chargeMarks, chargeMarks);
      updateMesh(this.healthBG, bars); updateMesh(this.healthFG, bars);
      this.shadows.visible = shadows > 0;
      updateMesh(this.shadows, shadows);
    }
  }

  return { BeastAI, BeastManager };
}
