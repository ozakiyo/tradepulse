#!/usr/bin/env node
/**
 * 中部152経 JSON を生成（旧8章280ペアから移行 + 未整備経は7ペア雛形）
 * 用法: node scripts/build-majjhima.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { metaForMn, TITLES } from './majjhima-suttas.mjs';
import { PAIRS as B1 } from './majjhima-pairs-batch1.mjs';
import { PAIRS as B2 } from './majjhima-pairs-batch2.mjs';
import { PAIRS as B3 } from './majjhima-pairs-batch3.mjs';
import { PAIRS as B4 } from './majjhima-pairs-batch4.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../public/dhamma/data/majjhima');
const EXTRA = { ...B1, ...B2, ...B3, ...B4 };
const LEGACY = ['m01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08'];

const CATEGORIES = [
  { id: 'prep', name: '正見', short: '正見', weekday: 1 },
  { id: 'speech', name: '正語', short: '正語', weekday: 2 },
  { id: 'people', name: '対人', short: '対人', weekday: 3 },
  { id: 'desire', name: '対治', short: '対治', weekday: 4 },
  { id: 'suffering', name: '苦·縁起', short: '縁起', weekday: 5 },
  { id: 'work', name: '精進·正念', short: '正念', weekday: 6 },
  { id: 'night', name: '振り返り', short: '夜', weekday: 0 },
];

const DEFAULT_ACTIONS = {
  prep: '朝、この経の教えを一つ、今日の心の向きに当てはめる',
  speech: '今日、言葉を出す前にこの経の教えを一度思い出す',
  people: '対人の場面で、この経の教えに照らして自分の反応を観る',
  desire: '衝動が来たら、この経の教えを一つ思い出して立ち止まる',
  suffering: 'つらいとき、この経の教えを静かに思い出す',
  work: '今日の行いの一つを、この経の教えに結びつける',
  night: '就寝前、この経の教えを一つ振り返る',
};

function mnFile(n) {
  return `mn${String(n).padStart(3, '0')}.json`;
}

function loadLegacyPairs() {
  const byMn = new Map();
  for (const base of LEGACY) {
    const p = path.join(OUT, `${base}.json`);
    if (!fs.existsSync(p)) continue;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const pair of data.pairs) {
      const m = String(pair.ref || '').match(/MN\s*(\d+)/);
      if (!m) continue;
      const n = Number(m[1]);
      if (!byMn.has(n)) byMn.set(n, []);
      byMn.get(n).push({ ...pair });
    }
  }
  return byMn;
}

function renumberPairs(n, pairs) {
  return pairs.map((pair, i) => ({
    ...pair,
    id: `MN${n}-P${String(i + 1).padStart(2, '0')}`,
    ref: `MN ${n}`,
  }));
}

function stubPairs(n, title, vagga) {
  return CATEGORIES.map((cat, i) => ({
    id: `MN${n}-P${String(i + 1).padStart(2, '0')}`,
    category: cat.id,
    ref: `MN ${n}`,
    section: vagga,
    observe: `${title}——中部第${n}経。${cat.name}の場面で、この経の教えを当てはめる`,
    action: DEFAULT_ACTIONS[cat.id],
    quote: `${title}（中部第${n}経）`,
  }));
}

function buildChapter(n, pairs) {
  const { title, vagga, pannasa } = metaForMn(n);
  return {
    chapter: n,
    sutta: n,
    title: `中部 第${n}経（${title}）`,
    shortTitle: title,
    mapNote: `${pannasa} · ${vagga}`,
    suttas: [`MN ${n} ${title}`],
    source: {
      primary: '南伝大蔵経 中部経典（日本仏教学院）',
      verify: `南伝第9–11巻 · ${pannasa}`,
    },
    categories: CATEGORIES.map((c) => ({ ...c })),
    pairs,
  };
}

function main() {
  if (TITLES.length !== 152) {
    throw new Error(`TITLES must be 152 entries, got ${TITLES.length}`);
  }

  const legacy = loadLegacyPairs();
  fs.mkdirSync(OUT, { recursive: true });

  const index = {
    title: '中部（152経）',
    source: '南伝大蔵経（日本仏教学院）',
    collection: 'majjhima',
    description: '中部152経全体。各経を1章とし、観察→行動ペアで読む。',
    grouping: 'sutta',
    totalPairs: 0,
    chapters: [],
  };

  for (let n = 1; n <= 152; n += 1) {
    const { title, vagga } = metaForMn(n);
    const existing = legacy.get(n) || EXTRA[n];
    const pairs = existing
      ? renumberPairs(n, existing)
      : stubPairs(n, title, vagga);
    const file = mnFile(n);
    const data = buildChapter(n, pairs);
    fs.writeFileSync(path.join(OUT, file), `${JSON.stringify(data, null, 2)}\n`);
    index.chapters.push({
      id: n,
      sutta: n,
      file,
      title: data.title,
      shortTitle: title,
      mapNote: data.mapNote,
      pairCount: pairs.length,
    });
    index.totalPairs += pairs.length;
  }

  fs.writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);

  console.log(`built 152 chapters, ${index.totalPairs} pairs`);
  console.log(`legacy suttas: ${legacy.size}, stub suttas: ${152 - legacy.size}`);
}

main();
