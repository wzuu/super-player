// 仅由诊断链接启用。按浏览器单调时钟对齐设备事件和实际提交绘制的帧。
export function createLookTrace(stage, button) {
  if (new URLSearchParams(location.search).get('lookTrace') !== '1') return null;
  const buffers = {mouse: ring(32768), frames: ring(2400), lock: ring(64), buttons: ring(256)};
  let last = 0;
  function ring(capacity) {
    return {rows:new Array(capacity), written:0};
  }
  function add(kind, row) {
    const b = buffers[kind];
    b.rows[b.written++ % b.rows.length] = row;
    last = Math.max(last, row[0]);
  }
  function recent(b, cutoff) {
    const rows = [];
    for (let i = Math.max(0,b.written-b.rows.length); i < b.written; i++) {
      const row = b.rows[i % b.rows.length];
      if (row[0] >= cutoff) rows.push(row);
    }
    return rows;
  }
  button.hidden = false;
  button.onclick = () => {
    const trace = {
      stage, browser:navigator.userAgent, timestampUnit:'milliseconds', simulationTimeUnit:'seconds', angleUnit:'radians',
      columns:{
        mouse:['eventTime','receivedTime','movementX','movementY','yawAfter','pitchAfter'],
        frames:['time','simulationTime','yaw','pitch','cameraQx','cameraQy','cameraQz','cameraQw',
          'stickX','stickY','shoulder','recoil','impactRemaining','encounterActive','drawn','mouseFire','ammo','reserve',
          'reloadLeft','shots','muzzleFlash','focused'],
        lock:['time','locked','requestedInput'],
        buttons:['eventTime','receivedTime','held','buttons'],
      },
      ...Object.fromEntries(Object.entries(buffers).map(([k,v]) => [k,recent(v,k==='lock' ? 0 : last-20000)])),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(trace)], {type:'application/json'}));
    const link = document.createElement('a');
    link.href = url; link.download = 'super-player-look.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  let stickX = 0, stickY = 0;
  return {
    mouse(dx,dy,time,rotation) { add('mouse',[time,performance.now(),dx,dy,rotation.y,rotation.x]); },
    pad(x,y) { stickX=x; stickY=y; },
    lock(locked,mode) { add('lock',[performance.now(),locked,mode]); },
    button(event,held) { add('buttons',[event.timeStamp,performance.now(),held,event.buttons]); },
    frame(g,camera,drawn,fire) {
      const p=g.player, q=camera.quaternion;
      add('frames',[performance.now(),g.time,p.look.rotation.y,p.look.rotation.x,q.x,q.y,q.z,q.w,
        stickX,stickY,p.thirdPerson,p.recoil,p.impactLeft,Boolean(g.encounter?.active),drawn,fire,g.weapon.ammo,
        Number.isFinite(g.weapon.reserve) ? g.weapon.reserve : 'unlimited',
        g.weapon.reloadLeft,g.performance.shots,g.weapon.flash,document.hasFocus()]);
    },
  };
}
