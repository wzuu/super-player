import { catalog, defaultGear, isUnlocked, packKit, requisition, updateGear, modifications } from '../level-kit/src/gear.mjs';
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
  if (store.canEnter && !(await store.canEnter(level))) {
    location.replace(
      (location.protocol === 'file:' ? '../index.html' : '../') +
        '?locked=' +
        encodeURIComponent(level) +
        '#missions',
    );
    return null;
  }
  let pending;
  let equippedSkin = null;
  try {
    ({ equippedSkin } = await store.loadout());
  } catch {
    // 本机存档暂不可读时仍可用关卡默认外观进入。
  }

  if (location.protocol === 'file:') home.href = '../index.html';
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
      renderGear().catch(() => {});
      if (result.nextLevel) {
        next.href =
          '../' + result.nextLevel.id + (location.protocol === 'file:' ? '/index.html?campaign' : '/');
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

  const items = catalog(store.levels);
  const gearPanel = document.getElementById('preparation');
  const selectBox = document.getElementById('kit-slots');
  let dirty = false;
  let reservation = crypto.randomUUID();
  const selectors = [];
  async function renderGear() {
    const snapshot = await store.gear();
    const state = defaultGear(snapshot.state);
    selectBox.replaceChildren();
    selectors.length = 0;
    for (const [group, names] of [
      ['skills', ['技能一', '技能二']],
      ['items', ['道具一', '道具二']],
    ]) {
      names.forEach((name, index) => {
        const label = document.createElement('label'),
          select = document.createElement('select');
        label.append(name + ' ', select);
        select.add(new Option('空槽', ''));
        for (const [id, item] of Object.entries(items)) {
          if (!!item.skill !== (group === 'skills')) continue;
          const locked = !isUnlocked(item, store.levels, snapshot.cleared);
          const option = new Option(item.name + (locked ? ' · 通关第 ' + item.stage + ' 关解锁' : ''), id);
          option.disabled = locked;
          option.title = item.detail;
          select.add(option);
        }
        select.value = state[group][index] ?? '';
        select.onchange = () => {
          dirty = true;
        };
        selectors.push(select);
        selectBox.append(label);
      });
    }
    const shop = document.getElementById('shop-item');
    shop.replaceChildren();
    for (const [id, item] of Object.entries({ ...items, ...modifications })) {
      if (!item.price) continue;
      const unlocked = modifications[id] || isUnlocked(item, store.levels, snapshot.cleared);
      const label =
        item.name +
        ' · ' +
        item.price +
        ' 点 · ' +
        (modifications[id] ? (state.mods[id] ? '已安装' : item.detail) : '库存 ' + (state.stock[id] ?? 0));
      const option = new Option(label, id);
      option.disabled = !unlocked || !!state.mods[id];
      shop.add(option);
    }
    document.getElementById('credits').textContent = '军需点 ' + (snapshot.earned - state.spent);
    dirty = false;
  }
  const choice = () => selectors.map((s) => s.value || null);
  const applyChoice = (state, values, snapshot) => {
    for (const [group, ids] of [
      ['skills', values.slice(0, 2)],
      ['items', values.slice(2)],
    ]) {
      if (ids[0] && ids[0] === ids[1]) throw Error('同一种装备只能占一个槽位');
      if (ids.some((id) => id && !isUnlocked(items[id], store.levels, snapshot.cleared)))
        throw Error('尚未解锁');
      state[group] = ids;
    }
  };
  document.getElementById('shop-buy').onclick = async (event) => {
    const button = event.currentTarget,
      id = document.getElementById('shop-item').value;
    const selected = choice();
    button.disabled = true;
    try {
      await updateGear(store, (state, snapshot) => {
        if (dirty) applyChoice(state, selected, snapshot);
        if (items[id] && !isUnlocked(items[id], store.levels, snapshot.cleared)) throw Error('尚未解锁');
        requisition(state, id, snapshot.earned, items);
      });
      await renderGear();
      status.textContent = '兑换成功';
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  await renderGear();
  gearPanel.hidden = false;
  return {
    equippedSkin,
    async prepare() {
      const values = choice();
      const kit = await updateGear(store, (state, snapshot) => {
        // 网络超时后重试同一次出发，直接取回已装好的装备，避免再次扣库存。
        const receipts = (state.departures ??= {});
        if (receipts[reservation]) return structuredClone(receipts[reservation]);
        if (dirty) applyChoice(state, values, snapshot);
        const packed = packKit(state, items);
        receipts[reservation] = structuredClone(packed);
        const keys = Object.keys(receipts);
        if (keys.length > 32) delete receipts[keys[0]];
        return packed;
      });
      dirty = false;
      reservation = crypto.randomUUID();
      return kit;
    },
    reset() {
      pending = null;
      next.hidden = true;
      next.removeAttribute('href');
      retry.hidden = true;
    },
    finish({ won, kills, durationMs, loot, remaining }) {
      pending = {
        id: crypto.randomUUID(),
        level,
        won,
        kills,
        durationMs,
        remaining: won ? remaining : {},
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
