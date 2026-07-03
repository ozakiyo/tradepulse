/**
 * チームG: 日次レポート → META_統合レポート
 * G_売買履歴から 7日間 / 前日 / 今月 を集計（銘柄別FIFO）
 */

var G_SHEET_REPORT = 'G_週次レポート';
var G_SHEET_DAILY = 'G_日次レポート';
var G_SHEET_MONTHLY = 'G_月次レポート';
var G_REPORT_MAX_TRADES = 150;
var G_TRADE_COL = { time: 0, symbol: 1, side: 2, price: 3, amount: 4, memo: 5 };

function gCollectReportTradesForPeriod_(from, to) {
  return rptCollectTradesFromSheet_(G_SHEET_TRADE, G_TRADE_COL, from, to, 'symbolFifo');
}

function gAnalyzeTrades_(trades) {
  var results = [];
  for (var i = 0; i < Math.min(trades.length, G_REPORT_MAX_TRADES); i++) {
    var t = trades[i];
    var analysis = { trade: t, holdHours: null, evaluation: '-' };

    if (t.entryTime && t.exitTime) {
      var ms = new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime();
      analysis.holdHours = Math.round(ms / (60 * 60 * 1000) * 10) / 10;
      if (t.pnlPct != null) {
        if (t.pnlPct >= 0.3) analysis.evaluation = '良好';
        else if (t.pnlPct >= 0) analysis.evaluation = '微益';
        else if (t.pnlPct >= -0.5) analysis.evaluation = '小損';
        else analysis.evaluation = '損切り';
      }
    } else {
      analysis.evaluation = '未決済';
    }
    results.push(analysis);
  }
  return results;
}

function gGenerateRecommendations_(analyses, stats7d) {
  var recs = [];
  var closed = [];
  var wins = 0;

  for (var i = 0; i < analyses.length; i++) {
    var t = analyses[i].trade;
    if (t.pnlPct == null) continue;
    closed.push(t);
    if (t.pnlPct >= 0) wins += 1;
  }

  if (closed.length > 0 && wins / closed.length < 0.45) {
    recs.push({
      category: 'レンジ勝率',
      current: '勝率 ' + ((wins / closed.length) * 100).toFixed(1) + '%',
      proposed: 'G_TOUCH_PCT / レンジ幅の見直し',
      reason: '勝率45%未満 — タッチ幅または日足/1Hレンジ条件の調整を検討',
    });
  }

  if (stats7d && stats7d.closedCount < 3) {
    recs.push({
      category: '約定頻度',
      current: stats7d.closedCount + '件/7日',
      proposed: '銘柄数・レンジ条件の確認',
      reason: '決済が少ない — レンジ判定が厳しすぎる、または相場がトレンド寄りの可能性',
    });
  }

  if (recs.length === 0) {
    recs.push({
      category: '所見',
      current: '-',
      proposed: '-',
      reason: '現在のレンジ設定で特段の問題なし。デモ運用を継続。',
    });
  }
  return recs;
}

function gWritePeriodSheet_(sheetName, title, trades, stats) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  sheet.clear();

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var row = 1;
  sheet.getRange(row, 1).setValue(title + ' (' + now + ')').setFontWeight('bold');
  row += 2;

  sheet.getRange(row, 1, 1, 2).setValues([['決済数', stats.closedCount]]);
  row++;
  sheet.getRange(row, 1, 1, 2).setValues([['未決済', stats.openCount]]);
  row++;
  sheet.getRange(row, 1, 1, 2).setValues([
    ['勝率', stats.closedCount > 0 ? stats.winRate.toFixed(1) + '%' : '-'],
  ]);
  row++;
  sheet.getRange(row, 1, 1, 2).setValues([['PF', stats.pf]]);
  row++;
  sheet.getRange(row, 1, 1, 2).setValues([['純損益(円)', Math.round(stats.netPnl).toLocaleString()]]);
  row += 2;

  rptWriteTradeDetailBlock_(sheet, row, trades, G_REPORT_MAX_TRADES);
}

function gWriteReport_(trades, analyses, recs, periodBundle) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(G_SHEET_REPORT);
  if (!sheet) sheet = ss.insertSheet(G_SHEET_REPORT);
  sheet.clear();

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var row = 1;

  row = rptWriteComparisonBlock_(sheet, row, periodBundle);
  row++;

  sheet.getRange(row, 1).setValue('【セクションA: サマリー（7日間）】').setFontWeight('bold');
  row++;

  var stats7 = periodBundle.length > 1 ? periodBundle[1].stats : rptCalcStats_(trades);
  sheet.getRange(row, 1, 1, 2).setValues([['決済数', stats7.closedCount]]);
  row++;
  sheet.getRange(row, 1, 1, 2).setValues([['勝率', stats7.closedCount > 0 ? stats7.winRate.toFixed(1) + '%' : '-']]);
  row++;
  sheet.getRange(row, 1, 1, 2).setValues([['PF', stats7.pf]]);
  row++;
  sheet.getRange(row, 1, 1, 2).setValues([['純損益(円)', Math.round(stats7.netPnl).toLocaleString()]]);
  row += 2;

  sheet.getRange(row, 1).setValue('【セクションB: トレード詳細】').setFontWeight('bold');
  row++;
  var headers = [
    '銘柄',
    'エントリー日時',
    '決済日時',
    'エントリー価格',
    '決済価格',
    '数量',
    '損益(円)',
    '損益%',
    '保有h',
    '評価',
    '理由',
  ];
  sheet.getRange(row, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(row, 1, 1, headers.length).setFontWeight('bold');
  row++;

  for (var i = 0; i < analyses.length; i++) {
    var a = analyses[i];
    var t = a.trade;
    sheet.getRange(row, 1, 1, headers.length).setValues([
      [
        t.symbol || '',
        t.entryTime || '',
        t.exitTime || '保有中',
        t.entryPrice || '',
        t.exitPrice || '-',
        t.amount || '',
        t.pnlJpy != null ? Math.round(t.pnlJpy) : '-',
        t.pnlPct != null ? t.pnlPct.toFixed(3) + '%' : '-',
        a.holdHours != null ? a.holdHours : '-',
        a.evaluation || '-',
        t.reason || '',
      ],
    ]);
    row++;
  }
  row++;

  sheet.getRange(row, 1).setValue('【セクションC: 改善提案】').setFontWeight('bold');
  row++;
  sheet.getRange(row, 1, 1, 4).setValues([['カテゴリ', '現在値', '提案値', '理由']]);
  sheet.getRange(row, 1, 1, 4).setFontWeight('bold');
  row++;
  for (var j = 0; j < recs.length; j++) {
    var r = recs[j];
    sheet.getRange(row, 1, 1, 4).setValues([[r.category, r.current, r.proposed, r.reason]]);
    row++;
  }

  gLog_('レポート出力完了 (7日:' + trades.length + '件)');
}

function gRunReport_() {
  var range7 = rptGetPeriodRange_('7d');
  var rangeY = rptGetPeriodRange_('yesterday');
  var rangeM = rptGetPeriodRange_('month');

  var trades7d = gCollectReportTradesForPeriod_(range7.from, range7.to);
  var tradesY = gCollectReportTradesForPeriod_(rangeY.from, rangeY.to);
  var tradesM = gCollectReportTradesForPeriod_(rangeM.from, rangeM.to);

  var stats7d = rptCalcRoundTripStats_(trades7d);
  var statsY = rptCalcRoundTripStats_(tradesY);
  var statsM = rptCalcRoundTripStats_(tradesM);

  var periodBundle = [
    { label: rangeY.label, stats: statsY },
    { label: range7.label, stats: stats7d },
    { label: rangeM.label, stats: statsM },
  ];

  if (trades7d.length === 0 && tradesY.length === 0 && tradesM.length === 0) {
    gLog_('レポート: 取引なし');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(G_SHEET_REPORT);
    if (!sheet) sheet = ss.insertSheet(G_SHEET_REPORT);
    sheet.clear();
    sheet.getRange(1, 1).setValue(
      '取引なし (' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm') + ')'
    );
    gReportToMeta_('7日間', 0, '-', '-', 0, 0, '取引なし');
    gReportToMeta_('前日', 0, '-', '-', 0, 0, '取引なし');
    gReportToMeta_(rangeM.label, 0, '-', '-', 0, 0, '取引なし');
    return;
  }

  var analyses = gAnalyzeTrades_(trades7d);
  var recs = gGenerateRecommendations_(analyses, stats7d);
  gWriteReport_(trades7d, analyses, recs, periodBundle);
  gWritePeriodSheet_(G_SHEET_DAILY, '【G 前日レポート】', tradesY, statsY);
  gWritePeriodSheet_(G_SHEET_MONTHLY, '【G 月次レポート】', tradesM, statsM);

  var recText = recs.length > 0 ? recs[0].reason : '-';
  gReportToMeta_(
    '7日間',
    stats7d.closedCount,
    stats7d.closedCount > 0 ? stats7d.winRate.toFixed(1) : '-',
    stats7d.pf,
    stats7d.netPnl,
    stats7d.avgHoldH,
    recText
  );
  gReportToMeta_(
    '前日',
    statsY.closedCount,
    statsY.closedCount > 0 ? statsY.winRate.toFixed(1) : '-',
    statsY.pf,
    statsY.netPnl,
    statsY.avgHoldH,
    statsY.closedCount > 0 ? '前日決済 ' + statsY.closedCount + '件' : '前日決済なし'
  );
  gReportToMeta_(
    rangeM.label,
    statsM.closedCount,
    statsM.closedCount > 0 ? statsM.winRate.toFixed(1) : '-',
    statsM.pf,
    statsM.netPnl,
    statsM.avgHoldH,
    rangeM.label + ' 累計'
  );
}

function gReportToMeta_(period, tradeCount, winRate, pf, netPnl, avgHoldH, recommendation) {
  if (gIsValidationPaused_()) return;
  var sheetId = PropertiesService.getScriptProperties().getProperty('META_SPREADSHEET_ID');
  if (!sheetId) return;
  try {
    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName('META_統合レポート');
    if (!sheet) {
      sheet = ss.insertSheet('META_統合レポート');
      sheet.appendRow(['日時', 'チーム', '期間', '取引数', '勝率%', 'PF', '純損益', '平均保有h', '改善提案']);
      sheet.getRange(1, 1, 1, 9).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([
      Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
      'G',
      period,
      tradeCount,
      winRate,
      pf,
      Math.round(netPnl),
      avgHoldH,
      recommendation,
    ]);
    gLog_('META統合レポートに送信(' + period + ')');
  } catch (e) {
    gLog_('META統合レポート送信失敗: ' + e.message);
  }
}

function gGenerateReport() {
  gLog_('レポート生成開始');
  try {
    gRunReport_();
    SpreadsheetApp.getUi().alert('G_週次レポート を更新し、METAに送信しました。');
  } catch (e) {
    gLog_('レポートERROR: ' + e.message);
    SpreadsheetApp.getUi().alert('レポート生成エラー: ' + e.message);
  }
}

function gGenerateReportAuto() {
  if (gIsValidationPaused_()) return;
  gLog_('レポート自動生成開始');
  try {
    gRunReport_();
  } catch (e) {
    gLog_('レポートERROR: ' + e.message);
  }
}

function gInstallReportTrigger() {
  if (gIsValidationPaused_()) {
    SpreadsheetApp.getUi().alert('検証停止中のためレポートトリガーは設置しません。\n再開: VALIDATION_PAUSED=false');
    return;
  }
  gRemoveReportTrigger();
  ScriptApp.newTrigger('gGenerateReportAuto')
    .timeBased()
    .atHour(6)
    .everyDays(1)
    .create();
  gLog_('日次レポートトリガー設置（毎日6時）');
  SpreadsheetApp.getUi().alert('毎日 6:00 にレポートを生成し、METAに送信します');
}

function gRemoveReportTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'gGenerateReportAuto') ScriptApp.deleteTrigger(t);
  });
}

function gTestMetaSpreadsheet() {
  var sheetId = PropertiesService.getScriptProperties().getProperty('META_SPREADSHEET_ID');
  if (!sheetId) {
    SpreadsheetApp.getUi().alert('META_SPREADSHEET_ID が未設定です');
    return;
  }
  var ss = SpreadsheetApp.openById(sheetId);
  SpreadsheetApp.getUi().alert('メタ層SS接続OK: ' + ss.getName());
}
