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

// 摇杆离开起动圈后才转向，回到较小的停止圈时归零。按径向行程连续映射，保留斜向角度。
export class StickLook {
  peak = 0;

  reset() { this.peak = 0; }

  turn(rotation, x, y, dt, speed) {
    const start = .24, stop = .22;
    const radius = Math.hypot(x, y);
    const travel = Math.min(1, radius);
    if (!Number.isFinite(radius) || travel <= stop) {
      this.reset();
      return;
    }
    if (!this.peak && travel <= start) return;
    this.peak = Math.max(this.peak, travel);
    // 同一段操作从起动边缘平滑增至满幅，回程从已达到的幅度连续减至零。
    const peakOutput = (this.peak - start) / (1 - start);
    const output = peakOutput * (travel - stop) / (this.peak - stop);
    const scale = output * dt * 850 / radius;
    rotateLook(rotation, x * scale, y * scale, speed);
  }
}
