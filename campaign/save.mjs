import { catalog, defaultGear, isUnlocked, packKit, requisition, updateGear, modifications } from '../level-kit/src/gear.mjs';
import { campaignStore } from './store.mjs';
import { chooseFirstEntry, hasEntryChoice } from './onboarding.mjs';

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
  if (!hasEntryChoice()) await chooseFirstEntry((await store.progress()).battleCount, '../practice/index.html?mode=tutorial', store.pendingPrefix);
  let pendingReplay;
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
      const replay = pendingReplay;
      const result = await sendBattle(battle, store);
      if (replay) {
        // 独立事务写回放；容量不足或写入失败不能撤销战报和关卡解锁。
        try { await store.saveReplay(battle.id, replay); } catch { /* 战报仍可查看 */ }
      }
      if (pending !== battle) return;
      pending = null;
      pendingReplay = null;
      renderGear().catch(() => {});
      if (result.nextLevel) {
        next.href =
          '../' + result.nextLevel.id + (location.protocol === 'file:' ? '/index.html?campaign' : '/');
        next.textContent = '进入下一关 ' + result.nextLevel.title;
        next.hidden = false;
        status.textContent = '对战已保存，下一关已解锁。本关武器外观可在武器库佩戴。';
      } else {
        status.textContent = result.campaignCleared
          ? '对战已保存，全部关卡已通关。本关武器外观可在武器库佩戴。'
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
  let draft = null;
  let gearSnapshot, showLoadout;
  let refreshVersion = 0;
  let reservation = crypto.randomUUID();
  const selectors = [];
  function previewLoadout() {
    if (!showLoadout || !gearSnapshot) return;
    const state = defaultGear(gearSnapshot.state);
    // 和真实出发使用同一配给规则，预览只操作库存副本。
    state.stock = { ...state.stock };
    if (draft) {
      state.skills = draft.slice(0,2);
      state.items = draft.slice(2);
    }
    showLoadout(packKit(state, items, equippedSkin ?? level), items, Boolean(draft));
  }
  const shop = document.getElementById('shop-item'), shopStatus = document.getElementById('shop-status');
  const stock = { ...items, ...modifications };
  function describeShop() {
    const id = shop.value, item = stock[id];
    if (!item) return;
    const state = defaultGear(gearSnapshot.state);
    const locked = !modifications[id] && !isUnlocked(item, store.levels, gearSnapshot.cleared);
    const owned = modifications[id] ? state.mods[id] ? '已解锁，可在武器库免费切换' : '永久解锁' : '库存 ×' + (state.stock[id] ?? 0);
    document.getElementById('shop-detail').textContent = [item.detail, item.price+' 点', owned,
      locked ? '通关第 '+item.stage+' 关解锁' : ''].filter(Boolean).join(' · ');
    document.getElementById('shop-buy').disabled = locked || Boolean(state.mods[id]);
  }
  shop.onchange = () => { shopStatus.textContent=''; describeShop(); };
  async function renderGear() {
    const version = ++refreshVersion;
    const snapshot = await store.gear();
    if (version !== refreshVersion) return;
    const state = defaultGear(snapshot.state);
    gearSnapshot = snapshot;
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
        const saved = draft ? draft[(group === 'skills' ? 0 : 2) + index] : state[group][index];
        select.value = saved ?? '';
        select.onchange = () => {
          draft = choice();
          previewLoadout();
        };
        selectors.push(select);
        selectBox.append(label);
      });
    }
    const previousItem = shop.value;
    shop.replaceChildren();
    for (const [label, group] of [['消耗品',items],['永久改装',modifications]]) {
      const options = document.createElement('optgroup');
      options.label = label;
      for (const [id,item] of Object.entries(group)) {
        if (!item.price) continue;
        const locked = !modifications[id] && !isUnlocked(item, store.levels, snapshot.cleared);
        options.append(new Option(item.name + ' · ' + item.price + ' 点' + (locked ? ' · 未解锁' : ''), id));
      }
      shop.append(options);
    }
    if (previousItem) shop.value = previousItem;
    describeShop();
    previewLoadout();
    document.getElementById('credits').textContent = '军需点 ' + (snapshot.earned - state.spent);
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
    if (shop.disabled) return;
    const button = event.currentTarget,
      id = document.getElementById('shop-item').value;
    const selected = draft;
    button.disabled = true;
    shop.disabled = true;
    const start = document.getElementById('start');
    start.disabled = true;
    try {
      await updateGear(store, (state, snapshot) => {
        if (selected) applyChoice(state, selected, snapshot);
        if (items[id] && !isUnlocked(items[id], store.levels, snapshot.cleared)) throw Error('尚未解锁');
        requisition(state, id, snapshot.earned, items,equippedSkin ?? level);
      });
      if (draft === selected) draft = null;
      await renderGear();
      shopStatus.textContent = stock[id].name + '兑换成功';
    } catch (error) {
      shopStatus.textContent = error.message;
    } finally {
      shop.disabled = false;
      start.disabled = false;
      describeShop();
    }
  };
  await renderGear();
  gearPanel.hidden = false;
  return {
    equippedSkin,
    statistics: () => store.statistics(),
    discover: () => store.discover(level),
    onLoadout(listener) { showLoadout = listener; previewLoadout(); },
    async prepare() {
      const values = draft;
      const kit = await updateGear(store, (state, snapshot) => {
        // 网络超时后重试同一次出发，直接取回已装好的装备，避免再次扣库存。
        const receipts = (state.departures ??= {});
        if (receipts[reservation]) return structuredClone(receipts[reservation]);
        if (values) applyChoice(state, values, snapshot);
        const packed = packKit(state, items,equippedSkin ?? level);
        receipts[reservation] = structuredClone(packed);
        const keys = Object.keys(receipts);
        if (keys.length > 32) delete receipts[keys[0]];
        return packed;
      });
      if (draft === values) draft = null;
      reservation = crypto.randomUUID();
      return kit;
    },
    reset() {
      pending = null;
      pendingReplay = null;
      next.hidden = true;
      next.removeAttribute('href');
      retry.hidden = true;
    },
    finish({ won, kills, durationMs, loot, remaining, report, replay }) {
      pendingReplay = replay;
      pending = {
        id: crypto.randomUUID(),
        level,
        won,
        kills,
        durationMs,
        remaining: won ? remaining : {},
        endedAt: Date.now(),
        report,
        loot: [...loot.reduce((entries,{name,value})=>entries.set(name,(entries.get(name)??0)+value),new Map())]
          .map(([name,value])=>({name,value})),
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
