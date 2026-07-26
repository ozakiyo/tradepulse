import { reloadRootEnv_ } from './env.mjs';

export function isLineConfigured_() {
  reloadRootEnv_();
  return Boolean(
    String(process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim() &&
      String(process.env.LINE_USER_ID || '').trim()
  );
}

export async function sendLinePush_(text) {
  reloadRootEnv_();
  const token = String(process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();
  const userId = String(process.env.LINE_USER_ID || '').trim();
  if (!token || !userId) {
    return { sent: false, reason: 'LINE_CHANNEL_ACCESS_TOKEN / LINE_USER_ID 未設定' };
  }
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text: String(text).slice(0, 4800) }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LINE API ${res.status}: ${body.slice(0, 200)}`);
  }
  return { sent: true };
}
