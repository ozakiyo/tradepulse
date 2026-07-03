#!/usr/bin/env node
/**
 * majjhima-pairs-batch*.mjs のペアデータを mn*.json に反映
 * 用法: node scripts/apply-majjhima-pairs.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAIRS as B1 } from './majjhima-pairs-batch1.mjs';
import { PAIRS as B2 } from './majjhima-pairs-batch2.mjs';
import { PAIRS as B3 } from './majjhima-pairs-batch3.mjs';
import { PAIRS as B4 } from './majjhima-pairs-batch4.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../public/dhamma/data/majjhima');
const CURATED = new Set([1, 2, 7, 9, 10, 11, 13, 18, 19, 20, 22, 26, 27, 28, 30, 38, 41, 48, 51, 54, 55, 58, 62, 118]);

const ALL = { ...B1, ...B2, ...B3, ...B4 };

function mnFile(n) {
  return `mn${String(n).padStart(3, '0')}.json`;
}

function formatPairs(n, pairs) {
  return pairs.map((pair, i) => ({
    id: `MN${n}-P${String(i + 1).padStart(2, '0')}`,
    category: pair.category,
    ref: `MN ${n}`,
    section: pair.section,
    observe: pair.observe,
    action: pair.action,
    quote: pair.quote,
  }));
}

function isStub(data) {
  return data.pairs.some((p) => /（中部第\d+経）/.test(p.quote));
}

function main() {
  const keys = Object.keys(ALL).map(Number).sort((a, b) => a - b);
  let applied = 0;
  let skippedCurated = 0;
  let missing = [];

  for (let n = 1; n <= 152; n += 1) {
    if (CURATED.has(n)) continue;
    if (!ALL[n]) {
      missing.push(n);
      continue;
    }
    const file = mnFile(n);
    const p = path.join(OUT, file);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!isStub(data)) {
      skippedCurated += 1;
      continue;
    }
    const pairs = ALL[n];
    if (pairs.length < 8) {
      throw new Error(`MN ${n}: need at least 8 pairs, got ${pairs.length}`);
    }
    data.pairs = formatPairs(n, pairs);
    fs.writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`);
    applied += 1;
  }

  const index = JSON.parse(fs.readFileSync(path.join(OUT, 'index.json'), 'utf8'));
  index.description = '中部152経全体。各経を1章とし、観察→行動ペアで読む。';
  index.totalPairs = 0;
  for (const ch of index.chapters) {
    const data = JSON.parse(fs.readFileSync(path.join(OUT, ch.file), 'utf8'));
    ch.pairCount = data.pairs.length;
    index.totalPairs += ch.pairCount;
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);

  console.log(`applied ${applied} suttas (${keys.length} in batch files)`);
  if (missing.length) {
    console.error('missing:', missing.join(', '));
    process.exit(1);
  }
}

main();
