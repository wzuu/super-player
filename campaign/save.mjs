const prefix = 'super-player:pending:';

async function sendBattle(battle) {
  const response = await fetch('/api/battles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(battle),
    keepalive: true,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('对战写入失败');
  const result = await response.json();
  try {
    localStorage.removeItem(prefix + battle.id);
  } catch {
    // 对战已写入 SQLite。重复提交使用相同的对战 ID。
  }
  return result;
}

export async function flushPendingBattles() {
  let keys;
  try {
    keys = Object.keys(localStorage).filter(key => key.startsWith(prefix));
  } catch {
    return true;
  }
  let complete = true;
  for (const key of keys) {
    try {
      const entry = localStorage.getItem(key);
      if (entry) await sendBattle(JSON.parse(entry));
    } catch {
      complete = false;
    }
  }
  return complete;
}

export async function connectCampaign(level) {
  const home = document.getElementById('campaign-home');
  const next = document.getElementById('next-level');
  const retry = document.getElementById('retry-save');
  const status = document.getElementById('menu-status');
  let pending;
  let equippedSkin = null;
  try {
    const response = await fetch('/api/loadout', { cache: 'no-store', signal: AbortSignal.timeout(2500) });
    if (response.ok) ({ equippedSkin } = await response.json());
  } catch {
    // 本机存档暂不可读时仍可用关卡默认外观进入。
  }

  home.hidden = false;
  retry.addEventListener('click', () => {
    if (pending) save(pending);
  });

  async function save(battle) {
    retry.hidden = true;
    status.textContent = '正在保存对战记录';
    try {
      const result = await sendBattle(battle);
      if (pending !== battle) return;
      pending = null;
      if (result.nextLevel) {
        next.href = '/' + result.nextLevel.id + '/';
        next.textContent = '进入下一关 ' + result.nextLevel.title;
        next.hidden = false;
        status.textContent = '对战已保存，下一关已解锁。本关武器外观可在个人收藏佩戴。';
      } else {
        status.textContent = result.campaignCleared
          ? '对战已保存，全部关卡已通关。本关武器外观可在个人收藏佩戴。'
          : '对战已保存';
      }
    } catch {
      if (pending !== battle) return;
      status.textContent = '对战保存失败，请重试';
      retry.hidden = false;
    }
  }

  return {
    equippedSkin,
    reset() {
      pending = null;
      next.hidden = true;
      next.removeAttribute('href');
      retry.hidden = true;
    },
    finish({ won, kills, durationMs, loot }) {
      pending = {
        id: crypto.randomUUID(),
        level, won, kills, durationMs,
        endedAt: Date.now(),
        loot: loot.map(({ name, value }) => ({ name, value })),
      };
      // 页面离开前先保留待存记录，首页可以补写临时断开的请求。
      try {
        localStorage.setItem(prefix + pending.id, JSON.stringify(pending));
      } catch {
        // 浏览器禁用本地存储时仍尝试直接写入 SQLite。
      }
      save(pending);
    },
  };
}
