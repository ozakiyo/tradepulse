import {
  buildMarketOrder,
  placeSimOrder,
  precheckOrder,
  saxoRequest,
} from './saxo.mjs';
import { getPairState_ } from './gsaxo-state.mjs';

export function initLiveBaseline_(state, equity) {
  if (!state.liveBaseline && equity > 0) {
    state.liveBaseline = equity;
  }
}

export async function getGsaxoBalances_(saxoCfg, accountKey) {
  const params = new URLSearchParams();
  if (accountKey) params.set('AccountKey', accountKey);
  return saxoRequest(saxoCfg, 'GET', `/port/v1/balances/me?${params}`);
}

export async function getGsaxoLiveAssets_(saxoCfg, accountKey) {
  const bal = await getGsaxoBalances_(saxoCfg, accountKey);
  const marginUtil = Number(bal.MarginUtilizationPct ?? 0);
  let marginCallStatus = 'NORMAL';
  if (marginUtil >= 100) marginCallStatus = 'MARGIN_CALL';
  else if (marginUtil >= 85) marginCallStatus = 'WARNING';

  const equity = Number(bal.NetEquityForMargin ?? bal.TotalValue ?? 0);
  return {
    jpy: Number(bal.MarginAvailableForTrading ?? bal.CashBalance ?? 0),
    reserved: Math.abs(Number(bal.MarginUsedByCurrentPositions ?? 0)),
    equity,
    marginUtilizationPct: marginUtil,
    marginCallStatus,
    currency: bal.Currency || 'JPY',
    paper: false,
  };
}

export async function listGsaxoNetPositions_(saxoCfg, accountKey) {
  const params = new URLSearchParams({
    FieldGroups: 'NetPositionBase,NetPositionView,DisplayAndFormat',
  });
  if (accountKey) params.set('AccountKey', accountKey);
  const data = await saxoRequest(saxoCfg, 'GET', `/port/v1/netpositions/me?${params}`);
  return data?.Data || [];
}

/** Saxo NetPosition: Amount>0=ロング, Amount<0=ショート（BuySell は無いことが多い） */
export function mapNetPositionToGsaxo_(row) {
  const base = row.NetPositionBase || row;
  const view = row.NetPositionView || {};
  const uic = base.Uic ?? base.AssetId;
  const rawAmount = Number(base.Amount ?? view.Amount ?? view.Exposure ?? 0);
  const units = Math.abs(rawAmount);
  let side;
  if (rawAmount < 0) {
    side = 'short';
  } else if (rawAmount > 0) {
    side = 'long';
  } else {
    const dir = String(base.BuySell || view.BuySell || base.OpeningDirection || 'Buy');
    side = dir === 'Sell' ? 'short' : 'long';
  }
  return {
    positionId: row.NetPositionId ?? row.PositionId,
    uic,
    assetType: base.AssetType,
    side,
    units,
    entryPrice: Number(view.AverageOpenPrice ?? view.OpenPrice ?? base.OpenPrice ?? 0),
  };
}

export function gsaxoPositionFromNet_(net, prev) {
  return {
    side: net.side,
    units: net.units,
    entryPrice: net.entryPrice > 0 ? net.entryPrice : prev?.entryPrice || 0,
    entryAt: prev?.entryAt || new Date().toISOString(),
    h1PartialDone: prev?.h1PartialDone || false,
    positionId: net.positionId,
  };
}

export async function findGsaxoNetByUic_(saxoCfg, accountKey, uic) {
  const rows = await listGsaxoNetPositions_(saxoCfg, accountKey);
  for (const row of rows) {
    const p = mapNetPositionToGsaxo_(row);
    if (p.uic === uic && p.units > 0) return p;
  }
  return null;
}

export async function findGsaxoPosition_(saxoCfg, accountKey, uic, side, units) {
  const net = await findGsaxoNetByUic_(saxoCfg, accountKey, uic);
  if (!net) return null;
  if (net.side !== side) return net;
  if (Math.abs(net.units - units) <= Math.max(units * 0.02, 0.001)) return net;
  return net;
}

export function gsaxoOrderBuySell_(action, side) {
  if (action === '新規') return side === 'long' ? 'Buy' : 'Sell';
  return side === 'long' ? 'Sell' : 'Buy';
}

export async function placeGsaxoOrder_(saxoCfg, accountKey, resolved, inst, action, side, units, log) {
  const buySell = gsaxoOrderBuySell_(action, side);
  const order = buildMarketOrder({
    accountKey,
    uic: resolved.uic,
    assetType: resolved.assetType,
    amount: units,
    buySell,
  });
  await precheckOrder(saxoCfg, order);
  const result = await placeSimOrder(saxoCfg, order);
  const orderId = result.OrderId ?? result?.Data?.OrderId;
  log(`[LIVE] ${inst.label} ${action} ${side} ${buySell} x${units} OrderId=${orderId ?? '—'}`);
  return { orderId, result, buySell };
}

export async function syncGsaxoPosition_(pairId, ps, saxoCfg, accountKey, resolved, log) {
  if (!ps.position?.side) return;
  try {
    const found = await findGsaxoNetByUic_(saxoCfg, accountKey, resolved.uic);
    if (found) {
      const prev = ps.position;
      ps.position = gsaxoPositionFromNet_(found, prev);
      if (prev.side !== found.side) {
        log(`${pairId} 建玉方向修正 ${prev.side}→${found.side}`);
      }
      log(
        `${pairId} 建玉同期 ${found.side} x${found.units}` +
          (found.positionId ? ` positionId=${found.positionId}` : '')
      );
    } else {
      log(`${pairId} ローカル建玉クリア（Saxoに無し）`);
      ps.position = null;
    }
  } catch (e) {
    log(`${pairId} 建玉同期失敗: ${e.message}`);
  }
}

/** 起動時: Saxo 建玉をローカル state に反映 */
export async function syncAllGsaxoPositionsFromSaxo_(
  saxoCfg,
  accountKey,
  pairIds,
  state,
  resolvedMap,
  log
) {
  let rows;
  try {
    rows = await listGsaxoNetPositions_(saxoCfg, accountKey);
  } catch (e) {
    log(`建玉一覧取得失敗: ${e.message}`);
    return;
  }

  const byUic = new Map();
  for (const row of rows) {
    const p = mapNetPositionToGsaxo_(row);
    if (p.uic && p.units > 0) byUic.set(p.uic, p);
  }

  const uicToPair = {};
  for (const pairId of pairIds) {
    const r = resolvedMap[pairId];
    if (r?.uic) uicToPair[r.uic] = pairId;
  }

  for (const [uic, saxoPos] of byUic) {
    const pairId = uicToPair[uic];
    if (!pairId) continue;
    const ps = getPairState_(state, pairId);
    const prev = ps.position;
    ps.position = gsaxoPositionFromNet_(saxoPos, prev);
    if (prev?.side && prev.side !== saxoPos.side) {
      log(`${pairId} 建玉方向修正 ${prev.side}→${saxoPos.side}`);
    }
    log(
      `${pairId} 建玉復元 ${saxoPos.side} x${saxoPos.units}` +
        (saxoPos.positionId ? ` positionId=${saxoPos.positionId}` : '')
    );
  }

  for (const pairId of pairIds) {
    const ps = getPairState_(state, pairId);
    if (!ps.position?.side) continue;
    const uic = resolvedMap[pairId]?.uic;
    if (uic && !byUic.has(uic)) {
      log(`${pairId} ローカル建玉クリア（Saxoに無し）`);
      ps.position = null;
    }
  }
}
