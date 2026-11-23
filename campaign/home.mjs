import { flushPendingBattles } from './save.mjs';
import { rifleSkins, resolveRifleSkin } from '@level-kit/rifle-skins.mjs';

const $ = id => document.getElementById(id);
const views = ['missions', 'history', 'collection'];
const number = new Intl.NumberFormat('zh-CN');
const date = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const order = index => String(index + 1).padStart(2, '0');
const levelUrl = id => './' + id + '/';
const coverUrl = id => './campaign/images/' + id + '.webp';
const option = $('collection-level');
const more = $('more-battles');
let progress;
let before;
let loading = false;
let selectedRifle, previewPromise, savingRifle = false;
const rifleOptions = new Map();

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

async function read(url) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('读取存档失败');
  return response.json();
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
  row.append(cover, content);
  return row;
}

function renderMissions() {
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

function updateWeaponPreview() {
  if (!selectedRifle) return;
  const visible = !$('view-collection').hidden;
  if (!visible && !previewPromise) return;
  previewPromise ??= import('./weapon-preview.mjs').then(({ createWeaponPreview }) =>
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
    const response = await fetch('/api/loadout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skin }), signal: AbortSignal.timeout(8000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    const restoreFocus = skin === null && document.activeElement === $('rifle-default');
    progress.equippedSkin = result.equippedSkin;
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
  progress = await read('/api/progress');
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
    feedback('无法读取存档。请确认本机游戏服务已启动，再试一次。', true);
  } finally {
    loading = false;
  }
}

more.addEventListener('click', async () => {
  if (!before) return;
  const snapshot = progress;
  more.disabled = true;
  try {
    const page = await read('/api/battles?before=' + before);
    if (snapshot !== progress) return;
    appendBattles(page);
    feedback('');
    if (!before) $('history-region').focus({ preventScroll: true });
  } catch {
    feedback('暂时无法加载更多对战记录，请重试。');
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
window.addEventListener('pageshow', event => { if (event.persisted) loadProgress(); });
showView();
loadProgress();
