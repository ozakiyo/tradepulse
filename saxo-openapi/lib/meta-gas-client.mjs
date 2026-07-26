/**
 * G-SAXO → bitbank-gas-meta ウェブアプリ（クレジットカード不要）
 */

const META_FETCH_MS = Number(process.env.GSAXO_META_FETCH_MS) || 30_000;

function metaFetch_(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(META_FETCH_MS),
  });
}

export function metaWebAppUrl_() {
  return process.env.GSAXO_META_WEBAPP_URL?.trim() || '';
}

export function metaSecret_() {
  return process.env.GSAXO_META_SECRET?.trim() || '';
}

export function isMetaGasConfigured_() {
  return Boolean(metaWebAppUrl_() && metaSecret_());
}

async function parseGasJson_(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`META GAS 応答が JSON ではありません: ${text.slice(0, 200)}`);
  }
}

export async function callMetaGas_(payload) {
  const url = metaWebAppUrl_();
  const secret = metaSecret_();
  if (!url || !secret) {
    return {
      ok: false,
      skipped: true,
      reason: 'GSAXO_META_WEBAPP_URL / GSAXO_META_SECRET 未設定',
    };
  }

  const res = await metaFetch_(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, ...payload }),
    redirect: 'follow',
  });
  const json = await parseGasJson_(res);
  if (!json.ok) {
    throw new Error(json.error || `META GAS HTTP ${res.status}`);
  }
  return json;
}

export async function pingMetaGas_() {
  const url = metaWebAppUrl_();
  const secret = metaSecret_();
  if (!url || !secret) {
    throw new Error('GSAXO_META_WEBAPP_URL / GSAXO_META_SECRET 未設定');
  }

  const u = new URL(url);
  u.searchParams.set('action', 'ping');
  u.searchParams.set('secret', secret);

  const res = await metaFetch_(u.toString(), { redirect: 'follow' });
  const json = await parseGasJson_(res);
  if (!json.ok) {
    throw new Error(json.error || `META GAS ping failed (${res.status})`);
  }
  return { title: json.title, url };
}
