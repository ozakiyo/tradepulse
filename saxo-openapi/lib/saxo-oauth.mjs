import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { reloadRootEnv_ } from './env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TOKEN_PATH = join(__dirname, '..', '..', 'data', 'saxo-oauth-tokens.json');
const REFRESH_MARGIN_MS = 60_000;

export function saxoOAuthTokenPath_() {
  return process.env.SAXO_OAUTH_TOKEN_PATH?.trim() || DEFAULT_TOKEN_PATH;
}

export function isSaxoOAuthMode_() {
  reloadRootEnv_();
  const key = process.env.SAXO_APP_KEY?.trim();
  const secret = process.env.SAXO_APP_SECRET?.trim();
  return !!(key && secret);
}

export function inferSaxoAuthBaseUrl_() {
  reloadRootEnv_();
  const explicit = process.env.SAXO_AUTH_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const api = (process.env.SAXO_API_BASE || '').toLowerCase();
  if (api.includes('/sim/')) return 'https://sim.logonvalidation.net';
  return 'https://live.logonvalidation.net';
}

export function loadSaxoOAuthEnv_() {
  reloadRootEnv_();
  const appKey = process.env.SAXO_APP_KEY?.trim() || '';
  const appSecret = process.env.SAXO_APP_SECRET?.trim() || '';
  const redirectUri = process.env.SAXO_REDIRECT_URI?.trim() || '';
  const authBaseUrl = inferSaxoAuthBaseUrl_();
  if (!appKey || !appSecret) {
    throw new Error('SAXO_APP_KEY / SAXO_APP_SECRET が未設定です（OAuth モード）');
  }
  if (!redirectUri) {
    throw new Error('SAXO_REDIRECT_URI が未設定です（Developer Portal の AppUrl と一致）');
  }
  return { appKey, appSecret, redirectUri, authBaseUrl };
}

function randomState_() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function buildSaxoAuthorizeUrl_(state = randomState_()) {
  const { appKey, redirectUri, authBaseUrl } = loadSaxoOAuthEnv_();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: appKey,
    redirect_uri: redirectUri,
    state,
  });
  return { url: `${authBaseUrl}/authorize?${params}`, state };
}

async function loadTokenStore_() {
  const path = saxoOAuthTokenPath_();
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

async function saveTokenStore_(store) {
  const path = saxoOAuthTokenPath_();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(store, null, 2), 'utf8');
}

function applyTokenResponse_(prev, json) {
  const now = Date.now();
  const accessExpiresIn = Number(json.expires_in || 1200);
  const refreshExpiresIn = Number(json.refresh_token_expires_in || 0);
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token || prev?.refresh_token || '',
    token_type: json.token_type || 'Bearer',
    saved_at: new Date(now).toISOString(),
    access_expires_at: new Date(now + accessExpiresIn * 1000).toISOString(),
    refresh_expires_at: refreshExpiresIn
      ? new Date(now + refreshExpiresIn * 1000).toISOString()
      : prev?.refresh_expires_at || null,
  };
}

async function postToken_(body) {
  const { appKey, appSecret, authBaseUrl } = loadSaxoOAuthEnv_();
  const basic = Buffer.from(`${appKey}:${appSecret}`).toString('base64');
  const res = await fetch(`${authBaseUrl}/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(body).toString(),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.error_description || json?.Message || json?.error || text.slice(0, 400);
    throw new Error(`Saxo OAuth HTTP ${res.status}: ${msg}`);
  }
  return json;
}

export async function exchangeSaxoAuthCode_(code) {
  const { redirectUri } = loadSaxoOAuthEnv_();
  const json = await postToken_({
    grant_type: 'authorization_code',
    code: String(code).trim(),
    redirect_uri: redirectUri,
  });
  const prev = await loadTokenStore_();
  const store = applyTokenResponse_(prev, json);
  await saveTokenStore_(store);
  return store;
}

export async function refreshSaxoAccessToken_() {
  const { redirectUri } = loadSaxoOAuthEnv_();
  const prev = await loadTokenStore_();
  if (!prev?.refresh_token) {
    throw new Error(
      'refresh_token がありません。npm run saxo:oauth:exchange で code を交換するか、' +
        'npm run saxo:oauth:import でトークンを保存してください。'
    );
  }
  const json = await postToken_({
    grant_type: 'refresh_token',
    refresh_token: prev.refresh_token,
    redirect_uri: redirectUri,
  });
  const store = applyTokenResponse_(prev, json);
  await saveTokenStore_(store);
  return store;
}

export async function importSaxoOAuthTokens_(tokens) {
  const prev = await loadTokenStore_();
  const now = Date.now();
  const store = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || prev?.refresh_token || '',
    token_type: tokens.token_type || 'Bearer',
    saved_at: new Date(now).toISOString(),
    access_expires_at: tokens.access_expires_at
      ? tokens.access_expires_at
      : new Date(now + Number(tokens.expires_in || 1200) * 1000).toISOString(),
    refresh_expires_at: tokens.refresh_expires_at || prev?.refresh_expires_at || null,
  };
  if (!store.refresh_token) {
    throw new Error('refresh_token が必要です');
  }
  await saveTokenStore_(store);
  return store;
}

function accessTokenValid_(store) {
  if (!store?.access_token || !store?.access_expires_at) return false;
  const expires = new Date(store.access_expires_at).getTime();
  return expires - Date.now() > REFRESH_MARGIN_MS;
}

export async function getSaxoOAuthAccessToken_() {
  const store = await loadTokenStore_();
  if (accessTokenValid_(store)) return store.access_token;
  const refreshed = await refreshSaxoAccessToken_();
  return refreshed.access_token;
}

export async function saxoOAuthStatus_() {
  const store = await loadTokenStore_();
  if (!store) return { ok: false, reason: 'token file missing' };
  return {
    ok: !!store.refresh_token,
    authBaseUrl: inferSaxoAuthBaseUrl_(),
    saved_at: store.saved_at,
    access_expires_at: store.access_expires_at,
    refresh_expires_at: store.refresh_expires_at,
    access_valid: accessTokenValid_(store),
  };
}
