/**
 * メタ層（Auto 責任）— 稼働チーム集計の司令塔
 *
 * 稼働中のみ:
 *   F-Short, J（bitbank）
 *   G-SAXO, G-SAXO-TREND（SaxoBank / ConoHa）
 */
var META_CONFIG = {
  PAIR: 'btc_jpy',

  SHOCK_MOVE_PCT: 1.5,
  MIN_CANDLES_1H: 55,
  CANDLE_FETCH_MAX_DAYS: 5,

  ER_TREND_MIN: 0.32,
  ER_RANGE_MAX: 0.22,
  ADX_TREND_MIN: 22,
  ADX_RANGE_MAX: 18,

  /** 環境別の基本配分（合計100） */
  ALLOC_RANGE: { A: 30, B: 40, C: 10, D: 10, E: 5, cash: 5 },
  ALLOC_MIXED: { A: 35, B: 30, C: 15, D: 10, E: 5, cash: 5 },
  ALLOC_TREND_BULL: { A: 15, B: 15, C: 25, D: 25, E: 15, cash: 5 },
  ALLOC_TREND_BEAR: { A: 25, B: 15, C: 5, D: 5, E: 5, cash: 45 },
  ALLOC_SHOCK_DOWN: { A: 10, B: 10, C: 0, D: 0, E: 0, cash: 80 },
  ALLOC_SHOCK_UP: { A: 20, B: 15, C: 20, D: 20, E: 20, cash: 5 },

  /** 週次成績調整: 1位 +5pt, 最下位 -5pt（チーム上限40 / 下限0） */
  WEEKLY_BONUS_PCT: 5,
  TEAM_ALLOC_MAX: 40,
  TEAM_ALLOC_MIN: 0,

  /** リーグ競争: 全チーム一律の仮想資金（円） */
  LEAGUE_CAPITAL_PER_TEAM: 500000,
  DUMMY_CAPITAL_PER_TEAM: 500000,
  DUMMY_TOTAL_CAPITAL: 1500000,
  PAPER_FEE_RATE: 0.0012,

  PUBLIC_API: 'https://public.bitbank.cc',
};

function metaGetConfig_() {
  var p = PropertiesService.getScriptProperties();
  return {
    shockMovePct: Number(p.getProperty('SHOCK_MOVE_PCT') || META_CONFIG.SHOCK_MOVE_PCT),
    weeklyBonusPct: Number(p.getProperty('WEEKLY_BONUS_PCT') || META_CONFIG.WEEKLY_BONUS_PCT),
    lineOnChange: String(p.getProperty('META_LINE_ON_CHANGE') || 'false') === 'true',
  };
}

function metaLoadState_() {
  var raw = PropertiesService.getScriptProperties().getProperty('META_STATE');
  if (!raw) {
    return {
      lastRegimeKey: null,
      lastAllocation: null,
      lastRunAt: null,
    };
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { lastRegimeKey: null, lastAllocation: null };
  }
}

function metaSaveState_(state) {
  PropertiesService.getScriptProperties().setProperty('META_STATE', JSON.stringify(state));
}

function metaSaveAllocation_(allocation) {
  PropertiesService.getScriptProperties().setProperty('META_ALLOCATION', JSON.stringify(allocation));
}

function metaLoadAllocation_() {
  var raw = PropertiesService.getScriptProperties().getProperty('META_ALLOCATION');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function metaLog_(msg) {
  var line = '[META][' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') + '] ' + msg;
  Logger.log(line);
  var prev = PropertiesService.getScriptProperties().getProperty('META_LOG') || '';
  PropertiesService.getScriptProperties().setProperty('META_LOG', (line + '\n' + prev).slice(0, 8000));
}