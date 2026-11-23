// 外观以关卡 ID 为稳定键，用于默认装备、收藏和存档。
export const rifleSkins = {
  'underground-lab': {
    name: '生化防护型', detail: '白灰防护漆、黄黑警示纹和荧光绿样本管。',
    base: '#c9cac1', trim: '#f7bc38', dark: '#343d3a', light: '#a7ff44',
    backdrop: '#1b2825', key: '#f3fff4', fill: '#7bad92', metalness: .22, roughness: .6,
  },
  'shanhai-secret-realm': {
    name: '青铜雷火型', detail: '斑驳青铜饕餮纹、云雷纹和血月增亮的雷火符文。',
    base: '#8d7045', trim: '#c4a46b', dark: '#463025', light: '#ff641e',
    backdrop: '#2d2118', key: '#ffe1b8', fill: '#659e83', metalness: .7, roughness: .55,
  },
  'rain-city': {
    name: '锈蚀街头型', detail: '锈钢、脱漆涂鸦、缠带和雨水留下的湿痕。',
    base: '#6c777b', trim: '#de9056', dark: '#313c41', light: '#8ad7ed',
    backdrop: '#162534', key: '#b3dcff', fill: '#628ebc', metalness: .55, roughness: .79,
  },
  'buried-tomb': {
    name: '太阳金沙型', detail: '象形石刻、荷鲁斯之眼、金箔和青金石镶嵌。',
    base: '#ccab74', trim: '#ffd364', dark: '#67533c', light: '#83d8ff',
    backdrop: '#38281c', key: '#ffbf74', fill: '#e5c69e', metalness: .12, roughness: .82,
  },
  'polar-station': {
    name: '极地科考型', detail: '橙色科考编号、结霜的保温套和冰蓝弹匣。',
    base: '#85a5b6', trim: '#ff8544', dark: '#3a4a5b', light: '#91e4ff',
    backdrop: '#1a2c3a', key: '#e3f7ff', fill: '#80b8ee', metalness: .24, roughness: .62,
  },
  'drowned-city': {
    name: '深海珍珠型', detail: '珊瑚白与海蓝渐变、变彩珍珠护木和青色电弧。',
    base: '#aed6d6', trim: '#83b4d9', dark: '#16455a', light: '#60ffeb',
    backdrop: '#122b35', key: '#b6fff5', fill: '#4689c4', metalness: .33, roughness: .36,
  },
  'ember-fortress': {
    name: '黑曜熔铸型', detail: '黑曜石熔纹、铆接铸铁和随潮汐明暗变化的熔浆。',
    base: '#303039', trim: '#987866', dark: '#311f1c', light: '#ff5321',
    backdrop: '#291c1b', key: '#ffbb91', fill: '#b54b35', metalness: .4, roughness: .2,
  },
  'derelict-station': {
    name: '太空工业型', detail: '舱段编号、微陨石划痕、能量观察窗和全息瞄具。',
    base: '#cad3db', trim: '#749bae', dark: '#354a5a', light: '#51bbff',
    backdrop: '#151e32', key: '#ecf7ff', fill: '#658fc0', metalness: .35, roughness: .52,
  },
  'neon-undercity': {
    name: '赛博义体型', detail: '碳纤维编织、青紫光带和随 EMP 熄灭再启动的霓虹。',
    base: '#292a36', trim: '#af527e', dark: '#222335', light: '#28fde9',
    backdrop: '#241732', key: '#c5b8ff', fill: '#d43a91', metalness: .42, roughness: .38,
  },
  'jungle-temple': {
    name: '玛雅玉石型', detail: '翡翠羽蛇刻纹、热带木、藤编羽饰和金色太阳图腾。',
    base: '#378966', trim: '#ebc258', dark: '#463b28', light: '#acff9c',
    backdrop: '#1a2e26', key: '#ecffd0', fill: '#5da786', metalness: .14, roughness: .34,
  },
  'bloodmoon-castle': {
    name: '哥特猩红型', detail: '银色尖拱和蔷薇窗、暗红绒面与微光圣露瓶。',
    base: '#34323c', trim: '#d7c7cb', dark: '#5b1528', light: '#ff3653',
    backdrop: '#321922', key: '#ff8d9b', fill: '#ac688c', metalness: .79, roughness: .28,
  },
};

export const defaultRifleSkin = 'underground-lab';

export function resolveRifleSkin(id, fallback = defaultRifleSkin) {
  return Object.hasOwn(rifleSkins, id) ? id : fallback;
}
