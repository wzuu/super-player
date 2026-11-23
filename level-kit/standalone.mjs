import { readFile, writeFile } from 'node:fs/promises';
import { posix } from 'node:path';
import { init, parse } from 'es-module-lexer';
const root = new URL('../', import.meta.url);
const storeFiles = [
  'campaign/profiles.mjs',
  'campaign/store.mjs',
  'campaign/browser-store.mjs',
  'campaign/save.mjs',
  'campaign/onboarding.mjs',
  'level-kit/src/gear.mjs',
];
const homeFiles = [
  ...storeFiles,
  'campaign/home.mjs',
  'campaign/reports.mjs',
  'campaign/weapon-preview.mjs',
  'campaign/weapon-build.mjs',
  'level-kit/src/field-sites.mjs',
  ...['preferences', 'rifle-skins', 'rifle-model', 'rifle-textures','shotgun-model','weapon-perks'].map(
    (n) => 'level-kit/src/' + n + '.mjs',
  ),
];

// file: 页面不能通过 fetch 加载相邻模块。将离线依赖注册到 import map，HTTP 仍使用常规模块。
export async function offlineScripts(forHome, levels) {
  await init;
  const files = forHome ? homeFiles : storeFiles;
  const entries = await Promise.all(
    files.map(async (file) => {
      let source = (await readFile(new URL(file, root), 'utf8')).replaceAll('\r\n', '\n');
      for (const ref of parse(source)[0].reverse()) {
        let replacement;
        if (ref.type === 'import-meta') {
          const path = JSON.stringify((forHome ? './' : '../') + file);
          replacement = '({url:new URL(' + path + ',location.href).href})';
        } else {
          const id = ref.specifier;
          if (id?.startsWith('.')) replacement = 'offline/' + posix.join(posix.dirname(file), id);
          else if (id?.startsWith('@level-kit/'))
            replacement = 'offline/level-kit/src/' + id.slice('@level-kit/'.length);
          else continue;
          if (ref.type === 'dynamic') replacement = JSON.stringify(replacement);
        }
        source = source.slice(0, ref.start) + replacement + source.slice(ref.end);
      }
      return ['offline/' + file, source];
    }),
  );
  const json = JSON.stringify({ levels, entries }).replaceAll('<', '\\u003c');
  return `<script>
    function registerOfflineCampaign() {
      const {levels,entries}=${json};
      globalThis.offlineCampaignLevels=levels;
      const map=document.createElement('script');
      map.type='importmap';
      map.textContent=JSON.stringify({imports:Object.fromEntries(entries.map(([id,source])=>[id,URL.createObjectURL(new Blob([source],{type:'text/javascript'}))]))});
      document.head.append(map);
    }
    if(location.protocol==='file:') registerOfflineCampaign();
  </script>`;
}
export async function buildHome(levels) {
  const shell = await readFile(new URL('campaign/home-shell.html', root), 'utf8');
  const css = await readFile(new URL('campaign/home.css', root), 'utf8');
  const scripts = await offlineScripts(true, levels);
  const html = shell
    .replace('<link rel="stylesheet" href="./campaign/home.css">', () => '<style>\n' + css + '\n</style>')
    .replace('<!-- OFFLINE_HOME -->', () => scripts);
  await writeFile(new URL('index.html', root), html);
}
