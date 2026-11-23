import { defaultGear, packKit, supplies, modifications } from '@level-kit/gear.mjs';
import { campaignMission, missionNames, missionRules } from '@level-kit/objectives.mjs';

export function initBriefing(stage, config, text, keys, campaign) {
  const mode = document.getElementById('mission-mode');
  const defaultMode = campaignMission(stage);
  for (const id of new Set([defaultMode, 'classic', 'endless'])) {
    mode.add(new Option(missionNames[id] + (id === defaultMode ? ' · 本关默认' : ''), id));
  }
  if (config.supportsHunt) mode.add(new Option('追踪猎杀', 'hunt'));
  function describe() {
    const finish = '，在撤离点按 ' + config.interactLabel + ' 引爆。';
    const rules = {
      hunt: '沿足迹和叫声搜索猎物，在时限内击倒，再携带徽印前往撤离区。',
      classic:
        '累计击杀 ' +
        config.beasts.killsToWin +
        ' 只凶兽，击败' +
        text.bossName +
        '并取得' +
        text.keyItem +
        finish,
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
      endless: '尽可能长时间生存，每 ' + missionRules.waveSeconds + ' 秒增加一波增援。此模式没有撤离结算。',
    };
    if (stage === 1) rules.classic = '逐区清除守卫，使用门禁推进，取得' + text.keyItem + '后前往撤离点。';
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
