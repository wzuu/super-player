# 超级玩家

用桌面浏览器打开[在线试玩](https://wzuu.github.io/super-player/)。首次进入可以选择新手教程，练习转向、移动和射击。游玩时点击游戏画面锁定鼠标，按 Esc 暂停并释放鼠标。

![雨夜废城实机战斗](campaign/images/gameplay.gif)

沿地面箭头进入战区。小房间的守卫清空后，可以按交互键领取战利品，也可以继续赶路。遇到首领时，跳过蓝色砸地波，看到橙色扇区就往边界外移动。招式结束、核心亮起时可以反击。

桌面浏览器上的第一人称走位射击单机战役，收录了多个主题关卡，数量还在持续增加。全部场景由基础几何体搭建、纹理程序化生成，不依赖任何外部模型和贴图，下载源码并生成关卡后即可离线游玩。

## 快速开始

本地开发使用 Node.js 24 和 Python 3。首次克隆后，在项目根目录安装构建依赖、生成关卡，再启动服务。

```sh
npm ci
npm run build
python3 server.py
```

用桌面浏览器打开 <http://127.0.0.1:8000/> 进入战役首页。服务只监听本机，默认存档写入 `.data/super-player.sqlite3`。

- 换端口：`python3 server.py --port 8080`
- 用其他存档文件（便于测试）：`python3 server.py --db /tmp/test.sqlite3`

## 玩法与存档

- **在线战役**使用当前浏览器的 IndexedDB 保存通关、战利品、对战记录和佩戴选择。下次用同一浏览器和用户配置打开试玩地址即可继续。清除该站点数据会清除在线进度。

- **本机 SQLite 战役**：通过上面的本机服务进入首页，已发布的关卡按顺序解锁。成功撤离才会带回本局战利品并计入图鉴，失败保留对战记录但带回计为零。武器外观的佩戴也保存在同一份 SQLite 存档里。
- **单关离线**：直接双击任意关卡目录下的 `index.html`（例如 `rain-city/index.html`）即可开玩，适合练习。这种方式不写战役存档。各关卡通过相对路径引用 `level-kit/vendor/three-r160.js`，所以请保留仓库的目录结构。

## 操作

| 按键 | 动作 |
| --- | --- |
| 鼠标左键 | 朝准星方向射击 |
| `V` / `I` / `M` | 切换第一人称与肩后视角 / 检视武器计数器 / 切换音效 |
| `W` `A` `S` `D` | 移动 |
| `Shift` | 冲刺，消耗体力 |
| 空格 | 跳跃 |
| `R` | 提前换弹。打空弹匣且仍有备弹时会自动换弹 |
| `F` | 交互、开启机关、拾取关键物或引爆撤离 |
| `G` | 在提供深入路线的撤离点二次确认冒险深入 |
| `Q` / `E` | 使用两个主动技能槽 |
| `1` / `2` | 使用两个消耗道具槽 |
| `C` | 蹲伏（部分关卡用于压低声响） |
| `Esc` | 暂停并释放鼠标。角色被地形困住时，可选「卡住脱离」，再点「继续游戏」 |

进入游戏后可展开「装备选择与补给站」。撤离带出的宝物按价值计入军需点，可以兑换道具或永久枪械改装。出发时从库存领取已选道具，急救包和手雷各有一份免费配给。未用道具在撤离时入库，失败时丢失。

手雷默认装在道具二，按 `2` 朝准星方向投出。稍微抬高准星可以投得更远，低头可以投在脚边。手雷碰到墙体或掩体会落下，随后在所在位置爆炸。实体墙能挡住爆炸伤害。

首页「设置」可调整键位、灵敏度、视野、音量、难度、震动和画质。标准布局手柄使用双摇杆移动、瞄准，右扳机开火，肩键释放技能，方向键上下使用道具，Y 交互。首页「新的战役」创建独立存档，可在「存档」中切回。生成关卡后也可双击根目录的 `index.html` 游玩浏览器存档战役。

屏幕边缘的黄红三角提示附近凶兽，红弧指向刚刚打中你的方向。看到地面出现冲锋线时，可向侧面闪避。低血量时会听到心跳，画面边缘随之脉动。在设置中可以单独调低受击震动或关闭受击红弧。

## 关卡一览

| 序号 | 关卡 | 主题机制 |
| --- | --- | --- |
| 1 | 地下实验室 | 在西侧安保室取卡、东侧配电房送电，沿折返梯进入下层反应堆，歼灭零号实验体 |
| 2 | 上古秘境 | 周期血月加成、岩浆灼伤、三座双向石桥 |
| 3 | 雨夜废城 | 钟楼坚守、布置炸药与限时起爆、突破封锁线 |
| 4 | 流沙王陵 | 沙暴封闭视野、循声追击、蹲伏压低声响 |
| 5 | 极夜冰站 | 体温量表、室外失温减速、室内与篝火回温 |
| 6 | 沉穹古都 | 在穹顶进水期间保护无人机，护送它抵达撤离区 |
| 7 | 烬火要塞 | 岩浆潮汐改变通路、燃烧地带、高桥环路 |
| 8 | 失压环站 | 舱段随机失压吸拽、天花板攀爬虫群、母体孵化 |
| 9 | 霓雨下城 | EMP 中断照明与 HUD、瘫痪机械敌人、无人机坠落爆炸 |
| 10 | 雨蚀天阶 | 雷雨涨水与伏击、毒镖中毒、解毒草定时重生 |
| 11 | 血月古堡 | 血月提升凶兽移速与伤害、圣露掉落、伯爵化蝠 |
| 12 | 樱落夜町 | 灯笼长街的百鬼队列、灯笼妖来袭与补给 |
| 13 | 黄铜机坊 | 管道爆裂蒸汽、传送带、锅炉车间诱敌 |
| 14 | 永夜游园 | 失控旋转木马和过山车、气球爆炸、镜屋窄道 |
| 15 | 巴黎铁塔：高塔救援 | 登上观景台，启动救援信标，坚守 90 秒后登机 |
| 16 | 环轨母巢 | 从停靠舱绕过失压外环，在维修舱恢复联锁，深入反应堆歼灭母体 |
| 17 | 月下彩窗堡 | 下墓穴取钥匙，在钟楼升起栅门，穿过教堂迎战伯爵 |
| 18 | 雨城高架接应 | 沿积水街或穿过连排商铺，绕过钟楼到桥下与救援车会合 |
| 19 | 灯巷神社撤离 | 穿过百鬼巡游的灯街，过石桥，沿山腰参道抵达神社避难门 |
| 20 | 霓城北线撤离 | 选诊所或夜市路线，借 EMP 停机窗口沿应急灯登上北线高架 |
| 21 | 沉城屋顶回收 | 陪同无人机穿过珊瑚拱廊，沿干燥盘坡抵达屋顶吊架 |
| 22 | 冰原样本撤运 | 护送技术员经过回温站与冰湖栈道，将样本送到救援舱 |
| 23 | 蒸汽检修线 | 在机器棚与压力阀房放行检修车，穿过排汽轨道送达升降机 |
| 24 | 沙海信号台 | 点亮陵台信标，在沙暴和柱廊之间守住两侧进路 |
| 25 | 瀑顶神庙防线 | 沿河滩石梯登台，留意涨水时改走木板路的守卫 |
| 26 | 铁塔观景台防线 | 攀上折返梯，在四面护栏之间换防，等直升机到达后登机 |
| 27 | 裂隙三殿 | 穿过竹林、断桥和石窟，自选顺序封闭血月下的三座门 |
| 28 | 火口三门 | 沿低沟或高桥搜集任务弹，切断火口三座设施的增援 |
| 29 | 午夜三幕后台 | 穿过木马、镜屋和维修站，避开过车轨道，引爆三处机房 |

成功撤离后，可以在武器库中旋转查看并佩戴该关的步枪。外观与战斗特性一同装备，可带去其他关卡。与血月、蒸汽等场景事件联动的能力在对应环境中触发。

第一次进入可选择独立新手教程，也可以直接开始战役。首页可随时进入教程或无限备弹的火力试验场。战前面板说明所选行动的胜利条件，列出本局变奏、装备和补给。

按局内任务卡推进。实验室击败最终首领时结算已拾取的战利品，冷藏档案室可以跳过，钟楼坚守后要爆破突围，沉穹古都需要保护勘探无人机。上古秘境和樱落夜町还可选择追踪猎物。探索时可以挑战宝库、寻找秘闻，或利用场景机关牵制守卫。

「对战记录」能查看每局的战利品、武器表现、最高连杀和评级。在设置中开启「录制战术回放」，下一局的战报还可以回看路线、血量和关键事件。

## 关卡截图

下列画面均由关卡内程序生成，按战役解锁顺序排列（点击可查看大图）：

<table>
  <tr>
    <td align="center"><a href="campaign/images/underground-lab.webp"><img src="campaign/images/underground-lab.webp" width="280" alt="地下实验室"></a><br>地下实验室</td>
    <td align="center"><a href="campaign/images/shanhai-secret-realm.webp"><img src="campaign/images/shanhai-secret-realm.webp" width="280" alt="上古秘境"></a><br>上古秘境</td>
    <td align="center"><a href="campaign/images/rain-city.webp"><img src="campaign/images/rain-city.webp" width="280" alt="雨夜废城"></a><br>雨夜废城</td>
  </tr>
  <tr>
    <td align="center"><a href="campaign/images/buried-tomb.webp"><img src="campaign/images/buried-tomb.webp" width="280" alt="流沙王陵"></a><br>流沙王陵</td>
    <td align="center"><a href="campaign/images/polar-station.webp"><img src="campaign/images/polar-station.webp" width="280" alt="极夜冰站"></a><br>极夜冰站</td>
    <td align="center"><a href="campaign/images/drowned-city.webp"><img src="campaign/images/drowned-city.webp" width="280" alt="沉穹古都"></a><br>沉穹古都</td>
  </tr>
  <tr>
    <td align="center"><a href="campaign/images/ember-fortress.webp"><img src="campaign/images/ember-fortress.webp" width="280" alt="烬火要塞"></a><br>烬火要塞</td>
    <td align="center"><a href="campaign/images/derelict-station.webp"><img src="campaign/images/derelict-station.webp" width="280" alt="失压环站"></a><br>失压环站</td>
    <td align="center"><a href="campaign/images/neon-undercity.webp"><img src="campaign/images/neon-undercity.webp" width="280" alt="霓雨下城"></a><br>霓雨下城</td>
  </tr>
  <tr>
    <td align="center"><a href="campaign/images/jungle-temple.webp"><img src="campaign/images/jungle-temple.webp" width="280" alt="雨蚀天阶"></a><br>雨蚀天阶</td>
    <td align="center"><a href="campaign/images/bloodmoon-castle.webp"><img src="campaign/images/bloodmoon-castle.webp" width="280" alt="血月古堡"></a><br>血月古堡</td>
    <td align="center"><a href="campaign/images/sakura-night-town.webp"><img src="campaign/images/sakura-night-town.webp" width="280" alt="樱落夜町"></a><br>樱落夜町</td>
  </tr>
  <tr>
    <td align="center"><a href="campaign/images/brass-factory.webp"><img src="campaign/images/brass-factory.webp" width="280" alt="黄铜机坊"></a><br>黄铜机坊</td>
    <td align="center"><a href="campaign/images/haunted-midway.webp"><img src="campaign/images/haunted-midway.webp" width="280" alt="永夜游园"></a><br>永夜游园</td>
    <td align="center"><a href="campaign/images/paris-tower.webp"><img src="campaign/images/paris-tower.webp" width="280" alt="巴黎铁塔的观景台和登塔阶梯"></a><br>巴黎铁塔：高塔救援</td>
  </tr>
  <tr>
    <td align="center"><a href="campaign/images/orbital-brood-ring.webp"><img src="campaign/images/orbital-brood-ring.webp" width="280" alt="停靠舱里的货臂和转运门"></a><br>环轨母巢</td>
    <td align="center"><a href="campaign/images/moonlit-stained-glass-keep.webp"><img src="campaign/images/moonlit-stained-glass-keep.webp" width="280" alt="月下吊桥通往马厩桥门"></a><br>月下彩窗堡</td>
  </tr>
</table>

## 目录结构

```
index.html              战役首页
server.py               本机服务与 SQLite 存档
campaign/               首页资源、关卡登记表 levels.json、存档读写模块
level-kit/              共享关卡运行时、打包脚本、Three.js 本地依赖
level-kit/src/          输入、武器、碰撞寻路、凶兽、拾取、HUD、结算等公共模块
level-kit/starter/      新建关卡的灰盒模板
<关卡目录>/scene.mjs    该关的主题、地图数据与专属机制（源文件）
<关卡目录>/index.html   打包生成的可直接游玩入口
```

## 自己改关卡或加新关

需要 Node.js 18 或更高版本。

```sh
# 1. 复制灰盒模板，改 CONFIG、MAP_GRID 和主题文案
mkdir -p my-level && cp level-kit/starter/scene.mjs my-level/scene.mjs

# 2. 根目录起服务后预览
python3 server.py
# 浏览器访问 http://127.0.0.1:8000/level-kit/preview.html?scene=../my-level/scene.mjs

# 3. 生成独立可玩 HTML
node level-kit/pack.mjs my-level/scene.mjs
```

接入战役时在 `campaign/levels.json` 追加一条登记，并在 `campaign/images/` 放同名 WebP 预览图，然后重新打包受影响的关卡。完整的玩法约定、场景接口字段和验收清单见：

- [地图关卡开发圣经](LEVEL_BIBLE.md)：玩法规格、交付格式、难度曲线
- [关卡组件说明](level-kit/README.md)：新建关卡流程与 `scene.mjs` 的全部接口
- [关卡 UI 布局规范](level-kit/UI_LAYOUT.md)：共享 HUD 与状态位约定

## 许可证

项目采用 [MIT 许可证](LICENSE)。

## 构建与发布

`npm test` 运行核心模块测试。`npm run build` 重新生成所有关卡。使用 `npm run build -- dist` 可将纯静态站点写入新建的发布目录（命令会创建该目录），支持部署在仓库名子路径下。

GitHub Actions 的 `Campaign` 工作流在 PR 中验证本机 SQLite 和浏览器静态战役。`main` 通过同一套测试后才发布。开放试玩时，发布后还会从公网核对首页与第一关文件，实际进入教程、射击并验证战役存档。

- **开放或恢复试玩**时，将仓库的 Actions 变量 `PAGES_DEMO_ENABLED` 设为 `true`，从 Actions → Campaign → Run workflow 选择 `main` 运行，也可由该分支的下一次推送触发。检查 `deploy` 与 `verify-public-game` 均通过。
- **关闭试玩**时，将同一变量设为 `false` 或删除它，再从 `main` 运行 `Campaign`。等 `deploy` 成功后，打开试玩地址确认显示「在线试玩已关闭」。这个切换只更换公开站点内容，玩家下次开放时可继续使用同一浏览器里的存档。

## 第三方声明

`level-kit/vendor/three-r160.js` 是本地打包的 [Three.js](https://threejs.org/) r160（MIT 许可），许可原文见 [level-kit/vendor/THREE-LICENSE.txt](level-kit/vendor/THREE-LICENSE.txt)。音效由 Web Audio 实时合成，无外部音频素材。

## 已知限制

- 面向桌面浏览器与鼠标键盘，未适配移动端和触屏。
- 浏览器战役和本机 SQLite 战役各自保存进度。
- 同屏超过 80 只凶兽时以 60 fps 为验收目标，实际帧率取决于设备。
