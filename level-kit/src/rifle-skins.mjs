// 外观以关卡 ID 为稳定键，用于默认装备、收藏和存档。
export const rifleSkins = {
  'orbital-brood-ring': {
    name:'轨道值勤型',detail:'蓝灰隔热机匣，配有停靠舱的琥珀色防撞饰条与青绿状态灯。',
    base:'#637986',trim:'#ce965e',dark:'#354453',light:'#82e0d6',
    backdrop:'#213345',key:'#f2cdac',fill:'#abd8e5',metalness:.61,roughness:.45,
  },
  'shotgun-pump': {
    name:'雨巷破阵',category:'霰弹枪',unlock:'rain-city',detail:'泵动霰弹枪。宽扇面弹丸适合近距离群敌，远处快速衰减。逐发装填，有弹即可打断装填射击。',
    base:'#5f7279',trim:'#b0c7c6',dark:'#684b38',light:'#82dfcf',
    backdrop:'#203338',key:'#cae3dc',fill:'#86aab8',metalness:.55,roughness:.45,
  },
  'shotgun-forge': {
    name:'铜炉雷鸣',category:'霰弹枪',unlock:'brass-factory',detail:'锻铜泵动霰弹枪。击杀后 3 秒内每发装填提速 32%，适合在贴近的兽群间接战。',
    base:'#75482e',trim:'#dba966',dark:'#393a40',light:'#ffbc61',
    backdrop:'#322a23',key:'#ffd49b',fill:'#ad8574',metalness:.73,roughness:.38,
  },
  'paris-tower': {
    name:'塔灯救援型',detail:'铁灰机匣、铜色桁架纹和救援信标的蓝绿灯带。',
    base:'#80674d',trim:'#d2a65b',dark:'#41454e',light:'#66e6d9',
    backdrop:'#283345',key:'#ffce99',fill:'#a4cdef',metalness:.58,roughness:.44,
  },
  'underground-lab': {
    name: '生化防护型', detail: '白灰防护漆、黄黑警示纹和荧光绿样本管。腐蚀弹逐层削弱护甲，击杀时偶尔蓄存样本能量，强化下一弹匣。红色警报期间射速提升。',
    base: '#c9cac1', trim: '#f7bc38', dark: '#343d3a', light: '#a7ff44',
    backdrop: '#1b2825', key: '#f3fff4', fill: '#7bad92', metalness: .22, roughness: .6,
  },
  'shanhai-secret-realm': {
    name: '青铜雷火型', detail: '斑驳青铜饕餮纹、云雷纹和血月增亮的雷火符文。三层雷印引发范围雷击。对凶兽伤害提高，血月期间符文增亮，叠印加快。',
    base: '#8d7045', trim: '#c4a46b', dark: '#463025', light: '#ff641e',
    backdrop: '#2d2118', key: '#ffe1b8', fill: '#659e83', metalness: .7, roughness: .55,
  },
  'rain-city': {
    name: '锈蚀街头型', detail: '锈钢、脱漆涂鸦、缠带和雨水留下的湿痕。命中使目标潮湿，更易受到电伤。重击可击退敌人，幸运射击造成双倍伤害。',
    base: '#6c777b', trim: '#de9056', dark: '#313c41', light: '#8ad7ed',
    backdrop: '#162534', key: '#b3dcff', fill: '#628ebc', metalness: .55, roughness: .79,
  },
  'buried-tomb': {
    name: '太阳金沙型', detail: '象形石刻、荷鲁斯之眼、金箔和青金石镶嵌。流沙使敌人减速，连续命中可定身。爆头有机会造成双倍伤害并标记，蹲伏射击时枪声传播较近。',
    base: '#ccab74', trim: '#ffd364', dark: '#67533c', light: '#83d8ff',
    backdrop: '#38281c', key: '#ffbf74', fill: '#e5c69e', metalness: .12, roughness: .82,
  },
  'polar-station': {
    name: '极地科考型', detail: '橙色科考编号、结霜的保温套和冰蓝弹匣。寒霜逐层减速，第五层冻结普通敌人。冰封期间爆头伤害更高，在冰站击杀还能回温。',
    base: '#85a5b6', trim: '#ff8544', dark: '#3a4a5b', light: '#91e4ff',
    backdrop: '#1a2c3a', key: '#e3f7ff', fill: '#80b8ee', metalness: .24, roughness: .62,
  },
  'drowned-city': {
    name: '深海珍珠型', detail: '珊瑚白与海蓝渐变、变彩珍珠护木和青色电弧。电弧可连锁附近两名敌人并造成麻痹。命中有机会击退，在进水区域也能保持移动速度。',
    base: '#aed6d6', trim: '#83b4d9', dark: '#16455a', light: '#60ffeb',
    backdrop: '#122b35', key: '#b6fff5', fill: '#4689c4', metalness: .33, roughness: .36,
  },
  'ember-fortress': {
    name: '黑曜熔铸型', detail: '黑曜石熔纹、铆接铸铁和随潮汐明暗变化的熔浆。子弹使目标持续灼烧，再次命中有机会石化并提高所受伤害。岩浆潮汐期间灼烧加倍。',
    base: '#303039', trim: '#987866', dark: '#311f1c', light: '#ff5321',
    backdrop: '#291c1b', key: '#ffbb91', fill: '#b54b35', metalness: .4, roughness: .2,
  },
  'derelict-station': {
    name: '太空工业型', detail: '舱段编号、微陨石划痕和随时可见的能量观察窗。反重力弹可将目标击退并悬浮。进入失压舱段时伤害提高，命中壁上的异形可将其击落。',
    base: '#cad3db', trim: '#749bae', dark: '#354a5a', light: '#51bbff',
    backdrop: '#151e32', key: '#ecf7ff', fill: '#658fc0', metalness: .35, roughness: .52,
  },
  'neon-undercity': {
    name: '赛博义体型', detail: '碳纤维编织、青紫光带和随 EMP 熄灭再启动的霓虹。命中标记目标，使其受到更多伤害，机械敌人还会短暂停机。触发过载后下一发可以穿透。',
    base: '#292a36', trim: '#af527e', dark: '#222335', light: '#28fde9',
    backdrop: '#241732', key: '#c5b8ff', fill: '#d43a91', metalness: .42, roughness: .38,
  },
  'jungle-temple': {
    name: '玛雅玉石型', detail: '翡翠羽蛇刻纹、热带木、藤编羽饰和金色太阳图腾。毒素可叠三层。累计命中十二次后下一发可石化目标，击杀给予短时移速加成。',
    base: '#378966', trim: '#ebc258', dark: '#463b28', light: '#acff9c',
    backdrop: '#1a2e26', key: '#ecffd0', fill: '#5da786', metalness: .14, roughness: .34,
  },
  'bloodmoon-castle': {
    name: '哥特猩红型', detail: '银色尖拱和蔷薇窗、暗红绒面与微光圣露瓶。按实际伤害吸血，血月期间回复翻倍。对古堡亡灵有加成，献祭射击会造成双倍伤害。',
    base: '#34323c', trim: '#d7c7cb', dark: '#5b1528', light: '#ff3653',
    backdrop: '#321922', key: '#ff8d9b', fill: '#ac688c', metalness: .79, roughness: .28,
  },
  'sakura-night-town': {
    name: '朱漆百鬼型', detail: '朱漆描金、白色注连绳与青铜铃。连续命中会用符咒封印目标。',
    base: '#a63227', trim: '#f1bb60', dark: '#371f27', light: '#ffbb44',
    backdrop: '#111d38', key: '#ffc474', fill: '#bd9ec8', metalness: .2, roughness: .3,
  },
  'brass-factory': {
    name: '蒸汽齿轮型', detail: '铆接铜管、裸露齿轮与压力表。连续命中积攒蒸汽，满压后下一发释放冲击。',
    base: '#a77c45', trim: '#d9b66c', dark: '#3c3530', light: '#ffc679',
    backdrop: '#272019', key: '#ffbf71', fill: '#85acae', metalness: .9, roughness: .4,
  },
  'haunted-midway': {
    name: '马戏狂欢型', detail: '褪色门票、八音盒与浮空气球。持续命中同一目标会收紧彩带。',
    base: '#a24c52', trim: '#f6d8af', dark: '#45333a', light: '#ff72a2',
    backdrop: '#22152f', key: '#ffc2ab', fill: '#6bd8de', metalness: .18, roughness: .74,
  },
};

export const defaultRifleSkin = 'underground-lab';

export function resolveRifleSkin(id, fallback = defaultRifleSkin) {
  return Object.hasOwn(rifleSkins, id) ? id : fallback;
}
