var J_SHEET_LOG = 'J_運用ログ';
/** トラップのロット単位で見た運用損益（税務用ではない） */
var J_SHEET_LOT_PROFIT = 'J_運用損益';
/** bitbank API trade_history 実績 */
var J_SHEET_TRADE = 'J_売買履歴';
/** API 実績 移動平均法 譲渡損益明細（申告用） */
var J_SHEET_TAX_DETAIL = 'J_税務明細';
/** 本番発注した自注文ID（同一口座で他Bot/手動と分離するため） */
var J_SHEET_OWN_ORDERS = 'J_自注文ID';
/** 確定申告用: 年次・年次×銘柄のみ（行数が増えない） */
var J_SHEET_TAX_SUMMARY = 'J_税務集計';
var J_SHEET_TAX_MONTHLY = 'J_税務月次';
/** 日次・全日合計のみ（1日1行） */
var J_SHEET_TAX_DAILY = 'J_税務日次';
/** 日次×銘柄（日付ごとに銘柄をまとめる） */
var J_SHEET_TAX_DAILY_ASSET = 'J_税務日次銘柄';
/** 銘柄選定ランキング＋診断 */
var J_SHEET_RANK = 'J_ランキング';
/** 手動・長期除外銘柄（取引対象外。行追加/削除で管理） */
var J_SHEET_EXCLUDE = 'J_除外銘柄';
/** 旧Bot推定シート・移行済み名 */
var J_LEGACY_SHEETS = ['J_損益履歴', 'J_売買履歴_API', 'J_税務明細_API'];

var J_TAX_METRICS_HEADERS_ = [
  '取引回数',
  '取得価額合計(円)',
  '売却価額合計(円)',
  '手数料合計(円)',
  '譲渡損益合計(円)',
];

function jGetLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(J_SHEET_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(J_SHEET_LOG);
    sheet.appendRow([
      '日時',
      '銘柄',
      'モード',
      '現値',
      '間隔',
      '本数',
      'JPY',
      'コイン',
      '詳細',
    ]);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** ロット紐付けの運用損益シート（税務計算ではなくBot成績確認用） */
function jGetLotProfitSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(J_SHEET_LOT_PROFIT);
  var headers = [
    '決済日時',
    '銘柄',
    '買値',
    '売値',
    '数量',
    '買代金(円)',
    '売代金(円)',
    '買手数料(推定円)',
    '売手数料(推定円)',
    '粗利(円)',
    '純損益(推定円)',
    '手数料前提',
    '買注文ID',
    '売注文ID',
    'trapStep',
    'feeWidth',
    'slipWidth',
    'メモ',
  ];
  if (!sheet) {
    sheet = ss.insertSheet(J_SHEET_LOT_PROFIT);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  sheet.getRange(1, 1).setNote(
    '※ 税務用ではありません。トラップの対応ロット（買い段→利確売り）で見た運用損益です。\n' +
      '手数料はBot設定の手数料ロールによる推定値です。確定申告は J_税務明細 / 税理士確認を優先してください。'
  );
  return sheet;
}

/** ロット単位の運用損益を1行追加 */
function jAppendLotProfit_(pair, lot, sellPrice, amount, cfg, tp, sellOrderId) {
  cfg = cfg || jGetConfig_();
  lot = lot || {};
  tp = tp || {};
  var role = cfg.feeRoleProfit || J_CONFIG.FEE_ROLE_FOR_PROFIT || 'maker';
  var buyPrice = Number(lot.price) || 0;
  var sell = Number(sellPrice) || 0;
  var amt = Number(amount) || 0;
  var buyNotional = buyPrice * amt;
  var sellNotional = sell * amt;
  var feePct = jGetFeePct_(pair, role);
  var buyFee = jCalcFeeJpy_(buyNotional, feePct);
  var sellFee = jCalcFeeJpy_(sellNotional, feePct);
  var gross = (sell - buyPrice) * amt;
  var net = gross - buyFee - sellFee;
  jGetLotProfitSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    pair,
    buyPrice,
    sell,
    amt,
    Math.round(buyNotional),
    Math.round(sellNotional),
    buyFee,
    sellFee,
    Math.round(gross),
    Math.round(net),
    role,
    lot.buyOrderId || '',
    sellOrderId || lot.sellOrderId || '',
    tp.trapStep != null ? tp.trapStep : '',
    tp.feeWidth != null ? tp.feeWidth : '',
    tp.slipWidth != null ? tp.slipWidth : '',
    'ロット紐付け（税務移動平均ではない）',
  ]);
}

/** 税務集計シートを用意（1行目ヘッダ、注記は A1 メモ） */
function jEnsureTaxAggSheet_(name, headers, note) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else {
    if (sheet.getFilter()) sheet.getFilter().remove();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    // 旧: 2行目に注記があった場合はクリアしてデータ領域へ
    if (sheet.getLastRow() >= 2) {
      var maybeNote = String(sheet.getRange(2, 1).getValue() || '');
      if (maybeNote.indexOf('※') === 0) {
        sheet.getRange(2, 1, 1, headers.length).clearContent();
      }
    }
  }
  sheet.getRange(1, 1).setNote(note || '');
  return sheet;
}

function jClearTaxAggBody_(sheet) {
  if (sheet.getFilter()) sheet.getFilter().remove();
  if (sheet.getLastRow() > 1) {
    sheet.deleteRows(2, sheet.getLastRow() - 1);
  }
}

function jWriteTaxAggBody_(sheet, rows, cols) {
  jClearTaxAggBody_(sheet);
  if (rows && rows.length) {
    sheet.getRange(2, 1, rows.length, cols).setValues(rows);
    sheet.getRange(1, 1, rows.length + 1, cols).createFilter();
  }
}

/** yyyy-MM-dd → 曜日（日〜土） */
function jWeekdayJaFromYmd_(ymd) {
  var p = String(ymd || '').split('-');
  if (p.length < 3) return '';
  var t = Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 3, 0, 0);
  return ['日', '月', '火', '水', '木', '金', '土'][new Date(t).getUTCDay()] || '';
}

/** 年次・年次×銘柄（確定申告向けの要約） */
function jGetTaxSummarySheet_() {
  return jEnsureTaxAggSheet_(
    J_SHEET_TAX_SUMMARY,
    ['年', '暗号資産'].concat(J_TAX_METRICS_HEADERS_),
    '※ 年次のみ。月次→「J_税務月次」／日次→「J_税務日次」「J_税務日次銘柄」。メニュー「15」で再計算'
  );
}

/** 月次・月次×銘柄（月ごとにまとめる・新しい月が上） */
function jGetTaxMonthlySheet_() {
  return jEnsureTaxAggSheet_(
    J_SHEET_TAX_MONTHLY,
    ['年', '月', '暗号資産'].concat(J_TAX_METRICS_HEADERS_),
    '※ 月ごとに「(全銘柄)」→銘柄別。新しい月が上。日次は「J_税務日次」'
  );
}

/** 日次・全日合計のみ（1日1行・新しい日が上） */
function jGetTaxDailySheet_() {
  return jEnsureTaxAggSheet_(
    J_SHEET_TAX_DAILY,
    ['年月日', '曜日'].concat(J_TAX_METRICS_HEADERS_),
    '※ 1日1行の合計のみ（見やすさ優先）。銘柄内訳は「J_税務日次銘柄」。フィルタ可'
  );
}

/** 日次×銘柄（同じ日の銘柄をまとめて表示） */
function jGetTaxDailyAssetSheet_() {
  return jEnsureTaxAggSheet_(
    J_SHEET_TAX_DAILY_ASSET,
    ['年月日', '曜日', '暗号資産'].concat(J_TAX_METRICS_HEADERS_),
    '※ 日付ごとに銘柄を連続表示（空行で区切り）。フィルタで銘柄絞り込み可'
  );
}

function jIsBotTradeSheet_(sheet) {
  return sheet && String(sheet.getRange(1, 1).getValue()) === '日時';
}

function jIsApiTaxDetailSheet_(sheet) {
  return sheet && sheet.getLastColumn() >= 16;
}

/** 旧Bot推定シートを削除し、_API シートを正式名へ移行 */
function jCleanupLegacySheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return;

  function deleteIfExists(name) {
    var sh = ss.getSheetByName(name);
    if (sh) ss.deleteSheet(sh);
  }

  var apiTrade = ss.getSheetByName('J_売買履歴_API');
  var trade = ss.getSheetByName(J_SHEET_TRADE);
  if (apiTrade) {
    if (trade && jIsBotTradeSheet_(trade)) {
      ss.deleteSheet(trade);
      trade = null;
    }
    if (!trade) apiTrade.setName(J_SHEET_TRADE);
    else deleteIfExists('J_売買履歴_API');
  } else if (trade && jIsBotTradeSheet_(trade)) {
    ss.deleteSheet(trade);
  }

  var apiTax = ss.getSheetByName('J_税務明細_API');
  var tax = ss.getSheetByName(J_SHEET_TAX_DETAIL);
  if (apiTax) {
    if (tax && !jIsApiTaxDetailSheet_(tax)) {
      ss.deleteSheet(tax);
      tax = null;
    }
    if (!tax) apiTax.setName(J_SHEET_TAX_DETAIL);
    else deleteIfExists('J_税務明細_API');
  } else if (tax && !jIsApiTaxDetailSheet_(tax)) {
    ss.deleteSheet(tax);
  }

  J_LEGACY_SHEETS.forEach(deleteIfExists);
}

function jInitSheets_() {
  jCleanupLegacySheets_();
  jGetLogSheet_();
  jGetLotProfitSheet_();
  jGetTradeSheet_();
  jGetTaxDetailSheet_();
  jGetTaxSummarySheet_();
  jGetTaxMonthlySheet_();
  jGetTaxDailySheet_();
  jGetTaxDailyAssetSheet_();
  jGetRankSheet_();
  jEnsureExcludeSheet_();
}

var J_SHEETS_INIT_YMD_KEY = 'J_SHEETS_INIT_YMD';

/** シート存在確認を日1回だけ実行 */
function jEnsureSheetsInitializedDaily_(force) {
  var props = PropertiesService.getScriptProperties();
  var today = jTodayYmd_();
  if (!force && props.getProperty(J_SHEETS_INIT_YMD_KEY) === today) return false;
  jInitSheets_();
  props.setProperty(J_SHEETS_INIT_YMD_KEY, today);
  jLog_('シート確認（日次）');
  return true;
}

/** J_税務明細（API実績）から年次・月次・日次シートを再計算 */
function jRefreshTaxSummary_() {
  jGetTaxSummarySheet_();
  jGetTaxMonthlySheet_();
  jGetTaxDailySheet_();
  jGetTaxDailyAssetSheet_();
  if (jRefreshTaxSummaryFromDetail_(J_SHEET_TAX_DETAIL)) return;
  SpreadsheetApp.getUi().alert(
    '税務明細にデータがありません。\n' +
      'Bot運用開始後、約定が発生すると自動で記録されます。'
  );
}

function jShouldAppendRunLog_(global, cfg, hasActivity) {
  if (hasActivity) return true;
  var intervalMin = cfg.runLogIntervalMin || J_CONFIG.RUN_LOG_INTERVAL_MIN;
  if (!global.lastRunLogAt) return true;
  var elapsed = (Date.now() - new Date(global.lastRunLogAt).getTime()) / 60000;
  return elapsed >= intervalMin;
}

function jAppendRunLog_(pair, ticker, assets, state, detail) {
  jGetLogSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    pair,
    state.mode || '',
    ticker ? ticker.last : '',
    state.lastTrapStep || '',
    state.lastLevels || '',
    assets.jpy != null ? Math.round(assets.jpy) : '',
    assets.coin != null ? assets.coin : '',
    detail || '',
  ]);
}

/** 運用ログのみ消去（売買・税務は API 実績のため保持） */
function jClearSheetData_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(J_SHEET_LOG);
  if (sheet) {
    var last = sheet.getLastRow();
    if (last > 1) sheet.deleteRows(2, last - 1);
  }
}

/** ヘッダ行以外を削除（シートが無い場合は何もしない） */
function jClearSheetBodyKeepHeader_(sheetName, headerRows) {
  headerRows = headerRows != null ? headerRows : 1;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return { ok: false, reason: 'no-ss' };
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { ok: false, reason: 'missing' };
  try {
    if (sheet.getFilter()) sheet.getFilter().remove();
  } catch (eFilter) {
    /* ignore */
  }
  var lastRow = sheet.getLastRow();
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  if (lastRow <= headerRows) return { ok: true, cleared: 0, name: sheetName };

  // clearContent の方が deleteRows より失敗しにくい（フィルタ・結合セル対策）
  var numRows = lastRow - headerRows;
  try {
    sheet.getRange(headerRows + 1, 1, numRows, lastCol).clearContent();
  } catch (eClear) {
    try {
      sheet.getRange(headerRows + 1, 1, lastRow, lastCol).clearContent();
    } catch (eClear2) {
      return { ok: false, reason: String(eClear2.message || eClear2), name: sheetName };
    }
  }
  // 行を詰める（失敗しても中身は空）
  try {
    if (sheet.getLastRow() > headerRows) {
      sheet.deleteRows(headerRows + 1, sheet.getLastRow() - headerRows);
    }
  } catch (eDel) {
    /* ignore */
  }
  return { ok: true, cleared: numRows, name: sheetName };
}

/**
 * 税務・損益・売買履歴をゼロから（今からの約定のみ）
 * J_LAST_API_TRADE_MS を現在に設定し、過去約定は取り込まない
 * @return {{ok:boolean, results:Object[], errors:string[]}}
 */
function jResetAccountingFromNow_() {
  var targets = [
    [J_SHEET_TRADE, 1],
    [J_SHEET_TAX_DETAIL, 2], // 1ヘッダ + 2注記
    [J_SHEET_TAX_SUMMARY, 1],
    [J_SHEET_TAX_MONTHLY, 1],
    [J_SHEET_TAX_DAILY, 1],
    [J_SHEET_TAX_DAILY_ASSET, 1],
    [J_SHEET_LOT_PROFIT, 1],
    [J_SHEET_OWN_ORDERS, 1],
    [J_SHEET_LOG, 1],
  ];
  var results = [];
  var errors = [];
  targets.forEach(function (t) {
    var r = jClearSheetBodyKeepHeader_(t[0], t[1]);
    results.push(r);
    if (!r.ok && r.reason !== 'missing') {
      errors.push((r.name || t[0]) + ': ' + (r.reason || 'fail'));
    }
  });

  // ランキング診断も本番前に空へ（除外銘柄シートは残す）
  try {
    var rank = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(J_SHEET_RANK);
    if (rank) rank.clear();
  } catch (eRank) {
    errors.push('J_ランキング: ' + (eRank.message || eRank));
  }

  var props = PropertiesService.getScriptProperties();
  props.setProperty(J_LAST_API_TRADE_MS_KEY, String(Date.now()));
  SpreadsheetApp.flush();
  jLog_(
    '税務・損益リセット: クリア' +
      results.filter(function (x) {
        return x.ok && x.cleared > 0;
      }).length +
      'シート / エラー' +
      errors.length
  );
  return { ok: errors.length === 0, results: results, errors: errors };
}

function jGetRankSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(J_SHEET_RANK);
  if (!sheet) sheet = ss.insertSheet(J_SHEET_RANK);
  return sheet;
}

/**
 * 取引対象外の除外銘柄シート
 * 列: 銘柄 / 名称 / 理由 / 登録日 / メモ
 * シートが空（または新規）のときだけ Config 既定をシード。以降はシートの行が正本。
 */
function jEnsureExcludeSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(J_SHEET_EXCLUDE);
  var headers = ['銘柄', '名称', '理由', '登録日', 'メモ'];
  var created = false;
  if (!sheet) {
    sheet = ss.insertSheet(J_SHEET_EXCLUDE);
    created = true;
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.getRange(1, 1, 1, headers.length).setBackground('#fce8e6');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 120);
  sheet.setColumnWidth(2, 120);
  sheet.setColumnWidth(3, 280);
  sheet.setColumnWidth(4, 110);
  sheet.setColumnWidth(5, 200);
  sheet.getRange(1, 1).setNote(
    'このシートの銘柄は新規選定・ランキング対象外です。\n' +
      '行の追加／削除で管理（銘柄列は xxx_jpy）。\n' +
      '空のときだけ Config 既定を自動投入します。'
  );

  var existing = {};
  var last = sheet.getLastRow();
  if (last >= 2) {
    sheet
      .getRange(2, 1, last - 1, 1)
      .getValues()
      .forEach(function (row) {
        var p = String(row[0] || '')
          .trim()
          .toLowerCase();
        if (p) existing[p] = true;
      });
  }

  var shouldSeed = created || Object.keys(existing).length === 0;
  if (shouldSeed) {
    var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    var toAdd = [];
    (J_CONFIG.EXCLUDE_PAIRS || []).forEach(function (pair) {
      var p = String(pair || '')
        .trim()
        .toLowerCase();
      if (!p || existing[p]) return;
      var label = p;
      try {
        var inst = jGetInstrument_(p);
        if (inst && inst.label) label = inst.label;
      } catch (e) {
        /* ignore */
      }
      toAdd.push([p, label, '長期ダウントレンド（初期除外）', today, '']);
      existing[p] = true;
    });
    if (toAdd.length) {
      sheet.getRange(2, 1, toAdd.length, headers.length).setValues(toAdd);
      jLog_('除外銘柄シートに初期 ' + toAdd.length + '件を投入');
    }
  }
  try {
    // シート正本に寄せる（旧 Properties 一括除外はクリア）
    PropertiesService.getScriptProperties().setProperty('J_EXCLUDE_PAIRS', '');
  } catch (eProp) {
    /* ignore */
  }
  return sheet;
}

/** シート上の除外銘柄一覧（小文字 pair） */
function jReadExcludePairsFromSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return [];
  var sheet = ss.getSheetByName(J_SHEET_EXCLUDE);
  if (!sheet) return [];
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var out = [];
  var seen = {};
  sheet
    .getRange(2, 1, last - 1, 1)
    .getValues()
    .forEach(function (row) {
      var p = String(row[0] || '')
        .trim()
        .toLowerCase();
      if (!p || p === '銘柄' || seen[p]) return;
      seen[p] = true;
      out.push(p);
    });
  return out;
}

function jExcludeSheetExists_() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    return !!(ss && ss.getSheetByName(J_SHEET_EXCLUDE));
  } catch (e) {
    return false;
  }
}

/**
 * ランキング結果＋診断＋除外一覧を J_ランキング へ書き出し
 * レイアウト: 診断 → 除外・NG一覧 → 候補ランキング
 * @param {Array} ranked jRankCandidatePairs_ の戻り（または cache.rows）
 * @param {Object} opts { stats, cache, cfg, skipLists }
 */
function jWriteRankSheet_(ranked, opts) {
  opts = opts || {};
  var cfg = opts.cfg || jGetConfig_();
  var stats = opts.stats || {};
  var cache = opts.cache || {};
  var skipLists =
    opts.skipLists || cache.skipLists || jLoadRankSkipLists_() || jEmptyRankSkipLists_();
  var sheet = jGetRankSheet_();
  sheet.clear();

  var updatedAt = cache.updatedAt
    ? Utilities.formatDate(new Date(cache.updatedAt), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss')
    : Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var progress = (cache.progress != null ? cache.progress : stats.scanned) || 0;
  var total = cache.total != null ? cache.total : '?';
  var complete = cache.complete === true;

  var diag = [
    ['J_ランキング（銘柄選定）', ''],
    ['更新日時', updatedAt],
    ['状態', complete ? '完了' : 'スキャン中（メニュー3を再実行で続き）'],
    ['進捗', progress + ' / ' + total],
    ['レンジOK', stats.rangeOk != null ? stats.rangeOk : ''],
    ['月足↓除外', stats.monthlyDown != null ? stats.monthlyDown : ''],
    ['日足不足', stats.dailyShort != null ? stats.dailyShort : ''],
    ['レンジNG', stats.rangeNg != null ? stats.rangeNg : ''],
    ['APIエラー', stats.errors != null ? stats.errors : ''],
    ['候補本数(グリッド可)', stats.hasLevels != null ? stats.hasLevels : ''],
    [
      '日足レンジ判定',
      '過去' +
        (cfg.dailyLookback || 20) +
        '日 高安幅 ≤ ' +
        (cfg.dailyRangeMaxPct != null ? cfg.dailyRangeMaxPct : 18) +
        '%（BTC ≤ ' +
        (cfg.dailyRangeMaxPctBtc != null ? cfg.dailyRangeMaxPctBtc : 20) +
        '%）',
    ],
    [
      '月足除外',
      cfg.monthlyDownExclude === false ? 'オフ' : 'オン（月足↓は新規対象外）',
    ],
    ['MIN_LEVEL_JPY', jGetEffectiveMinLevelJpy_(cfg)],
    ['表示上位', J_CONFIG.RANK_TOP_N || 5],
  ];
  sheet.getRange(1, 1, diag.length, 2).setValues(diag);
  sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
  sheet.getRange(1, 1).setFontSize(12);
  sheet.setColumnWidth(1, 140);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 480);

  // —— 除外・NG一覧（先に出す）——
  var skipTitleRow = diag.length + 2;
  sheet.getRange(skipTitleRow, 1).setValue('【除外・NG一覧】');
  sheet.getRange(skipTitleRow, 1).setFontWeight('bold');
  var skipHeaderRow = skipTitleRow + 1;
  sheet.getRange(skipHeaderRow, 1, 1, 3).setValues([['区分', '銘柄', '理由']]);
  sheet.getRange(skipHeaderRow, 1, 1, 3).setFontWeight('bold');
  sheet.getRange(skipHeaderRow, 1, 1, 3).setBackground('#f3f3f3');

  var skipRows = [];
  function pushSkip_(label, list) {
    (list || []).forEach(function (item) {
      if (!item) return;
      var p = typeof item === 'string' ? item : item.pair;
      var reason = typeof item === 'string' ? '' : item.reason;
      skipRows.push([label, p || '', reason != null ? String(reason) : '']);
    });
  }
  pushSkip_('月足↓除外', skipLists.monthlyDown);
  pushSkip_('レンジNG', skipLists.rangeNg);
  pushSkip_('日足不足', skipLists.dailyShort);
  pushSkip_('本数0', skipLists.noLevels);
  pushSkip_('APIエラー', skipLists.errors);

  skipRows.sort(function (a, b) {
    var c0 = String(a[0]).localeCompare(String(b[0]));
    if (c0 !== 0) return c0;
    return String(a[1]).localeCompare(String(b[1]));
  });

  var skipDataRow = skipHeaderRow + 1;
  if (!skipRows.length) {
    var skipCount =
      (Number(stats.monthlyDown) || 0) +
      (Number(stats.rangeNg) || 0) +
      (Number(stats.dailyShort) || 0) +
      (Number(stats.errors) || 0);
    var hint =
      skipCount > 0
        ? '件数はあるが明細が空です。「3b. ランキング強制更新」で再スキャンしてください。'
        : '（除外なし／まだスキャン途中 — 「3」または「3b」を実行）';
    sheet.getRange(skipDataRow, 1).setValue(hint);
  } else {
    sheet.getRange(skipDataRow, 1, skipRows.length, 3).setValues(skipRows);
  }

  // —— 候補ランキング ——
  var candTitleRow = skipDataRow + Math.max(1, skipRows.length) + 2;
  sheet.getRange(candTitleRow, 1).setValue('【候補ランキング】');
  sheet.getRange(candTitleRow, 1).setFontWeight('bold');

  var headerRow = candTitleRow + 1;
  var headers = [
    '順位',
    '銘柄',
    '名称',
    '変動倍率',
    'トラップ間隔(円)',
    '間隔%',
    '本数',
    '日中幅(円)',
    '1セット(円)',
    '最悪グリッド(円)',
    '1R純益(maker)',
    '日足幅%',
    '現値',
    '箱安',
    '箱高',
    'スコア',
  ];
  sheet.getRange(headerRow, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(headerRow, 1, 1, headers.length).setFontWeight('bold');
  sheet.getRange(headerRow, 1, 1, headers.length).setBackground('#e8f0fe');

  ranked = ranked || [];
  var bodyStart = headerRow + 1;
  if (!ranked.length) {
    sheet.getRange(bodyStart, 1).setValue('候補なし');
  } else {
    var rows = [];
    for (var i = 0; i < ranked.length; i++) {
      var r = ranked[i] || {};
      var net = r.roundProfitMaker ? r.roundProfitMaker.netJpy : '';
      rows.push([
        i + 1,
        r.pair || '',
        r.label || '',
        r.moveStepRatio != null ? r.moveStepRatio : '',
        r.trapStep != null ? r.trapStep : '',
        r.trapStepPct != null ? Math.round(r.trapStepPct * 100) / 100 : '',
        r.levels != null ? r.levels : '',
        r.intradayMoveJpy != null ? r.intradayMoveJpy : '',
        r.oneSetJpy != null ? r.oneSetJpy : '',
        r.worstCaseJpy != null ? r.worstCaseJpy : '',
        net,
        r.dailyWidthPct != null ? Math.round(r.dailyWidthPct * 100) / 100 : '',
        r.last != null ? r.last : '',
        r.refDailyLow != null ? r.refDailyLow : '',
        r.refDailyHigh != null ? r.refDailyHigh : '',
        r.selectScore != null ? r.selectScore : '',
      ]);
    }
    sheet.getRange(bodyStart, 1, rows.length, headers.length).setValues(rows);
  }
  return sheet;
}
