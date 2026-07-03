/**
 * 紙トレード: 各チーム単体 30万円 / 合計 150万円
 */
var META_SHEET_PAPER_TRADES = 'META_紙トレード';
var META_SHEET_COMPETITION = 'META_競争比較';

function metaGetPaperTradesSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(META_SHEET_PAPER_TRADES);
  if (!sheet) {
    sheet = ss.insertSheet(META_SHEET_PAPER_TRADES);
    sheet.appendRow(['日時', 'チーム', '売買', '価格', '数量(BTC)', '処理済']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function metaGetCompetitionSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(META_SHEET_COMPETITION);
  if (!sheet) {
    sheet = ss.insertSheet(META_SHEET_COMPETITION);
    metaInitCompetitionLayout_(sheet);
  }
  return sheet;
}

function metaInitCompetitionLayout_(sheet) {
  sheet.clear();
  var cap = META_CONFIG.DUMMY_CAPITAL_PER_TEAM;
  var total = META_CONFIG.DUMMY_TOTAL_CAPITAL;

  sheet.getRange(1, 1).setValue('メタ層 競争比較（紙トレード）');
  sheet.getRange(2, 1).setValue('各チーム単体持分: ' + cap.toLocaleString() + '円 × 5 = 合計 ' + total.toLocaleString() + '円');
  sheet.getRange(3, 1).setValue('更新: ');
  sheet.getRange(3, 2).setValue('');

  sheet.getRange(5, 1).setValue('■ 単体運用（各チーム30万円フル稼働）');
  sheet.getRange(6, 1, 6, 8).setValues([
    ['チーム', '初期(円)', 'JPY', 'BTC', '評価額(円)', '損益(円)', '損益率(%)', '取引数'],
  ]);
  sheet.getRange(6, 1, 6, 8).setFontWeight('bold');

  sheet.getRange(14, 1).setValue('■ メタ配分運用（合計150万円プール）');
  sheet.getRange(15, 1).setValue('現在配分 →');
  sheet.getRange(16, 1, 16, 9).setValues([
    ['チーム', '配分%', '配分額(円)', '単体損益率(%)', '貢献損益(円)', '評価額(円)', 'JPY', 'BTC', '取引数'],
  ]);
  sheet.getRange(16, 1, 16, 9).setFontWeight('bold');

  sheet.getRange(24, 1).setValue('■ サマリー');
  sheet.getRange(25, 1).setValue('単体合計評価額');
  sheet.getRange(26, 1).setValue('単体合計損益');
  sheet.getRange(27, 1).setValue('メタ配分評価額');
  sheet.getRange(28, 1).setValue('メタ配分損益');
  sheet.getRange(29, 1).setValue('メタ vs 単体（損益差）');
  sheet.getRange(30, 1).setValue('現金待機（メタ）');

  sheet.setColumnWidth(1, 120);
  sheet.setColumnWidth(5, 120);
  sheet.setColumnWidth(6, 120);
}

function metaLoadPaperState_() {
  var raw = PropertiesService.getScriptProperties().getProperty('META_PAPER_STATE');
  var cap = META_CONFIG.DUMMY_CAPITAL_PER_TEAM;
  var emptyTeam = function () {
    return {
      jpy: cap,
      btc: 0,
      trades: 0,
      realizedPnl: 0,
    };
  };
  if (!raw) {
    return {
      teams: { A: emptyTeam(), B: emptyTeam(), C: emptyTeam(), D: emptyTeam(), E: emptyTeam() },
      processedTradeRows: 0,
    };
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    return {
      teams: { A: emptyTeam(), B: emptyTeam(), C: emptyTeam(), D: emptyTeam(), E: emptyTeam() },
      processedTradeRows: 0,
    };
  }
}

function metaSavePaperState_(state) {
  PropertiesService.getScriptProperties().setProperty('META_PAPER_STATE', JSON.stringify(state));
}

function metaProcessPaperTrades_() {
  var sheet = metaGetPaperTradesSheet_();
  var state = metaLoadPaperState_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return state;

  var startRow = Math.max(2, (state.processedTradeRows || 0) + 1);
  if (startRow > lastRow) return state;

  var rows = sheet.getRange(startRow, 1, lastRow, 6).getValues();
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (String(row[5]) === '済') continue;

    var team = String(row[1] || '').toUpperCase();
    var side = String(row[2] || '');
    var price = Number(row[3]);
    var amount = Number(row[4]);
    if (!state.teams[team] || !price || !amount) continue;

    metaApplyPaperTrade_(state.teams[team], side, price, amount);
    sheet.getRange(startRow + i, 6).setValue('済');
    state.processedTradeRows = startRow + i;
  }
  metaSavePaperState_(state);
  return state;
}

function metaApplyPaperTrade_(account, side, price, amount) {
  var fee = META_CONFIG.PAPER_FEE_RATE;
  account.trades = (account.trades || 0) + 1;

  if (side === '買い' || side === 'buy') {
    var cost = price * amount * (1 + fee);
    if (account.jpy < cost) return;
    account.jpy -= cost;
    account.btc = (account.btc || 0) + amount;
  } else if (side === '売り' || side === 'sell') {
    if ((account.btc || 0) < amount) amount = account.btc;
    if (amount <= 0) return;
    var proceeds = price * amount * (1 - fee);
    account.jpy += proceeds;
    account.btc -= amount;
  }
}

function metaTeamEquity_(account, lastPrice) {
  var cap = META_CONFIG.DUMMY_CAPITAL_PER_TEAM;
  var jpy = account.jpy != null ? account.jpy : cap;
  var btc = account.btc || 0;
  var equity = jpy + btc * lastPrice;
  var pnl = equity - cap;
  var retPct = cap > 0 ? (pnl / cap) * 100 : 0;
  return { equity: equity, pnl: pnl, retPct: retPct, jpy: jpy, btc: btc };
}

function metaRefreshCompetition_(ticker, allocation) {
  var state = metaProcessPaperTrades_();
  var last = ticker.last;
  var cap = META_CONFIG.DUMMY_CAPITAL_PER_TEAM;
  var totalCap = META_CONFIG.DUMMY_TOTAL_CAPITAL;
  var teams = ['A', 'B', 'C', 'D', 'E'];
  var sheet = metaGetCompetitionSheet_();
  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  sheet.getRange(3, 2).setValue(now);

  var standaloneTotalEquity = 0;
  var standaloneTotalPnl = 0;
  var metaTotalEquity = 0;
  var metaTotalPnl = 0;
  var cashPct = allocation ? allocation.cash : 0;
  var cashIdle = totalCap * (cashPct / 100);

  for (var i = 0; i < teams.length; i++) {
    var t = teams[i];
    var acc = state.teams[t];
    var eq = metaTeamEquity_(acc, last);
    var row = 7 + i;

    sheet.getRange(row, 1, row, 8).setValues([
      [
        'チーム' + t,
        cap,
        Math.round(eq.jpy),
        eq.btc,
        Math.round(eq.equity),
        Math.round(eq.pnl),
        Math.round(eq.retPct * 100) / 100,
        acc.trades || 0,
      ],
    ]);

    standaloneTotalEquity += eq.equity;
    standaloneTotalPnl += eq.pnl;

    var pct = allocation && allocation.teams ? allocation.teams[t] || 0 : 0;
    var allocJpy = Math.round(totalCap * (pct / 100));
    var contribPnl = allocJpy * (eq.retPct / 100);
    var allocEquity = allocJpy + contribPnl;

    sheet.getRange(17 + i, 1, 17 + i, 9).setValues([
      [
        'チーム' + t,
        pct,
        allocJpy,
        Math.round(eq.retPct * 100) / 100,
        Math.round(contribPnl),
        Math.round(allocEquity),
        Math.round(eq.jpy * (pct / 100)),
        eq.btc * (pct / 100),
        acc.trades || 0,
      ],
    ]);

    metaTotalEquity += allocEquity;
    metaTotalPnl += contribPnl;
  }

  metaTotalEquity += cashIdle;
  metaTotalPnl += 0;

  if (allocation) {
    sheet.getRange(15, 2).setValue(allocation.recommendation || '');
  }

  sheet.getRange(25, 2).setValue(Math.round(standaloneTotalEquity));
  sheet.getRange(26, 2).setValue(Math.round(standaloneTotalPnl));
  sheet.getRange(27, 2).setValue(Math.round(metaTotalEquity));
  sheet.getRange(28, 2).setValue(Math.round(metaTotalPnl));
  sheet.getRange(29, 2).setValue(Math.round(metaTotalPnl - standaloneTotalPnl));
  sheet.getRange(30, 2).setValue(Math.round(cashIdle));

  sheet.getRange(25, 2, 30, 2).setNumberFormat('#,##0');

  return {
    standalone: { equity: standaloneTotalEquity, pnl: standaloneTotalPnl },
    meta: { equity: metaTotalEquity, pnl: metaTotalPnl, cashIdle: cashIdle },
    diff: metaTotalPnl - standaloneTotalPnl,
  };
}

/** 他チームGASから呼ぶ: 紙トレード1件を追記 */
function metaAppendPaperTrade_(team, side, price, amount) {
  metaGetPaperTradesSheet_().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    String(team).toUpperCase(),
    side,
    price,
    amount,
    '',
  ]);
}

function metaResetPaperAccounts_() {
  PropertiesService.getScriptProperties().deleteProperty('META_PAPER_STATE');
  var sheet = metaGetPaperTradesSheet_();
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow(), 6).clearContent();
  }
  metaLog_('紙トレード口座をリセットしました');
}
