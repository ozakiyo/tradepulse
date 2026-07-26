/**
 * チームK — メニュー・戻り局面ロング回転
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('チームK Bot')
    .addItem('0. 検証再開（VALIDATION_PAUSED=false）', 'kResumePaperLoopMenu')
    .addItem('1. 接続テスト', 'kTestConnection')
    .addItem('2. ペア仕様をAPI同期', 'kSyncInstrumentsMenu')
    .addItem('3. 銘柄ランキング（必要資金昇順）', 'kShowRankMenu')
    .addItem('3b. ランキング強制更新', 'kShowRankMenuForce')
    .addItem('4. 長期トレンド診断（1銘柄）', 'kShowLongTermMenu')
    .addItem('4b. トレンドシート更新（短期+長期）', 'kUpdateTrendSheetMenu')
    .addSeparator()
    .addItem('5. シート初期化', 'kInitSheetsMenu')
    .addItem('6. 検証用プロパティ設定', 'kSetupDefaultProperties')
    .addItem('6b. プロパティ整理（肥大対策）', 'kPruneScriptPropertiesMenu')
    .addItem('6c. MIN_VOLUME_JPY を設定', 'kSetMinVolumeMenu')
    .addItem('6d. MAX_SPREAD_PCT を設定', 'kSetMaxSpreadMenu')
    .addItem('7. ログ表示', 'kShowLog')
    .addItem('8. 1回実行', 'kRunOnceMenu')
    .addItem('8b. 検証再開（紙トレ連続）', 'kResumePaperLoopMenu')
    .addItem('8c. 幽霊ポジ解消', 'kClearGhostPositionsMenu')
    .addItem('9. 1分トリガーを設置（停止中なら再開確認）', 'kInstallTrigger')
    .addItem('10. トリガーを削除', 'kRemoveTrigger')
    .addSeparator()
    .addItem('11. 取引履歴を同期', 'kSyncApiTradeHistoryMenu')
    .addItem('11b. 税務明細を再計算', 'kRebuildApiTaxDetailMenu')
    .addItem('12. 税務集計を更新', 'kRefreshTaxSummaryMenu')
    .addItem('12b. 運用日次を更新', 'kRefreshOpDailyMenu')
    .addToUi();
}

function kShowLog() {
  var log = PropertiesService.getScriptProperties().getProperty('K_LOG') || '(空)';
  SpreadsheetApp.getUi().alert(log.slice(0, 1500));
}

function kSyncInstrumentsMenu() {
  var map = kEnsureInstrumentsSyncedDaily_(true);
  SpreadsheetApp.getUi().alert('同期完了: ' + Object.keys(map).length + ' ペア');
}

function kInitSheetsMenu() {
  kEnsureSheetsInitializedDaily_(true);
  SpreadsheetApp.getUi().alert(
    'シートを用意しました:\n' +
      '・K_運用ログ\n' +
      '・K_ステータス（アクティブ一覧）\n' +
      '・K_紙トレ売買（Bot推定・申告用ではない）\n' +
      '・K_運用損益（ポジション紐付け・税務用ではない）\n' +
      '・K_運用日次（運用損益の日次合計）\n' +
      '・K_売買履歴（bitbank API実績）\n' +
      '・K_税務明細（API実績 移動平均法）\n' +
      '・K_税務集計\n' +
      '・K_トレンド（短期=日足 + 長期=週/月）'
  );
}

function kSyncApiTradeHistoryMenu() {
  var cfg = kGetConfig_();
  var force = false;
  if (cfg.dryRun) {
    var ans = SpreadsheetApp.getUi().alert(
      'DRY_RUN=true です。\n本番口座の API キーで同期する場合は続行してください。',
      SpreadsheetApp.getUi().ButtonSet.OK_CANCEL
    );
    if (ans !== SpreadsheetApp.getUi().Button.OK) return;
    force = true;
  }
  try {
    var batch = kSyncTradeHistoryFromApi_({ force: force, maxPages: 5 });
    if (batch.skippedDryRun) {
      SpreadsheetApp.getUi().alert('DRY_RUN のため API 同期をスキップしました');
      return;
    }
    if (batch.initialized) {
      SpreadsheetApp.getUi().alert(
        '取引履歴の同期開始点を現在に設定しました。\n' +
          '過去の取引は取り込みません。\n\n' +
          'Bot運用開始後の約定から K_売買履歴 / K_税務明細 に記録されます。'
      );
      return;
    }
    var rebuild = { taxRows: 0, warnings: [] };
    if (batch.added > 0) {
      rebuild = kRebuildTaxDetailFromApi_();
      kRefreshTaxSummaryFromDetail_(K_SHEET_TAX_DETAIL);
    }
    var warn =
      rebuild.warnings && rebuild.warnings.length
        ? '\n\n注意:\n' + rebuild.warnings.slice(0, 8).join('\n')
        : '';
    SpreadsheetApp.getUi().alert(
      '取引履歴を同期しました。\n' +
        '新規約定: ' +
        batch.added +
        '件\n' +
        '税務明細: ' +
        rebuild.taxRows +
        '行' +
        warn
    );
  } catch (e) {
    SpreadsheetApp.getUi().alert('API同期エラー:\n' + (e.message || e));
  }
}

function kRebuildApiTaxDetailMenu() {
  try {
    var result = kRebuildTaxDetailFromApi_();
    kRefreshTaxSummaryFromDetail_(K_SHEET_TAX_DETAIL);
    var warn =
      result.warnings && result.warnings.length
        ? '\n\n注意:\n' + result.warnings.slice(0, 8).join('\n')
        : '';
    SpreadsheetApp.getUi().alert(
      'K_税務明細 を移動平均法で再計算しました。\n行数: ' + result.taxRows + warn
    );
  } catch (e) {
    SpreadsheetApp.getUi().alert('再計算エラー:\n' + (e.message || e));
  }
}

function kRefreshTaxSummaryMenu() {
  kRefreshTaxSummary_();
  SpreadsheetApp.getUi().alert(
    'K_税務集計 を更新しました。\n' +
      '年次・月次・銘柄別の譲渡損益合計を確認してください。\n' +
      '（bitbank API実績ベース）\n\n' +
      '※ 暗号資産の譲渡所得は総合課税（雑所得）です。\n' +
      '申告時は税理士または国税庁の記載要領に従ってください。'
  );
}

function kRefreshOpDailyMenu() {
  kGetLotProfitSheet_();
  var r = kRefreshOpDailyFromLotProfit_();
  SpreadsheetApp.getUi().alert(
    'K_運用日次 を更新しました。\n' +
      '日数: ' +
      r.days +
      '\n\n' +
      '※ 税務用ではありません。K_運用損益（ポジション紐付け）からの集計です。'
  );
}

function kUpdateTrendSheetMenu() {
  var r = kUpdateTrendSheetDaily_(kGetConfig_(), { force: true, maxMs: 240000 });
  SpreadsheetApp.getUi().alert(
    r.done ? 'トレンドシート更新: ' + r.progress : '途中まで更新: ' + r.progress + '\nもう一度実行してください'
  );
}

function kSetupDefaultProperties() {
  var p = PropertiesService.getScriptProperties();
  // プロパティ肥大時は先に整理しないと新規キーが書けないことがある
  var count = kCountScriptProperties_();
  var pruned = null;
  if (count >= 45) {
    pruned = kPruneUnusedScriptProperties_();
    kLog_('設定前にプロパティ整理: ' + pruned.before + '→' + pruned.after);
  }
  if (!p.getProperty('DRY_RUN')) p.setProperty('DRY_RUN', 'true');
  p.setProperty('PAPER_JPY', String(K_CONFIG.PAPER_JPY_DEFAULT));
  p.setProperty('ENTRY_JPY', String(K_CONFIG.ENTRY_JPY));
  p.setProperty('TARGET_NET_JPY', String(K_CONFIG.TARGET_NET_JPY));
  p.setProperty('TP_MIN_TICKS', String(K_CONFIG.TP_MIN_TICKS));
  p.setProperty('TP_MIN_PCT', String(K_CONFIG.TP_MIN_PCT));
  p.setProperty('TAKE_PROFIT_PCT', String(K_CONFIG.TAKE_PROFIT_PCT));
  p.setProperty('SALT_DRAWDOWN_PCT', String(K_CONFIG.SALT_DRAWDOWN_PCT));
  p.setProperty('MAX_ACTIVE_PAIRS', String(K_CONFIG.MAX_ACTIVE_PAIRS));
  p.setProperty('PAIR_BUDGET_JPY', String(K_CONFIG.PAIR_BUDGET_JPY));
  p.setProperty('PULLBACK_TO_SMA_PCT', String(K_CONFIG.PULLBACK_TO_SMA_PCT));
  p.setProperty('DAILY_RANGE_MAX_PCT', String(K_CONFIG.DAILY_RANGE_MAX_PCT));
  p.setProperty('RANGE_UPPER_FROM_TOP_PCT', String(K_CONFIG.RANGE_UPPER_FROM_TOP_PCT));
  p.setProperty('TP_FEE_BUY_ROLE', String(K_CONFIG.TP_FEE_BUY_ROLE));
  p.setProperty('TP_FEE_SELL_ROLE', String(K_CONFIG.TP_FEE_SELL_ROLE));
  p.setProperty('LIQUIDITY_FILTER_ENABLED', String(K_CONFIG.LIQUIDITY_FILTER_ENABLED));
  p.setProperty('MIN_VOLUME_JPY', String(K_CONFIG.MIN_VOLUME_JPY));
  p.setProperty('MAX_SPREAD_PCT', String(K_CONFIG.MAX_SPREAD_PCT));
  if (!p.getProperty('VALIDATION_PAUSED')) p.setProperty('VALIDATION_PAUSED', 'true');
  if (!p.getProperty('OWN_ORDERS_ONLY')) {
    p.setProperty('OWN_ORDERS_ONLY', String(K_CONFIG.OWN_ORDERS_ONLY_DEFAULT));
  }

  // 書き込み直後に読み戻して確認（UIに出ない／失敗を検知）
  var volWritten = p.getProperty('MIN_VOLUME_JPY');
  var afterCount = kCountScriptProperties_();
  SpreadsheetApp.getUi().alert(
    'K検証設定を書きました\n' +
      (pruned
        ? '（先に整理: ' + pruned.before + '→' + pruned.after + '）\n'
        : '') +
      'プロパティ件数: ' +
      afterCount +
      '\n\n' +
      'MIN_VOLUME_JPY=' +
      (volWritten != null ? volWritten : '【書込失敗】') +
      '\nMAX_SPREAD_PCT=' +
      p.getProperty('MAX_SPREAD_PCT') +
      '\nLIQUIDITY_FILTER_ENABLED=' +
      p.getProperty('LIQUIDITY_FILTER_ENABLED') +
      '\n\nDRY_RUN / TARGET_NET_JPY=' +
      p.getProperty('DRY_RUN') +
      ' / ' +
      p.getProperty('TARGET_NET_JPY') +
      '\n\n※ 確認場所:\n' +
      '拡張機能 → Apps Script → 設定（歯車）→ スクリプト プロパティ\n' +
      '（「ユーザープロパティ」ではない）'
  );
}

/** 出来高下限だけ設定（肥大時は先に整理） */
function kSetMinVolumeMenu() {
  var ui = SpreadsheetApp.getUi();
  var cur = PropertiesService.getScriptProperties().getProperty('MIN_VOLUME_JPY');
  var res = ui.prompt(
    'MIN_VOLUME_JPY を設定',
    '24時間出来高の下限（円）を入力\n' +
      '例: 0（無効） / 1000000（100万） / 3000000（300万）\n' +
      '現在: ' +
      (cur != null ? cur : '未設定（コード既定 ' + K_CONFIG.MIN_VOLUME_JPY + '）'),
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var raw = String(res.getResponseText() || '').trim().replace(/,/g, '');
  var n = Number(raw);
  if (!raw || isNaN(n) || n < 0) {
    ui.alert('数値が不正です: ' + raw);
    return;
  }
  var p = PropertiesService.getScriptProperties();
  if (kCountScriptProperties_() >= 45) {
    kPruneUnusedScriptProperties_();
  }
  p.setProperty('MIN_VOLUME_JPY', String(Math.floor(n)));
  var check = p.getProperty('MIN_VOLUME_JPY');
  ui.alert(
    check != null
      ? '設定しました\nMIN_VOLUME_JPY=' + check + '\n\n続けて「4b. トレンドシート更新」を実行してください。'
      : '書き込みに失敗しました。先に「6b. プロパティ整理」を実行してください。'
  );
}

/** スプレッド上限だけ設定（肥大時は先に整理） */
function kSetMaxSpreadMenu() {
  var ui = SpreadsheetApp.getUi();
  var cur = PropertiesService.getScriptProperties().getProperty('MAX_SPREAD_PCT');
  var res = ui.prompt(
    'MAX_SPREAD_PCT を設定',
    'スプレッド上限（%）を入力\n' +
      '例: 1（1%） / 0.35（旧既定） / 999（実質無効）\n' +
      '現在: ' +
      (cur != null ? cur : '未設定（コード既定 ' + K_CONFIG.MAX_SPREAD_PCT + '）'),
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var raw = String(res.getResponseText() || '').trim().replace(/,/g, '');
  var n = Number(raw);
  if (!raw || isNaN(n) || n < 0) {
    ui.alert('数値が不正です: ' + raw);
    return;
  }
  var p = PropertiesService.getScriptProperties();
  if (kCountScriptProperties_() >= 45) {
    kPruneUnusedScriptProperties_();
  }
  p.setProperty('MAX_SPREAD_PCT', String(n));
  var check = p.getProperty('MAX_SPREAD_PCT');
  ui.alert(
    check != null
      ? '設定しました\nMAX_SPREAD_PCT=' + check + '\n\n続けて「4b. トレンドシート更新」を実行してください。'
      : '書き込みに失敗しました。先に「6b. プロパティ整理」を実行してください。'
  );
}

function kShowRankMenu() {
  kShowRankMenuCore_(false);
}

function kShowRankMenuForce() {
  PropertiesService.getScriptProperties().deleteProperty(K_RANK_CACHE_KEY);
  PropertiesService.getScriptProperties().deleteProperty(K_RANK_OFFSET_KEY);
  kShowRankMenuCore_(true);
}

function kShowRankMenuCore_(force) {
  var cfg = kGetConfig_();
  var ranked = kRankCandidatePairs_(cfg, { forceRefresh: force });
  var cache = ranked._cache || kLoadRankCache_();
  var lines = ['=== TEAM-K ランキング（必要資金昇順・戻り） ==='];
  if (cache) {
    lines.push(
      cache.complete
        ? 'キャッシュ完了 / 長期除外累計' + (cache.excluded || 0)
        : '取得中 ' + (cache.progress || 0) + '/' + (cache.total || '?')
    );
  }
  lines.push('');
  if (!ranked.length) {
    lines.push('候補なし（再実行でスキャン継続）');
  } else {
    ranked.forEach(function (r, i) {
      lines.push(
        i +
          1 +
          '. ' +
          r.pair +
          ' need=' +
          (r.entryNeedJpy != null ? Math.round(r.entryNeedJpy) : '?') +
          '円 score=' +
          Math.round(r.score * 10000) / 10000 +
          ' ' +
          r.note
      );
    });
  }
  kLog_(lines.join('\n'));
  SpreadsheetApp.getUi().alert(lines.join('\n'));
}

function kShowLongTermMenu() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('長期トレンド診断', 'ペア名（例: btc_jpy）', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var pair = String(res.getResponseText() || '')
    .trim()
    .toLowerCase();
  if (!pair) return;
  var lt = kEvaluateLongTermRegime_(pair);
  var up = kEvaluateUpRegime_(pair);
  ui.alert(
    pair +
      '\n\n【長期】除外=' +
      lt.excluded +
      '\n' +
      lt.note +
      '\n\n【日足戻り】entry可=' +
      up.allowEntry +
      ' regime=' +
      up.regime +
      '\n' +
      up.note
  );
}

function kInstallTrigger() {
  var ui = SpreadsheetApp.getUi();
  var p = PropertiesService.getScriptProperties();
  // 停止中でも設置時に必ず再開（メニューが古い場合の逃げ道）
  p.setProperty('VALIDATION_PAUSED', 'false');
  if (!p.getProperty('DRY_RUN')) p.setProperty('DRY_RUN', 'true');
  kRemoveTrigger();
  ScriptApp.newTrigger('kRunOnce').timeBased().everyMinutes(1).create();
  ui.alert(
    '1分トリガーを設置しました\n' +
      'VALIDATION_PAUSED=false（強制再開）\n' +
      'DRY_RUN=' +
      kGetConfig_().dryRun +
      '\n\n※ もし以前と同じ「トリガー未設置」メッセージなら、\n' +
      '別の古いスクリプトを開いています。\n' +
      '拡張機能→Apps Script のプロジェクトを確認してください。'
  );
}

/** プロパティだけ false にする（Apps Script エディタから実行可） */
function kForceUnpauseOnly() {
  PropertiesService.getScriptProperties().setProperty('VALIDATION_PAUSED', 'false');
  SpreadsheetApp.getUi().alert(
    'VALIDATION_PAUSED=false にしました\n生の値=[' +
      kGetValidationPausedRaw_() +
      ']\n\n続けてメニュー「9. 1分トリガーを設置」を実行してください。'
  );
}

function kRemoveTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'kRunOnce') ScriptApp.deleteTrigger(t);
  });
}

/** 紙トレ連続運用: VALIDATION_PAUSED=false + DRY_RUN維持 + 1回確認実行 */
function kResumePaperLoopMenu() {
  var p = PropertiesService.getScriptProperties();
  p.setProperty('VALIDATION_PAUSED', 'false');
  if (!p.getProperty('DRY_RUN')) p.setProperty('DRY_RUN', 'true');
  var cfg = kGetConfig_();
  var paused = kIsValidationPaused_();
  var msg =
    '設定を書きました\nVALIDATION_PAUSED=false（判定停止=' +
    paused +
    '）\nDRY_RUN=' +
    cfg.dryRun +
    '\n生の値=[' +
    kGetValidationPausedRaw_() +
    ']';
  if (paused) {
    SpreadsheetApp.getUi().alert(msg + '\n\nまだ停止判定です。スクリプトプロパティ名の typo を確認してください。');
    return;
  }
  var summary = kRunOnceCore_();
  SpreadsheetApp.getUi().alert(msg + '\n\n--- 1回実行 ---\n' + summary);
}

/** state.position 残・残高0 の幽霊ポジを一括クリア（TRXなど） */
function kClearGhostPositionsMenu() {
  var cleared = kClearGhostPositions_();
  SpreadsheetApp.getUi().alert(
    cleared.length
      ? '幽霊ポジを解消しました:\n' + cleared.join('\n')
      : '幽霊ポジはありませんでした。\n（state.position があり残高が minAmount 未満の銘柄が対象）'
  );
}

/**
 * Script Properties 肥大対策
 * 銘柄state(K_S_)の余り・長期キャッシュ(K_LT_)・一時バッファを削除
 */
function kPruneScriptPropertiesMenu() {
  var ui = SpreadsheetApp.getUi();
  var before = kCountScriptProperties_();
  var res = ui.alert(
    'プロパティ整理',
    '現在 ' +
      before +
      ' 件です。\n\n' +
      '削除対象:\n' +
      '・未使用の銘柄状態 K_S_*（アクティブ/休眠外・ポジなし）\n' +
      '・長期キャッシュ K_LT_*（次回再取得）\n' +
      '・一時バッファ（トレンド途中保存など）\n\n' +
      '設定値（DRY_RUN / MIN_VOLUME_JPY 等）と\n' +
      '稼働中・保有中の状態は残します。\n\n続行しますか？',
    ui.ButtonSet.YES_NO
  );
  if (res !== ui.Button.YES) return;

  var r = kPruneUnusedScriptProperties_();
  kLog_(
    'プロパティ整理: ' +
      r.before +
      '→' +
      r.after +
      '（削除' +
      r.deleted.length +
      '）'
  );
  ui.alert(
    '整理完了\n\n' +
      r.before +
      ' → ' +
      r.after +
      ' 件\n' +
      '削除: ' +
      r.deleted.length +
      '\n' +
      '残した状態キー: ' +
      r.keptState +
      '\n' +
      '残した設定・その他: ' +
      r.keptConfig +
      '\n\n' +
      'MIN_VOLUME_JPY を変える場合は新規追加ではなく、\n' +
      '既存プロパティの値を編集してください。'
  );
}

function kRunOnceMenu() {
  SpreadsheetApp.getUi().alert(kRunOnceCore_());
}

function kRunOnce() {
  if (kIsValidationPaused_()) {
    kLog_(
      '検証停止中 VALIDATION_PAUSED=[' +
        kGetValidationPausedRaw_() +
        ']（再開: メニュー8b または プロパティ=false）'
    );
    return;
  }
  kRunOnceCore_();
}

function kRunOnceCore_() {
  var cfg = kGetConfig_();
  var global = kLoadGlobalState_();
  var errors = [];
  try {
    kEnsureInstrumentsSyncedDaily_();
    kEnsureSheetsInitializedDaily_();
    if (cfg.dryRun) kInitPaperWallet_(global, cfg);

    try {
      var trendUpd = kUpdateTrendSheetDaily_(cfg, { force: false });
      if (!trendUpd.done) {
        kLog_('トレンドシート: ' + trendUpd.progress);
      }
    } catch (te) {
      errors.push('trendSheet: ' + (te.message || te));
      kLog_('トレンドシートERROR: ' + (te.message || te));
    }

    var runList = [];
    var seen = {};
    function add(p) {
      if (!p || seen[p]) return;
      seen[p] = true;
      runList.push(p);
    }
    (global.dormantPairs || []).forEach(add);
    (global.activePairs || []).forEach(add);

    kLog_(
      '実行開始 DRY_RUN=' +
        cfg.dryRun +
        ' active=' +
        (global.activePairs || []).length +
        ' dormant=' +
        (global.dormantPairs || []).length
    );

    runList.forEach(function (pair) {
      try {
        kRunPairOnce_(pair, cfg, global);
      } catch (e) {
        errors.push(pair + ': ' + (e.message || e));
        kLog_('ERROR ' + pair + ': ' + (e.message || e));
      }
    });

    // 新規アクティブ選定は1時間ごと。分足は既存アクティブ／休眠のみ対象
    var added = [];
    // 方針変更時は即時にロスター再選定
    var ROSTER_POLICY_VER = 3;
    if (global.rosterPolicyVer !== ROSTER_POLICY_VER) {
      global.rosterPolicyVer = ROSTER_POLICY_VER;
      global.lastActiveRosterAt = null;
      kLog_('ロスター方針v' + ROSTER_POLICY_VER + ' → 即時再選定（監視ワイド・長期↓も枠可）');
    }
    var rosterRefresh = kShouldRefreshActiveRoster_(global, cfg);
    if (!rosterRefresh) {
      var leftMin = kActiveRosterMinutesLeft_(global, cfg);
      // 残りが少ない時／10分刻みだけログ（毎分は出さない）
      if (leftMin > 0 && (leftMin <= 3 || leftMin % 10 === 0)) {
        kLog_('ロスター更新待ち 残り約' + leftMin + '分 active=' + (global.activePairs || []).length);
      }
    }
    if (rosterRefresh) {
      try {
        // 監視ワイド化後のランクを組み直す
        PropertiesService.getScriptProperties().deleteProperty(K_RANK_CACHE_KEY);
        PropertiesService.getScriptProperties().deleteProperty(K_RANK_OFFSET_KEY);
        added = kTryActivateNewPairs_(cfg, global);
        global.lastActiveRosterAt = new Date().toISOString();
        kLog_(
          'アクティブロスター更新: +' +
            added.length +
            ' 現在=' +
            ((global.activePairs || []).join(', ') || 'なし') +
            ' (' +
            (global.activePairs || []).length +
            '/' +
            (cfg.maxActivePairs || K_CONFIG.MAX_ACTIVE_PAIRS) +
            ')'
        );
      } catch (e2) {
        errors.push('activate: ' + (e2.message || e2));
        kLog_('アクティブロスター更新失敗: ' + (e2.message || e2));
      }
      added.forEach(function (pair) {
        try {
          kRunPairOnce_(pair, cfg, global);
        } catch (e3) {
          errors.push(pair + ': ' + (e3.message || e3));
        }
      });
    }

    global.lastRunAt = new Date().toISOString();
    global.lastError = errors.length ? errors.join('; ') : null;

    try {
      // ロスター更新時はステータスも強制更新。通常は1時間スロットル
      kUpdateStatusSheet_(cfg, global, { force: !!rosterRefresh });
    } catch (eSt) {
      kLog_('ステータスシート更新失敗: ' + (eSt.message || eSt));
    }
    kSaveGlobalState_(global);

    if (!cfg.dryRun) {
      try {
        kSyncApiTradeAndTax_();
      } catch (eApi) {
        kLog_('API取引同期スキップ: ' + (eApi.message || eApi));
      }
    }

    var summary =
      'K完了\nアクティブ: ' +
      ((global.activePairs || []).join(', ') || 'なし') +
      '\n休眠: ' +
      ((global.dormantPairs || []).join(', ') || 'なし') +
      (added.length ? '\n新規: ' + added.join(', ') : '') +
      (errors.length ? '\n\nエラー:\n' + errors.join('\n') : '');
    kLog_(summary.replace(/\n/g, ' | '));
    return summary;
  } catch (err) {
    global.lastError = String(err.message || err);
    kSaveGlobalState_(global);
    kLog_('ERROR: ' + global.lastError);
    throw err;
  }
}
