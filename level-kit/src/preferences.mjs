// 暂停开放红点瞄准，保留玩家已保存的操作方式供恢复时使用。
export const RED_DOT_AIM_ENABLED = false;

export const defaultKeys = {
  KeyW: 'KeyW',
  KeyA: 'KeyA',
  KeyS: 'KeyS',
  KeyD: 'KeyD',
  ShiftLeft: 'ShiftLeft',
  Space: 'Space',
  KeyR: 'KeyR',
  KeyC: 'KeyC',
  KeyF: 'KeyF',
  KeyQ: 'KeyQ',
  KeyE: 'KeyE',
  Digit1: 'Digit1',
  Digit2: 'Digit2',
  KeyM: 'KeyM',
  KeyI: 'KeyI',
  KeyV: 'KeyV',
  KeyG: 'KeyG',
};
export const actionLabels = [
  '前进',
  '左移',
  '后退',
  '右移',
  '冲刺',
  '跳跃',
  '换弹',
  '蹲伏',
  '交互',
  '技能一',
  '技能二',
  '道具一',
  '道具二',
  '切换音效',
  '检视武器',
  '切换视角',
  '确认深入',
];
export const defaults = {
  sensitivity: 1,
  aimMode: 'toggle',
  fov: 73,
  volume: 80,
  muted: false,
  recordReplay: false,
  steady: false,
  hitShake: 1,
  attackShake: 0.5,
  directionIndicators: true,
  difficulty: 'standard',
  quality: 'auto',
  metrics: false,
  gamepad: true,
};
const key = 'super-player:preferences:v1';
export function preferences() {
  let raw = {};
  try {
    raw = JSON.parse(localStorage.getItem(key)) ?? {};
  } catch {
    /* 私密窗口使用默认值 */
  }
  const prefs = { ...defaults, keys: { ...defaultKeys } };
  for (const [name, min, max] of [
    ['sensitivity', 0.25, 3],
    ['fov', 55, 105],
    ['volume', 0, 100],
    ['hitShake', 0, 1],
    ['attackShake', 0, 1],
  ]) {
    if (Number.isFinite(raw[name])) prefs[name] = Math.max(min, Math.min(max, raw[name]));
  }
  for (const name of ['muted', 'steady', 'metrics', 'gamepad', 'directionIndicators', 'recordReplay'])
    if (typeof raw[name] === 'boolean') prefs[name] = raw[name];
  if (['auto', 'high', 'medium', 'low'].includes(raw.quality)) prefs.quality = raw.quality;
  if (raw.aimMode === 'hold') prefs.aimMode = 'hold';
  if (['assist', 'standard', 'hard'].includes(raw.difficulty)) prefs.difficulty = raw.difficulty;
  const saved = Object.keys(defaultKeys).filter(id => typeof raw.keys?.[id] === 'string' && raw.keys[id]);
  const used = new Set(saved.map(id => raw.keys[id]));
  if (used.size === saved.length) {
    for (const id of saved) prefs.keys[id] = raw.keys[id];
    for (const id of Object.keys(defaultKeys).filter(id => !saved.includes(id))) {
      // 新增动作时保留旧改绑，优先使用默认键，其次使用空出的键位。
      const code = [defaultKeys[id], ...Object.values(defaultKeys), 'KeyJ', 'KeyK'].find(key => !used.has(key));
      prefs.keys[id] = code;
      used.add(code);
    }
  }
  return prefs;
}
export function storePreferences(prefs) {
  localStorage.setItem(key, JSON.stringify(prefs));
}
export function keyName(code) {
  return code
    .replace(/^(Key|Digit)/, '')
    .replace('ShiftLeft', 'Shift')
    .replace('Space', '空格');
}

export function aimInstructions(mode) {
  if (!RED_DOT_AIM_ENABLED) return '';
  return mode === 'hold' ? '按住右键开镜，松开退镜' : '单击右键开镜，再次单击退镜';
}

export function bindSoundControl({ button, apply = () => {}, shortcut }) {
  let binding, temporaryMute;
  function refresh(prefs = preferences()) {
    if (temporaryMute !== undefined) prefs = { ...prefs, muted: temporaryMute };
    binding = shortcut ?? prefs.keys.KeyM;
    if (button) {
      button.textContent = (prefs.muted ? '已静音' : '音效开启') + ' · ' + keyName(binding);
      button.setAttribute('aria-pressed', String(!prefs.muted));
    }
    apply(prefs);
  }
  function toggle() {
    const prefs = preferences();
    prefs.muted = !(temporaryMute ?? prefs.muted);
    try {
      storePreferences(prefs);
      temporaryMute = undefined;
    } catch {
      temporaryMute = prefs.muted;
    }
    refresh(prefs);
  }
  button?.addEventListener('click', toggle);
  document.addEventListener('keydown', event => {
    if (event.repeat || event.defaultPrevented || event.isComposing || event.altKey || event.metaKey || event.ctrlKey ||
        event.target.closest?.('input, select, textarea, [contenteditable="true"], #panel[open]') ||
        event.code !== binding) return;
    event.preventDefault();
    toggle();
  });
  window.addEventListener('pageshow', () => refresh());
  window.addEventListener('storage', event => { if (event.key === key || event.key === null) refresh(); });
  refresh();
  return refresh;
}
