/** 南伝大蔵経 経集（スッタニパータ）5品 */
export const VAGGAS = [
  {
    n: 1,
    shortTitle: '蛇喩品',
    title: '蛇喩品',
    volume: '第24巻',
    mapNote: 'Snp 1.1–1.12——蛇喩·犀角·農夫·慈経·牟尼',
    suttas: [
      'Snp 1.1 蛇喩経', 'Snp 1.2 陀那経', 'Snp 1.3 犀角経', 'Snp 1.4 農夫の経',
      'Snp 1.5 クンダ経', 'Snp 1.6 衰退経', 'Snp 1.7 賤者経', 'Snp 1.8 慈経',
      'Snp 1.9 雪山経', 'Snp 1.10 アーラヴァカ経', 'Snp 1.11 勝利経', 'Snp 1.12 牟尼経',
    ],
  },
  {
    n: 2,
    shortTitle: '小品',
    title: '小品',
    volume: '第24巻',
    mapNote: 'Snp 2.1–2.14——ラーフula·在俗·出家·善友',
    suttas: ['Snp 2 小品（14経）'],
  },
  {
    n: 3,
    shortTitle: '大品',
    title: '大品',
    volume: '第24巻',
    mapNote: 'Snp 3.1–3.11——大経·須菩提·経路·須弥',
    suttas: ['Snp 3 大品（11経）'],
  },
  {
    n: 4,
    shortTitle: '八頌品',
    title: '八頌品',
    volume: '第24巻',
    mapNote: 'Snp 4.1–4.16——有見·世間·須陀洹·波羅提木叉',
    suttas: ['Snp 4 八頌品（16経）'],
  },
  {
    n: 5,
    shortTitle: '彼岸道品',
    title: '彼岸道品',
    volume: '第24巻',
    mapNote: 'Snp 5.1–5.16——阿逸多問·須菩提·涅槃の道',
    suttas: ['Snp 5 彼岸道品（16経）'],
  },
];

export function metaForVagga(n) {
  return VAGGAS.find((v) => v.n === n) || null;
}
