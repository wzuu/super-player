import { catalog, modifications } from '../level-kit/src/gear.mjs';
import { rifleSkins } from '../level-kit/src/rifle-skins.mjs';

const modes = {
  classic: '围剿',
  hold: '坚守',
  timed: '限时撤离',
  escort: '护送',
  endless: '无尽生存',
  hunt: '猎杀',
  demolition: '爆破',
  rescue: '救援撤离',
};
const difficulties = { assist: '辅助', standard: '标准', hard: '困难' };
const scores = {
  holdSeconds: '坚守秒数',
  escortHealth: '护送目标生命',
  escorted: '护送已抵达',
  detonated: '爆破成功',
  escapeSeconds: '撤离剩余秒数',
  wave: '最高波次',
  targets: '猎杀目标',
  boarded: '成功登机',
  core: '取得关键物',
  bossDead: '击败首领',
  deepCompleted: '深入完成',
  deepSeconds: '深入用时（秒）',
  huntWon: '击倒猎物',
  huntSeconds: '猎杀用时（秒）',
};
const ranks = ['S', 'A', 'B', 'C'];
const node = (tag, text) => Object.assign(document.createElement(tag), { textContent: text ?? '' });
const seconds = (ms) => (ms / 1000).toFixed(1) + ' 秒';
const scoreText = (data) =>
  Object.entries(data ?? {})
    .map(
      ([key, value]) =>
        (scores[key] ?? key) + ' ' + (typeof value === 'boolean' ? (value ? '是' : '否') : value),
    )
    .join(' · ');

export function summarize(rows = []) {
  const weapons = new Map(),
    levels = new Map(),
    modesPlayed = new Map();
  let totalKills = 0,
    eliteKills = null,
    maxCombo = null;
  for (const r of rows) {
    totalKills += r.kills;
    if (Number.isSafeInteger(r.eliteKills) && r.eliteKills >= 0)
      eliteKills = (eliteKills ?? 0) + r.eliteKills;
    if (r.weapon && Number.isFinite(r.weaponKills)) {
      const w = weapons.get(r.weapon) ?? { kills: 0, shots: 0, hits: 0 };
      w.kills += r.weaponKills;
      w.shots += r.shots ?? 0;
      w.hits += r.hits ?? 0;
      weapons.set(r.weapon, w);
    }
    if (r.maxCombo != null) maxCombo = Math.max(r.maxCombo, maxCombo ?? 0);
    if (
      ranks.includes(r.grade) &&
      (!levels.has(r.level) || ranks.indexOf(r.grade) < ranks.indexOf(levels.get(r.level)))
    )
      levels.set(r.level, r.grade);
    if (r.mode) {
      const m = modesPlayed.get(r.mode) ?? { count: 0, wins: 0, best: {} };
      m.count++;
      m.wins += Number(r.won);
      for (const [key, value] of Object.entries(r.scores ?? {})) {
        if (typeof value === 'boolean') m.best[key] = Boolean(m.best[key]) || value;
        else if (Number.isFinite(value)) {
          const successKey = { deepSeconds: 'deepCompleted', huntSeconds: 'huntWon' }[key];
          if (successKey) {
            if (r.scores[successKey]) m.best[key] = Math.min(m.best[key] ?? Infinity, value);
          } else m.best[key] = Math.max(m.best[key] ?? 0, value);
        }
      }
      modesPlayed.set(r.mode, m);
    }
  }
  return { totalKills, eliteKills, maxCombo, weapons, levels, modesPlayed };
}

export function renderStats(body, rows) {
  const label = node('label', '变奏筛选');
  const select = node('select');
  select.add(new Option('全部变奏', ''));
  for (const v of new Set(rows.map((r) => r.variation).filter(Boolean))) select.add(new Option(v, v));
  label.append(select);
  const results = node('div');
  function refresh() {
    const filtered = select.value ? rows.filter((r) => r.variation === select.value) : rows;
    const stats = summarize(filtered);
    const extraction = filtered.filter((r) => r.mode !== 'endless' && r.mode);
    results.replaceChildren(
      node(
        'p',
        '累计击杀 ' +
          stats.totalKills +
          ' · 精英击杀 ' +
          (stats.eliteKills ?? '未记录') +
          ' · 最高连杀 ' +
          (stats.maxCombo ?? '未记录'),
      ),
      node(
        'p',
        '撤离胜率 ' +
          (extraction.length
            ? Math.round((extraction.filter((r) => r.won).length * 100) / extraction.length) + '%'
            : '未记录'),
      ),
    );
    const dives = filtered.filter((row) => typeof row.scores?.deepCompleted === 'boolean');
    if (dives.length) {
      const successes = dives.filter((row) => row.scores.deepCompleted);
      const seconds = successes.map((row) => row.scores.deepSeconds).filter(Number.isFinite);
      results.append(
        node(
          'p',
          '深入撤离成功 ' +
            successes.length +
            ' / ' +
            dives.length +
            ' 次 · 完成率 ' +
            Math.round((successes.length / dives.length) * 100) +
            '%' +
            (seconds.length
              ? ' · 成功平均用时 ' +
                Math.round(seconds.reduce((sum, n) => sum + n, 0) / seconds.length) +
                ' 秒'
              : ''),
        ),
      );
    }
    for (const [id, m] of stats.modesPlayed)
      results.append(
        node(
          'p',
          (modes[id] ?? id) +
            ' · ' +
            m.count +
            ' 局 · ' +
            (id === 'endless' ? '' : m.wins + ' 次撤离 ') +
            scoreText(m.best),
        ),
      );
    if (stats.levels.size)
      results.append(
        node('p', '最高评级 ' + ranks.find((rank) => [...stats.levels.values()].includes(rank))),
      );
  }
  select.onchange = refresh;
  body.append(label, results);
  refresh();
}

export function renderReport(body, battle, levels, store) {
  const r = battle.report ?? {},
    items = { ...catalog(levels), ...modifications };
  const line = (name, value) => body.append(node('p', name + '　' + (value ?? '未记录')));
  const equipment = (ids) =>
    Array.isArray(ids) ? ids.map((id) => items[id]?.name ?? id ?? '空槽').join(' / ') : null;
  const level = levels.find((l) => l.id === battle.level);
  line('关卡', level?.title ?? battle.level);
  line(
    '结算',
    new Date(battle.endedAt).toLocaleString('zh-CN') +
      ' · ' +
      ((r.actionName ?? '撤离') + (battle.won ? '成功' : '失败')) +
      ' · ' +
      seconds(battle.durationMs),
  );
  line('结束原因', r.reason);
  line('最后完成阶段', r.lastStage);
  line('实际行动', r.actionName ?? modes[r.mode] ?? r.mode);
  line('难度', difficulties[r.difficulty] ?? r.difficulty);
  line('变奏', r.variation);
  line('武器', rifleSkins[r.weapon]?.name ?? r.weapon);
  line(
    '改装',
    r.loadout?.mods
      ? equipment(Object.keys(r.loadout.mods).filter((key) => r.loadout.mods[key])) || '无'
      : null,
  );
  line('技能', equipment(r.loadout?.skills));
  line('道具', equipment(r.loadout?.items));
  line('评级', r.grade ?? '未评级');
  for (const [name, value] of [
    ['总击杀', battle.kills],
    ['最高连杀', r.maxCombo],
    ['武器击杀', r.weaponKills],
    ['道具击杀', r.equipmentKills],
    ['机关击杀', r.environmentKills],
    ['精英击杀', r.eliteKills],
    ['发射数', r.shots],
    ['命中射击数', r.hits],
    ['承受伤害', r.damageTaken],
    ['模式成绩', scoreText(r.scores) || null],
    ['拾取件数', r.pickedCount],
    ['拾取价值', r.pickedValue],
  ])
    line(name, value);
  line(
    '带回战利品',
    battle.loot.length ? battle.loot.map((i) => i.name + '（' + i.value + '）').join('、') : '无',
  );
  if (r.vaultValue != null) line('主路 / 宝库收益', (r.mainValue ?? 0) + ' / ' + r.vaultValue);
  if (r.events?.length) line('关键节点', r.events.map((e) => seconds(e.time) + ' ' + e.label).join(' / '));
  if (!battle.hasReplay) return;
  const watch = node('button', '观看回放');
  watch.className = 'secondary-action';
  body.append(watch);
  watch.onclick = async () => {
    watch.disabled = true;
    try {
      const data = await store.replay(battle.id);
      if (!watch.isConnected) return;
      if (!data?.samples?.length) throw Error();
      watch.replaceWith(replayViewer(data));
    } catch {
      watch.textContent = '重试加载回放';
      watch.disabled = false;
    }
  };
}

function replayViewer({ samples, events = [] }) {
  const section = node('section');
  section.className = 'replay-viewer';
  const canvas = node('canvas');
  canvas.width = 540;
  canvas.height = 330;
  canvas.setAttribute('aria-label', '战术路线和生命曲线');
  const play = node('button', '播放'),
    slider = node('input'),
    output = node('output');
  play.className = 'secondary-action';
  slider.type = 'range';
  slider.min = 0;
  slider.max = samples.at(-1)[0];
  slider.step = 1;
  slider.value = 0;
  slider.setAttribute('aria-label', '回放进度');
  section.append(node('h3', '战术回放'), canvas, output, play, slider);
  const ctx = canvas.getContext('2d');
  const xs = samples.map((s) => s[1]),
    zs = samples.map((s) => s[3]);
  const left = Math.min(...xs),
    top = Math.min(...zs);
  const scale = Math.min(500 / Math.max(5, Math.max(...xs) - left), 195 / Math.max(5, Math.max(...zs) - top));
  let frame = 0,
    last = 0;
  function render() {
    const t = Number(slider.value);
    const next = samples.findIndex((s) => s[0] > t);
    const i = next < 0 ? samples.length - 1 : Math.max(0, next - 1);
    const now = samples[i],
      end = Math.max(1, Number(slider.max));
    const lastEvent = events.findLast((event) => event.time <= t);
    const eventLabel = lastEvent
      ? events.filter((event) => event.time === lastEvent.time).map((event) => event.label).join('、')
      : '';
    const x = (s) => 20 + (s[1] - left) * scale,
      z = (s) => 20 + (s[3] - top) * scale;
    ctx.fillStyle = '#101c25';
    ctx.fillRect(0, 0, 540, 330);
    function path(to, ax, ay, color) {
      ctx.beginPath();
      ctx.moveTo(ax(samples[0]), ay(samples[0]));
      for (let j = 1; j <= to; j++) ctx.lineTo(ax(samples[j]), ay(samples[j]));
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    path(samples.length - 1, x, z, '#465863');
    path(i, x, z, '#80dfc8');
    ctx.save();
    ctx.translate(x(now), z(now));
    ctx.rotate(-now[4]);
    ctx.fillStyle = '#fcde8b';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-5, 5);
    ctx.lineTo(5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    path(
      samples.length - 1,
      (s) => 20 + (500 * s[0]) / end,
      (s) => 306 - 65 * Math.min(1, s[5] / 100),
      '#63727d',
    );
    path(
      i,
      (s) => 20 + (500 * s[0]) / end,
      (s) => 306 - 65 * Math.min(1, s[5] / 100),
      '#f09485',
    );
    ctx.fillStyle = '#edf4f6';
    ctx.font = '14px sans-serif';
    ctx.fillText('生命', 20, 240);
    output.textContent =
      seconds(t) + ' / ' + seconds(end) + ' · 生命 ' + now[5] + ' · 高度 ' + now[2] + ' 米' +
      (eventLabel ? ' · 最近节点 ' + eventLabel : '');
  }
  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    play.textContent = '播放';
  }
  function tick(timestamp) {
    if (!section.isConnected || !section.closest('dialog')?.open) return stop();
    slider.value = Number(slider.value) + timestamp - last;
    last = timestamp;
    render();
    if (Number(slider.value) >= Number(slider.max)) stop();
    else frame = requestAnimationFrame(tick);
  }
  play.onclick = () => {
    if (frame) return stop();
    if (Number(slider.value) >= Number(slider.max)) slider.value = 0;
    last = performance.now();
    play.textContent = '暂停';
    frame = requestAnimationFrame(tick);
  };
  slider.oninput = render;
  for (const e of events) {
    const button = node('button', seconds(e.time) + ' ' + e.label);
    button.onclick = () => {
      slider.value = e.time;
      render();
    };
    section.append(button);
  }
  render();
  return section;
}
