#!/usr/bin/env node
/**
 * clasp push/pull をプロジェクト別に実行
 *   npm run gas:push -- j
 *   npm run gas:pull -- j
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const projectsPath = path.join(__dirname, 'projects.json');

function loadProjects() {
  if (!fs.existsSync(projectsPath)) {
    console.error('gas-clasp/projects.json がありません');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(projectsPath, 'utf8')).projects || [];
}

function findProject(projects, label) {
  const q = String(label || '').trim().toLowerCase();
  if (!q) return null;
  return (
    projects.find((p) => String(p.label).toLowerCase() === q) ||
    projects.find((p) => String(p.dir).toLowerCase().includes(q)) ||
    projects.find((p) => String(p.label).toLowerCase().startsWith(q))
  );
}

function claspBin() {
  return path.join(root, 'node_modules', '.bin', 'clasp');
}

function runClasp(dir, args) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) {
    console.error('ディレクトリがありません: ' + dir);
    process.exit(1);
  }
  const cmd = claspBin();
  console.log('$ clasp ' + args.join(' ') + '  (in ' + dir + ')');
  const res = spawnSync(cmd, args, { cwd: abs, stdio: 'inherit', env: process.env });
  if (res.status !== 0) process.exit(res.status || 1);
}

const [cmd, label] = process.argv.slice(2);
const projects = loadProjects();

if (!cmd || !label) {
  console.log('使い方: npm run gas:push -- <label>');
  console.log('');
  projects.forEach((p) => console.log('  ' + p.label + '\t' + p.dir));
  process.exit(label ? 1 : 0);
}

const proj = findProject(projects, label);
if (!proj) {
  console.error('不明なラベル: ' + label);
  process.exit(1);
}

if (cmd === 'push') {
  runClasp(proj.dir, ['push', '--force']);
} else if (cmd === 'pull') {
  runClasp(proj.dir, ['pull']);
} else if (cmd === 'open') {
  runClasp(proj.dir, ['open']);
} else {
  console.error('不明なコマンド: ' + cmd + ' (push|pull|open)');
  process.exit(1);
}
