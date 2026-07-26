import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_STATE_PATH = join(__dirname, '..', '..', 'data', 'gsaxo-state.json');

export function gsaxoStatePath_() {
  return process.env.GSAXO_STATE_PATH?.trim() || DEFAULT_STATE_PATH;
}

export async function loadGsaxoState() {
  const path = gsaxoStatePath_();
  try {
    const raw = await readFile(path, 'utf8');
    const s = JSON.parse(raw);
    if (!s.pairs) s.pairs = {};
    return s;
  } catch (e) {
    if (e.code === 'ENOENT') {
      return { pairs: {}, paperWallet: null, lastRunAt: null, lastError: null };
    }
    throw e;
  }
}

export async function saveGsaxoState(state) {
  const path = gsaxoStatePath_();
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await rename(tmp, path);
}

export function getPairState_(state, pairId) {
  if (!state.pairs[pairId]) {
    state.pairs[pairId] = {
      position: null,
      trendPosition: null,
      lastSignal: '',
      lastTrendSignal: '',
      lastDailyNote: '',
      lastH1Note: '',
      lastTrendDailyNote: '',
      lastTrendH1Note: '',
      trendStopWatch: null,
    };
  }
  return state.pairs[pairId];
}

export function countTrendOpenPositions_(state) {
  let n = 0;
  for (const pairId of Object.keys(state.pairs || {})) {
    const pos = state.pairs[pairId].trendPosition;
    if (pos?.side && pos.units > 0) n += 1;
  }
  return n;
}

export function countOpenPositions_(state) {
  let n = 0;
  for (const pairId of Object.keys(state.pairs || {})) {
    const pos = state.pairs[pairId].position;
    if (pos?.side && pos.units > 0) n += 1;
  }
  return n;
}

/** 日足損切後、同一銘柄の新規エントリーを止める（ms タイムスタンプ） */
export function applyDailyStopCooldown_(ps, cooldownHours) {
  if (!cooldownHours || cooldownHours <= 0) return;
  ps.dailyStopCooldownUntil = Date.now() + cooldownHours * 3600 * 1000;
}

/** @returns {{ remainH: number } | null} */
export function getDailyStopCooldownBlock_(ps, cooldownHours) {
  if (!cooldownHours || cooldownHours <= 0) return null;
  const until = ps.dailyStopCooldownUntil;
  if (!until || until <= Date.now()) return null;
  const remainH = Math.max(1, Math.ceil((until - Date.now()) / 3600000));
  return { remainH };
}
