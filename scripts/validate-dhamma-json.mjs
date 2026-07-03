#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../public/dhamma/data');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}

const bad = [];
for (const file of walk(root)) {
  try {
    JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    bad.push(`${path.relative(root, file)}: ${err.message}`);
  }
}

if (bad.length) {
  console.error('Invalid dhamma JSON:');
  bad.forEach((line) => console.error(`  - ${line}`));
  process.exit(1);
}

console.log(`dhamma JSON OK (${walk(root).length} files)`);
