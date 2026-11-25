import { campaignStore, profileProgress } from './store.mjs';
import { fieldConfig } from '../level-kit/src/field-sites.mjs';
import { flushPendingBattles } from './save.mjs';
import { summarize, renderReport, renderStats, replayViewer } from './reports.mjs';
import { rifleSkins, resolveRifleSkin } from '../level-kit/src/rifle-skins.mjs';
import {weaponBuildPanel} from './weapon-build.mjs';
import {reactionCatalog} from '../level-kit/src/weapon-perks.mjs';

import { profiles, activeProfile, createProfile, selectProfile } from './profiles.mjs';
import { RED_DOT_AIM_ENABLED, preferences, storePreferences, defaultKeys, actionLabels, keyName, bindSoundControl } from '../level-kit/src/preferences.mjs';

const $ = id => document.getElementById(id);
const titles = {
  menu:'主菜单', missions:'战役大厅', collection:'军械库', history:'对战记录', report:'单局战报', replay:'战术回放',
  training:'训练', codex:'战场图鉴', beasts:'凶兽图鉴', loot:'战利品图鉴', lore:'关卡秘闻', reactions:'元素反应',
  gallery:'凶兽展示厅', stats:'成就与统计', settings:'游戏设置', saves:'存档管理',
};
const number = new Intl.NumberFormat('zh-CN');
const date = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const order = index => String(index + 1).padStart(2, '0');
const levelUrl = id => './' + id + (location.protocol==='file:' ? '/index.html?campaign' : '/');
const coverUrl = id => './campaign/images/' + id + '.webp';
const option = $('collection-level');
const more = $('more-battles');
let progress, progressFailed = false;
let statistics = [];
let statisticsAvailable = true;
let totals = summarize();
let loadoutRevision = 0;
let before;
let loading = false;
let selectedRifle, previewPromise, savingRifle = false;
const rifleOptions = new Map();
const pageProfile = activeProfile();
const renderBuild=weaponBuildPanel($('weapon-mod-slots'),campaignStore, () => progress?.loot ?? []);
$('weapon-customize').addEventListener('toggle',()=>{
  if($('weapon-customize').open && selectedRifle) renderBuild(selectedRifle);
});

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content != null) node.textContent = content;
  return node;
}

let route, currentSection;
const marks = new Map();
const bookmarkKey = 'super-player:menu:' + new URL('./', location.href).pathname + ':' + pageProfile;
try {
  const saved = JSON.parse(sessionStorage.getItem(bookmarkKey));
  if (saved) for (const [key, value] of saved) marks.set(key, value);
} catch { /* 浏览器可禁止会话存储。 */ }

function parseRoute() {
  const [path, query] = location.hash.slice(1).split('?');
  const params = new URLSearchParams(query);
  const [root, child, leaf, extra] = path.split('/');
  let name = root || 'menu', parent = 'menu', id;
  if (root === 'codex' && child) {
    if (child === 'beasts' && leaf === 'gallery' && !extra) {
      name = 'gallery'; parent = 'codex/beasts';
    } else if (['beasts','loot','lore','reactions'].includes(child) && !leaf) {
      name = child; parent = 'codex';
    } else name = 'codex';
  } else if (root === 'history' && child && !extra && (!leaf || leaf === 'replay')) {
    try { id = decodeURIComponent(child); } catch { id = ''; }
    name = leaf ? 'replay' : 'report';
    parent = leaf ? 'history/' + child : 'history';
  } else if (child || !['menu','missions','history','collection','training','codex','stats','settings','saves'].includes(name)) {
    name = 'menu';
  }
  const origin = params.get('from');
  if (['saves','stats'].includes(origin)) {
    if (name === 'history' || name === 'missions') parent = origin;
    if (name === 'report' || name === 'replay') parent += '?from=' + origin;
  }
  return {name, parent, id, key:location.hash || '#menu', params};
}
function remember(target = document.activeElement) {
  if (!route || !currentSection) return;
  const mark = {y:scrollY, sectionTop:currentSection.scrollTop, tableTop:$('history-region').scrollTop, rows:$('battle-list').children.length};
  if (target?.classList.contains('back') && target.id !== 'save-open') {
    const previous = marks.get(route.key);
    if (previous?.id) mark.id = previous.id;
    if (previous?.href) mark.href = previous.href;
  } else if (target?.id) mark.id = target.id;
  else if (target?.matches('a[href]')) mark.href = target.getAttribute('href');
  marks.set(route.key, mark);
  try { sessionStorage.setItem(bookmarkKey, JSON.stringify([...marks].slice(-60))); } catch {}
}
function restoreFocus() {
  const mark = marks.get(route.key);
  let target = mark?.id ? $(mark.id) : null;
  if (!target && mark?.href) target = [...currentSection.querySelectorAll('a')].find(a=>a.getAttribute('href') === mark.href);
  if (!target?.getClientRects().length) target = currentSection.querySelector('h1');
  target.focus({preventScroll:true});
  currentSection.scrollTop = mark?.sectionTop || 0;
  if (route.name === 'history') $('history-region').scrollTop = mark?.tableTop || 0;
  scrollTo(0, mark?.y || 0);
}
function linkTo(href, title, id) {
  const link = element('a','secondary-action',title);
  link.href = href;
  if (id) link.id = id;
  return link;
}
function showView(moveFocus = false) {
  const old = route;
  route = parseRoute();
  currentSection = $(route.name === 'gallery' ? 'gallery' : 'view-' + route.name) || $('view-function');
  for (const section of document.querySelectorAll('main > section')) section.hidden = section !== currentSection;
  if (old?.name === 'gallery') closeGallery();
  $('function-body').replaceChildren();
  $('function-title').textContent = titles[route.name];
  document.title = titles[route.name] + ' · 超级玩家';
  $('loot-catalog').hidden = route.name !== 'loot';
  const back = currentSection.querySelector('a.back');
  if (back) {
    back.href = '#' + route.parent;
    back.textContent = '返回' + titles[route.parent.startsWith('history/') ? 'report' : route.parent.split('?')[0].split('/').at(-1)];
  }
  if (route.name === 'gallery') openGallery();
  if (route.name === 'settings') settings();
  if (route.name === 'training') trainingPage();
  if (route.name === 'missions' && progress) revealMission();
  if (route.name === 'history') {
    for (const link of $('battle-list').querySelectorAll('a')) link.href = reportLink(link.dataset.report);
    void restoreHistory();
  }
  renderDataPage();
  updateWeaponPreview();
  if (moveFocus || location.hash) restoreFocus();
}
function renderDataPage() {
  if (!route) return;
  const body = $('function-body');
  if (['menu','missions','history','training','settings','gallery'].includes(route.name)) return;
  if (route.name === 'collection') {
    const gun = route.params.get('weapon');
    if (progress && Object.hasOwn(rifleSkins, gun) && selectedRifle !== gun) {
      selectedRifle = gun;
      renderRifles();
    }
    if (Object.hasOwn(rifleSkins, gun)) $('weapon-customize').open = true;
    const stage = route.params.get('briefing');
    const back = $('view-collection').querySelector('.back');
    if (stage && progress?.levels.some(l=>l.id === stage && l.unlocked)) {
      const url = new URL(levelUrl(stage), location.href);
      url.searchParams.set('briefMode', route.params.get('mode') || '');
      back.href = url.href;
      back.textContent = '返回战前准备';
    }
    return;
  }
  body.replaceChildren();
  if (['codex','beasts','reactions'].includes(route.name)) {
    showCodex(body);
    return;
  }
  if (!progress) {
    body.textContent = progressFailed ? '未能读取当前存档。' : '正在读取当前存档…';
    return;
  }
  if (route.name === 'report' || route.name === 'replay') showReport(route);
  else if (route.name === 'saves') showSaves(body);
  else if (route.name === 'stats') showStats(body);
  else showCodex(body);
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
  $('save-open').textContent = profile ? '存档 · ' + date.format(profile.created) : pageProfile ? '存档 · 已有战役' : '存档 · 初始战役';
  $('last-played').textContent = progress.battles.length ? '最近游玩 ' + date.format(progress.battles[0].endedAt) : '本机新存档';
}

function playTime(ms) {
  const total = Math.floor(ms / 1000);
  const seconds = String(total % 60).padStart(2, '0');
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return minutes + ':' + seconds;
  return Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0') + ':' + seconds;
}

function reportLink(id) {
  const source = route?.params.get('from');
  return '#history/' + encodeURIComponent(id) + (route?.name === 'history' && ['stats','saves'].includes(source) ? '?from=' + source : '');
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
    const details = linkTo(reportLink(battle.id), '查看战报');
    details.dataset.report = battle.id;
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
  const legendary = items.filter(item => item.name.startsWith('传奇·'));
  $('legendary-count').textContent = '传奇收藏 · ' + (legendary.length ? legendary.map(item=>item.name).join('、') : '本关尚未发现');
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

const gallerySection = $('gallery');
let galleryView, galleryVersion = 0;
async function openGallery() {
  const version = ++galleryVersion;
  $('gallery-status').textContent = '正在加载展品…';
  try {
    await ensureThree();
    const { createGallery } = await import('./gallery/view.mjs');
    if (gallerySection.hidden || version !== galleryVersion) return;
    galleryView ??= createGallery(gallerySection);
    $('gallery-layout').hidden = false;
    galleryView.open(preferences().quality);
    $('gallery-status').textContent = '';
  } catch (error) {
    if (version !== galleryVersion) return;
    console.warn('凶兽展示厅无法启动', error);
    $('gallery-layout').hidden = true;
    $('gallery-status').textContent = '无法显示三维展品，请使用支持 WebGL 的浏览器并启用硬件加速。';
  }
}
function closeGallery() {
  galleryVersion++;
  galleryView?.close();
  $('gallery-layout').hidden = true;
}

function updateWeaponPreview() {
  if (!selectedRifle) return;
  const visible = !$('view-collection').hidden;
  if (!visible && !previewPromise) return;
  previewPromise ??= ensureThree().then(() => import('./weapon-preview.mjs')).then(({ createWeaponPreview }) =>
    createWeaponPreview($('rifle-canvas'), $('rifle-reset-view'))).catch(error => {
    console.warn('武器预览无法启动', error);
    $('rifle-canvas').hidden = true;
    $('rifle-reset-view').hidden = true;
    $('rifle-preview-tip').textContent = '此浏览器暂时无法显示三维预览。';
  });
  previewPromise.then(preview => preview?.show(selectedRifle, !$('view-collection').hidden, totals.weapons.get(selectedRifle)?.kills ?? 0));
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
  renderDataPage();
  if (route?.name === 'history') await restoreHistory();
}
async function restoreHistory() {
  const selectedRoute = route, snapshot = progress;
  const mark = marks.get(selectedRoute.key);
  if (!mark || !snapshot) return;
  try {
    while (before && $('battle-list').children.length < mark.rows) {
      const cursor = before;
      const page = await (await campaignStore()).history(cursor);
      if (route !== selectedRoute || progress !== snapshot || cursor !== before) return;
      appendBattles(page);
    }
    if (route === selectedRoute) restoreFocus();
  } catch {
    $('history-error').textContent = '暂时无法恢复列表位置，可点击加载更多重试。';
    $('history-error').hidden = false;
  }
}

async function loadProgress() {
  if (loading) return;
  loading = true;
  progressFailed = false;
  if (!progress) renderDataPage();
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
    progressFailed = true;
    if (!progress) renderDataPage();
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
    const cursor = before;
    const page = await (await campaignStore()).history(cursor);
    if (snapshot !== progress || cursor !== before) return;
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

const panel = $('panel');
function openPanel(title) {
  $('panel-title').textContent = title;
  $('panel-body').replaceChildren();
  if (!panel.open) panel.showModal();
}
async function showReport({id, name}) {
  const body = $('function-body');
  const message = element('p', '', name === 'replay' ? '正在读取回放' : '正在读取战报');
  body.append(message);
  try {
    const store = await campaignStore();
    if (name === 'replay') {
      const data = await store.replay(id);
      if (!message.isConnected) return;
      if (!data?.samples?.length) { message.textContent = '本局没有录制回放。'; return; }
      message.replaceWith(replayViewer(data));
    } else {
      const battle = await store.report(id);
      if (!message.isConnected) return;
      if (!battle) { message.textContent = '当前存档中没有这份战报。'; return; }
      message.remove();
      renderReport(body, battle, progress.levels, route.params.get('from'));
      if (marks.get(route.key)?.href) restoreFocus();
    }
  } catch {
    message.textContent = '读取失败，请重新打开或刷新页面。';
  }
}
function field(body, label, control) {
  const row = element('label', '', label);
  row.append(control);
  body.append(row);
}
function settings() {
  const groups = {};
  for (const [key, name] of Object.entries({video:'画面与性能',audio:'音频',controls:'操作与键位',assist:'辅助提示与录制'})) {
    groups[key] = element('fieldset');
    groups[key].append(element('legend','',name));
    $('function-body').append(groups[key]);
  }
  const category = id => {
    if (['quality','fov','metrics'].includes(id)) return groups.video;
    if (id === 'volume') return groups.audio;
    if (['gamepad','sensitivity','aimMode'].includes(id)) return groups.controls;
    return groups.assist;
  };
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
    field(category(id), label, group);
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
    field(category(id), label, select);
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
    field(category(id), label, input);
  }
  const body = groups.controls;
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
    field(body, actionLabels[i], button);
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
updateVolume();
function showSaves(body) {
  const entries = [{id:'', created:0}, ...profiles()];
  if (!entries.some(entry=>entry.id === pageProfile)) entries.push({id:pageProfile, created:0});
  const slots = element('select');
  const list = element('ul','save-list');
  for (const entry of entries) {
    const title = entry.id ? (entry.created ? '战役 · ' + date.format(entry.created) : '已有战役') : '初始战役';
    slots.add(new Option(title, entry.id));
    const row = element('li');
    const info = element('p','','正在读取…');
    row.append(element('strong','',title + (entry.id === pageProfile ? ' · 当前存档' : '')), info);
    list.append(row);
    const data = entry.id === pageProfile ? Promise.resolve(progress) : profileProgress(entry.id);
    data.then(save => {
      const last = save.battles[0];
      info.textContent = '通关 ' + save.levels.filter(l=>l.cleared).length + ' / ' + save.levels.length +
        ' · 已结算 ' + save.battleCount + ' 局 · ' + (last ? '最近游玩 ' + date.format(last.endedAt) : '尚未游玩');
    }).catch(()=>{ info.textContent='读取此存档失败，请重试。'; });
  }
  slots.value = pageProfile;
  slots.onchange = () => { selectProfile(slots.value); location.reload(); };
  body.append(list);
  field(body, '切换存档', slots);
  const refresh = element('button', 'secondary-action', '同步待存对战');
  refresh.onclick = loadProgress;
  const create = element('button', 'secondary-action', '新的战役');
  create.id = 'new-campaign';
  create.onclick = newCampaign;
  body.append(linkTo('#history?from=saves','查看存档记录'),refresh,create);
}
function showStats(body) {
  body.append(element('p', '', '累计对战 ' + progress.battleCount + ' 局 · 通关 ' + $('progress-count').textContent));
  if (!progress.battleCount) body.append(element('p','','当前存档暂无对战记录。'));
  if (statisticsAvailable) renderStats(body, statistics);
  else body.append(element('p','','本次未能读取战斗统计，请重新读取存档。'));
  body.append(linkTo('#history?from=stats','查看对战记录'), element('h2','','关卡成就'));
  for (const level of progress.levels) {
    body.append(element('p', '', (level.cleared ? '已达成 · ' : '待达成 · ') + '完成「' + level.title + '」'));
  }
  body.append(linkTo('#missions?from=stats','查看关卡'));
}
function showCodex(body) {
  if (route.name === 'codex') {
    for (const key of ['beasts','loot','lore','reactions']) body.append(linkTo('#codex/' + key,titles[key]));
  } else if (route.name === 'beasts') {
    body.append(
      element('p', '', '群攻型擅长包抄，重甲型直线冲撞，喷吐型善于远攻。首领的阶段和破甲状态显示在血条旁。'),
      element('p', '', '红色鼓胀的自爆体应在引爆前击杀。蓝环护盾体会保护身边的普通凶兽，瞄准核心可破盾。绿色冠状孵化体能治疗或孵化，蓄能时命中即可打断。'),
      element('p', '', '少数精英凶兽携有徽记或改装材料，拾取后成功撤离即可带回。留意名字旁的词缀，厚甲应从背后攻击，荆棘应拉开距离，燃迹会在经过的地面留下火焰。'),
      linkTo('#codex/beasts/gallery','凶兽展示厅','gallery-open'),
    );
  } else if (route.name === 'loot') {
    const core = route.params.get('item') === 'pierce';
    if (core) {
      const name = '精英改装材料·穿透弹芯';
      const count = progress.loot.filter(i=>i.name === name).reduce((sum,i)=>sum+i.count,0);
      body.append(element('h2','',name),element('p','','精英凶兽有机会掉落。成功带回一个即可解锁穿透弹。' +
        (count ? ' 已带回 ' + count + ' 个。' : ' 当前存档尚未发现。')));
      body.append(linkTo('#collection' + (route.params.get('armory')?.startsWith('?') ? route.params.get('armory') : ''),'返回穿透弹改装'));
    }
    if (!progress.loot.length) body.append(element('p','','当前存档还没有带回战利品。'));
    renderCollection();
  } else if (route.name === 'lore') {
    for (const level of progress.levels) {
      const found = progress.discoveries?.includes(level.id);
      body.append(element('p','',level.title+' · '+(found?'1 / 1 · '+(fieldConfig(level.id)?.lore??'已发现'):'0 / 1 · 未发现')));
    }
  } else if (route.name === 'reactions') {
    for (const reaction of reactionCatalog) body.append(element('p','',reaction.name+' · '+reaction.rule));
  }
}
function trainingPage() {
  const body = $('function-body');
  for (const [mode, name, description] of [
    ['tutorial','新手教程','跟随目标练习移动、射击、换弹和交互。'],
    ['range','火力试验场','自由试射武器、练习瞄准并观察命中表现。'],
  ]) {
    const section = element('section');
    section.append(element('p','',description),linkTo('./practice/index.html?mode='+mode,name,mode+'-link'));
    body.append(section);
  }
}
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
  const body = $('panel-body');
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
    if ($('view-menu').hidden) { remember(); currentSection.querySelector('.back')?.click(); }
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

document.addEventListener('click', event => {
  const link = event.target.closest('a[href]');
  if (link) remember(link);
}, true);
window.addEventListener('pagehide', () => remember());
$('mute').disabled = false;
showView();
loadProgress();
