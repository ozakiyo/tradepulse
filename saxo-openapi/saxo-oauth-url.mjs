#!/usr/bin/env node
import { buildSaxoAuthorizeUrl_, inferSaxoAuthBaseUrl_ } from './lib/saxo-oauth.mjs';

const { url, state } = buildSaxoAuthorizeUrl_();
console.log('=== Saxo OAuth 認証URL ===');
console.log(`環境: ${inferSaxoAuthBaseUrl_()}`);
console.log(`state: ${state}`);
console.log('');
console.log(url);
console.log('');
console.log('ログイン後、リダイレクトURLの code= を控えて:');
console.log('  npm run saxo:oauth:exchange -- --code=xxxx');
