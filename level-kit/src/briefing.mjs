import { defaultGear, packKit, supplies, modifications } from '@level-kit/gear.mjs';
import { campaignMission, missionNames, missionRules } from '@level-kit/objectives.mjs';

export function initBriefing(stage, config, text, keys, campaign, story) {
  const mode = document.getElementById('mission-mode');
  const defaultMode = story?.defaultMode??campaignMission(stage);
  for (const id of new Set(story?.modes??[defaultMode, 'classic', 'endless'])) {
    const label = id==='escort' && story?.convoy ? '护送'+story.convoy.name :
      id==='classic' && story?.classicAction ? story.classicAction : missionNames[id];
    mode.add(new Option(label + (id === defaultMode ? ' · 本关默认' : ''), id));
  }
  if (config.supportsHunt) mode.add(new Option('追踪猎杀', 'hunt'));
  function describe() {
    const finish = '，在撤离点按 ' + config.interactLabel + ' 引爆。';
    const rules = {
      hunt: '沿足迹和叫声搜索猎物，在时限内击倒，再携带徽印前往撤离区。',
      classic: '逐区清除守卫，击败' + text.bossName + '并取得' + text.keyItem + finish,
      hold: '在撤离区累计坚守 ' + missionRules.holdSeconds + ' 秒' + finish,
      escort: '保护勘探无人机的生命值，跟随它抵达撤离区' + finish,
      rescue:
        '启动信标，在观景台坚守 ' +
        missionRules.rescueSeconds +
        ' 秒，然后到直升机旁按 ' +
        config.interactLabel +
        ' 登机。',
      timed:
        '击败' +
        text.bossName +
        '并取得' +
        text.keyItem +
        '，在 ' +
        missionRules.escapeSeconds +
        ' 秒内到达撤离点并引爆。',
      endless: '清空本波普通凶兽后，下一波敌群一起入场。此模式没有撤离结算。',
    };
    if (story?.classicRule) rules.classic = story.classicRule;
    if (story?.convoy) rules.escort = story.convoy.rule;
    if (story?.defense) rules.hold = story.defense.rule;
    if (stage === 3)
      rules.hold =
        '在钟楼坚守 ' +
        missionRules.holdSeconds +
        ' 秒，再布设装置。撤开等待 ' +
        missionRules.demolitionSeconds +
        ' 秒起爆，穿过闸门撤离。';
    document.getElementById('mission-rule').textContent = rules[mode.value];
  }
  mode.addEventListener('change', describe);
  describe();
  function showKit(kit, catalog, changed) {
    const slots = [...kit.skills, ...kit.items].map((id, index) => {
      const row = document.createElement('div'),
        key = document.createElement('kbd');
      const name = document.createElement('strong'),
        detail = document.createElement('small');
      const role = (index < 2 ? '技能' : '道具') + (index % 2 ? '二' : '一');
      key.textContent = keys[index];
      name.textContent = catalog[id]?.name ?? '空槽';
      detail.textContent =
        role +
        (id
          ? index < 2
            ? ' · 冷却 ' + catalog[id].cooldown + ' 秒'
            : ' · 携带 ×' + (kit.counts[id] ?? 0)
          : '');
      row.append(key, name, detail);
      return row;
    });
    document.getElementById('kit-preview').replaceChildren(...slots);
    const branches = Object.values(kit.build ?? {})
      .map((id) => modifications[id]?.name)
      .filter(Boolean);
    document.getElementById('weapon-build').textContent = '武器改装 · ' + (branches.join(' / ') || '原装');
    document.getElementById('loadout-state').textContent = campaign
      ? changed
        ? '本次已调整，出发时保存'
        : '沿用存档装备'
      : '单关练习配给';
  }
  if (campaign) campaign.onLoadout(showKit);
  else showKit(packKit(defaultGear(), supplies), supplies, false);
}
