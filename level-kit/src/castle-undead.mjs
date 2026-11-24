export function createEncounter({ CONFIG: setup, sound }) {
  const rules = setup.bloodMoon;
  const status = { title: '', detail: '', remaining: 0 };
  return {
    phase: 'calm', status: null, veilUntil: -Infinity,
    get beastSpeedScale() { return this.phase === 'active' ? rules.speed : 1; },
    get beastDamageScale() { return this.phase === 'active' ? rules.damage : 1; },
    killHealing() { return this.phase === 'active' ? rules.health : 0; },
    reset() {
      this.phase = 'calm'; this.status = null; this.veilUntil = -Infinity;
    },
    veil(game) {
      this.veilUntil = game.time + rules.veilDuration;
      game.ui.notify('暗影弹命中，视野受阻', rules.veilDuration);
    },
    update(game) {
      const cycle = game.time % rules.period;
      const active = game.time >= rules.period && cycle < rules.duration;
      const warning = cycle >= rules.period - rules.warning;
      const phase = active ? 'active' : warning ? 'warning' : 'calm';
      if (phase !== this.phase) {
        this.phase = phase;
        const message = active ? '血月升起，少数亡灵会掉落圣露' :
          warning ? '血月即将升起' : '血月退去';
        game.ui.notify(message, 2.6);
        game.ui.tick = 0;
        if (active) sound.tone(139, 55, 0.88, 0.31, 'triangle');
      }
      status.title = active ? '血月当空' : '血月将升';
      status.detail = active ? '凶兽强化 / 偶有圣露掉落' : '凶兽即将强化';
      status.remaining = (active ? rules.duration : rules.period) - cycle;
      this.status = active || warning ? status : null;
    },
  };
}

export function beastSurface(beast, player, level, floor, dt, game) {
  if (beast.type !== 0 && !beast.rage) {
    beast.y = Math.max(floor, beast.y - dt * 8);
    return;
  }
  const time = game.time * (beast.rage ? 6 : 9) + beast.blink;
  const near = Math.abs(floor - player.y) < 0.7 && Math.hypot(beast.x - player.x, beast.z - player.z) < 5.8;
  const lift = near ? 0.58 : beast.rage ? 0.92 : 1.65;
  const target = floor + lift + Math.sin(time) * (near ? 0.19 : 0.34);
  const y = Math.max(floor, beast.y + (target - beast.y) * Math.min(1, dt * 6.2));
  if (!level.blocked(beast.x, beast.z, y, beast.radius, beast.height)) beast.y = y;
  else beast.y = Math.max(floor, beast.y - dt * 5);
}

export function wingGeometry(THREE) {
  const wing = new THREE.Shape();
  wing.moveTo(0.08, 0);
  wing.lineTo(0.40, 0.17);
  wing.lineTo(0.91, 0.01);
  wing.quadraticCurveTo(0.66, 0.01, 0.66, -0.19);
  wing.quadraticCurveTo(0.53, -0.10, 0.45, -0.30);
  wing.quadraticCurveTo(0.30, -0.21, 0.12, -0.23);
  wing.closePath();
  const one = new THREE.ShapeGeometry(wing, 2);
  const both = one.toNonIndexed();
  const flipped = both.clone().rotateY(Math.PI);
  const folded = both.clone().rotateX(-Math.PI / 2);
  const foldedOther = flipped.clone().rotateX(-Math.PI / 2);
  one.dispose();
  both.dispose();
  flipped.dispose();
  return [folded, foldedOther];
}

export function undeadModel(type, { THREE, shapes, mergeGeometries }, rage = false) {
  const body = [], lit = [], transform = new THREE.Object3D();
  const rock = new THREE.IcosahedronGeometry(1, 0);
  const cone = new THREE.ConeGeometry(0.5, 1, 5);
  const tube = new THREE.CylinderGeometry(0.43, 0.5, 1, 6);
  const wings = type === 0 || rage ? wingGeometry(THREE) : [];
  function part(target, source, tint, x, y, z, w, h, d, pitch = 0, yaw = 0, roll = 0) {
    const geometry = source.index ? source.toNonIndexed() : source.clone();
    transform.position.set(x, y, z); transform.scale.set(w, h, d);
    transform.rotation.set(pitch, yaw, roll, 'YXZ'); transform.updateMatrix();
    geometry.applyMatrix4(transform.matrix);
    const color = new THREE.Color(tint), data = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < data.length; i += 3) {
      data[i] = color.r; data[i + 1] = color.g; data[i + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
    target.push(geometry);
  }
  const orb = (...args) => part(body, rock, ...args);
  const spike = (...args) => part(body, cone, ...args);
  const rod = (...args) => part(body, tube, ...args);
  const plate = (...args) => part(body, shapes.box, ...args);
  const glow = (...args) => part(lit, rock, ...args);
  const bone = 0xd5c6b2, iron = 0x616785, soot = 0x33304c, red = 0x913950, violet = 0x706189;
  function bat(x, y, z, size, yaw = 0) {
    orb(soot, x, y, z, 0.15 * size, 0.13 * size, 0.28 * size, 0, yaw);
    orb(violet, x, y + 0.05 * size, z + 0.18 * size, 0.142 * size, 0.11 * size, 0.1 * size);
    for (const [index, sign] of [-1, 1].entries()) {
      const rotation = sign * 0.26;
      // 同一翅膀造型补上反向面，细薄的膜翼从上下方都可见。
      part(body, wings[index], index ? 0x64516c : 0x584666, x, y, z, size, size, size, 0, yaw, rotation);
      part(body, wings[1 - index], 0x534160, x, y, z, size, size, size, Math.PI, yaw, -rotation);
      spike(violet, x + sign * 0.10 * size, y + 0.16 * size, z + 0.17 * size, 0.094 * size, 0.175 * size, 0.09 * size);
      glow(0xff5479, x + sign * 0.069 * size, y + 0.066 * size, z + 0.268 * size, 0.023 * size, 0.023 * size, 0.024 * size);
    }
  }
  if (type === 0) {
    bat(0, 0.32, 0, 1);
  } else if (rage) {
    for (let i = 0; i < 11; i++) {
      const angle = i * 2.39996, ring = i ? 0.39 + (i % 3) * 0.21 : 0;
      bat(Math.cos(angle) * ring, 0.49 + i * 0.228, Math.sin(angle) * ring, i === 0 ? 1.1 : 0.55 + (i % 3) * 0.15, angle);
    }
    glow(0xff387b, 0, 1.67, 0.12, 0.15, 0.22, 0.15);
  } else if (type === 1) {
    orb(iron, 0, 1.41, 0, 0.47, 0.49, 0.31);
    plate(soot, 0, 1.02, 0.02, 0.56, 0.34, 0.49);
    orb(bone, 0, 1.94, 0.11, 0.23, 0.25, 0.23);
    plate(iron, 0, 2.06, 0.06, 0.45, 0.21, 0.46);
    plate(bone, 0, 1.81, 0.29, 0.25, 0.14, 0.12);
    rod(iron, 0.59, 1.15, 0.34, 0.10, 1.50, 0.10, 0.36, 0, -0.19);
    spike(bone, 0.74, 1.93, 0.60, 0.19, 0.55, 0.18, 0.36, 0, -0.19);
    plate(soot, -0.54, 1.00, 0.34, 0.56, 0.73, 0.21, 0.04, -0.20);
    plate(iron, -0.54, 1.00, 0.466, 0.34, 0.48, 0.042);
    for (const sign of [-1, 1]) {
      orb(iron, sign * 0.49, 1.58, 0, 0.30, 0.26, 0.27);
      rod(bone, sign * 0.48, 1.19, 0.07, 0.18, 0.61, 0.16, -0.25);
      rod(bone, sign * 0.24, 0.54, 0, 0.17, 0.81, 0.16, 0, 0, sign * 0.12);
      plate(iron, sign * 0.25, 0.28, 0.07, 0.30, 0.48, 0.32);
      plate(soot, sign * 0.25, 0.095, 0.145, 0.28, 0.17, 0.47);
      glow(0xff856b, sign * 0.096, 1.965, 0.31, 0.04, 0.028, 0.025);
    }
  } else if (type === 2) {
    spike(soot, 0, 0.71, 0.0, 0.9, 1.45, 0.76);
    orb(violet, 0, 1.21, 0.03, 0.42, 0.33, 0.32);
    orb(soot, 0, 1.61, 0.04, 0.31, 0.32, 0.29);
    orb(bone, 0, 1.56, 0.22, 0.133, 0.16, 0.12);
    spike(violet, 0, 1.89, -0.10, 0.32, 0.25, 0.30, -0.28);
    rod(soot, 0.54, 0.86, 0.22, 0.073, 1.71, 0.076, 0.16, 0, 0.15);
    orb(violet, 0.42, 1.74, 0.36, 0.14, 0.19, 0.14);
    glow(0xac75e8, 0.42, 1.77, 0.39, 0.096, 0.13, 0.082);
    for (const sign of [-1, 1]) {
      rod(violet, sign * 0.43, 1.17, 0.21, 0.26, 0.65, 0.26, -0.8, 0, sign * 0.42);
      glow(0xd99afe, sign * 0.066, 1.59, 0.327, 0.027, 0.022, 0.025);
    }
  } else {
    plate(soot, 0, 1.63, -0.28, 0.98, 2.2, 0.22, -0.08);
    rod(red, 0, 1.64, 0, 0.87, 1.75, 0.54);
    plate(iron, 0, 2.11, 0.25, 0.57, 0.47, 0.14);
    orb(0xe9d2cf, 0, 2.82, 0.16, 0.31, 0.36, 0.28);
    orb(soot, 0, 3.01, 0.055, 0.34, 0.24, 0.31);
    for (const sign of [-1, 1]) {
      plate(red, sign * 0.54, 1.49, -0.29, 0.48, 2.65, 0.16, 0.17, sign * 0.22, sign * 0.15);
      spike(soot, sign * 0.32, 2.69, -0.065, 0.43, 0.86, 0.23, 0.1, 0, -sign * 0.66);
      rod(soot, sign * 0.58, 1.96, 0.07, 0.34, 0.95, 0.30, -0.4, 0, sign * 0.18);
      orb(0xd2bec7, sign * 0.65, 1.55, 0.27, 0.17, 0.21, 0.17);
      rod(iron, sign * 0.25, 0.65, 0.04, 0.32, 1.28, 0.31);
      plate(soot, sign * 0.25, 0.13, 0.13, 0.38, 0.25, 0.56);
      glow(0xff486a, sign * 0.114, 2.90, 0.403, 0.043, 0.033, 0.032);
      spike(bone, sign * 0.087, 2.716, 0.409, 0.06, 0.15, 0.05, Math.PI);
    }
    glow(0xf4a279, 0, 2.27, 0.344, 0.083, 0.115, 0.039);
  }
  const merged = [mergeGeometries(body), mergeGeometries(lit)];
  for (const geometry of [...body, ...lit, ...wings, rock, cone, tube]) geometry.dispose();
  return merged;
}
