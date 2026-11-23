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
      !Array.isArray(loot) || loot.length > 64 || (!won && loot.length)) {
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
    battles: page.map(({ loot, stats, ...row }) => ({
      ...row, lootCount: loot.length, lootValue: loot.reduce((sum, item) => sum + item.value, 0),
    })),
    nextBefore: start + page.length < rows.length ? page.at(-1).sequence : null,
  };
}

export async function openBrowserStore(levels, path, onUpgradeBlocked) {
  const open = indexedDB.open('super-player:' + path, 3);
  open.onblocked = () => onUpgradeBlocked?.('请关闭其他打开旧版游戏的标签页。关闭后将自动升级这份存档。');
  open.onupgradeneeded = event => {
    if (event.oldVersion < 1) {
      const records = open.result.createObjectStore('battles', { keyPath: 'sequence', autoIncrement: true });
      records.createIndex('id', 'id', { unique: true });
      records.createIndex('outcome', ['level', 'won']);
      open.result.createObjectStore('settings');
    }
    if (event.oldVersion < 2) {
      open.result.createObjectStore('reports');
      open.result.createObjectStore('replays');
    } else {
      // 旧版战报已经记录精英击杀。升级时补入统计摘要，以后浏览统计不用读取详细战报。
      const battles = open.transaction.objectStore('battles');
      open.transaction.objectStore('reports').openCursor().onsuccess = event => {
        const cursor = event.target.result;
        if (!cursor) return;
        const count = cursor.value.eliteKills;
        if (Number.isSafeInteger(count) && count >= 0) {
          battles.index('id').get(cursor.key).onsuccess = found => {
            const row = found.target.result;
            if (row) {
              row.stats = {...row.stats, eliteKills:count};
              battles.put(row);
            }
            cursor.continue();
          };
        } else cursor.continue();
      };
    }
  };
  const db = await result(open);
  db.onversionchange = () => db.close();
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
      return transaction(['battles','settings','reports'], 'readwrite', async tx => {
        const records = tx.objectStore('battles');
        let row = await result(records.index('id').get(record.id));
        if (!row) {
          if (!await unlocked(records, record.level)) throw new Error('请先通关上一关');
          row = record;
          if (row.loot.some(item=>item.name.startsWith('秘藏·'))) {
            const settings=tx.objectStore('settings'), rooms=(await result(settings.get('discoveries'))) ?? {};
            if (rooms[row.level]?.claimed) row.loot=row.loot.filter(item=>!item.name.startsWith('秘藏·'));
            else {rooms[row.level]={claimed:true}; await result(settings.put(rooms,'discoveries'));}
          }
          if (battle.report) {
            await result(tx.objectStore('reports').add(battle.report, row.id));
            const keys = ['weapon','weaponKills','eliteKills','hits','shots','maxCombo','grade','mode','variation','scores'];
            row.stats = Object.fromEntries(keys.filter(key => battle.report[key] != null).map(key => [key, battle.report[key]]));
          }
          await result(records.add(row));
          const recoveredCore = row.loot.some(item => item.name === '精英改装材料·穿透弹芯');
          if (row.won && (battle.remaining || recoveredCore)) {
            const remaining = battle.remaining ?? {};
            if (typeof remaining !== 'object' || Array.isArray(remaining) || Object.keys(remaining).length>2) throw Error('携带数量无效');
            const settings=tx.objectStore('settings');
            const gear=(await result(settings.get('gear'))) ?? {revision:0,state:{}};
            const stock=gear.state.stock ??= {};
            if (recoveredCore) (gear.state.mods ??= {}).pierce = true;
            for (const [id,n] of Object.entries(remaining)) {
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
    discover: level => transaction(['settings','battles'],'readwrite',async tx=>{
      if (!await unlocked(tx.objectStore('battles'),level)) throw Error('关卡尚未开放');
      const settings=tx.objectStore('settings'), rooms=(await result(settings.get('discoveries'))) ?? {};
      rooms[level] ??= {claimed:false};
      await result(settings.put(rooms,'discoveries'));
      return rooms[level];
    }),
    report: id => transaction(['battles','reports','replays'], 'readonly', async tx => {
      const row = await result(tx.objectStore('battles').index('id').get(id));
      if (!row) return null;
      const report = await result(tx.objectStore('reports').get(id));
      const hasReplay = await result(tx.objectStore('replays').count(id));
      return {...row, report, hasReplay};
    }),
    statistics: () => transaction('battles','readonly', async tx =>
      (await result(tx.objectStore('battles').getAll())).map(({level,won,kills,durationMs,stats}) => ({level,won,kills,durationMs,...stats}))),
    replay: id => transaction('replays','readonly', tx => result(tx.objectStore('replays').get(id))),
    saveReplay: (id, replay) => transaction(['battles','replays'],'readwrite', async tx => {
      if (!await result(tx.objectStore('battles').index('id').count(id))) throw Error('找不到本局记录');
      const replays = tx.objectStore('replays');
      if (!await result(replays.count(id))) await result(replays.add(replay, id));
    }),
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
      const unlock = {'shotgun-pump':'rain-city','shotgun-forge':'brass-factory'}[skin] ?? skin;
      if (skin !== null && (!levels.some(level=>level.id===unlock) || !await hasWin(tx.objectStore('battles'), unlock))) throw new Error('通关后才能佩戴');
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
        discoveries: Object.keys((await result(tx.objectStore('settings').get('discoveries'))) ?? {}),
        loot: [...loot.values()].sort((a, b) => a.firstAt - b.firstAt || a.name.localeCompare(b.name)),
        ...historyPage(rows),
      };
    }),
  };
}
