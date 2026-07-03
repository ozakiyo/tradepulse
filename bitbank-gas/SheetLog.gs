var BB_SHEET_NAME = '運用ログ';
var BB_TRADE_SHEET = '売買履歴';
var BB_DAILY_SHEET = '日次集計';
var BB_TRIAL_SHEET = '2週間試験';

function bbGetLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(BB_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(BB_SHEET_NAME);
    sheet.appendRow([
      '日時',
      '環境',
      '操作',
      'BTC価格',
      'モード',
      'ADX',
      'ER',
      'JPY残高',
      'BTC残高',
      '詳細',
    ]);
    sheet.getRange(1, 1, 1, 10).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function bbGetTradeSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(BB_TRADE_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(BB_TRADE_SHEET);
    sheet.appendRow([
      '日時',
      '売買',
      '価格',
      '数量(BTC)',
      '約定',
      '手数料(円)',
      '環境',
      '損益(円)',
      'メモ',
    ]);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function bbGetDailySummarySheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(BB_DAILY_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(BB_DAILY_SHEET);
    sheet.appendRow([
      '日付',
      'フェーズ',
      '環境切替回数',
      '終了時環境',
      '取引回数',
      '買い回数',
      '売り回数',
      '実現損益(円)',
      '手数料(円)',
      '純損益(円)',
      '含み損益(円)',
      'JPY残高(終値)',
      'BTC残高(終値)',
      'BTC終値',
      '24h変動(%)',
      '環境精度',
      '環境精度メモ',
      'LINE通知回数',
      'ルール遵守',
      '日次損失上限',
      'メモ',
    ]);
    sheet.getRange(1, 1, 1, 21).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange('A2').setValue(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'));
    sheet.getRange('B2').setValue('DRY_RUN');
    sheet.getRange('E2').setFormula(
      '=COUNTIFS(' +
        BB_TRADE_SHEET +
        '!$A:$A,">="&$A2,' +
        BB_TRADE_SHEET +
        '!$A:$A,"<"&$A2+1,' +
        BB_TRADE_SHEET +
        '!$B:$B,"<>")'
    );
    sheet.getRange('F2').setFormula(
      '=COUNTIFS(' +
        BB_TRADE_SHEET +
        '!$A:$A,">="&$A2,' +
        BB_TRADE_SHEET +
        '!$A:$A,"<"&$A2+1,' +
        BB_TRADE_SHEET +
        '!$B:$B,"買い")'
    );
    sheet.getRange('G2').setFormula(
      '=COUNTIFS(' +
        BB_TRADE_SHEET +
        '!$A:$A,">="&$A2,' +
        BB_TRADE_SHEET +
        '!$A:$A,"<"&$A2+1,' +
        BB_TRADE_SHEET +
        '!$B:$B,"売り")'
    );
    sheet.getRange('J2').setFormula('=IF(OR(H2="-",H2=""),"-",H2-IF(I2="",0,I2))');
    sheet.getRange('S2').setValue('OK');
    sheet.getRange('T2').setValue('-');
    sheet.getRange(2, 1, 1, 21).setBackground('#f3f3f3');
    sheet.getRange('A2').setNote('サンプル行。2行目以降をコピーして毎日追加');
  }
  return sheet;
}

function bbGetTrialChecklistSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(BB_TRIAL_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(BB_TRIAL_SHEET);
    var days = [
      'Day0',
      'D1',
      'D2',
      'D3',
      'D4',
      'D5',
      'D6',
      'D7',
      'D8',
      'D9',
      'D10',
      'D11',
      'D12',
      'D13',
      'D14',
    ];
    var header = ['チェック項目', 'Day0'].concat(days.slice(1));
    sheet.appendRow(header);
    var rows = [
      ['--- Day 0 開始前 ---', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['tradePulse systemd 稼働', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['GAS DRY_RUN=true', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['5分トリガー設置', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['4シート初期化済み', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['日次損失上限(-2000円)明記', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['--- 毎日 ---', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['運用ログが増えている', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['日次集計1行追加', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['ルール遵守 OK', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['--- Week 1 ---', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['環境精度 ◎+△ 5日以上/7日', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['設定変更なし', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['急変 STOP 確認(発生時)', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['Week1 判定(合格/要改善/中止)', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['--- Week 2 ---', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['Go/No-Go 判定実施', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['本番移行(DRY_RUN=false)', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['Week2 / 最終判定', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ];
    rows.forEach(function (r) {
      sheet.appendRow(r);
    });
    sheet.getRange(1, 1, 1, header.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 280);
    sheet.getRange('A1').setNote('docs/2週間試験チェックリスト.md を参照');
  }
  return sheet;
}

function bbGetReportSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('週次レポート');
  if (!sheet) {
    sheet = ss.insertSheet('週次レポート');
  }
  return sheet;
}

/** 全シート一括初期化 */
function bbInitAllSheets_() {
  bbGetLogSheet_();
  bbGetTradeSheet_();
  bbGetDailySummarySheet_();
  bbGetTrialChecklistSheet_();
  bbGetReportSheet_();
}

/** 毎回のチェック結果を1行記録（損益はユーザーが別シートで集計） */
function bbAppendRunLog_(regime, ticker, assets, state) {
  var sheet = bbGetLogSheet_();
  sheet.appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    bbRegimeLabelJa_(regime.regime, regime.trendBias),
    bbActionLabelJa_(regime.action),
    ticker.last,
    state.mode || '',
    regime.adx != null ? regime.adx : '',
    regime.er != null ? regime.er : '',
    assets.jpy,
    assets.btc,
    regime.detail || '',
  ]);
}

/** 売買イベント用（約定・損益は手動補完） */
function bbAppendTradeLog_(side, price, amount, note) {
  var cfg = bbGetConfig_();
  var tradeSheet = bbGetTradeSheet_();
  var fill = cfg.dryRun ? 'DRY_RUN' : '';
  tradeSheet.appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    side,
    price,
    amount,
    fill,
    '',
    '',
    '',
    note || '',
  ]);
  if (cfg.dryRun) {
    bbReportPaperTradeToMeta_(side, price, amount);
  }
}
