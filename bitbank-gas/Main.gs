/**
 * BITBANK × GAS
 * レンジ/中立→トラリピ、トレンド→スイング、急落→STOP、急騰→トレンド/スイング
 * LINEは相場環境の変化時のみ。売買・損益はスプレッドシート。
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('BITBANK Bot')
    .addItem('1. スクリプトプロパティを開く', 'bbOpenScriptProperties_')
    .addItem('2. 1回だけ実行（テスト）', 'bbRunOnce')
    .addItem('3. 10分トリガーを設置', 'bbInstallTrigger')
    .addItem('4. トリガーを削除', 'bbRemoveTrigger')
    .addItem('5. ログを表示', 'bbShowLog')
    .addItem('6. シート初期化', 'bbInitSheets')
    .addItem('7. 週次レポート生成', 'bbGenerateReport')
    .addItem('8. 日次レポートトリガー設置', 'bbInstallReportTrigger')
    .addItem('9. 日次レポートトリガー削除', 'bbRemoveReportTrigger')
    .addToUi();
}

function bbInitSheets() {
  bbInitAllSheets_();
  SpreadsheetApp.getUi().alert(
    '以下のシートを用意しました:\n' +
      '・運用ログ（自動）\n' +
      '・売買履歴（自動＋手動補完）\n' +
      '・日次集計（毎日1行）\n' +
      '・2週間試験（チェックリスト）\n\n' +
      '列定義: bitbank-gas/docs/日次集計シート.md\n' +
      '試験手順: bitbank-gas/docs/2週間試験チェックリスト.md'
  );
}

function bbOpenScriptProperties_() {
  var html =
    '<p>拡張機能 → Apps Script → プロジェクトの設定 → スクリプト プロパティ</p>' +
    '<ul><li>BITBANK_API_KEY / BITBANK_API_SECRET</li>' +
    '<li>LINE_CHANNEL_ACCESS_TOKEN / LINE_USER_ID（環境変化時のみ通知）</li>' +
    '<li>DRY_RUN（true=注文しない / false=本番）</li>' +
    '<li>BTC_PER_LEVEL（試験 0.0001）</li>' +
    '<li>TORARIPI_WIDTH_JPY（50000）</li>' +
    '<li>TRAIL_ACTIVATE_STEP_MULT（1 = 買値+1段でトレール開始）</li>' +
    '<li>TRAIL_CALLBACK_PCT（0.25）</li>' +
    '<li>SWING_RSI_MIN / SWING_RSI_MAX（35 / 72）</li>' +
    '<li>SWING_ALLOW_TREND_CONTINUATION（true）</li>' +
    '<li>VALIDATION_PAUSED=true（運用停止）</li></ul>';
  SpreadsheetApp.getUi().alert('スクリプトプロパティ', html, SpreadsheetApp.getUi().ButtonSet.OK);
}

function bbShowLog() {
  var log = PropertiesService.getScriptProperties().getProperty('BB_LOG') || '(空)';
  SpreadsheetApp.getUi().alert(log.slice(0, 1500));
}

function bbInstallTrigger() {
  if (bbIsValidationPaused_()) {
    SpreadsheetApp.getUi().alert('運用停止中のためトリガーは設置しません。\n再開: VALIDATION_PAUSED=false');
    return;
  }
  bbRemoveTrigger();
  ScriptApp.newTrigger('bbRunOnce').timeBased().everyMinutes(10).create();
  bbLog_('10分トリガーを設置しました');
  SpreadsheetApp.getUi().alert('10分ごとに bbRunOnce が動きます');
}

function bbRemoveTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'bbRunOnce') ScriptApp.deleteTrigger(t);
  });
}

function bbRunOnce() {
  if (bbIsValidationPaused_()) {
    bbLog_('運用停止中（VALIDATION_PAUSED）— スキップ');
    return;
  }
  var cfg = bbGetConfig_();
  var state = bbLoadState_();
  var prevLineRegime = state.lastLineRegime || null;
  var prevLineTrendBias = state.lastLineTrendBias || null;
  try {
    var ticker = bbGetTicker_();
    var candles1h = bbGetCandles1h_();
    var assets = bbGetAssets_();
    var regime = bbDetectRegime_(candles1h, ticker, cfg);

    state.regime = regime.regime;
    state.lastRunAt = new Date().toISOString();
    state.lastAction = regime.action;

    bbAppendRunLog_(regime, ticker, assets, state);

    var lineResult = bbMaybeNotifyRegimeLine_(regime, ticker, prevLineRegime, prevLineTrendBias);
    if (lineResult.sent) {
      bbSaveLineRegimeSnapshot_(state, regime);
      bbLog_(
        'LINE送信: ' +
          prevLineRegime +
          ' → ' +
          regime.regime +
          (regime.trendBias ? ' (' + regime.trendBias + ')' : '')
      );
    }

    bbLog_(
      '環境=' +
        regime.regime +
        ' / 操作=' +
        bbActionLabelJa_(regime.action) +
        ' / 1H=' +
        candles1h.length +
        '本 / last=' +
        ticker.last +
        ' / ' +
        regime.detail
    );

    if (regime.action === 'stop') {
      bbCancelAllOrders_(cfg);
      state.mode = 'stopped';
      state.trailHigh = null;
      state.swingEntry = null;
      state.swingTrailHigh = null;
      state.lastToraripiMode = null;
      state.lastToraripiRangeSpan = null;
      state.lastToraripiLevels = null;
      state.lastToraripiTrapStep = null;
      state.lastToraripiAtrPct = null;
      state.gridLots = [];
      bbSaveState_(state);
      return;
    }

    if (regime.action === 'swing') {
      bbRunSwing_(candles1h, ticker, assets, cfg, state);
      bbSaveState_(state);
      return;
    }

    if (regime.action === 'toraripi_full' || regime.action === 'toraripi_half') {
      bbRunToraripi_(candles1h, ticker, assets, cfg, state, regime.action);
      bbSaveState_(state);
      return;
    }

    bbLog_('様子見: 新規操作なし');
    bbSaveState_(state);
  } catch (err) {
    state.lastError = String(err.message || err);
    bbSaveState_(state);
    bbLog_('ERROR: ' + state.lastError);
    throw err;
  }
}

/* ---------- 週次レポート ---------- */

function bbGenerateReport() {
  bbLog_('週次レポート生成開始');
  try {
    bbRunReport_();
    SpreadsheetApp.getUi().alert('週次レポート を更新しました。');
  } catch (e) {
    bbLog_('週次レポートERROR: ' + e.message);
    SpreadsheetApp.getUi().alert('レポート生成エラー: ' + e.message);
  }
}

function bbInstallReportTrigger() {
  if (bbIsValidationPaused_()) {
    SpreadsheetApp.getUi().alert('運用停止中のためレポートトリガーは設置しません。\n再開: VALIDATION_PAUSED=false');
    return;
  }
  bbRemoveReportTrigger();
  ScriptApp.newTrigger('bbGenerateReportAuto')
    .timeBased()
    .atHour(6)
    .everyDays(1)
    .create();
  bbLog_('日次トリガー設置（毎日6時）');
  SpreadsheetApp.getUi().alert('毎日 6:00 にレポートを自動生成し、METAに送信します');
}

function bbRemoveReportTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'bbGenerateReportAuto') ScriptApp.deleteTrigger(t);
  });
}

function bbGenerateReportAuto() {
  if (bbIsValidationPaused_()) {
    bbLog_('運用停止中（VALIDATION_PAUSED）— レポートスキップ');
    return;
  }
  bbLog_('週次レポート自動生成開始');
  try {
    bbRunReport_();
  } catch (e) {
    bbLog_('週次レポートERROR: ' + e.message);
  }
}

function bbSetupDefaultProperties() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('DRY_RUN')) p.setProperty('DRY_RUN', 'true');
  if (!p.getProperty('TORARIPI_WIDTH_JPY')) p.setProperty('TORARIPI_WIDTH_JPY', '50000');
  if (!p.getProperty('BTC_PER_LEVEL')) p.setProperty('BTC_PER_LEVEL', '0.0001');
  if (!p.getProperty('SWING_BTC')) p.setProperty('SWING_BTC', '0.0001');
  if (!p.getProperty('GRID_LEVELS')) p.setProperty('GRID_LEVELS', '30');
  bbLog_('既定プロパティを設定しました（DRY_RUN=true, ロット0.0001 BTC）');
}
