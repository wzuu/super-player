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
];
export const defaults = {
  sensitivity: 1,
  fov: 73,
  volume: 80,
  muted: false,
  steady: false,
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
  ]) {
    if (Number.isFinite(raw[name])) prefs[name] = Math.max(min, Math.min(max, raw[name]));
  }
  for (const name of ['muted', 'steady', 'metrics', 'gamepad'])
    if (typeof raw[name] === 'boolean') prefs[name] = raw[name];
  if (['auto', 'high', 'medium', 'low'].includes(raw.quality)) prefs.quality = raw.quality;
  if (['assist', 'standard', 'hard'].includes(raw.difficulty)) prefs.difficulty = raw.difficulty;
  if (
    Object.keys(defaultKeys).every((id) => typeof raw.keys?.[id] === 'string') &&
    new Set(Object.keys(defaultKeys).map((id) => raw.keys[id])).size === Object.keys(defaultKeys).length
  ) {
    for (const id of Object.keys(defaultKeys)) prefs.keys[id] = raw.keys[id];
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
