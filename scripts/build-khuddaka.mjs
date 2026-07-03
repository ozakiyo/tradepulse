#!/usr/bin/env node
/**
 * 小部15経典 JSON を生成（k09–k15 を batch から、他は既存維持）
 * 用法: node scripts/build-khuddaka.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { metaForBook, BOOKS } from './khuddaka-books.mjs';
import { PAIRS as B9 } from './khuddaka-pairs-batch9.mjs';
import { PAIRS as B10 } from './khuddaka-pairs-batch10.mjs';
import { PAIRS as B11 } from './khuddaka-pairs-batch11.mjs';
import { PAIRS as B12 } from './khuddaka-pairs-batch12.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../public/dhamma/data/khuddaka');

const EXTRA = {
  9: B9, 10: B10, 11: B11,
  12: B12[12], 13: B12[13], 14: B12[14], 15: B12[15],
};

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
  return `k${String(n).padStart(2, '0')}.json`;
}

function loadExisting(n) {
  const file = path.join(OUT, chapterFile(n));
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    suttas: data.suttas,
    pairs: data.pairs.map((p) => ({
      category: p.category, ref: p.ref, section: p.section,
      observe: p.observe, action: p.action, quote: p.quote,
    })),
  };
}

function formatPairs(n, pairs) {
  return pairs.map((pair, i) => ({
    id: `KH${n}-P${String(i + 1).padStart(2, '0')}`,
    category: pair.category,
    ref: pair.ref,
    section: pair.section,
    observe: pair.observe,
    action: pair.action,
    quote: pair.quote,
  }));
}

function buildChapter(n, pairs, suttas) {
  const meta = metaForBook(n);
  return {
    chapter: n,
    title: `小部 第${n}章（${meta.shortTitle}）`,
    shortTitle: meta.shortTitle,
    mapNote: meta.mapNote,
    suttas,
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
    title: '小部（15経典）',
    source: '南伝大蔵経（日本仏教学院）',
    collection: 'khuddaka',
    description: '小部15経典全体。各章35ペアで読む。（法句経は別コレクションあり）',
    grouping: 'book',
    totalPairs: 0,
    chapters: [],
  };

  for (const meta of BOOKS) {
    const n = meta.n;
    const existing = loadExisting(n);
    const pairs = EXTRA[n] || existing?.pairs;
    if (!pairs?.length) throw new Error(`no pairs for chapter ${n}`);
    const suttas = existing?.suttas || [meta.title];
    const file = chapterFile(n);
    const data = buildChapter(n, pairs, suttas);
    fs.writeFileSync(path.join(OUT, file), `${JSON.stringify(data, null, 2)}\n`);
    index.chapters.push({
      id: n,
      file,
      title: data.title,
      shortTitle: meta.shortTitle,
      mapNote: meta.mapNote,
      suttas,
      pairCount: pairs.length,
    });
    index.totalPairs += pairs.length;
  }

  fs.writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  console.log(`built ${index.chapters.length} chapters, ${index.totalPairs} pairs`);
}

main();
