var K_SHEET_LOG = 'K_運用ログ';
/** アクティブ／休眠／保有の一覧 */
var K_SHEET_STATUS = 'K_ステータス';
/** bitbank API trade_history 実績（税務用） */
var K_SHEET_TRADE = 'K_売買履歴';
/** 紙トレ／Bot推定の売買メモ（申告用ではない） */
var K_SHEET_PAPER_TRADE = 'K_紙トレ売買';
/** ポジション単位の運用損益（税務用ではない） */
var K_SHEET_LOT_PROFIT = 'K_運用損益';
/** 運用損益の日次合計（税務用ではない） */
var K_SHEET_OP_DAILY = 'K_運用日次';
/** API 実績 移動平均法 譲渡損益明細（申告用） */
var K_SHEET_TAX_DETAIL = 'K_税務明細';
var K_SHEET_TAX_SUMMARY = 'K_税務集計';
/** 本番発注した自注文ID（同一口座で他Bot/手動と分離するため） */
var K_SHEET_OWN_ORDERS = 'K_自注文ID';

function kGetLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(K_SHEET_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(K_SHEET_LOG);
    sheet.appendRow(['日時', '銘柄', 'モード', '現値', '買値', '利確', 'JPY', 'コイン', '詳細']);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function kGetStatusSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(K_SHEET_STATUS);
  if (!sheet) {
    sheet = ss.insertSheet(K_SHEET_STATUS);
  }
  return sheet;
}

/**
 * アクティブ／休眠のみを K_ステータス に軽量更新（相場判定APIは呼ばない）
 * @param {{ force?: boolean }} opts
 */
function kUpdateStatusSheet_(cfg, global, opts) {
  opts = opts || {};
  cfg = cfg || kGetConfig_();
  global = global || kLoadGlobalState_();

  var intervalMin =
    cfg.statusSheetIntervalMin != null
      ? cfg.statusSheetIntervalMin
      : K_CONFIG.STATUS_SHEET_INTERVAL_MIN != null
        ? K_CONFIG.STATUS_SHEET_INTERVAL_MIN
        : 60;
  if (!opts.force && global.lastStatusSheetAt) {
    var elapsed = (Date.now() - new Date(global.lastStatusSheetAt).getTime()) / 60000;
    if (elapsed < intervalMin) return false;
  }

  var sheet = kGetStatusSheet_();
  var headers = ['更新日時', '区分', '銘柄'];
  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var rows = [];
  var seen = {};

  function pushPair_(pair, kind) {
    if (!pair || seen[pair]) return;
    seen[pair] = true;
    rows.push([now, kind, pair]);
  }

  (global.activePairs || []).forEach(function (p) {
    pushPair_(p, 'アクティブ');
  });
  (global.dormantPairs || []).forEach(function (p) {
    pushPair_(p, '休眠');
  });

  // getRange(row, column, numRows, numColumns) ※第3引数は行数
  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.getRange(2, 1, 1, headers.length).setValues([
    ['※ ' + intervalMin + '分に1回更新（アクティブ／休眠のみ。負荷軽減）', '', ''],
  ]);
  if (rows.length) {
    sheet.getRange(3, 1, rows.length, headers.length).setValues(rows);
  } else {
    sheet.getRange(3, 1, 1, headers.length).setValues([[now, 'なし', '（空）']]);
  }

  global.lastStatusSheetAt = new Date().toISOString();
  return true;
}

function kGetPaperTradeSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(K_SHEET_PAPER_TRADE);
  if (!sheet) {
    sheet = ss.insertSheet(K_SHEET_PAPER_TRADE);
    sheet.appendRow(['日時', '銘柄', '売買', '価格', '数量', 'メモ']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** ポジション単位の運用損益（税務ではない） */
function kGetLotProfitSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(K_SHEET_LOT_PROFIT);
  var headers = [
    '決済日時',
    '年月日',
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
    '目標純益(円)',
    '手数料前提',
    '買注文ID',
    '売注文ID',
    'メモ',
  ];
  if (!sheet) {
    sheet = ss.insertSheet(K_SHEET_LOT_PROFIT);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  sheet.getRange(1, 1).setNote(
    '※ 税務用ではありません。Botのポジション（買→利確売）単位の運用損益です。\n' +
      '日次合計は「K_運用日次」。確定申告は K_税務明細 / 税理士確認を優先してください。'
  );
  return sheet;
}

/** 運用損益の日次合計 */
function kGetOpDailySheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(K_SHEET_OP_DAILY);
  var headers = [
    '年月日',
    '曜日',
    '決済回数',
    '粗利合計(円)',
    '手数料合計(推定円)',
    '純損益合計(推定円)',
  ];
  if (!sheet) {
    sheet = ss.insertSheet(K_SHEET_OP_DAILY);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  sheet.getRange(1, 1).setNote(
    '※ 税務用ではありません。「K_運用損益」から日次再集計します。\n' +
      'メニュー「運用日次を更新」または利確時に自動更新。'
  );
  return sheet;
}

function kWeekdayJaFromYmd_(ymd) {
  var p = String(ymd || '').split('-');
  if (p.length < 3) return '';
  var t = Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 3, 0, 0);
  return ['日', '月', '火', '水', '木', '金', '土'][new Date(t).getUTCDay()] || '';
}

/**
 * ポジション利確の運用損益を1行追加し、日次を再集計
 * @param {object} pos state.position
 */
function kAppendLotProfit_(pair, pos, sellPrice, amount, cfg, sellOrderId) {
  cfg = cfg || kGetConfig_();
  pos = pos || {};
  var buyRole = cfg.tpFeeBuyRole || cfg.feeRoleCapital || K_CONFIG.TP_FEE_BUY_ROLE || 'taker';
  var sellRole = cfg.tpFeeSellRole || cfg.feeRoleProfit || K_CONFIG.TP_FEE_SELL_ROLE || 'maker';
  var buyPrice = Number(pos.buyPrice) || 0;
  var sell = Number(sellPrice) || 0;
  var amt = Number(amount) || 0;
  var buyNotional = buyPrice * amt;
  var sellNotional = sell * amt;
  var buyFee = kCalcFeeJpy_(buyNotional, kGetFeePct_(pair, buyRole));
  var sellFee = kCalcFeeJpy_(sellNotional, kGetFeePct_(pair, sellRole));
  var gross = (sell - buyPrice) * amt;
  var net = gross - buyFee - sellFee;
  var now = new Date();
  var ymd = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');
  var targetNet = pos.targetNetJpy != null ? pos.targetNetJpy : cfg.targetNetJpy;
  kGetLotProfitSheet_().appendRow([
    Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    ymd,
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
    targetNet != null ? targetNet : '',
    buyRole + '/' + sellRole,
    pos.buyOrderId || '',
    sellOrderId || pos.sellOrderId || '',
    'ポジション紐付け（税務移動平均ではない）',
  ]);
  try {
    kRefreshOpDailyFromLotProfit_();
  } catch (e) {
    kLog_('運用日次更新失敗: ' + (e.message || e));
  }
}

/** K_運用損益 → K_運用日次 を再集計 */
function kRefreshOpDailyFromLotProfit_() {
  var detail = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(K_SHEET_LOT_PROFIT);
  var daily = kGetOpDailySheet_();
  if (daily.getFilter()) daily.getFilter().remove();
  if (daily.getLastRow() > 1) {
    daily.deleteRows(2, daily.getLastRow() - 1);
  }
  if (!detail || detail.getLastRow() < 2) return { days: 0 };

  var n = detail.getLastRow() - 1;
  var values = detail.getRange(2, 1, n, 12).getValues();
  var byDay = {};
  values.forEach(function (r) {
    var ymd = String(r[1] || '').trim();
    if (!ymd && r[0]) {
      var ms =
        Object.prototype.toString.call(r[0]) === '[object Date]' && !isNaN(r[0].getTime())
          ? r[0].getTime()
          : 0;
      if (ms) ymd = Utilities.formatDate(new Date(ms), 'Asia/Tokyo', 'yyyy-MM-dd');
    }
    if (!ymd) return;
    if (!byDay[ymd]) byDay[ymd] = { count: 0, gross: 0, fee: 0, net: 0 };
    byDay[ymd].count += 1;
    byDay[ymd].gross += Number(r[10]) || 0;
    byDay[ymd].fee += (Number(r[8]) || 0) + (Number(r[9]) || 0);
    byDay[ymd].net += Number(r[11]) || 0;
  });

  var keys = Object.keys(byDay).sort().reverse();
  var rows = keys.map(function (d) {
    var a = byDay[d];
    return [d, kWeekdayJaFromYmd_(d), a.count, Math.round(a.gross), Math.round(a.fee), Math.round(a.net)];
  });
  if (rows.length) {
    daily.getRange(2, 1, rows.length, 6).setValues(rows);
    daily.getRange(1, 1, rows.length + 1, 6).createFilter();
  }
  return { days: rows.length };
}

/** 年次・月次集計（K_税務明細 = API実績 移動平均） */
function kGetTaxSummarySheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(K_SHEET_TAX_SUMMARY);
  if (!sheet) {
    sheet = ss.insertSheet(K_SHEET_TAX_SUMMARY);
    sheet.appendRow([
      '集計種別',
      '年',
      '月',
      '暗号資産',
      '取引回数',
      '取得価額合計(円)',
      '売却価額合計(円)',
      '手数料合計(円)',
      '譲渡損益合計(円)',
      '備考',
    ]);
    sheet.getRange(1, 1, 1, 10).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange(2, 1, 1, 10).setValue(
      '※ メニュー「税務集計を更新」で K_税務明細（bitbank API実績）から再計算'
    );
  }
  return sheet;
}

/** 旧 Bot 形式の K_売買履歴 を紙トレ用へ退避し、API用シートを用意 */
function kMigrateTradeSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return;

  var trade = ss.getSheetByName(K_SHEET_TRADE);
  if (trade && String(trade.getRange(1, 1).getValue()) === '日時') {
    var paper = ss.getSheetByName(K_SHEET_PAPER_TRADE);
    if (!paper) {
      trade.setName(K_SHEET_PAPER_TRADE);
    } else {
      // 紙トレシートが既にある場合は旧データを破棄して API 形式へ
      ss.deleteSheet(trade);
    }
  }
}

function kInitSheets_() {
  kMigrateTradeSheets_();
  kGetLogSheet_();
  kGetStatusSheet_();
  kGetPaperTradeSheet_();
  kGetLotProfitSheet_();
  kGetOpDailySheet_();
  kGetApiTradeSheet_();
  kGetTaxDetailSheet_();
  kGetTaxSummarySheet_();
  kEnsureTrendSheetHeader_(kGetTrendSheet_());
}

var K_SHEETS_INIT_YMD_KEY = 'K_SHEETS_INIT_YMD';

/** シート存在確認を日1回だけ実行 */
function kEnsureSheetsInitializedDaily_(force) {
  var props = PropertiesService.getScriptProperties();
  var today = kTodayYmd_();
  if (!force && props.getProperty(K_SHEETS_INIT_YMD_KEY) === today) return false;
  kInitSheets_();
  props.setProperty(K_SHEETS_INIT_YMD_KEY, today);
  kLog_('シート確認（日次）');
  return true;
}

/** Bot／紙トレ売買メモ（申告用ではない） */
function kAppendTradeLog_(pair, side, price, amount, memo) {
  kGetPaperTradeSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    pair,
    side,
    price,
    amount,
    memo || '',
  ]);
}

function kRefreshTaxSummary_() {
  kGetTaxSummarySheet_();
  if (kRefreshTaxSummaryFromDetail_(K_SHEET_TAX_DETAIL)) return;
  SpreadsheetApp.getUi().alert(
    '税務明細にデータがありません。\n' +
      'メニュー「取引履歴を同期」で bitbank API から取込むか、\n' +
      '本番(DRY_RUN=false)運用後に自動記録されます。'
  );
}

function kShouldAppendRunLog_(global, cfg, hasActivity) {
  if (hasActivity) return true;
  var intervalMin = cfg.runLogIntervalMin || K_CONFIG.RUN_LOG_INTERVAL_MIN;
  if (!global.lastRunLogAt) return true;
  var elapsed = (Date.now() - new Date(global.lastRunLogAt).getTime()) / 60000;
  return elapsed >= intervalMin;
}

function kAppendRunLog_(pair, ticker, assets, state, detail) {
  var pos = state.position;
  kGetLogSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    pair,
    state.mode || '',
    ticker ? ticker.last : '',
    pos ? pos.buyPrice : '',
    pos ? pos.tpPrice : '',
    assets.jpy != null ? Math.round(assets.jpy) : '',
    assets.coin != null ? assets.coin : '',
    detail || '',
  ]);
}
