/**
 * TEAM-K 戦略本体
 * 戻り局面 BUY → 手数料考慮の純益目標で利確 → 再BUY
 * 塩漬け: 枠解放のみ。position/tpPrice は残し、価格復帰で利確
 * 同一銘柄: ポジション残でも戻りentry可なら休眠解除→同サイクルで再BUY可
 * 長期↓除外: 新規選定・新規BUYのみ禁止。保有分を長期除外休眠には入れない
 * レンジ上限: 枠を空け他銘柄へ（ポジションあれば利確設定は保持）
 */

/** 純益 TARGET_NET_JPY を満たす利確価格（フォールバック用ラッパ） */
function kCalcTakeProfitPriceForEntry_(pair, buyPrice, amount, cfg) {
  return kCalcNetTargetTakeProfitPrice_(pair, buyPrice, amount, cfg);
}

function kPositionDrawdownPct_(buyPrice, last) {
  if (!buyPrice || buyPrice <= 0) return 0;
  return ((buyPrice - last) / buyPrice) * 100;
}

function kMarkDormant_(pair, state, global, reason) {
  state.mode = 'dormant';
  state.regimeNote = reason || '';
  var ai = global.activePairs.indexOf(pair);
  if (ai >= 0) global.activePairs.splice(ai, 1);
  if (global.dormantPairs.indexOf(pair) < 0) global.dormantPairs.push(pair);
  kSaveState_(pair, state);
  kLog_(pair + ' 休眠: ' + reason + (state.position ? ' 塩漬け保有中(TP維持)' : ''));
}

/**
 * 休眠解除（ポジション有無問わず）
 * ダウン解除済み かつ 戻りentry可。長期除外は新規BUYのみ別途禁止
 */
function kTryWakeFromDormant_(pair, state, global, cfg, up, longTerm) {
  if (state.mode !== 'dormant') return false;
  if (!kCanWakeForEntry_(up)) return false;
  if (longTerm.excluded) return false;
  var di = global.dormantPairs.indexOf(pair);
  if (di >= 0) global.dormantPairs.splice(di, 1);
  var maxActive = cfg.maxActivePairs || K_CONFIG.MAX_ACTIVE_PAIRS;
  if (global.activePairs.indexOf(pair) < 0 && global.activePairs.length < maxActive) {
    global.activePairs.push(pair);
  }
  state.mode = 'active';
  kLog_(
    pair +
      ' 休眠解除→再稼働 (' +
      (up.regimeComment || kRegimeCommentJa_(up.regime, up.isDailyDown)) +
      ')' +
      (state.position ? ' 保有継続+再BUY可' : '')
  );
  return true;
}

/** 新規BUYをポジションへ反映（未保有なら新規、保有中なら平均取得＋TP再計算） */
function kApplyBuyToPosition_(pair, state, buyPrice, amount, cfg, buyOrderId) {
  var tpInfo;
  var oid = buyOrderId != null ? String(buyOrderId) : '';
  if (!state.position) {
    tpInfo = kCalcTakeProfitPriceForEntry_(pair, buyPrice, amount, cfg);
    state.position = {
      buyPrice: buyPrice,
      amount: amount,
      tpPrice: tpInfo.sellPrice,
      targetNetJpy: tpInfo.targetNetJpy,
      expectedNetJpy: tpInfo.expectedNetJpy,
      at: new Date().toISOString(),
      buyOrderId: oid,
    };
  } else {
    var prev = state.position;
    var totalAmt = prev.amount + amount;
    var avg = (prev.buyPrice * prev.amount + buyPrice * amount) / totalAmt;
    tpInfo = kCalcTakeProfitPriceForEntry_(pair, avg, totalAmt, cfg);
    // 塩漬け中に付け足す場合も、既存TPより不利にならないよう高い方を採用
    var sellPrice = Math.max(Number(prev.tpPrice) || 0, tpInfo.sellPrice);
    state.position = {
      buyPrice: avg,
      amount: totalAmt,
      tpPrice: sellPrice,
      targetNetJpy: tpInfo.targetNetJpy,
      expectedNetJpy: tpInfo.expectedNetJpy,
      at: prev.at || new Date().toISOString(),
      lastAddAt: new Date().toISOString(),
      buyOrderId: prev.buyOrderId || oid,
      lastBuyOrderId: oid || prev.lastBuyOrderId || '',
    };
  }
  return tpInfo;
}

/**
 * 幽霊ポジ解消: state.position があるのに残高が minAmount 未満
 * （紙ウォレット不整合・途中リセット等）。枠を塞いだままになるのを防ぐ。
 * 本番は未約定の可能性があるため、dryRun または opts.force のときだけ解消。
 * @return {boolean} 解消したか
 */
function kHealGhostPosition_(pair, state, assets, opts) {
  opts = opts || {};
  if (!state || !state.position) return false;
  var cfg = kGetConfig_();
  if (!opts.force && !cfg.dryRun) return false;
  var coin = assets && assets.coin != null ? Number(assets.coin) : 0;
  var inst = kGetInstrument_(pair);
  var minAmt = inst && inst.minAmount != null ? Number(inst.minAmount) : 0;
  if (coin >= minAmt && coin > 0) return false;
  var prev = state.position;
  kLog_(
    pair +
      ' 幽霊ポジ解消: buy=' +
      prev.buyPrice +
      ' tp=' +
      prev.tpPrice +
      ' amt=' +
      prev.amount +
      ' 残高=' +
      coin +
      ' → positionクリア'
  );
  state.position = null;
  return true;
}

/** 全銘柄の幽霊ポジを走査して解消（メニュー用・force） */
function kClearGhostPositions_() {
  var cfg = kGetConfig_();
  var global = kLoadGlobalState_();
  var cleared = [];
  var pairs = {};
  (global.activePairs || []).forEach(function (p) {
    pairs[p] = true;
  });
  (global.dormantPairs || []).forEach(function (p) {
    pairs[p] = true;
  });
  var allProps = PropertiesService.getScriptProperties().getProperties();
  Object.keys(allProps).forEach(function (k) {
    if (k.indexOf('K_S_') === 0) {
      pairs[k.slice(4)] = true;
    }
  });
  Object.keys(pairs).forEach(function (pair) {
    if (!pair || pair.indexOf('_') < 0) return;
    var state = kLoadState_(pair);
    if (!state.position) return;
    var assets = kGetAssetsForPair_(pair, cfg, global);
    if (kHealGhostPosition_(pair, state, assets, { force: true })) {
      kSaveState_(pair, state);
      cleared.push(pair);
    }
  });
  kSaveGlobalState_(global);
  return cleared;
}

function kRunPairOnce_(pair, cfg, global) {
  cfg = cfg || kGetConfig_();
  var state = kLoadState_(pair);
  var ticker = kGetTicker_(pair);
  var longTerm = kEvaluateLongTermRegime_(pair, cfg);
  var up = kEvaluateUpRegime_(pair, cfg);
  var assets = kGetAssetsForPair_(pair, cfg, global);
  var activity = false;

  // 0) 紙トレ: 幽霊ポジ（state残・残高0）を先に解消 → 以降のBUY判定が通る
  if (kHealGhostPosition_(pair, state, assets)) {
    activity = true;
  }

  // 1) 利確は常に最優先（塩漬け中も tpPrice 維持・価格復帰で決済）
  if (state.position) {
    var tp =
      state.position.tpPrice ||
      kCalcTakeProfitPriceForEntry_(pair, state.position.buyPrice, state.position.amount, cfg)
        .sellPrice;
    if (ticker.last >= tp) {
      var amt = kFormatAmount_(pair, Math.min(state.position.amount, assets.coin));
      var inst = kGetInstrument_(pair);
      // 取引所で先に約定して残高が減っている場合も運用損益を記録
      if (amt < inst.minAmount && Number(state.position.amount) >= inst.minAmount) {
        amt = kFormatAmount_(pair, Number(state.position.amount));
        kAppendLotProfit_(pair, state.position, tp, amt, cfg, state.position.sellOrderId || '');
        kAppendTradeLog_(pair, '売り', tp, amt, '利確約定検知(残高減)');
        state.position = null;
        state.lastSellAt = new Date().toISOString();
        activity = true;
        assets = kGetAssetsForPair_(pair, cfg, global);
        kLog_(pair + ' 利確約定検知(残高減) ' + tp);
      } else if (amt >= inst.minAmount) {
        var sellResp = kPlaceLimit_(pair, 'sell', tp, amt, cfg);
        if (cfg.dryRun) {
          kApplyPaperTrade_(global, pair, 'sell', tp, amt, cfg.feeRoleProfit);
        }
        var sellOid = sellResp && sellResp.order_id != null ? String(sellResp.order_id) : '';
        kAppendLotProfit_(pair, state.position, tp, amt, cfg, sellOid);
        var targetNet = cfg.targetNetJpy != null ? cfg.targetNetJpy : K_CONFIG.TARGET_NET_JPY;
        kAppendTradeLog_(pair, '売り', tp, amt, '利確 目標純益' + targetNet + '円');
        state.position = null;
        state.lastSellAt = new Date().toISOString();
        activity = true;
        assets = kGetAssetsForPair_(pair, cfg, global);
        kLog_(pair + ' 利確 ' + tp);
      }
    } else {
      // 未達: 日足悪化/含み損/レンジ上限なら枠だけ空けて休眠（長期除外スリープにはしない）
      var dd = kPositionDrawdownPct_(state.position.buyPrice, ticker.last);
      var saltByDd = dd >= (cfg.saltDrawdownPct || K_CONFIG.SALT_DRAWDOWN_PCT);
      var saltByWeak = kIsDailyWeakForSalt_(up);
      var rotateUpper = kShouldRotateAway_(up);
      if (saltByDd || saltByWeak || rotateUpper) {
        var why = rotateUpper
          ? 'レンジ上限→移行 '
          : saltByDd
            ? '含み損' + Math.round(dd * 10) / 10 + '% '
            : '日足悪化 ';
        if (state.mode !== 'dormant') {
          kMarkDormant_(pair, state, global, why + up.note);
        }
      }
    }
  }

  // 2) 長期↓: 新規BUYのみ禁止（保有はTP監視継続。長期除外休眠には入れない）
  //    ランキング側でも除外済み。ここでは追加BUYを止めるだけ。

  // 3) レンジ上限・ポジションなし: 枠を空けて他銘柄へ
  if (!state.position && kShouldRotateAway_(up) && state.mode !== 'dormant') {
    kMarkDormant_(pair, state, global, 'レンジ上限→移行 ' + up.note);
    state.lastRunAt = new Date().toISOString();
    kSaveState_(pair, state);
    return { active: false, note: 'レンジ上限移行' };
  }

  // 4) 休眠解除 — entry可（上限帯外）なら復帰。ポジション残でもOK
  var woke = kTryWakeFromDormant_(pair, state, global, cfg, up, longTerm);
  if (woke) activity = true;

  // 5) BUY: 押し目判定なし。日足上限帯以外かつ日足ダウン以外（allowEntry）。長期↓は禁止
  //    すでに active 保有中の通常運用では利確まで追加しない（復帰時のみポジション残で再BUY可）
  var canBuy = !state.position || woke;
  if (canBuy && up.allowEntry && state.mode !== 'dormant' && !longTerm.excluded) {
    var priPair = (cfg.priorityPair || K_CONFIG.PRIORITY_PAIR || 'btc_jpy').toLowerCase();
    var liqOk = true;
    if (pair !== priPair) {
      var liqBuy = kCheckLiquidity_(pair, cfg, ticker);
      if (!liqBuy.ok) {
        liqOk = false;
        kLog_(pair + ' BUY見送り 流動性: ' + liqBuy.reason);
      }
    }
    if (liqOk) {
      var entryJpy = cfg.entryJpy != null ? cfg.entryJpy : K_CONFIG.ENTRY_JPY;
      var buyPrice = ticker.last;
      var need = kCalcEntryNeedJpy_(pair, buyPrice, entryJpy, cfg.feeRoleCapital);
      var amount = need.amount;
      if (assets.jpy >= need.needJpy) {
        var buyResp = kPlaceLimit_(pair, 'buy', buyPrice, amount, cfg);
        if (cfg.dryRun) {
          kApplyPaperTrade_(global, pair, 'buy', buyPrice, amount, cfg.feeRoleProfit);
        }
        var buyOid = buyResp && buyResp.order_id != null ? String(buyResp.order_id) : '';
        var tpInfo = kApplyBuyToPosition_(pair, state, buyPrice, amount, cfg, buyOid);
        state.mode = 'active';
        state.lastBuyAt = new Date().toISOString();
        activity = true;
        kAppendTradeLog_(
          pair,
          '買い',
          buyPrice,
          amount,
          up.note +
            ' need=' +
            need.needJpy +
            ' 目標純益' +
            tpInfo.targetNetJpy +
            '円' +
            (tpInfo.buyRole ? ' fee=' + tpInfo.buyRole + '/' + tpInfo.sellRole : '') +
            (state.position && state.position.lastAddAt ? ' 付け足し' : '')
        );
        kLog_(
          pair +
            ' BUY ' +
            buyPrice +
            ' TP=' +
            state.position.tpPrice +
            ' 想定純益≈' +
            tpInfo.expectedNetJpy +
            '円 need=' +
            need.needJpy +
            ' amt合計=' +
            state.position.amount
        );
      } else {
        kLog_(pair + ' BUY見送り need=' + need.needJpy + ' jpy=' + Math.round(assets.jpy));
      }
    }
  }

  state.regimeNote = up.note + (longTerm.note ? ' | ' + longTerm.note : '');
  state.lastRunAt = new Date().toISOString();
  kSaveState_(pair, state);

  if (kShouldAppendRunLog_(global, cfg, activity)) {
    kAppendRunLog_(pair, ticker, assets, state, state.regimeNote);
    global.lastRunLogAt = new Date().toISOString();
  }
  return { active: activity || state.mode === 'active' || !!state.position, note: up.note };
}
