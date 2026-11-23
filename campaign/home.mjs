import { campaignStore } from './store.mjs';
import { flushPendingBattles } from './save.mjs';
import { rifleSkins, resolveRifleSkin } from '../level-kit/src/rifle-skins.mjs';

import { profiles, activeProfile, createProfile, selectProfile } from './profiles.mjs';
import { preferences, storePreferences, defaultKeys, actionLabels, keyName } from '../level-kit/src/preferences.mjs';

const $ = id => document.getElementById(id);
const views = ['missions', 'history', 'collection'];
const number = new Intl.NumberFormat('zh-CN');
const date = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const order = index => String(index + 1).padStart(2, '0');
const levelUrl = id => './' + id + (location.protocol==='file:' ? '/index.html?campaign' : '/');
const coverUrl = id => './campaign/images/' + id + '.webp';
const option = $('collection-level');
const more = $('more-battles');
let progress;
let loadoutRevision = 0;
let before;
let loading = false;
let selectedRifle, previewPromise, savingRifle = false;
const rifleOptions = new Map();
const pageProfile = activeProfile();

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content != null) node.textContent = content;
  return node;
}

function showView(moveFocus = false) {
  const hash = location.hash.slice(1);
  const view = views.includes(hash) ? hash : 'missions';
  for (const name of views) {
    $('view-' + name).hidden = name !== view;
    const nav = document.querySelector(`nav a[href="#${name}"]`);
    if (name === view) nav.setAttribute('aria-current', 'page');
    else nav.removeAttribute('aria-current');
  }
  if (moveFocus) {
    window.scrollTo(0, 0);
    $('view-' + view).querySelector('h1').focus({ preventScroll: true });
  }
  updateWeaponPreview();
}

function feedback(message, retry = false) {
  $('status').textContent = message;
  $('retry').hidden = !retry;
  $('feedback').hidden = !message;
}

function missionCard(level, index, active) {
  const row = element('li', 'mission-card');
  if (!level.unlocked) row.dataset.state = 'locked';
  if (active) row.dataset.state = 'current';

  const cover = element('div', 'mission-cover');
  const img = element('img');
  img.src = coverUrl(level.id);
  img.alt = '';
  img.loading = index < 3 ? 'eager' : 'lazy';
  img.width = 960;
  img.height = 540;
  const label = element('span', 'mission-number', '关卡 ' + order(index));
  cover.append(img, label);

  const content = element('div', 'mission-content');
  const title = element('h3', '', level.title);
  const status = element('span', 'mission-status', level.cleared ? '已通关' : active ? '可进入' : '未解锁');
  const heading = element('div', 'mission-heading');
  heading.append(title, status);
  content.append(heading, element('p', '', level.brief));
  if (level.unlocked) {
    const action = element('a', 'mission-action', level.cleared ? '再次挑战' : '进入关卡');
    action.href = levelUrl(level.id);
    action.setAttribute('aria-label', action.textContent + ' ' + level.title);
    content.append(action);
  } else {
    content.append(element('span', 'mission-prerequisite', '通关 ' + progress.levels[index - 1].title + ' 后开放'));
  }
  const best = progress.best?.[level.id];
  const record = element('p', 'record', best ? best.kills + ' 击杀 · ' + (best.time == null ? '未撤离' : playTime(best.time)) + ' · ' + best.loot + ' 件' : '暂无成绩');
  content.append(record);
  row.tabIndex = 0;
  row.addEventListener('mouseenter', () => renderHero(index));
  row.addEventListener('focusin', () => renderHero(index));
  row.append(cover, content);
  return row;
}

let selectedIndex = 0;
const accents = ['#82dfcb','#d9bd86','#9ed7ff','#e3c275','#aceaff','#78d4ed','#ffa88b','#bab7ff','#ffa1d8','#93ddb0','#f3a7b5','#f3b9e0','#e1c48e','#b8aff7'];
function renderHero(index) {
  const level = progress.levels[index];
  selectedIndex = index;
  $('hero-art').src = coverUrl(level.id);
  $('hero-chapter').textContent = '战役  /  ' + order(index) + '  /  ' + (level.cleared ? '已通关' : level.unlocked ? '可挑战' : '未解锁');
  $('game-title').textContent = level.title;
  document.querySelector('.hero-description').textContent = level.brief;
  document.documentElement.style.setProperty('--accent', accents[index % accents.length]);
  for (const [i, card] of [...$('mission-list').children].entries()) card.toggleAttribute('data-selected', i === index);
}

function renderMissions() {
  for (const control of document.querySelectorAll('#new-campaign,#save-open,[data-panel]')) control.disabled=false;
  const levels = progress.levels;
  const current = levels.find(level => level.unlocked && !level.cleared);
  const cleared = levels.filter(level => level.cleared).length;
  const primary = $('continue');
  const featured = current || levels.at(-1);
  const art = $('hero-art');
  const src = coverUrl(featured.id);
  if (art.getAttribute('src') !== src) art.src = src;
  primary.href = levelUrl(featured.id);
  primary.textContent = cleared === 0 ? '开始战役' : current ? '继续战役' : '重玩最终关';
  primary.hidden = false;
  $('current-mission').textContent = current
    ? '第 ' + order(levels.indexOf(current)) + ' 关 / ' + current.title
    : '全部关卡已通关';
  $('progress-count').textContent = cleared + ' / ' + levels.length;
  $('campaign-progress').max = levels.length;
  $('campaign-progress').value = cleared;
  $('mission-list').replaceChildren(...levels.map((level, index) => missionCard(level, index, level === current)));
  renderHero(levels.indexOf(featured));
  $('codex-count').textContent = progress.loot.length + ' / ' + levels.length * progress.lootPerLevel + ' 件宝物';
  $('active-skin').textContent = rifleSkins[progress.equippedSkin]?.name ?? '关卡默认';
  $('stat-count').textContent = cleared + ' 个战场已通关';
  $('last-played').textContent = progress.battles.length ? '最近游玩 ' + date.format(progress.battles[0].endedAt) : '本机新存档';
}

function playTime(ms) {
  const total = Math.floor(ms / 1000);
  const seconds = String(total % 60).padStart(2, '0');
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return minutes + ':' + seconds;
  return Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0') + ':' + seconds;
}

function appendBattles(page) {
  const titles = new Map(progress.levels.map(level => [level.id, level.title]));
  const rows = page.battles.map(battle => {
    const row = element('tr');
    const title = element('th', '', titles.get(battle.level) ?? battle.level);
    title.scope = 'row';
    const result = element('td');
    result.append(element('span', battle.won ? 'outcome won' : 'outcome lost', battle.won ? '撤离成功' : '撤离失败'));
    row.append(title, result, ...[
      number.format(battle.kills), playTime(battle.durationMs), number.format(battle.lootCount) + ' 件',
      number.format(battle.lootValue), date.format(battle.endedAt),
    ].map(value => element('td', '', value)));
    return row;
  });
  $('battle-list').append(...rows);
  before = page.nextBefore;
  more.hidden = !before;
  $('history-region').hidden = progress.battleCount === 0;
  $('history-empty').hidden = progress.battleCount > 0;
  $('battle-count').textContent = '共 ' + number.format(progress.battleCount) + ' 局';
}

function renderCollection() {
  const items = progress.loot.filter(item => item.level === option.value);
  const slots = Math.max(0, progress.lootPerLevel - items.length);
  const cards = items.map(item => {
    const card = element('li', 'loot-card discovered');
    const mark = element('span', 'loot-mark');
    mark.setAttribute('aria-hidden', 'true');
    card.append(mark, element('h2', '', item.name),
      element('p', '', '价值 ' + number.format(item.value)),
      element('p', 'loot-count', '已带回 ' + number.format(item.count) + ' 次'));
    return card;
  });
  for (let index = 0; index < slots; index++) {
    const card = element('li', 'loot-card undiscovered');
    const mark = element('span', 'loot-mark');
    mark.setAttribute('aria-hidden', 'true');
    card.append(mark, element('p', '', '未发现'));
    cards.push(card);
  }
  $('collection-list').replaceChildren(...cards);
  $('selected-loot-count').textContent = items.length + ' / ' + progress.lootPerLevel;
  $('collection-count').textContent = '已收集 ' + progress.loot.length + ' / ' + (progress.levels.length * progress.lootPerLevel);
}

async function loadPreview() {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = './level-kit/vendor/three-r160.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
  const map = document.createElement('script');
  map.type = 'importmap';
  map.textContent = JSON.stringify({imports: {...globalThis.levelThreeModules(), '@level-kit/': './level-kit/src/'}});
  document.head.append(map);
  return import('./weapon-preview.mjs');
}

function updateWeaponPreview() {
  if (!selectedRifle) return;
  const visible = !$('view-collection').hidden;
  if (!visible && !previewPromise) return;
  previewPromise ??= loadPreview().then(({ createWeaponPreview }) =>
    createWeaponPreview($('rifle-canvas'), $('rifle-reset-view'))).catch(error => {
    console.warn('武器预览无法启动', error);
    $('rifle-canvas').hidden = true;
    $('rifle-reset-view').hidden = true;
    $('rifle-preview-tip').textContent = '此浏览器暂时无法显示三维预览。';
  });
  previewPromise.then(preview => preview?.show(selectedRifle, !$('view-collection').hidden));
}

function renderRifles() {
  const levels = progress.levels.filter(level => Object.hasOwn(rifleSkins, level.id));
  if (!levels.length) return;
  selectedRifle ??= resolveRifleSkin(progress.equippedSkin, levels[0].id);
  const skin = rifleSkins[selectedRifle];
  const source = levels.find(level => level.id === selectedRifle);
  const equipped = progress.equippedSkin;
  const selectedEquipped = equipped === selectedRifle;
  const list = $('rifle-list');
  $('armory').hidden = false;
  $('rifle-count').textContent = '已解锁 ' + levels.filter(level => level.cleared).length + ' / ' + levels.length;
  $('rifle-source').textContent = source.title + (source.cleared ? ' / 已解锁' : ' / 通关后解锁');
  $('rifle-name').textContent = skin.name;
  $('rifle-description').textContent = skin.detail;
  $('rifle-canvas').setAttribute('aria-label', skin.name + '三维预览');
  $('active-skin').textContent = rifleSkins[equipped]?.name ?? '关卡默认';
  $('rifle-equipped').textContent = equipped ? '当前佩戴 ' + rifleSkins[equipped].name : '当前使用关卡默认外观';
  $('rifle-equip').textContent = selectedEquipped ? '已佩戴' : source.cleared ? '佩戴外观' : '尚未解锁';
  $('rifle-equip').setAttribute('aria-disabled', String(savingRifle || selectedEquipped || !source.cleared));
  $('rifle-default').hidden = !equipped;
  $('rifle-default').setAttribute('aria-disabled', String(savingRifle));
  for (const level of levels) {
    let row = rifleOptions.get(level.id);
    if (!row) {
      const item = element('li');
      const button = element('button', 'rifle-option');
      button.type = 'button';
      const color = element('span', 'rifle-option-color');
      color.style.setProperty('--rifle-color', rifleSkins[level.id].trim);
      const name = element('span', 'rifle-option-name', rifleSkins[level.id].name);
      name.append(element('span', 'rifle-option-source', level.title));
      const label = element('span', 'rifle-option-state');
      button.append(color, name, label);
      button.addEventListener('click', () => {
        selectedRifle = level.id;
        $('rifle-feedback').textContent = '';
        renderRifles();
      });
      item.append(button);
      list.append(item);
      rifleOptions.set(level.id, row = { button, label });
    }
    row.button.setAttribute('aria-pressed', String(level.id === selectedRifle));
    row.button.toggleAttribute('data-equipped', level.id === equipped);
    row.label.textContent = level.id === equipped ? '已佩戴' : level.cleared ? '已解锁' : '未解锁';
  }
  updateWeaponPreview();
}

async function equipRifle(skin) {
  if (!progress || savingRifle) return;
  savingRifle = true;
  const status = $('rifle-feedback');
  status.textContent = '';
  renderRifles();
  try {
    const result = await (await campaignStore()).equip(skin);
    const restoreFocus = skin === null && document.activeElement === $('rifle-default');
    progress.equippedSkin = result.equippedSkin;
    loadoutRevision++;
    if (restoreFocus) $('rifle-equip').focus({ preventScroll: true });
    status.textContent = skin ? '已佩戴 ' + rifleSkins[skin].name : '已恢复使用各关卡默认外观';
  } catch {
    status.textContent = '暂时无法保存外观设置，请重试。';
  } finally {
    savingRifle = false;
    renderRifles();
  }
}

async function refreshProgress() {
  const revision = loadoutRevision;
  const updated = await (await campaignStore()).progress();
  // 补存读取和佩戴写入可并行。保留读取期间已保存的最新选择。
  if (revision !== loadoutRevision) updated.equippedSkin = progress.equippedSkin;
  progress = updated;
  $('history-error').hidden = true;
  renderMissions();
  $('battle-list').replaceChildren();
  appendBattles(progress);
  const selection = option.value;
  option.replaceChildren(...progress.levels.map((level, index) =>
    new Option(order(index) + ' / ' + level.title, level.id)));
  option.value = progress.levels.some(level => level.id === selection) ? selection : progress.levels[0].id;
  option.closest('.collection-toolbar').hidden = false;
  renderCollection();
  renderRifles();
}

async function loadProgress() {
  if (loading) return;
  loading = true;
  try {
    await refreshProgress();
    let complete = true, refreshHistory = false;
    for await (const battle of flushPendingBattles()) {
      if (!battle) {
        complete = false;
        continue;
      }
      refreshHistory = true;
      // 首次通关立即开放下一关，其他写入在队列结束时统一刷新。
      if (battle.won && progress.levels.some(level => level.id === battle.level && !level.cleared)) {
        await refreshProgress();
        refreshHistory = false;
      }
    }
    if (refreshHistory) await refreshProgress();
    const locked = new URLSearchParams(location.search).get('locked');
    const denied = progress.levels.find(level => level.id === locked && !level.unlocked);
    if (!complete) feedback('还有对战记录等待写入，请重新读取。', true);
    else feedback(denied ? denied.title + '尚未解锁，请先通关上一关。' : '');
  } catch {
    feedback('无法读取战役存档。请确认页面可访问、浏览器允许存储，再试一次。', true);
  } finally {
    loading = false;
  }
}

more.addEventListener('click', async () => {
  if (!before) return;
  const snapshot = progress;
  more.disabled = true;
  try {
    const page = await (await campaignStore()).history(before);
    if (snapshot !== progress) return;
    appendBattles(page);
    $('history-error').hidden = true;
    if (!before) $('history-region').focus({ preventScroll: true });
  } catch {
    if (snapshot !== progress) return;
    $('history-error').textContent = '暂时无法加载更多对战记录，请重试。';
    $('history-error').hidden = false;
  } finally {
    more.disabled = false;
  }
});

option.addEventListener('change', renderCollection);
$('rifle-equip').addEventListener('click', event => {
  if (event.currentTarget.getAttribute('aria-disabled') !== 'true') equipRifle(selectedRifle);
});
$('rifle-default').addEventListener('click', () => equipRifle(null));
$('retry').addEventListener('click', loadProgress);
window.addEventListener('hashchange', () => showView(true));
function reloadIfProfileChanged() {
  if (activeProfile() === pageProfile) return false;
  location.reload();
  return true;
}
window.addEventListener('pageshow', event => {
  if (!reloadIfProfileChanged() && event.persisted) loadProgress();
});
window.addEventListener('focus', reloadIfProfileChanged);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) reloadIfProfileChanged();
});
showView();
loadProgress();

const panel = $('panel'),
  body = $('panel-body');
function openPanel(title) {
  $('panel-title').textContent = title;
  body.replaceChildren();
  if (!panel.open) panel.showModal();
}
function field(label, control) {
  const row = element('label', '', label);
  row.append(control);
  body.append(row);
}
function settings() {
  openPanel('游戏设置');
  const prefs = preferences();
  const save = () => {
    storePreferences(prefs);
    updateVolume();
  };
  for (const [id, label, min, max, step] of [
    ['sensitivity', '鼠标灵敏度', 0.25, 3, 0.05],
    ['fov', '视野角度', 55, 105, 1],
    ['volume', '主音量', 0, 100, 1],
    ['hitShake', '受击震动强度', 0, 1, 0.1],
  ]) {
    const input = element('input');
    Object.assign(input, { type: 'range', min, max, step, value: prefs[id] });
    const value = element('output', '', prefs[id]);
    input.oninput = () => {
      prefs[id] = Number(input.value);
      value.value = input.value;
      save();
    };
    const group = element('span');
    group.append(input, value);
    field(label, group);
    input.setAttribute('aria-label', label);
  }
  for (const [id, label, choices] of [
    [
      'difficulty',
      '难度',
      [
        ['assist', '辅助'],
        ['standard', '标准'],
        ['hard', '困难'],
      ],
    ],
    [
      'quality',
      '画质',
      [
        ['auto', '自动'],
        ['high', '高'],
        ['medium', '中'],
        ['low', '低'],
      ],
    ],
  ]) {
    const select = element('select');
    for (const [v, name] of choices) select.add(new Option(name, v));
    select.value = prefs[id];
    select.onchange = () => {
      prefs[id] = select.value;
      save();
    };
    field(label, select);
  }
  for (const [id, label] of [
    ['steady', '减弱镜头震动'],
    ['directionIndicators', '显示受击方向'],
    ['metrics', '显示性能面板'],
    ['gamepad', '标准手柄输入'],
  ]) {
    const input = element('input');
    input.type = 'checkbox';
    input.checked = prefs[id];
    input.onchange = () => {
      prefs[id] = input.checked;
      save();
    };
    field(label, input);
  }
  body.append(element('h3', '', '键位设置'));
  for (const [i, id] of Object.keys(defaultKeys).entries()) {
    const button = element('button', 'secondary-action', keyName(prefs.keys[id]));
    button.dataset.binding = id;
    button.setAttribute('aria-label', actionLabels[i]);
    button.onclick = () => {
      button.textContent = '按下新键';
      button.dataset.wait = '';
    };
    button.onblur = () => {
      delete button.dataset.wait;
      button.textContent = keyName(prefs.keys[id]);
    };
    button.onkeydown = (event) => {
      if (!button.hasAttribute('data-wait') || ['Tab', 'Escape'].includes(event.code)) return;
      event.preventDefault();
      event.stopPropagation();
      const other = Object.keys(defaultKeys).find((k) => prefs.keys[k] === event.code);
      if (other) prefs.keys[other] = prefs.keys[id];
      prefs.keys[id] = event.code;
      save();
      delete button.dataset.wait;
      for (const binding of body.querySelectorAll('[data-binding]')) {
        binding.textContent = keyName(prefs.keys[binding.dataset.binding]);
      }
    };
    field(actionLabels[i], button);
  }
}
function updateVolume() {
  const prefs = preferences();
  $('mute').textContent = prefs.muted ? '已静音' : '音量 ' + prefs.volume + '%';
  $('mute').setAttribute('aria-pressed', String(prefs.muted));
  $('control-tip').textContent = [
    ['KeyW', 'KeyA', 'KeyS', 'KeyD'].map((k) => keyName(prefs.keys[k])).join('') + ' 移动',
    '鼠标瞄准',
    keyName(prefs.keys.ShiftLeft) + ' 冲刺',
    keyName(prefs.keys.KeyR) + ' 换弹',
  ].join(' · ');
}
$('settings-open').onclick = settings;
$('mute').onclick = () => {
  const p = preferences();
  p.muted = !p.muted;
  storePreferences(p);
  updateVolume();
};
updateVolume();
$('save-open').onclick = () => {
  openPanel('本机存档');
  if (!progress) return;
  body.append(
    element('p', '', $('last-played').textContent),
    element('p', '', '已结算 ' + progress.battleCount + ' 局 · 通关 ' + $('progress-count').textContent),
  );
  const slots = element('select');
  slots.add(new Option('初始战役', ''));
  for (const entry of profiles()) slots.add(new Option('战役 · ' + date.format(entry.created), entry.id));
  slots.value = activeProfile();
  slots.onchange = () => {
    selectProfile(slots.value);
    location.reload();
  };
  field('切换存档', slots);
  const history = element('a', 'secondary-action', '查看存档记录');
  history.href = '#history';
  history.onclick = () => panel.close();
  body.append(history);
  const refresh = element('button', 'secondary-action', '同步待存对战');
  refresh.onclick = () => {
    panel.close();
    loadProgress();
  };
  body.append(refresh);
};
function showArchive(kind) {
  if (!progress) return;
  openPanel(kind === 'codex' ? '战场图鉴' : '成就与统计');
  if (kind === 'stats') {
    body.append(
      element('p', '', '累计对战 ' + progress.battleCount + ' 局 · 通关 ' + $('progress-count').textContent),
    );
    for (const level of progress.levels)
      body.append(element('p', '', (level.cleared ? '已达成 · ' : '待达成 · ') + level.title + '撤离'));
  } else {
    body.append(
      element('h3', '', '凶兽'),
      element('p', '', '群攻型 · 擅长包抄　重甲型 · 直线冲撞　喷吐型 · 远程攻击　首领 · 半血狂暴'),
      element('h3', '', '带回的宝物'),
    );
    body.append(element('p', '', $('codex-count').textContent));
    for (const item of progress.loot)
      body.append(element('p', '', item.name + ' × ' + item.count + ' · ' + number.format(item.value)));
  }
}
for (const button of document.querySelectorAll('[data-panel]'))
  button.onclick = () => showArchive(button.dataset.panel);
function deploy(href, title) {
  $('deploy-title').textContent = title;
  $('deploy').showModal();
  const hints = ['确认装备后进入战场', '撤离成功可带回宝物', '沿掩体移动，留意备用弹药'];
  let tip = 0;
  const timer = setInterval(() => {
    $('deploy-tip').textContent = hints[++tip % hints.length];
  }, 700);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
  requestAnimationFrame(() => requestAnimationFrame(() => location.assign(href)));
}
$('new-campaign').onclick = () => {
  if (!progress) return;
  openPanel('新的战役');
  body.append(element('p', '', '新建独立存档，从第一关开始。此前的战役可在「存档」中切换回来。'));
  const start = element('button', 'primary-action', '创建存档并开始');
  start.onclick = () => {
    createProfile();
    panel.close();
    deploy(levelUrl(progress.levels[0].id), progress.levels[0].title);
  };
  body.append(start);
};
document.addEventListener('click', (event) => {
  const link = event.target.closest('a.mission-action,#continue');
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button) return;
  event.preventDefault();
  deploy(
    link.href,
    progress.levels.find((level) => link.getAttribute('href') === levelUrl(level.id))?.title ?? '进入战役',
  );
});
document.addEventListener('keydown', (event) => {
  if (document.querySelector('dialog[open]')) return;
  if (event.key === 'Escape' && location.hash !== '#missions') {
    location.hash = 'missions';
    return;
  }
  if (!progress || $('view-missions').hidden) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    const i =
      (selectedIndex + (event.key === 'ArrowLeft' ? -1 : 1) + progress.levels.length) %
      progress.levels.length;
    $('mission-list').children[i].focus();
  } else if (event.key === 'Enter' && event.target.matches('.mission-card')) {
    event.preventDefault();
    event.target.querySelector('a')?.click();
  }
});
window.addEventListener('pageshow', () => {
  if ($('deploy').open) $('deploy').close();
});
