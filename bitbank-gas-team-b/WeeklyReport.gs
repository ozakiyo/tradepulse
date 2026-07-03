/**
 * チームB: 週次レポート
 * B2_売買履歴から 7日間 / 前日 / 今月 を集計。
 * グリッドは売りメモの買値でペアリング（FIFOによる誤マイナスを防止）。
 */

var B2_SHEET_REPORT = 'B2_週次レポート';
var B2_SHEET_DAILY = 'B2_日次レポート';
var B2_SHEET_MONTHLY = 'B2_月次レポート';
var B2_REPORT_MAX_TRADES = 200;
var B2_TRADE_COL = { time: 0, side: 1, price: 2, amount: 3, memo: 5 };

function b2CollectReportTrades_() {
  var range = rptGetPeriodRange_('7d');
  return b2CollectReportTradesForPeriod_(range.from, range.to);
}

function b2CollectReportTradesForPeriod_(from, to) {
  return rptCollectTradesFromSheet_(B2_SHEET_TRADE, B2_TRADE_COL, from, to, 'grid');
}

/* ====================================================================
 * 2. グリッド分析
 * ==================================================================== */

function b2AnalyzeTrades_(trades) {
  var results = [];
  for (var i = 0; i < Math.min(trades.length, B2_REPORT_MAX_TRADES); i++) {
    var t = trades[i];
    var analysis = { trade: t, holdHours: null, evaluation: '-' };

    if (t.entryTime && t.exitTime) {
      var ms = new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime();
      analysis.holdHours = Math.round(ms / (60 * 60 * 1000) * 10) / 10;

      if (t.pnlPct != null) {
        if (t.pnlPct >= 0.3) analysis.evaluation = '良好';
        else if (t.pnlPct >= 0) analysis.evaluation = '微益';
        else if (t.pnlPct >= -0.3) analysis.evaluation = '小損';
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

function b2GenerateRecommendations_(analyses, stats7d) {
  var recs = [];
  var closed = [];
  var wins = 0;
  var priceSpread = { min: Infinity, max: -Infinity };

  for (var i = 0; i < analyses.length; i++) {
    var t = analyses[i].trade;
    if (t.pnlPct == null) continue;
    closed.push(t);
    if (t.pnlPct >= 0) wins++;
    if (t.entryPrice < priceSpread.min) priceSpread.min = t.entryPrice;
    if (t.entryPrice > priceSpread.max) priceSpread.max = t.entryPrice;
  }

  if (closed.length > 0 && wins / closed.length < 0.5) {
    recs.push({
      category: 'グリッド勝率',
      current: '勝率 ' + ((wins / closed.length) * 100).toFixed(1) + '%',
      proposed: 'グリッド間隔の見直し',
      reason: 'グリッド取引の勝率50%未満 — TORARIPI_WIDTH_JPYの調整を検討',
    });
  }

  if (stats7d && stats7d.closedCount < 5) {
    recs.push({
      category: '約定頻度',
      current: stats7d.closedCount + '件/7日',
      proposed: 'グリッド間隔を狭くする',
      reason: '決済が少ない — トレール幅(TRAIL_ACTIVATE_STEP_MULT)や間隔の見直しを検討',
    });
  }

  if (priceSpread.min < Infinity && priceSpread.max > -Infinity) {
    var spread = priceSpread.max - priceSpread.min;
    recs.push({
      category: 'レンジ情報',
      current:
        Math.round(priceSpread.min).toLocaleString() +
        ' ～ ' +
        Math.round(priceSpread.max).toLocaleString() +
        ' 円',
      proposed: 'レンジ幅 ' + Math.round(spread).toLocaleString() + ' 円',
      reason: '直近7日のエントリー価格帯（グリッド再構築の参考に）',
    });
  }

  if (recs.length === 0) {
    recs.push({
      category: '所見',
      current: '-',
      proposed: '-',
      reason: '現在のグリッド設定で問題なし。引き続き運用を継続。',
    });
  }

  return recs;
}

/* ====================================================================
 * 4. シート出力
 * ==================================================================== */

function b2WritePeriodSheet_(sheetName, title, trades, stats) {
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

  rptWriteTradeDetailBlock_(sheet, row, trades, B2_REPORT_MAX_TRADES);
}

function b2WriteReport_(trades7d, analyses, recs, periodBundle) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(B2_SHEET_REPORT);
  if (!sheet) sheet = ss.insertSheet(B2_SHEET_REPORT);
  sheet.clear();

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var row = 1;
  sheet.getRange(row, 1).setValue('【B2 週次レポート】 ' + now).setFontWeight('bold');
  row += 2;

  row = rptWriteComparisonBlock_(sheet, row, periodBundle);
  row++;

  var stats7d = rptCalcStats_(trades7d);
  sheet.getRange(row, 1).setValue('【セクションA: 7日間サマリー】').setFontWeight('bold');
  row++;
  sheet.getRange(row, 1, 1, 2).setValues([['決済数', stats7d.closedCount]]);
  row++;
  sheet.getRange(row, 1, 1, 2).setValues([['未決済グリッド', stats7d.openCount]]);
  row++;
  sheet.getRange(row, 1, 1, 2).setValues([
    ['勝率', stats7d.closedCount > 0 ? stats7d.winRate.toFixed(1) + '%' : '-'],
  ]);
  row++;
  sheet.getRange(row, 1, 1, 2).setValues([['純損益(円)', Math.round(stats7d.netPnl).toLocaleString()]]);
  row++;
  sheet.getRange(row, 1, 1, 2).setValues([['PF', stats7d.pf]]);
  row += 2;

  sheet.getRange(row, 1).setValue('【セクションB: 7日間トレード詳細】').setFontWeight('bold');
  row++;
  var headers = ['買い日時', '売り日時', 'エントリー', '決済', '数量', '損益(円)', '損益%', '保有時間(h)', '評価'];
  sheet.getRange(row, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  row++;

  for (var i = 0; i < analyses.length; i++) {
    var a = analyses[i];
    var t = a.trade;
    sheet.getRange(row, 1, 1, headers.length).setValues([
      [
        t.entryTime || '',
        t.exitTime || '保有中',
        t.entryPrice || '',
        t.exitPrice || '-',
        t.amount || '',
        t.pnlJpy != null ? Math.round(t.pnlJpy) : '-',
        t.pnlPct != null ? t.pnlPct.toFixed(3) + '%' : '-',
        a.holdHours != null ? a.holdHours : '-',
        a.evaluation || '-',
      ],
    ]);
    row++;
  }
  row++;

  sheet.getRange(row, 1).setValue('【セクションC: 改善提案】').setFontWeight('bold');
  row++;
  sheet.getRange(row, 1, 1, 4).setValues([['カテゴリ', '現在値', '提案値', '理由']]).setFontWeight('bold');
  row++;

  for (var j = 0; j < recs.length; j++) {
    var r = recs[j];
    sheet.getRange(row, 1, 1, 4).setValues([[r.category, r.current, r.proposed, r.reason]]);
    row++;
  }

  b2Log_('週次レポート出力完了 (7日:' + trades7d.length + '件)');
}

/* ====================================================================
 * 公開関数
 * ==================================================================== */

function b2RunReport_() {
  var range7 = rptGetPeriodRange_('7d');
  var rangeY = rptGetPeriodRange_('yesterday');
  var rangeM = rptGetPeriodRange_('month');

  var trades7d = b2CollectReportTradesForPeriod_(range7.from, range7.to);
  var tradesY = b2CollectReportTradesForPeriod_(rangeY.from, rangeY.to);
  var tradesM = b2CollectReportTradesForPeriod_(rangeM.from, rangeM.to);

  var stats7d = rptCalcStats_(trades7d);
  var statsY = rptCalcStats_(tradesY);
  var statsM = rptCalcStats_(tradesM);

  var periodBundle = [
    { label: rangeY.label, stats: statsY },
    { label: range7.label, stats: stats7d },
    { label: rangeM.label, stats: statsM },
  ];

  if (trades7d.length === 0 && tradesY.length === 0 && tradesM.length === 0) {
    b2Log_('レポート: 取引なし');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(B2_SHEET_REPORT);
    if (!sheet) sheet = ss.insertSheet(B2_SHEET_REPORT);
    sheet.clear();
    sheet.getRange(1, 1).setValue('取引なし (' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm') + ')');
    b2ReportToMeta_('7日間', 0, '-', '-', 0, 0, '取引なし');
    b2ReportToMeta_('前日', 0, '-', '-', 0, 0, '取引なし');
    b2ReportToMeta_(rangeM.label, 0, '-', '-', 0, 0, '取引なし');
    return;
  }

  var analyses = b2AnalyzeTrades_(trades7d);
  var recs = b2GenerateRecommendations_(analyses, stats7d);
  b2WriteReport_(trades7d, analyses, recs, periodBundle);
  b2WritePeriodSheet_(B2_SHEET_DAILY, '【B2 前日レポート】', tradesY, statsY);
  b2WritePeriodSheet_(B2_SHEET_MONTHLY, '【B2 月次レポート】', tradesM, statsM);

  var recText = recs.length > 0 ? recs[0].reason : '-';
  b2ReportToMeta_(
    '7日間',
    stats7d.closedCount,
    stats7d.closedCount > 0 ? stats7d.winRate.toFixed(1) : '-',
    stats7d.pf,
    stats7d.netPnl,
    stats7d.avgHoldH,
    recText
  );
  b2ReportToMeta_(
    '前日',
    statsY.closedCount,
    statsY.closedCount > 0 ? statsY.winRate.toFixed(1) : '-',
    statsY.pf,
    statsY.netPnl,
    statsY.avgHoldH,
    statsY.closedCount > 0 ? '前日決済 ' + statsY.closedCount + '件' : '前日決済なし'
  );
  b2ReportToMeta_(
    rangeM.label,
    statsM.closedCount,
    statsM.closedCount > 0 ? statsM.winRate.toFixed(1) : '-',
    statsM.pf,
    statsM.netPnl,
    statsM.avgHoldH,
    rangeM.label + ' 累計'
  );
}

function b2ReportToMeta_(period, tradeCount, winRate, pf, netPnl, avgHoldH, recommendation) {
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
      'B',
      period,
      tradeCount,
      winRate,
      pf,
      Math.round(netPnl),
      avgHoldH,
      recommendation,
    ]);
    b2Log_('META統合レポートに送信(' + period + ')');
  } catch (e) {
    b2Log_('META統合レポート送信失敗: ' + e.message);
  }
}
