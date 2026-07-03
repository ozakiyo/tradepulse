/**
 * チームJ — メニュー・トラリピ実行
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('チームJ Bot')
    .addItem('1. 手数料一覧（公式）', 'jShowFeeTable')
    .addItem('2. 銘柄別手数料・1R利益', 'jShowPairCostAnalysis')
    .addItem('3. 銘柄選定ランキング', 'jShowRankMenu')
    .addItem('3b. ランキング強制更新', 'jShowRankMenuForce')
    .addItem('4. 口座予算で自動選定', 'jShowBudgetPickMenu')
    .addSeparator()
    .addItem('5. 接続テスト', 'jTestConnection')
    .addItem('6. BTC長期保有の確認', 'jShowReserveStatus_')
    .addItem('7. ペア仕様をAPI同期', 'jSyncInstrumentsMenu')
    .addItem('8. シート初期化', 'jInitSheetsMenu')
    .addItem('9. 既定プロパティ設定', 'jSetupDefaultProperties')
    .addItem('10. ログ表示', 'jShowLog')
    .addItem('11. 1回実行', 'jRunOnceMenu')
    .addItem('12. 5分トリガーを設置', 'jInstallTrigger')
    .addItem('13. トリガーを削除', 'jRemoveTrigger')
    .addToUi();
}

function jShowLog() {
  var log = PropertiesService.getScriptProperties().getProperty('J_LOG') || '(空)';
  SpreadsheetApp.getUi().alert(log.slice(0, 1500));
}

function jShowFeeTable() {
  SpreadsheetApp.getUi().alert(jBuildFeeSummaryText_(null));
}

function jShowPairCostAnalysis() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('銘柄分析', 'pair名（例: trx_jpy）', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var pair = String(res.getResponseText() || '').trim().toLowerCase();
  if (!pair) return;

  var cfg = jGetConfig_();
  var a = jAnalyzePairCosts_(pair, cfg);
  var lines = [jBuildFeeSummaryText_(pair), ''];

  if (!a.dailyRangeOk) {
    lines.push('日足レンジ NG: ' + (a.note || ''));
    ui.alert(lines.join('\n'));
    return;
  }

  lines.push('【' + a.label + ' @ ' + a.last + '円】');
  lines.push('1段数量: ' + a.levelAmount + ' （MIN_LEVEL_JPY=' + cfg.minLevelJpy + '）');
  lines.push('トラップ間隔: ' + a.trapStep + ' (' + a.trapStepPct.toFixed(2) + '%) 本数=' + a.levels);
  if (a.moveStepRatio != null) {
    lines.push(
      '日中変動/trapStep: ' +
        a.moveStepRatio +
        'x （日中幅≈' +
        a.intradayMoveJpy +
        '円 / 間隔' +
        a.trapStep +
        '円）'
    );
  }
  lines.push('1セット資金(' + cfg.feeRoleCapital + '): ' + a.oneSetJpy + '円');
  lines.push('最悪グリッド(' + cfg.feeRoleCapital + '): ' + a.worstCaseJpy + '円');
  lines.push(
    '1R利益 maker: 粗利' +
      a.roundProfitMaker.grossJpy +
      ' 手数料買' +
      a.roundProfitMaker.feeBuyJpy +
      ' 売' +
      a.roundProfitMaker.feeSellJpy +
      ' → 純' +
      a.roundProfitMaker.netJpy +
      '円'
  );
  lines.push('1R利益 taker(参考): 純' + a.roundProfitTaker.netJpy + '円');
  lines.push('損益分岐trapStep(maker): ' + a.minProfitableTrapStep);
  lines.push('現trapStepは' + (a.trapProfitable ? '利益可' : '手数料負け注意'));

  jLog_(lines.join('\n'));
  ui.alert(lines.join('\n'));
}

function jShowRankMenu() {
  jShowRankMenuCore_(false);
}

function jShowRankMenuForce() {
  jClearRankCache_();
  jShowRankMenuCore_(true);
}

function jShowRankMenuCore_(forceRefresh) {
  var cfg = jGetConfig_();
  var ranked = jRankCandidatePairs_(cfg, { forceRefresh: forceRefresh });
  var stats = ranked._stats || {};
  var cacheInfo = ranked._cache;
  var statusLine = jFormatRankCacheStatus_(cacheInfo);

  if (!ranked.length) {
    var msg = [
      statusLine ? statusLine : 'ランキング更新中…',
      '',
      !cacheInfo || cacheInfo.complete
        ? '日足レンジOKの候補がありません。'
        : 'まだ全銘柄のスキャンが終わっていません。メニュー「3. 銘柄選定ランキング」を再実行してください。',
      '',
      '【診断】スキャン' +
      (stats.scanned || (cacheInfo && cacheInfo.progress) || '?') +
      '/' +
      (cacheInfo && cacheInfo.total ? cacheInfo.total : '?') +
      '銘柄',
      '  レンジOK: ' + (stats.rangeOk || 0),
      '  日足不足: ' + (stats.dailyShort || 0),
      '  レンジNG(幅>' + cfg.dailyRangeMaxPct + '%): ' + (stats.rangeNg || 0),
      '  APIエラー: ' + (stats.errors || 0),
      '',
      '判定: 過去' + cfg.dailyLookback + '日の高安幅 ≤ ' + cfg.dailyRangeMaxPct + '%',
    ].join('\n');
    jLog_(msg);
    SpreadsheetApp.getUi().alert(msg);
    return;
  }

  var lines = ['=== 銘柄選定ランキング ===', 'MIN_LEVEL_JPY=' + cfg.minLevelJpy];
  if (statusLine) lines.push(statusLine);
  lines.push('');
  var n = Math.min(10, ranked.length);
  for (var i = 0; i < n; i++) {
    lines.push(i + 1 + '. ' + jFormatRankRow_(ranked[i]));
  }
  if (cacheInfo && !cacheInfo.complete) {
    lines.push('');
    lines.push('※ 残り銘柄あり — 「3. 銘柄選定ランキング」を再実行で続き');
  }
  jLog_(lines.join('\n'));
  SpreadsheetApp.getUi().alert(lines.join('\n'));
}

function jShowBudgetPickMenu() {
  var cfg = jGetConfig_();
  var budget = cfg.paperJpyDefault || J_CONFIG.PAPER_JPY_DEFAULT;
  var raw = PropertiesService.getScriptProperties().getProperty('PAPER_JPY');
  if (raw) budget = Number(raw);

  var pick = jPickPairsForBudget_(budget, cfg, []);
  var lines = [
    '口座予算: ' + budget + '円（使用上限' + pick.budgetJpy + '円）',
    '候補: ' + pick.candidates + '銘柄',
    '選定: ' + pick.picked.length + '銘柄 合計最悪=' + pick.usedJpy + '円',
    '',
  ];
  pick.picked.forEach(function (r, i) {
    lines.push(i + 1 + '. ' + jFormatRankRow_(r));
  });
  if (!pick.picked.length) lines.push('（予算内に収まる銘柄なし）');

  jLog_(lines.join('\n'));
  SpreadsheetApp.getUi().alert(lines.join('\n'));
}

function jSyncInstrumentsMenu() {
  var map = jSyncInstrumentsFromApi_();
  var n = Object.keys(map).length;
  jLog_('ペア同期: ' + n + '銘柄');
  SpreadsheetApp.getUi().alert('API同期完了\nJPY建て ' + n + ' ペア');
}

function jSetupDefaultProperties() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('DRY_RUN')) p.setProperty('DRY_RUN', 'true');
  if (!p.getProperty('PAPER_JPY')) p.setProperty('PAPER_JPY', String(J_CONFIG.PAPER_JPY_DEFAULT));
  if (!p.getProperty('MIN_LEVEL_JPY')) p.setProperty('MIN_LEVEL_JPY', String(J_CONFIG.MIN_LEVEL_JPY));
  if (!p.getProperty('MAX_ACTIVE_PAIRS')) p.setProperty('MAX_ACTIVE_PAIRS', String(J_CONFIG.MAX_ACTIVE_PAIRS));
  if (!p.getProperty('MIN_GRID_LEVELS')) p.setProperty('MIN_GRID_LEVELS', String(J_CONFIG.MIN_GRID_LEVELS));
  if (!p.getProperty('VALIDATION_PAUSED')) p.setProperty('VALIDATION_PAUSED', 'true');
  if (!p.getProperty('BTC_RESERVE_AMOUNT')) {
    p.setProperty('BTC_RESERVE_AMOUNT', String(J_CONFIG.BTC_RESERVE_AMOUNT));
  }
  var rawExclude = p.getProperty('J_EXCLUDE_PAIRS');
  if (!rawExclude || String(rawExclude).trim().toLowerCase() === 'btc_jpy') {
    p.setProperty('J_EXCLUDE_PAIRS', (J_CONFIG.EXCLUDE_PAIRS || []).join(','));
  }
  SpreadsheetApp.getUi().alert(
    '既定プロパティを設定しました\n' +
      'DRY_RUN=true\nPAPER_JPY=' +
      J_CONFIG.PAPER_JPY_DEFAULT +
      '\nMIN_LEVEL_JPY=' +
      J_CONFIG.MIN_LEVEL_JPY +
      '\nMAX_ACTIVE_PAIRS=' +
      J_CONFIG.MAX_ACTIVE_PAIRS +
      '\nMIN_GRID_LEVELS=' +
      J_CONFIG.MIN_GRID_LEVELS +
      '\nBTC_RESERVE_AMOUNT=' +
      J_CONFIG.BTC_RESERVE_AMOUNT +
      '（この数量までは売却しない）\nJ_EXCLUDE_PAIRS=' +
      ((J_CONFIG.EXCLUDE_PAIRS || []).join(',') || '(空)') +
      '\n\n手数料は TradingFees.gs（公式表）を参照'
  );
}

function jInitSheetsMenu() {
  jInitSheets_();
  jLog_('シート初期化完了');
  SpreadsheetApp.getUi().alert('J_運用ログ / J_売買履歴 を用意しました');
}

function jInstallTrigger() {
  if (jIsValidationPaused_()) {
    SpreadsheetApp.getUi().alert('検証停止中のためトリガーは設置しません。\n再開: VALIDATION_PAUSED=false');
    return;
  }
  jRemoveTrigger();
  ScriptApp.newTrigger('jRunOnce').timeBased().everyMinutes(5).create();
  jLog_('5分トリガーを設置しました');
  SpreadsheetApp.getUi().alert('5分ごとに jRunOnce が動きます');
}

function jRemoveTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'jRunOnce') ScriptApp.deleteTrigger(t);
  });
}

function jReconcilePairLists_(global, pair) {
  var st = jLoadState_(pair);
  if (st.mode === 'active') {
    if (global.dormantPairs.indexOf(pair) >= 0) {
      global.dormantPairs = global.dormantPairs.filter(function (p) {
        return p !== pair;
      });
    }
    if (global.activePairs.indexOf(pair) < 0) global.activePairs.push(pair);
  } else if (st.mode === 'dormant') {
    if (global.activePairs.indexOf(pair) >= 0) {
      global.activePairs = global.activePairs.filter(function (p) {
        return p !== pair;
      });
    }
    if (global.dormantPairs.indexOf(pair) < 0) global.dormantPairs.push(pair);
  }
}

function jRunToraripiAndLog_(pair, cfg, global) {
  var result = jRunToraripiForPair_(pair, cfg, global);
  jReconcilePairLists_(global, pair);
  var state = jLoadState_(pair);
  var assets = jGetAssetsForPair_(pair, cfg, global);
  var ticker = jGetTicker_(pair);
  if (jShouldAppendRunLog_(global, cfg, result.active)) {
    jAppendRunLog_(pair, ticker, assets, state, result.note);
    global.lastRunLogAt = new Date().toISOString();
  }
  return result;
}

function jRunOnceMenu() {
  if (jIsValidationPaused_()) {
    SpreadsheetApp.getUi().alert('VALIDATION_PAUSED=true のためスキップ');
    return;
  }
  var summary = jRunOnceCore_();
  SpreadsheetApp.getUi().alert(summary);
}

/**
 * トリガーから呼ばれる本体（UIなし）
 */
function jRunOnce() {
  if (jIsValidationPaused_()) {
    jLog_('検証停止中 — スキップ');
    return;
  }
  jRunOnceCore_();
}

function jRunOnceCore_() {
  var cfg = jGetConfig_();
  var global = jLoadGlobalState_();
  var errors = [];
  var anyActivity = false;

  try {
    jSyncInstrumentsFromApi_();
    jInitSheets_();
    if (cfg.dryRun) jInitPaperWallet_(global, cfg);

    var pairsSeen = {};
    var runList = [];

    global.dormantPairs.forEach(function (p) {
      if (!pairsSeen[p]) {
        runList.push(p);
        pairsSeen[p] = true;
      }
    });
    global.activePairs.forEach(function (p) {
      if (!pairsSeen[p]) {
        runList.push(p);
        pairsSeen[p] = true;
      }
    });

    jLog_(
      '実行開始 DRY_RUN=' +
        cfg.dryRun +
        ' active=' +
        global.activePairs.length +
        ' dormant=' +
        global.dormantPairs.length
    );

    runList.forEach(function (pair) {
      try {
        var result = jRunToraripiAndLog_(pair, cfg, global);
        if (result.active) anyActivity = true;
      } catch (e) {
        errors.push(pair + ': ' + (e.message || e));
        jLog_('ERROR ' + pair + ': ' + (e.message || e));
      }
    });

    var added = [];
    try {
      added = jTryActivateNewPairs_(cfg, global);
    } catch (e2) {
      errors.push('activate: ' + (e2.message || e2));
      jLog_('ERROR activate: ' + (e2.message || e2));
    }

    added.forEach(function (pair) {
      try {
        var r2 = jRunToraripiAndLog_(pair, cfg, global);
        if (r2.active) anyActivity = true;
      } catch (e3) {
        errors.push(pair + ': ' + (e3.message || e3));
        jLog_('ERROR ' + pair + ': ' + (e3.message || e3));
      }
    });

    global.lastRunAt = new Date().toISOString();
    global.lastError = errors.length ? errors.join('; ') : null;
    jSaveGlobalState_(global);

    var w = global.paperWallet;
    var paperLine = '';
    if (cfg.dryRun && w) {
      paperLine =
        '\n紙トレ JPY=' +
        Math.round(w.jpy) +
        ' 損益=' +
        Math.round(w.jpy - w.initial);
    }

    var summary =
      '完了\n' +
      'アクティブ: ' +
      (global.activePairs.join(', ') || 'なし') +
      '\n休眠: ' +
      (global.dormantPairs.join(', ') || 'なし') +
      (added.length ? '\n新規: ' + added.join(', ') : '') +
      paperLine +
      (errors.length ? '\n\nエラー:\n' + errors.join('\n') : '');

    jLog_(summary.replace(/\n/g, ' | '));
    return summary;
  } catch (err) {
    global.lastError = String(err.message || err);
    jSaveGlobalState_(global);
    jLog_('ERROR: ' + global.lastError);
    throw err;
  }
}

/** エディタから手数料計算テスト */
function jTestTradingFees() {
  var pair = 'trx_jpy';
  var price = 50;
  var amount = jResolveLevelAmount_(pair, price, 1000);
  var round = jCalcTrapRoundProfit_(pair, price, 0.92, amount, 'maker');
  Logger.log(
    pair +
      ' amount=' +
      amount +
      ' maker round net=' +
      round.netJpy +
      ' fees=' +
      JSON.stringify(jGetSpotTradingFees_(pair))
  );
}
