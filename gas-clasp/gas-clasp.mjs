#!/usr/bin/env node
/**
 * clasp 一括操作（16 GAS プロジェクト）
 *
 * 使い方:
 *   node gas-clasp/gas-clasp.mjs setup
 *   node gas-clasp/gas-clasp.mjs push [dir|label]
 *   node gas-clasp/gas-clasp.mjs push-all
 *   node gas-clasp/gas-clasp.mjs pull [dir|label]
 *   node gas-clasp/gas-clasp.mjs status
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(__dirname, 'projects.json');
const EXAMPLE_PATH = path.join(__dirname, 'projects.example.json');
const CLASPIGNORE_SRC = path.join(__dirname, '.claspignore');

function loadProjects() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('gas-clasp/projects.json がありません。');
    console.error('  cp gas-clasp/projects.example.json gas-clasp/projects.json');
    console.error('  各 scriptId を Apps Script の「プロジェクトの設定」から入力してください。');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  if (!Array.isArray(data.projects)) {
    throw new Error('projects.json の形式が不正です');
  }
  return data.projects;
}

function normalizeGasKey_(key) {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
}

function findProject(projects, key) {
  if (!key) return null;
  const k = normalizeGasKey_(key);
  const kCompact = k.replace(/-/g, '');

  var byLabel = projects.find(function (p) {
    return normalizeGasKey_(p.label) === k;
  });
  if (byLabel) return byLabel;

  var byDir = projects.find(function (p) {
    const dir = normalizeGasKey_(p.dir);
    const dirTail = dir.split('/').pop() || dir;
    return dir === k || dirTail === k || dir.endsWith('/' + k) || dir.endsWith(k);
  });
  if (byDir) return byDir;

  if (k.length < 3) return null;

  return projects.find(function (p) {
    const dir = normalizeGasKey_(p.dir);
    const label = normalizeGasKey_(p.label);
    const dirTail = dir.split('/').pop() || dir;
    const dirCompact = dirTail.replace(/-/g, '');
    const labelCompact = label.replace(/-/g, '');
    return (
      dirCompact === kCompact ||
      labelCompact === kCompact ||
      dirCompact.endsWith(kCompact)
    );
  }) || null;
}

function claspBin() {
  return path.join(ROOT, 'node_modules', '.bin', 'clasp');
}

function run(cmd, cwd) {
  console.log('\n$ ' + cmd + (cwd ? '  (in ' + path.relative(ROOT, cwd) + ')' : ''));
  execSync(cmd, { cwd: cwd || ROOT, stdio: 'inherit', env: process.env });
}

function writeClaspJson(dir, scriptId) {
  const claspPath = path.join(dir, '.clasp.json');
  fs.writeFileSync(
    claspPath,
    JSON.stringify({ scriptId, rootDir: '.' }, null, 2) + '\n'
  );
}

function copyClaspignore(dir) {
  const dest = path.join(dir, '.claspignore');
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(CLASPIGNORE_SRC, dest);
  }
}

function ensureAppsscript(dir) {
  const appPath = path.join(dir, 'appsscript.json');
  if (fs.existsSync(appPath)) return;
  fs.writeFileSync(
    appPath,
    JSON.stringify(
      {
        timeZone: 'Asia/Tokyo',
        dependencies: {},
        exceptionLogging: 'STACKDRIVER',
        runtimeVersion: 'V8',
      },
      null,
      2
    ) + '\n'
  );
  console.log('  created appsscript.json');
}

function cmdSetup() {
  const projects = loadProjects();
  let ok = 0;
  let skip = 0;
  for (const p of projects) {
    const dir = path.join(ROOT, p.dir);
    if (!fs.existsSync(dir)) {
      console.warn('SKIP (フォルダなし): ' + p.dir);
      skip += 1;
      continue;
    }
    if (!p.scriptId || !String(p.scriptId).trim()) {
      console.warn('SKIP (scriptId 未設定): ' + p.label + ' → ' + p.dir);
      skip += 1;
      continue;
    }
    ensureAppsscript(dir);
    writeClaspJson(dir, String(p.scriptId).trim());
    copyClaspignore(dir);
    console.log('OK: ' + p.label + ' → ' + p.dir);
    ok += 1;
  }
  console.log('\nsetup 完了: ' + ok + ' 件 / skip ' + skip + ' 件');
}

function cmdPushOne(project) {
  const dir = path.join(ROOT, project.dir);
  const clasp = claspBin();
  if (!fs.existsSync(path.join(dir, '.clasp.json'))) {
    throw new Error(project.dir + ' に .clasp.json がありません。先に npm run gas:setup を実行してください。');
  }
  run('"' + clasp + '" push --force', dir);
}

function cmdPullOne(project) {
  const dir = path.join(ROOT, project.dir);
  const clasp = claspBin();
  if (!fs.existsSync(path.join(dir, '.clasp.json'))) {
    throw new Error(project.dir + ' に .clasp.json がありません。先に npm run gas:setup を実行してください。');
  }
  run('"' + clasp + '" pull', dir);
}

function cmdPushAll() {
  const projects = loadProjects().filter((p) => p.scriptId && String(p.scriptId).trim());
  if (!projects.length) {
    console.error('scriptId が設定されたプロジェクトがありません。');
    process.exit(1);
  }
  let fail = 0;
  for (const p of projects) {
    try {
      console.log('\n=== push: ' + p.label + ' (' + p.dir + ') ===');
      cmdPushOne(p);
    } catch (e) {
      console.error('FAILED: ' + p.label + ' — ' + (e.message || e));
      fail += 1;
    }
  }
  console.log('\npush-all 完了' + (fail ? '（失敗 ' + fail + ' 件）' : ''));
  if (fail) process.exit(1);
}

function cmdStatus() {
  const projects = loadProjects();
  console.log('dir\tlabel\tscriptId\t.clasp.json');
  for (const p of projects) {
    const claspPath = path.join(ROOT, p.dir, '.clasp.json');
    const has = fs.existsSync(claspPath) ? 'yes' : 'no';
    const id = p.scriptId ? String(p.scriptId).slice(0, 12) + '…' : '(未設定)';
    console.log([p.dir, p.label, id, has].join('\t'));
  }
}

function cmdLogin() {
  run('"' + claspBin() + '" login');
}

const [command, arg] = process.argv.slice(2);

if (!command || command === 'help' || command === '-h') {
  console.log(`clasp 一括ツール

  npm run gas:login          Google ログイン（初回のみ）
  npm run gas:setup          projects.json → 各 .clasp.json 生成
  npm run gas:status         設定状況一覧
  npm run gas:push -- meta   1プロジェクトだけ push（dir または label）
  npm run gas:push:all       全プロジェクト push
  npm run gas:pull -- g-fx   1プロジェクト pull

scriptId の見つけ方:
  Apps Script → プロジェクトの設定 → スクリプト ID
`);
  process.exit(0);
}

try {
  if (command === 'login') cmdLogin();
  else if (command === 'setup') cmdSetup();
  else if (command === 'status') cmdStatus();
  else if (command === 'push-all') cmdPushAll();
  else if (command === 'push') {
    const projects = loadProjects();
    const p = findProject(projects, arg);
    if (!p) {
      console.error('プロジェクトが見つかりません: ' + arg);
      process.exit(1);
    }
    cmdPushOne(p);
  } else if (command === 'pull') {
    const projects = loadProjects();
    const p = findProject(projects, arg);
    if (!p) {
      console.error('プロジェクトが見つかりません: ' + arg);
      process.exit(1);
    }
    cmdPullOne(p);
  } else {
    console.error('不明なコマンド: ' + command);
    process.exit(1);
  }
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
