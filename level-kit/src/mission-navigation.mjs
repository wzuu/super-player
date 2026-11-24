// 单层关卡的推荐路线使用玩家胶囊、当前门态和真实站立高度。
export function createMissionNavigation(nav) {
  const field = nav.playerRoute(), level = field.level;
  let previous = '', path = [];
  function point(i) {
    const x = field.x(i), z = field.z(i);
    return { x, y: field.floors[i], z };
  }
  function walkable(a, b) {
    return field.canWalk(a,b);
  }
  function build(p, target) {
    // 桥面与同层平台可直接通行时保留真实高度，避免二维网格把终点投到楼下。
    const onPlatform=q=>Math.abs(q.y-level.surface(q.x,q.z,level.base(q.x,q.z)+.65))>.65;
    const layered=onPlatform(p)||onPlatform(target);
    if (layered && walkable(p,target)) return [{x:target.x,y:target.y,z:target.z}];
    field.rebuild(target.x, target.z);
    let cell = field.index(p.x, p.z);
    // 涨潮后脚下的格子可退出，但不会被纳入新的方向场。先按实体碰撞验证通往岸边的直线路径。
    if(!field.routes[cell] && walkable(p,target))return [{x:target.x,y:target.y,z:target.z}];
    if (field.dist[cell] < 0 || !walkable(p, point(cell))) {
      // 靠墙时玩家可能站在可行走格的边沿，连接最近且能直接走到的格心。
      let nearest = Infinity;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const i = field.index(p.x + dx * field.cell, p.z + dz * field.cell), q = point(i);
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < nearest && field.dist[i] >= 0 && walkable(p, q)) { nearest = d; cell = i; }
      }
      if (!Number.isFinite(nearest)) return [];
    }
    const nodes = [point(cell)];
    while (field.dist[cell] > 0) {
      const next = field.next(field.x(cell), field.z(cell));
      if (next === cell) return [];
      cell = next;
      nodes.push(point(cell));
    }
    if (walkable(nodes.at(-1), target)) nodes.push({ x: target.x, y: target.y, z: target.z });
    else if (layered) return [];
    const corners = [];
    let start = p, i = 0;
    while (i < nodes.length) {
      let end = i;
      if (!walkable(start, nodes[i])) return [];
      while (end + 1 < nodes.length && walkable(start, nodes[end + 1])) end++;
      start = nodes[end];
      corners.push(start);
      i = end + 1;
    }
    return corners;
  }
  return (p, target, stage='') => {
    const key = [stage, field.index(p.x,p.z), field.index(target.x,target.z), Math.round(p.y*2),
      Math.round(target.y*2), level.terrainRevision].join('/');
    if (key !== previous || path.length && !walkable(p, path[0])) {
      previous = key;
      path = build(p, target);
    }
    while (path.length > 1 && Math.hypot(p.x-path[0].x,p.z-path[0].z) < .65 && walkable(p,path[1]))
      path.shift();
    return path;
  };
}
