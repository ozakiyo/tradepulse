/** 南伝大蔵経 相応部56相応 — 相応名·篇·巻 */
export const VAGGAS = [
  { from: 1, to: 11, name: '有偈篇' },
  { from: 12, to: 21, name: '因縁篇' },
  { from: 22, to: 34, name: '蘊篇' },
  { from: 35, to: 44, name: '六処篇' },
  { from: 45, to: 56, name: '大篇' },
];

export const VOLUMES = [
  { from: 1, to: 11, name: '第12巻' },
  { from: 12, to: 21, name: '第13巻' },
  { from: 22, to: 34, name: '第14巻' },
  { from: 35, to: 41, name: '第15巻' },
  { from: 42, to: 47, name: '第16巻上' },
  { from: 48, to: 56, name: '第16巻下' },
];

export const TITLES = [
  '諸天', '天子', '拘薩羅', '悪魔', '比丘尼', '梵天', '婆羅門', '婆耆沙長老', '森', '夜叉', '帝釈',
  '因緣', '現観', '界', '無始', '迦葉', '利得と供養', '羅睺羅', '勒叉那', '譬喩', '比丘',
  '蘊', '羅陀', '見', '入', '生', '煩悩', '舎利弗', '龍', '金翅鳥', '乾闥婆', '雲', '婆蹉種', '禅定',
  '六処', '受', '女人', '閻浮車', '沙門出家', '目犍連', '質多', '聚落主', '無為', '無記説',
  '道', '覚支', '念処', '根', '正勤', '力', '神足', '阿那律', '静慮', '入出息', '預流', '諦',
];

export function metaForSn(n) {
  const title = TITLES[n - 1];
  const vagga = VAGGAS.find((v) => n >= v.from && n <= v.to)?.name || '';
  const volume = VOLUMES.find((v) => n >= v.from && n <= v.to)?.name || '';
  return {
    title: `${title}相応`,
    shortTitle: title,
    vagga,
    volume,
    mapNote: `SN ${n}——${title}相応`,
  };
}
