function result(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function historyPage(rows, before) {
  rows.sort((a, b) => b.endedAt - a.endedAt || b.sequence - a.sequence);
  const start = before == null ? 0 : rows.findIndex(row => row.sequence === before) + 1;
  const page = rows.slice(start, start + 20);
  return {
    battles: page.map(({ loot, ...row }) => ({
      ...row, lootCount: loot.length, lootValue: loot.reduce((sum, item) => sum + item.value, 0),
    })),
    nextBefore: start + page.length < rows.length ? page.at(-1).sequence : null,
  };
}

export async function openBrowserStore(levels, path) {
  const open = indexedDB.open('super-player:' + path, 1);
  open.onupgradeneeded = () => {
    const records = open.result.createObjectStore('battles', { keyPath: 'sequence', autoIncrement: true });
    records.createIndex('id', 'id', { unique: true });
    records.createIndex('outcome', ['level', 'won']);
    open.result.createObjectStore('settings');
  };
  const db = await result(open);
  async function transaction(names, mode, work) {
    const tx = db.transaction(names, mode);
    const completed = new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error ?? new Error('战役存档事务中止'));
    });
    try {
      const value = await work(tx);
      await completed;
      return value;
    } catch (error) {
      try { tx.abort(); } catch { /* 事务已结束 */ }
      await completed.catch(() => {});
      throw error;
    }
  }

  const position = id => levels.findIndex(level => level.id === id);
  const hasWin = (records, id) => result(records.index('outcome').count([id, 1]));
  async function unlocked(records, id) {
    const index = position(id);
    return index === 0 || (index > 0 && (await hasWin(records, levels[index - 1].id)) > 0);
  }

  return {
    pendingPrefix: 'super-player-static:' + path + ':pending:',
    canEnter: id => transaction('battles', 'readonly', tx => unlocked(tx.objectStore('battles'), id)),
    async save(battle) {
      return transaction('battles', 'readwrite', async tx => {
        const records = tx.objectStore('battles');
        let row = await result(records.index('id').get(battle.id));
        if (!row) {
          if (!await unlocked(records, battle.level)) throw new Error('请先通关上一关');
          row = { ...battle, won: Number(battle.won), loot: battle.won ? battle.loot : [] };
          await result(records.add(row));
        }
        const nextLevel = row.won ? levels[position(row.level) + 1] ?? null : null;
        return { nextLevel, campaignCleared: Boolean(row.won && !nextLevel) };
      });
    },
    loadout: () => transaction('settings', 'readonly', async tx => ({
      equippedSkin: (await result(tx.objectStore('settings').get('skin'))) ?? null,
    })),
    equip: skin => transaction(['settings', 'battles'], 'readwrite', async tx => {
      if (skin !== null && !await hasWin(tx.objectStore('battles'), skin)) throw new Error('通关后才能佩戴');
      await result(tx.objectStore('settings').put(skin, 'skin'));
      return { equippedSkin: skin };
    }),
    history: before => transaction('battles', 'readonly', async tx =>
      historyPage(await result(tx.objectStore('battles').getAll()), before)),
    progress: () => transaction(['settings', 'battles'], 'readonly', async tx => {
      const rows = await result(tx.objectStore('battles').getAll());
      const skin = await result(tx.objectStore('settings').get('skin'));
      const wins = new Set(rows.filter(row => row.won).map(row => row.level));
      const loot = new Map();
      for (const row of rows) {
        for (const item of row.loot) {
          const key = JSON.stringify([row.level, item.name]);
          const entry = loot.get(key) ?? { ...item, level: row.level, firstAt: row.endedAt, count: 0 };
          entry.count++;
          entry.value = Math.max(entry.value, item.value);
          entry.firstAt = Math.min(entry.firstAt, row.endedAt);
          loot.set(key, entry);
        }
      }
      return {
        levels: levels.map((level, i) => ({
          ...level, cleared: wins.has(level.id), unlocked: !i || wins.has(levels[i - 1].id),
        })),
        equippedSkin: skin ?? null, lootPerLevel: 10, battleCount: rows.length,
        loot: [...loot.values()].sort((a, b) => a.firstAt - b.firstAt || a.name.localeCompare(b.name)),
        ...historyPage(rows),
      };
    }),
  };
}
