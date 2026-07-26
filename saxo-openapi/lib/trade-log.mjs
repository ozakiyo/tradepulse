import { appendFile, mkdir, readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_LOG = join(__dirname, '..', '..', 'data', 'gsaxo-trades.jsonl');
const DEFAULT_TREND_LOG = join(__dirname, '..', '..', 'data', 'gsaxo-trend-trades.jsonl');

export function gsaxoTradeLogPath_() {
  return process.env.GSAXO_TRADE_LOG_PATH?.trim() || DEFAULT_LOG;
}

export function gsaxoTrendTradeLogPath_() {
  return process.env.GSAXO_TREND_TRADE_LOG_PATH?.trim() || DEFAULT_TREND_LOG;
}

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

export async function appendTradeLog_(pairId, inst, sideLabel, price, units, memo) {
  return appendTradeLogToPath_(gsaxoTradeLogPath_(), pairId, inst, sideLabel, price, units, memo);
}

export async function appendTrendTradeLog_(pairId, inst, sideLabel, price, units, memo) {
  return appendTradeLogToPath_(
    gsaxoTrendTradeLogPath_(),
    pairId,
    inst,
    sideLabel,
    price,
    units,
    memo
  );
}

async function appendTradeLogToPath_(logPath, pairId, inst, sideLabel, price, units, memo) {
  const row = {
    time: formatTsJst(),
    symbol: inst.label || pairId,
    pairId,
    side: sideLabel,
    price,
    amount: units,
    memo: memo || '',
  };
  await mkdir(dirname(logPath), { recursive: true });
  await appendFile(logPath, `${JSON.stringify(row)}\n`, 'utf8');
  return row;
}

export async function readTrendTradeRows_() {
  const path = gsaxoTrendTradeLogPath_();
  try {
    const raw = await readFile(path, 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

export async function readAllTradeRows_() {
  const path = gsaxoTradeLogPath_();
  try {
    const raw = await readFile(path, 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}
