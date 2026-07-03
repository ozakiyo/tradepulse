/**
 * チームF: 週次レポート
 * F6_売買履歴から 7日間 / 前日 / 今月 を集計。
 */

var F6_SHEET_REPORT = 'F6_週次レポート';
var F6_SHEET_DAILY = 'F6_日次レポート';
var F6_SHEET_MONTHLY = 'F6_月次レポート';
var F6_REPORT_MAX_TRADES = 50;
var F6_TRADE_COL = { time: 0, symbol: 1, side: 2, price: 3, amount: 4, memo: 6 };

function f6CollectReportTrades_() {
  var range = rptGetPeriodRange_('7d');
  return f6CollectReportTradesForPeriod_(range.from, range.to);
}

function f6CollectReportTradesForPeriod_(from, to) {
  return rptCollectTradesFromSheet_(F6_SHEET_TRADE, F6_TRADE_COL, from, to, 'symbol');
}

function f6CalcStats_(trades) {
  var closed = [];
  var wins = 0;
  var totalProfit = 0;
  var totalLoss = 0;
  var totalHold = 0;
  var holdCount = 0;

  for (var i = 0; i < trades.length; i++) {
    var t = trades[i];
    if (t.pnlPct == null) continue;
    closed.push(t);
    if (t.pnlPct >= 0) {
      wins++;
      totalProfit += t.pnlPct;
    } else {
      totalLoss += Math.abs(t.pnlPct);
    }
    if (t.entryTime && t.exitTime) {
      var ms = new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime();
      totalHold += ms / (60 * 60 * 1000);
      holdCount++;
    }
  }

  var netPnl = totalProfit - totalLoss;
  var winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;
  var pf =
    totalLoss > 0 ? (totalProfit / totalLoss).toFixed(2) : totalProfit > 0 ? '∞' : '-';

  return {
    closedCount: closed.length,
    openCount: trades.length - closed.length,
    wins: wins,
    winRate: winRate,
    pf: pf,
    netPnl: netPnl,
    avgHoldH: holdCount > 0 ? Math.round((totalHold / holdCount) * 10) / 10 : 0,
  };
}

/* ====================================================================
 * 2. ダウ理論整合性チェック（日足トレンド + 1Hエントリー）
 * ==================================================================== */

function f6AnalyzeDowConsistency_(trades, cfg) {
  var results = [];
  var limit = Math.min(trades.length, F6_REPORT_MAX_TRADES);

  for (var i = 0; i < limit; i++) {
    var t = trades[i];
    var analysis = {
      trade: t,
      trendDirection: null,
      trendMatch: null,
      entryTiming: null,
      exitTiming: null,
    };

    try {
      var candlesDaily = f6ParseYahooCandles_(f6FetchYahooChart_(t.symbol, '1d', '1y'));
      var trendResult = f6JudgeTrend_(candlesDaily, cfg.swingStrengthDaily);
      analysis.trendDirection = trendResult.trend;

      var expectedDir = t.side === 'long' ? 'up' : 'down';
      analysis.trendMatch = trendResult.trend === expectedDir ? '一致' : '不一致';

      var candles1h = f6ParseYahooCandles_(f6FetchYahooChart_(t.symbol, '1h', '60d'));
      var entryTime = new Date(t.entryTime).getTime();
      var entryIdx = -1;
      for (var j = 0; j < candles1h.length; j++) {
        if (candles1h[j].time >= entryTime) { entryIdx = j; break; }
      }

      if (entryIdx >= 0) {
        var swings = f6DetectSwings_(candles1h.slice(0, entryIdx + 1), cfg.swingStrength1h);
        var relevantSwings = [];
        for (var s = 0; s < swings.length; s++) {
          if (t.side === 'long' && swings[s].type === 'high') relevantSwings.push(swings[s]);
          if (t.side === 'short' && swings[s].type === 'low') relevantSwings.push(swings[s]);
        }
        if (relevantSwings.length > 0) {
          var lastSwing = relevantSwings[relevantSwings.length - 1];
          var distPct = Math.abs(t.entryPrice - lastSwing.value) / lastSwing.value * 100;
          if (distPct < 0.05) analysis.entryTiming = '適切';
          else if (distPct < 0.2) analysis.entryTiming = 'やや遅い';
          else analysis.entryTiming = '遅い(' + distPct.toFixed(3) + '%)';
        } else {
          analysis.entryTiming = 'スイング不足';
        }
      } else {
        analysis.entryTiming = 'データ範囲外';
      }

      if (t.exitPrice != null && t.exitTime) {
        var exitTime = new Date(t.exitTime).getTime();
        var exitIdx = -1;
        for (var k = 0; k < candles1h.length; k++) {
          if (candles1h[k].time >= exitTime) { exitIdx = k; break; }
        }

        if (exitIdx >= 0) {
          var lookAhead = Math.min(exitIdx + 24, candles1h.length);
          var afterExit = candles1h.slice(exitIdx, lookAhead);
          if (afterExit.length > 0) {
            var bestAfter = afterExit[0].close;
            for (var m = 1; m < afterExit.length; m++) {
              if (t.side === 'long') {
                if (afterExit[m].high > bestAfter) bestAfter = afterExit[m].high;
              } else {
                if (afterExit[m].low < bestAfter) bestAfter = afterExit[m].low;
              }
            }

            var missedPct;
            if (t.side === 'long') {
              missedPct = ((bestAfter - t.exitPrice) / t.exitPrice) * 100;
            } else {
              missedPct = ((t.exitPrice - bestAfter) / t.exitPrice) * 100;
            }

            if (missedPct > 0.2) {
              analysis.exitTiming = '早い(+' + missedPct.toFixed(3) + '%取りこぼし)';
            } else if (missedPct < -0.05) {
              analysis.exitTiming = '適切(反転確認)';
            } else {
              analysis.exitTiming = '適切';
            }
          } else {
            analysis.exitTiming = 'データ不足';
          }
        } else {
          analysis.exitTiming = 'データ範囲外';
        }
      } else {
        analysis.exitTiming = '未決済';
      }
    } catch (e) {
      analysis.trendMatch = 'エラー: ' + e.message;
      analysis.entryTiming = '-';
      analysis.exitTiming = '-';
    }

    results.push(analysis);
    if (i < limit - 1) Utilities.sleep(500);
  }

  return results;
}

/* ====================================================================
 * 3. 改善提案
 * ==================================================================== */

function f6GenerateRecommendations_(analyses, cfg) {
  var recs = [];
  var earlyExitCount = 0;
  var trendMismatchCount = 0;
  var totalClosed = 0;
  var symbolStats = {};

  for (var i = 0; i < analyses.length; i++) {
    var a = analyses[i];
    var t = a.trade;

    if (t.pnlPct != null) {
      totalClosed++;
      if (!symbolStats[t.symbol]) {
        symbolStats[t.symbol] = { wins: 0, losses: 0, count: 0 };
      }
      symbolStats[t.symbol].count++;
      if (t.pnlPct >= 0) symbolStats[t.symbol].wins++;
      else symbolStats[t.symbol].losses++;
    }

    if (a.exitTiming && a.exitTiming.indexOf('早い') >= 0) earlyExitCount++;
    if (a.trendMatch === '不一致') trendMismatchCount++;
  }

  if (totalClosed > 0 && earlyExitCount / totalClosed >= 0.4) {
    recs.push({
      category: '決済タイミング',
      current: 'SWING_STRENGTH_1H=' + cfg.swingStrength1h,
      proposed: 'SWING_STRENGTH_1H=' + (cfg.swingStrength1h + 2),
      reason: '決済が早すぎるケースが' + Math.round(earlyExitCount / totalClosed * 100) + '% — strengthを上げて感度を下げる',
    });
  }

  if (totalClosed > 0 && trendMismatchCount / totalClosed >= 0.3) {
    recs.push({
      category: '日足トレンド精度',
      current: 'SWING_STRENGTH_DAILY=' + cfg.swingStrengthDaily,
      proposed: 'SWING_STRENGTH_DAILY=' + (cfg.swingStrengthDaily + 3),
      reason: '日足トレンドと反対方向の決済が' + Math.round(trendMismatchCount / totalClosed * 100) + '% — strengthを上げてノイズを減らす',
    });
  }

  for (var sym in symbolStats) {
    var ss = symbolStats[sym];
    if (ss.count >= 3 && ss.wins / ss.count < 0.3) {
      recs.push({
        category: '銘柄除外検討',
        current: sym,
        proposed: 'INSTRUMENTSから除外',
        reason: sym + ' 勝率' + Math.round(ss.wins / ss.count * 100) + '% (' + ss.count + '回中' + ss.wins + '勝)',
      });
    }
  }

  if (recs.length === 0) {
    recs.push({
      category: '所見',
      current: '-',
      proposed: '-',
      reason: '現在のパラメータで問題なし。引き続き運用を継続。',
    });
  }

  return recs;
}

/* ====================================================================
 * 4. シート出力
 * ==================================================================== */

function f6WritePeriodSheet_(sheetName, title, trades, stats) {
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
  sheet.getRange(row, 1, 1, 2).setValues([
    ['総損益率', stats.closedCount > 0 ? stats.netPnl.toFixed(3) + '%' : '-'],
  ]);
  row += 2;

  sheet.getRange(row, 1).setValue('【トレード詳細】').setFontWeight('bold');
  row++;
  var headers = ['銘柄', 'エントリー', '決済', '方向', '損益%', 'メモ'];
  sheet.getRange(row, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  row++;

  var limit = Math.min(trades.length, F6_REPORT_MAX_TRADES);
  for (var i = 0; i < limit; i++) {
    var t = trades[i];
    sheet.getRange(row, 1, 1, headers.length).setValues([[
      t.symbol || '',
      t.entryTime || '',
      t.exitTime || '保有中',
      t.side || '',
      t.pnlPct != null ? t.pnlPct.toFixed(3) + '%' : '-',
      t.reason || '',
    ]]);
    row++;
  }
}

function f6WriteReport_(trades, analyses, recs, periodBundle) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(F6_SHEET_REPORT);
  if (!sheet) {
    sheet = ss.insertSheet(F6_SHEET_REPORT);
  }
  sheet.clear();

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var cutoffDate = Utilities.formatDate(
    new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000), 'Asia/Tokyo', 'yyyy-MM-dd'
  );
  var row = 1;

  row = rptWriteComparisonBlock_(sheet, row, periodBundle);
  row++;

  sheet.getRange(row, 1).setValue('【セクションA: サマリー】').setFontWeight('bold');
  row++;

  var closed = [];
  var wins = 0;
  var totalProfit = 0;
  var totalLoss = 0;
  for (var i = 0; i < trades.length; i++) {
    if (trades[i].pnlPct != null) {
      closed.push(trades[i]);
      if (trades[i].pnlPct >= 0) { wins++; totalProfit += trades[i].pnlPct; }
      else { totalLoss += Math.abs(trades[i].pnlPct); }
    }
  }
  var winRate = closed.length > 0 ? (wins / closed.length * 100).toFixed(1) : '-';
  var pf = totalLoss > 0 ? (totalProfit / totalLoss).toFixed(2) : (totalProfit > 0 ? '∞' : '-');
  var netPnl = (totalProfit - totalLoss).toFixed(3);

  sheet.getRange(row, 1, 1, 2).setValues([['期間', cutoffDate + ' ～ ' + now]]); row++;
  sheet.getRange(row, 1, 1, 2).setValues([['決済済み取引数', closed.length]]); row++;
  sheet.getRange(row, 1, 1, 2).setValues([['保有中', trades.length - closed.length]]); row++;
  sheet.getRange(row, 1, 1, 2).setValues([['勝率', winRate + '%']]); row++;
  sheet.getRange(row, 1, 1, 2).setValues([['総損益率', netPnl + '%']]); row++;
  sheet.getRange(row, 1, 1, 2).setValues([['プロフィットファクター', pf]]); row += 2;

  sheet.getRange(row, 1).setValue('【セクションB: 銘柄別成績】').setFontWeight('bold'); row++;
  sheet.getRange(row, 1, 1, 5).setValues([['銘柄', '取引数', '勝率', '平均利益率', '平均損失率']]);
  sheet.getRange(row, 1, 1, 5).setFontWeight('bold'); row++;

  var bySymbol = {};
  for (var i = 0; i < closed.length; i++) {
    var c = closed[i];
    if (!bySymbol[c.symbol]) bySymbol[c.symbol] = { wins: 0, losses: 0, profitSum: 0, lossSum: 0, count: 0 };
    var bs = bySymbol[c.symbol];
    bs.count++;
    if (c.pnlPct >= 0) { bs.wins++; bs.profitSum += c.pnlPct; }
    else { bs.losses++; bs.lossSum += Math.abs(c.pnlPct); }
  }
  for (var sym in bySymbol) {
    var s = bySymbol[sym];
    sheet.getRange(row, 1, 1, 5).setValues([[
      sym, s.count,
      (s.wins / s.count * 100).toFixed(1) + '%',
      s.wins > 0 ? (s.profitSum / s.wins).toFixed(3) + '%' : '-',
      s.losses > 0 ? (s.lossSum / s.losses).toFixed(3) + '%' : '-',
    ]]); row++;
  }
  row++;

  sheet.getRange(row, 1).setValue('【セクションC: トレード詳細 + ダウ理論チェック】').setFontWeight('bold'); row++;
  var headers = ['日時', '銘柄', '方向', 'エントリー', '決済', '損益%', '日足トレンド', '方向一致', 'エントリー評価', '決済評価', '理由'];
  sheet.getRange(row, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(row, 1, 1, headers.length).setFontWeight('bold'); row++;

  for (var i = 0; i < analyses.length; i++) {
    var a = analyses[i];
    var t = a.trade;
    sheet.getRange(row, 1, 1, headers.length).setValues([[
      t.entryTime || '', t.symbol || '', t.side || '',
      t.entryPrice || '', t.exitPrice || '保有中',
      t.pnlPct != null ? t.pnlPct.toFixed(3) + '%' : '-',
      a.trendDirection || '-', a.trendMatch || '-',
      a.entryTiming || '-', a.exitTiming || '-', t.reason || '',
    ]]); row++;
  }
  row++;

  sheet.getRange(row, 1).setValue('【セクションD: 改善提案】').setFontWeight('bold'); row++;
  sheet.getRange(row, 1, 1, 4).setValues([['カテゴリ', '現在値', '提案値', '理由']]);
  sheet.getRange(row, 1, 1, 4).setFontWeight('bold'); row++;

  for (var i = 0; i < recs.length; i++) {
    var r = recs[i];
    sheet.getRange(row, 1, 1, 4).setValues([[r.category, r.current, r.proposed, r.reason]]); row++;
  }

  f6Log_('週次レポート出力完了 (' + trades.length + '件, ' + analyses.length + '件分析)');
}

/* ====================================================================
 * 公開関数
 * ==================================================================== */

function f6RunReport_() {
  var cfg = f6GetConfig_();
  var range7 = rptGetPeriodRange_('7d');
  var rangeY = rptGetPeriodRange_('yesterday');
  var rangeM = rptGetPeriodRange_('month');

  var trades7d = f6CollectReportTradesForPeriod_(range7.from, range7.to);
  var tradesY = f6CollectReportTradesForPeriod_(rangeY.from, rangeY.to);
  var tradesM = f6CollectReportTradesForPeriod_(rangeM.from, rangeM.to);

  var stats7d = f6CalcStats_(trades7d);
  var statsY = f6CalcStats_(tradesY);
  var statsM = f6CalcStats_(tradesM);

  var periodBundle = [
    { label: rangeY.label, stats: rptCalcStats_(tradesY) },
    { label: range7.label, stats: rptCalcStats_(trades7d) },
    { label: rangeM.label, stats: rptCalcStats_(tradesM) },
  ];

  if (trades7d.length === 0 && tradesY.length === 0 && tradesM.length === 0) {
    f6Log_('週次レポート: 取引なし');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(F6_SHEET_REPORT);
    if (!sheet) sheet = ss.insertSheet(F6_SHEET_REPORT);
    sheet.clear();
    sheet.getRange(1, 1).setValue(
      '取引なし (' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm') + ')'
    );
    f6ReportToMeta_('F-FX', '7日間', 0, '-', '-', 0, 0, '取引なし');
    f6ReportToMeta_('F-FX', '前日', 0, '-', '-', 0, 0, '取引なし');
    f6ReportToMeta_('F-FX', rangeM.label, 0, '-', '-', 0, 0, '取引なし');
    return;
  }

  var analyses = f6AnalyzeDowConsistency_(trades7d, cfg);
  var recs = f6GenerateRecommendations_(analyses, cfg);
  f6WriteReport_(trades7d, analyses, recs, periodBundle);
  f6WritePeriodSheet_(F6_SHEET_DAILY, '【F-FX 前日レポート】', tradesY, statsY);
  f6WritePeriodSheet_(F6_SHEET_MONTHLY, '【F-FX 月次レポート】', tradesM, statsM);

  var recText = recs.length > 0 ? recs[0].reason : '-';
  f6ReportToMeta_(
    'F-FX',
    '7日間',
    stats7d.closedCount,
    stats7d.closedCount > 0 ? stats7d.winRate.toFixed(1) : '-',
    stats7d.pf,
    stats7d.netPnl,
    stats7d.avgHoldH,
    recText
  );
  f6ReportToMeta_(
    'F-FX',
    '前日',
    statsY.closedCount,
    statsY.closedCount > 0 ? statsY.winRate.toFixed(1) : '-',
    statsY.pf,
    statsY.netPnl,
    statsY.avgHoldH,
    statsY.closedCount > 0 ? '前日決済 ' + statsY.closedCount + '件' : '前日決済なし'
  );
  f6ReportToMeta_(
    'F-FX',
    rangeM.label,
    statsM.closedCount,
    statsM.closedCount > 0 ? statsM.winRate.toFixed(1) : '-',
    statsM.pf,
    statsM.netPnl,
    statsM.avgHoldH,
    rangeM.label + ' 累計'
  );
}

function f6ReportToMeta_(teamName, period, tradeCount, winRate, pf, netPnl, avgHoldH, recommendation) {
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
      teamName, period, tradeCount, winRate, pf,
      typeof netPnl === 'number' ? netPnl.toFixed(3) + '%' : netPnl,
      avgHoldH, recommendation,
    ]);
    f6Log_('META統合レポートに送信完了 (' + teamName + ')');
  } catch (e) {
    f6Log_('META統合レポート送信失敗: ' + e.message);
  }
}
