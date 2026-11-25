import { campaignStore } from './store.mjs';
import { fieldConfig } from '../level-kit/src/field-sites.mjs';
import { flushPendingBattles } from './save.mjs';
import { summarize, renderReport, renderStats } from './reports.mjs';
import { rifleSkins, resolveRifleSkin } from '../level-kit/src/rifle-skins.mjs';
import {weaponBuildPanel} from './weapon-build.mjs';
import {reactionCatalog} from '../level-kit/src/weapon-perks.mjs';

import { profiles, activeProfile, createProfile, selectProfile } from './profiles.mjs';
import { RED_DOT_AIM_ENABLED, preferences, storePreferences, defaultKeys, actionLabels, keyName, bindSoundControl } from '../level-kit/src/preferences.mjs';

const $ = id => document.getElementById(id);
const views = ['menu', 'missions', 'history', 'collection'];
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
let statistics = [];
let statisticsAvailable = true;
let totals = summarize();
let loadoutRevision = 0;
let before;
let loading = false;
let selectedRifle, previewPromise, savingRifle = false;
const rifleOptions = new Map();
const pageProfile = activeProfile();
const renderBuild=weaponBuildPanel($('weapon-mod-slots'),campaignStore);
$('weapon-customize').addEventListener('toggle',()=>{
  if($('weapon-customize').open && selectedRifle) renderBuild(selectedRifle);
});

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content != null) node.textContent = content;
  return node;
}

let previousView = null;
function showView(moveFocus = false) {
  const hash = location.hash.slice(1);
  const view = views.includes(hash) ? hash : 'menu';
  for (const name of views) $('view-' + name).hidden = name !== view;
  if (moveFocus) {
    const opener = view === 'menu' && document.querySelector('nav a[href="#' + previousView + '"]');
    (opener || $('view-' + view).querySelector('h1')).focus({preventScroll: true});
  }
  if (view === 'missions' && progress) revealMission();
  previousView = view;
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

  const button = element('button', 'mission-option');
  button.type = 'button';
  button.dataset.level = level.id;
  const label = element('span', 'slot-number', order(index));
  const title = element('strong', '', level.title);
  const status = element('small', '', level.cleared ? '已通关' : level.unlocked ? '可挑战' : '未解锁');
  button.append(label, title, status);
  button.addEventListener('click', () => renderHero(index));
  row.append(button);
  return row;
}

let selectedIndex = -1;
function revealMission() {
  const list = $('mission-list'), card = list.children[selectedIndex];
  // 仅移动桌面列表，读到中后段存档时也能直接看见当前关卡。
  if (!card || !list.clientHeight || list.scrollHeight <= list.clientHeight) return;
  const bound = list.getBoundingClientRect(), item = card.getBoundingClientRect();
  if (item.top < bound.top) list.scrollTop += item.top - bound.top;
  else if (item.bottom > bound.bottom) list.scrollTop += item.bottom - bound.bottom;
}
function renderHero(index) {
  selectedIndex = index;
  const level = progress.levels[index];
  $('hero-art').src = coverUrl(level.id);
  $('hero-chapter').textContent = '战役 / ' + order(index);
  $('game-title').textContent = level.title;
  document.querySelector('.hero-description').textContent = level.brief;
  $('current-mission').textContent = level.cleared ? '已通关，可再次挑战' : level.unlocked ? '已开放，可挑战' : '通关「' + progress.levels[index - 1].title + '」后开放';
  const best = progress.best?.[level.id];
  $('mission-record').textContent = best ? best.kills + ' 击杀 · ' + (best.time == null ? '未撤离' : playTime(best.time)) + ' · ' + best.loot + ' 件 · ' + (totals.levels.get(level.id) ?? '未评级') : '暂无成绩';
  $('prepare-mission').disabled = !level.unlocked;
  for (const [i, row] of [...$('mission-list').children].entries()) {
    row.toggleAttribute('data-selected', i === index);
    const button = row.firstElementChild;
    button.setAttribute('aria-pressed', String(i === index));
    button.tabIndex = i === index ? 0 : -1;
  }
}

function renderMissions() {
  for (const control of document.querySelectorAll('#save-open,[data-panel]')) control.disabled = false;
  const levels = progress.levels;
  const current = levels.find(level => level.unlocked && !level.cleared) || levels.filter(level => level.unlocked).at(-1);
  const cleared = levels.filter(level => level.cleared).length;
  $('progress-count').textContent = cleared + ' / ' + levels.length;
  $('campaign-progress').max = levels.length;
  $('campaign-progress').value = cleared;
  $('mission-list').replaceChildren(...levels.map((level, index) => missionCard(level, index, level === current)));
  const params = new URLSearchParams(location.search);
  const requested = levels.findIndex(level => level.id === (params.get('mission') || params.get('locked')));
  renderHero(selectedIndex >= 0 ? selectedIndex : requested >= 0 ? requested : levels.indexOf(current));
  revealMission();
  $('continue').href = levelUrl(current.id);
  $('continue').hidden = false;
  $('continue').textContent = cleared || progress.battleCount ? '继续战役' : '开始战役';
  $('menu-art').src = coverUrl(current.id);
  $('current-title').textContent = current.title;
  const profile = profiles().find(entry => entry.id === pageProfile);
  $('save-open').textContent = profile ? '存档 · ' + date.format(profile.created) : '存档 · 初始战役';
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
    result.append(element('span', battle.won ? 'outcome won' : 'outcome lost', battle.won ? '行动成功' : '行动失败'));
    row.append(title, result, ...[
      number.format(battle.kills), playTime(battle.durationMs), number.format(battle.lootCount) + ' 件',
      number.format(battle.lootValue), date.format(battle.endedAt),
    ].map(value => element('td', '', value)));
    const details = element('button', 'secondary-action', '查看战报');
    details.addEventListener('click', () => showReport(battle.id));
    const action = element('td');
    action.append(details);
    row.append(action);
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
  const mainLoot = item=>!(/^(宝库·|传奇·|秘藏·|精英徽记|精英改装材料|猎场徽印)/).test(item.name);
  const main=items.filter(mainLoot).length;
  const slots = Math.max(0, progress.lootPerLevel - main);
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
  $('selected-loot-count').textContent = main + ' / ' + progress.lootPerLevel + (items.length>main?' · 额外藏品 '+(items.length-main):'');
  $('collection-count').textContent = '已收集 ' + progress.loot.filter(mainLoot).length + ' / ' + (progress.levels.length * progress.lootPerLevel);
}

let threeLoading;
async function loadThree() {
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
}

function ensureThree() {
  threeLoading ??= loadThree().catch(error => { threeLoading = null; throw error; });
  return threeLoading;
}

const galleryDialog = $('gallery');
let galleryView;
$('gallery-open').onclick = async () => {
  galleryDialog.showModal();
  updateWeaponPreview();
  $('gallery-status').textContent = '正在加载展品…';
  try {
    await ensureThree();
    const { createGallery } = await import('./gallery/view.mjs');
    if (!galleryDialog.open) return;
    galleryView ??= createGallery(galleryDialog);
    $('gallery-layout').hidden = false;
    galleryView.open(preferences().quality);
    $('gallery-status').textContent = '';
  } catch (error) {
    console.warn('凶兽展示厅无法启动', error);
    $('gallery-layout').hidden = true;
    $('gallery-status').textContent = '无法显示三维展品，请使用支持 WebGL 的浏览器并启用硬件加速。';
  }
};
galleryDialog.addEventListener('close', () => {
  if (galleryDialog.open) return;
  galleryView?.close();
  $('gallery-layout').hidden = true;
  $('gallery-open').focus();
  updateWeaponPreview();
});

function updateWeaponPreview() {
  if (!selectedRifle) return;
  const visible = !$('view-collection').hidden && !galleryDialog.open;
  if (!visible && !previewPromise) return;
  previewPromise ??= ensureThree().then(() => import('./weapon-preview.mjs')).then(({ createWeaponPreview }) =>
    createWeaponPreview($('rifle-canvas'), $('rifle-reset-view'))).catch(error => {
    console.warn('武器预览无法启动', error);
    $('rifle-canvas').hidden = true;
    $('rifle-reset-view').hidden = true;
    $('rifle-preview-tip').textContent = '此浏览器暂时无法显示三维预览。';
  });
  previewPromise.then(preview => preview?.show(selectedRifle, !$('view-collection').hidden && !galleryDialog.open, totals.weapons.get(selectedRifle)?.kills ?? 0));
}

function renderRifles() {
  const levels = progress.levels.filter(level => Object.hasOwn(rifleSkins, level.id));
  for (const [id,skin] of Object.entries(rifleSkins)) {
    if (!skin.unlock) continue;
    const stage=progress.levels.find(level=>level.id===skin.unlock);
    if (stage) levels.push({...stage,id});
  }
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
  if($('weapon-customize').open) renderBuild(selectedRifle);
  $('rifle-canvas').setAttribute('aria-label', skin.name + '三维预览');
  $('rifle-equipped').textContent = equipped ? '当前佩戴 ' + rifleSkins[equipped].name : '当前使用关卡默认外观';
  const weaponStats = totals.weapons.get(selectedRifle);
  $('rifle-statistics').textContent = statisticsAvailable ? '累计击杀 ' + (weaponStats?.kills ?? 0) + ' · 命中率 ' + (weaponStats?.shots ? Math.round(weaponStats.hits / weaponStats.shots * 100) + '%' : '未记录') : '武器统计暂不可用';
  $('rifle-equip').textContent = selectedEquipped ? '已佩戴' : source.cleared ? '佩戴外观' : '尚未解锁';
  $('rifle-equip').setAttribute('aria-disabled', String(savingRifle || selectedEquipped || !source.cleared));
  $('rifle-default').hidden = !equipped;
  $('rifle-default').setAttribute('aria-disabled', String(savingRifle));
  for (const level of levels) {
    let row = rifleOptions.get(level.id);
    if (!row) {
      const category=rifleSkins[level.id].category ?? '步枪';
      if (list.dataset.lastCategory!==category) {
        list.append(element('li','rifle-category',category));
        list.dataset.lastCategory=category;
      }
      const item = element('li');
      const button = element('button', 'rifle-option');
      button.dataset.weaponId=level.id;
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
  const store = await campaignStore(feedback);
  const [updated, rows] = await Promise.all([store.progress(), store.statistics().catch(()=>null)]);
  statisticsAvailable=rows!==null;
  if(statisticsAvailable) {
    statistics=rows;
    totals=summarize(rows);
  }
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
async function showReport(id) {
  openPanel('单局战报');
  const message = element('p', '', '正在读取战报');
  body.append(message);
  try {
    const store = await campaignStore(), battle = await store.report(id);
    if (!message.isConnected) return;
    if (!battle) throw Error();
    message.remove();
    renderReport(body, battle, progress.levels, store);
  } catch {
    message.textContent = '暂时无法读取本局战报，请重新打开。';
  }
}
function field(label, control) {
  const row = element('label', '', label);
  row.append(control);
  body.append(row);
}
function settings() {
  openPanel('游戏设置');
  const prefs = preferences();
  const save = (id, value) => {
    // 设置面板可能跨页保持打开，只写用户刚改的一项，保留其他窗口的最新选择。
    prefs[id] = value;
    storePreferences({ ...preferences(), [id]: value });
    updateVolume();
  };
  for (const [id, label, min, max, step] of [
    ['sensitivity', '鼠标灵敏度', 0.25, 3, 0.05],
    ['fov', '视野角度', 55, 105, 1],
    ['volume', '主音量', 0, 100, 1],
    ['hitShake', '受击震动强度', 0, 1, 0.1],
    ['attackShake', '击杀震动强度', 0, 1, 0.1],
  ]) {
    const input = element('input');
    Object.assign(input, { type: 'range', min, max, step, value: prefs[id] });
    const value = element('output', '', prefs[id]);
    input.oninput = () => {
      value.value = input.value;
      save(id, Number(input.value));
    };
    const group = element('span');
    group.append(input, value);
    field(label, group);
    input.setAttribute('aria-label', label);
  }
  for (const [id, label, choices] of [
    ['aimMode', '右键瞄准', [['toggle', '单击切换'], ['hold', '按住开镜']]],
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
    if (id === 'aimMode' && !RED_DOT_AIM_ENABLED) continue;
    const select = element('select');
    for (const [v, name] of choices) select.add(new Option(name, v));
    select.value = prefs[id];
    select.onchange = () => {
      save(id, select.value);
    };
    field(label, select);
  }
  for (const [id, label] of [
    ['steady', '减弱镜头震动'],
    ['directionIndicators', '显示受击方向'],
    ['metrics', '显示性能面板'],
    ['gamepad', '标准手柄输入'],
    ['recordReplay', '录制战术回放'],
  ]) {
    const input = element('input');
    input.type = 'checkbox';
    input.checked = prefs[id];
    input.onchange = () => {
      save(id, input.checked);
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
      const keys = preferences().keys;
      const other = Object.keys(defaultKeys).find((k) => keys[k] === event.code);
      if (other) keys[other] = keys[id];
      keys[id] = event.code;
      save('keys', keys);
      delete button.dataset.wait;
      for (const binding of body.querySelectorAll('[data-binding]')) {
        binding.textContent = keyName(prefs.keys[binding.dataset.binding]);
      }
    };
    field(actionLabels[i], button);
  }
}
const refreshSound = bindSoundControl({button: $('mute')});
function updateVolume() {
  const prefs = preferences();
  refreshSound(prefs);
  $('control-tip').textContent = [
    ['KeyW', 'KeyA', 'KeyS', 'KeyD'].map((k) => keyName(prefs.keys[k])).join('') + ' 移动',
    '鼠标瞄准',
    keyName(prefs.keys.ShiftLeft) + ' 冲刺',
    keyName(prefs.keys.KeyR) + ' 换弹',
  ].join(' · ');
}
$('settings-open').onclick = settings;
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
  const create = element('button', 'secondary-action', '新的战役');
  create.id = 'new-campaign';
  create.onclick = newCampaign;
  body.append(refresh, create);
};
function showArchive(kind) {
  if (!progress) return;
  openPanel(kind === 'codex' ? '战场图鉴' : '成就与统计');
  if (kind === 'stats') {
    body.append(
      element('p', '', '累计对战 ' + progress.battleCount + ' 局 · 通关 ' + $('progress-count').textContent),
    );
    if(statisticsAvailable) renderStats(body, statistics);
    else body.append(element('p','','本次未能读取战斗统计，请重新读取存档。'));
    for (const level of progress.levels)
      body.append(element('p', '', (level.cleared ? '已达成 · ' : '待达成 · ') + level.title + '撤离'));
  } else {
    body.append(
      element('h3', '', '凶兽'),
      element('p', '', '群攻型擅长包抄，重甲型直线冲撞，喷吐型善于远攻。首领的阶段和破甲状态显示在血条旁。'),
      element('p', '', '红色鼓胀的自爆体应在引爆前击杀。蓝环护盾体会保护身边的普通凶兽，瞄准核心可破盾。绿色冠状孵化体能治疗或孵化，蓄能时命中即可打断。'),
      element('p', '', '少数精英凶兽携有徽记或改装材料，拾取后成功撤离即可带回。留意名字旁的词缀，厚甲应从背后攻击，荆棘应拉开距离，燃迹会在经过的地面留下火焰。'),
      element('h3', '', '带回的宝物'),
    );
    body.append(element('p', '', '已收集 '+progress.loot.length+' 种宝物'));
    for (const item of progress.loot)
      body.append(element('p', '', item.name + ' × ' + item.count + ' · ' + number.format(item.value)));
    body.append(element('h3','','传奇收藏'));
    for(const item of progress.loot.filter(i=>i.name.startsWith('传奇·')))body.append(element('p','',item.name));
    body.append(element('h3','','关卡秘闻'));
    for(const level of progress.levels){
      const found=progress.discoveries?.includes(level.id);
      body.append(element('p','',level.title+' · '+(found?'1 / 1 · '+(fieldConfig(level.id)?.lore??'已发现'):'0 / 1')));
    }
    body.append(element('h3','','元素反应'));
    for(const reaction of reactionCatalog) body.append(element('p','',reaction.name+' · '+reaction.rule));
  }
}
for (const button of document.querySelectorAll('[data-panel]'))
  button.onclick = () => showArchive(button.dataset.panel);
$('training-open').onclick = () => {
  openPanel('训练');
  for (const [mode, name] of [['tutorial', '新手教程'], ['range', '火力试验场']]) {
    const link = element('a', 'secondary-action', name);
    link.href = './practice/index.html?mode=' + mode;
    body.append(link);
  }
};
const fullscreen = $('fullscreen');
fullscreen.hidden = !document.fullscreenEnabled;
fullscreen.onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { feedback('浏览器未能切换全屏。'); }
};
document.addEventListener('fullscreenchange', () => {
  fullscreen.textContent = document.fullscreenElement ? '退出全屏' : '全屏';
});

let loadRequest;
async function deploy(href, title) {
  const dialog = $('deploy');
  const request = new AbortController();
  loadRequest?.abort();
  loadRequest = request;
  $('deploy-title').textContent = title;
  $('deploy-tip').textContent = '正在打开行动资源';
  $('retry-load').hidden = true;
  dialog.querySelector('progress').hidden = false;
  if (!dialog.open) dialog.showModal();
  try {
    if (location.protocol !== 'file:') {
      const response = await fetch(href, {method: 'HEAD', signal: request.signal});
      if (!response.ok) throw Error();
    }
    if (dialog.open && !request.signal.aborted) location.assign(href);
  } catch {
    if (request.signal.aborted) return;
    $('deploy-tip').textContent = '行动资源读取失败，请检查连接后重试。';
    dialog.querySelector('progress').hidden = true;
    $('retry-load').hidden = false;
    $('retry-load').onclick = () => deploy(href, title);
  }
}
$('cancel-load').onclick = () => {
  loadRequest?.abort();
  $('deploy').close();
};
$('deploy').addEventListener('cancel', () => loadRequest?.abort());
$('deploy').addEventListener('close', reloadIfProfileChanged);
$('prepare-mission').onclick = () => {
  const level = progress?.levels[selectedIndex];
  if (level?.unlocked) deploy(levelUrl(level.id), level.title);
};
function newCampaign() {
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
}
document.addEventListener('click', (event) => {
  const link = event.target.closest('#continue[href]');
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button) return;
  event.preventDefault();
  deploy(
    link.href,
    progress.levels.find((level) => link.getAttribute('href') === levelUrl(level.id))?.title ?? '进入战役',
  );
});
document.addEventListener('keydown', (event) => {
  if (document.querySelector('dialog[open]')) return;
  if (event.key === 'Escape') {
    if ($('view-menu').hidden) location.hash = 'menu';
    return;
  }
  if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
  const group = event.target.closest('.vertical-menu, #mission-list');
  if (!group) return;
  const items = [...group.querySelectorAll('button:not(:disabled), a[href]')].filter(item => !item.hidden);
  const index = items.indexOf(event.target);
  if (index < 0) return;
  event.preventDefault();
  const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
  items[next].focus();
  if (group.id === 'mission-list') renderHero(next);
});
window.addEventListener('pageshow', () => {
  if ($('deploy').open) $('deploy').close();
});

for (const id of ['training-open', 'gallery-open', 'settings-open', 'mute']) $(id).disabled = false;
