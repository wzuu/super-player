// 保留领跑者的名额，避免两只同等大小的敌人在镜头边缘反复互换精模。
export class BeastDetailBudget {
  constructor() {
    this.ranked = [];
    this.counts = {near: 0, mid: 0, far: 0, bossNear: 0, nearBudget: 0};
  }

  select(pool, camera, appearance, quality) {
    const ranked = this.ranked, counts = this.counts;
    ranked.length = 0;
    counts.near = counts.mid = counts.far = counts.bossNear = 0;
    counts.nearBudget = appearance.detailEnabled ? appearance.nearBudgets[quality] : 0;
    // 投影矩阵包含动态视野，分数取凶兽高度占垂直视野的比例。
    const projection = camera.projectionMatrix.elements, view = camera.matrixWorldInverse.elements;
    for (const b of pool) {
      if (!b.active || !b.submitBody) continue;
      const x = b.x - camera.position.x, z = b.z - camera.position.z;
      const y = b.y - camera.position.y;
      const distance2 = x*x + y*y + z*z;
      const far = appearance.far + (b.farLOD ? -appearance.hysteresis : appearance.hysteresis);
      b.farLOD = b.type !== 3 && distance2 > far*far;
      const retained = b.nearLOD;
      b.nearLOD = false;
      if (!appearance.detailEnabled || b.farLOD) continue;
      const near = appearance.near * (b.type === 3 ? 2 : 1)
        + (retained ? appearance.nearHysteresis : -appearance.nearHysteresis);
      if (distance2 > near*near) continue;
      // 可见性取主相机与镜面的并集；只在镜中出现的个体仍绘制中/远模，
      // 主镜头前方的敌人优先占用近模名额。以包围范围接受跨越屏幕边缘的目标。
      const centerY=b.y+b.height*.5, radius=Math.max(b.radius ?? 0,b.height*.6);
      const depth=-(view[2]*b.x+view[6]*centerY+view[10]*b.z+view[14]);
      if(depth+radius<=camera.near)continue;
      const cx=view[0]*b.x+view[4]*centerY+view[8]*b.z+view[12];
      const cy=view[1]*b.x+view[5]*centerY+view[9]*b.z+view[13];
      if(Math.abs(cx)>Math.max(0,depth)/projection[0]+radius ||
         Math.abs(cy)>Math.max(0,depth)/projection[5]+radius)continue;
      const height = b.height * projection[5] / (2*Math.max(camera.near,depth));
      if (height < (retained ? .055 : .07)) continue;
      if (b.type === 3) {
        b.nearLOD = true;
        counts.bossNear++;
        continue;
      }
      b.detailScore = height * (retained ? 1.2 : 1)
        * (b.mode === 'windup' || b.mode === 'charge' || b.flash > 0 ? 1.5 : b.alert > 0 ? 1.15 : 1);
      // 只排列能占用名额的少量实例；相同分数按池顺序稳定。
      let at = ranked.length;
      while (at > 0 && b.detailScore > ranked[at-1].detailScore) at--;
      if (at >= counts.nearBudget) continue;
      ranked.splice(at, 0, b);
      if (ranked.length > counts.nearBudget) ranked.pop();
    }
    for (const b of ranked) b.nearLOD = true;
    this.corpseSlots = counts.nearBudget - ranked.length;
  }
}
