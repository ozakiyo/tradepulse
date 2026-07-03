#!/usr/bin/env node
/**
 * ダンマパダ JSON（ch1–ch26）の observe / action / quote を現代語に整える
 * 用法: node scripts/modernize-dhammapada.mjs [ch1|...|all]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '../public/dhamma/data');

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
  ['この是', 'これが'],
  ['ののように', 'のように'],
  ['ののような', 'のような'],
  ['まだ生じていないの', 'まだ生じていない'],
  ['すでに生じたの', 'すでに生じた'],
];

const OBSERVE_ACTION = [
  ['掉挙', '落ち着かない心'],
  ['瞋恚', '怒りと憎しみ'],
  ['瞋', '怒り'],
  ['忿怨', '怒りの念'],
  ['忿怒', '怒り'],
  ['怨憎なく', '恨みと憎しみなく'],
  ['怨憎なき', '恨みと憎しみのない'],
  ['怨憎なければ', '恨みと憎しみがなければ'],
  ['怨憎者', '恨む者'],
  ['怨憎を', '恨みと憎しみを'],
  ['怨憎', '恨みと憎しみ'],
  ['怨む', '恨む'],
  ['怨は', '恨みは'],
  ['怨を', '恨みを'],
  ['怨', '恨み'],
  ['如実', 'あるがままに'],
  ['此が', 'これが'],
  ['此の', 'この'],
  ['此れ', 'これ'],
  ['此是', 'これが'],
  ['此', 'この'],
  ['諸法', 'あらゆる法'],
  ['諸根', '諸々の感覚の門'],
  ['諸欲', 'あらゆる欲'],
  ['諸天', 'あらゆる天'],
  ['諸蘊', 'あらゆる蘊'],
  ['諸の', 'あらゆる'],
  ['諸仏', '諸仏'],
  ['一切の衆生', 'すべての生き物'],
  ['衆生', '生き物'],
  ['有情', '生き物'],
  ['汝等', 'あなたたち'],
  ['汝', 'あなた'],
  ['我は', '私は'],
  ['我を', '私を'],
  ['我、', '私は、'],
  ['我が', '私の'],
  ['是なり', 'である'],
  ['於て', 'において'],
  ['以て', 'をもって'],
  ['如し', 'のように'],
  ['ごとし', 'のように'],
  ['ごとき', 'のような'],
  ['の如し', 'のように'],
  ['が如し', 'のように'],
  ['が如く', 'のように'],
  ['除却', '取り除く'],
  ['殺生', '殺すこと'],
  ['忽諸', '軽んじて'],
  ['然り', 'そのとおり'],
  ['漏を', '煩悩を'],
  ['漏が', '煩悩が'],
  ['漏は', '煩悩は'],
  ['の漏', 'の煩悩'],
  ['愚鈍愚昧', '愚かな'],
  ['愚昧', '愚かな'],
  ['輩', '者たち'],
  ['耽り', 'ふけり'],
  ['放逸に耽', '放逸にふける'],
  ['稱讃', '称賛'],
  ['非難せらる', '非難される'],
  ['獲得す', '獲得する'],
  ['通達せる', '通じる'],
  ['歓び', '喜び'],
  ['歓ぶ', '喜ぶ'],
  ['修せ', '修する'],
  ['往く', '進む'],
  ['造るべし', '造るべき'],
  ['護るべし', '護るべき'],
  ['達し得', '達し得る'],
  ['退く', '退く'],
  ['瞰下す', '見下ろす'],
  ['べからず', 'べきではない'],
];

const QUOTE = [
  ['此が', 'これが'],
  ['此の', 'この'],
  ['此れ', 'これ'],
  ['此是', 'これが'],
  ['汝等', '汝等'],
  ['汝', '汝'],
  ['我は', '我は'],
  ['我を', '我を'],
  ['我、', '我、'],
  ['是なり', 'なり'],
  ['如実', '如実'],
  ['瞋恚', '瞋恚'],
  ['忿怒', '忿怒'],
  ['圓', '円'],
  ['挂', '執'],
  ['惡', '悪'],
  ['麁', '麁'],
  ['歡', '歓'],
  ['覺', '覚'],
  ['少なし', '少ない'],
  ['多し', '多い'],
  ['美麗なり', '美しい'],
  ['障礙', '障害'],
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

function processFile(file) {
  const p = path.join(DATA, file);
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  data.categories = STANDARD_CATEGORIES.map((c) => ({ ...c }));
  for (const pair of data.pairs) modernizePair(pair);
  fs.writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`);
}

const arg = process.argv[2] || 'all';
const files = arg === 'all'
  ? Array.from({ length: 26 }, (_, i) => `ch${i + 1}.json`)
  : [`${arg}.json`];

let n = 0;
for (const f of files) {
  const before = fs.readFileSync(path.join(DATA, f), 'utf8');
  processFile(f);
  const after = fs.readFileSync(path.join(DATA, f), 'utf8');
  if (before !== after) n++;
  console.log(`updated ${f}`);
}
console.log(`done (${n} files changed)`);
