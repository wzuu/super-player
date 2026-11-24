// 投掷物由有效游玩时间驱动，模型、爆炸声、可见性测试都读取同一世界坐标。
export function createFieldGrenades(config, { THREE, scene }) {
  const radius = 0.14, fuse = 1.55, reach = 5;
  const shell = new THREE.SphereGeometry(radius, 9, 7);
  const cap = new THREE.BoxGeometry(0.09, 0.07, 0.09);
  const orange = new THREE.MeshBasicMaterial({ color: 0xff8338 });
  const silver = new THREE.MeshBasicMaterial({ color: 0xf5dda8 });
  const flash = new THREE.Color(0xffaf51);
  const actors = [], targets = [], ray = new THREE.Vector3();

  function acquire() {
    const available = actors.find(actor => !actor.mesh.visible);
    if (available) return available;
    const mesh = new THREE.Mesh(shell, orange);
    mesh.name = 'field-grenade';
    const plug = new THREE.Mesh(cap, silver);
    plug.position.set(0.02, radius, 0);
    mesh.add(plug);
    scene.add(mesh);
    const actor = { mesh, velocity: new THREE.Vector3() };
    actors.push(actor);
    return actor;
  }

  function solid(level, x, y, z) {
    return level.blocked(x, z, y - radius, radius, radius * 2);
  }

  function launch(game) {
    const { player, level } = game;
    const yaw = player.look.rotation.y, pitch = player.look.rotation.x;
    const forwardX = -Math.sin(yaw), forwardZ = -Math.cos(yaw);
    const actor = acquire(), mesh = actor.mesh, pos = mesh.position;
    pos.set(player.x, player.y + player.eye - 0.18, player.z);
    const dx = (forwardX * 0.36 + Math.cos(yaw) * 0.22) / 5;
    const dz = (forwardZ * 0.36 - Math.sin(yaw) * 0.22) / 5;
    // 先从身体移向手边。贴门框时始终从门的同一侧起飞。
    for (let i = 0; i < 5; i++) {
      if (solid(level, pos.x + dx, pos.y - 0.02, pos.z + dz)) break;
      pos.x += dx; pos.y -= 0.02; pos.z += dz;
    }
    actor.velocity.set(forwardX * Math.cos(pitch) * 11, 3.2 + Math.sin(pitch) * 11, forwardZ * Math.cos(pitch) * 11);
    actor.left = fuse;
    actor.settled = false;
    mesh.rotation.set(0, yaw, 0);
    mesh.visible = true;
    game.sound.hiss(0.1, 1450, 480, 0.12, 0, game.sound.combat);
  }

  function travel(actor, level, dt) {
    const pos = actor.mesh.position, v = actor.velocity;
    if (actor.settled && (solid(level, pos.x, pos.y - 0.07, pos.z) ||
        pos.y <= level.surface(pos.x, pos.z, pos.y) + radius + 0.01)) return;
    actor.settled = false;
    // 每段位移短于半径，防止长帧越过薄隔板或低矮掩体。
    const count = Math.max(1, Math.ceil((v.length() + 16 * dt) * dt / radius));
    const h = dt / count;
    for (let i = 0; i < count; i++) {
      const x = pos.x + v.x * h, z = pos.z + v.z * h;
      if (solid(level, x, pos.y, z) || level.base(x, z) > pos.y - radius + 0.02) {
        v.x = v.z = 0;
      } else {
        pos.x = x; pos.z = z;
      }
      v.y -= 16 * h;
      const y = pos.y + v.y * h, floor = level.surface(pos.x, pos.z, pos.y) + radius;
      if (v.y <= 0 && (y <= floor || solid(level, pos.x, y, pos.z))) {
        let landing = Math.max(y, floor);
        if (solid(level, pos.x, landing, pos.z)) {
          let clear = pos.y;
          for (let n = 0; n < 5; n++) {
            const mid = (clear + landing) * 0.5;
            if (solid(level, pos.x, mid, pos.z)) landing = mid;
            else clear = mid;
          }
          landing = clear;
        }
        pos.y = landing;
        v.set(0, 0, 0);
        actor.settled = true;
        break;
      }
      if (solid(level, pos.x, y, pos.z)) v.y = 0;
      else pos.y = y;
      actor.mesh.rotation.x += 7 * h;
    }
  }

  function detonate(actor, game) {
    actor.mesh.visible = false;
    const pos = actor.mesh.position, { beasts, level } = game;
    game.effects.spray(pos, flash, 38, 7, 0.09, 'spark');
    game.sound.spatialCue(pos, game.player, 'grenade');
    const impact = { blastOrigin: pos };
    beasts.hash.query(pos.x - reach, pos.z - reach, pos.x + reach, pos.z + reach, targets);
    for (const beast of targets) {
      if (game.phase !== 'play') break;
      if (!beast.active) continue;
      ray.set(beast.x - pos.x, beast.y + beast.height * 0.45 - pos.y, beast.z - pos.z);
      const distance = ray.length();
      if (distance > reach || (distance > 0 && !level.visible(pos, ray.divideScalar(distance), distance))) continue;
      game.weapon.combat.element(beast, 'fire', game, 'equipment', impact);
      if (beast.active) beasts.damage(beast, config.beasts.types[0].hp * 2, game, 'equipment', impact);
    }
  }

  return {
    launch,
    step(dt, game) {
      for (const actor of actors) {
        if (!actor.mesh.visible) continue;
        travel(actor, game.level, Math.min(dt, actor.left));
        actor.left -= dt;
        if (actor.left <= 0) detonate(actor, game);
      }
    },
    clear() {
      for (const actor of actors) actor.mesh.visible = false;
    },
  };
}
