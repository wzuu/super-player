# 第一人称关卡组件

[地图关卡开发圣经](../LEVEL_BIBLE.md)定义玩法、交付格式和验收目标。每个场景导出一份配置和地图，公共模块提供可玩的运行时。现成的接入示例是 [雨夜废城](../rain-city/scene.mjs) 和 [灰盒模板](starter/scene.mjs)。

各关卡沿用[关卡 UI 布局规范](UI_LAYOUT.md)。[流沙王陵](../buried-tomb/scene.mjs)展示了中央状态位、周期事件、蹲伏和定制光柱的接入。[极夜冰站](../polar-station/scene.mjs)展示了体温量表、冰弹减速和首领变身模型。[沉穹古都](../drowned-city/scene.mjs)展示了动态地形减速和小地图进水标记。

## 新建关卡

1. 把 `starter/scene.mjs` 复制到新关卡目录，修改 `CONFIG`、`MAP_GRID` 和主题文字。将完整主题填写到开发圣经末尾的模板中，作为本关卡开发输入。
2. 在项目根目录运行 `python3 server.py`。访问 `http://127.0.0.1:8000/level-kit/preview.html?scene=../新关卡目录/scene.mjs`。省略查询参数可预览灰盒模板。
3. 在项目根目录运行 `node level-kit/pack.mjs 新关卡目录/scene.mjs`。脚本使用 Node.js 标准库，默认在场景旁生成 `index.html`，也接受第二个参数指定输出路径。关卡 HTML 通过相对路径引用共用的本地 Three.js，保留目录结构即可直接打开，支持离线游玩。
4. 加入战役时，在 `campaign/levels.json` 登记关卡目录、名称和简介，在 `campaign/images/` 提供同名 WebP 预览图。登记后打包，战役入口以本机服务首页为准。
5. 分别验证常规凶兽数量和同屏帧率。压力测试至少覆盖 80 只，若常规或事件目标更高，按更高数量测试。记录机器、浏览器、分辨率和场景。验证通行和掩体、鼠标锁定、射击换弹、核心掉落、E 键引爆、结算及死亡后物资清空。

雨夜废城输出可用 `node level-kit/pack.mjs rain-city/scene.mjs` 重建。以后编辑场景或公共模块，通过预览检查，再重新生成交付 HTML。


## 战役与存档

在项目根目录运行 `python3 server.py`，打开 [超级玩家首页](http://127.0.0.1:8000/)。默认保存到 `.data/super-player.sqlite3`，更改端口或使用测试存档时可传入 `--port`、`--db`。测试也可通过 `--port 0` 让系统分配端口。

首次游玩开放第一关。结算保存成功后，胜利解锁下一关，并将当局带回的宝物登记到图鉴。失败保留对战记录，带回件数和价值计为零。直接打开单关 HTML 可进行离线练习，战役进度需通过本机服务保存。

战役难度由 `src/config.mjs` 根据 `campaign/levels.json` 的关卡顺序统一计算。常规目标为 56 只加上每过一关 2 只，对象池至少多留 32 个位置。场景按原速填写 `speed`、`chargeSpeed` 和 `rageSpeed`。第一关使用原速的 50%，每关增加原速的 2.5 个百分点，最高为原速。地形与血月等事件倍率仍在运行时叠加。警报、沙暴等增援使用 `CONFIG.beasts.population` 加上事件额外数量。这些规则只记录在内部文档。

模块预览读取当前登记顺序，独立 HTML 在打包时写入关卡序号。调整顺序后重新生成受影响的关卡。未登记的灰盒模板和独立场景使用各自的配置。

战役首页的个人收藏可以预览全部武器外观。成功撤离对应关卡后可佩戴，已有通关记录也计入。佩戴项写入同一 SQLite 存档。恢复关卡默认后，战役及直接打开的各关卡使用各自配套外观。

本地依赖入口为 `vendor/three-entry.mjs`，包含关卡运行时使用的 Three.js 与插件。需要重建时，在临时目录安装 `three@0.160.0` 和 `esbuild@0.28.2`，用该目录中的 esbuild 执行下列命令，`NODE_PATH` 指向临时目录的 `node_modules`。第三方许可随包保存在 `vendor/THREE-LICENSE.txt`。

```sh
esbuild level-kit/vendor/three-entry.mjs --bundle --format=iife --minify --legal-comments=eof --outfile=level-kit/vendor/three-r160.js
```

## 场景接口

场景是原生 ES 模块，通过 `export default` 导出关卡定义。可以从 `@level-kit/*.mjs` 和固定版本的 `three`、`three/addons/*` 导入。场景自有逻辑写在该 `.mjs` 文件内，保证打包后可以独立运行。

| 字段 | 用途 |
| --- | --- |
| `grid` | 二维数组或等宽字符串行，可用矩形。第一行在北侧，列沿 x 轴递增，行沿 z 轴递增 |
| `config` | 覆盖公共默认配置。例如 `weapon.fireRate`、`map.cell`。`beasts.types` 按群攻、冲锋、远程、首领顺序填写原始参数。`beasts.population` 适用于未登记的场景 |
| `weaponSkin` | 默认武器外观 ID，对应 `src/rifle-skins.mjs`。战役会优先使用已佩戴的收藏外观 |
| `buildMap(context)` | 创建主题几何和灯光，写入 `level.spawn`、`level.bossAnchor`、`level.bossSpawn`、`level.gate` 的坐标。实体掩体通过 `level.box(x, z, width, depth, bottom, top, climb)` 注册 |
| `loot` 与 `ammo` | 宝物为 `[x, z, 名称, 价值, 可选的 'top']`，弹药为 `[x, z]`。`'top'` 使物品放在可站立的平台上 |
| `terrain`、`inSafeZone`、`chaseWaypoint` | 可选。实现地面与坡道高度、出生安全区或立体地形的 AI 路线 |
| `terrain.moveScale(x, z, y, game)` | 可选。返回当前位置的水平移动倍率，对玩家与凶兽同时生效。水面区域可按脚部高度、区域边缘和水位计算 |
| `terrain.canEnter(body, x, z, y, level)` | 可选。检查角色是否可以进入某处，用于动态地形的实际移动限制。若希望已经在禁区的角色可以撤出，场景应同时检查 `body` 的当前位置 |
| `terrain.routeOpen(x, z, level)` | 可选。在静态寻路数据之上筛除动态禁区。通行状态变化时递增 `level.terrainRevision`，使下轮寻路重建通路 |
| `text`、`area`、`minimap`、`palette` | 可选。替换关卡、首领、道具、传送门和宝物名称，定制区域提示、小地图与特效色 |
| `minimap.overlay({ ctx, px, pz, game })` | 可选。在小地图底图之上、玩家与凶兽点位之下绘制实时区域 |
| `createEnvironment(context)` | 可选。返回有 `update(time, playing, game)` 的环境对象。可读取 `buildMap()` 返回的 `context.mapData` |
| `createEncounter(context)` | 可选。返回有 `update(game, dt)` 和可选 `reset()` 的机制对象。`status` 使用 `{ title, detail, remaining }` 展示倒计时，或使用 `{ title, detail, value, readout }` 展示 0 至 100 的量表。`moveScale` 控制移动倍率。`hearingOnly`、`shotHearing`、`walkHearing`、`runHearing` 和 `memory` 可启用循声搜寻，`population`、`spawnEvery`、`spawnBurst` 可临时调整增援 |
| `createPortal(context)`、`buildBeastModel(type, helpers)` | 可选。替换传送门表现或各类凶兽模型。默认传送门有屏障与引爆效果。模型返回实体和发光部位的两个 BufferGeometry |
| `buildRageModel(helpers)`、`onBossRage(beast, game, helpers)` | 可选。指定狂暴阶段的两个 BufferGeometry，或在首次转阶段时播放视觉和音效 |
| `beastSurface(beast, player, level, floor, dt, game)` | 可选。接管凶兽移动后的体表支撑与高度更新，例如壁面与天花板攀爬。`beast.surfaceRoll` 供实例模型显示姿态 |
| `stageBossSummon(x, y, z, game)` | 可选。返回 `true` 表示已接管一次增援，例如记录一枚卵的孵化位置和时间。返回 `false` 会稍后重试 |
| `onBeastDefeated(beast, game)` | 可选。击杀已计入后调用。返回 `true` 由关卡接管常规爆裂效果，适用于延迟坠毁等演出 |
| `beastDropHeight(beast, level)` | 可选。返回弹药、生命补给与关键物品的掉落高度，飞行敌人可将掉落留在下方地面 |
| `onProjectileHit(game)` | 可选。敌方弹丸实际伤及玩家且玩家存活时调用，可触发视野遮挡等主题效果 |

关卡机制可以从 `context.mapData` 读取 `buildMap()` 返回的场景对象。玩家在传送门交互范围外按 E 时会调用 `encounter.interact(game)`。`encounter.interactionHint(game)` 可在准星下方显示当前机关提示，返回 `null` 时使用共享提示。

默认传送门可以通过 `palette.rift` 调色。使用线性 RGB 数组配置 `sealed` 和 `ready`，用十六进制颜色配置 `rings` 的两种颜色，以及 `particles` 和 `wave`。

远程类型可配置 `slowScale` 和 `slowDuration`，成功命中后施加临时移动倍率。常驻机制倍率和临时减速相乘。

远程类型可通过 `projectileGravity` 定义弹道重力。关卡可通过 `projectileGeometry(THREE)` 提供沿本地正 Z 轴的弹丸模型，渲染时模型沿弹丸速度方向转动。`onProjectileHit(game)` 在弹丸造成伤害且玩家仍存活时调用，可用于施加中毒等关卡状态。

环境事件可调用 `game.beasts.eject(beast, game)` 处理已离开地图的普通凶兽，返回是否成功并只记一次击杀。首领的关键道具走原有击杀流程。

EMP 等机制可设置 `encounter.beastsDisabled` 暂停凶兽行动，设置 `encounter.hudOffline` 中断常规战斗读数和地图。共享状态位保持显示，恢复可通过这两项分别控制。

血月等机制可设置 `encounter.beastSpeedScale` 调整凶兽移动倍率，设置 `encounter.beastDamageScale` 调整近战和弹丸命中伤害。正数 `encounter.bonusAmmo` 使每次击杀强制掉落弹药，并增加对应发数。正数 `encounter.bonusHealth` 使每次击杀额外掉落相应生命值的补给。

`buildMap` 的常用参数为 `THREE`、`scene`、`level`、`CONFIG`、`GRID`、`StaticBatches`、`canvasTexture`。用 `GRID.x(column)` 和 `GRID.z(row)` 获取网格中心坐标，用 `new StaticBatches(材质表)` 建立批次，最后调用 `flush()`。

## 公共代码

| 模块 | 职责 |
| --- | --- |
| `src/runtime.mjs`、`src/config.mjs` | 加载关卡、配置合并、输入、主循环、暂停、胜负与重开 |
| `src/world.mjs` | 地图坐标、空间哈希、AABB、射线和寻路 |
| `src/rendering.mjs` | Three.js 渲染、辉光、程序纹理和静态或动态实例批次 |
| `src/player.mjs`、`src/weapon.mjs` | 玩家移动、体力、恢复、机关枪、换弹与命中 |
| `src/rifle-skins.mjs`、`src/rifle-model.mjs`、`src/rifle-textures.mjs` | 各关外观配置、六组基础几何造型和程序纹理 |
| `src/beasts.mjs` | 四类凶兽的 AI、血条、对象池、实例渲染和远距降频 |
| `src/effects.mjs`、`src/audio.mjs` | 弹丸、可选落地伤害区、传送门、粒子、曳光和合成音效 |
| `src/pickups.mjs`、`src/ui.mjs` | 弹药、生命补给、宝物与核心拾取、HUD、小地图及结算 |

## 武器外观调节

配色、金属度和粗糙度在 `src/rifle-skins.mjs`。按关卡 ID 在 `src/rifle-textures.mjs` 调整纹理，在 `src/rifle-model.mjs` 调整几何、发光和透明材质。展示灯光及环境粒子在 `campaign/weapon-preview.mjs`。改动共享模型或纹理后重新打包十一关。

| 关卡与默认外观 | 调节位置 |
| --- | --- |
| 地下实验室 生化防护型 | `hazard`、`biohazard` 绘制警示条和标志，模型分支控制样本管和红灯闪烁 |
| 上古秘境 青铜雷火型 | `bronzePattern` 控制铜纹，模型分支控制符文呼吸及血月增亮 |
| 雨夜废城 锈蚀街头型 | 对应纹理分支控制锈迹、涂鸦和雨痕，模型分支控制水珠与缠带 |
| 流沙王陵 太阳金沙型 | `royalMark` 绘制荷鲁斯之眼与象形纹，模型分支控制金边和青金石 |
| 极夜冰站 极地科考型 | `rifleFrost` 控制霜层密度，模型分支控制冰凌和保温套 |
| 沉穹古都 深海珍珠型 | `pearl` 材质控制变彩和光泽，模型分支控制青色电弧 |
| 烬火要塞 黑曜熔铸型 | `voronoi` 控制裂纹尺度，模型分支使用潮汐高度调节发光 |
| 失压环站 太空工业型 | 对应纹理分支控制舱号和划痕，模型分支控制观察窗能量条和全息瞄具 |
| 霓雨下城 赛博义体型 | 对应纹理分支控制碳纤维编织，模型分支控制光带流动和 EMP 恢复闪烁 |
| 雨蚀天阶 玛雅玉石型 | `jadePattern` 控制羽蛇和阶梯纹，模型分支控制玉石透射、藤蔓和羽饰 |
| 血月古堡 哥特猩红型 | `gothicMark` 控制蔷薇窗与尖拱纹，模型分支控制血露瓶及银色浮雕 |
