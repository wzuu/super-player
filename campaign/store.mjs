const root = new URL('../', import.meta.url);
let loading;

async function api(path, data, timeout = 8000) {
  const options = { cache: 'no-store', signal: AbortSignal.timeout(timeout) };
  if (data !== undefined) Object.assign(options, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    keepalive: path === 'battles',
  });
  const response = await fetch(new URL('api/' + path, root), options);
  if (!response.ok) throw new Error('战役存档请求失败');
  return response.json();
}

async function openCampaign() {
  const manifest = await fetch(new URL('levels.json', import.meta.url), {
    cache: 'no-store', signal: AbortSignal.timeout(8000),
  });
  if (!manifest.ok) throw new Error('无法读取战役关卡');
  // 由本机服务明确标识 SQLite，临时写入失败时继续沿用同一份存档。
  if (manifest.headers.get('X-Super-Player-Store') === 'sqlite') {
    return {
      pendingPrefix: 'super-player:pending:',
      progress: () => api('progress'),
      history: before => api('battles?before=' + encodeURIComponent(before)),
      loadout: () => api('loadout', undefined, 2500),
      equip: skin => api('loadout', { skin }),
      save: battle => api('battles', battle),
    };
  }
  const { openBrowserStore } = await import('./browser-store.mjs');
  return openBrowserStore(await manifest.json(), root.pathname);
}

export function campaignStore() {
  loading ??= openCampaign().catch(error => {
    loading = undefined;
    throw error;
  });
  return loading;
}
