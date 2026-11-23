import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pack } from '../pack.mjs';

test('独立 HTML 保留传递依赖并排除注释中的导入', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'super-player-pack-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const scene = join(dir, 'scene.mjs');
  const output = join(dir, 'index.html');
  const modules = async source => {
    await writeFile(scene, source);
    await pack(scene, output);
    return [...(await readFile(output, 'utf8')).matchAll(/data-level-module="([^"]+)"/g)].map(m => m[1]);
  };
  const bare = await modules("// import '@level-kit/stage-craft.mjs'\nexport default {};");
  assert.ok(bare.includes('@level-kit/weapon-perks.mjs'));
  assert.ok(!bare.includes('@level-kit/stage-craft.mjs'));
  const used = await modules("export { stageBuilder }\nfrom '@level-kit/stage-craft.mjs';\nexport const lazy = () => import('@level-kit/stage-craft.mjs');");
  assert.equal(used.filter(id => id === '@level-kit/stage-craft.mjs').length, 1);
});
