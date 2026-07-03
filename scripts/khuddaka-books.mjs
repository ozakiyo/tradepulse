/** 南伝大蔵経 小部15経典 — 経名·巻 */
export const BOOKS = [
  { n: 1, id: 'dhp', shortTitle: '法句経', title: '法句経', volume: '第23巻', mapNote: 'Dhp 1–25——双品から比丘品、小部における法句の地図' },
  { n: 2, id: 'ud', shortTitle: '感興語', title: '感興語経', volume: '第23巻', mapNote: 'Ud 1–8——菩提·盲象·バーヒヤ·スメーダー·涅槃の感興語' },
  { n: 3, id: 'iti', shortTitle: '如是語', title: '如是語経', volume: '第23巻', mapNote: 'Iti 1–112——一法·二法·三法·四法の如来教示' },
  { n: 4, id: 'snp', shortTitle: '経集', title: '経集', volume: '第24巻', mapNote: 'Snp 1.3–1.12——犀角·農夫·慈経·牟尼等' },
  { n: 5, id: 'brahma', shortTitle: '梵住', title: '梵住·慈経', volume: '第24巻', mapNote: 'Snp 1.8·Khp 9——慈悲喜捨の実践' },
  { n: 6, id: 'khp', shortTitle: '小誦経', title: '小誦経', volume: '第23巻', mapNote: 'Khp 1–9——三帰依·学処·吉祥·宝·慈' },
  { n: 7, id: 'thag', shortTitle: '長老偈', title: '長老偈経', volume: '第25巻', mapNote: 'Thag——スブーティ·サーリプッタ·モッガッラーナ·ヴァンギーサ他' },
  { n: 8, id: 'thig', shortTitle: '長老尼偈', title: '長老尼偈経', volume: '第25巻', mapNote: 'Thig——ムッター·ケーマー·パターチャーラー·キサーゴータミー他' },
  { n: 9, id: 'vim', shortTitle: '天宮事', title: '天宮事経', volume: '第24巻', mapNote: 'Vim——天界の業·福·戒の果' },
  { n: 10, id: 'pet', shortTitle: '餓鬼事', title: '餓鬼事経', volume: '第25巻', mapNote: 'Pet——餓鬼の業·施·悔い·解脱への道' },
  { n: 11, id: 'jat', shortTitle: '本生', title: '本生経', volume: '第26–38巻', mapNote: 'Jat 選——十業·忍辱·布施·智慧の本生譚' },
  { n: 12, id: 'nd', shortTitle: '義釈', title: '義釈経', volume: '第45–47巻', mapNote: 'Nd——大義釈·小義釈、経集の義釈' },
  { n: 13, id: 'pts', shortTitle: '無礙解道', title: '無礙解道経', volume: '第43–44巻', mapNote: 'Pts——無礙解·縁起·四諦·念処の分析' },
  { n: 14, id: 'ap', shortTitle: '譬喻', title: '譬喻経', volume: '第29–30巻', mapNote: 'Ap——比丘·比丘尼の過去行·解脱の譬喩' },
  { n: 15, id: 'bvcp', shortTitle: '佛種姓', title: '佛種姓·所行藏', volume: '第44巻', mapNote: 'Bv·Cp——仏の系譜と過去の菩薩行' },
];

export function metaForBook(n) {
  return BOOKS.find((b) => b.n === n) || null;
}
