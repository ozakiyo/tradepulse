import { reloadRootEnv_ } from './env.mjs';
import { isEmailConfigured_, sendAlertEmail_ } from './email-notify.mjs';
import { gsaxoModeLabel_ } from './gsaxo-instruments.mjs';
import { isLineConfigured_, sendLinePush_ } from './line-notify.mjs';

const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000;

function formatAlertTs_() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date());
}

export function gsaxoEmailAlertEnabled_() {
  reloadRootEnv_();
  if (!isEmailConfigured_()) return false;
  const raw = process.env.GSAXO_EMAIL_ALERT;
  if (raw != null && String(raw).trim() !== '' && String(raw).toLowerCase() === 'false') {
    return false;
  }
  return true;
}

export function gsaxoLineAlertEnabled_() {
  reloadRootEnv_();
  if (!isLineConfigured_()) return false;
  const raw = process.env.GSAXO_LINE_ALERT;
  if (raw != null && String(raw).trim() !== '' && String(raw).toLowerCase() === 'false') {
    return false;
  }
  return true;
}

function alertCooldownMs_() {
  const v = Number(process.env.GSAXO_ALERT_COOLDOWN_MS || process.env.GSAXO_LINE_ALERT_COOLDOWN_MS);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_COOLDOWN_MS;
}

function buildFingerprint_(issues) {
  return issues.join('\n').slice(0, 800);
}

function buildAlertMessage_({ issues, cfg, fatal }) {
  const mode = cfg?.dryRun ? 'DRY' : 'LIVE';
  const lines = [
    `G-SAXO エラー [${mode}]`,
    `時刻: ${formatAlertTs_()}`,
    `mode: ${gsaxoModeLabel_(cfg || {})}`,
  ];
  if (fatal) lines.push('種別: 実行全体の失敗');
  lines.push('');
  const show = issues.slice(0, 8);
  lines.push(...show);
  if (issues.length > 8) lines.push(`…他 ${issues.length - 8} 件`);
  lines.push('', '確認: pm2 logs gsaxo --lines 30');
  return lines.join('\n');
}

function readAlertState_(state) {
  return state.alertNotify || state.lineAlert || {};
}

async function dispatchAlert_({ subject, text, log }) {
  const sent = [];
  if (gsaxoEmailAlertEnabled_()) {
    try {
      await sendAlertEmail_({ subject, text });
      sent.push('email');
    } catch (e) {
      log(`メール通知失敗: ${e.message || e}`);
    }
  }
  if (gsaxoLineAlertEnabled_()) {
    try {
      await sendLinePush_(text);
      sent.push('line');
    } catch (e) {
      log(`LINE 通知失敗: ${e.message || e}`);
    }
  }
  return sent;
}

/**
 * エラー検知時にメール/LINE 通知（同一内容はクールダウン内は再送しない）
 */
export async function maybeGsaxoAlert_({ errors = [], fatalError, state, cfg, log }) {
  if (!gsaxoEmailAlertEnabled_() && !gsaxoLineAlertEnabled_()) return;

  const issues = [];
  if (fatalError) issues.push(`致命的: ${fatalError}`);
  for (const e of errors) {
    if (e) issues.push(String(e));
  }

  if (!issues.length) {
    if (state.alertNotify?.lastFingerprint || state.lineAlert?.lastFingerprint) {
      state.alertNotify = { lastFingerprint: '', lastSentAt: null };
      delete state.lineAlert;
    }
    return;
  }

  const fingerprint = buildFingerprint_(issues);
  const prev = readAlertState_(state);
  const cooldown = alertCooldownMs_();
  const lastSent = prev.lastSentAt ? new Date(prev.lastSentAt).getTime() : 0;
  const same = prev.lastFingerprint === fingerprint;
  if (same && lastSent && Date.now() - lastSent < cooldown) return;

  const text = buildAlertMessage_({ issues, cfg, fatal: !!fatalError });
  const mode = cfg?.dryRun ? 'DRY' : 'LIVE';
  const subject = `[G-SAXO ${mode}] エラー ${formatAlertTs_()}`;
  const sent = await dispatchAlert_({ subject, text, log });
  if (sent.length) {
    state.alertNotify = {
      lastFingerprint: fingerprint,
      lastSentAt: new Date().toISOString(),
    };
    delete state.lineAlert;
    log(`エラー通知を送信しました (${sent.join(', ')})`);
  }
}

/** @deprecated maybeGsaxoAlert_ を使用 */
export const maybeGsaxoLineAlert_ = maybeGsaxoAlert_;
