#!/usr/bin/env node
/**
 * 増支部11集 JSON を生成・更新（a09–a11 を batch から、index を再構築）
 * 用法: node scripts/build-anguttara.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { metaForNipata, NIPATAS } from './anguttara-nipatas.mjs';
import { PAIRS as P9 } from './anguttara-pairs-batch9.mjs';
import { PAIRS as P10 } from './anguttara-pairs-batch10.mjs';
import { PAIRS as P11 } from './anguttara-pairs-batch11.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../public/dhamma/data/anguttara');

const EXTRA = { 9: P9, 10: P10, 11: P11 };

const CATEGORIES = [
  { id: 'prep', name: '正見', short: '正見', weekday: 1 },
  { id: 'speech', name: '正語', short: '正語', weekday: 2 },
  { id: 'people', name: '対人', short: '対人', weekday: 3 },
  { id: 'desire', name: '対治', short: '対治', weekday: 4 },
  { id: 'suffering', name: '苦·縁起', short: '縁起', weekday: 5 },
  { id: 'work', name: '精進·正念', short: '正念', weekday: 6 },
  { id: 'night', name: '振り返り', short: '夜', weekday: 0 },
];

function chapterFile(n) {
  return `a${String(n).padStart(2, '0')}.json`;
}

function formatPairs(n, pairs) {
  return pairs.map((pair, i) => ({
    id: `AN${n}-P${String(i + 1).padStart(2, '0')}`,
    category: pair.category,
    ref: pair.ref || `AN ${n}`,
    section: pair.section,
    observe: pair.observe,
    action: pair.action,
    quote: pair.quote,
  }));
}

function buildChapter(n, pairs) {
  const meta = metaForNipata(n);
  return {
    chapter: n,
    title: `増支部 第${n}章（${meta.shortTitle}）`,
    shortTitle: meta.shortTitle,
    mapNote: meta.mapNote,
    suttas: meta.suttas,
    source: {
      primary: `南伝大蔵経 増支部経典（${meta.japanese}）`,
      verify: `南伝大蔵経 ${meta.volume}`,
    },
    categories: CATEGORIES.map((c) => ({ ...c })),
    pairs: formatPairs(n, pairs),
  };
}

function loadExistingPairs(n) {
  const file = path.join(OUT, chapterFile(n));
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')).pairs.map((p) => ({
    category: p.category,
    ref: p.ref,
    section: p.section,
    observe: p.observe,
    action: p.action,
    quote: p.quote,
  }));
}

function main() {
  if (NIPATAS.length !== 11) throw new Error('NIPATAS must be 11');

  fs.mkdirSync(OUT, { recursive: true });
  const index = {
    title: '増支部（11集）',
    source: '南伝大蔵経（日本仏教学院）',
    collection: 'anguttara',
    description: '増支部11集全体。一の法から十一の法まで、各集35ペアで読む。',
    grouping: 'book',
    totalPairs: 0,
    chapters: [],
  };

  for (const meta of NIPATAS) {
    const n = meta.n;
    const pairs = EXTRA[n] || loadExistingPairs(n);
    if (!pairs?.length) throw new Error(`no pairs for nipata ${n}`);
    const file = chapterFile(n);
    const data = buildChapter(n, pairs);
    fs.writeFileSync(path.join(OUT, file), `${JSON.stringify(data, null, 2)}\n`);
    index.chapters.push({
      id: n,
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
  console.log(`built ${index.chapters.length} nipatas, ${index.totalPairs} pairs`);
}

main();
