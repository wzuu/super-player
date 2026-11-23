const pitchLimit = Math.PI / 2 - 0.04;

// 单轴瞬间跨越近半圈会使俯视直接翻到仰视。另一轴和连续快速移动仍正常生效。
export function rotateLook(rotation, dx, dy, speed) {
  const radians = value => {
    const angle = value * 0.002 * speed;
    return Number.isFinite(angle) && Math.abs(value) < 900 && Math.abs(angle) < Math.PI / 2 ? angle : 0;
  };
  rotation.y -= radians(dx);
  rotation.x = Math.max(-pitchLimit, Math.min(pitchLimit, rotation.x - radians(dy)));
}
