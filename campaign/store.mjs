import { activeProfile } from './profiles.mjs';
const root = new URL('../', import.meta.url);
let loading;

async function request(profile, path, data, timeout = 8000) {
  const options = {
    headers: { 'X-Campaign-Profile': profile },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeout),
  };
  if (data !== undefined)
    Object.assign(options, {
      method: 'POST',
      headers: { ...options.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      keepalive: path === 'battles',
    });
  const response = await fetch(new URL('api/' + path, root), options);
  if (!response.ok) throw new Error('战役存档请求失败');
  return response.json();
}

async function openCampaign() {
  const profile = activeProfile();
  const api = (...args) => request(profile, ...args);
  const namespace = root.pathname + (profile ? '@' + profile : '');
  if (globalThis.offlineCampaignLevels) {
    const { openBrowserStore } = await import('./browser-store.mjs');
    return openBrowserStore(globalThis.offlineCampaignLevels, namespace);
  }
  const manifest = await fetch(new URL('levels.json', import.meta.url), {
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!manifest.ok) throw new Error('无法读取战役关卡');
  const levels = await manifest.json();
  // 由本机服务明确标识 SQLite，临时写入失败时继续沿用同一份存档。
  if (manifest.headers.get('X-Super-Player-Store') === 'sqlite') {
    return {
      levels,
      pendingPrefix: profile ? 'super-player:' + profile + ':pending:' : 'super-player:pending:',
      progress: () => api('progress'),
      history: (before) => api('battles?before=' + encodeURIComponent(before)),
      report: id => api('report?id=' + encodeURIComponent(id)),
      replay: id => api('replay?id=' + encodeURIComponent(id)),
      saveReplay: (id, replay) => api('replay', { id, replay }),
      statistics: () => api('statistics'),
      discover: level => api('discovery',{level}),
      gear: () => api('gear'),
      writeGear: (data) => api('gear', data),
      loadout: () => api('loadout', undefined, 2500),
      equip: (skin) => api('loadout', { skin }),
      save: (battle) => api('battles', battle),
    };
  }
  const { openBrowserStore } = await import('./browser-store.mjs');
  return openBrowserStore(levels, namespace);
}

export function campaignStore() {
  loading ??= openCampaign().catch((error) => {
    loading = undefined;
    throw error;
  });
  return loading;
}
