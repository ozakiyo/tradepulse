#!/usr/bin/env node
/**
 * 長部 JSON（入門5経 + 一切経地図・長部章）の observe / action / quote を現代語に整える
 * 用法: node scripts/modernize-digha.mjs [dn1|tp3|all]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIGHA = path.join(__dirname, '../public/dhamma/data/digha');
const TIPITAKA = path.join(__dirname, '../public/dhamma/data/tipitaka');

const STANDARD_CATEGORIES = [
  { id: 'prep', name: '正見', short: '正見', weekday: 1 },
  { id: 'speech', name: '正語', short: '正語', weekday: 2 },
  { id: 'people', name: '対人', short: '対人', weekday: 3 },
  { id: 'desire', name: '対治', short: '対治', weekday: 4 },
  { id: 'suffering', name: '苦·縁起', short: '縁起', weekday: 5 },
  { id: 'work', name: '精進·正念', short: '正念', weekday: 6 },
  { id: 'night', name: '振り返り', short: '夜', weekday: 0 },
];

const REPAIR = [
  ['取り除くした', '除いた'],
  ['取り除くし', '除却し'],
  ['取り除く', '除却'],
  ['ありのまま完全に知る', 'ありのままに知る'],
  ['知るす', '知る'],
  ['知るし', '知り'],
  ['執執着', '執着'],
  ['この是', 'これが'],
  ['まだ生じていないの', 'まだ生じていない'],
  ['すでに生じたの', 'すでに生じた'],
  ['捨て去られるる', '捨て去られる'],
  ['貪怒り痴', '貪・瞋・痴'],
  ['正しいの道', '正しい道'],
  ['このを', 'これを'],
  ['このは', 'これは'],
  ['増やすさせる', '増やす'],
  ['増やすさせ', '増やす'],
  ['ののように', 'のように'],
  ['ののような', 'のような'],
  ['无常', '無常'],
  ['tradition', '伝統'],
];

const OBSERVE_ACTION = [
  ['圓満', '円満'],
  ['挂慮', '執着'],
  ['挂心', '執着'],
  ['惛眠', '眠気'],
  ['掉挙·恨', '落ち着かない心と後悔'],
  ['掉挙', '落ち着かない心'],
  ['瞋恚', '怒り'],
  ['瞋火', '怒りの火'],
  ['瞋', '怒り'],
  ['如理作意', '正しい心の向き'],
  ['不正作意', '間違った心の向き'],
  ['諸漏', 'あらゆる煩悩'],
  ['漏尽', '煩悩の滅尽'],
  ['一切の漏', 'あらゆる煩悩'],
  ['の漏', 'の煩悩'],
  ['漏を', '煩悩を'],
  ['漏が', '煩悩が'],
  ['漏は', '煩悩は'],
  ['未生の', 'まだ生じていない'],
  ['已生の', 'すでに生じた'],
  ['未生', 'まだ生じていない'],
  ['已生', 'すでに生じた'],
  ['如実', 'あるがままに'],
  ['遍知', 'ありのままに知り尽くす'],
  ['此が', 'これが'],
  ['此の', 'この'],
  ['此れ', 'これ'],
  ['此是', 'これが'],
  ['此処', 'ここ'],
  ['此世', 'この世'],
  ['此を', 'これを'],
  ['此は', 'これは'],
  ['此', 'この'],
  ['諸行無常', 'あらゆる行は無常'],
  ['諸行', 'あらゆる行'],
  ['諸法', 'あらゆる法'],
  ['諸根', '諸々の感覚の門'],
  ['諸の', 'あらゆる'],
  ['諸比丘', '比丘たち'],
  ['一切の衆生', 'すべての生き物'],
  ['衆生', '生き物'],
  ['汝等', 'あなたたち'],
  ['汝', 'あなた'],
  ['我は', '私は'],
  ['我、', '私は、'],
  ['我が', '私の'],
  ['是なり', 'である'],
  ['何ぞや', 'とは何か'],
  ['即ち', 'すなわち'],
  ['故に', 'だから'],
  ['如是', 'このように'],
  ['於て', 'において'],
  ['非ず', 'ではない'],
  ['猶如', 'まるで'],
  ['譬えば', 'たとえば'],
  ['の如し', 'のように'],
  ['が如し', 'のように'],
  ['が如く', 'のように'],
  ['ごとし', 'のように'],
  ['ごとき', 'のような'],
  ['如し', 'のように'],
  ['根門', '感覚の門'],
  ['根門を', '感覚の門を'],
  ['以て', 'をもって'],
  ['除却し', '取り除き'],
  ['除却', '取り除く'],
  ['具足を', '備えを'],
  ['具足し', '備え'],
  ['具足する', '備える'],
  ['具足', '備え'],
  ['頸', '首'],
  ['尸', '死体'],
  ['惡', '悪'],
  ['麁', '粗'],
  ['綺語', 'だらだらとした雑談'],
  ['兩舌', '人を仲たがらせる話'],
  ['妄語', '嘘'],
  ['出離', '離れること'],
  ['憂悲恼', '憂い・悲しみ・苦しみ'],
  ['愁', '悩み'],
  ['正適', '正しい'],
  ['梵行', '清らかな修行'],
  ['四念処', '四念処'],
  ['四正勤', '四正勤'],
  ['七覺支', '七覚支'],
  ['八正道', '八正道'],
  ['現前に', 'この場で'],
  ['自ら証知', '自分で確かめる'],
  ['美麗', '美しい'],
  ['増長', '増やす'],
  ['依りて', '依って'],
  ['不与取', '盗み'],
  ['邪婬', '不倫'],
  ['殺生', '殺すこと'],
  ['善逝', '善き御方'],
  ['如来', '如来'],
  ['世尊', '世尊'],
  ['比丘', '比丘'],
  ['阿羅漢', '阿羅漢'],
  ['聖弟子', '聖なる弟子'],
  ['優婆塞', '在家信者'],
  ['善友', '善友'],
  ['惡友', '悪友'],
  ['挂', '執'],
  ['然り', 'そのとおり'],
  ['仰せられた', 'おっしゃった'],
  ['大王、', '王よ、'],
  ['沙門瞿曇', '沙門ゴータマ'],
  ['了義', '究竟の意味'],
  ['不了義', '方便の意味'],
  ['善知識', '善友'],
  ['善伴侶', '善き伴侶'],
  ['般涅槃', '般涅槃'],
  ['入滅', '入滅'],
];

const QUOTE = [
  ['圓', '円'],
  ['圓満', '円満'],
  ['挂慮', '執着'],
  ['挂心', '執着'],
  ['挂', '執'],
  ['惛眠', '眠気'],
  ['掉挙·恨', '掉挙と恨'],
  ['瞋恚', '瞋恚'],
  ['此が', 'これが'],
  ['此の', 'この'],
  ['此れ', 'これ'],
  ['此是', 'これが'],
  ['此処', 'ここ'],
  ['諸比丘', '諸比丘'],
  ['汝等', '汝等'],
  ['我、', '我、'],
  ['我は', '我は'],
  ['是なり', 'なり'],
  ['何ぞや', '何ぞや'],
  ['如実', '如実'],
  ['已生', '已生'],
  ['未生', '未生'],
  ['生起す', '生起す'],
  ['生ずる', '生じる'],
  ['捨て去られ', '捨て去られ'],
  ['有して', '有して'],
  ['為すべし', '為すべし'],
  ['頸', '首'],
  ['尸', '死体'],
  ['惡', '悪'],
  ['麁', '麁'],
  ['歡', '歓'],
  ['覺', '覚'],
  ['障礙', '障害'],
  ['猗息', '猗息'],
  ['正適', '正適'],
  ['愁', '愁'],
  ['憂悲恼', '憂悲恼'],
  ['出離', '出離'],
  ['美麗なり', '美しい'],
  ['少なし', '少ない'],
  ['多し', '多い'],
  ['tradition', '伝統'],
  ['无常', '無常'],
];

function applyRules(text, rules) {
  let out = text;
  for (const [from, to] of rules) {
    out = out.split(from).join(to);
  }
  return out;
}

function modernizePair(pair) {
  for (const key of ['observe', 'action', 'quote']) {
    pair[key] = applyRules(pair[key], REPAIR);
  }
  pair.observe = applyRules(pair.observe, OBSERVE_ACTION);
  pair.action = applyRules(pair.action, OBSERVE_ACTION);
  pair.quote = applyRules(pair.quote, QUOTE);
  pair.quote = pair.quote
    .replace(/が如し/g, 'のように')
    .replace(/が如く/g, 'のように')
    .replace(/の如し/g, 'のように')
    .replace(/如し/g, 'ように');
  return pair;
}

function processFile(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  data.categories = STANDARD_CATEGORIES.map((c) => ({ ...c }));
  if (data.mapNote) {
    data.mapNote = data.mapNote.replace(/无常/g, '無常');
  }
  for (const pair of data.pairs) modernizePair(pair);
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

const arg = process.argv[2] || 'all';
const targets = [];

if (arg === 'all') {
  for (const f of fs.readdirSync(DIGHA).filter((x) => x.startsWith('dn') && x.endsWith('.json'))) {
    targets.push(path.join(DIGHA, f));
  }
} else if (arg === 'tp3') {
  targets.push(path.join(TIPITAKA, 'tp3.json'));
} else {
  targets.push(path.join(DIGHA, `${arg}.json`));
}

for (const p of targets) {
  processFile(p);
  console.log(`updated ${path.basename(p)}`);
}
console.log(`done (${targets.length} files)`);
