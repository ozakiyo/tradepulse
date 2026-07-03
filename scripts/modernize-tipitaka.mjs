#!/usr/bin/env node
/**
 * 一切経·地図 JSON（tp1–tp8、tp3除く未処理分）の observe / action / quote を現代語に整える
 * 用法: node scripts/modernize-tipitaka.mjs [tp1|...|all]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '../public/dhamma/data/tipitaka');

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
  ['无常', '無常'],
];

const OBSERVE_ACTION = [
  ['掉挙', '落ち着かない心'],
  ['瞋恚', '怒り'],
  ['瞋', '怒り'],
  ['如実', 'あるがままに'],
  ['此が', 'これが'],
  ['此の', 'この'],
  ['此れ', 'これ'],
  ['此是', 'これが'],
  ['此', 'この'],
  ['諸法', 'あらゆる法'],
  ['諸比丘', '比丘たち'],
  ['汝等', 'あなたたち'],
  ['汝', 'あなた'],
  ['我は', '私は'],
  ['我、', '私は、'],
  ['我が', '私の'],
  ['是なり', 'である'],
  ['於て', 'において'],
  ['如し', 'のように'],
  ['ごとし', 'のように'],
  ['ごとき', 'のような'],
  ['の如し', 'のように'],
  ['が如し', 'のように'],
  ['が如く', 'のように'],
  ['以て', 'をもって'],
  ['除却', '取り除く'],
  ['殺生', '殺すこと'],
  ['妄語', '嘘'],
];

const QUOTE = [
  ['此が', 'これが'],
  ['此の', 'この'],
  ['此れ', 'これ'],
  ['此是', 'これが'],
  ['汝等', '汝等'],
  ['我は', '我は'],
  ['是なり', 'なり'],
  ['如実', '如実'],
  ['瞋恚', '瞋恚'],
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

function processFile(file) {
  const p = path.join(DATA, file);
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  data.categories = STANDARD_CATEGORIES.map((c) => ({ ...c }));
  for (const pair of data.pairs) modernizePair(pair);
  fs.writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`);
}

const arg = process.argv[2] || 'remaining';
const all = Array.from({ length: 8 }, (_, i) => `tp${i + 1}.json`);
const remaining = all.filter((f) => f !== 'tp3.json');
const files = arg === 'all' ? all : arg === 'remaining' ? remaining : [`${arg}.json`];

for (const f of files) {
  processFile(f);
  console.log(`updated ${f}`);
}
console.log(`done (${files.length} files)`);
