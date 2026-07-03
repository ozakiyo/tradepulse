import nodemailer from 'nodemailer';
import { reloadRootEnv_ } from './env.mjs';

export function isEmailConfigured_() {
  reloadRootEnv_();
  return Boolean(
    String(process.env.GSAXO_ALERT_EMAIL || '').trim() &&
      String(process.env.SMTP_HOST || '').trim() &&
      String(process.env.SMTP_USER || '').trim() &&
      String(process.env.SMTP_PASS || '').trim()
  );
}

function smtpConfig_() {
  reloadRootEnv_();
  const port = Number(process.env.SMTP_PORT || 587);
  const secure =
    String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
  return {
    host: String(process.env.SMTP_HOST || '').trim(),
    port,
    secure,
    requireTLS: !secure,
    connectionTimeout: 15000,
    auth: {
      user: String(process.env.SMTP_USER || '').trim(),
      pass: String(process.env.SMTP_PASS || '').trim(),
    },
  };
}

export async function sendAlertEmail_({ subject, text }) {
  if (!isEmailConfigured_()) {
    return { sent: false, reason: 'GSAXO_ALERT_EMAIL / SMTP_* 未設定' };
  }
  const to = String(process.env.GSAXO_ALERT_EMAIL || '').trim();
  const from =
    String(process.env.SMTP_FROM || '').trim() ||
    `G-SAXO <${String(process.env.SMTP_USER || '').trim()}>`;
  const transporter = nodemailer.createTransport(smtpConfig_());
  await transporter.sendMail({
    from,
    to,
    subject: String(subject).slice(0, 200),
    text: String(text).slice(0, 4800),
  });
  return { sent: true };
}
