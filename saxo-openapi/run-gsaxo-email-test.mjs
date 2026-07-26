#!/usr/bin/env node
import { gsaxoEmailAlertEnabled_, gsaxoLineAlertEnabled_ } from './lib/gsaxo-alert.mjs';
import { isEmailConfigured_, sendAlertEmail_ } from './lib/email-notify.mjs';

async function main() {
  console.log('=== G-SAXO メール通知テスト ===');
  console.log(`メール設定: ${isEmailConfigured_() ? 'あり' : 'なし'}`);
  console.log(`GSAXO_EMAIL_ALERT: ${gsaxoEmailAlertEnabled_() ? '有効' : '無効'}`);
  console.log(`GSAXO_LINE_ALERT: ${gsaxoLineAlertEnabled_() ? '有効' : '無効'}`);
  if (!isEmailConfigured_()) {
    console.error('ERROR: .env に GSAXO_ALERT_EMAIL と SMTP_* を設定してください');
    process.exit(1);
  }
  const ts = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  await sendAlertEmail_({
    subject: `[G-SAXO] メール通知テスト ${ts}`,
    text: ['G-SAXO メール通知テスト', `時刻: ${ts}`, 'エラー検知通知の疎通確認です。'].join('\n'),
  });
  console.log('送信 OK');
}

main().catch((e) => {
  const msg = e.message || String(e);
  console.error('ERROR:', msg);
  if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND/.test(msg)) {
    console.error('');
    console.error('SMTP サーバーに接続できません（パスワード誤りではありません）。');
    console.error('・Mac の回線/Wi-Fi が 587 番をブロックしていることが多いです');
    console.error('・G-SAXO 本番は ConoHa から送るため、サーバー上で gsaxo:email:test を試してください');
    console.error('・ダメなら .env で SMTP_PORT=465 / SMTP_SECURE=true を試してください');
  }
  process.exit(1);
});
