#!/usr/bin/env node
import { gsaxoLineAlertEnabled_ } from './lib/gsaxo-alert.mjs';
import { isLineConfigured_, sendLinePush_ } from './lib/line-notify.mjs';

async function main() {
  console.log('=== G-SAXO LINE テスト ===');
  console.log(`LINE設定: ${isLineConfigured_() ? 'あり' : 'なし'}`);
  console.log(`GSAXO_LINE_ALERT: ${gsaxoLineAlertEnabled_() ? '有効' : '無効'}`);
  if (!isLineConfigured_()) {
    console.error('ERROR: .env に LINE_CHANNEL_ACCESS_TOKEN と LINE_USER_ID を設定してください');
    process.exit(1);
  }
  const text = [
    '✅ G-SAXO LINE テスト',
    `時刻: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`,
    'エラー検知通知の疎通確認です。',
  ].join('\n');
  await sendLinePush_(text);
  console.log('送信 OK');
}

main().catch((e) => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
