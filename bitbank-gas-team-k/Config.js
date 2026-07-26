/**
 * チームK: bitbank 現物 — 戻り局面ロング回転
 * 長期（週足・月足）ダウントレンド銘柄は除外
 * エントリー: 日足の上昇トレンド戻り or レンジ戻り（上放れはしない）
 */
var K_CONFIG = {
  PUBLIC_API: 'https://public.bitbank.cc',
  PRIVATE_API: 'https://api.bitbank.cc/v1',

  /** 1回のBUYに使う目安 JPY */
  ENTRY_JPY: 10000,
  /** 1往復の目標純利益（円）。利確価格はこのネットを満たす最小幅 */
  TARGET_NET_JPY: 10,
  /** 利確の最低ティック数（買値からの目盛り）。薄い純益幅を底上げ */
  TP_MIN_TICKS: 2,
  /** 利確の最低幅%（買値比）。0なら無効 */
  TP_MIN_PCT: 0.05,
  /** 互換残置（TP算出の主因ではない） */
  TAKE_PROFIT_PCT: 1.0,
  /** 含み損がこの％を超えたら新規停止・休眠候補 */
  SALT_DRAWDOWN_PCT: 5.0,

  /** 同時アクティブ上限（実枠は必要資金の詰め込みで決まる） */
  MAX_ACTIVE_PAIRS: 15,
  /** BTCが日足ダウンでなければ優先してアクティブ枠に入れる */
  PRIORITY_PAIR: 'btc_jpy',
  /** 互換用（選定・追加では使わない） */
  PAIR_BUDGET_JPY: 55000,
  PAPER_JPY_DEFAULT: 110000,
  ACCOUNT_BUDGET_PCT: 0.9,

  /** 長期ダウントレンド判定 */
  WEEKLY_SMA: 20,
  WEEKLY_SLOPE_BARS: 4,
  MONTHLY_SMA: 10,
  MONTHLY_SLOPE_BARS: 3,
  /** 週足/月足取得年数（今年＋過去） */
  HTF_YEARS_BACK: 2,
  /** 長期判定は週1回キャッシュ（同一ISO週は再取得しない） */
  LONG_TERM_CACHE_WEEKLY: true,

  /** 日足・戻り判定 */
  DAILY_SMA: 20,
  DAILY_SMA_SLOPE_BARS: 3,
  DAILY_LOOKBACK: 60,
  DAILY_RANGE_LOOKBACK: 20,
  /** レンジ幅上限%（これを超えるとレンジ戻り対象外） */
  DAILY_RANGE_MAX_PCT: 15,
  /** 上昇トレンド戻り: 終値が SMA〜SMA×(1+この%/100) の帯 */
  PULLBACK_TO_SMA_PCT: 2.0,
  /** レンジ上限: 箱の上からこの%帯（BUY不可・枠移行） */
  RANGE_UPPER_FROM_TOP_PCT: 20,
  /** レンジ下抜けバッファ% */
  RANGE_BREAK_BUFFER_PCT: 0.3,
  /** スイング山・谷の左右本数（ダウ構造） */
  SWING_LEFT_RIGHT: 2,
  CANDLE_FETCH_MAX_DAYS: 70,
  CANDLE_DAY_CACHE_SEC: 900,
  TICKER_CACHE_SEC: 120,

  /** トレンドシート（短期=日足 + 長期=週/月。1日1回） */
  TREND_SHEET_NAME: 'K_トレンド',
  TREND_SHEET_LEGACY_NAME: 'K_日足トレンド',
  TREND_SHEET_BATCH_MAX_MS: 180000,
  TREND_SHEET_PREV_KEY: 'K_TREND_PREV',
  TREND_SHEET_YMD_KEY: 'K_TREND_SHEET_YMD',
  TREND_SHEET_OFFSET_KEY: 'K_TREND_OFFSET',
  /** 日次トレンド完了スナップ（ランキング共用） */
  TREND_SNAPSHOT_KEY: 'K_TREND_SNAPSHOT',
  /** 日足判定キャッシュ（CacheService・当日） */
  DAILY_REGIME_CACHE_PREFIX: 'k_dr3_',
  DAILY_REGIME_CACHE_SEC: 21600,
  USDJPY_YAHOO_SYMBOL: 'USDJPY=X',
  USDJPY_SHEET_LABEL: 'USD/JPY',

  /** ランキング（必要資金昇順で候補を多く残す） */
  RANK_CACHE_TTL_SEC: 86400,
  RANK_TOP_N: 15,
  RANK_BATCH_MAX_MS: 180000,

  FEE_ROLE_FOR_CAPITAL: 'taker',
  FEE_ROLE_FOR_PROFIT: 'maker',
  /** 利確幅の悲観計算: 買いはテイカー／売りはメイカー（ネットが残るように広め） */
  TP_FEE_BUY_ROLE: 'taker',
  TP_FEE_SELL_ROLE: 'maker',

  /** 薄い板フィルタ（ランキング・通常アクティブ追加） */
  LIQUIDITY_FILTER_ENABLED: true,
  /** 24h出来高の円換算下限（vol×last）。0=出来高チェック無効（スプレッドは継続） */
  MIN_VOLUME_JPY: 0,
  /** スプレッド上限% ((sell-buy)/mid*100) */
  MAX_SPREAD_PCT: 1,

  BTC_RESERVE_AMOUNT: 0,
  EXCLUDE_PAIRS: [],
  RUN_LOG_INTERVAL_MIN: 15,
  /** K_ステータスシートの更新間隔（分） */
  STATUS_SHEET_INTERVAL_MIN: 60,
  /**
   * アクティブ銘柄の選定・追加間隔（分）。
   * 1分トリガーは既存アクティブ／休眠のみ処理し、新規選定はこの間隔のみ。
   */
  ACTIVE_ROSTER_INTERVAL_MIN: 60,
  VALIDATION_PAUSED_DEFAULT: true,
  /** 同一口座運用時に自注文だけ税務集計するか（口座分離時は false のままでよい） */
  OWN_ORDERS_ONLY_DEFAULT: false,
};

function kIsValidationPaused_() {
  var raw = PropertiesService.getScriptProperties().getProperty('VALIDATION_PAUSED');
  if (raw == null || String(raw).trim() === '') return K_CONFIG.VALIDATION_PAUSED_DEFAULT;
  var v = String(raw).trim().toLowerCase();
  // 明示的にオフ → 稼働（前後空白・大文字小文字を吸収）
  if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
  // 明示的にオン → 停止
  if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;
  // 想定外の値は安全側で停止
  return true;
}

/** デバッグ用: 生の VALIDATION_PAUSED 値 */
function kGetValidationPausedRaw_() {
  return PropertiesService.getScriptProperties().getProperty('VALIDATION_PAUSED');
}

function kGetConfig_() {
  var p = PropertiesService.getScriptProperties();
  return {
    dryRun: String(p.getProperty('DRY_RUN') || 'true') !== 'false',
    entryJpy: Number(p.getProperty('ENTRY_JPY') || K_CONFIG.ENTRY_JPY),
    targetNetJpy: Number(p.getProperty('TARGET_NET_JPY') || K_CONFIG.TARGET_NET_JPY),
    tpMinTicks: Number(
      p.getProperty('TP_MIN_TICKS') != null && String(p.getProperty('TP_MIN_TICKS')).trim() !== ''
        ? p.getProperty('TP_MIN_TICKS')
        : K_CONFIG.TP_MIN_TICKS
    ),
    tpMinPct: Number(
      p.getProperty('TP_MIN_PCT') != null && String(p.getProperty('TP_MIN_PCT')).trim() !== ''
        ? p.getProperty('TP_MIN_PCT')
        : K_CONFIG.TP_MIN_PCT
    ),
    takeProfitPct: Number(p.getProperty('TAKE_PROFIT_PCT') || K_CONFIG.TAKE_PROFIT_PCT),
    saltDrawdownPct: Number(p.getProperty('SALT_DRAWDOWN_PCT') || K_CONFIG.SALT_DRAWDOWN_PCT),
    maxActivePairs: Number(p.getProperty('MAX_ACTIVE_PAIRS') || K_CONFIG.MAX_ACTIVE_PAIRS),
    pairBudgetJpy: Number(
      p.getProperty('PAIR_BUDGET_JPY') != null ? p.getProperty('PAIR_BUDGET_JPY') : K_CONFIG.PAIR_BUDGET_JPY
    ),
    paperJpyDefault: Number(p.getProperty('PAPER_JPY') || K_CONFIG.PAPER_JPY_DEFAULT),
    accountBudgetPct: Number(p.getProperty('ACCOUNT_BUDGET_PCT') || K_CONFIG.ACCOUNT_BUDGET_PCT),
    priorityPair: (p.getProperty('PRIORITY_PAIR') || K_CONFIG.PRIORITY_PAIR || 'btc_jpy').toLowerCase(),
    pullbackToSmaPct: Number(p.getProperty('PULLBACK_TO_SMA_PCT') || K_CONFIG.PULLBACK_TO_SMA_PCT),
    dailyRangeMaxPct: Number(p.getProperty('DAILY_RANGE_MAX_PCT') || K_CONFIG.DAILY_RANGE_MAX_PCT),
    rangeUpperFromTopPct: Number(
      p.getProperty('RANGE_UPPER_FROM_TOP_PCT') || K_CONFIG.RANGE_UPPER_FROM_TOP_PCT
    ),
    btcReserve: Number(p.getProperty('BTC_RESERVE_AMOUNT') || K_CONFIG.BTC_RESERVE_AMOUNT),
    feeRoleCapital: p.getProperty('FEE_ROLE_FOR_CAPITAL') || K_CONFIG.FEE_ROLE_FOR_CAPITAL,
    feeRoleProfit: p.getProperty('FEE_ROLE_FOR_PROFIT') || K_CONFIG.FEE_ROLE_FOR_PROFIT,
    tpFeeBuyRole: p.getProperty('TP_FEE_BUY_ROLE') || K_CONFIG.TP_FEE_BUY_ROLE || 'taker',
    tpFeeSellRole: p.getProperty('TP_FEE_SELL_ROLE') || K_CONFIG.TP_FEE_SELL_ROLE || 'maker',
    liquidityFilterEnabled: String(
      p.getProperty('LIQUIDITY_FILTER_ENABLED') != null
        ? p.getProperty('LIQUIDITY_FILTER_ENABLED')
        : K_CONFIG.LIQUIDITY_FILTER_ENABLED
    ).toLowerCase() !== 'false',
    minVolumeJpy: Number(
      p.getProperty('MIN_VOLUME_JPY') != null && String(p.getProperty('MIN_VOLUME_JPY')).trim() !== ''
        ? p.getProperty('MIN_VOLUME_JPY')
        : K_CONFIG.MIN_VOLUME_JPY
    ),
    maxSpreadPct: Number(
      p.getProperty('MAX_SPREAD_PCT') != null && String(p.getProperty('MAX_SPREAD_PCT')).trim() !== ''
        ? p.getProperty('MAX_SPREAD_PCT')
        : K_CONFIG.MAX_SPREAD_PCT
    ),
    excludePairs: kParseExcludePairs_(p.getProperty('K_EXCLUDE_PAIRS')),
    runLogIntervalMin: Number(p.getProperty('RUN_LOG_INTERVAL_MIN') || K_CONFIG.RUN_LOG_INTERVAL_MIN),
    statusSheetIntervalMin: Number(
      p.getProperty('STATUS_SHEET_INTERVAL_MIN') || K_CONFIG.STATUS_SHEET_INTERVAL_MIN || 60
    ),
    activeRosterIntervalMin: Number(
      p.getProperty('ACTIVE_ROSTER_INTERVAL_MIN') || K_CONFIG.ACTIVE_ROSTER_INTERVAL_MIN || 60
    ),
    // 同一口座で他Bot/手動と分離: 自注文IDに一致する約定のみ税務取込
    ownOrdersOnly:
      String(
        p.getProperty('OWN_ORDERS_ONLY') != null
          ? p.getProperty('OWN_ORDERS_ONLY')
          : K_CONFIG.OWN_ORDERS_ONLY_DEFAULT
      ).toLowerCase() === 'true',
  };
}

function kParseExcludePairs_(raw) {
  if (raw && String(raw).trim()) {
    return String(raw)
      .split(',')
      .map(function (s) {
        return s.trim().toLowerCase();
      })
      .filter(Boolean);
  }
  return (K_CONFIG.EXCLUDE_PAIRS || []).slice();
}

var K_GLOBAL_STATE_KEY = 'K_GLOBAL';

function kLoadGlobalState_() {
  var raw = PropertiesService.getScriptProperties().getProperty(K_GLOBAL_STATE_KEY);
  if (!raw) {
    return {
      activePairs: [],
      dormantPairs: [],
      paperWallet: null,
      lastRunAt: null,
      lastRunLogAt: null,
      lastError: null,
    };
  }
  try {
    var s = JSON.parse(raw);
    if (!s.activePairs) s.activePairs = [];
    if (!s.dormantPairs) s.dormantPairs = [];
    return s;
  } catch (e) {
    return { activePairs: [], dormantPairs: [] };
  }
}

function kSaveGlobalState_(global) {
  PropertiesService.getScriptProperties().setProperty(K_GLOBAL_STATE_KEY, JSON.stringify(global));
}

function kStateKey_(pair) {
  return 'K_S_' + String(pair || '').replace(/[^a-z0-9]/gi, '_');
}

function kLoadState_(pair) {
  var raw = PropertiesService.getScriptProperties().getProperty(kStateKey_(pair));
  if (!raw) {
    return {
      mode: 'idle',
      position: null,
      lastBuyAt: null,
      lastSellAt: null,
      lastRunAt: null,
      lastError: null,
      regimeNote: '',
    };
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { mode: 'idle', position: null };
  }
}

function kSaveState_(pair, state) {
  PropertiesService.getScriptProperties().setProperty(kStateKey_(pair), JSON.stringify(state));
}

/**
 * Script Properties の肥大対策
 * - K_S_*: アクティブ/休眠外かつポジションなしなら削除
 * - K_LT_*: 週次キャッシュなので全削除可（次回再取得）
 * - 一時バッファ: K_TREND_BUF 等
 * @return {{ before: number, after: number, deleted: string[], keptState: number, keptConfig: number }}
 */
function kPruneUnusedScriptProperties_(opts) {
  opts = opts || {};
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var before = Object.keys(all).length;
  var global = kLoadGlobalState_();
  var keepPairs = {};
  (global.activePairs || []).forEach(function (p) {
    keepPairs[p] = true;
  });
  (global.dormantPairs || []).forEach(function (p) {
    keepPairs[p] = true;
  });

  var deleted = [];
  var keptState = 0;
  var keptConfig = 0;
  var transientExact = {
    K_TREND_BUF: true,
    K_RANK_OFFSET: true,
    K_TREND_OFFSET: true,
  };

  Object.keys(all).forEach(function (key) {
    if (key.indexOf('K_S_') === 0) {
      var pair = key.slice(4);
      var st = null;
      try {
        st = JSON.parse(all[key]);
      } catch (e) {
        props.deleteProperty(key);
        deleted.push(key + '(壊)');
        return;
      }
      var hasPos = !!(st && st.position);
      if (keepPairs[pair] || hasPos) {
        keptState += 1;
        return;
      }
      props.deleteProperty(key);
      deleted.push(key);
      return;
    }
    if (key.indexOf('K_LT_') === 0) {
      // 長期判定は週キャッシュ。消しても次回再計算される
      if (opts.keepLongTerm) {
        keptState += 1;
        return;
      }
      props.deleteProperty(key);
      deleted.push(key);
      return;
    }
    if (transientExact[key]) {
      props.deleteProperty(key);
      deleted.push(key);
      return;
    }
    keptConfig += 1;
  });

  var after = Object.keys(props.getProperties()).length;
  return {
    before: before,
    after: after,
    deleted: deleted,
    keptState: keptState,
    keptConfig: keptConfig,
  };
}

function kCountScriptProperties_() {
  return Object.keys(PropertiesService.getScriptProperties().getProperties()).length;
}

function kLog_(msg) {
  var line = '[K][' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') + '] ' + msg;
  Logger.log(line);
  var prev = PropertiesService.getScriptProperties().getProperty('K_LOG') || '';
  PropertiesService.getScriptProperties().setProperty('K_LOG', (line + '\n' + prev).slice(0, 8000));
}

function kTodayYmd_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
}

function kGetBtcReserve_(cfg) {
  cfg = cfg || kGetConfig_();
  return cfg.btcReserve != null ? cfg.btcReserve : K_CONFIG.BTC_RESERVE_AMOUNT;
}
