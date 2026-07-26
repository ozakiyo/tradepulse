#!/usr/bin/env node
import { getSessionUser, listAccounts, resolveSaxoConfig } from './lib/saxo.mjs';
import { inferSaxoAuthBaseUrl_, saxoOAuthStatus_ } from './lib/saxo-oauth.mjs';

async function main() {
  const status = await saxoOAuthStatus_();
  console.log('=== Saxo OAuth 接続テスト ===');
  console.log(`認証: ${inferSaxoAuthBaseUrl_()}`);
  console.log(`token file: access_valid=${status.access_valid} saved_at=${status.saved_at || '—'}`);

  const cfg = await resolveSaxoConfig();
  console.log(`API: ${cfg.baseUrl}`);
  console.log(`auth: ${cfg.authMode}`);

  const user = await getSessionUser(cfg);
  console.log(`ユーザー: ${user?.Name || user?.UserId || 'OK'}`);

  const accounts = await listAccounts(cfg);
  const active = accounts.filter((a) => a.Active !== false);
  console.log(`口座数: ${active.length}`);
  for (const a of active.slice(0, 3)) {
    console.log(`  - ${a.AccountId || a.AccountKey} ${a.Currency || ''} trial=${!!a.IsTrialAccount}`);
  }
  console.log('OK');
}

main().catch((e) => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
