/**
 * チームG-FX: FXレンジ（ロング・ショート・10通貨）
 * Yahoo Finance ・紙トレード（DRY_RUN 固定推奨）
 */
var GFX_CONFIG = {
  DAILY_LOOKBACK: 20,
  DAILY_RANGE_MAX_PCT: 10,
  H1_LOOKBACK: 48,
  H1_RANGE_MAX_PCT: 3.5,
  H1_INSIDE_DAILY_BUFFER_PCT: 0.5,
  TOUCH_PCT: 0.1,
  /** 1Hレンジ幅に対する利確位置（0.5=中間, 0.667=2/3, 1.0=反対端） */
  TP_RATIO: 0.55,
  /** 1H損切時に決済する比率（残りは日足損切） */
  PARTIAL_STOP_RATIO: 0.5,

  MIN_CANDLES_1H: 55,
  MIN_CANDLES_5M: 12,
  YAHOO_CHART_CACHE_SEC: 600,

  PAPER_JPY_DEFAULT: 500000,
  PAPER_FEE_RATE: 0.0008,
  MARGIN_RATE: 0.05,
  USD_JPY_REF: 150,

  MAX_MARGIN_JPY_PER_PAIR: 50000,
  MAX_OPEN_POSITIONS: 7,

  /** 検証停止（既定オン）。実践FXは G-FFX へ。再開: VALIDATION_PAUSED=false */
  VALIDATION_PAUSED_DEFAULT: true,
};

function gfxIsValidationPaused_() {
  var p = PropertiesService.getScriptProperties().getProperty('VALIDATION_PAUSED');
  if (p == null || String(p).trim() === '') return GFX_CONFIG.VALIDATION_PAUSED_DEFAULT;
  return String(p).toLowerCase() !== 'false';
}

function gfxClampPartialStopRatio_(ratio) {
  if (isNaN(ratio) || ratio <= 0) return 0.5;
  if (ratio >= 1) return 1;
  return ratio;
}

function gfxClampTpRatio_(ratio) {
  if (isNaN(ratio) || ratio < 0.5) return 0.5;
  if (ratio > 1) return 1;
  return ratio;
}

function gfxResolveMaxOpenPositions_(props) {
  var raw = props.getProperty('GFX_MAX_OPEN_POSITIONS');
  var n = Number(raw || GFX_CONFIG.MAX_OPEN_POSITIONS);
  if (n === 4) {
    n = 7;
    props.setProperty('GFX_MAX_OPEN_POSITIONS', '7');
  }
  return n;
}

function gfxGetConfig_() {
  var p = PropertiesService.getScriptProperties();
  var cfg = {
    dryRun: true,
    dailyLookback: Number(p.getProperty('GFX_DAILY_LOOKBACK') || GFX_CONFIG.DAILY_LOOKBACK),
    dailyRangeMaxPct: Number(p.getProperty('GFX_DAILY_RANGE_MAX_PCT') || GFX_CONFIG.DAILY_RANGE_MAX_PCT),
    h1Lookback: Number(p.getProperty('GFX_H1_LOOKBACK') || GFX_CONFIG.H1_LOOKBACK),
    h1RangeMaxPct: Number(p.getProperty('GFX_H1_RANGE_MAX_PCT') || GFX_CONFIG.H1_RANGE_MAX_PCT),
    h1InsideDailyBufferPct: Number(
      p.getProperty('GFX_H1_INSIDE_DAILY_BUFFER_PCT') || GFX_CONFIG.H1_INSIDE_DAILY_BUFFER_PCT
    ),
    touchPct: Number(p.getProperty('GFX_TOUCH_PCT') || GFX_CONFIG.TOUCH_PCT),
    tpRatio: gfxClampTpRatio_(Number(p.getProperty('GFX_TP_RATIO') || GFX_CONFIG.TP_RATIO)),
    partialStopRatio: gfxClampPartialStopRatio_(
      Number(p.getProperty('GFX_PARTIAL_STOP_RATIO') || GFX_CONFIG.PARTIAL_STOP_RATIO)
    ),
    maxMarginJpyPerPair: Number(p.getProperty('GFX_MAX_MARGIN_JPY_PER_PAIR') || GFX_CONFIG.MAX_MARGIN_JPY_PER_PAIR),
    maxOpenPositions: gfxResolveMaxOpenPositions_(p),
    paperJpyDefault: Number(p.getProperty('PAPER_JPY') || GFX_CONFIG.PAPER_JPY_DEFAULT),
    marginRate: Number(p.getProperty('GFX_MARGIN_RATE') || GFX_CONFIG.MARGIN_RATE),
    usdJpyRef: Number(p.getProperty('GFX_USD_JPY_REF') || GFX_CONFIG.USD_JPY_REF),
  };
  return metaLeagueApplyToConfig_('G-FX', cfg, {
    sizeKeys: ['maxMarginJpyPerPair'],
    tpRatioKey: 'tpRatio',
    touchPctKey: 'touchPct',
  });
}

function gfxLoadState_() {
  var raw = PropertiesService.getScriptProperties().getProperty('GFX_STATE');
  if (!raw) {
    return { pairs: {}, paperWallet: null, lastRunAt: null, lastError: null };
  }
  try {
    var s = JSON.parse(raw);
    if (!s.pairs) s.pairs = {};
    return s;
  } catch (e) {
    return { pairs: {}, paperWallet: null };
  }
}

function gfxSaveState_(state) {
  PropertiesService.getScriptProperties().setProperty('GFX_STATE', JSON.stringify(state));
}

function gfxGetPairState_(state, pairId) {
  if (!state.pairs[pairId]) {
    state.pairs[pairId] = {
      position: null,
      lastSignal: '',
      lastDailyNote: '',
      lastH1Note: '',
      lastLogSnapshot: null,
    };
  }
  return state.pairs[pairId];
}

function gfxLog_(msg) {
  var line =
    '[G-FX][' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') + '] ' + msg;
  Logger.log(line);
  var prev = PropertiesService.getScriptProperties().getProperty('GFX_LOG') || '';
  PropertiesService.getScriptProperties().setProperty('GFX_LOG', (line + '\n' + prev).slice(0, 8000));
}

function gfxCountOpenPositions_(state) {
  var n = 0;
  Object.keys(state.pairs || {}).forEach(function (pairId) {
    var pos = state.pairs[pairId].position;
    if (pos && pos.side && pos.units > 0) n += 1;
  });
  return n;
}
