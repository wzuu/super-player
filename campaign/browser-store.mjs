function result(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function battleRecord(battle) {
  const { id, level, won, kills, durationMs, endedAt, loot } = battle;
  const nonnegative = value => Number.isSafeInteger(value) && value >= 0;
  if (typeof id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id) ||
      typeof won !== 'boolean' || !nonnegative(kills) || !nonnegative(durationMs) ||
      !nonnegative(endedAt) || endedAt === 0 || endedAt > 8640000000000000 ||
      !Array.isArray(loot) || loot.length > 10 || (!won && loot.length)) {
    throw new Error('对战记录无效');
  }
  const names = new Set();
  for (const item of loot) {
    if (typeof item?.name !== 'string' || !item.name.trim() || item.name.length > 100 ||
        names.has(item.name) || !nonnegative(item.value) || item.value > 1000000) {
      throw new Error('战利品记录无效');
    }
    names.add(item.name);
  }
  return { id, level, won: Number(won), kills, durationMs, endedAt, loot };
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
    levels,
    pendingPrefix: 'super-player-static:' + path + ':pending:',
    canEnter: id => transaction('battles', 'readonly', tx => unlocked(tx.objectStore('battles'), id)),
    async save(battle) {
      const record = battleRecord(battle);
      return transaction(['battles','settings'], 'readwrite', async tx => {
        const records = tx.objectStore('battles');
        let row = await result(records.index('id').get(record.id));
        if (!row) {
          if (!await unlocked(records, record.level)) throw new Error('请先通关上一关');
          row = record;
          await result(records.add(row));
          if (row.won && battle.remaining) {
            if (typeof battle.remaining !== 'object' || Array.isArray(battle.remaining) || Object.keys(battle.remaining).length>2) throw Error('携带数量无效');
            const settings=tx.objectStore('settings');
            const gear=(await result(settings.get('gear'))) ?? {revision:0,state:{}};
            const stock=gear.state.stock ??= {};
            for (const [id,n] of Object.entries(battle.remaining)) {
              if (!/^(medkit|grenade|ammo|mine|cache-[a-z-]+)$/.test(id) || !Number.isSafeInteger(n) || n<0 || n>3) throw Error('携带数量无效');
              stock[id]=(stock[id]??0)+n;
            }
            gear.revision++;
            await result(settings.put(gear,'gear'));
          }
        }
        const nextLevel = row.won ? levels[position(row.level) + 1] ?? null : null;
        return { nextLevel, campaignCleared: Boolean(row.won && !nextLevel) };
      });
    },
    gear: () => transaction(['settings','battles'],'readonly', async tx => {
      const rows = await result(tx.objectStore('battles').getAll());
      const saved = await result(tx.objectStore('settings').get('gear'));
      return {...(saved ?? {revision:0,state:{}}),
        earned: rows.reduce((sum,row)=>sum+row.loot.reduce((value,item)=>value+item.value,0),0),
        cleared:[...new Set(rows.filter(row=>row.won).map(row=>row.level))]};
    }),
    writeGear: ({revision,state}) => transaction('settings','readwrite',async tx => {
      const settings = tx.objectStore('settings');
      if (((await result(settings.get('gear')))?.revision ?? 0) !== revision) return {saved:false};
      await result(settings.put({revision:revision+1,state},'gear'));
      return {saved:true};
    }),
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
      const best = {};
      const loot = new Map();
      for (const row of rows) {
        const b = best[row.level] ??= {kills:0,time:null,loot:0};
        b.kills = Math.max(b.kills,row.kills);
        b.loot = Math.max(b.loot,row.loot.length);
        if (row.won) b.time = Math.min(b.time ?? Infinity,row.durationMs);
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
        best, equippedSkin: skin ?? null, lootPerLevel: 10, battleCount: rows.length,
        loot: [...loot.values()].sort((a, b) => a.firstAt - b.firstAt || a.name.localeCompare(b.name)),
        ...historyPage(rows),
      };
    }),
  };
}
