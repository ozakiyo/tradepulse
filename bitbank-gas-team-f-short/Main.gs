/**
 * チームF-FX-Short: 1H+5m+30m トレンドフォロー — FX専用（紙トレード専用）
 * 1Hトレンド判定 → 5mエントリー → 30m決済。10分トリガーでバッチ処理。
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('チームF-FX-Short Bot')
    .addItem('1. スクリプトプロパティを開く', 'f6OpenScriptProperties_')
    .addItem('2. 1回だけ実行（テスト）', 'f6RunOnce')
    .addItem('3. 10分トリガーを設置', 'f6InstallTrigger')
    .addItem('4. トリガーを削除', 'f6RemoveTrigger')
    .addItem('5. ログを表示', 'f6ShowLog')
    .addItem('6. シート初期化', 'f6InitSheetsMenu')
    .addItem('7. 接続テスト（全銘柄）', 'f6TestConnection')
    .addItem('8. 日次レポート生成', 'f6GenerateReport')
    .addItem('9. 日次トリガー設置', 'f6InstallReportTrigger')
    .addItem('10. 日次トリガー削除', 'f6RemoveReportTrigger')
    .addToUi();
}

function f6InitSheetsMenu() {
  f6InitSheets_();
  SpreadsheetApp.getUi().alert('F6_運用ログ / F6_売買履歴 を用意しました');
}

function f6OpenScriptProperties_() {
  var symbols = f6GetActiveSymbols_();
  SpreadsheetApp.getUi().alert(
    'F-FX-Short (1H+5m入/30m出)\n' +
    '監視銘柄数: ' + symbols.length + '\n' +
    'INSTRUMENTS=' + (PropertiesService.getScriptProperties().getProperty('INSTRUMENTS') || '(既定8ペア)') + '\n' +
    'BATCH_SIZE=' + (PropertiesService.getScriptProperties().getProperty('BATCH_SIZE') || F6_CONFIG.BATCH_SIZE_DEFAULT) + '\n' +
    'MAX_OPEN_POSITIONS=' + F6_CONFIG.MAX_OPEN_POSITIONS + '\n' +
    'SWING_STRENGTH_TREND=' + F6_CONFIG.SWING_STRENGTH_TREND + ' (1H)\n' +
    'SWING_STRENGTH_ENTRY=' + F6_CONFIG.SWING_STRENGTH_ENTRY + ' (5m)\n' +
    'SWING_STRENGTH_EXIT=' + F6_CONFIG.SWING_STRENGTH_EXIT + ' (30m)\n' +
    'PAPER_JPY=300000\n' +
    'LINE_CHANNEL_ACCESS_TOKEN=(任意)\n' +
    'LINE_USER_ID=(任意)',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function f6ShowLog() {
  var log = PropertiesService.getScriptProperties().getProperty('F6_LOG') || '(空)';
  SpreadsheetApp.getUi().alert(log.slice(0, 1500));
}

function f6InstallTrigger() {
  f6RemoveTrigger();
  ScriptApp.newTrigger('f6RunOnce').timeBased().everyMinutes(10).create();
  SpreadsheetApp.getUi().alert('10分ごとに f6RunOnce が動きます');
}

function f6RemoveTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'f6RunOnce') ScriptApp.deleteTrigger(t);
  });
}

/* ---------- メインループ（バッチ処理） ---------- */

function f6RunOnce() {
  var cfg = f6GetConfig_();
  var symbols = f6GetActiveSymbols_();
  var batchSize = cfg.batchSize;
  var batchIndex = f6GetBatchIndex_();
  var totalBatches = Math.ceil(symbols.length / batchSize);

  var start = batchIndex * batchSize;
  var batch = symbols.slice(start, start + batchSize);
  if (batch.length === 0) {
    batchIndex = 0;
    batch = symbols.slice(0, batchSize);
  }

  var processed = 0;
  var errors = 0;

  for (var i = 0; i < batch.length; i++) {
    try {
      f6ProcessSymbol_(batch[i], cfg);
      processed++;
    } catch (err) {
      errors++;
      f6SetContext_(batch[i]);
      f6Log_('ERROR: ' + (err.message || err));
      var errState = f6LoadState_(batch[i]);
      errState.lastError = String(err.message || err);
      f6SaveState_(batch[i], errState);
    }
  }

  var nextBatch = (batchIndex + 1) % totalBatches;
  f6SaveBatchIndex_(nextBatch);

  f6_ctx = { symbol: '', inst: null };
  Logger.log('F6 batch ' + (batchIndex + 1) + '/' + totalBatches +
    ' done: ' + processed + ' ok, ' + errors + ' err');
}

/* ---------- 1銘柄の処理 ---------- */

function f6ProcessSymbol_(symbol, cfg) {
  f6SetContext_(symbol);
  var state = f6LoadState_(symbol);

  var ticker = f6GetTicker_(symbol);
  var candlesTrend = f6GetCandlesTrend_(symbol);
  var candlesEntry = f6GetCandlesEntry_(symbol);
  var candlesExit = f6GetCandlesExit_(symbol);
  var assets = f6GetAssetsForRun_();

  var trendResult1h = f6JudgeTrend_(candlesTrend, cfg.swingStrengthTrend);
  var prevTrend = state.lastDailyTrend;
  state.lastDailyTrend = trendResult1h.trend;
  f6NotifyTrendChange_(f6_ctx.inst, prevTrend, trendResult1h.trend);

  var trendResult;
  var holding = state.mode === 'long' || state.mode === 'short';

  if (holding) {
    var price = ticker.last;
    var entry = state.entryPrice;
    var side = state.positionSide;
    var pct = side === 'long'
      ? ((price - entry) / entry) * 100
      : ((entry - price) / entry) * 100;

    var exitTrend = f6JudgeTrend_(candlesExit, cfg.swingStrengthExit);
    var trendOk = (side === 'long' && exitTrend.trend === 'up') ||
                  (side === 'short' && exitTrend.trend === 'down');
    var holdOnWeakRange = exitTrend.trend === 'range' && exitTrend.strength === 0;

    if (!trendOk && !holdOnWeakRange) {
      var isReversal = (side === 'long' && exitTrend.trend === 'down') ||
                       (side === 'short' && exitTrend.trend === 'up');
      var profitOrLoss = pct >= 0 ? '利食い' : '損切り';
      var reason = isReversal
        ? '30mトレンド反転(' + profitOrLoss + ')'
        : '30mトレンド崩壊(' + profitOrLoss + ')';
      f6ClosePosition_(price, cfg, state, reason, pct);
      trendResult = { signal: 'exit', note: reason + ' ' + exitTrend.trend + ' ' + pct.toFixed(2) + '% ' + exitTrend.note };
    } else {
      f6Log_('保有中(' + side + ') 含み' + pct.toFixed(2) + '% 30m=' + exitTrend.trend + '(強度' + exitTrend.strength + ')');
      trendResult = { signal: 'hold', note: side + ' ' + pct.toFixed(2) + '% 30m=' + exitTrend.trend };
    }
  } else {
    var entrySignal = f6GetEntrySignal_(candlesEntry, trendResult1h.trend, cfg.swingStrengthEntry);
    trendResult = f6RunTrend_(candlesEntry, ticker, assets, cfg, state, entrySignal, f6GetActiveSymbols_());
  }

  assets = f6GetAssetsForRun_();
  state.lastRunAt = new Date().toISOString();

  var trendChanged = prevTrend && prevTrend !== trendResult1h.trend;
  var hasSignal = trendResult.signal && trendResult.signal !== 'none' && trendResult.signal !== 'hold';
  if (hasSignal || trendChanged) {
    f6AppendRunLog_(ticker, assets, state, trendResult1h, trendResult);
  }

  f6SaveState_(symbol, state);
}

/* ---------- 接続テスト ---------- */

function f6TestConnection() {
  var symbols = f6GetActiveSymbols_();
  var results = [];
  var testList = symbols.slice(0, 5);
  for (var i = 0; i < testList.length; i++) {
    try {
      f6SetContext_(testList[i]);
      var ticker = f6GetTicker_(testList[i]);
      results.push(f6_ctx.inst.label + ' = ' + ticker.last);
    } catch (e) {
      results.push(testList[i] + ' NG: ' + e.message);
    }
  }
  SpreadsheetApp.getUi().alert(
    '接続テスト（先頭5銘柄）\n' +
    '監視銘柄数: ' + symbols.length + '\n\n' +
    results.join('\n')
  );
}

/* ---------- 日次レポート ---------- */

function f6GenerateReport() {
  f6Log_('日次レポート生成開始');
  try {
    f6RunReport_();
    SpreadsheetApp.getUi().alert('F6_日次レポート を更新しました。');
  } catch (e) {
    f6Log_('日次レポートERROR: ' + e.message);
    SpreadsheetApp.getUi().alert('レポート生成エラー: ' + e.message);
  }
}

function f6InstallReportTrigger() {
  f6RemoveReportTrigger();
  ScriptApp.newTrigger('f6GenerateReportAuto')
    .timeBased()
    .everyHours(24)
    .create();
  f6Log_('日次トリガー設置（24時間ごと）');
  SpreadsheetApp.getUi().alert('24時間ごとに日次レポートを自動生成します');
}

function f6RemoveReportTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'f6GenerateReportAuto') ScriptApp.deleteTrigger(t);
  });
}

function f6GenerateReportAuto() {
  f6Log_('日次レポート自動生成開始');
  try {
    f6RunReport_();
  } catch (e) {
    f6Log_('日次レポートERROR: ' + e.message);
  }
}
