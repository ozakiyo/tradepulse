/**
 * 幅内に買い指値を梯立て（1本あたり固定 BTC ロット）。保有があればトレール売り。
 */
function bbRunToraripi_(ticker, assets, cfg, state, modeTag) {
  var last = ticker.last;
  var width =
    modeTag === 'toraripi_full' ? cfg.toraripiWidthFull : cfg.toraripiWidthHalf;
  var levels = modeTag === 'toraripi_full' ? cfg.gridLevelsFull : cfg.gridLevelsHalf;
  var btcPerLevel =
    modeTag === 'toraripi_full' ? cfg.btcPerLevelFull : cfg.btcPerLevelHalf;
  var amount = bbFormatBtc_(btcPerLevel);
  if (amount < BB_CONFIG.MIN_BTC_AMOUNT) {
    bbLog_('BTC_PER_LEVEL が最小数量未満: ' + btcPerLevel);
    return;
  }

  bbCancelAllOrders_(cfg);

  var step = width / Math.max(levels - 1, 1);
  var placed = 0;
  for (var i = 0; i < levels; i++) {
    var buyPrice = Math.round(last - width + step * i);
    if (buyPrice <= 0) continue;
    var needJpy = buyPrice * amount * 1.02;
    if (assets.jpy < needJpy) {
      bbLog_('JPY不足のため買い停止（必要約' + Math.round(needJpy) + '円 残' + assets.jpy + '）');
      break;
    }
    bbPlaceLimit_('buy', buyPrice, amount, cfg);
    bbAppendTradeLog_('買い', buyPrice, amount, modeTag);
    placed += 1;
  }
  bbLog_(
    modeTag +
      ' 買いグリッド ' +
      placed +
      ' 本（幅' +
      width +
      '円・' +
      amount +
      ' BTC/本）'
  );

  if (assets.btc >= BB_CONFIG.MIN_BTC_AMOUNT) {
    bbPlaceToraripiTrailSell_(ticker, assets, cfg, state);
  }

  state.mode = modeTag;
  state.trailHigh = state.trailHigh || last;
}

function bbPlaceToraripiTrailSell_(ticker, assets, cfg, state) {
  var last = ticker.last;
  if (!state.trailHigh || last > state.trailHigh) state.trailHigh = last;

  var activate = state.trailHigh * (1 + cfg.trailActivatePct / 100);
  if (last < activate) return;

  var sellPrice = Math.round(state.trailHigh * (1 - cfg.trailCallbackPct / 100));
  var amount = bbFormatBtc_(assets.btc);
  if (amount < BB_CONFIG.MIN_BTC_AMOUNT) return;

  bbPlaceLimit_('sell', sellPrice, amount, cfg);
  bbAppendTradeLog_('売り', sellPrice, amount, 'トレール');
  bbLog_('トレール売り price=' + sellPrice + ' amount=' + amount + ' trailHigh=' + state.trailHigh);
}
