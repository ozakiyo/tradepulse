/**
 * チームF: マルチTF トレンドフォロー — マルチ銘柄（Yahoo・紙トレード）
 * 日足ダウ理論トレンド判定 → 1H スイングハイ/ロー超えでエントリー
 */
var F6_CONFIG = {
  MIN_CANDLES_1H: 120,
  MIN_CANDLES_DAILY: 80,
  SWING_STRENGTH_DAILY: 15,
  SWING_STRENGTH_1H: 7,
  PAPER_JPY_DEFAULT: 500000,
  PAPER_FEE_RATE: 0.0012,
  BATCH_SIZE_DEFAULT: 15,
  VALIDATION_PAUSED_DEFAULT: true,
};

function f6IsValidationPaused_() {
  var p = PropertiesService.getScriptProperties().getProperty('VALIDATION_PAUSED');
  if (p == null || String(p).trim() === '') return F6_CONFIG.VALIDATION_PAUSED_DEFAULT;
  return String(p).toLowerCase() !== 'false';
}

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
    swingStrengthDaily: Number(p.getProperty('SWING_STRENGTH_DAILY') || F6_CONFIG.SWING_STRENGTH_DAILY),
    swingStrength1h: Number(p.getProperty('SWING_STRENGTH_1H') || F6_CONFIG.SWING_STRENGTH_1H),
    batchSize: Number(p.getProperty('BATCH_SIZE') || F6_CONFIG.BATCH_SIZE_DEFAULT),
  };
  return metaLeagueApplyToConfig_('F-Index', cfg, {});
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
