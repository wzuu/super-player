const width = 512, height = 128;
const tau = Math.PI * 2;

export function rifleRandom(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

export function rifleTexture(THREE, w, h, paint, color = true) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  paint(ctx, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function stroke(ctx, points, color, weight = 2) {
  ctx.beginPath();
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.lineWidth = weight; ctx.strokeStyle = color; ctx.stroke();
}

function ring(ctx, x, y, radius, color, weight = 2) {
  ctx.beginPath(); ctx.arc(x, y, radius, 0, tau);
  ctx.lineWidth = weight; ctx.strokeStyle = color; ctx.stroke();
}

function type(ctx, text, x, y, color, size = 20) {
  ctx.font = 'bold ' + size + 'px monospace';
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}

function flecks(ctx, rand, colors, count, size) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(rand() * width, rand() * height, 1 + rand() * size, 1 + rand() * size * .4);
  }
}

function stains(ctx, rand, colors, count, size) {
  for (let i = 0; i < count; i++) {
    const x = rand() * width, y = rand() * height, r = 2 + rand() * size;
    const blend = ctx.createRadialGradient(x, y, 0, x, y, r);
    blend.addColorStop(0, colors[i % colors.length]); blend.addColorStop(1, 'transparent');
    ctx.fillStyle = blend; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function hazard(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = '#eab92e'; ctx.fillRect(x, y, w, h);
  for (let i = -h; i < w; i += 34) {
    stroke(ctx, [[x + i, y + h], [x + i + h, y]], '#2c2921', 14);
  }
  ctx.restore();
}

function biohazard(ctx, x, y) {
  ctx.save(); ctx.translate(x, y);
  const ink = '#282f2c';
  ring(ctx, 0, 0, 16, ink, 4);
  for (let i = 0; i < 3; i++) {
    ctx.rotate(tau / 3);
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(0, -16, 16, 0, tau); ctx.fill();
    ctx.fillStyle = '#c9cac1'; ctx.beginPath(); ctx.arc(0, -21, 11, 0, tau); ctx.fill();
    stroke(ctx, [[0, -6], [0, 4]], '#c9cac1', 5);
  }
  ring(ctx, 0, 0, 5, ink, 2); ctx.restore();
}

function bronzePattern(ctx, color) {
  // 饕餮的两半与云雷回纹共用同一高度图，受光时有实际凹刻感。
  for (const side of [1, -1]) {
    ctx.save(); ctx.translate(256, 66); ctx.scale(side, 1);
    stroke(ctx, [[0, -21], [15, -12], [30, -34], [74, -31], [101, -12], [76, -9], [64, -19],
      [37, -18], [22, 0], [40, 17], [66, 16], [85, 2], [72, 31], [44, 36], [25, 30], [0, 19]], color, 4);
    ring(ctx, 51, -3, 9, color, 5);
    ctx.restore();
  }
  for (const x of [14, 53, 93, 382, 421, 460]) {
    stroke(ctx, [[x, 54], [x + 34, 54], [x + 34, 91], [x + 5, 91], [x + 5, 63],
      [x + 24, 63], [x + 24, 82], [x + 13, 82], [x + 13, 71]], color, 3);
  }
}

function jadePattern(ctx, color) {
  for (let x = 12; x < width - 28; x += 42) {
    stroke(ctx, [[x, 36], [x, 27], [x + 9, 27], [x + 9, 18], [x + 26, 18], [x + 26, 27],
      [x + 35, 27], [x + 35, 36]], color, 3);
    stroke(ctx, [[x, 104], [x, 111], [x + 9, 111], [x + 9, 118], [x + 26, 118], [x + 26, 111],
      [x + 35, 111], [x + 35, 104]], color, 3);
  }
  stroke(ctx, [[63, 77], [91, 58], [121, 62], [163, 83], [202, 81], [240, 58],
    [283, 57], [323, 79], [360, 76], [389, 57], [411, 53], [441, 64], [418, 79], [394, 77]], color, 5);
  ring(ctx, 418, 63, 4, color, 3);
  for (let x = 130; x < 380; x += 17) {
    const y = 69 + Math.sin((x - 130) * .024) * 12;
    stroke(ctx, [[x, y], [x - 13, y - 14], [x - 4, y - 17], [x + 8, y]], color, 2);
  }
}

function normalPattern(THREE, paint) {
  return rifleTexture(THREE, width, height, ctx => {
    ctx.fillStyle = '#555'; ctx.fillRect(0, 0, width, height);
    paint(ctx, '#ddd');
    const source = ctx.getImageData(0, 0, width, height).data;
    const image = ctx.createImageData(width, height);
    const at = (x, y) => source[(y * width + x) * 4] / 255;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const a = (at(x - 1, y) - at(x + 1, y)) * 2;
        const b = (at(x, y - 1) - at(x, y + 1)) * 2;
        const scale = 127 / Math.hypot(a, b, 1), offset = (y * width + x) * 4;
        image.data.set([128 + a * scale, 128 - b * scale, 128 + scale, 255], offset);
      }
    }
    ctx.fillStyle = '#8080ff'; ctx.fillRect(0, 0, width, height);
    ctx.putImageData(image, 0, 0, 1, 1, width - 2, height - 2);
  }, false);
}

function voronoi(THREE) {
  const step = 37, columns = Math.ceil(width / step) + 2, rows = Math.ceil(height / step) + 2;
  const random = rifleRandom(31314);
  const cells = Array.from({ length: columns * rows }, (_, i) => ({
    x: (i % columns - 1 + .16 + random() * .68) * step,
    y: (Math.floor(i / columns) - 1 + .16 + random() * .68) * step,
  }));
  return rifleTexture(THREE, width, height, ctx => {
    const image = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const row = Math.floor(y / step), col = Math.floor(x / step);
        let nearest = Infinity, second = Infinity;
        const warp = 2.9 * Math.sin(y * .13) + 1.3 * Math.sin(x * .25);
        for (let cy = row; cy <= row + 2; cy++) {
          for (let cx = col; cx <= col + 2; cx++) {
            const cell = cells[cy * columns + cx];
            const d = (x + warp - cell.x) ** 2 + (y - cell.y) ** 2;
            if (d < nearest) { second = nearest; nearest = d; }
            else second = Math.min(second, d);
          }
        }
        const edge = Math.sqrt(second) - Math.sqrt(nearest);
        const glow = Math.max(0, 1 - edge / 2.8);
        const pixel = 4 * (y * width + x);
        image.data[pixel] = Math.round(255 * glow);
        image.data[pixel + 1] = Math.round(67 * glow * glow);
        image.data[pixel + 2] = Math.round(8 * glow);
        image.data[pixel + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  });
}

function royalMark(ctx) {
  const ink = '#6c4a2c';
  stroke(ctx, [[171, 59], [212, 41], [255, 42], [291, 56], [252, 71], [213, 72], [171, 59]], ink, 5);
  ring(ctx, 235, 56, 11, ink, 4);
  stroke(ctx, [[249, 69], [244, 91], [226, 106], [208, 100], [216, 91]], ink, 5);
  stroke(ctx, [[267, 66], [270, 87], [282, 95]], ink, 5);
  for (const x of [29, 70, 113, 328, 370, 416, 456]) {
    ring(ctx, x + 6, 52, 8, ink, 2);
    stroke(ctx, [[x - 7, 85], [x + 6, 66], [x + 20, 85], [x - 7, 85]], ink, 3);
  }
}

function gothicMark(ctx) {
  const silver = '#dbccd1';
  for (let x = 22; x < width; x += 43) {
    ctx.strokeStyle = silver; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(x - 13, 103); ctx.bezierCurveTo(x - 13, 85, x - 12, 75, x, 67);
    ctx.bezierCurveTo(x + 12, 75, x + 13, 85, x + 13, 103); ctx.closePath(); ctx.stroke();
  }
  ring(ctx, 251, 45, 26, silver, 2);
  for (let i = 0; i < 8; i++) {
    const a = i * tau / 8;
    ring(ctx, 251 + Math.cos(a) * 14, 45 + Math.sin(a) * 14, 8, silver, 2);
  }
  stroke(ctx, [[16, 15], [197, 15], [212, 26]], silver);
  stroke(ctx, [[301, 26], [318, 15], [496, 15]], silver);
}

export function rifleFinish(THREE, id, skin) {
  const map = rifleTexture(THREE, width, height, ctx => {
    const rand = rifleRandom(74106);
    const paint = ctx.createLinearGradient(0, 0, 0, height);
    paint.addColorStop(0, skin.base); paint.addColorStop(.46, skin.base); paint.addColorStop(1, skin.dark);
    ctx.fillStyle = paint; ctx.fillRect(0, 0, width, height);
    switch (id) {
      case 'underground-lab':
        stains(ctx, rand, ['#66532b73', '#72803696', '#292b33a1'], 68, 20);
        hazard(ctx, 0, 5, 512, 23); hazard(ctx, 270, 96, 242, 19);
        biohazard(ctx, 226, 63); type(ctx, 'BIO / LAB-01', 22, 73, '#373b32');
        type(ctx, 'SPECIMEN', 293, 69, '#393e30', 22);
        break;
      case 'shanhai-secret-realm':
        stains(ctx, rand, ['#24584be8', '#63a688bb', '#55331dcc'], 133, 22);
        bronzePattern(ctx, '#d9a878');
        break;
      case 'rain-city':
        stains(ctx, rand, ['#9f421cdc', '#321f1bca', '#1c2839ca', '#cc7233b0'], 83, 29);
        flecks(ctx, rand, ['#949b8980', '#291c1870'], 240, 8);
        ctx.save(); ctx.translate(218, 75); ctx.rotate(-.11);
        type(ctx, '下城制造', -94, 7, '#a6d0ca', 41);
        stroke(ctx, [[-97, 17], [45, 22], [92, 10]], '#af633d', 5); ctx.restore();
        for (let i = 0; i < 72; i++) {
          const x = rand() * width, y = rand() * height;
          stroke(ctx, [[x, y], [x + 2, y + 5 + rand() * 45]], '#cae2f239', 1.3);
        }
        break;
      case 'buried-tomb':
        flecks(ctx, rand, ['#ffecc38c', '#70502a6b', '#b996546e'], 2100, 4);
        royalMark(ctx);
        break;
      case 'polar-station':
        ctx.fillStyle = '#e97029'; ctx.fillRect(8, 34, 205, 55);
        type(ctx, 'ARC / 05', 20, 71, '#252c30', 35); type(ctx, 'POLAR SURVEY', 237, 70, '#10223b', 23);
        stains(ctx, rand, ['#e1f5ff90', '#f3fbffb0'], 100, 14);
        flecks(ctx, rand, ['#f0f8ffc9', '#c3e8ffc0', '#527a986e'], 660, 4);
        break;
      case 'drowned-city':
        for (let i = 0; i < 44; i++) {
          const x = rand() * width, y = rand() * height;
          ring(ctx, x, y, 1 + rand() * 7, '#eef4e48c');
          stroke(ctx, [[x, y + 12], [x + 8, y], [x + 6, y - 12], [x + 16, y - 24]], '#39847f70', 2);
        }
        type(ctx, 'ABYSS', 173, 81, '#e1f2e4', 29);
        break;
      case 'ember-fortress':
        stains(ctx, rand, ['#87738465', '#060507d9'], 125, 18);
        flecks(ctx, rand, ['#b78b7f52', '#181218aa'], 300, 4);
        break;
      case 'derelict-station':
        hazard(ctx, 332, 78, 149, 35);
        type(ctx, 'OS-08', 21, 78, '#25394e', 44);
        type(ctx, 'ORBITAL SYSTEMS', 232, 55, '#244a70', 22);
        for (let x = 232; x < 486; x += 28) ring(ctx, x, 18, 5, '#4d7291');
        for (let i = 0; i < 62; i++) {
          const x = rand() * width, y = rand() * height;
          stroke(ctx, [[x, y], [x + 8 + rand() * 14, y - 4]], '#f5faff85', 1);
        }
        break;
      case 'neon-undercity':
        for (let y = 0; y < height; y += 8) {
          for (let x = 0; x < width; x += 8) {
            const warp = ((x + y) / 8) % 2;
            ctx.fillStyle = warp ? '#313140' : '#181923'; ctx.fillRect(x, y, 8, 8);
            ctx.fillStyle = warp ? '#474657' : '#252733';
            ctx.fillRect(x + (warp ? 1 : 0), y + (warp ? 0 : 1), warp ? 2 : 8, warp ? 8 : 2);
          }
        }
        ctx.fillStyle = '#623055'; ctx.fillRect(49, 33, 161, 54);
        type(ctx, '義体工房', 63, 71, '#fcc6f5', 31); type(ctx, '電脳 / 09', 264, 73, '#a5fff5', 27);
        break;
      case 'jungle-temple':
        stains(ctx, rand, ['#a9e49cbf', '#12746cbf', '#cde8a777'], 100, 28);
        jadePattern(ctx, '#cfdda3');
        break;
      case 'bloodmoon-castle':
        gothicMark(ctx);
        break;
      case 'sakura-night-town':
        for (const y of [10, 109]) {
          stroke(ctx, [[2, y], [118, y], [132, y + 8], [372, y + 8], [387, y], [510, y]], '#edb55a', 3);
        }
        for (let i = 0; i < 21; i++) {
          ctx.save(); ctx.translate(rand() * width, 24 + rand() * 74); ctx.rotate(rand() * tau);
          for (let petal = 0; petal < 5; petal++) {
            ctx.rotate(tau / 5); ctx.beginPath(); ctx.ellipse(0, -5, 3, 5, 0, 0, tau);
            ctx.fillStyle = '#e7b075ad'; ctx.fill();
          }
          ctx.restore();
        }
        break;
      case 'brass-factory':
        stains(ctx, rand, ['#70402ce0', '#402e28d0', '#26292c9f'], 78, 19);
        flecks(ctx, rand, ['#e6c68c', '#493f38', '#75513a'], 890, 4);
        for (let i = 0; i < 42; i++) {
          const x = rand() * width, y = rand() * height;
          stroke(ctx, [[x, y], [x + 8 + rand() * 30, y - 3]], '#f6dca985', 1);
        }
        type(ctx, 'BOILER WORKS', 143, 78, '#382f22', 27);
        break;
      case 'haunted-midway':
        for (let x = -60; x < width; x += 68) {
          stroke(ctx, [[x, height], [x + 64, 0]], '#d8c298', 32);
        }
        flecks(ctx, rand, ['#583e31c0', '#866040d0', '#443a31a8'], 1370, 8);
        for (let i = 0; i < 40; i++) {
          const y = rand() * height, x = rand() * width;
          stroke(ctx, [[x, y], [x + 18, y - 2], [x + 49, y]], '#402d287c', 1);
        }
        break;
    }
    flecks(ctx, rand, ['#fff8e03d', '#10151d30'], 330, 4);
    stroke(ctx, [[0, 4], [width, 4]], '#eee0c290', 2);
    stroke(ctx, [[0, 123], [width, 123]], '#211c2270', 2);
  });
  const pattern = id === 'shanhai-secret-realm' ? bronzePattern : id === 'jungle-temple' ? jadePattern : null;
  return {
    map,
    normalMap: pattern ? normalPattern(THREE, pattern) : null,
    emissiveMap: id === 'ember-fortress' ? voronoi(THREE) : null,
  };
}

export function rifleWood(THREE, base) {
  return rifleTexture(THREE, width, height, ctx => {
    const rand = rifleRandom(7196);
    ctx.fillStyle = base; ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 145; i++) {
      const y = rand() * height, wave = rand() * 20 - 10;
      ctx.beginPath(); ctx.moveTo(0, y);
      ctx.bezierCurveTo(124, y + wave, 294, y - wave, width, y + wave * .4);
      ctx.strokeStyle = i % 3 ? '#17101480' : '#f6ac634e';
      ctx.lineWidth = .4 + rand() * 1.9; ctx.stroke();
    }
  });
}

export function rifleFrost(THREE, base) {
  return rifleTexture(THREE, width, height, ctx => {
    const rand = rifleRandom(7943);
    ctx.fillStyle = base; ctx.fillRect(0, 0, width, height);
    stains(ctx, rand, ['#e4f6ffe8', '#aacde6a7'], 110, 24);
    flecks(ctx, rand, ['#ffffffaf', '#a8d1f1b0', '#f1faffdc'], 1400, 6);
  });
}
