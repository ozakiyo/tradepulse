/**
 * チームG-FFX: 4Hブレイクアウト（パーフェクトオーダー）— GMO外国為替FX
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('チームG-FFX Bot')
    .addItem('1. スクリプトプロパティを開く', 'gffxOpenScriptProperties_')
    .addItem('2. 1回だけ実行（テスト）', 'gffxRunOnce')
    .addItem('3. 15分トリガーを設置（推奨）', 'gffxInstallTrigger')
    .addItem('3b. 5分トリガーを設置', 'gffxInstallTrigger5')
    .addItem('4. トリガーを削除', 'gffxRemoveTrigger')
    .addItem('5. ログを表示', 'gffxShowLog')
    .addItem('6. シート初期化', 'gffxInitSheetsMenu')
    .addItem('7. 接続テスト', 'gffxTestConnection')
    .addItem('8. 既定プロパティ設定', 'gffxSetupDefaultProperties')
    .addItem('9. 日次レポート生成', 'gffxGenerateReport')
    .addItem('10. 日次レポートトリガー設置', 'gffxInstallReportTrigger')
    .addItem('11. 日次レポートトリガー削除', 'gffxRemoveReportTrigger')
    .addItem('12. META接続テスト', 'gffxTestMetaSpreadsheet')
    .addSeparator()
    .addItem('13. 本番モードに切替（DRY_RUN=false）', 'gffxSetupProductionMenu')
    .addItem('14. 最低資金テスト設定', 'gffxSetupMinFundTestMenu')
    .addItem('15. 通常設定に戻す', 'gffxSetupStandardMenu')
    .addToUi();
}

function gffxInitSheetsMenu() {
  gffxInitSheets_();
  gffxLog_('シート初期化完了');
  SpreadsheetApp.getUi().alert('GFFX_運用ログ / GFFX_売買履歴 を用意しました');
}

function gffxOpenScriptProperties_() {
  SpreadsheetApp.getUi().alert(
    'スクリプトプロパティ',
    'GMO_API_KEY / GMO_API_SECRET（外国為替FX用・本番時必須）\n' +
      'DRY_RUN=true（デモ推奨。本番は false）\n' +
      'PAPER_JPY=500000\n' +
      'GFFX_PAIRS=eur_usd,usd_jpy,...（省略時は10通貨）\n' +
      'GFFX_USD_JPY_REF=150（非円建て損益換算）\n' +
      'GFFX_MAX_MARGIN_JPY_PER_PAIR=50000\n' +
      'GFFX_MAX_OPEN_POSITIONS=7\n' +
      'GFFX_LEVERAGE=4\n' +
      'GFFX_EMA_FAST=10 / GFFX_EMA_MID=20 / GFFX_EMA_SLOW=50\n' +
      'GFFX_CONSOLIDATION_BARS=10 / GFFX_PARTIAL_TP_BARS=5\n' +
      'META_SPREADSHEET_ID=（メタ層SS）',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function gffxShowLog() {
  var log = PropertiesService.getScriptProperties().getProperty('GFFX_LOG') || '(空)';
  SpreadsheetApp.getUi().alert(log.slice(0, 1500));
}

function gffxInstallTrigger() {
  gffxRemoveTrigger();
  ScriptApp.newTrigger('gffxRunOnce').timeBased().everyMinutes(15).create();
  gffxLog_('15分トリガーを設置');
  SpreadsheetApp.getUi().alert(
    '15分ごとに gffxRunOnce が動きます。\n' +
      '4Hブレイクアウト向け。UrlFetch 日次上限を抑えます。'
  );
}

function gffxInstallTrigger5() {
  gffxRemoveTrigger();
  ScriptApp.newTrigger('gffxRunOnce').timeBased().everyMinutes(5).create();
  gffxLog_('5分トリガーを設置');
  SpreadsheetApp.getUi().alert(
    '5分ごとに gffxRunOnce が動きます。\n' +
      '※GAS UrlFetch 上限に達しやすいです。他チームと併用時は15分推奨。'
  );
}

function gffxRemoveTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'gffxRunOnce') ScriptApp.deleteTrigger(t);
  });
}

function gffxRunOnce() {
  var cfg = gffxGetConfig_();
  var state = gffxLoadState_();
  if (cfg.dryRun) gffxInitPaperWallet_(state, cfg);
  var pairs = gffxGetActivePairs_();
  var errors = [];

  try {
    gmoResetMarginRunCache_();
    gmoGetAllTickersCached_();
    gffxLog_('実行開始 pairs=' + pairs.length + ' DRY_RUN=' + cfg.dryRun);

    pairs.forEach(function (pairId) {
      try {
        Utilities.sleep(300);
        var result = gffxRunBreakoutForPair_(pairId, cfg, state);
        var ps = gffxGetPairState_(state, pairId);
        if (gffxShouldAppendRunLog_(ps, result)) {
          gffxAppendRunLog_(pairId, result, result.assets, ps.lastSignal);
          gffxUpdateLogSnapshot_(ps, result);
        }
      } catch (e) {
        errors.push(pairId + ': ' + (e.message || e));
        gffxLog_('ERROR ' + pairId + ': ' + (e.message || e));
      }
    });

    state.lastRunAt = new Date().toISOString();
    state.lastError = errors.length ? errors.join('; ') : null;
    gffxSaveState_(state);

    var equity = Math.round(gffxAccountEquity_(cfg, state));
    if (cfg.dryRun) {
      var w = state.paperWallet;
      gffxLog_(
        '紙トレ 現金JPY=' +
          Math.round(w.jpy) +
          ' 拘束=' +
          Math.round(w.reserved || 0) +
          ' 評価額=' +
          equity +
          ' 損益=' +
          Math.round(equity - w.initial)
      );
    } else {
      gffxLog_('本番 評価額=' + equity + ' 基準=' + Math.round(state.liveBaseline || 0));
    }
    gffxLog_('G-FFX 完了' + (errors.length ? ' 一部エラー' : ''));
  } catch (err) {
    state.lastError = String(err.message || err);
    gffxSaveState_(state);
    gffxLog_('ERROR: ' + state.lastError);
    throw err;
  }
}

function gffxSetupDefaultProperties() {
  var p = PropertiesService.getScriptProperties();
  p.setProperty('GMO_PUBLIC_API', GMO_API_CONFIG.PUBLIC_API);
  p.setProperty('GMO_PRIVATE_API', GMO_API_CONFIG.PRIVATE_API);
  p.setProperty('GMO_KLINE_PRICE_TYPE', 'ASK');
  if (!p.getProperty('DRY_RUN')) p.setProperty('DRY_RUN', 'true');
  if (!p.getProperty('PAPER_JPY')) p.setProperty('PAPER_JPY', '500000');
  if (!p.getProperty('GFFX_MAX_MARGIN_JPY_PER_PAIR')) p.setProperty('GFFX_MAX_MARGIN_JPY_PER_PAIR', '50000');
  if (!p.getProperty('GFFX_LEVERAGE')) p.setProperty('GFFX_LEVERAGE', '4');
  var maxOpen = p.getProperty('GFFX_MAX_OPEN_POSITIONS');
  if (!maxOpen || maxOpen === '4') p.setProperty('GFFX_MAX_OPEN_POSITIONS', '7');
  gffxLog_('チームG-FFX 既定プロパティを設定（FX API・DRY_RUN=true）');
  SpreadsheetApp.getUi().alert(
    '外国為替FX API エンドポイントと DRY_RUN=true を設定しました。\n' +
      GMO_API_CONFIG.PUBLIC_API
  );
}

function gffxTestConnection() {
  var cfg = gffxGetConfig_();
  var result = gmoTestConnection_();
  var msg =
    'GMO Public OK（外国為替FX）\n' +
    result.endpoints.public +
    '\n' +
    result.symbol +
    ' = ' +
    result.last.toLocaleString() +
    ' 1H=' +
    result.candles1h +
    '本\nDRY_RUN=' +
    cfg.dryRun;
  if (result.margin && !result.margin.error) {
    msg +=
      '\n\nPrivate OK\n時価評価=' +
      Number(result.margin.equity || 0).toLocaleString() +
      ' 円\n取引余力=' +
      Number(result.margin.availableAmount).toLocaleString() +
      ' 円\n拘束=' +
      Number(result.margin.margin).toLocaleString() +
      ' 円';
  } else if (!cfg.dryRun) {
    msg +=
      '\n\nPrivate NG: ' +
      (result.margin.error || 'APIキー未設定') +
      '\n※会員ページで「外国為替FX」用キーを発行し、G-CFXの暗号資産用キーと混同しないこと';
  } else {
    msg += '\n\nPrivate: スキップ（DRY_RUN・キー未設定可）';
  }
  gffxLog_('接続テスト ' + result.symbol + '=' + result.last);
  SpreadsheetApp.getUi().alert(msg);
}

function gffxSetupMinFundTestMenu() {
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert(
    '最低資金テスト（G-FFX）',
    '以下を設定します:\n' +
      '・MIN_FUND_MODE=true（本番同様・2万通貨・部分利確あり）\n' +
      '・GFFX_LEVERAGE=25（GMO 4%証拠金に合わせる）\n' +
      '・GFFX_MAX_MARGIN_JPY_PER_PAIR=150000\n' +
      '・GFFX_MAX_OPEN_POSITIONS=2（同時建玉のみ制限）\n' +
      '・監視銘柄=全10通貨（GFFX_PAIRS は変更しない）\n' +
      '・PAPER_JPY=300000（紙トレ用）\n' +
      '・DRY_RUN=true（実注文なし・紙トレ）\n\n' +
      '数日テスト中は DRY_RUN=true のまま運用してください。\n' +
      '本番移行時のGMO入金目安: 30万円（2ポジ同時・部分利確込み）\n\n' +
      '続行しますか？',
    ui.ButtonSet.YES_NO
  );
  if (ok !== ui.Button.YES) return;

  var p = PropertiesService.getScriptProperties();
  p.setProperty('MIN_FUND_MODE', 'true');
  p.setProperty('GFFX_LEVERAGE', '25');
  p.setProperty('GFFX_MAX_MARGIN_JPY_PER_PAIR', '150000');
  p.setProperty('GFFX_MAX_OPEN_POSITIONS', '2');
  p.deleteProperty('GFFX_PAIRS');
  p.setProperty('PAPER_JPY', '300000');
  p.setProperty('DRY_RUN', 'true');
  gffxLog_('最低資金テスト設定を適用 DRY_RUN=true 部分利確=本番同様');
  ui.alert(
    '設定完了（紙トレ）',
    'DRY_RUN=true を設定しました。実注文は送りません。\n' +
      'ロットは本番同様 2万通貨（5本後に半分利確あり）。\n\n' +
      '次のステップ:\n' +
      '1. メニュー「2. 1回実行」（ログに DRY_RUN=true を確認）\n' +
      '2. メニュー「3. 15分トリガー」\n' +
      '3. メニュー「10. 日次レポートトリガー」（任意）\n' +
      '4. 数日後、GFFX_運用ログ / 売買履歴で確認\n\n' +
      '※「13. 本番モード」は数日テスト中は実行しないでください',
    ui.ButtonSet.OK
  );
}

function gffxSetupStandardMenu() {
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert(
    '通常設定に戻す（G-FFX）',
    'MIN_FUND_MODE=false / 2万通貨 / 同時7 / 銘柄10 に戻します。\n続行しますか？',
    ui.ButtonSet.YES_NO
  );
  if (ok !== ui.Button.YES) return;

  var p = PropertiesService.getScriptProperties();
  p.setProperty('MIN_FUND_MODE', 'false');
  p.setProperty('GFFX_LEVERAGE', '4');
  p.setProperty('GFFX_MAX_MARGIN_JPY_PER_PAIR', '50000');
  p.setProperty('GFFX_MAX_OPEN_POSITIONS', '7');
  p.deleteProperty('GFFX_PAIRS');
  p.setProperty('PAPER_JPY', '500000');
  gffxLog_('通常設定に戻しました');
  ui.alert('通常設定に戻しました（GFFX_PAIRS は全10通貨）');
}

function gffxSetupProductionMenu() {
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert(
    '本番モード（GMO外国為替FX）',
    'DRY_RUN=false にします。\n' +
      '・実際に注文が送られます\n' +
      '・GMO_API_KEY / GMO_API_SECRET が外国為替FX用であることを確認\n' +
      '・接続テスト済みであることを確認\n\n' +
      '続行しますか？',
    ui.ButtonSet.YES_NO
  );
  if (ok !== ui.Button.YES) return;

  var p = PropertiesService.getScriptProperties();
  p.setProperty('DRY_RUN', 'false');
  gffxLog_('本番モード: DRY_RUN=false');
  ui.alert(
    '本番モードを設定しました',
    '次のステップ:\n' +
      '1. メニュー「7. 接続テスト」（Private OK を確認）\n' +
      '2. メニュー「2. 1回実行」（DRY_RUN=false で動作確認）\n' +
      '3. メニュー「3. 15分トリガー」\n' +
      '4. メニュー「10. 日次レポートトリガー」',
    ui.ButtonSet.OK
  );
}
