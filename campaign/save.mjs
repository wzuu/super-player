import { campaignStore } from './store.mjs';

async function sendBattle(battle, store) {
  const result = await store.save(battle);
  try {
    localStorage.removeItem(store.pendingPrefix + battle.id);
  } catch {
    // 战役记录已保存。重复提交使用相同的对战 ID。
  }
  return result;
}

export async function* flushPendingBattles() {
  const store = await campaignStore();
  let keys;
  try {
    keys = Object.keys(localStorage).filter(key => key.startsWith(store.pendingPrefix));
  } catch {
    return;
  }
  for (const key of keys) {
    let battle;
    try {
      const entry = localStorage.getItem(key);
      if (!entry) continue;
      battle = JSON.parse(entry);
      await sendBattle(battle, store);
    } catch {
      yield null;
      continue;
    }
    yield battle;
  }
}

export async function connectCampaign(level) {
  const home = document.getElementById('campaign-home');
  const next = document.getElementById('next-level');
  const retry = document.getElementById('retry-save');
  const status = document.getElementById('menu-status');
  const store = await campaignStore();
  if (store.canEnter && !await store.canEnter(level)) {
    location.replace('../?locked=' + encodeURIComponent(level) + '#missions');
    return null;
  }
  let pending;
  let equippedSkin = null;
  try {
    ({ equippedSkin } = await store.loadout());
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
      const result = await sendBattle(battle, store);
      if (pending !== battle) return;
      pending = null;
      if (result.nextLevel) {
        next.href = '../' + result.nextLevel.id + '/';
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
        localStorage.setItem(store.pendingPrefix + pending.id, JSON.stringify(pending));
      } catch {
        // localStorage 不可用时仍尝试写入战役存档。
      }
      save(pending);
    },
  };
}
