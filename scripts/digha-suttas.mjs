/** 南伝大蔵経 長部34経 — 経名·篇·巻 */
export const VAGGAS = [
  { from: 1, to: 13, name: '戒初篇' },
  { from: 14, to: 23, name: '大篇' },
  { from: 24, to: 27, name: '破壊篇' },
  { from: 28, to: 34, name: '集篇' },
];

export const VOLUMES = [
  { from: 1, to: 13, name: '第6巻' },
  { from: 14, to: 23, name: '第7巻' },
  { from: 24, to: 27, name: '第8巻上' },
  { from: 28, to: 34, name: '第8巻下' },
];

export const TITLES = [
  '梵網', '沙門果', '安婆陀', '小', '究陀', '摩訶梨', '耶離', '師子吼', '波塔頗陀', '須波', '堅固', 'ローヒッチャ', '三明',
  '大本', '大静', '大般泥洹', '揵婆佉', '大穴', '大满', '帝釈問', '娑難陀', '轉輪', '火喩',
  '破壊', '乌昙跋', '聖尋', '大念処', '信', '慶', '相', '善生', '自歸', '集', '十上',
];

export function metaForDn(n) {
  const title = TITLES[n - 1];
  const vagga = VAGGAS.find((v) => n >= v.from && n <= v.to)?.name || '';
  const volume = VOLUMES.find((v) => n >= v.from && n <= v.to)?.name || '';
  const suffix = title.endsWith('経') ? title : `${title}経`;
  return { title: suffix, shortTitle: suffix, vagga, volume, mapNote: `DN ${n}——${suffix}` };
}
