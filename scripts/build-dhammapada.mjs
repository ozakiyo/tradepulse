#!/usr/bin/env node
/**
 * 南伝大蔵経（日本仏教学院）のダンマパダ全文から
 * 観察→行動ペア JSON を生成する
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(__dirname, 'dhammapada-nanden-source.txt');
const OUT_DIR = path.join(ROOT, 'public/dhamma/data');

const CATEGORIES = [
  { id: 'prep', name: '心の準備', short: '準備', weekday: 1 },
  { id: 'speech', name: '言葉', short: '言葉', weekday: 2 },
  { id: 'people', name: '対人', short: '対人', weekday: 3 },
  { id: 'desire', name: '欲望・誘惑', short: '欲望', weekday: 4 },
  { id: 'suffering', name: '苦・困難', short: '苦', weekday: 5 },
  { id: 'work', name: '働き・責任', short: '働き', weekday: 6 },
  { id: 'night', name: '夜の振り返り', short: '夜', weekday: 0 },
];

const CHAPTER_NAMES = {
  1: '双品', 2: '不放逸品', 3: '心品', 4: '花品', 5: '愚品', 6: '賢品',
  7: '阿羅漢品', 8: '千品', 9: '悪品', 10: '刀杖品', 11: '老品', 12: '自己品',
  13: '世品', 14: '仏陀品', 15: '安楽品', 16: '愛好品', 17: '忿怒品', 18: '垢穢品',
  19: '法住品', 20: '道品', 21: '雑品', 22: '地獄品', 23: '象品', 24: '愛欲品',
  25: '比丘品', 26: '婆羅門品',
};

const CATEGORY_RULES = [
  ['night', /自己の業|業の汚濁|業の清浄|後悔|歓び|悲しみ|喜び|苦しみ|悪業をなせ|善業をなせ|我悪業|我善業|振り返/],
  ['speech', /語|言|誹謗|妄語|罵|謗|多言|句を|偈を誦|粗暴の言/],
  ['people', /怨|恨|争|友|伴侶|他者|他人|忿怒|瞋恚|親族|伴侶|愚者と共|賢者と/],
  ['desire', /貪|欲|愛欲|愛好|諸根|節度|享楽|飲食|愛着|淫欲|欲楽/],
  ['suffering', /苦|悲|憂|患|困|老死|死を|怖|痛|焼か|地獄|悪趣/],
  ['work', /戒|努力|精進|不放逸|為すべき|行う|為す|誦して実行|誠実|義務|梵行を修/],
  ['prep', /心|意|正念|覚醒|智|慧|思惟|禅定|念ず/],
];

const CHAPTER_VERSE_END = [20, 32, 43, 59, 75, 89, 99, 115, 128, 145, 156, 166, 178, 196, 208, 220, 234, 255, 272, 289, 305, 319, 333, 359, 382, 423];

function verseRange(chNum) {
  const max = CHAPTER_VERSE_END[chNum - 1];
  const min = chNum === 1 ? 1 : CHAPTER_VERSE_END[chNum - 2] + 1;
  return [min, max];
}

const DEFAULT_ACTIONS = {
  prep: '朝、今日の心の向きを一つ静かに決める',
  speech: '今日、言葉を出す前に一呼吸置く',
  people: '対人で苦が起きたら、まず自分の反応を観る',
  desire: '衝動が湧いたら、一歩引いて節度を守る',
  suffering: 'つらいとき、事実と反応を分けて見る',
  work: '今日の約束を一つ、確実に守る',
  night: '寝る前、今日の言動を正直に一つ振り返る',
};

function categorize(text, verseNum) {
  for (const [id, re] of CATEGORY_RULES) {
    if (re.test(text)) return id;
  }
  const order = ['prep', 'speech', 'people', 'desire', 'suffering', 'work', 'night'];
  return order[verseNum % order.length];
}

function firstSentence(text) {
  const m = text.match(/^[^。]+。/);
  return m ? m[0].replace(/。$/, '') : text.slice(0, 48);
}

function makeObserve(text) {
  const core = firstSentence(text).replace(/^[^、。]+[、,]\s*/, '');
  const trimmed = core.length > 42 ? `${core.slice(0, 42)}…` : core;
  if (/知る|観|理解|悟|見よ|思惟|念ず/.test(trimmed)) return trimmed;
  return `${trimmed}と知る`;
}

function makeAction(text, category) {
  const neg = text.match(/([^。]{3,28})べからず/);
  if (neg) {
    const phrase = neg[1].replace(/^(実に|常に|決して|又は|ただ|かく|故に|然れども)/, '').trim();
    return `今日、${phrase}ない`;
  }
  const pos = text.match(/([^。]{3,28})べし/);
  if (pos) {
    const phrase = pos[1].replace(/^(実に|汝ら|比丘らよ|婆羅門よ|賢者は|人は)/, '').trim();
    return `今日、${phrase}る`;
  }
  const seyo = text.match(/([^。]{3,24})(せよ|せよ。)/);
  if (seyo) {
    return `今日、${seyo[1].trim()}る`;
  }
  if (/観|知|悟|見/.test(text)) {
    return DEFAULT_ACTIONS[category].replace('今日、', '日中、');
  }
  return DEFAULT_ACTIONS[category];
}

function makeQuote(text) {
  const s = firstSentence(text);
  return s.length > 72 ? `${s.slice(0, 72)}…` : s;
}

function parseChapters(raw) {
  const chapters = [];
  const parts = raw.split(/### 第([0-9０-９]+)章・([^\n]+)\n/);
  for (let i = 1; i < parts.length; i += 3) {
    const numStr = parts[i].replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const chNum = Number(numStr);
    const body = parts[i + 2] || '';
    const clean = body
      .replace(/（[^）]*）/g, '')
      .replace(/※[^\n]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const [minV, maxV] = verseRange(chNum);
    const verses = [];
    const re = /(?:^|\s)([0-9０-９]{1,3})[\.．]\s*([^]*?)(?=(?:\s[0-9０-９]{1,3}[\.．]\s)|$)/g;
    let m;
    while ((m = re.exec(clean)) !== null) {
      const vNum = Number(m[1].replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)));
      if (vNum < minV || vNum > maxV) continue;
      const text = m[2].trim();
      if (text) verses.push({ num: vNum, text });
    }
    chapters.push({ num: chNum, name: CHAPTER_NAMES[chNum] || parts[i + 1].trim(), verses });
  }
  return chapters;
}

function buildChapterFile(ch) {
  const pairs = ch.verses.map((v) => {
    const category = categorize(v.text, v.num);
    return {
      id: `DP${ch.num}-V${String(v.num).padStart(3, '0')}`,
      category,
      verse: v.num,
      observe: makeObserve(v.text),
      action: makeAction(v.text, category),
      quote: makeQuote(v.text),
    };
  });
  return {
    chapter: ch.num,
    title: `ダンマパダ 第${ch.num}章（${ch.name}）`,
    shortTitle: ch.name,
    categories: CATEGORIES,
    pairs,
  };
}

const raw = fs.readFileSync(SOURCE, 'utf8');
const chapters = parseChapters(raw);

fs.mkdirSync(OUT_DIR, { recursive: true });

// ch1〜ch26 は手作り精選版。npm run dhamma:build は未整備章のみ生成（現状は全章保護）
const PRESERVE_CHAPTERS = new Set(Array.from({ length: 26 }, (_, i) => i + 1));

const index = {
  title: 'ダンマパダ（全26章）',
  source: '南伝大蔵経（日本仏教学院）',
  chapters: [],
};

let totalPairs = 0;

for (const ch of chapters) {
  if (PRESERVE_CHAPTERS.has(ch.num)) {
    const existingPath = path.join(OUT_DIR, `ch${ch.num}.json`);
    if (fs.existsSync(existingPath)) {
      const existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
      index.chapters.push({
        id: ch.num,
        file: `ch${ch.num}.json`,
        title: existing.title || `第${ch.num}章（${ch.name}）`,
        shortTitle: existing.shortTitle || ch.name,
        pairCount: existing.pairs.length,
        verseCount: ch.verses.length,
      });
      totalPairs += existing.pairs.length;
      continue;
    }
  }
  const data = buildChapterFile(ch);
  const file = `ch${ch.num}.json`;
  fs.writeFileSync(path.join(OUT_DIR, file), `${JSON.stringify(data, null, 2)}\n`);
  index.chapters.push({
    id: ch.num,
    file,
    title: data.title,
    shortTitle: ch.name,
    pairCount: data.pairs.length,
    verseCount: ch.verses.length,
  });
  totalPairs += data.pairs.length;
}

fs.writeFileSync(path.join(OUT_DIR, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);

console.log(`Generated ${index.chapters.length} chapters, ${totalPairs} pairs total`);
for (const c of index.chapters) {
  console.log(`  ch${c.id}: ${c.shortTitle} — ${c.pairCount} pairs (${c.verseCount} verses)`);
}
