import { rayBox } from '@level-kit/world.mjs';

export function createEffectClasses({ CONFIG, THREE, V3, TAU, Y_AXIS, shapes, stamp, scene, brighter, workColor, randomRange, dynamicMesh, updateMesh, setInstance, colors, definition }) {
  const { projectileTint, coreTint } = colors;

  class Effects {
    constructor() {
      this.dots = Array.from({ length: CONFIG.effects.particles }, () => ({ pos: new V3(), vel: new V3(), tint: new THREE.Color(), life: 0 }));
      this.traces = Array.from({ length: CONFIG.effects.tracers }, () => ({ a: new V3(), b: new V3(), life: 0 }));
      this.dotMesh = dynamicMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial(), this.dots.length);
      this.traceMesh = dynamicMesh(shapes.box, new THREE.MeshBasicMaterial({ color: brighter(0xffc489, 2.1) }), this.traces.length);
      this.nextDot = 0; this.nextTrace = 0;
      this.rayVec = new V3();
    }
    reset() {
      for (const item of this.dots) item.life = 0;
      for (const item of this.traces) item.life = 0;
      updateMesh(this.dotMesh, 0); updateMesh(this.traceMesh, 0);
    }
    streak(from, to) {
      const data = this.traces[this.nextTrace++ % this.traces.length];
      data.a.copy(from); data.b.copy(to); data.life = 0.052;
    }
    spray(where, color, count, speed, size, style) {
      for (let i = 0; i < count; i++) {
        const p = this.dots[this.nextDot++ % this.dots.length];
        const a = randomRange(0, TAU), v = randomRange(speed * 0.3, speed);
        p.pos.copy(where); p.vel.set(Math.cos(a) * v, randomRange(0.04, 1.0) * v, Math.sin(a) * v);
        p.tint.copy(color);
        p.size = size * randomRange(0.45, 1.6); p.style = style;
        p.life = p.max = style === 'mist' ? randomRange(0.26, 0.54) : randomRange(0.10, 0.40);
      }
    }
    update(dt) {
      let n = 0, m = 0;
      for (const p of this.dots) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) continue;
        const t = p.life / p.max, mist = p.style === 'mist';
        p.vel.y -= dt * (mist ? 1 : 11);
        p.pos.addScaledVector(p.vel, dt);
        const size = p.size * (mist ? (1.4 - t * 0.52) * Math.sqrt(t) : 0.3 + t * 0.7);
        workColor.copy(p.tint).multiplyScalar(mist ? t * 0.64 + 0.13 : t + 0.37);
        setInstance(this.dotMesh, n++, p.pos.x, p.pos.y, p.pos.z, size, size * (mist ? 1 : 2.1), size, workColor);
      }
      for (const p of this.traces) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) continue;
        this.rayVec.subVectors(p.b, p.a);
        const length = this.rayVec.length();
        if (length < 0.01) continue;
        stamp.position.lerpVectors(p.a, p.b, 0.5);
        stamp.quaternion.setFromUnitVectors(Y_AXIS, this.rayVec.divideScalar(length));
        stamp.scale.set(0.021, length, 0.021);
        stamp.updateMatrix(); this.traceMesh.setMatrixAt(m++, stamp.matrix);
      }
      updateMesh(this.dotMesh, n); updateMesh(this.traceMesh, m);
    }
  }

  class Rift {
    constructor(position) {
      const palette = definition.palette?.rift ?? {};
      this.group = new THREE.Group();
      this.group.position.copy(position);
      scene.add(this.group);
      this.core = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 4.7), new THREE.ShaderMaterial({
        transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: {
          tick: { value: 0 }, ready: { value: 0 }, open: { value: 0 },
          sealedTint: { value: new V3(...(palette.sealed ?? [0.34, 0.09, 0.8])) },
          openTint: { value: new V3(...(palette.ready ?? [2.1, 0.70, 0.16])) },
        },
        vertexShader: 'varying vec2 tex; void main(){ tex=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: `
          varying vec2 tex;
          uniform float tick,ready,open;
          uniform vec3 sealedTint,openTint;
          void main() {
            vec2 p = tex*2.0-1.0;
            float r = length(p);
            float a = atan(p.y,p.x);
            float spiral = sin(a*5.0-r*23.0+tick*3.1+sin(a*4.0+tick)*0.7);
            float veins = pow(max(0.0,spiral),8.0);
            float band = exp(-abs(r-0.76-sin(a*7.0+tick)*0.064)*25.0);
            float rim = 1.0-smoothstep(0.62,0.98,r);
            float shell = abs(sin(p.y*62.0-tick*6.0))*0.13*(1.0-ready);
            vec3 energy = mix(sealedTint,openTint,ready + (1.0-ready)*band*0.67);
            gl_FragColor = vec4(energy * (1.0+open*3.0), (veins*0.46+band*0.62+shell+0.12)*rim*(1.0-open*0.82));
          }`,
      }));
      this.core.position.y = 2.55; this.group.add(this.core);
      this.rings = [];
      for (let i = 0; i < 3; i++) {
        const mesh = new THREE.Mesh(new THREE.TorusGeometry(1.83 + i * 0.19, 0.028 + i * 0.009, 5, 68, TAU - i * 0.73),
          new THREE.MeshBasicMaterial({ color: brighter(palette.rings?.[i % 2] ?? (i % 2 ? 0xa18aff : 0xff9b6b), 2.1 - i * 0.29) }));
        mesh.scale.y = 1.10;
        mesh.position.set(0, 2.55, -0.045 + i * 0.084);
        this.group.add(mesh); this.rings.push(mesh);
      }
      const particleCount = 140, positions = new Float32Array(particleCount * 3);
      this.embers = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({
        color: brighter(palette.particles ?? 0xffa372, 2.1), size: 0.047, transparent: true, opacity: 0.93, depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      this.embers.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
      this.embers.frustumCulled = false;
      this.group.add(this.embers);
      this.wave = new THREE.Mesh(new THREE.TorusGeometry(1, 0.023, 7, 64),
        new THREE.MeshBasicMaterial({ color: brighter(palette.wave ?? 0xffae86, 2.3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.wave.rotation.x = -Math.PI / 2;
      this.wave.position.y = 0.42; this.group.add(this.wave);
    }
    update(t, ready, blast) {
      const u = this.core.material.uniforms;
      u.tick.value = t; u.ready.value = ready ? 1 : 0; u.open.value = blast;
      for (let i = 0; i < this.rings.length; i++) {
        this.rings[i].rotation.set(Math.sin(t * 0.67 + i) * (0.11 + i * 0.09), Math.cos(t * 0.32 + i) * 0.30, t * (i === 1 ? -0.51 : 0.65) + i * 1.3);
        this.rings[i].visible = blast < 0.94;
      }
      const positions = this.embers.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const cycle = (i * 0.618034 + t * 0.29) % 1;
        const a = i * 2.399963 + t * (1.8 + cycle), r = 2.55 * (1 - cycle) + blast * 8.3;
        positions.setXYZ(i, Math.cos(a) * r, 2.55 + Math.sin(a) * r * 0.87, Math.sin(cycle * TAU) * 0.8 + Math.sin(a * 0.4) * blast * 2.5);
      }
      positions.needsUpdate = true;
      this.embers.material.opacity = 1 - blast * 0.72;
      this.wave.visible = blast > 0 && blast < 1;
      this.wave.scale.setScalar(0.9 + blast * 31);
      this.wave.material.opacity = Math.max(0, 1 - blast) * 0.92;
      this.core.visible = blast < 1;
    }
  }

  class Projectiles {
    constructor(level, effects) {
      this.level = level; this.effects = effects;
      this.shots = Array.from({ length: CONFIG.effects.projectiles }, () => ({ pos: new V3(), vel: new V3(), life: 0 }));
      this.puddles = Array.from({ length: CONFIG.effects.pools }, () => ({ pos: new V3(), life: 0, max: 1 }));
      this.sparks = dynamicMesh(definition.projectileGeometry?.(THREE) ?? new THREE.IcosahedronGeometry(1, 1),
        new THREE.MeshBasicMaterial({ color: projectileTint }), this.shots.length);
      this.directional = Boolean(definition.projectileGeometry);
      this.fields = dynamicMesh(new THREE.CircleGeometry(1, 21), new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0.41, depthWrite: false, blending: THREE.AdditiveBlending,
      }), this.puddles.length);
      this.old = new V3(); this.dir = new V3();
      this.shotCursor = 0; this.puddleCursor = 0;
      this.gravity = 9.6;
    }
    reset() {
      this.shots.forEach(p => { p.life = 0; });
      this.puddles.forEach(p => { p.life = 0; });
      updateMesh(this.sparks, 0); updateMesh(this.fields, 0);
    }
    launch(beast, player) {
      const { projectileSpeed, damage, hazardLife, slowScale = 1, slowDuration = 0,
        projectileGravity = this.gravity } = CONFIG.beasts.types[beast.type];
      const shot = this.shots[this.shotCursor++ % this.shots.length];
      shot.pos.set(beast.x, beast.y + beast.height * 0.72, beast.z);
      const dx = player.x - beast.x, dz = player.z - beast.z;
      const range = Math.max(1, Math.hypot(dx, dz));
      const t = range / projectileSpeed;
      shot.vel.set(dx / t, (player.y + 0.55 - shot.pos.y) / t + 0.5 * projectileGravity * t, dz / t);
      shot.life = t + 1.55; shot.damage = damage; shot.poolLife = hazardLife;
      shot.gravity = projectileGravity;
      shot.slowScale = slowScale; shot.slowDuration = slowDuration;
    }
    splat(p, game, markGround = true) {
      this.effects.spray(p.pos, projectileTint, 13, 4.2, 0.073, 'mist');
      definition.onProjectileImpact?.(p.pos, game);
      if (markGround && p.poolLife > 0) {
        const pool = this.puddles[this.puddleCursor++ % this.puddles.length];
        pool.pos.copy(p.pos);
        pool.pos.y = this.level.surface(p.pos.x, p.pos.z, p.pos.y + 0.15) + 0.038;
        pool.life = pool.max = p.poolLife;
      }
      p.life = 0;
    }
    update(dt, player, game) {
      let n = 0, m = 0;
      for (const p of this.shots) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) continue;
        this.old.copy(p.pos);
        p.pos.addScaledVector(p.vel, dt);
        p.pos.y -= p.gravity * 0.5 * dt * dt;
        p.vel.y -= p.gravity * dt;
        const distance = this.dir.subVectors(p.pos, this.old).length();
        this.dir.divideScalar(Math.max(distance, 0.00001));
        const cover = this.level.hash.ray(this.old, this.dir, distance + 0.001);
        const coverDistance = this.level.hash.depth;
        const target = rayBox(this.old, this.dir, player.bounds());
        if (target <= distance && target < coverDistance) {
          p.pos.copy(this.old).addScaledVector(this.dir, target);
          const damage = p.damage * (game.encounter?.beastDamageScale ?? 1);
          if (player.hurt(damage, game) && player.hp > 0) {
            if (p.slowDuration > 0) player.slow(p.slowScale, p.slowDuration, game.time);
            definition.onProjectileHit?.(game);
          }
          this.splat(p, game);
        } else if (cover) {
          p.pos.copy(this.old).addScaledVector(this.dir, Math.max(0, coverDistance - 0.06));
          this.splat(p, game, cover.y0 < p.pos.y - 0.3);
        } else if (p.pos.y <= this.level.base(p.pos.x, p.pos.z)) {
          this.splat(p, game);
        } else {
          const size = 0.089 + 0.022 * Math.sin(p.life * 34);
          const yaw = this.directional ? Math.atan2(p.vel.x, p.vel.z) : 0;
          const pitch = this.directional ? -Math.atan2(p.vel.y, Math.hypot(p.vel.x, p.vel.z)) : 0;
          setInstance(this.sparks, n++, p.pos.x, p.pos.y, p.pos.z, size, size, size, null, yaw, pitch);
        }
      }
      for (const p of this.puddles) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) continue;
        const age = p.life / p.max;
        const r = 1.24 + (1 - age) * 0.36;
        if (Math.abs(player.y - p.pos.y) < 0.60 && Math.hypot(player.x - p.pos.x, player.z - p.pos.z) < r - 0.1 && player.hurtDelay < 0.03) {
          player.hurt(3.3, game, 0.48);
        }
        workColor.copy(projectileTint).multiplyScalar(age * 0.40 + 0.10);
        setInstance(this.fields, m++, p.pos.x, p.pos.y, p.pos.z, r, r * 0.86, 1, workColor, 0, -Math.PI / 2);
      }
      updateMesh(this.sparks, n); updateMesh(this.fields, m);
    }
  }

  return { Effects, Rift, Projectiles };
}
