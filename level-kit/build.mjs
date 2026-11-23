import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHome } from './standalone.mjs';
import { pack } from './pack.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const levels = JSON.parse(await readFile(join(root, 'campaign/levels.json'), 'utf8'));
await buildHome(levels);
await pack(join(root, 'level-kit/starter/scene.mjs'), join(root, 'practice/index.html'));
for (const { id } of levels) {
  await pack(join(root, id, 'scene.mjs'));
}

if (process.argv[2]) {
  const site = resolve(process.argv[2]);
  // 发布目录由公开资源清单生成，数据库、开发笔记与测试文件均留在源码目录。
  await mkdir(site);
  const files = ['index.html', 'practice/index.html', 'campaign/onboarding.mjs', 'LICENSE', 'level-kit/vendor/three-r160.js', 'level-kit/vendor/THREE-LICENSE.txt',
    'campaign/levels.json', 'campaign/home.css', 'campaign/home.mjs', 'campaign/save.mjs',
    'campaign/profiles.mjs', 'campaign/store.mjs', 'campaign/browser-store.mjs', 'campaign/weapon-preview.mjs', 'campaign/reports.mjs',
    'campaign/weapon-build.mjs',
    'level-kit/src/field-sites.mjs',
    ...['gear','preferences', 'rifle-skins', 'rifle-model', 'rifle-textures','shotgun-model','weapon-perks'].map(name => 'level-kit/src/' + name + '.mjs')];
  for (const { id } of levels) files.push(id + '/index.html', 'campaign/images/' + id + '.webp');
  for (const file of files) {
    await mkdir(dirname(join(site, file)), { recursive: true });
    await copyFile(join(root, file), join(site, file));
  }
}
