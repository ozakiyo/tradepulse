#!/usr/bin/env node
/**
 * ダンマ指針アプリ専用の静的ファイルサーバー（依存パッケージなし）
 * G-SAXO / articleappNode とは別 pm2 プロセス・別ポートで稼働
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.DHAMMA_ROOT || path.join(__dirname, '../../public/dhamma');
const PORT = Number(process.env.DHAMMA_PORT || 3053);
const HOST = process.env.DHAMMA_HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const rel = decoded === '/' ? '/index.html' : decoded;
  const resolved = path.normalize(path.join(ROOT, rel));
  if (!resolved.startsWith(path.normalize(ROOT))) return null;
  return resolved;
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (!req.url) return send(res, 400, 'Bad Request');

  const filePath = safePath(req.url);
  if (!filePath) return send(res, 403, 'Forbidden');

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') return send(res, 404, 'Not Found');
      return send(res, 500, 'Internal Server Error');
    }
    const ext = path.extname(filePath);
    send(res, 200, data, MIME[ext] || 'application/octet-stream');
  });
});

server.listen(PORT, HOST, () => {
  console.log(`✅ Dhamma app: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/`);
  console.log(`   root: ${ROOT}`);
});
