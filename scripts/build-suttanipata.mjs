#!/usr/bin/env node
/**
 * 経集5品 JSON を生成
 * 用法: node scripts/build-suttanipata.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { metaForVagga, VAGGAS } from './suttanipata-vaggas.mjs';
import { PAIRS as P2 } from './suttanipata-pairs-batch2.mjs';
import { PAIRS as P3 } from './suttanipata-pairs-batch3.mjs';
import { PAIRS as P4 } from './suttanipata-pairs-batch4.mjs';
import { PAIRS as P5 } from './suttanipata-pairs-batch5.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../public/dhamma/data/suttanipata');
const K04 = path.join(__dirname, '../public/dhamma/data/khuddaka/k04.json');

const EXTRA = { 2: P2, 3: P3, 4: P4, 5: P5 };

const CATEGORIES = [
  { id: 'prep', name: '正見', short: '正見', weekday: 1 },
  { id: 'speech', name: '正語', short: '正語', weekday: 2 },
  { id: 'people', name: '対人', short: '対人', weekday: 3 },
  { id: 'desire', name: '対治', short: '対治', weekday: 4 },
  { id: 'suffering', name: '苦·縁起', short: '縁起', weekday: 5 },
  { id: 'work', name: '精進·正念', short: '正念', weekday: 6 },
  { id: 'night', name: '振り返り', short: '夜', weekday: 0 },
];

function snpFile(n) {
  return `snp${String(n).padStart(2, '0')}.json`;
}

function loadVagga1Pairs() {
  const data = JSON.parse(fs.readFileSync(K04, 'utf8'));
  return data.pairs.map((p) => ({
    category: p.category,
    ref: p.ref,
    section: p.section,
    observe: p.observe,
    action: p.action,
    quote: p.quote,
  }));
}

function formatPairs(n, pairs) {
  return pairs.map((pair, i) => ({
    id: `SNP${n}-P${String(i + 1).padStart(2, '0')}`,
    category: pair.category,
    ref: pair.ref,
    section: pair.section,
    observe: pair.observe,
    action: pair.action,
    quote: pair.quote,
  }));
}

function buildChapter(n, pairs) {
  const meta = metaForVagga(n);
  return {
    chapter: n,
    vagga: n,
    title: `経集 第${n}品（${meta.shortTitle}）`,
    shortTitle: meta.shortTitle,
    mapNote: meta.mapNote,
    suttas: meta.suttas,
    source: {
      primary: `南伝大蔵経 小部経典（${meta.title}）`,
      verify: `南伝大蔵経 ${meta.volume}`,
    },
    categories: CATEGORIES.map((c) => ({ ...c })),
    pairs: formatPairs(n, pairs),
  };
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const index = {
    title: '経集（5品）',
    source: '南伝大蔵経（日本仏教学院）',
    collection: 'suttanipata',
    description: 'スッタニパータ5品全体。蛇喩品から彼岸道品まで、各品35ペアで読む。',
    grouping: 'vagga',
    totalPairs: 0,
    chapters: [],
  };

  for (const meta of VAGGAS) {
    const n = meta.n;
    const pairs = n === 1 ? loadVagga1Pairs() : EXTRA[n];
    if (!pairs?.length) throw new Error(`no pairs for vagga ${n}`);
    if (pairs.length < 30) throw new Error(`vagga ${n}: need at least 30 pairs, got ${pairs.length}`);
    const file = snpFile(n);
    const data = buildChapter(n, pairs);
    fs.writeFileSync(path.join(OUT, file), `${JSON.stringify(data, null, 2)}\n`);
    index.chapters.push({
      id: n,
      vagga: n,
      file,
      title: data.title,
      shortTitle: meta.shortTitle,
      mapNote: meta.mapNote,
      suttas: meta.suttas,
      pairCount: pairs.length,
    });
    index.totalPairs += pairs.length;
  }

  fs.writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  console.log(`built 5 vaggas, ${index.totalPairs} pairs`);
}

main();
