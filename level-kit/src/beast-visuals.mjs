// 远模从关卡原始身体聚类，保留主题剪影和独立的发光部件。
export function distantBody(THREE, source, cells) {
  source.computeBoundingBox();
  const bounds = source.boundingBox,
    size = bounds.getSize(new THREE.Vector3());
  const step = Math.max(size.x, size.y, size.z) / cells;
  const pos = source.attributes.position,
    colors = source.attributes.color;
  const vertices = [],
    groups = new Map(),
    mapped = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i);
    const key = [x - bounds.min.x, y - bounds.min.y, z - bounds.min.z].map((v) => Math.round(v / step)).join(',');
    let id = groups.get(key);
    if (id === undefined) {
      id = vertices.length;
      groups.set(key, id);
      vertices.push({ x: 0, y: 0, z: 0, n: 0 });
    }
    const v = vertices[id];
    v.x += x;
    v.y += y;
    v.z += z;
    v.n++;
    mapped[i] = id;
  }
  const positions = [],
    tints = [];
  for (let i = 0; i < (source.index?.count ?? pos.count); i += 3) {
    const face = [i, i + 1, i + 2].map((k) => source.index?.getX(k) ?? k);
    const [a, b, c] = face.map((k) => mapped[k]);
    if (a === b || b === c || c === a) continue;
    for (const k of face) {
      const v = vertices[mapped[k]];
      positions.push(v.x / v.n, v.y / v.n, v.z / v.n);
      tints.push(colors.getX(k), colors.getY(k), colors.getZ(k));
    }
  }
  const reduced = new THREE.BufferGeometry();
  reduced.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  reduced.setAttribute('color', new THREE.Float32BufferAttribute(tints, 3));
  reduced.computeVertexNormals();
  return reduced;
}

export function hideTexture(canvasTexture, surface) {
  return canvasTexture(
    64,
    64,
    (ctx) => {
      ctx.fillStyle = '#fcfaf8';
      ctx.fillRect(0, 0, 64, 64);
      ctx.lineWidth = 1.3;
      for (let y = -8; y < 72; y += 8)
        for (let x = -8; x < 72; x += 8) {
          const offset = y % 16 === 0 ? 4 : 0;
          ctx.strokeStyle = (x + y) % 24 === 0 ? '#b9ada2' : '#d8cfc4';
          ctx.beginPath();
          ctx.moveTo(x + offset, y);
          if (surface === 'metal') {
            ctx.lineTo(x + offset + 5, y + 1);
            ctx.fillStyle = '#b3b8b9';
            ctx.fillRect(x + offset + 6, y + 3, 1, 1);
          } else if (surface === 'fur') {
            ctx.quadraticCurveTo(x + offset + 4, y + 2, x + offset + 2, y + 7);
          } else {
            ctx.quadraticCurveTo(x + offset + 4, y + 7, x + offset + 8, y);
          }
          ctx.stroke();
        }
    },
    true,
  );
}

// 以原模型表面的顶点作为附件根部，避免飞鱼、浮空无人机等非标准体型出现悬空部件。
export function detailedBody({ THREE, mergeGeometries }, source, type, appearance, rage = false) {
  source.computeBoundingBox();
  const bounds = source.boundingBox,
    size = bounds.getSize(new THREE.Vector3());
  const pos = source.attributes.position,
    rgb = source.attributes.color;
  const near = [source],
    cone = new THREE.ConeGeometry(0.5, 1, 5).toNonIndexed();
  const plate = new THREE.IcosahedronGeometry(0.5, 0),
    tint = new THREE.Color(),
    accent = new THREE.Color(appearance.accent[type]);
  const pieces = appearance.details[type];
  for (const [shape, x, y, z, w, h, d, tilt] of pieces) {
    for (const side of x === 0 ? [1] : [-1, 1]) {
      const targetX = bounds.min.x + size.x * (0.5 + x * side);
      const targetY = bounds.min.y + size.y * y,
        targetZ = bounds.min.z + size.z * z;
      let nearest = 0,
        best = Infinity;
      for (let i = 0; i < pos.count; i++) {
        const dist = (pos.getX(i) - targetX) ** 2 + (pos.getY(i) - targetY) ** 2 + (pos.getZ(i) - targetZ) ** 2;
        if (dist < best) {
          nearest = i;
          best = dist;
        }
      }
      const g = (shape === 'fin' ? cone : plate).clone(),
        length = h * size.y * (rage ? 1.3 : 1);
      g.scale(w * size.x, length, d * size.z).rotateZ(side * tilt);
      g.translate(pos.getX(nearest), pos.getY(nearest) + length * 0.18, pos.getZ(nearest));
      tint.fromBufferAttribute(rgb, nearest).lerp(accent, 0.46);
      const count = g.attributes.position.count,
        colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) tint.toArray(colors, i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      near.push(g);
    }
  }
  const merged = mergeGeometries(near);
  near.slice(1).forEach((g) => g.dispose());
  cone.dispose();
  plate.dispose();
  return merged;
}
// 把两级模型和发光部件一起对齐到足底与实际碰撞高度；由同一包围盒计算命中范围。
export function fitBeastModel(body, eyes, far, stats, widthScale) {
  body.computeBoundingBox();
  eyes.computeBoundingBox();
  const bounds = body.boundingBox.clone().union(eyes.boundingBox);
  const heightScale = stats.height / Math.max(.01, bounds.max.y - bounds.min.y);
  for (const geometry of [body, eyes, far]) {
    if (geometry) geometry.translate(0, -bounds.min.y, 0).scale(widthScale, heightScale, widthScale);
  }
  return {
    x: Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)) * widthScale,
    z: Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)) * widthScale,
  };
}
