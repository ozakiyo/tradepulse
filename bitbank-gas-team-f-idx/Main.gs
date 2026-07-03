/**
 * チームF: マルチTF トレンドフォロー — マルチ銘柄（紙トレード専用）
 * 10分トリガーでバッチ処理。1回の実行で BATCH_SIZE 銘柄を処理する。
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('チームF-Index Bot')
    .addItem('1. スクリプトプロパティを開く', 'f6OpenScriptProperties_')
    .addItem('2. 1回だけ実行（テスト）', 'f6RunOnce')
    .addItem('3. 10分トリガーを設置', 'f6InstallTrigger')
    .addItem('4. トリガーを削除', 'f6RemoveTrigger')
    .addItem('5. ログを表示', 'f6ShowLog')
    .addItem('6. シート初期化', 'f6InitSheetsMenu')
    .addItem('7. 接続テスト（全銘柄）', 'f6TestConnection')
    .addItem('8. 週次レポート生成', 'f6GenerateReport')
    .addItem('9. 日次レポートトリガー設置', 'f6InstallReportTrigger')
    .addItem('10. 日次レポートトリガー削除', 'f6RemoveReportTrigger')
    .addToUi();
}

function f6InitSheetsMenu() {
  f6InitSheets_();
  SpreadsheetApp.getUi().alert('F6_運用ログ / F6_売買履歴 を用意しました');
}

function f6OpenScriptProperties_() {
  var symbols = f6GetActiveSymbols_();
  SpreadsheetApp.getUi().alert(
    '監視銘柄数: ' + symbols.length + '\n' +
    'INSTRUMENTS=' + (PropertiesService.getScriptProperties().getProperty('INSTRUMENTS') || '(全銘柄)') + '\n' +
    'BATCH_SIZE=' + (PropertiesService.getScriptProperties().getProperty('BATCH_SIZE') || F6_CONFIG.BATCH_SIZE_DEFAULT) + '\n' +
    'SWING_STRENGTH=2\n' +
    'PAPER_JPY=300000\n' +
    'LINE_NOTIFY_TOKEN=(任意)',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function f6ShowLog() {
  var log = PropertiesService.getScriptProperties().getProperty('F6_LOG') || '(空)';
  SpreadsheetApp.getUi().alert(log.slice(0, 1500));
}

function f6InstallTrigger() {
  if (f6IsValidationPaused_()) {
    SpreadsheetApp.getUi().alert('検証停止中のためトリガーは設置しません。\n再開: VALIDATION_PAUSED=false');
    return;
  }
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
  if (f6IsValidationPaused_()) {
    f6Log_('検証停止中（VALIDATION_PAUSED）— スキップ');
    return;
  }
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
  var candles1h = f6GetCandles1h_(symbol);
  var candlesDaily = f6GetCandlesDaily_(symbol);
  var assets = f6GetAssetsForRun_();

  var dailyResult = f6JudgeTrend_(candlesDaily, cfg.swingStrengthDaily);
  var prevTrend = state.lastDailyTrend;
  state.lastDailyTrend = dailyResult.trend;
  f6NotifyTrendChange_(f6_ctx.inst, prevTrend, dailyResult.trend);

  var trendResult;
  var holding = state.mode === 'long' || state.mode === 'short';

  if (holding) {
    var price = ticker.last;
    var entry = state.entryPrice;
    var side = state.positionSide;
    var pct = side === 'long'
      ? ((price - entry) / entry) * 100
      : ((entry - price) / entry) * 100;

    var hourlyTrend = f6JudgeTrend_(candles1h, cfg.swingStrength1h);
    var trendOk = (side === 'long' && hourlyTrend.trend === 'up') ||
                  (side === 'short' && hourlyTrend.trend === 'down');

    if (!trendOk) {
      var isReversal = (side === 'long' && hourlyTrend.trend === 'down') ||
                       (side === 'short' && hourlyTrend.trend === 'up');
      var profitOrLoss = pct >= 0 ? '利食い' : '損切り';
      var reason = isReversal
        ? '1Hトレンド反転(' + profitOrLoss + ')'
        : '1Hトレンド崩壊(' + profitOrLoss + ')';
      f6ClosePosition_(price, cfg, state, reason, pct);
      trendResult = { signal: 'exit', note: reason + ' ' + hourlyTrend.trend + ' ' + pct.toFixed(2) + '% ' + hourlyTrend.note };
    } else {
      f6Log_('保有中(' + side + ') 含み' + pct.toFixed(2) + '% 1H=' + hourlyTrend.trend + '(強度' + hourlyTrend.strength + ')');
      trendResult = { signal: 'hold', note: side + ' ' + pct.toFixed(2) + '% 1H=' + hourlyTrend.trend };
    }
  } else {
    var entrySignal = f6GetEntrySignal_(candles1h, dailyResult.trend, cfg.swingStrength1h);
    trendResult = f6RunTrend_(candles1h, ticker, assets, cfg, state, entrySignal);
  }

  assets = f6GetAssetsForRun_();
  state.lastRunAt = new Date().toISOString();

  var trendChanged = prevTrend && prevTrend !== dailyResult.trend;
  var hasSignal = trendResult.signal && trendResult.signal !== 'none' && trendResult.signal !== 'hold';
  if (hasSignal || trendChanged) {
    f6AppendRunLog_(ticker, assets, state, dailyResult, trendResult);
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

/* ---------- 週次レポート ---------- */

function f6GenerateReport() {
  f6Log_('週次レポート生成開始');
  try {
    f6RunReport_();
    SpreadsheetApp.getUi().alert('F6_週次レポート を更新しました。');
  } catch (e) {
    f6Log_('週次レポートERROR: ' + e.message);
    SpreadsheetApp.getUi().alert('レポート生成エラー: ' + e.message);
  }
}

function f6InstallReportTrigger() {
  f6RemoveReportTrigger();
  ScriptApp.newTrigger('f6GenerateReportAuto')
    .timeBased()
    .atHour(6)
    .everyDays(1)
    .create();
  f6Log_('日次トリガー設置（毎日6時）');
  SpreadsheetApp.getUi().alert('毎日 6:00 にレポートを自動生成し、METAに送信します');
}

function f6RemoveReportTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'f6GenerateReportAuto') ScriptApp.deleteTrigger(t);
  });
}

function f6GenerateReportAuto() {
  if (f6IsValidationPaused_()) return;
  f6Log_('日次レポート自動生成開始');
  try {
    f6RunReport_();
  } catch (e) {
    f6Log_('週次レポートERROR: ' + e.message);
  }
}
