#!/usr/bin/env node
/**
 * 認可 code を access/refresh token に交換して data/saxo-oauth-tokens.json に保存
 *
 *   npm run saxo:oauth:exchange -- --code=09ccbf1c-ec0d-...
 */
import { exchangeSaxoAuthCode_, saxoOAuthTokenPath_ } from './lib/saxo-oauth.mjs';

function parseCode_() {
  const arg = process.argv.find((a) => a.startsWith('--code='));
  if (arg) return arg.split('=').slice(1).join('=');
  const urlArg = process.argv.find((a) => a.startsWith('--url='));
  if (urlArg) {
    const u = new URL(urlArg.split('=').slice(1).join('='));
    return u.searchParams.get('code');
  }
  return null;
}

async function main() {
  const code = parseCode_();
  if (!code) {
    console.error('使い方: npm run saxo:oauth:exchange -- --code=xxxx');
    console.error('  または: npm run saxo:oauth:exchange -- --url="http://localhost/...?code=xxxx"');
    process.exit(1);
  }
  const store = await exchangeSaxoAuthCode_(code);
  console.log('=== Saxo OAuth トークン保存完了 ===');
  console.log(`保存先: ${saxoOAuthTokenPath_()}`);
  console.log(`access 期限: ${store.access_expires_at}`);
  if (store.refresh_expires_at) console.log(`refresh 期限: ${store.refresh_expires_at}`);
  console.log('');
  console.log('接続テスト: npm run saxo:oauth:test');
}

main().catch((e) => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
