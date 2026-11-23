// 升降台只占自己的水平投影。两端均可呼叫，楼梯始终保留，供日常跨层寻路使用。
export function createLifts({ THREE, level, scene }, specs = []) {
  const lifts = specs.map(({ x, z, width, depth, low, high, speed = 1.9 }) => {
    const body = level.box(x, z, width, depth, low - 0.24, low, true);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.24, depth),
      new THREE.MeshLambertMaterial({ color: 0x758b94, emissive: 0x09232a }),
    );
    cabin.position.set(x, low - 0.12, z);
    scene.add(cabin);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.84, 0.035, 0.16),
      new THREE.MeshBasicMaterial({ color: 0x77e2d3 }),
    );
    stripe.position.y = 0.14;
    cabin.add(stripe);
    return { x, z, width, depth, low, high, speed, body, cabin, y: low, to: low };
  });
  function nearby(p) {
    return lifts.find(
      (l) =>
        Math.abs(p.x - l.x) < l.width * 0.5 + 1.35 &&
        Math.abs(p.z - l.z) < l.depth * 0.5 + 1.35 &&
        (Math.abs(p.y - l.low) < 0.8 || Math.abs(p.y - l.high) < 0.8 || Math.abs(p.y - l.y) < 0.5),
    );
  }
  function move(l, y) {
    l.y = y;
    l.body.y0 = y - 0.24;
    l.body.y1 = y;
    l.cabin.position.y = y - 0.12;
  }
  return {
    lifts,
    reset() {
      for (const l of lifts) {
        move(l, l.low);
        l.to = l.low;
      }
    },
    hint(p) {
      const l = nearby(p);
      if (!l) return '';
      return l.y !== l.to
        ? '升降平台运行中'
        : Math.abs(p.y - l.y) > 1
          ? '按 F 呼叫升降台'
          : '按 F ' + (l.y === l.low ? '乘升降台上行' : '乘升降台下行');
    },
    interact(g) {
      const l = nearby(g.player);
      if (!l) return false;
      if (l.y === l.to) l.to = l.y === l.low ? l.high : l.low;
      return true;
    },
    step(dt, g) {
      for (const l of lifts) {
        if (l.y === l.to) continue;
        const dy = Math.sign(l.to - l.y) * Math.min(l.speed * dt, Math.abs(l.to - l.y));
        const riders = [];
        let blocked = false;
        for (const a of [
          g.player,
          ...g.beasts.hash.query(l.body.x0 - 1, l.body.z0 - 1, l.body.x1 + 1, l.body.z1 + 1, []),
        ]) {
          if (
            a.active === false ||
            Math.abs(a.x - l.x) > l.width / 2 + a.radius * 0.5 ||
            Math.abs(a.z - l.z) > l.depth / 2 + a.radius * 0.5
          )
            continue;
          if (Math.abs(a.y - l.y) < 0.12 && !(a.vy > 0)) riders.push(a);
          else if (dy < 0 && a.y < l.y - 0.12 && a.y + a.height > l.body.y0 + dy) blocked = true;
        }
        if (blocked) continue;
        // 运动前检查乘客头顶净空，避免将乘客挤进横梁。
        if (dy > 0 && riders.some((a) => level.blocked(a.x, a.z, a.y + dy, a.radius, a.height))) continue;
        move(l, l.y + dy);
        for (const a of riders) {
          a.y += dy;
          if (a === g.player) a.fallPeak = a.y;
        }
      }
    },
  };
}
