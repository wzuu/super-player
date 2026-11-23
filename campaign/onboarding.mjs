const choiceKey = 'super-player:first-entry:v1';

export function chooseFirstEntry(battleCount, practiceUrl, pendingPrefix) {
  try {
    if (localStorage.getItem(choiceKey)) return Promise.resolve();
  } catch {
    /* 本次选择仍可使用 */
  }
  let returning = battleCount > 0;
  if (!returning && pendingPrefix) {
    try {
      returning = Object.keys(localStorage).some((key) => key.startsWith(pendingPrefix));
    } catch {
      /* 当前存档仍可读取 */
    }
  }
  if (returning) {
    try {
      localStorage.setItem(choiceKey, 'existing');
    } catch {
      /* 旧战役无需引导 */
    }
    return Promise.resolve();
  }
  const dialog = document.createElement('dialog');
  dialog.id = 'first-entry';
  dialog.setAttribute('aria-labelledby', 'first-entry-title');
  const title = document.createElement('h2');
  title.id = 'first-entry-title';
  title.textContent = '首次进入战役';
  const text = document.createElement('p');
  text.textContent = '在独立练习场体验操作、战斗和撤离，或直接进入战役。';
  dialog.append(title, text);
  document.body.append(dialog);
  dialog.addEventListener('cancel', (event) => event.preventDefault());
  return new Promise((resolve) => {
    for (const [value, name] of [
      ['tutorial', '开始新手教程'],
      ['skip', '直接开始'],
    ]) {
      const button = document.createElement('button');
      button.className = value === 'tutorial' ? 'primary-action' : 'secondary-action';
      button.textContent = name;
      button.onclick = () => {
        try {
          localStorage.setItem(choiceKey, value);
        } catch {
          /* 本页可继续 */
        }
        dialog.close();
        dialog.remove();
        if (value === 'tutorial') location.assign(practiceUrl);
        else resolve();
      };
      dialog.append(button);
    }
    dialog.showModal();
  });
}

export function hasEntryChoice() {
  try {
    return Boolean(localStorage.getItem(choiceKey));
  } catch {
    return false;
  }
}
