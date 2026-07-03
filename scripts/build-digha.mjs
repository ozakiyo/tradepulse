#!/usr/bin/env node
/**
 * 長部34経 JSON を生成
 * 用法: node scripts/build-digha.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { metaForDn, TITLES } from './digha-suttas.mjs';
import { PAIRS as B1 } from './digha-pairs-batch1.mjs';
import { PAIRS as B2 } from './digha-pairs-batch2.mjs';
import { PAIRS as B3 } from './digha-pairs-batch3.mjs';
import { PAIRS as B4 } from './digha-pairs-batch4.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../public/dhamma/data/digha');

const LEGACY_FILE = { 1: 'dn1', 2: 'dn2', 4: 'dn4', 12: 'dn12', 16: 'dn16' };
const ALL = { ...B1, ...B2, ...B3, ...B4 };

const CATEGORIES = [
  { id: 'prep', name: '正見', short: '正見', weekday: 1 },
  { id: 'speech', name: '正語', short: '正語', weekday: 2 },
  { id: 'people', name: '対人', short: '対人', weekday: 3 },
  { id: 'desire', name: '対治', short: '対治', weekday: 4 },
  { id: 'suffering', name: '苦·縁起', short: '縁起', weekday: 5 },
  { id: 'work', name: '精進·正念', short: '正念', weekday: 6 },
  { id: 'night', name: '振り返り', short: '夜', weekday: 0 },
];

function dnFile(n) {
  return `dn${String(n).padStart(2, '0')}.json`;
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
    id: `DN${n}-P${String(i + 1).padStart(2, '0')}`,
    category: pair.category,
    ref: pair.ref || `DN ${n}`,
    section: pair.section,
    observe: pair.observe,
    action: pair.action,
    quote: pair.quote,
  }));
}

function buildChapter(n, pairs) {
  const meta = metaForDn(n);
  return {
    chapter: n,
    sutta: n,
    title: `長部 第${n}経（${meta.title}）`,
    shortTitle: meta.shortTitle,
    mapNote: meta.mapNote,
    suttas: [`DN ${n} ${meta.title}`],
    source: {
      primary: `南伝大蔵経 長部経典（${meta.vagga}）`,
      verify: `南伝大蔵経 ${meta.volume}`,
    },
    categories: CATEGORIES.map((c) => ({ ...c })),
    pairs: formatPairs(n, pairs),
  };
}

function main() {
  if (TITLES.length !== 34) throw new Error(`TITLES must be 34, got ${TITLES.length}`);

  fs.mkdirSync(OUT, { recursive: true });
  const index = {
    title: '長部（34経）',
    source: '南伝大蔵経（日本仏教学院）',
    collection: 'digha',
    description: '長部34経全体。各経を1章とし、観察→行動ペアで読む。',
    grouping: 'sutta',
    totalPairs: 0,
    chapters: [],
  };

  const missing = [];
  for (let n = 1; n <= 34; n += 1) {
    const pairs = ALL[n] || loadLegacyPairs(n);
    if (!pairs?.length) {
      missing.push(n);
      continue;
    }
    if (pairs.length < 8) throw new Error(`DN ${n}: need at least 8 pairs, got ${pairs.length}`);
    const file = dnFile(n);
    const data = buildChapter(n, pairs);
    fs.writeFileSync(path.join(OUT, file), `${JSON.stringify(data, null, 2)}\n`);
    index.chapters.push({
      id: n,
      sutta: n,
      file,
      title: data.title,
      shortTitle: metaForDn(n).shortTitle,
      mapNote: data.mapNote,
      pairCount: pairs.length,
    });
    index.totalPairs += pairs.length;
  }

  if (missing.length) {
    console.error('missing pairs for DN:', missing.join(', '));
    process.exit(1);
  }

  fs.writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  console.log(`built 34 suttas, ${index.totalPairs} pairs`);
}

main();
