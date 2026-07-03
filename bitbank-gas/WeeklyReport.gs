/**
 * チームA: 週次レポート
 * 売買履歴から過去7日分の取引を集計し、週次レポートに出力する。
 */

var BB_SHEET_REPORT = '週次レポート';
var BB_SHEET_DAILY = '日次レポート';
var BB_SHEET_MONTHLY = '月次レポート';
var BB_REPORT_MAX_TRADES = 100;
var BB_TRADE_COL = { time: 0, side: 1, price: 2, amount: 3, memo: 8 };

function bbCollectReportTrades_() {
  var range = rptGetPeriodRange_('7d');
  return bbCollectReportTradesForPeriod_(range.from, range.to);
}

function bbCollectReportTradesForPeriod_(from, to) {
  return rptCollectTradesFromSheet_(BB_TRADE_SHEET, BB_TRADE_COL, from, to, 'mixed');
}

/* ====================================================================
 * 2. 戦略分析
 * ==================================================================== */

function bbAnalyzeTrades_(trades) {
  var results = [];
  for (var i = 0; i < Math.min(trades.length, BB_REPORT_MAX_TRADES); i++) {
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

function bbGenerateRecommendations_(analyses) {
  var recs = [];
  var closed = [];
  var wins = 0;
  var totalHold = 0;
  var holdCount = 0;
  var earlyExit = 0;
  var lateExit = 0;

  for (var i = 0; i < analyses.length; i++) {
    var a = analyses[i];
    var t = a.trade;
    if (t.pnlPct == null) continue;
    closed.push(t);
    if (t.pnlPct >= 0) wins++;

    if (a.holdHours != null) {
      totalHold += a.holdHours;
      holdCount++;
      if (a.holdHours < 1) earlyExit++;
      if (a.holdHours > 48) lateExit++;
    }
  }

  var totalClosed = closed.length;

  if (totalClosed > 0 && wins / totalClosed < 0.4) {
    recs.push({
      category: '勝率改善',
      current: '勝率 ' + (wins / totalClosed * 100).toFixed(1) + '%',
      proposed: 'エントリー条件を厳格化',
      reason: '勝率40%未満 — 環境判定の精度向上またはエントリーフィルター追加を検討',
    });
  }

  if (holdCount > 0 && earlyExit / holdCount >= 0.4) {
    recs.push({
      category: '保有時間',
      current: '1h未満の決済が' + Math.round(earlyExit / holdCount * 100) + '%',
      proposed: '最低保有時間の設定',
      reason: '短時間での決済が多い — ノイズに反応している可能性',
    });
  }

  if (holdCount > 0) {
    var avgHold = totalHold / holdCount;
    if (avgHold > 72) {
      recs.push({
        category: '決済タイミング',
        current: '平均保有 ' + avgHold.toFixed(1) + '時間',
        proposed: 'トレーリングストップ導入',
        reason: '保有が長すぎる — 利益確定が遅れている可能性',
      });
    }
  }

  if (recs.length === 0) {
    recs.push({
      category: '所見',
      current: '-',
      proposed: '-',
      reason: '現在の運用に特段の問題なし。引き続き継続。',
    });
  }

  return recs;
}

/* ====================================================================
 * 4. シート出力
 * ==================================================================== */

function bbWriteReport_(trades, analyses, recs, periodBundle) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(BB_SHEET_REPORT);
  if (!sheet) sheet = ss.insertSheet(BB_SHEET_REPORT);
  sheet.clear();

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var row = 1;
  sheet.getRange(row, 1).setValue('【Team A 週次レポート】 ' + now).setFontWeight('bold');
  row += 2;

  if (periodBundle) row = rptWriteComparisonBlock_(sheet, row, periodBundle);
  row++;

  sheet.getRange(row, 1).setValue('【セクションA: 7日間サマリー】').setFontWeight('bold');
  row++;

  var closed = [];
  var wins = 0;
  var totalProfit = 0;
  var totalLoss = 0;
  for (var i = 0; i < trades.length; i++) {
    if (trades[i].pnlPct != null) {
      closed.push(trades[i]);
      if (trades[i].pnlPct >= 0) { wins++; totalProfit += trades[i].pnlJpy || 0; }
      else { totalLoss += Math.abs(trades[i].pnlJpy || 0); }
    }
  }
  var winRate = closed.length > 0 ? (wins / closed.length * 100).toFixed(1) : '-';
  var pf = totalLoss > 0 ? (totalProfit / totalLoss).toFixed(2) : (totalProfit > 0 ? '∞' : '-');
  var netPnl = totalProfit - totalLoss;

  sheet.getRange(row, 1, 1, 2).setValues([['期間', '直近7日間（' + now + '時点）']]); row++;
  sheet.getRange(row, 1, 1, 2).setValues([['決済済み取引数', closed.length]]); row++;
  sheet.getRange(row, 1, 1, 2).setValues([['保有中', trades.length - closed.length]]); row++;
  sheet.getRange(row, 1, 1, 2).setValues([['勝率', winRate + '%']]); row++;
  sheet.getRange(row, 1, 1, 2).setValues([['純損益(円)', Math.round(netPnl).toLocaleString()]]); row++;
  sheet.getRange(row, 1, 1, 2).setValues([['プロフィットファクター', pf]]); row += 2;

  sheet.getRange(row, 1).setValue('【セクションB: トレード詳細】').setFontWeight('bold'); row++;
  var headers = ['エントリー日時', '決済日時', '方向', 'エントリー価格', '決済価格', '数量', '損益(円)', '損益%', '保有時間(h)', '評価', '理由'];
  sheet.getRange(row, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(row, 1, 1, headers.length).setFontWeight('bold'); row++;

  for (var i = 0; i < analyses.length; i++) {
    var a = analyses[i];
    var t = a.trade;
    sheet.getRange(row, 1, 1, headers.length).setValues([[
      t.entryTime || '', t.exitTime || '保有中', t.side || '',
      t.entryPrice || '', t.exitPrice || '-',
      t.amount || '',
      t.pnlJpy != null ? Math.round(t.pnlJpy) : '-',
      t.pnlPct != null ? t.pnlPct.toFixed(3) + '%' : '-',
      a.holdHours != null ? a.holdHours : '-',
      a.evaluation || '-', t.reason || '',
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

  bbLog_('週次レポート出力完了 (' + trades.length + '件)');
}

/* ====================================================================
 * 公開関数
 * ==================================================================== */

function bbRunReport_() {
  var range7 = rptGetPeriodRange_('7d');
  var rangeY = rptGetPeriodRange_('yesterday');
  var rangeM = rptGetPeriodRange_('month');

  var trades7d = bbCollectReportTradesForPeriod_(range7.from, range7.to);
  var tradesY = bbCollectReportTradesForPeriod_(rangeY.from, rangeY.to);
  var tradesM = bbCollectReportTradesForPeriod_(rangeM.from, rangeM.to);

  var stats7d = rptCalcStats_(trades7d);
  var statsY = rptCalcStats_(tradesY);
  var statsM = rptCalcStats_(tradesM);
  var periodBundle = [
    { label: rangeY.label, stats: statsY },
    { label: range7.label, stats: stats7d },
    { label: rangeM.label, stats: statsM },
  ];

  if (trades7d.length === 0 && tradesY.length === 0 && tradesM.length === 0) {
    bbLog_('レポート: 取引なし');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(BB_SHEET_REPORT);
    if (!sheet) sheet = ss.insertSheet(BB_SHEET_REPORT);
    sheet.clear();
    sheet.getRange(1, 1).setValue('取引なし (' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm') + ')');
    bbReportToMeta_('7日間', 0, '-', '-', 0, 0, '取引なし');
    return;
  }

  var analyses = bbAnalyzeTrades_(trades7d);
  var recs = bbGenerateRecommendations_(analyses);
  bbWriteReport_(trades7d, analyses, recs, periodBundle);
  rptWritePeriodSheetSimple_(BB_SHEET_DAILY, 'Team A 前日', tradesY, statsY);
  rptWritePeriodSheetSimple_(BB_SHEET_MONTHLY, 'Team A 月次', tradesM, statsM);

  var recText = recs.length > 0 ? recs[0].reason : '-';
  bbReportToMeta_(
    '7日間',
    stats7d.closedCount,
    stats7d.closedCount > 0 ? stats7d.winRate.toFixed(1) : '-',
    stats7d.pf,
    stats7d.netPnl,
    stats7d.avgHoldH,
    recText
  );
  bbReportToMeta_(
    '前日',
    statsY.closedCount,
    statsY.closedCount > 0 ? statsY.winRate.toFixed(1) : '-',
    statsY.pf,
    statsY.netPnl,
    statsY.avgHoldH,
    statsY.closedCount > 0 ? '前日決済 ' + statsY.closedCount + '件' : '前日決済なし'
  );
  bbReportToMeta_(
    rangeM.label,
    statsM.closedCount,
    statsM.closedCount > 0 ? statsM.winRate.toFixed(1) : '-',
    statsM.pf,
    statsM.netPnl,
    statsM.avgHoldH,
    rangeM.label + ' 累計'
  );
}

function bbReportToMeta_(period, tradeCount, winRate, pf, netPnl, avgHoldH, recommendation) {
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
      'A',
      period,
      tradeCount,
      winRate,
      pf,
      Math.round(netPnl),
      avgHoldH,
      recommendation,
    ]);
    bbLog_('META統合レポートに送信(' + period + ')');
  } catch (e) {
    bbLog_('META統合レポート送信失敗: ' + e.message);
  }
}
