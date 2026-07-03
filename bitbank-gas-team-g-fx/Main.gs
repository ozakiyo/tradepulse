/**
 * チームG-FX: FXレンジ（ロング・ショート・10通貨）
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('チームG-FX Bot')
    .addItem('1. スクリプトプロパティを開く', 'gfxOpenScriptProperties_')
    .addItem('2. 1回だけ実行（テスト）', 'gfxRunOnce')
    .addItem('3. 5分トリガーを設置', 'gfxInstallTrigger')
    .addItem('4. トリガーを削除', 'gfxRemoveTrigger')
    .addItem('5. ログを表示', 'gfxShowLog')
    .addItem('6. シート初期化', 'gfxInitSheetsMenu')
    .addItem('7. 接続テスト', 'gfxTestConnection')
    .addItem('8. 既定プロパティ設定', 'gfxSetupDefaultProperties')
    .addItem('9. 日次レポート生成', 'gfxGenerateReport')
    .addItem('10. 日次レポートトリガー設置', 'gfxInstallReportTrigger')
    .addItem('11. 日次レポートトリガー削除', 'gfxRemoveReportTrigger')
    .addItem('12. META接続テスト', 'gfxTestMetaSpreadsheet')
    .addToUi();
}

function gfxInitSheetsMenu() {
  gfxInitSheets_();
  gfxLog_('シート初期化完了');
  SpreadsheetApp.getUi().alert('GFX_運用ログ / GFX_売買履歴 を用意しました');
}

function gfxOpenScriptProperties_() {
  SpreadsheetApp.getUi().alert(
    'スクリプトプロパティ',
    'PAPER_JPY=500000\n' +
      'GFX_PAIRS=eur_usd,usd_jpy,...（省略時は10通貨）\n' +
      'GFX_MAX_MARGIN_JPY_PER_PAIR=50000\n' +
      'GFX_MAX_OPEN_POSITIONS=7\n' +
      'GFX_TOUCH_PCT=0.1\n' +
      'GFX_DAILY_RANGE_MAX_PCT=10\n' +
      'GFX_H1_RANGE_MAX_PCT=3.5\n' +
      'META_SPREADSHEET_ID=（メタ層SS）\n' +
      'VALIDATION_PAUSED=true（既定・停止中。実践FXは G-FFX）\n\n' +
      '※紙トレード専用（本番APIなし）',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function gfxShowLog() {
  var log = PropertiesService.getScriptProperties().getProperty('GFX_LOG') || '(空)';
  SpreadsheetApp.getUi().alert(log.slice(0, 1500));
}

function gfxInstallTrigger() {
  if (gfxIsValidationPaused_()) {
    SpreadsheetApp.getUi().alert('検証停止中のためトリガーは設置しません。\n実践FXは G-FFX を使用');
    return;
  }
  gfxRemoveTrigger();
  ScriptApp.newTrigger('gfxRunOnce').timeBased().everyMinutes(5).create();
  gfxLog_('5分トリガーを設置');
  SpreadsheetApp.getUi().alert('5分ごとに gfxRunOnce が動きます');
}

function gfxRemoveTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'gfxRunOnce') ScriptApp.deleteTrigger(t);
  });
}

function gfxRunOnce() {
  if (gfxIsValidationPaused_()) {
    gfxLog_('検証停止中（VALIDATION_PAUSED）— スキップ');
    return;
  }
  var cfg = gfxGetConfig_();
  var state = gfxLoadState_();
  gfxInitPaperWallet_(state, cfg);
  var pairs = gfxGetActivePairs_();
  var errors = [];

  try {
    gfxLog_('実行開始 pairs=' + pairs.length);

    pairs.forEach(function (pairId) {
      try {
        Utilities.sleep(300);
        var result = gfxRunRangeForPair_(pairId, cfg, state);
        var ps = gfxGetPairState_(state, pairId);
        if (gfxShouldAppendRunLog_(ps, result)) {
          gfxAppendRunLog_(pairId, result, result.assets, ps.lastSignal);
          gfxUpdateLogSnapshot_(ps, result);
        }
      } catch (e) {
        errors.push(pairId + ': ' + (e.message || e));
        gfxLog_('ERROR ' + pairId + ': ' + (e.message || e));
      }
    });

    state.lastRunAt = new Date().toISOString();
    state.lastError = errors.length ? errors.join('; ') : null;
    gfxSaveState_(state);

    var w = state.paperWallet;
    if (w) {
      var reserved = Math.round(w.reserved || 0);
      var equity = Math.round(gfxPaperEquity_(state));
      gfxLog_(
        '紙トレ 現金JPY=' +
          Math.round(w.jpy) +
          ' 拘束=' +
          reserved +
          ' 評価額=' +
          equity +
          ' 損益=' +
          Math.round(equity - w.initial)
      );
    }
    gfxLog_('G-FX 完了' + (errors.length ? ' 一部エラー' : ''));
  } catch (err) {
    state.lastError = String(err.message || err);
    gfxSaveState_(state);
    gfxLog_('ERROR: ' + state.lastError);
    throw err;
  }
}

function gfxSetupDefaultProperties() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('PAPER_JPY')) p.setProperty('PAPER_JPY', '500000');
  if (!p.getProperty('GFX_MAX_MARGIN_JPY_PER_PAIR')) p.setProperty('GFX_MAX_MARGIN_JPY_PER_PAIR', '50000');
  var maxOpen = p.getProperty('GFX_MAX_OPEN_POSITIONS');
  if (!maxOpen || maxOpen === '4') p.setProperty('GFX_MAX_OPEN_POSITIONS', '7');
  gfxLog_('チームG-FX 既定プロパティを設定');
  SpreadsheetApp.getUi().alert('PAPER_JPY=500000 を設定しました');
}

function gfxTestConnection() {
  var ticker = gfxGetTicker_('eur_usd');
  gfxLog_('接続OK EUR/USD=' + ticker.last);
  SpreadsheetApp.getUi().alert('Yahoo OK\nEUR/USD = ' + ticker.last);
}
