/**
 * チームG-CBO: 日次レポート → META（純損益は口座残高変化%）
 */

var GCBO_SHEET_REPORT = 'GCBO_週次レポート';
var GCBO_SHEET_DAILY = 'GCBO_日次レポート';
var GCBO_SHEET_MONTHLY = 'GCBO_月次レポート';
var GCBO_TRADE_COL = { time: 0, symbol: 1, side: 2, price: 3, amount: 4, memo: 5 };

function gcboCollectReportTradesForPeriod_(from, to) {
  return rptCollectTradesFromSheet_(GCBO_SHEET_TRADE, GCBO_TRADE_COL, from, to, 'gcboFxRange');
}

function gcboAnalyzeTrades_(trades) {
  var results = [];
  for (var i = 0; i < trades.length; i++) {
    var t = trades[i];
    var analysis = { trade: t, holdHours: null, evaluation: '-' };
    if (t.entryTime && t.exitTime) {
      var ms = new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime();
      analysis.holdHours = Math.round(ms / 3600000 * 10) / 10;
      if (t.pnlPct != null) {
        if (t.pnlPct >= 0.2) analysis.evaluation = '良好';
        else if (t.pnlPct >= 0) analysis.evaluation = '微益';
        else analysis.evaluation = '損切り';
      }
    } else {
      analysis.evaluation = '未決済';
    }
    results.push(analysis);
  }
  return results;
}

function gcboGenerateRecommendations_(analyses, stats7d) {
  var recs = [];
  if (stats7d && stats7d.closedCount < 3) {
    recs.push({
      category: '約定頻度',
      current: stats7d.closedCount + '件/7日',
      proposed: 'レンジ条件の緩和',
      reason: '決済が少ない — GCBO_TOUCH_PCT やレンジ幅上限の見直しを検討',
    });
  }
  if (recs.length === 0) {
    recs.push({
      category: '所見',
      current: '-',
      proposed: '-',
      reason: 'デモ運用継続。ロングは下限・ショートは上限の逆張りを確認。',
    });
  }
  return recs;
}

function gcboAccountPnlPct_(state, cfg) {
  cfg = cfg || gcboGetConfig_();
  if (cfg.dryRun) {
    var w = state.paperWallet;
    if (!w || !w.initial) return 0;
    return ((gcboPaperEquity_(state) - w.initial) / w.initial) * 100;
  }
  var baseline = state.liveBaseline || 0;
  var equity = gcboAccountEquity_(cfg, state);
  if (!baseline) return 0;
  return ((equity - baseline) / baseline) * 100;
}

function gcboRunReport_() {
  var cfg = gcboGetConfig_();
  var state = gcboLoadState_();
  var range7 = rptGetPeriodRange_('7d');
  var rangeY = rptGetPeriodRange_('yesterday');
  var rangeM = rptGetPeriodRange_('month');

  var trades7d = gcboCollectReportTradesForPeriod_(range7.from, range7.to);
  var tradesY = gcboCollectReportTradesForPeriod_(rangeY.from, rangeY.to);
  var tradesM = gcboCollectReportTradesForPeriod_(rangeM.from, rangeM.to);

  var stats7d = rptCalcGcfxFxStats_(trades7d);
  var statsY = rptCalcGcfxFxStats_(tradesY);
  var statsM = rptCalcGcfxFxStats_(tradesM);
  var acctPct = gcboAccountPnlPct_(state, cfg);

  var periodBundle = [
    { label: rangeY.label, stats: statsY },
    { label: range7.label, stats: stats7d },
    { label: rangeM.label, stats: statsM },
  ];

  if (trades7d.length === 0 && tradesY.length === 0 && tradesM.length === 0) {
    gcboReportToMeta_('7日間', 0, '-', '-', acctPct, 0, '取引なし');
    gcboReportToMeta_('前日', 0, '-', '-', acctPct, 0, '取引なし');
    gcboReportToMeta_(rangeM.label, 0, '-', '-', acctPct, 0, '取引なし');
    return;
  }

  var analyses = gcboAnalyzeTrades_(trades7d);
  var recs = gcboGenerateRecommendations_(analyses, stats7d);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(GCBO_SHEET_REPORT);
  if (!sheet) sheet = ss.insertSheet(GCBO_SHEET_REPORT);
  sheet.clear();
  sheet.getRange(1, 1).setValue(
    'GCBO レポート ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm')
  );
  sheet.getRange(2, 1).setValue('口座損益%: ' + acctPct.toFixed(3) + '%');
  sheet.getRange(3, 1).setValue(
    '7日決済: ' +
      stats7d.closedCount +
      '件 勝率' +
      stats7d.winRate.toFixed(1) +
      '% PF' +
      stats7d.pf +
      ' 純損益' +
      Math.round(stats7d.netPnl).toLocaleString() +
      '円'
  );

  var recText = recs[0].reason;
  gcboReportToMeta_(
    '7日間',
    stats7d.closedCount,
    stats7d.closedCount > 0 ? stats7d.winRate.toFixed(1) : '-',
    stats7d.pf,
    acctPct,
    stats7d.avgHoldH,
    recText
  );
  gcboReportToMeta_(
    '前日',
    statsY.closedCount,
    statsY.closedCount > 0 ? statsY.winRate.toFixed(1) : '-',
    statsY.pf,
    acctPct,
    statsY.avgHoldH,
    statsY.closedCount > 0 ? '前日決済' + statsY.closedCount + '件' : '前日決済なし'
  );
  gcboReportToMeta_(
    rangeM.label,
    statsM.closedCount,
    statsM.closedCount > 0 ? statsM.winRate.toFixed(1) : '-',
    statsM.pf,
    acctPct,
    statsM.avgHoldH,
    rangeM.label + ' 累計'
  );
}

function gcboReportToMeta_(period, tradeCount, winRate, pf, netPnlPct, avgHoldH, recommendation) {
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
      'G-CBO',
      period,
      tradeCount,
      winRate,
      pf,
      typeof netPnlPct === 'number' ? netPnlPct.toFixed(3) + '%' : netPnlPct,
      avgHoldH,
      recommendation,
    ]);
    gcboLog_('META送信(' + period + ')');
  } catch (e) {
    gcboLog_('META送信失敗: ' + e.message);
  }
}

function gcboGenerateReport() {
  try {
    gcboRunReport_();
    SpreadsheetApp.getUi().alert('GCBOレポート更新・META送信完了');
  } catch (e) {
    SpreadsheetApp.getUi().alert('エラー: ' + e.message);
  }
}

function gcboGenerateReportAuto() {
  try {
    gcboRunReport_();
  } catch (e) {
    gcboLog_('レポートERROR: ' + e.message);
  }
}

function gcboInstallReportTrigger() {
  gcboRemoveReportTrigger();
  ScriptApp.newTrigger('gcboGenerateReportAuto').timeBased().atHour(6).everyDays(1).create();
  SpreadsheetApp.getUi().alert('毎日6時にMETAへ送信します');
}

function gcboRemoveReportTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'gcboGenerateReportAuto') ScriptApp.deleteTrigger(t);
  });
}

function gcboTestMetaSpreadsheet() {
  var sheetId = PropertiesService.getScriptProperties().getProperty('META_SPREADSHEET_ID');
  if (!sheetId) {
    SpreadsheetApp.getUi().alert('META_SPREADSHEET_ID 未設定');
    return;
  }
  SpreadsheetApp.getUi().alert('接続OK: ' + SpreadsheetApp.openById(sheetId).getName());
}
