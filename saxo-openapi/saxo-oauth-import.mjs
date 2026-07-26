#!/usr/bin/env node
/**
 * 手動で取得したトークンを data/saxo-oauth-tokens.json に保存
 *
 *   npm run saxo:oauth:import -- --refresh=xxx --access=yyy
 *   npm run saxo:oauth:import -- --file=tokens.json
 *   echo '{"access_token":"...","refresh_token":"...","expires_in":1200}' | npm run saxo:oauth:import
 */
import { readFile } from 'fs/promises';
import { importSaxoOAuthTokens_, saxoOAuthTokenPath_ } from './lib/saxo-oauth.mjs';

function argValue_(prefix) {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg ? arg.split('=').slice(1).join('=') : null;
}

async function readInput_() {
  const refresh = argValue_('--refresh');
  const access = argValue_('--access');
  if (refresh) {
    return {
      refresh_token: refresh,
      access_token: access || '',
      expires_in: Number(argValue_('--expires-in') || 1200),
    };
  }

  const fileArg = process.argv.find((a) => a.startsWith('--file='));
  if (fileArg) {
    const path = fileArg.split('=').slice(1).join('=');
    return JSON.parse(await readFile(path, 'utf8'));
  }
  if (process.stdin.isTTY) {
    throw new Error(
      '次のいずれかで実行してください:\n' +
        '  npm run saxo:oauth:import -- --refresh=REFRESH_TOKEN --access=ACCESS_TOKEN\n' +
        '  npm run saxo:oauth:import -- --file=tokens.json\n' +
        '  npm run saxo:oauth:exchange -- --code=xxxx  （code が残っている場合）'
    );
  }
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function main() {
  const json = await readInput_();
  const store = await importSaxoOAuthTokens_(json);
  console.log('=== Saxo OAuth インポート完了 ===');
  console.log(`保存先: ${saxoOAuthTokenPath_()}`);
  console.log(`access 期限: ${store.access_expires_at}`);
  console.log('接続テスト: npm run saxo:oauth:test');
}

main().catch((e) => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
