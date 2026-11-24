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

// 合并包的总位移可能超过单采样保护阈值；按时间顺序处理真实子采样，不能再累加外层事件。
export function applyMouseLook(rotation, event, speed, lockStartedAt, onSample) {
  if (event.timeStamp < lockStartedAt) return false;
  let handled = false;
  const apply = (dx, dy, time) => {
    if (!dx && !dy) return;
    handled = true;
    rotateLook(rotation, dx, dy, speed);
    onSample?.(dx, dy, time);
  };
  const samples = event.getCoalescedEvents?.();
  if (!samples?.length) {
    apply(event.movementX, event.movementY, event.timeStamp);
    return handled;
  }
  let hasX = false, hasY = false, stale = false;
  for (const sample of samples) {
    if (sample.timeStamp < lockStartedAt) { stale = true; continue; }
    hasX ||= Boolean(sample.movementX);
    hasY ||= Boolean(sample.movementY);
    apply(sample.movementX, sample.movementY, sample.timeStamp);
  }
  // 一些实现只在外层报告某轴相对位移。跨越重锁的包不能用总量，否则会带回旧锁的输入。
  if (!stale) apply(hasX ? 0 : event.movementX, hasY ? 0 : event.movementY, event.timeStamp);
  return handled || stale;
}

export async function requestMouseLock(canvas, onMode) {
  let raw = true, result;
  try {
    result = canvas.requestPointerLock({unadjustedMovement: true});
    await result;
  } catch (error) {
    if (error?.name !== 'NotSupportedError' && error?.name !== 'TypeError') throw error;
    raw = false;
    await canvas.requestPointerLock();
  }
  // 旧的 void API 可以忽略多余参数，无法据此确认系统加速度是否关闭。
  onMode?.(raw ? (typeof result?.then === 'function' ? 'unadjusted' : 'unconfirmed') : 'default');
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
