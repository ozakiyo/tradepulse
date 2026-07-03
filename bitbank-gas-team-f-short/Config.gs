/**
 * チームF-FX-Short: 1H+5m トレンドフォロー — FX専用（Yahoo・紙トレード）
 * 1Hダウ理論トレンド判定 → 5m エントリー → 30m 決済
 */
var F6_CONFIG = {
  MIN_CANDLES_TREND: 200,
  MIN_CANDLES_ENTRY: 120,
  MIN_CANDLES_EXIT: 80,
  SWING_STRENGTH_TREND: 15,
  SWING_STRENGTH_ENTRY: 7,
  SWING_STRENGTH_EXIT: 7,
  MAX_OPEN_POSITIONS: 3,
  PAPER_JPY_DEFAULT: 500000,
  PAPER_FEE_RATE: 0.0012,
  BATCH_SIZE_DEFAULT: 8,
};

/* ---------- 処理コンテキスト ---------- */

var f6_ctx = { symbol: '', inst: null };

function f6SetContext_(symbol) {
  f6_ctx.symbol = symbol;
  f6_ctx.inst = f6GetInstrument_(symbol);
}

/* ---------- フォーマット関数（コンテキスト依存） ---------- */

function f6FormatPos_(amount) {
  var d = f6_ctx.inst ? f6_ctx.inst.posDecimals : 2;
  var pow = Math.pow(10, d);
  return Math.floor(amount * pow) / pow;
}

function f6FormatPrice_(price) {
  var d = f6_ctx.inst ? f6_ctx.inst.priceDecimals : 3;
  var f = Math.pow(10, d);
  return Math.round(Number(price) * f) / f;
}

/* ---------- グローバル設定 ---------- */

function f6GetConfig_() {
  var p = PropertiesService.getScriptProperties();
  var cfg = {
    dryRun: true,
    swingStrengthTrend: Number(p.getProperty('SWING_STRENGTH_TREND') || F6_CONFIG.SWING_STRENGTH_TREND),
    swingStrengthEntry: Number(p.getProperty('SWING_STRENGTH_ENTRY') || F6_CONFIG.SWING_STRENGTH_ENTRY),
    swingStrengthExit: Number(p.getProperty('SWING_STRENGTH_EXIT') || F6_CONFIG.SWING_STRENGTH_EXIT),
    maxOpenPositions: Number(p.getProperty('MAX_OPEN_POSITIONS') || F6_CONFIG.MAX_OPEN_POSITIONS),
    batchSize: Number(p.getProperty('BATCH_SIZE') || F6_CONFIG.BATCH_SIZE_DEFAULT),
  };
  return metaLeagueApplyToConfig_('F-Short', cfg, {});
}

/* ---------- 銘柄別状態管理 ---------- */

function f6StateKey_(symbol) {
  return 'F6_S_' + symbol.replace(/[^A-Za-z0-9]/g, '_');
}

function f6LoadState_(symbol) {
  var raw = PropertiesService.getScriptProperties().getProperty(f6StateKey_(symbol));
  if (!raw) {
    return {
      mode: 'none',
      entryPrice: null,
      stopLoss: null,
      pullbackSwing: null,
      positionSide: null,
      lastDailyTrend: null,
      lastSignal: null,
      lastRunAt: null,
      lastError: null,
    };
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { mode: 'none', entryPrice: null, stopLoss: null };
  }
}

function f6SaveState_(symbol, state) {
  PropertiesService.getScriptProperties().setProperty(f6StateKey_(symbol), JSON.stringify(state));
}

/* ---------- バッチ制御 ---------- */

function f6GetBatchIndex_() {
  return Number(PropertiesService.getScriptProperties().getProperty('F6_BATCH_IDX') || 0);
}

function f6SaveBatchIndex_(idx) {
  PropertiesService.getScriptProperties().setProperty('F6_BATCH_IDX', String(idx));
}

/** 監視銘柄のうち long/short 保有中の件数 */
function f6CountOpenPositions_(symbols) {
  var count = 0;
  for (var i = 0; i < symbols.length; i++) {
    var st = f6LoadState_(symbols[i]);
    if (st.mode === 'long' || st.mode === 'short') count++;
  }
  return count;
}

/* ---------- ペーパーウォレット（共有） ---------- */

function f6InitPaperWallet_() {
  var raw = PropertiesService.getScriptProperties().getProperty('F6_WALLET');
  if (raw) {
    try { return JSON.parse(raw); } catch (e) { /* fall through */ }
  }
  var cap = Number(
    PropertiesService.getScriptProperties().getProperty('PAPER_JPY') || F6_CONFIG.PAPER_JPY_DEFAULT
  );
  var w = { jpy: cap, initial: cap };
  f6SavePaperWallet_(w);
  return w;
}

function f6SavePaperWallet_(wallet) {
  PropertiesService.getScriptProperties().setProperty('F6_WALLET', JSON.stringify(wallet));
}

/* ---------- ロガー ---------- */

function f6Log_(msg) {
  var prefix = f6_ctx.inst ? f6_ctx.inst.label : 'F6';
  var line = '[F6:' + prefix + '][' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'HH:mm:ss') + '] ' + msg;
  Logger.log(line);
  var prev = PropertiesService.getScriptProperties().getProperty('F6_LOG') || '';
  PropertiesService.getScriptProperties().setProperty('F6_LOG', (line + '\n' + prev).slice(0, 8000));
}
