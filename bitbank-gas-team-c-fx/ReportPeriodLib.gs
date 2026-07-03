/**
 * レポート期間ユーティリティ（全チーム共通ロジック）
 * - 7日間 / 前日 / 今月 の期間集計
 * - グリッド（トラリピ）: 売りメモの買値でペアリング（FIFO廃止）
 */

function rptGetPeriodRange_(kind) {
  var now = new Date();
  var todayYmd = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');

  if (kind === '7d') {
    return {
      kind: '7d',
      label: '7日間',
      from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      to: now,
    };
  }

  if (kind === 'yesterday') {
    var y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    var ymd = Utilities.formatDate(y, 'Asia/Tokyo', 'yyyy-MM-dd');
    return {
      kind: 'yesterday',
      label: '前日(' + ymd + ')',
      from: rptParseJstMidnight_(ymd),
      to: rptParseJstMidnight_(todayYmd),
    };
  }

  if (kind === 'month') {
    var ym = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM');
    return {
      kind: 'month',
      label: ym + '月',
      from: rptParseJstMidnight_(ym + '-01'),
      to: now,
    };
  }

  throw new Error('unknown period kind: ' + kind);
}

function rptParseJstMidnight_(ymd) {
  var p = String(ymd).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 0, 0, 0);
}

function rptRowInRange_(rowDate, from, to) {
  if (isNaN(rowDate.getTime())) return false;
  return rowDate >= from && rowDate < to;
}

/**
 * @param {Object} colMap { time, side, price, amount, memo, symbol? }
 * @param {string} pairMode 'grid' | 'single' | 'symbol'
 */
function rptCollectTradesFromSheet_(sheetName, colMap, from, to, pairMode) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];

  var data = sheet.getDataRange().getValues();
  var rows = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var timeStr = String(row[colMap.time]);
    var rowDate = new Date(timeStr);
    if (!rptRowInRange_(rowDate, from, to)) continue;

    var side = String(row[colMap.side]).trim();
    var price = Number(row[colMap.price]);
    var amount = Number(row[colMap.amount]);
    var memo = colMap.memo != null ? String(row[colMap.memo] || '') : '';
    var symbol = colMap.symbol != null ? String(row[colMap.symbol] || '').trim() : '';

    rows.push({
      time: timeStr,
      side: side,
      price: price,
      amount: amount,
      memo: memo,
      symbol: symbol,
    });
  }

  if (pairMode === 'grid') return rptPairGridTrades_(rows);
  if (pairMode === 'mixed') return rptPairMixedTrades_(rows);
  if (pairMode === 'symbol') return rptPairSymbolTrades_(rows);
  return rptPairSingleTrades_(rows);
}

/** トラリピ + スイング混在（チームA） */
function rptPairMixedTrades_(rows) {
  var openBuys = [];
  var trades = [];

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r.side === '買い') {
      openBuys.push({
        time: r.time,
        price: r.price,
        amount: r.amount,
        memo: r.memo,
        used: false,
      });
      continue;
    }

    if (r.side !== '売り') continue;

    var entry = null;
    var memo = String(r.memo || '');
    if (memo.indexOf('スイング') >= 0) {
      for (var s = openBuys.length - 1; s >= 0; s--) {
        if (!openBuys[s].used && String(openBuys[s].memo).indexOf('スイング') >= 0) {
          entry = openBuys[s];
          break;
        }
      }
    }
    if (!entry) entry = rptMatchGridSellToBuy_(openBuys, r);
    if (!entry) continue;

    entry.used = true;
    var pnlJpy = (r.price - entry.price) * entry.amount;
    trades.push({
      entryTime: entry.time,
      exitTime: r.time,
      side: 'long',
      entryPrice: entry.price,
      exitPrice: r.price,
      amount: entry.amount,
      pnlJpy: pnlJpy,
      pnlPct: ((r.price - entry.price) / entry.price) * 100,
      reason: r.memo,
    });
  }

  for (var j = 0; j < openBuys.length; j++) {
    if (openBuys[j].used) continue;
    trades.push({
      entryTime: openBuys[j].time,
      exitTime: null,
      side: 'long',
      entryPrice: openBuys[j].price,
      exitPrice: null,
      amount: openBuys[j].amount,
      pnlJpy: null,
      pnlPct: null,
      reason: String(openBuys[j].memo).indexOf('スイング') >= 0 ? '保有中(スイング)' : '保有中(グリッド)',
    });
  }

  return trades;
}

/** トラリピ: 売りメモ「買12345+…」または同一価格取消でペア */
function rptPairGridTrades_(rows) {
  var openBuys = [];
  var trades = [];

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r.side === '買い') {
      openBuys.push({
        time: r.time,
        price: r.price,
        amount: r.amount,
        memo: r.memo,
        used: false,
      });
      continue;
    }

    if (r.side !== '売り') continue;

    var entry = rptMatchGridSellToBuy_(openBuys, r);
    if (!entry) continue;

    entry.used = true;
    var pnlJpy = (r.price - entry.price) * entry.amount;
    trades.push({
      entryTime: entry.time,
      exitTime: r.time,
      side: 'long',
      entryPrice: entry.price,
      exitPrice: r.price,
      amount: entry.amount,
      pnlJpy: pnlJpy,
      pnlPct: ((r.price - entry.price) / entry.price) * 100,
      reason: r.memo,
    });
  }

  for (var j = 0; j < openBuys.length; j++) {
    if (openBuys[j].used) continue;
    trades.push({
      entryTime: openBuys[j].time,
      exitTime: null,
      side: 'long',
      entryPrice: openBuys[j].price,
      exitPrice: null,
      amount: openBuys[j].amount,
      pnlJpy: null,
      pnlPct: null,
      reason: '保有中(グリッド)',
    });
  }

  return trades;
}

function rptMatchGridSellToBuy_(openBuys, sell) {
  var memo = String(sell.memo || '');
  var m = memo.match(/買(\d+)/);
  if (m) {
    var buyPrice = Number(m[1]);
    for (var i = openBuys.length - 1; i >= 0; i--) {
      if (
        !openBuys[i].used &&
        openBuys[i].price === buyPrice &&
        openBuys[i].amount === sell.amount
      ) {
        return openBuys[i];
      }
    }
  }

  if (memo.indexOf('グリッド取消') >= 0 || memo.indexOf('取消') >= 0) {
    for (var c = openBuys.length - 1; c >= 0; c--) {
      if (
        !openBuys[c].used &&
        openBuys[c].price === sell.price &&
        openBuys[c].amount === sell.amount
      ) {
        return openBuys[c];
      }
    }
  }

  var best = null;
  for (var k = openBuys.length - 1; k >= 0; k--) {
    if (openBuys[k].used || openBuys[k].amount !== sell.amount) continue;
    if (openBuys[k].price <= sell.price + 1) {
      if (!best || openBuys[k].price > best.price) best = openBuys[k];
    }
  }
  return best;
}

function rptPairSingleTrades_(rows) {
  var trades = [];
  var openBuy = null;

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r.side === '買い') {
      openBuy = r;
    } else if (r.side === '売り' && openBuy) {
      var pnlJpy = (r.price - openBuy.price) * openBuy.amount;
      trades.push({
        entryTime: openBuy.time,
        exitTime: r.time,
        side: 'long',
        entryPrice: openBuy.price,
        exitPrice: r.price,
        amount: openBuy.amount,
        pnlJpy: pnlJpy,
        pnlPct: ((r.price - openBuy.price) / openBuy.price) * 100,
        reason: r.memo,
      });
      openBuy = null;
    }
  }

  if (openBuy) {
    trades.push({
      entryTime: openBuy.time,
      exitTime: null,
      side: 'long',
      entryPrice: openBuy.price,
      exitPrice: null,
      amount: openBuy.amount,
      pnlJpy: null,
      pnlPct: null,
      reason: '保有中',
    });
  }

  return trades;
}

function rptPairSymbolTrades_(rows) {
  var entries = {};
  var trades = [];

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var sym = r.symbol || '_';
    var memo = r.memo || '';

    if (memo.indexOf('押し目買い') >= 0 || memo.indexOf('戻り売り') >= 0 || memo.indexOf('エントリー') >= 0) {
      entries[sym] = r;
    } else if (entries[sym]) {
      var entry = entries[sym];
      var entrySide = entry.side === '買い' ? 'long' : 'short';
      var pnlPct =
        entrySide === 'long'
          ? ((r.price - entry.price) / entry.price) * 100
          : ((entry.price - r.price) / entry.price) * 100;
      var pnlJpy =
        entrySide === 'long'
          ? (r.price - entry.price) * entry.amount
          : (entry.price - r.price) * entry.amount;

      trades.push({
        symbol: sym,
        entryTime: entry.time,
        exitTime: r.time,
        side: entrySide,
        entryPrice: entry.price,
        exitPrice: r.price,
        amount: entry.amount,
        pnlJpy: pnlJpy,
        pnlPct: pnlPct,
        reason: r.memo,
      });
      delete entries[sym];
    }
  }

  return trades;
}

function rptCalcStats_(trades) {
  var closed = [];
  var wins = 0;
  var totalProfit = 0;
  var totalLoss = 0;
  var totalHold = 0;
  var holdCount = 0;

  for (var i = 0; i < trades.length; i++) {
    var t = trades[i];
    if (t.pnlJpy == null) continue;
    closed.push(t);
    if (t.pnlJpy >= 0) {
      wins++;
      totalProfit += t.pnlJpy;
    } else {
      totalLoss += Math.abs(t.pnlJpy);
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

function rptWriteComparisonBlock_(sheet, startRow, periodStats) {
  var row = startRow;
  sheet.getRange(row, 1).setValue('【期間比較サマリー】').setFontWeight('bold');
  row++;
  sheet
    .getRange(row, 1, 1, 6)
    .setValues([['期間', '決済数', '未決済', '勝率%', 'PF', '純損益(円)']])
    .setFontWeight('bold');
  row++;

  for (var i = 0; i < periodStats.length; i++) {
    var ps = periodStats[i];
    var s = ps.stats;
    sheet.getRange(row, 1, 1, 6).setValues([
      [
        ps.label,
        s.closedCount,
        s.openCount,
        s.closedCount > 0 ? s.winRate.toFixed(1) : '-',
        s.pf,
        Math.round(s.netPnl).toLocaleString(),
      ],
    ]);
    row++;
  }

  return row + 1;
}

function rptWriteTradeDetailBlock_(sheet, startRow, trades, maxRows) {
  var row = startRow;
  sheet.getRange(row, 1).setValue('【トレード詳細】').setFontWeight('bold');
  row++;
  var headers = ['買い日時', '売り日時', 'エントリー', '決済', '数量', '損益(円)', '損益%', 'メモ'];
  sheet.getRange(row, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  row++;

  var limit = Math.min(trades.length, maxRows || 200);
  for (var i = 0; i < limit; i++) {
    var t = trades[i];
    sheet.getRange(row, 1, 1, headers.length).setValues([
      [
        t.entryTime || '',
        t.exitTime || '保有中',
        t.entryPrice || '',
        t.exitPrice || '-',
        t.amount || '',
        t.pnlJpy != null ? Math.round(t.pnlJpy) : '-',
        t.pnlPct != null ? t.pnlPct.toFixed(3) + '%' : '-',
        t.reason || '',
      ],
    ]);
    row++;
  }
  return row + 1;
}

function rptRunStandardReports_(cfg) {
  var range7 = rptGetPeriodRange_('7d');
  var rangeY = rptGetPeriodRange_('yesterday');
  var rangeM = rptGetPeriodRange_('month');

  var trades7 = rptCollectTradesFromSheet_(
    cfg.tradeSheet,
    cfg.colMap,
    range7.from,
    range7.to,
    cfg.pairMode
  );
  var tradesY = rptCollectTradesFromSheet_(
    cfg.tradeSheet,
    cfg.colMap,
    rangeY.from,
    rangeY.to,
    cfg.pairMode
  );
  var tradesM = rptCollectTradesFromSheet_(
    cfg.tradeSheet,
    cfg.colMap,
    rangeM.from,
    rangeM.to,
    cfg.pairMode
  );

  var stats7 = rptCalcStats_(trades7);
  var statsY = rptCalcStats_(tradesY);
  var statsM = rptCalcStats_(tradesM);

  var periodBundle = [
    { label: rangeY.label, stats: statsY },
    { label: range7.label, stats: stats7 },
    { label: rangeM.label, stats: statsM },
  ];

  if (cfg.writeWeekly) cfg.writeWeekly(trades7, stats7, periodBundle);
  if (cfg.dailySheet) {
    rptWritePeriodSheetSimple_(cfg.dailySheet, cfg.teamLabel + ' 前日', tradesY, statsY);
  }
  if (cfg.monthlySheet) {
    rptWritePeriodSheetSimple_(cfg.monthlySheet, cfg.teamLabel + ' 月次', tradesM, statsM);
  }

  if (cfg.sendMeta) {
    cfg.sendMeta('7日間', stats7, cfg.rec7d || '-');
    cfg.sendMeta('前日', statsY, statsY.closedCount > 0 ? '前日決済 ' + statsY.closedCount + '件' : '前日決済なし');
    cfg.sendMeta(rangeM.label, statsM, rangeM.label + ' 累計');
  }

  if (cfg.logFn) {
    cfg.logFn(
      '期間レポート 前日:' + statsY.closedCount + ' / 7日:' + stats7.closedCount + ' / 月:' + statsM.closedCount
    );
  }

  return { trades7: trades7, stats7: stats7, statsY: statsY, statsM: statsM, periodBundle: periodBundle };
}

function rptWritePeriodSheetSimple_(sheetName, title, trades, stats) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  sheet.clear();
  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var row = 1;
  sheet.getRange(row, 1).setValue('【' + title + '】 ' + now).setFontWeight('bold');
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
  rptWriteTradeDetailBlock_(sheet, row, trades, 200);
}

function rptRunStandardReports_(cfg) {
  var range7 = rptGetPeriodRange_('7d');
  var rangeY = rptGetPeriodRange_('yesterday');
  var rangeM = rptGetPeriodRange_('month');

  var trades7 = rptCollectTradesFromSheet_(
    cfg.tradeSheet,
    cfg.colMap,
    range7.from,
    range7.to,
    cfg.pairMode
  );
  var tradesY = rptCollectTradesFromSheet_(
    cfg.tradeSheet,
    cfg.colMap,
    rangeY.from,
    rangeY.to,
    cfg.pairMode
  );
  var tradesM = rptCollectTradesFromSheet_(
    cfg.tradeSheet,
    cfg.colMap,
    rangeM.from,
    rangeM.to,
    cfg.pairMode
  );

  var stats7 = rptCalcStats_(trades7);
  var statsY = rptCalcStats_(tradesY);
  var statsM = rptCalcStats_(tradesM);

  var periodBundle = [
    { label: rangeY.label, stats: statsY },
    { label: range7.label, stats: stats7 },
    { label: rangeM.label, stats: statsM },
  ];

  if (cfg.writeWeekly) cfg.writeWeekly(trades7, stats7, periodBundle);
  if (cfg.dailySheet) {
    rptWritePeriodSheetSimple_(cfg.dailySheet, cfg.teamLabel + ' 前日', tradesY, statsY);
  }
  if (cfg.monthlySheet) {
    rptWritePeriodSheetSimple_(cfg.monthlySheet, cfg.teamLabel + ' 月次', tradesM, statsM);
  }

  if (cfg.sendMeta) {
    cfg.sendMeta('7日間', stats7, cfg.rec7d || '-');
    cfg.sendMeta('前日', statsY, statsY.closedCount > 0 ? '前日決済 ' + statsY.closedCount + '件' : '前日決済なし');
    cfg.sendMeta(rangeM.label, statsM, rangeM.label + ' 累計');
  }

  if (cfg.logFn) {
    cfg.logFn(
      '期間レポート 前日:' + statsY.closedCount + ' / 7日:' + stats7.closedCount + ' / 月:' + statsM.closedCount
    );
  }

  return { trades7: trades7, stats7: stats7, statsY: statsY, statsM: statsM, periodBundle: periodBundle };
}

function rptWritePeriodSheetSimple_(sheetName, title, trades, stats) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  sheet.clear();
  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var row = 1;
  sheet.getRange(row, 1).setValue('【' + title + '】 ' + now).setFontWeight('bold');
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
  rptWriteTradeDetailBlock_(sheet, row, trades, 200);
}
