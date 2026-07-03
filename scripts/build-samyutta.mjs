#!/usr/bin/env node
/**
 * 相応部56相応 JSON を生成
 * 用法: node scripts/build-samyutta.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { metaForSn, TITLES } from './samyutta-samyuttas.mjs';
import { PAIRS as B1 } from './samyutta-pairs-batch1.mjs';
import { PAIRS as B2 } from './samyutta-pairs-batch2.mjs';
import { PAIRS as B3 } from './samyutta-pairs-batch3.mjs';
import { PAIRS as B4 } from './samyutta-pairs-batch4.mjs';
import { PAIRS as B5 } from './samyutta-pairs-batch5.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../public/dhamma/data/samyutta');

const LEGACY_FILE = {
  12: 's01', 22: 's02', 35: 's03', 45: 's04', 46: 's05', 47: 's06', 56: 's07',
};

const CURATED = new Set([12, 22, 35, 45, 46, 47, 56]);
const ALL = { ...B1, ...B2, ...B3, ...B4, ...B5 };

const CATEGORIES = [
  { id: 'prep', name: '正見', short: '正見', weekday: 1 },
  { id: 'speech', name: '正語', short: '正語', weekday: 2 },
  { id: 'people', name: '対人', short: '対人', weekday: 3 },
  { id: 'desire', name: '対治', short: '対治', weekday: 4 },
  { id: 'suffering', name: '苦·縁起', short: '縁起', weekday: 5 },
  { id: 'work', name: '精進·正念', short: '正念', weekday: 6 },
  { id: 'night', name: '振り返り', short: '夜', weekday: 0 },
];

function snFile(n) {
  return `sn${String(n).padStart(2, '0')}.json`;
}

function loadLegacyPairs(n) {
  const base = LEGACY_FILE[n];
  if (!base) return null;
  const p = path.join(OUT, `${base}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')).pairs.map((pair) => ({
    category: pair.category,
    ref: pair.ref,
    section: pair.section,
    observe: pair.observe,
    action: pair.action,
    quote: pair.quote,
  }));
}

function formatPairs(n, pairs) {
  return pairs.map((pair, i) => ({
    id: `SN${n}-P${String(i + 1).padStart(2, '0')}`,
    category: pair.category,
    ref: pair.ref || `SN ${n}`,
    section: pair.section,
    observe: pair.observe,
    action: pair.action,
    quote: pair.quote,
  }));
}

function buildChapter(n, pairs) {
  const meta = metaForSn(n);
  return {
    chapter: n,
    samyutta: n,
    title: `相応部 第${n}章（${meta.title}）`,
    shortTitle: meta.shortTitle,
    mapNote: meta.mapNote,
    suttas: [`SN ${n} ${meta.title}`],
    source: {
      primary: `南伝大蔵経 相応部経典（${meta.vagga}）`,
      verify: `南伝大蔵経 ${meta.volume}`,
    },
    categories: CATEGORIES.map((c) => ({ ...c })),
    pairs: formatPairs(n, pairs),
  };
}

function main() {
  if (TITLES.length !== 56) throw new Error(`TITLES must be 56, got ${TITLES.length}`);

  fs.mkdirSync(OUT, { recursive: true });
  const index = {
    title: '相応部（56相応）',
    source: '南伝大蔵経（日本仏教学院）',
    collection: 'samyutta',
    description: '相応部56相応全体。各相応35ペアで読む。',
    grouping: 'samyutta',
    totalPairs: 0,
    chapters: [],
  };

  const missing = [];
  for (let n = 1; n <= 56; n += 1) {
    const pairs = ALL[n] || loadLegacyPairs(n);
    if (!pairs?.length) {
      missing.push(n);
      continue;
    }
    if (pairs.length < 30) throw new Error(`SN ${n}: need at least 30 pairs, got ${pairs.length}`);
    const file = snFile(n);
    const data = buildChapter(n, pairs);
    fs.writeFileSync(path.join(OUT, file), `${JSON.stringify(data, null, 2)}\n`);
    index.chapters.push({
      id: n,
      samyutta: n,
      file,
      title: data.title,
      shortTitle: metaForSn(n).shortTitle,
      mapNote: data.mapNote,
      suttas: data.suttas,
      pairCount: pairs.length,
    });
    index.totalPairs += pairs.length;
  }

  if (missing.length) {
    console.error('missing pairs for SN:', missing.join(', '));
    process.exit(1);
  }

  fs.writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  console.log(`built 56 samyuttas, ${index.totalPairs} pairs`);
  console.log(`curated from legacy: ${CURATED.size}, from batch: ${Object.keys(ALL).length}`);
}

main();
