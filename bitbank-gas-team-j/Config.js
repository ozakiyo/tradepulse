/**
 * チームJ: bitbank 現物マルチ銘柄トラリピ（買いのみ・日足レンジローテ）
 * 月足ダウントレンド銘柄は新規対象外
 */
var J_CONFIG = {
  PUBLIC_API: 'https://public.bitbank.cc',
  PRIVATE_API: 'https://api.bitbank.cc/v1',

  /** 1段あたり最低 JPY（枠18万向けの下限。自動ロットで枠内最大まで上げる） */
  MIN_LEVEL_JPY: 30000,

  /** 日足レンジ（エントリー判定の上限幅%） */
  DAILY_LOOKBACK: 20,
  DAILY_RANGE_MAX_PCT: 18,
  /** BTCのみ広め */
  DAILY_RANGE_MAX_PCT_BTC: 20,
  TRAP_BREAK_BUFFER_PCT: 0.3,

  /** グリッド */
  ATR_PERIOD: 14,
  MAX_LEVELS: 30,
  MIN_GRID_LEVELS: 4,
  TRAP_STEP_MIN_PCT: 0.5,
  /**
   * 銘柄別のトラップ間隔上限（円）。ATRが大きくてもこれ以上広げない。
   * 未定義銘柄は上限なし（ATR＋下限%のみ）
   */
  TRAP_STEP_MAX_BY_PAIR: {
    btc_jpy: 50000,
  },

  /** 手数料ロール（TradingFees.gs 参照） */
  FEE_ROLE_FOR_CAPITAL: 'taker',
  FEE_ROLE_FOR_PROFIT: 'maker',

  MIN_CANDLES_1H: 55,
  /** 日中変動平均の算出日数（確定日足） */
  INTRADAY_MOVE_LOOKBACK_DAYS: 5,
  CANDLE_FETCH_MAX_DAYS: 25,
  CANDLE_DAY_CACHE_SEC: 900,
  TICKER_CACHE_SEC: 120,
  /** 銘柄ランキングキャッシュ（秒）— 1日（GAS負荷軽減） */
  RANK_CACHE_TTL_SEC: 86400,
  /** 選定・表示に使う上位件数（完了後はこの件数だけ保持） */
  RANK_TOP_N: 5,
  /** 1回のランキング更新で使う最大実行時間（ms） */
  RANK_BATCH_MAX_MS: 270000,

  /** ルーメウェイ本番スタート資金 */
  PAPER_JPY_DEFAULT: 600000,
  ACCOUNT_BUDGET_PCT: 0.9,

  /** 同時アクティブ銘柄 */
  MAX_ACTIVE_PAIRS: 3,
  /**
   * 1銘柄あたりの固定資金枠（円）。
   * 60万×90%÷3 ≒ 180000。0 以下で等分。
   */
  PAIR_BUDGET_JPY: 180000,
  /** 総資金・塩漬け・MAX_ACTIVE_PAIRS からロットを自動調整 */
  AUTO_LOT_SIZING: true,
  /** エントリー箱全体にトラップ（現値下=指値・現値上=逆指値） */
  FULL_BOX_TRAP: true,

  /** 長期保有BTC（売却対象外）。ルーメウェイ本番は 0 */
  BTC_RESERVE_AMOUNT: 0,
  /**
   * 自動選定・トラップから除外（長期ダウントレンド等）
   * 運用上の管理はシート「J_除外銘柄」。ここは初期シード兼フォールバック
   */
  EXCLUDE_PAIRS: [
    'astr_jpy',
    'boba_jpy',
    'render_jpy',
    'xym_jpy',
    'arb_jpy',
    'atom_jpy',
    'cyber_jpy',
    'enj_jpy',
    'imx_jpy',
    'lpt_jpy',
    'mask_jpy',
    'matic_jpy',
    'mona_jpy',
    'oas_jpy',
    'omg_jpy',
    'op_jpy',
    'pol_jpy',
    'rndr_jpy',
  ],

  /** 同時アクティブにできる BTC 銘柄数 */
  MAX_BTC_ACTIVE_PAIRS: 1,
  /** 日足レンジ有効なら優先してアクティブ枠に入れる銘柄 */
  PRIORITY_PAIR: 'btc_jpy',
  /**
   * 利確: 売値 = 買値 + trapStep + 手数料カバー幅 + スリップ幅
   * スリップは通貨別固定（未定義は価格帯デフォルト）
   */
  SLIP_WIDTH_BY_PAIR: {
    btc_jpy: 1000,
    eth_jpy: 50,
    xrp_jpy: 0.01,
    ltc_jpy: 5,
    bcc_jpy: 10,
    mona_jpy: 0.1,
    xlm_jpy: 0.01,
    qtum_jpy: 0.1,
    bat_jpy: 0.01,
    omg_jpy: 0.1,
    link_jpy: 0.1,
    matic_jpy: 0.01,
    dot_jpy: 0.1,
    doge_jpy: 0.001,
    sol_jpy: 1,
    avax_jpy: 1,
    near_jpy: 0.1,
    trx_jpy: 0.01,
    dai_jpy: 0.01,
    mkr_jpy: 50,
    rndr_jpy: 0.1,
  },
  REBUILD_RANGE_CHANGE_PCT: 0.15,
  /** 約定済みロットがあるときの再構築クールダウン（分） */
  REBUILD_COOLDOWN_MIN_HELD: 120,
  /** 未約定指値だけのときの再構築クールダウン（分） */
  REBUILD_COOLDOWN_MIN_PENDING: 60,
  /** trapStep 変化がこの割合未満なら計画変更とみなさない */
  REBUILD_STEP_TOL_PCT: 0.1,
  RUN_LOG_INTERVAL_MIN: 15,

  /** 月足ダウントレンドは新規トラップ対象外（週足は見ない） */
  MONTHLY_DOWN_EXCLUDE: true,
  MONTHLY_SMA: 10,
  MONTHLY_SLOPE_BARS: 3,
  HTF_YEARS_BACK: 2,
  /** 月足判定は週1回キャッシュ */
  LONG_TERM_CACHE_WEEKLY: true,

  VALIDATION_PAUSED_DEFAULT: false,
  /** 同一口座運用時に自注文だけ税務集計するか（口座分離時は false のままでよい） */
  OWN_ORDERS_ONLY_DEFAULT: false,
};

function jIsValidationPaused_() {
  var p = PropertiesService.getScriptProperties().getProperty('VALIDATION_PAUSED');
  if (p == null || String(p).trim() === '') return J_CONFIG.VALIDATION_PAUSED_DEFAULT;
  return String(p).toLowerCase() !== 'false';
}

function jGetConfig_() {
  var p = PropertiesService.getScriptProperties();
  var cfg = {
    dryRun: String(p.getProperty('DRY_RUN') || 'true') !== 'false',
    minLevelJpy: Number(p.getProperty('MIN_LEVEL_JPY') || J_CONFIG.MIN_LEVEL_JPY),
    dailyLookback: Number(p.getProperty('DAILY_LOOKBACK') || J_CONFIG.DAILY_LOOKBACK),
    intradayMoveLookbackDays: Number(
      p.getProperty('INTRADAY_MOVE_LOOKBACK_DAYS') || J_CONFIG.INTRADAY_MOVE_LOOKBACK_DAYS
    ),
    dailyRangeMaxPct: Number(p.getProperty('DAILY_RANGE_MAX_PCT') || J_CONFIG.DAILY_RANGE_MAX_PCT),
    dailyRangeMaxPctBtc: Number(
      p.getProperty('DAILY_RANGE_MAX_PCT_BTC') || J_CONFIG.DAILY_RANGE_MAX_PCT_BTC
    ),
    maxLevels: Number(p.getProperty('MAX_LEVELS') || J_CONFIG.MAX_LEVELS),
    minGridLevels: Number(p.getProperty('MIN_GRID_LEVELS') || J_CONFIG.MIN_GRID_LEVELS),
    feeRoleCapital: p.getProperty('FEE_ROLE_FOR_CAPITAL') || J_CONFIG.FEE_ROLE_FOR_CAPITAL,
    feeRoleProfit: p.getProperty('FEE_ROLE_FOR_PROFIT') || J_CONFIG.FEE_ROLE_FOR_PROFIT,
    paperJpyDefault: Number(p.getProperty('PAPER_JPY') || J_CONFIG.PAPER_JPY_DEFAULT),
    accountBudgetPct: Number(p.getProperty('ACCOUNT_BUDGET_PCT') || J_CONFIG.ACCOUNT_BUDGET_PCT),
    btcReserve: Number(p.getProperty('BTC_RESERVE_AMOUNT') || J_CONFIG.BTC_RESERVE_AMOUNT),
    maxActivePairs: Number(p.getProperty('MAX_ACTIVE_PAIRS') || J_CONFIG.MAX_ACTIVE_PAIRS),
    pairBudgetJpy: Number(
      p.getProperty('PAIR_BUDGET_JPY') != null ? p.getProperty('PAIR_BUDGET_JPY') : J_CONFIG.PAIR_BUDGET_JPY
    ),
    autoLotSizing: String(p.getProperty('AUTO_LOT_SIZING') || String(J_CONFIG.AUTO_LOT_SIZING !== false)) !== 'false',
    effectiveMinLevelJpy: null,
    fullBoxTrap: String(p.getProperty('FULL_BOX_TRAP') || String(J_CONFIG.FULL_BOX_TRAP !== false)) !== 'false',
    runLogIntervalMin: Number(p.getProperty('RUN_LOG_INTERVAL_MIN') || J_CONFIG.RUN_LOG_INTERVAL_MIN),
    excludePairs: jParseExcludePairs_(p.getProperty('J_EXCLUDE_PAIRS')),
    priorityPair: String(p.getProperty('PRIORITY_PAIR') || J_CONFIG.PRIORITY_PAIR || 'btc_jpy').toLowerCase(),
    // 同一口座で他Bot/手動と分離: 自注文IDに一致する約定のみ税務取込
    ownOrdersOnly:
      String(
        p.getProperty('OWN_ORDERS_ONLY') != null
          ? p.getProperty('OWN_ORDERS_ONLY')
          : J_CONFIG.OWN_ORDERS_ONLY_DEFAULT
      ).toLowerCase() === 'true',
    monthlyDownExclude:
      String(
        p.getProperty('MONTHLY_DOWN_EXCLUDE') != null
          ? p.getProperty('MONTHLY_DOWN_EXCLUDE')
          : J_CONFIG.MONTHLY_DOWN_EXCLUDE !== false
      ).toLowerCase() !== 'false',
    monthlySma: Number(p.getProperty('MONTHLY_SMA') || J_CONFIG.MONTHLY_SMA),
    monthlySlopeBars: Number(p.getProperty('MONTHLY_SLOPE_BARS') || J_CONFIG.MONTHLY_SLOPE_BARS),
  };
  return metaLeagueApplyToConfig_('J', cfg, {});
}

/** 銘柄別の日足レンジ上限幅%（BTC=20、その他=15） */
function jGetDailyRangeMaxPct_(pair, cfg) {
  cfg = cfg || jGetConfig_();
  if (String(pair || '').toLowerCase() === 'btc_jpy') {
    return cfg.dailyRangeMaxPctBtc != null
      ? cfg.dailyRangeMaxPctBtc
      : J_CONFIG.DAILY_RANGE_MAX_PCT_BTC;
  }
  return cfg.dailyRangeMaxPct != null ? cfg.dailyRangeMaxPct : J_CONFIG.DAILY_RANGE_MAX_PCT;
}

/**
 * 除外銘柄:
 * - シート「J_除外銘柄」がある → シート（＋ Properties 追記）が正本
 * - シート未作成 → Config 既定（＋ Properties）
 */
function jParseExcludePairs_(raw) {
  var out = [];
  var seen = {};
  function add_(list) {
    (list || []).forEach(function (s) {
      var p = String(s || '')
        .trim()
        .toLowerCase();
      if (!p || seen[p]) return;
      seen[p] = true;
      out.push(p);
    });
  }
  var sheetReady = false;
  try {
    sheetReady = jExcludeSheetExists_();
  } catch (e0) {
    sheetReady = false;
  }
  if (sheetReady) {
    try {
      add_(jReadExcludePairsFromSheet_());
    } catch (e1) {
      add_(J_CONFIG.EXCLUDE_PAIRS || []);
    }
  } else {
    add_(J_CONFIG.EXCLUDE_PAIRS || []);
  }
  if (raw && String(raw).trim()) {
    add_(
      String(raw)
        .split(',')
        .map(function (s) {
          return s.trim();
        })
    );
  }
  return out;
}

var J_GLOBAL_STATE_KEY = 'J_GLOBAL';

function jLoadGlobalState_() {
  var raw = PropertiesService.getScriptProperties().getProperty(J_GLOBAL_STATE_KEY);
  if (!raw) {
    return {
      activePairs: [],
      dormantPairs: [],
      paperWallet: null,
      lastRunAt: null,
      lastRunLogAt: null,
      lastError: null,
      /** 前回実行時の口座予算（入金検知用） */
      lastBudgetJpy: null,
      /** 前回の自動ロット計算結果 */
      lastAutoMinLevelJpy: null,
      lastAutoLotFloor: null,
      capitalSnapshot: null,
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

function jSaveGlobalState_(global) {
  PropertiesService.getScriptProperties().setProperty(J_GLOBAL_STATE_KEY, JSON.stringify(global));
}

function jGetBtcReserve_(cfg) {
  cfg = cfg || jGetConfig_();
  return cfg.btcReserve != null ? cfg.btcReserve : J_CONFIG.BTC_RESERVE_AMOUNT;
}

function jStateKey_(pair) {
  return 'J_S_' + String(pair || '').replace(/[^a-z0-9]/gi, '_');
}

function jLoadState_(pair) {
  var raw = PropertiesService.getScriptProperties().getProperty(jStateKey_(pair));
  if (!raw) {
    return {
      mode: 'idle',
      gridLots: [],
      trailHigh: null,
      /** エントリー時に固定するレンジ箱（案D） */
      entryRefLow: null,
      entryRefHigh: null,
      entryBoxAt: null,
      refDailyLow: null,
      refDailyHigh: null,
      lastTrapStep: null,
      lastLevels: null,
      lastRebuildAt: null,
      fullBoxBuilt: false,
      boxLevelPrices: null,
      settled: false,
      lastRunAt: null,
      lastError: null,
    };
  }
  try {
    var s = JSON.parse(raw);
    if (!s.gridLots) s.gridLots = [];
    return s;
  } catch (e) {
    return { mode: 'idle', gridLots: [] };
  }
}

function jSaveState_(pair, state) {
  PropertiesService.getScriptProperties().setProperty(jStateKey_(pair), JSON.stringify(state));
}

function jLog_(msg) {
  var line = '[J][' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') + '] ' + msg;
  Logger.log(line);
  var prev = PropertiesService.getScriptProperties().getProperty('J_LOG') || '';
  PropertiesService.getScriptProperties().setProperty('J_LOG', (line + '\n' + prev).slice(0, 8000));
}

/** 日次メンテ判定用（Asia/Tokyo） */
function jTodayYmd_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
}

/** 全銘柄 state・グローバル・ランキングキャッシュを削除 */
function jResetAllState_() {
  var props = PropertiesService.getScriptProperties();
  var keys = props.getKeys();
  var removed = 0;
  keys.forEach(function (k) {
    if (k === J_GLOBAL_STATE_KEY || String(k).indexOf('J_S_') === 0) {
      props.deleteProperty(k);
      removed += 1;
    }
  });
  if (typeof jClearRankCache_ === 'function') jClearRankCache_();
  jLog_('状態リセット: プロパティ ' + removed + '件削除');
  return removed;
}

/**
 * Script Properties が 50 枠上限に達したときの掃除
 * APIキー・運用設定・アクティブ/休眠 state は残す
 * @return {{before:number, removed:number, after:number, removedKeys:string[]}}
 */
function jPruneScriptPropertiesCaches_() {
  var props = PropertiesService.getScriptProperties();
  var before = props.getKeys().length;
  var global = jLoadGlobalState_();
  var keepState = {};
  (global.activePairs || []).forEach(function (p) {
    keepState[jStateKey_(p)] = true;
  });
  (global.dormantPairs || []).forEach(function (p) {
    keepState[jStateKey_(p)] = true;
  });

  var exact = {
    J_RANK_CACHE: true,
    J_RANK_OFFSET: true,
    J_RANK_SKIP_LISTS: true,
    J_INSTRUMENTS_JSON: true,
    J_LOG: true,
    J_LINE_ERR_FP: true,
    J_LINE_ERR_AT: true,
    J_EXCLUDE_PAIRS: true,
    J_SHEETS_INIT_YMD: true,
  };
  var removedKeys = [];
  props.getKeys().forEach(function (k) {
    var del = false;
    if (exact[k]) del = true;
    else if (String(k).indexOf('J_LT_') === 0) del = true;
    else if (String(k).indexOf('LEAGUE_ADJ_CACHE_') === 0) del = true;
    else if (String(k).indexOf('J_S_') === 0 && !keepState[k]) del = true;
    if (!del) return;
    props.deleteProperty(k);
    removedKeys.push(k);
  });
  try {
    CacheService.getScriptCache().remove('J_RANK_SKIP_LISTS');
  } catch (e) {
    /* ignore */
  }
  var after = props.getKeys().length;
  jLog_('Properties掃除: ' + before + ' → ' + after + '（-' + removedKeys.length + '）');
  return { before: before, removed: removedKeys.length, after: after, removedKeys: removedKeys };
}

function jCountScriptProperties_() {
  return PropertiesService.getScriptProperties().getKeys().length;
}

/** アクティブ銘柄が上限を超えていたら整理 */
function jEnforceMaxActivePairs_(global, cfg) {
  var max = cfg.maxActivePairs || J_CONFIG.MAX_ACTIVE_PAIRS;
  if (!global.activePairs || global.activePairs.length <= max) return [];

  var keep = global.activePairs.slice(0, max);
  var dropped = global.activePairs.slice(max);
  global.activePairs = keep;

  dropped.forEach(function (pair) {
    var idx = global.dormantPairs.indexOf(pair);
    if (idx >= 0) global.dormantPairs.splice(idx, 1);
    var st = jLoadState_(pair);
    st.mode = 'idle';
    st.gridLots = [];
    st.settled = true;
    jSaveState_(pair, st);
    jLog_('アクティブ上限超過で除外: ' + pair);
  });
  return dropped;
}
