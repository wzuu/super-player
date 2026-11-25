import {
  defaultGear,
  modifications,
  selectedBranches,
  chooseBranch,
  requisition,
  updateGear,
} from '../level-kit/src/gear.mjs';

export function weaponBuildPanel(panel, campaignStore, collectedLoot) {
  let generation = 0;
  return async function render(weapon) {
    const version = ++generation;
    const content = document.createElement('div');
    try {
      const store = await campaignStore(),
        snapshot = await store.gear();
      if (version !== generation) return;
      const gear = defaultGear(snapshot.state),
        build = selectedBranches(gear, weapon);
      const credit = document.createElement('p');
      credit.textContent =
        '剩余 ' +
        (snapshot.earned - gear.spent) +
        ' 军需点。分支永久解锁，同一槽位只能装一种。已购分支按枪免费切换。';
      content.append(credit);
      for (const slot of ['弹药', '枪管', '供弹']) {
        const section = document.createElement('fieldset'),
          legend = document.createElement('legend');
        legend.textContent = slot;
        section.append(legend);
        for (const [id, branch] of Object.entries(modifications).filter(([, b]) => b.slot === slot)) {
          const button = document.createElement('button'),
            detail = document.createElement('span');
          const chosen = build[slot] === id;
          button.type = 'button';
          button.disabled = chosen;
          button.textContent =
            branch.name + ' · ' + (chosen ? '已选' : gear.mods[id] ? '免费切换' : branch.price + ' 点');
          detail.textContent = branch.detail + (gear.mods[id] ? ' · 已解锁' :
            ' · 可用 ' + (snapshot.earned - gear.spent) + ' / 所需 ' + branch.price + ' 军需点');
          if (id === 'pierce') {
            const count = collectedLoot().filter(item => item.name === '精英改装材料·穿透弹芯')
              .reduce((sum, item) => sum + item.count, 0);
            const source = document.createElement('a');
            const back = new URLSearchParams(location.hash.split('?')[1]);
            back.set('weapon', weapon);
            source.href = '#codex/loot?' + new URLSearchParams({item:'pierce', armory:'?' + back});
            source.textContent = '穿透弹芯来源';
            detail.append(document.createElement('br'), '花 ' + branch.price + ' 军需点购买，或带回 1 枚穿透弹芯解锁。累计带回 ' + count + ' 枚。 ', source);
          }
          button.onclick = async () => {
            for (const b of content.querySelectorAll('button')) b.disabled = true;
            try {
              await updateGear(store, (state, latest) => {
                if (!state.mods[id]) requisition(state, id, latest.earned, {}, weapon);
                chooseBranch(state, weapon, id);
              });
            } catch (error) {
              credit.textContent = error.message;
              for (const b of content.querySelectorAll('button')) b.disabled = b.dataset.chosen === 'true';
              return;
            }
            if (version === generation) await render(weapon);
          };
          button.dataset.chosen = String(chosen);
          section.append(button, detail);
        }
        content.append(section);
      }
      panel.replaceChildren(content);
    } catch (error) {
      if (version === generation) panel.textContent = '改装数据读取失败 · ' + error.message;
    }
  };
}
