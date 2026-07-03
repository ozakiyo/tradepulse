/**
 * チームG: bitbank レンジ（買いのみ・10銘柄）
 * 5分トリガー推奨
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('チームG Bot')
    .addItem('1. スクリプトプロパティを開く', 'gOpenScriptProperties_')
    .addItem('2. 1回だけ実行（テスト）', 'gRunOnce')
    .addItem('3. 5分トリガーを設置', 'gInstallTrigger')
    .addItem('4. トリガーを削除', 'gRemoveTrigger')
    .addItem('5. ログを表示', 'gShowLog')
    .addItem('6. シート初期化', 'gInitSheetsMenu')
    .addItem('7. 接続テスト', 'gTestConnection')
    .addItem('8. 既定プロパティ設定', 'gSetupDefaultProperties')
    .addItem('9. 日次レポート生成', 'gGenerateReport')
    .addItem('10. 日次レポートトリガー設置', 'gInstallReportTrigger')
    .addItem('11. 日次レポートトリガー削除', 'gRemoveReportTrigger')
    .addItem('12. META接続テスト', 'gTestMetaSpreadsheet')
    .addToUi();
}

function gInitSheetsMenu() {
  gInitSheets_();
  gLog_('シート初期化完了');
  SpreadsheetApp.getUi().alert('G_運用ログ / G_売買履歴 を用意しました');
}

function gOpenScriptProperties_() {
  SpreadsheetApp.getUi().alert(
    'スクリプトプロパティ',
    'BITBANK_API_KEY / BITBANK_API_SECRET\n' +
      'DRY_RUN=true（デモ）\n' +
      'PAPER_JPY=500000\n' +
      'G_PAIRS=btc_jpy,eth_jpy,...（省略時は10銘柄すべて）\n' +
      'G_MAX_JPY_PER_PAIR=50000\n' +
      'G_MAX_OPEN_POSITIONS=7\n' +
      'G_TOUCH_PCT=0.12\n' +
      'G_TP_RATIO=0.55\n' +
      'G_PARTIAL_STOP_RATIO=0.5\n' +
      'G_DAILY_RANGE_MAX_PCT=12\n' +
      'G_H1_RANGE_MAX_PCT=4\n' +
      'META_SPREADSHEET_ID=（メタ層SSのID）\n' +
      'VALIDATION_PAUSED=true（既定・検証停止。再開時 false）',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function gShowLog() {
  var log = PropertiesService.getScriptProperties().getProperty('G_LOG') || '(空)';
  SpreadsheetApp.getUi().alert(log.slice(0, 1500));
}

function gInstallTrigger() {
  if (gIsValidationPaused_()) {
    SpreadsheetApp.getUi().alert('検証停止中のためトリガーは設置しません。\n再開: VALIDATION_PAUSED=false');
    return;
  }
  gRemoveTrigger();
  ScriptApp.newTrigger('gRunOnce').timeBased().everyMinutes(5).create();
  gLog_('5分トリガーを設置しました');
  SpreadsheetApp.getUi().alert('5分ごとに gRunOnce が動きます（全銘柄を順に処理）');
}

function gRemoveTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'gRunOnce') ScriptApp.deleteTrigger(t);
  });
}

function gRunOnce() {
  if (gIsValidationPaused_()) {
    gLog_('検証停止中（VALIDATION_PAUSED）— スキップ');
    return;
  }
  var cfg = gGetConfig_();
  var state = gLoadState_();
  gInitPaperWallet_(state, cfg);
  var pairs = gGetActivePairs_();
  var anyActivity = false;
  var errors = [];

  try {
    gLog_('実行開始 pairs=' + pairs.length + ' DRY_RUN=' + cfg.dryRun);

    var loggedAny = false;
    pairs.forEach(function (pair) {
      try {
        var result = gRunRangeForPair_(pair, cfg, state);
        if (result.active) anyActivity = true;
        var ps = gGetPairState_(state, pair);
        if (gShouldAppendRunLog_(ps, result)) {
          gAppendRunLog_(pair, result, result.assets, ps.lastSignal);
          gUpdateLogSnapshot_(ps, result);
          loggedAny = true;
        }
      } catch (e) {
        errors.push(pair + ': ' + (e.message || e));
        gLog_('ERROR ' + pair + ': ' + (e.message || e));
      }
    });

    state.lastRunAt = new Date().toISOString();
    state.lastError = errors.length ? errors.join('; ') : null;
    gSaveState_(state);

    var w = state.paperWallet;
    if (cfg.dryRun && w) {
      gLog_(
        '紙トレ JPY=' +
          Math.round(w.jpy) +
          ' 初期=' +
          w.initial +
          ' 損益=' +
          Math.round(w.jpy - w.initial)
      );
    }
    gLog_('G 完了' + (errors.length ? ' 一部エラー' : ''));
  } catch (err) {
    state.lastError = String(err.message || err);
    gSaveState_(state);
    gLog_('ERROR: ' + state.lastError);
    throw err;
  }
}

function gSetupDefaultProperties() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('DRY_RUN')) p.setProperty('DRY_RUN', 'true');
  if (!p.getProperty('PAPER_JPY')) p.setProperty('PAPER_JPY', '500000');
  if (!p.getProperty('G_MAX_JPY_PER_PAIR')) p.setProperty('G_MAX_JPY_PER_PAIR', '50000');
  var maxOpen = p.getProperty('G_MAX_OPEN_POSITIONS');
  if (!maxOpen || maxOpen === '4') p.setProperty('G_MAX_OPEN_POSITIONS', '7');
  if (!p.getProperty('G_TP_RATIO')) p.setProperty('G_TP_RATIO', '0.55');
  if (!p.getProperty('G_PARTIAL_STOP_RATIO')) p.setProperty('G_PARTIAL_STOP_RATIO', '0.5');
  gLog_('チームG 既定プロパティを設定（DRY_RUN=true）');
  SpreadsheetApp.getUi().alert('DRY_RUN=true / PAPER_JPY=500000 を設定しました');
}

function gTestConnection() {
  var ticker = gGetTicker_('btc_jpy');
  gLog_('接続OK btc_jpy last=' + ticker.last);
  SpreadsheetApp.getUi().alert(
    'bitbank 接続OK\nBTC/JPY = ' + ticker.last.toLocaleString() + ' 円\nDRY_RUN=' + gGetConfig_().dryRun
  );
}
