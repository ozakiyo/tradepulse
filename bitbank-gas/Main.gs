/**
 * BITBANK × GAS
 * レンジ/中立→トラリピ、トレンド→スイング、急変→STOP
 * LINEは相場環境の変化時のみ。売買・損益はスプレッドシート。
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('BITBANK Bot')
    .addItem('1. スクリプトプロパティを開く', 'bbOpenScriptProperties_')
    .addItem('2. 1回だけ実行（テスト）', 'bbRunOnce')
    .addItem('3. 5分トリガーを設置', 'bbInstallTrigger')
    .addItem('4. トリガーを削除', 'bbRemoveTrigger')
    .addItem('5. ログを表示', 'bbShowLog')
    .addItem('6. シート初期化', 'bbInitSheets')
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
    '<li>TORARIPI_WIDTH_JPY（50000）</li></ul>';
  SpreadsheetApp.getUi().alert('スクリプトプロパティ', html, SpreadsheetApp.getUi().ButtonSet.OK);
}

function bbShowLog() {
  var log = PropertiesService.getScriptProperties().getProperty('BB_LOG') || '(空)';
  SpreadsheetApp.getUi().alert(log.slice(0, 1500));
}

function bbInstallTrigger() {
  bbRemoveTrigger();
  ScriptApp.newTrigger('bbRunOnce').timeBased().everyMinutes(5).create();
  bbLog_('5分トリガーを設置しました');
  SpreadsheetApp.getUi().alert('5分ごとに bbRunOnce が動きます');
}

function bbRemoveTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'bbRunOnce') ScriptApp.deleteTrigger(t);
  });
}

function bbRunOnce() {
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
        ' / last=' +
        ticker.last +
        ' / ' +
        regime.detail
    );

    if (regime.action === 'stop') {
      bbCancelAllOrders_(cfg);
      state.mode = 'stopped';
      state.trailHigh = null;
      state.swingEntry = null;
      bbSaveState_(state);
      return;
    }

    if (regime.action === 'swing') {
      bbRunSwing_(candles1h, ticker, assets, cfg, state);
      bbSaveState_(state);
      return;
    }

    if (regime.action === 'toraripi_full' || regime.action === 'toraripi_half') {
      bbRunToraripi_(ticker, assets, cfg, state, regime.action);
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

function bbSetupDefaultProperties() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('DRY_RUN')) p.setProperty('DRY_RUN', 'true');
  if (!p.getProperty('TORARIPI_WIDTH_JPY')) p.setProperty('TORARIPI_WIDTH_JPY', '50000');
  if (!p.getProperty('BTC_PER_LEVEL')) p.setProperty('BTC_PER_LEVEL', '0.0001');
  if (!p.getProperty('SWING_BTC')) p.setProperty('SWING_BTC', '0.0001');
  if (!p.getProperty('GRID_LEVELS')) p.setProperty('GRID_LEVELS', '8');
  bbLog_('既定プロパティを設定しました（DRY_RUN=true, ロット0.0001 BTC）');
}
