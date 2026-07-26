import { reloadRootEnv_ } from './env.mjs';
import { getSaxoOAuthAccessToken_, isSaxoOAuthMode_, refreshSaxoAccessToken_ } from './saxo-oauth.mjs';

reloadRootEnv_();

const DEFAULT_BASE = 'https://gateway.saxobank.com/sim/openapi';

export function loadSaxoConfig() {
  reloadRootEnv_();
  const oauth = isSaxoOAuthMode_();
  const token = process.env.SAXO_ACCESS_TOKEN?.trim() || '';
  if (!oauth && !token) {
    throw new Error(
      'Saxo 認証が未設定です。\n' +
        '  OAuth: SAXO_APP_KEY, SAXO_APP_SECRET, SAXO_REDIRECT_URI + data/saxo-oauth-tokens.json\n' +
        '  SIM 24h: SAXO_ACCESS_TOKEN（https://developer.saxobank.com/openapi/token）'
    );
  }
  const baseUrl = (process.env.SAXO_API_BASE || DEFAULT_BASE).replace(/\/$/, '');
  return {
    token,
    authMode: oauth ? (baseUrl.includes('/sim/') ? 'oauth-sim' : 'oauth-live') : 'token-24h',
    baseUrl,
    accountKey: process.env.SAXO_ACCOUNT_KEY?.trim() || '',
    symbol: (process.env.SAXO_SYMBOL || 'EURUSD').trim().toUpperCase(),
    assetTypes: process.env.SAXO_ASSET_TYPES?.trim() || '',
    orderMode: (process.env.SAXO_ORDER_MODE || 'precheck').trim().toLowerCase(),
    orderAmount: Number(process.env.SAXO_ORDER_AMOUNT || 0),
    instrumentUic: process.env.SAXO_INSTRUMENT_UIC ? Number(process.env.SAXO_INSTRUMENT_UIC) : 0,
    instrumentAssetType: process.env.SAXO_INSTRUMENT_ASSET_TYPE?.trim() || '',
  };
}

/** OAuth 時は access token を解決して cfg.token にセット */
export async function resolveSaxoConfig(base = loadSaxoConfig()) {
  const cfg = { ...base };
  if (isSaxoOAuthMode_()) {
    cfg.token = await getSaxoOAuthAccessToken_();
  }
  return cfg;
}

function sleepMs_(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function saxoRequest(
  cfg,
  method,
  path,
  body,
  { retried = false, rateLimitAttempt = 0, serverErrorAttempt = 0 } = {}
) {
  const url = `${cfg.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/json',
    },
  };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (res.status === 401 && isSaxoOAuthMode_() && !retried) {
    await refreshSaxoAccessToken_();
    const next = await resolveSaxoConfig({ ...cfg, token: '' });
    return saxoRequest(next, method, path, body, { retried: true });
  }

  if (res.status === 429 && rateLimitAttempt < 4) {
    const wait = 1500 * 2 ** rateLimitAttempt;
    await sleepMs_(wait);
    return saxoRequest(cfg, method, path, body, {
      retried,
      rateLimitAttempt: rateLimitAttempt + 1,
      serverErrorAttempt,
    });
  }

  if (res.status >= 500 && res.status < 600 && serverErrorAttempt < 3) {
    const wait = 2000 * 2 ** serverErrorAttempt;
    await sleepMs_(wait);
    return saxoRequest(cfg, method, path, body, {
      retried,
      rateLimitAttempt,
      serverErrorAttempt: serverErrorAttempt + 1,
    });
  }

  if (!res.ok) {
    const msg = json?.Message || json?.ErrorInfo?.Message || text.slice(0, 400);
    throw new Error(`Saxo HTTP ${res.status} ${method} ${path}: ${msg}`);
  }
  return json;
}

export async function getSessionUser(cfg) {
  return saxoRequest(cfg, 'GET', '/port/v1/users/me');
}

export async function listAccounts(cfg) {
  const data = await saxoRequest(cfg, 'GET', '/port/v1/accounts/me');
  return data?.Data || [];
}

export async function resolveAccountKey(cfg) {
  if (cfg.accountKey) return cfg.accountKey;
  const accounts = await listAccounts(cfg);
  const active = accounts.filter((a) => a.Active !== false);
  if (!active.length) throw new Error('有効な口座が /port/v1/accounts/me にありません');
  const pick =
    active.find((a) => !a.IsTrialAccount) ||
    active.find((a) => a.IsTrialAccount) ||
    active[0];
  return pick.AccountKey;
}

export async function searchInstrument(cfg, keywords, assetTypes) {
  const params = new URLSearchParams({ Keywords: keywords, $top: '10' });
  if (assetTypes) params.set('AssetTypes', assetTypes);
  const data = await saxoRequest(cfg, 'GET', `/ref/v1/instruments?${params}`);
  const rows = data?.Data || [];
  const upper = keywords.toUpperCase();
  const sym = (r) => String(r.Symbol || '').toUpperCase();
  const exact = rows.find((r) => sym(r) === upper);
  if (exact) return exact;
  const prefix = rows.find((r) => sym(r).startsWith(upper));
  if (prefix) return prefix;
  const contains = rows.find((r) => sym(r).includes(upper));
  return contains || rows[0] || null;
}

/** G-SAXO 等: 銘柄定義テーブルから UIC / AssetType を解決 */
export async function resolveInstrumentByDef(cfg, accountKey, def) {
  let row = await searchInstrument(cfg, def.searchKeyword, def.assetTypes);
  if (!row && def.searchFallbacks) {
    for (const kw of def.searchFallbacks) {
      row = await searchInstrument(cfg, kw, def.assetTypes);
      if (row) break;
    }
  }
  if (!row && def.assetTypes) {
    row = await searchInstrument(cfg, def.searchKeyword, '');
  }
  if (!row && def.fallbackUic) {
    const assetType = String(def.assetTypes || '').split(',')[0].trim();
    if (assetType) {
      try {
        const details = await getInstrumentDetails(cfg, def.fallbackUic, assetType, accountKey);
        return {
          pairId: def.id,
          label: def.label,
          category: def.category,
          uic: def.fallbackUic,
          assetType: details.AssetType || assetType,
          symbol: details.Symbol || def.searchKeyword,
          details,
        };
      } catch {
        /* search / fallbackUic とも失敗 */
      }
    }
  }
  if (!row) {
    throw new Error(
      `銘柄 "${def.searchKeyword}" (${def.label}) が見つかりません。口座の取扱銘柄を確認してください。`
    );
  }

  const uic = row.Identifier ?? row.Uic;
  const assetType = row.AssetType;
  const details = await getInstrumentDetails(cfg, uic, assetType, accountKey);
  return {
    pairId: def.id,
    label: def.label,
    category: def.category,
    uic,
    assetType,
    symbol: row.Symbol || details.Symbol || def.searchKeyword,
    details,
  };
}

export async function getInstrumentDetails(cfg, uic, assetType, accountKey) {
  const params = new URLSearchParams();
  if (accountKey) params.set('AccountKey', accountKey);
  return saxoRequest(cfg, 'GET', `/ref/v1/instruments/details/${uic}/${assetType}?${params}`);
}

export async function resolveInstrument(cfg, accountKey) {
  if (cfg.instrumentUic && cfg.instrumentAssetType) {
    const details = await getInstrumentDetails(
      cfg,
      cfg.instrumentUic,
      cfg.instrumentAssetType,
      accountKey
    );
    return {
      uic: cfg.instrumentUic,
      assetType: cfg.instrumentAssetType,
      symbol: details.Symbol || cfg.symbol,
      details,
    };
  }

  let row = await searchInstrument(cfg, cfg.symbol, cfg.assetTypes);
  if (!row && cfg.assetTypes) {
    row = await searchInstrument(cfg, cfg.symbol, '');
  }
  if (!row) {
    throw new Error(
      `銘柄 "${cfg.symbol}" が見つかりません。SAXO_SYMBOL または SAXO_INSTRUMENT_UIC / SAXO_INSTRUMENT_ASSET_TYPE を確認してください。`
    );
  }

  const uic = row.Identifier ?? row.Uic;
  const assetType = row.AssetType;
  const details = await getInstrumentDetails(cfg, uic, assetType, accountKey);
  return {
    uic,
    assetType,
    symbol: row.Symbol || details.Symbol || cfg.symbol,
    details,
  };
}

export async function getInfoPrice(cfg, accountKey, uic, assetType) {
  const params = new URLSearchParams({
    AccountKey: accountKey,
    Uic: String(uic),
    AssetType: assetType,
  });
  return saxoRequest(cfg, 'GET', `/trade/v1/infoprices?${params}`);
}

/** 指数CFD 等: infoprices が NoAccess のとき Chart API で直近足を返す */
export async function getChartQuote(cfg, uic, assetType, horizon = 5) {
  const params = new URLSearchParams({
    AssetType: assetType,
    Uic: String(uic),
    Horizon: String(horizon),
    Count: '1',
    FieldGroups: 'Data',
  });
  const data = await saxoRequest(cfg, 'GET', `/chart/v3/charts?${params}`);
  const bar = data?.Data?.[0];
  if (!bar) return null;
  const bid = bar.CloseBid ?? bar.Close;
  const ask = bar.CloseAsk ?? bar.Close;
  const mid = bar.CloseMid ?? (bid != null && ask != null ? (bid + ask) / 2 : null);
  return { Bid: bid, Ask: ask, Mid: mid, Time: bar.Time, Source: 'chart' };
}

/** infoprices → Chart の順でクォート取得 */
export async function getMarketQuote(cfg, accountKey, uic, assetType) {
  try {
    const price = await getInfoPrice(cfg, accountKey, uic, assetType);
    const quote = price.Quote || price;
    const bid = quote.Bid ?? quote.BidPrice;
    const ask = quote.Ask ?? quote.AskPrice;
    const noAccess =
      quote.PriceTypeBid === 'NoAccess' || quote.PriceTypeAsk === 'NoAccess';
    if (!noAccess && (bid != null || ask != null || quote.Mid != null)) {
      return { quote, source: 'infoprice' };
    }
    const chartQ = await getChartQuote(cfg, uic, assetType);
    if (chartQ) return { quote: chartQ, source: 'chart' };
    return { quote, source: 'infoprice' };
  } catch {
    const chartQ = await getChartQuote(cfg, uic, assetType);
    if (chartQ) return { quote: chartQ, source: 'chart' };
    throw new Error(`UIC ${uic} (${assetType}) の価格を取得できません`);
  }
}

export function pickOrderAmount(cfg, details) {
  if (cfg.orderAmount > 0) return cfg.orderAmount;
  const min = Number(details.MinimumTradeSize || details.MinimumLotSize || 0);
  if (min > 0) return min;
  if (details.AssetType === 'FxSpot') return 1000;
  return 1;
}

export function buildMarketOrder({ accountKey, uic, assetType, amount, buySell = 'Buy' }) {
  return {
    AccountKey: accountKey,
    Uic: uic,
    AssetType: assetType,
    Amount: amount,
    BuySell: buySell,
    OrderType: 'Market',
    ManualOrder: false,
    OrderDuration: { DurationType: 'DayOrder' },
  };
}

export async function precheckOrder(cfg, orderBody) {
  return saxoRequest(cfg, 'POST', '/trade/v2/orders/precheck', {
    ...orderBody,
    FieldGroups: ['Costs'],
  });
}

export async function placeSimOrder(cfg, orderBody) {
  return saxoRequest(cfg, 'POST', '/trade/v2/orders', orderBody);
}
