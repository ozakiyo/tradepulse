/**
 * チームG-FFX: 4Hブレイクアウト（パーフェクトオーダー）— GMO外国為替FX
 */
var GFFX_CONFIG = {
  EMA_FAST: 10,
  EMA_MID: 20,
  EMA_SLOW: 50,
  SLOPE_BARS: 3,
  CONSOLIDATION_BARS: 10,
  CONSOLIDATION_MAX_PCT: 4,
  BREAKOUT_BODY_MULT: 1.2,
  PARTIAL_TP_BARS: 5,
  PARTIAL_TP_RATIO: 0.5,
  STOP_BUFFER_PCT: 0.02,

  MIN_CANDLES_4H: 55,
  MIN_CANDLES_1H: 220,

  PAPER_JPY_DEFAULT: 500000,
  PAPER_FEE_RATE: 0.0008,
  LEVERAGE_DEFAULT: 4,
  USD_JPY_REF: 150,

  MAX_MARGIN_JPY_PER_PAIR: 50000,
  MAX_OPEN_POSITIONS: 7,
};

function gffxClampPartialTpRatio_(ratio) {
  if (isNaN(ratio) || ratio <= 0) return 0.5;
  if (ratio >= 1) return 1;
  return ratio;
}

/** META リーグ互換 */
function gffxClampTpRatio_(ratio) {
  return gffxClampPartialTpRatio_(ratio);
}

function gffxResolveMaxOpenPositions_(props) {
  var raw = props.getProperty('GFFX_MAX_OPEN_POSITIONS');
  var n = Number(raw || GFFX_CONFIG.MAX_OPEN_POSITIONS);
  if (n === 4) {
    n = 7;
    props.setProperty('GFFX_MAX_OPEN_POSITIONS', '7');
  }
  return n;
}

function gffxGetConfig_() {
  var p = PropertiesService.getScriptProperties();
  var cfg = {
    dryRun: String(p.getProperty('DRY_RUN') || 'true') !== 'false',
    emaFast: Number(p.getProperty('GFFX_EMA_FAST') || GFFX_CONFIG.EMA_FAST),
    emaMid: Number(p.getProperty('GFFX_EMA_MID') || GFFX_CONFIG.EMA_MID),
    emaSlow: Number(p.getProperty('GFFX_EMA_SLOW') || GFFX_CONFIG.EMA_SLOW),
    slopeBars: Number(p.getProperty('GFFX_SLOPE_BARS') || GFFX_CONFIG.SLOPE_BARS),
    consolidationBars: Number(p.getProperty('GFFX_CONSOLIDATION_BARS') || GFFX_CONFIG.CONSOLIDATION_BARS),
    consolidationMaxPct: Number(
      p.getProperty('GFFX_CONSOLIDATION_MAX_PCT') || GFFX_CONFIG.CONSOLIDATION_MAX_PCT
    ),
    breakoutBodyMult: Number(p.getProperty('GFFX_BREAKOUT_BODY_MULT') || GFFX_CONFIG.BREAKOUT_BODY_MULT),
    partialTpBars: Number(p.getProperty('GFFX_PARTIAL_TP_BARS') || GFFX_CONFIG.PARTIAL_TP_BARS),
    partialTpRatio: gffxClampPartialTpRatio_(
      Number(p.getProperty('GFFX_PARTIAL_TP_RATIO') || GFFX_CONFIG.PARTIAL_TP_RATIO)
    ),
    stopBufferPct: Number(p.getProperty('GFFX_STOP_BUFFER_PCT') || GFFX_CONFIG.STOP_BUFFER_PCT),
    minCandles4h: Number(p.getProperty('GFFX_MIN_CANDLES_4H') || GFFX_CONFIG.MIN_CANDLES_4H),
    minCandles1h: Number(p.getProperty('GFFX_MIN_CANDLES_1H') || GFFX_CONFIG.MIN_CANDLES_1H),
    maxMarginJpyPerPair: Number(p.getProperty('GFFX_MAX_MARGIN_JPY_PER_PAIR') || GFFX_CONFIG.MAX_MARGIN_JPY_PER_PAIR),
    maxOpenPositions: gffxResolveMaxOpenPositions_(p),
    paperJpyDefault: Number(p.getProperty('PAPER_JPY') || GFFX_CONFIG.PAPER_JPY_DEFAULT),
    leverage: Number(p.getProperty('GFFX_LEVERAGE') || GFFX_CONFIG.LEVERAGE_DEFAULT),
    usdJpyRef: Number(p.getProperty('GFFX_USD_JPY_REF') || GFFX_CONFIG.USD_JPY_REF),
    minFundMode: String(p.getProperty('MIN_FUND_MODE') || 'false').toLowerCase() === 'true',
  };
  return metaLeagueApplyToConfig_('G-FFX', cfg, {
    sizeKeys: ['maxMarginJpyPerPair'],
    tpRatioKey: 'partialTpRatio',
  });
}

function gffxLoadState_() {
  var raw = PropertiesService.getScriptProperties().getProperty('GFFX_STATE');
  if (!raw) {
    return { pairs: {}, paperWallet: null, liveBaseline: null, lastRunAt: null, lastError: null };
  }
  try {
    var s = JSON.parse(raw);
    if (!s.pairs) s.pairs = {};
    return s;
  } catch (e) {
    return { pairs: {}, paperWallet: null };
  }
}

function gffxSaveState_(state) {
  PropertiesService.getScriptProperties().setProperty('GFFX_STATE', JSON.stringify(state));
}

function gffxGetPairState_(state, pairId) {
  if (!state.pairs[pairId]) {
    state.pairs[pairId] = {
      position: null,
      lastSignal: '',
      lastSetupNote: '',
      lastDailyNote: '',
      lastH1Note: '',
      lastEntry4hTime: null,
      lastLogSnapshot: null,
    };
  }
  return state.pairs[pairId];
}

function gffxLog_(msg) {
  var line =
    '[G-FFX][' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') + '] ' + msg;
  Logger.log(line);
  var prev = PropertiesService.getScriptProperties().getProperty('GFFX_LOG') || '';
  PropertiesService.getScriptProperties().setProperty('GFFX_LOG', (line + '\n' + prev).slice(0, 8000));
}

function gffxCountOpenPositions_(state) {
  var n = 0;
  Object.keys(state.pairs || {}).forEach(function (pairId) {
    var pos = state.pairs[pairId].position;
    if (pos && pos.side && pos.units > 0) n += 1;
  });
  return n;
}
