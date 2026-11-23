import { readFile, writeFile, rename, mkdir, rm } from 'node:fs/promises';
import { dirname, join, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { init, parse as parseImports } from 'es-module-lexer';
import { randomUUID } from 'node:crypto';

const kit = dirname(fileURLToPath(import.meta.url));
const root = dirname(kit);

export async function pack(sceneArgument, outputArgument) {
  if (!sceneArgument || parse(sceneArgument).ext !== '.mjs') {
    throw new Error('用法 node level-kit/pack.mjs <场景.mjs> [输出.html]');
  }
  const sceneFile = resolve(sceneArgument);
  const output = resolve(outputArgument ?? join(dirname(sceneFile), 'index.html'));
  if (parse(output).ext !== '.html') throw new Error('输出文件必须以 .html 结尾');
  if ([join(kit, 'preview.html'), join(root, 'index.html')].includes(output)) {
    throw new Error('输出路径与预览模板或游戏首页冲突');
  }

  const [shell, definition, campaign] = await Promise.all([
    readFile(join(kit, 'preview.html'), 'utf8'),
    readFile(sceneFile, 'utf8'),
    readFile(join(root, 'campaign/levels.json'), 'utf8'),
  ]);
  await init;
  const moduleEntries = new Map();
  async function visit(name, source) {
    if (moduleEntries.has(name)) return;
    moduleEntries.set(name, source);
    for (const specifier of parseImports(source)[0]) {
      if (specifier.type === 'import-meta') continue; // import.meta
      const id = specifier.specifier;
      if (!id) throw new Error(name + ' 需要使用字符串字面量导入模块');
      if (!id.startsWith('@level-kit/')) {
        if (id === 'three' || id.startsWith('three/')) continue;
        throw new Error(name + ' 引用了离线入口无法解析的模块 ' + id);
      }
      if (!/^@level-kit\/[\w-]+\.mjs$/.test(id)) throw new Error('无效的公共模块 ' + id);
      if (!moduleEntries.has(id)) await visit(id, await readFile(join(kit, 'src', id.slice('@level-kit/'.length)), 'utf8'));
    }
  }
  await visit('@level-kit/runtime.mjs', await readFile(join(kit, 'src/runtime.mjs'), 'utf8'));
  await visit('@level/scene.mjs', definition);

  // 内嵌源码正文保持可读。浏览器为各模块创建本页 URL，再一次性注册 importmap。
  const embedded = [...moduleEntries].map(([name, content]) => {
    if (/<\/script\b/i.test(content)) {
      throw new Error(name + ' 含 HTML 脚本结束标记，请在源字符串中转义斜杠');
    }
    return `<script type="text/plain" data-level-module="${name}">\n${content}</script>`;
  }).join('\n');
  const vendor = relative(dirname(output), join(kit, 'vendor', 'three-r160.js')).split(sep).map(encodeURIComponent).join('/');
  const levels = JSON.parse(campaign);
  const campaignStage = levels.findIndex(({ id }) => sceneFile === join(root, id, 'scene.mjs')) + 1;
  const campaignId = levels[campaignStage - 1]?.id;
  const registered = campaignId && output === join(root, campaignId, 'index.html');

  const html = shell
    .replace('<!doctype html>', '<!doctype html>\n<!-- 由 level-kit/pack.mjs 从场景和公共模块生成 -->')
    .replace('src="./vendor/three-r160.js"', `src="${vendor}"`)
    .replace(", '@level-kit/': './src/'", '')
    .replace('<body>', registered ? `<body data-campaign-level="${campaignId}">` : '<body>')
    .replace('<!-- LEVEL_SOURCES -->', () => embedded)
    .replace(/    \/\/ LEVEL_SCENE_START[\s\S]*?    \/\/ LEVEL_SCENE_END/,
      `    const sceneModule = '@level/scene.mjs';\n    const campaignStage = ${campaignStage};`);
  if (/LEVEL_SOURCES|LEVEL_SCENE_/.test(html)) throw new Error('预览模板的打包标记不完整');

  await mkdir(dirname(output), { recursive: true });
  const pending = output + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(pending, html, { flag: 'wx' });
    await rename(pending, output);
  } finally {
    await rm(pending, { force: true });
  }
  console.log(output + '  ' + Buffer.byteLength(html) + ' 字节');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  pack(process.argv[2], process.argv[3]).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
