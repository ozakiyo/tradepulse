/**
 * チームE: 週次レポート
 * E5_売買履歴から 7日間 / 前日 / 今月 を集計。
 */

var E5_SHEET_REPORT = 'E5_週次レポート';
var E5_SHEET_DAILY = 'E5_日次レポート';
var E5_SHEET_MONTHLY = 'E5_月次レポート';
var E5_REPORT_MAX_TRADES = 100;
var E5_TRADE_COL = { time: 0, side: 1, price: 2, amount: 3, memo: 5 };

function e5CollectReportTrades_() {
  var range = rptGetPeriodRange_('7d');
  return e5CollectReportTradesForPeriod_(range.from, range.to);
}

function e5CollectReportTradesForPeriod_(from, to) {
  return rptCollectTradesFromSheet_(E5_SHEET_TRADE, E5_TRADE_COL, from, to, 'single');
}

/* ====================================================================
 * 2. 分析
 * ==================================================================== */

function e5AnalyzeTrades_(trades) {
  var results = [];
  for (var i = 0; i < Math.min(trades.length, E5_REPORT_MAX_TRADES); i++) {
    var t = trades[i];
    var analysis = { trade: t, holdHours: null, evaluation: '-' };

    if (t.entryTime && t.exitTime) {
      var ms = new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime();
      analysis.holdHours = Math.round(ms / (60 * 60 * 1000) * 10) / 10;
      if (t.pnlPct != null) {
        if (t.pnlPct >= 0.5) analysis.evaluation = '良好';
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

/* ====================================================================
 * 3. 改善提案
 * ==================================================================== */

function e5GenerateRecommendations_(analyses) {
  var recs = [];
  var closed = [];
  var wins = 0;
  var totalHold = 0;
  var holdCount = 0;

  for (var i = 0; i < analyses.length; i++) {
    var t = analyses[i].trade;
    if (t.pnlPct == null) continue;
    closed.push(t);
    if (t.pnlPct >= 0) wins++;
    if (analyses[i].holdHours != null) { totalHold += analyses[i].holdHours; holdCount++; }
  }

  if (closed.length > 0 && wins / closed.length < 0.4) {
    recs.push({
      category: '勝率改善',
      current: '勝率 ' + (wins / closed.length * 100).toFixed(1) + '%',
      proposed: 'ドンチャンパラメータ見直し',
      reason: '勝率40%未満 — DONCHIAN_ENTRY_BARS/EXIT_BARSの調整を検討',
    });
  }

  if (holdCount > 0) {
    var avgHold = totalHold / holdCount;
    if (avgHold > 72) {
      recs.push({
        category: '決済タイミング',
        current: '平均保有 ' + avgHold.toFixed(1) + '時間',
        proposed: 'DONCHIAN_EXIT_BARSを短縮',
        reason: '保有が長すぎる — 決済チャネルの期間を短くして反応を早める',
      });
    }
    if (avgHold < 2) {
      recs.push({
        category: '保有時間',
        current: '平均保有 ' + avgHold.toFixed(1) + '時間',
        proposed: 'ADXフィルターの閾値を上げる',
        reason: '保有が短すぎる — レンジ相場でのダマシが多い可能性',
      });
    }
  }

  if (recs.length === 0) {
    recs.push({
      category: '所見', current: '-', proposed: '-',
      reason: '現在の運用に特段の問題なし。引き続き継続。',
    });
  }
  return recs;
}

/* ====================================================================
 * 4. シート出力
 * ==================================================================== */

function e5WritePeriodSheet_(sheetName, title, trades, stats) {
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

  rptWriteTradeDetailBlock_(sheet, row, trades, E5_REPORT_MAX_TRADES);
}

function e5WriteReport_(trades, analyses, recs, periodBundle) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(E5_SHEET_REPORT);
  if (!sheet) sheet = ss.insertSheet(E5_SHEET_REPORT);
  sheet.clear();

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var cutoffDate = Utilities.formatDate(
    new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000), 'Asia/Tokyo', 'yyyy-MM-dd'
  );
  var row = 1;

  row = rptWriteComparisonBlock_(sheet, row, periodBundle);
  row++;

  sheet.getRange(row, 1).setValue('【セクションA: サマリー】').setFontWeight('bold'); row++;

  var closed = []; var wins = 0; var totalProfit = 0; var totalLoss = 0;
  for (var i = 0; i < trades.length; i++) {
    if (trades[i].pnlJpy != null) {
      closed.push(trades[i]);
      if (trades[i].pnlJpy >= 0) { wins++; totalProfit += trades[i].pnlJpy; }
      else { totalLoss += Math.abs(trades[i].pnlJpy); }
    }
  }
  var winRate = closed.length > 0 ? (wins / closed.length * 100).toFixed(1) : '-';
  var pf = totalLoss > 0 ? (totalProfit / totalLoss).toFixed(2) : (totalProfit > 0 ? '∞' : '-');

  sheet.getRange(row, 1, 1, 2).setValues([['期間', cutoffDate + ' ～ ' + now]]); row++;
  sheet.getRange(row, 1, 1, 2).setValues([['決済済み取引数', closed.length]]); row++;
  sheet.getRange(row, 1, 1, 2).setValues([['保有中', trades.length - closed.length]]); row++;
  sheet.getRange(row, 1, 1, 2).setValues([['勝率', winRate + '%']]); row++;
  sheet.getRange(row, 1, 1, 2).setValues([['純損益(円)', Math.round(totalProfit - totalLoss).toLocaleString()]]); row++;
  sheet.getRange(row, 1, 1, 2).setValues([['プロフィットファクター', pf]]); row += 2;

  sheet.getRange(row, 1).setValue('【セクションB: トレード詳細】').setFontWeight('bold'); row++;
  var headers = ['エントリー日時', '決済日時', '方向', 'エントリー価格', '決済価格', '数量', '損益(円)', '損益%', '保有時間(h)', '評価', '理由'];
  sheet.getRange(row, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(row, 1, 1, headers.length).setFontWeight('bold'); row++;

  for (var i = 0; i < analyses.length; i++) {
    var a = analyses[i]; var t = a.trade;
    sheet.getRange(row, 1, 1, headers.length).setValues([[
      t.entryTime || '', t.exitTime || '保有中', t.side || '',
      t.entryPrice || '', t.exitPrice || '-', t.amount || '',
      t.pnlJpy != null ? Math.round(t.pnlJpy) : '-',
      t.pnlPct != null ? t.pnlPct.toFixed(3) + '%' : '-',
      a.holdHours != null ? a.holdHours : '-', a.evaluation || '-', t.reason || '',
    ]]); row++;
  }
  row++;

  sheet.getRange(row, 1).setValue('【セクションC: 改善提案】').setFontWeight('bold'); row++;
  sheet.getRange(row, 1, 1, 4).setValues([['カテゴリ', '現在値', '提案値', '理由']]);
  sheet.getRange(row, 1, 1, 4).setFontWeight('bold'); row++;
  for (var i = 0; i < recs.length; i++) {
    var r = recs[i];
    sheet.getRange(row, 1, 1, 4).setValues([[r.category, r.current, r.proposed, r.reason]]); row++;
  }

  e5Log_('週次レポート出力完了 (' + trades.length + '件)');
}

/* ====================================================================
 * 公開関数
 * ==================================================================== */

function e5RunReport_() {
  var range7 = rptGetPeriodRange_('7d');
  var rangeY = rptGetPeriodRange_('yesterday');
  var rangeM = rptGetPeriodRange_('month');

  var trades7d = e5CollectReportTradesForPeriod_(range7.from, range7.to);
  var tradesY = e5CollectReportTradesForPeriod_(rangeY.from, rangeY.to);
  var tradesM = e5CollectReportTradesForPeriod_(rangeM.from, rangeM.to);

  var stats7d = rptCalcStats_(trades7d);
  var statsY = rptCalcStats_(tradesY);
  var statsM = rptCalcStats_(tradesM);

  var periodBundle = [
    { label: rangeY.label, stats: statsY },
    { label: range7.label, stats: stats7d },
    { label: rangeM.label, stats: statsM },
  ];

  if (trades7d.length === 0 && tradesY.length === 0 && tradesM.length === 0) {
    e5Log_('レポート: 取引なし');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(E5_SHEET_REPORT);
    if (!sheet) sheet = ss.insertSheet(E5_SHEET_REPORT);
    sheet.clear();
    sheet.getRange(1, 1).setValue(
      '取引なし (' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm') + ')'
    );
    e5ReportToMeta_('7日間', 0, '-', '-', 0, 0, '取引なし');
    e5ReportToMeta_('前日', 0, '-', '-', 0, 0, '取引なし');
    e5ReportToMeta_(rangeM.label, 0, '-', '-', 0, 0, '取引なし');
    return;
  }

  var analyses = e5AnalyzeTrades_(trades7d);
  var recs = e5GenerateRecommendations_(analyses);
  e5WriteReport_(trades7d, analyses, recs, periodBundle);
  e5WritePeriodSheet_(E5_SHEET_DAILY, '【E5 前日レポート】', tradesY, statsY);
  e5WritePeriodSheet_(E5_SHEET_MONTHLY, '【E5 月次レポート】', tradesM, statsM);

  var recText = recs.length > 0 ? recs[0].reason : '-';
  e5ReportToMeta_(
    '7日間',
    stats7d.closedCount,
    stats7d.closedCount > 0 ? stats7d.winRate.toFixed(1) : '-',
    stats7d.pf,
    stats7d.netPnl,
    stats7d.avgHoldH,
    recText
  );
  e5ReportToMeta_(
    '前日',
    statsY.closedCount,
    statsY.closedCount > 0 ? statsY.winRate.toFixed(1) : '-',
    statsY.pf,
    statsY.netPnl,
    statsY.avgHoldH,
    statsY.closedCount > 0 ? '前日決済 ' + statsY.closedCount + '件' : '前日決済なし'
  );
  e5ReportToMeta_(
    rangeM.label,
    statsM.closedCount,
    statsM.closedCount > 0 ? statsM.winRate.toFixed(1) : '-',
    statsM.pf,
    statsM.netPnl,
    statsM.avgHoldH,
    rangeM.label + ' 累計'
  );
}

function e5ReportToMeta_(period, tradeCount, winRate, pf, netPnl, avgHoldH, recommendation) {
  var sheetId = PropertiesService.getScriptProperties().getProperty('META_SPREADSHEET_ID');
  if (!sheetId) return;
  try {
    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName('META_統合レポート');
    if (!sheet) {
      sheet = ss.insertSheet('META_統合レポート');
      sheet.appendRow(['日時', 'チーム', '期間', '取引数', '勝率%', 'PF', '純損益', '平均保有h', '改善提案']);
      sheet.getRange(1, 1, 1, 9).setFontWeight('bold'); sheet.setFrozenRows(1);
    }
    sheet.appendRow([
      Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
      'E',
      period,
      tradeCount,
      winRate,
      pf,
      Math.round(netPnl),
      avgHoldH,
      recommendation,
    ]);
    e5Log_('META統合レポートに送信(' + period + ')');
  } catch (e) {
    e5Log_('META統合レポート送信失敗: ' + e.message);
  }
}
