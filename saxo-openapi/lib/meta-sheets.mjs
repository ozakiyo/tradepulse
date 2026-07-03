import { G_SAXO_TEAM } from './gsaxo-instruments.mjs';
import { callMetaGas_, isMetaGasConfigured_, pingMetaGas_ } from './meta-gas-client.mjs';

function formatTsJst() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date());
}

/** @deprecated GAS Webアプリ方式では不要。互換のため残す */
export function metaSpreadsheetId_() {
  return process.env.META_SPREADSHEET_ID?.trim() || '';
}

export async function reportToMeta_({
  period,
  tradeCount,
  winRate,
  pf,
  netPnlPct,
  avgHoldH,
  recommendation,
  team = G_SAXO_TEAM,
}) {
  if (!isMetaGasConfigured_()) {
    return { ok: false, skipped: true, reason: 'GSAXO_META_WEBAPP_URL / GSAXO_META_SECRET 未設定' };
  }

  const pnlCell =
    typeof netPnlPct === 'number' ? `${netPnlPct.toFixed(3)}%` : String(netPnlPct ?? '-');

  const result = await callMetaGas_({
    action: 'report',
    time: formatTsJst(),
    team,
    period,
    tradeCount,
    winRate,
    pf,
    netPnlPct,
    netPnl: pnlCell,
    avgHoldH,
    recommendation,
  });

  return { ok: true, period: result.period || period };
}

export async function testMetaConnection_() {
  return pingMetaGas_();
}
