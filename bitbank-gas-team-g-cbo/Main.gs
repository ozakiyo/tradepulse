/**
 * チームG-CBO: 4Hブレイクアウト（パーフェクトオーダー）— GMO暗号資産FX
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('チームG-CBO Bot')
    .addItem('1. スクリプトプロパティを開く', 'gcboOpenScriptProperties_')
    .addItem('2. 1回だけ実行（テスト）', 'gcboRunOnce')
    .addItem('3. 15分トリガーを設置（推奨）', 'gcboInstallTrigger')
    .addItem('3a. 30分トリガーを設置（全銘柄探索向け）', 'gcboInstallTrigger30')
    .addItem('3b. 5分トリガーを設置', 'gcboInstallTrigger5')
    .addItem('4. トリガーを削除', 'gcboRemoveTrigger')
    .addItem('5. ログを表示', 'gcboShowLog')
    .addItem('6. シート初期化', 'gcboInitSheetsMenu')
    .addItem('7. 接続テスト', 'gcboTestConnection')
    .addItem('8. 既定プロパティ設定', 'gcboSetupDefaultProperties')
    .addItem('9. 日次レポート生成', 'gcboGenerateReport')
    .addItem('10. 日次レポートトリガー設置', 'gcboInstallReportTrigger')
    .addItem('11. 日次レポートトリガー削除', 'gcboRemoveReportTrigger')
    .addItem('12. META接続テスト', 'gcboTestMetaSpreadsheet')
    .addSeparator()
    .addItem('13. 本番モードに切替（DRY_RUN=false）', 'gcboSetupProductionMenu')
    .addItem('14. 最低資金テスト設定', 'gcboSetupMinFundTestMenu')
    .addItem('15. 通常設定に戻す', 'gcboSetupStandardMenu')
    .addItem('16. 1万円本番トライアル（DOGE）', 'gcboSetupMicroLiveMenu')
    .addItem('16b. 1万円・全銘柄探索（同時1）', 'gcboSetupMicroLiveScanMenu')
    .addToUi();
}

function gcboInitSheetsMenu() {
  gcboInitSheets_();
  gcboLog_('シート初期化完了');
  SpreadsheetApp.getUi().alert('GCBO_運用ログ / GCBO_売買履歴 を用意しました');
}

function gcboOpenScriptProperties_() {
  SpreadsheetApp.getUi().alert(
    'スクリプトプロパティ',
    'GMO_API_KEY / GMO_API_SECRET（暗号資産FX用・本番時必須）\n' +
      'DRY_RUN=true（デモ推奨。本番は false）\n' +
      'PAPER_JPY=500000\n' +
      'GCBO_PAIRS=btc_jpy,eth_jpy,...（省略時は10銘柄）\n' +
      'GCBO_MAX_MARGIN_JPY_PER_PAIR=50000\n' +
      'GCBO_MAX_OPEN_POSITIONS=7\n' +
      'GCBO_LEVERAGE=4\n' +
      'GCBO_EMA_FAST=10 / GCBO_EMA_MID=20 / GCBO_EMA_SLOW=50\n' +
      'GCBO_CONSOLIDATION_BARS=10 / GCBO_PARTIAL_TP_BARS=5\n' +
      'META_SPREADSHEET_ID=（メタ層SS）',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function gcboShowLog() {
  var log = PropertiesService.getScriptProperties().getProperty('GCBO_LOG') || '(空)';
  SpreadsheetApp.getUi().alert(log.slice(0, 1500));
}

function gcboInstallTrigger() {
  gcboRemoveTrigger();
  ScriptApp.newTrigger('gcboRunOnce').timeBased().everyMinutes(15).create();
  gcboLog_('15分トリガーを設置');
  SpreadsheetApp.getUi().alert(
    '15分ごとに gcboRunOnce が動きます。\n4Hブレイクアウト向け。G-CFX と併用時は UrlFetch 節約に有効。'
  );
}

function gcboInstallTrigger5() {
  gcboRemoveTrigger();
  ScriptApp.newTrigger('gcboRunOnce').timeBased().everyMinutes(5).create();
  gcboLog_('5分トリガーを設置');
  SpreadsheetApp.getUi().alert('5分ごとに gcboRunOnce が動きます。\n※併用時は UrlFetch 上限に注意。');
}

function gcboInstallTrigger30() {
  gcboRemoveTrigger();
  ScriptApp.newTrigger('gcboRunOnce').timeBased().everyMinutes(30).create();
  gcboLog_('30分トリガーを設置');
  SpreadsheetApp.getUi().alert(
    '30分ごとに gcboRunOnce が動きます。\n全銘柄探索モードでは UrlFetch 節約のためこちらを推奨。'
  );
}

function gcboRemoveTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'gcboRunOnce') ScriptApp.deleteTrigger(t);
  });
}

function gcboRunOnce() {
  gmoClearUrlFetchQuotaIfNewDay_();
  if (gmoIsUrlFetchQuotaBlocked_()) {
    gcboLog_('UrlFetch日次上限: 本日はスキップ（太平洋時間0時リセット）');
    return;
  }

  var cfg = gcboGetConfig_();
  var state = gcboLoadState_();
  if (cfg.dryRun) gcboInitPaperWallet_(state, cfg);
  var pairs = gcboSelectPairsForRun_(gcboGetActivePairs_(), state);
  var errors = [];
  var quotaHit = false;

  try {
    gmoEnsureCryptoEndpoints_();
    gmoResetMarginRunCache_();
    gmoResetCandlesRunCache_();
    gmoGetAllTickersCached_();
    gcboLog_('実行開始 pairs=' + pairs.length + ' DRY_RUN=' + cfg.dryRun);

    pairs.forEach(function (pairId) {
      if (quotaHit) return;
      try {
        Utilities.sleep(300);
        var result = gcboRunBreakoutForPair_(pairId, cfg, state);
        var ps = gcboGetPairState_(state, pairId);
        if (gcboShouldAppendRunLog_(ps, result)) {
          gcboAppendRunLog_(pairId, result, result.assets, ps.lastSignal);
          gcboUpdateLogSnapshot_(ps, result);
        }
      } catch (e) {
        var errMsg = String(e.message || e);
        errors.push(pairId + ': ' + errMsg);
        gcboLog_('ERROR ' + pairId + ': ' + errMsg);
        if (gmoIsUrlFetchQuotaError_(errMsg)) {
          quotaHit = true;
          gmoMarkUrlFetchQuotaExceeded_();
          gcboLog_('UrlFetch日次上限のため残り銘柄をスキップ');
        }
      }
    });

    state.lastRunAt = new Date().toISOString();
    state.lastError = errors.length ? errors.join('; ') : null;
    gcboSaveState_(state);

    var equity = quotaHit
      ? Math.round(state.liveBaseline || 0)
      : Math.round(gcboAccountEquity_(cfg, state));
    if (cfg.dryRun) {
      var w = state.paperWallet;
      gcboLog_(
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
      gcboLog_('本番 評価額=' + equity + ' 基準=' + Math.round(state.liveBaseline || 0));
    }
    gcboLog_('G-CBO 完了' + (errors.length ? ' 一部エラー' : ''));
  } catch (err) {
    var errMsg = String(err.message || err);
    if (gmoIsUrlFetchQuotaError_(errMsg)) gmoMarkUrlFetchQuotaExceeded_();
    state.lastError = errMsg;
    gcboSaveState_(state);
    gcboLog_('ERROR: ' + state.lastError);
    return;
  }
}

function gcboSetupDefaultProperties() {
  var p = PropertiesService.getScriptProperties();
  p.setProperty('GMO_PUBLIC_API', GMO_API_CONFIG.PUBLIC_API);
  p.setProperty('GMO_PRIVATE_API', GMO_API_CONFIG.PRIVATE_API);
  if (!p.getProperty('DRY_RUN')) p.setProperty('DRY_RUN', 'true');
  if (!p.getProperty('PAPER_JPY')) p.setProperty('PAPER_JPY', '500000');
  if (!p.getProperty('GCBO_MAX_MARGIN_JPY_PER_PAIR')) p.setProperty('GCBO_MAX_MARGIN_JPY_PER_PAIR', '50000');
  if (!p.getProperty('GCBO_LEVERAGE')) p.setProperty('GCBO_LEVERAGE', '4');
  var maxOpen = p.getProperty('GCBO_MAX_OPEN_POSITIONS');
  if (!maxOpen || maxOpen === '4') p.setProperty('GCBO_MAX_OPEN_POSITIONS', '7');
  gcboLog_('チームG-CBO 既定プロパティを設定（暗号資産FX API・DRY_RUN=true）');
  SpreadsheetApp.getUi().alert(
    '暗号資産FX API エンドポイントと DRY_RUN=true を設定しました。\n' +
      GMO_API_CONFIG.PUBLIC_API
  );
}

function gcboTestConnection() {
  var cfg = gcboGetConfig_();
  try {
    var result = gmoTestConnection_();
  var msg =
    'GMO Public OK（暗号資産FX）\n' +
    result.endpoints.public +
    '\n' +
    result.symbol +
    ' = ' +
    result.last.toLocaleString() +
    ' 1H=' +
    result.candles1h +
    '本' +
    (result.candlesNote ? ' ' + result.candlesNote : '') +
    '\nDRY_RUN=' +
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
      '\n※会員ページで「暗号資産FX」用キーを発行し、G-FFXの外国為替用キーと混同しないこと';
  } else {
    msg += '\n\nPrivate: スキップ（DRY_RUN・キー未設定可）';
  }
  gcboLog_('接続テスト ' + result.symbol + '=' + result.last);
  SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    var err = String(e.message || e);
    gcboLog_('接続テスト失敗: ' + err);
    var hint = err.indexOf('urlfetch') >= 0 || err.indexOf('UrlFetch') >= 0
      ? '\n\n※GASのUrlFetch日次上限です。翌日（太平洋時間0時）まで待つか、他チームのトリガーを一時停止してください。'
      : '';
    SpreadsheetApp.getUi().alert('接続テスト失敗\n' + err + hint);
  }
}

function gcboSetupMinFundTestMenu() {
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert(
    '最低資金テスト（G-CBO）',
    '以下を設定します:\n' +
      '・MIN_FUND_MODE=true（本番同様・最小ロット×2・部分利確あり）\n' +
      '・GCBO_LEVERAGE=25（GMO 4%証拠金に合わせる）\n' +
      '・GCBO_MAX_MARGIN_JPY_PER_PAIR=150000\n' +
      '・GCBO_MAX_OPEN_POSITIONS=2（同時建玉のみ制限）\n' +
      '・監視銘柄=全10銘柄（GCBO_PAIRS は変更しない）\n' +
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
  p.setProperty('GCBO_LEVERAGE', '25');
  p.setProperty('GCBO_MAX_MARGIN_JPY_PER_PAIR', '150000');
  p.setProperty('GCBO_MAX_OPEN_POSITIONS', '2');
  p.deleteProperty('GCBO_PAIRS');
  p.setProperty('PAPER_JPY', '300000');
  p.setProperty('DRY_RUN', 'true');
  gcboLog_('最低資金テスト設定を適用 DRY_RUN=true 部分利確=本番同様');
  ui.alert(
    '設定完了（紙トレ）',
    'DRY_RUN=true を設定しました。実注文は送りません。\n' +
      'ロットは本番同様（銘柄ごとの最小×2、5本後に半分利確あり）。\n\n' +
      '次のステップ:\n' +
      '1. メニュー「2. 1回実行」（ログに DRY_RUN=true を確認）\n' +
      '2. メニュー「3. 5分トリガー」\n' +
      '3. メニュー「10. 日次レポートトリガー」（任意）\n' +
      '4. 数日後、GCBO_運用ログ / 売買履歴で確認\n\n' +
      '※「13. 本番モード」は数日テスト中は実行しないでください',
    ui.ButtonSet.OK
  );
}

function gcboSetupStandardMenu() {
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert(
    '通常設定に戻す（G-CBO）',
    'MIN_FUND_MODE=false / 最小ロット×2 / 同時7 / 銘柄10 に戻します。\n続行しますか？',
    ui.ButtonSet.YES_NO
  );
  if (ok !== ui.Button.YES) return;

  var p = PropertiesService.getScriptProperties();
  p.setProperty('MIN_FUND_MODE', 'false');
  p.deleteProperty('MICRO_LIVE_MODE');
  p.setProperty('GCBO_LEVERAGE', '4');
  p.setProperty('GCBO_MAX_MARGIN_JPY_PER_PAIR', '50000');
  p.setProperty('GCBO_MAX_OPEN_POSITIONS', '7');
  p.deleteProperty('GCBO_PAIRS');
  p.setProperty('PAPER_JPY', '500000');
  gcboLog_('通常設定に戻しました');
  ui.alert('通常設定に戻しました（GCBO_PAIRS は全10銘柄）');
}

/** 1万円本番の共通設定（銘柄リストは呼び出し側で指定） */
function gcboApplyMicroLiveBaseProps_(p) {
  p.setProperty('MIN_FUND_MODE', 'true');
  p.setProperty('MICRO_LIVE_MODE', 'true');
  p.setProperty('GMO_PUBLIC_API', GMO_API_CONFIG.PUBLIC_API);
  p.setProperty('GMO_PRIVATE_API', GMO_API_CONFIG.PRIVATE_API);
  p.setProperty('GCBO_LEVERAGE', '25');
  p.setProperty('GCBO_MAX_MARGIN_JPY_PER_PAIR', '4000');
  p.setProperty('GCBO_MAX_OPEN_POSITIONS', '1');
  p.setProperty('PAPER_JPY', '10000');
  p.setProperty('DRY_RUN', 'false');
}

/** 証拠金4000円上限で建てられる銘柄（BTC除外・安い順） */
var GCBO_MICRO_LIVE_SCAN_PAIRS =
  'xrp_jpy,doge_jpy,ada_jpy,sui_jpy,dot_jpy,link_jpy,sol_jpy,ltc_jpy,eth_jpy';

function gcboApplyMicroLiveProps_(p) {
  gcboApplyMicroLiveBaseProps_(p);
  p.setProperty('GCBO_PAIRS', 'doge_jpy');
  p.deleteProperty('MICRO_LIVE_SCAN_MODE');
}

function gcboApplyMicroLiveScanProps_(p) {
  gcboApplyMicroLiveBaseProps_(p);
  p.setProperty('MICRO_LIVE_SCAN_MODE', 'true');
  p.setProperty('GCBO_SCAN_BATCH_SIZE', '3');
  p.setProperty('GCBO_PAIRS', GCBO_MICRO_LIVE_SCAN_PAIRS);
}

function gcboSetupMicroLiveScanMenu() {
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert(
    '1万円・全銘柄探索（G-CBO）',
    '暗号資産FX口座 1万円向け。4Hブレイクアウトは機会が少ないため、\n' +
      '複数銘柄を監視しつつ同時建玉は1件に制限します。\n\n' +
      '・DRY_RUN=false（実注文）\n' +
      '・監視: 9銘柄（BTC/JPY は最小ロットで証拠金超過のため除外）\n' +
      '・同時建玉: 1（他銘柄は「新規見送り(保有上限)」）\n' +
      '・1銘柄上限: 4,000円\n' +
      '・レバ25\n\n' +
      '※ G-CFX と同一口座の場合、合計2建玉まで可能\n' +
      '※ **30分トリガー推奨**（15分だと UrlFetch 上限に達しやすい）\n\n' +
      '続行しますか？',
    ui.ButtonSet.YES_NO
  );
  if (ok !== ui.Button.YES) return;

  var p = PropertiesService.getScriptProperties();
  gcboApplyMicroLiveScanProps_(p);
  gcboLog_('1万円全銘柄探索設定 pairs=9 DRY_RUN=false MAX_OPEN=1');
  ui.alert(
    'G-CBO 全銘柄探索設定完了',
    '次のステップ:\n' +
      '1. メニュー「7. 接続テスト」\n' +
      '2. メニュー「2. 1回実行」（ログに pairs=9 を確認）\n' +
      '3. メニュー「3. 15分トリガー」\n' +
      '4. GCBO_運用ログで各銘柄のブレイク判定を確認',
    ui.ButtonSet.OK
  );
}

function gcboSetupMicroLiveMenu() {
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert(
    '1万円本番トライアル（G-CBO）',
    '暗号資産FX口座 1万円向けの超少額本番設定です。\n\n' +
      '・DRY_RUN=false（実注文）\n' +
      '・銘柄: DOGE/JPY のみ（G-CFX は XRP に分担）\n' +
      '・同時建玉: 1\n' +
      '・1銘柄上限: 4,000円\n' +
      '・レバ25（GMO 4%想定）\n\n' +
      '前提:\n' +
      '・GMO 暗号資産FX用 APIキー設定済み\n' +
      '・口座残高 ≈1万円\n' +
      '・G-CFX 側も「15. 1万円本番トライアル」を実行\n\n' +
      '続行しますか？',
    ui.ButtonSet.YES_NO
  );
  if (ok !== ui.Button.YES) return;

  var p = PropertiesService.getScriptProperties();
  gcboApplyMicroLiveProps_(p);
  gcboLog_('1万円本番トライアル設定 DOGE/JPY DRY_RUN=false');
  ui.alert(
    'G-CBO 本番トライアル設定完了',
    '次のステップ:\n' +
      '1. メニュー「7. 接続テスト」（Private OK・余力≈1万円）\n' +
      '2. メニュー「2. 1回実行」（DRY_RUN=false）\n' +
      '3. メニュー「3. 15分トリガー」\n' +
      '4. メニュー「10. 日次レポートトリガー」\n' +
      '5. G-CFX SS でも「15. 1万円本番トライアル」を実行',
    ui.ButtonSet.OK
  );
}

function gcboSetupProductionMenu() {
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert(
    '本番モード（GMO暗号資産FX）',
    'DRY_RUN=false にします。\n' +
      '・実際に注文が送られます\n' +
      '・GMO_API_KEY / GMO_API_SECRET が暗号資産FX用であることを確認\n' +
      '・接続テスト済みであることを確認\n\n' +
      '続行しますか？',
    ui.ButtonSet.YES_NO
  );
  if (ok !== ui.Button.YES) return;

  var p = PropertiesService.getScriptProperties();
  p.setProperty('DRY_RUN', 'false');
  gcboLog_('本番モード: DRY_RUN=false');
  ui.alert(
    '本番モードを設定しました',
    '次のステップ:\n' +
      '1. メニュー「7. 接続テスト」（Private OK を確認）\n' +
      '2. メニュー「2. 1回実行」（DRY_RUN=false で動作確認）\n' +
      '3. メニュー「3. 5分トリガー」\n' +
      '4. メニュー「10. 日次レポートトリガー」',
    ui.ButtonSet.OK
  );
}
