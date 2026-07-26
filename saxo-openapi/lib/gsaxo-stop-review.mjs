import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getChartCandlesAtTime_, getChartCandlesFromTime_ } from './chart-data.mjs';
import { getYahooCandles1h_, yahooSymbolForPair_ } from './yahoo-chart.mjs';
import { loadGsaxoConfig } from './gsaxo-config.mjs';
import { gsaxoGetRangeCfg_, G_SAXO_INSTRUMENTS } from './gsaxo-instruments.mjs';
import { loadGsaxoState } from './gsaxo-state.mjs';
import { detectDailyRange_, detectH1Range_ } from './range-detect.mjs';
import { resolveAccountKey, resolveInstrumentByDef, resolveSaxoConfig } from './saxo.mjs';
import { readAllTradeRows_ } from './trade-log.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = join(__dirname, '..', '..', 'data', 'gsaxo-stop-review.html');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const getNum = (key, fallback) => {
    const hit = args.find((a) => a.startsWith(`--${key}=`));
    if (!hit) return fallback;
    const v = Number(hit.split('=')[1]);
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    days: getNum('days', 30),
    bars: getNum('bars', 72),
    dailyOnly: args.includes('--daily-only'),
    listOnly: args.includes('--list'),
    noFetch: args.includes('--no-fetch'),
    yahoo: args.includes('--yahoo') || args.includes('--source=yahoo'),
    center: args.includes('--center'),
    fromDate: args.find((a) => a.startsWith('--from='))?.split('=').slice(1).join('=') || '',
    toDate: args.find((a) => a.startsWith('--to='))?.split('=').slice(1).join('=') || '',
    stopsFile:
      args.find((a) => a.startsWith('--stops='))?.split('=').slice(1).join('=') || '',
    fromHtml:
      args.find((a) => a.startsWith('--from-html='))?.split('=').slice(1).join('=') || '',
    out: args.find((a) => a.startsWith('--out='))?.split('=').slice(1).join('=') || DEFAULT_OUT,
  };
}

function splitBarCounts_(totalBars, center = false) {
  if (center) {
    const half = Math.max(1, Math.floor(totalBars / 2));
    return { beforeBars: half, afterBars: half };
  }
  const beforeBars = Math.max(1, Math.round(totalBars / 3));
  const afterBars = Math.max(1, totalBars - beforeBars);
  return { beforeBars, afterBars };
}

function mergeCandlesByTime_(a, b) {
  const byTime = new Map();
  for (const c of [...a, ...b]) byTime.set(c.time, c);
  return [...byTime.values()].sort((x, y) => x.time - y.time);
}

function findStopBarIndex_(candles, stopMs) {
  if (!candles.length) return 0;
  let idx = candles.findIndex((c) => c.time >= stopMs);
  if (idx < 0) idx = candles.length - 1;
  return idx;
}

export async function loadStopsFromHtml_(htmlPath) {
  const html = await readFile(htmlPath, 'utf8');
  const start = html.indexOf('const DATA = ') + 'const DATA = '.length;
  const end = html.indexOf(';\n\n    document', start);
  if (start < 0 || end < 0) throw new Error(`DATA ブロックが見つかりません: ${htmlPath}`);
  const data = JSON.parse(html.slice(start, end));
  return (data.charts || []).map((ch, i) => ({
    time: ch.time,
    pairId: ch.pairId,
    symbol: ch.label,
    side: ch.side,
    price: ch.price,
    amount: ch.amount,
    memo: ch.memo,
    id: `s${i}`,
  }));
}

async function fetchWindowCandles_(saxoCfg, resolved, pairId, stopMs, beforeBars, afterBars, useYahoo) {
  const timeIso = new Date(stopMs).toISOString();
  const hourMs = 3600 * 1000;

  if (useYahoo || !saxoCfg) {
    const fromMs = stopMs - beforeBars * hourMs;
    const toMs = stopMs + afterBars * hourMs;
    const all = await getYahooCandles1h_(pairId, fromMs, toMs);
    const before = all.filter((c) => c.time <= stopMs);
    const after = all.filter((c) => c.time >= stopMs);
    return {
      before: before.slice(-beforeBars),
      after: after.slice(0, afterBars),
      source: 'yahoo',
    };
  }

  const [before, after] = await Promise.all([
    getChartCandlesAtTime_(saxoCfg, resolved.uic, resolved.assetType, 60, timeIso, beforeBars),
    getChartCandlesFromTime_(saxoCfg, resolved.uic, resolved.assetType, 60, timeIso, afterBars),
  ]);
  return { before, after, source: 'saxo' };
}

/** @param {string} jst "2026-06-22 14:30:00" */
export function jstTradeTimeToIso_(jst) {
  return new Date(`${jst.replace(' ', 'T')}+09:00`).toISOString();
}

export function isStopTradeRow_(row) {
  const memo = String(row.memo || '');
  return memo.includes('損切');
}

export function isDailyStopRow_(row) {
  return String(row.memo || '').includes('日足損切');
}

function positionSideFromRow_(row) {
  const side = String(row.side || '');
  if (side.includes('ロング')) return 'long';
  if (side.includes('ショート')) return 'short';
  return null;
}

function tradingViewSymbol_(pairId) {
  const def = G_SAXO_INSTRUMENTS[pairId];
  if (!def) return null;
  const kw = String(def.searchKeyword || '').toUpperCase();
  if (!kw) return null;
  if (def.category === 'metal') return `OANDA:XAUUSD`;
  if (def.category === 'index') return null;
  return `OANDA:${kw}`;
}

function findTrendSample_(state, pairId, stopMs) {
  const samples = state?.pairs?.[pairId]?.trendAuto?.samples || [];
  if (!samples.length) return null;
  let best = null;
  let bestDiff = Infinity;
  for (const s of samples) {
    const t = new Date(s.at).getTime();
    const diff = Math.abs(t - stopMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = s;
    }
  }
  if (!best || bestDiff > 6 * 3600 * 1000) return null;
  return best;
}

function candleToLw_(c) {
  return {
    time: Math.floor(c.time / 1000),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  };
}

async function buildStopChart_(saxoCfg, accountKey, event, cfg, cache, barOpts) {
  const def = G_SAXO_INSTRUMENTS[event.pairId];
  if (!def) throw new Error(`未知の pairId: ${event.pairId}`);

  let resolved = null;
  if (!barOpts.useYahoo && saxoCfg) {
    if (!cache[event.pairId]) {
      cache[event.pairId] = await resolveInstrumentByDef(saxoCfg, accountKey, def);
    }
    resolved = cache[event.pairId];
  } else if (!yahooSymbolForPair_(event.pairId)) {
    throw new Error(`Yahoo 未対応: ${event.pairId}`);
  }

  const rangeCfg = gsaxoGetRangeCfg_(def, cfg);
  const stopMs = new Date(jstTradeTimeToIso_(event.time)).getTime();
  const { beforeBars, afterBars } = splitBarCounts_(barOpts.totalBars, barOpts.center);

  const win = await fetchWindowCandles_(
    saxoCfg,
    resolved,
    event.pairId,
    stopMs,
    beforeBars,
    afterBars,
    barOpts.useYahoo
  );
  const candles1h = mergeCandlesByTime_(win.before, win.after);

  let candlesDaily = [];
  if (!barOpts.useYahoo && resolved) {
    candlesDaily = await getChartCandlesAtTime_(
      saxoCfg,
      resolved.uic,
      resolved.assetType,
      1440,
      new Date(stopMs).toISOString(),
      25
    );
  }

  const daily = detectDailyRange_(candlesDaily, rangeCfg);
  const h1 = detectH1Range_(win.before.length ? win.before : candles1h.slice(0, beforeBars), daily, rangeCfg);

  const stopBarIndex = findStopBarIndex_(candles1h, stopMs);
  const markerTime = Math.floor(candles1h[stopBarIndex].time / 1000);

  return {
    id: event.id,
    pairId: event.pairId,
    label: def.label,
    time: event.time,
    side: event.side,
    positionSide: event.positionSide,
    price: event.price,
    amount: event.amount,
    memo: event.memo,
    stopKind: isDailyStopRow_(event) ? 'daily' : 'h1',
    trendSample: event.trendSample,
    trendWatchSide: event.trendWatchSide || null,
    refDailyLow: event.refDailyLow ?? null,
    refDailyHigh: event.refDailyHigh ?? null,
    dataSource: win.source,
    daily: {
      high: daily.high,
      low: daily.low,
      widthPct: daily.widthPct,
      note: daily.note,
      isRange: daily.isRange,
    },
    h1: {
      high: h1.high,
      low: h1.low,
      widthPct: h1.widthPct,
      note: h1.note,
      isRange: h1.isRange,
      insideDaily: h1.insideDaily,
    },
    candles: candles1h.map(candleToLw_),
    stopSec: Math.floor(stopMs / 1000),
    stopBarIndex,
    beforeBars,
    afterBars,
    marker: {
      time: markerTime,
      position: event.positionSide === 'long' ? 'belowBar' : 'aboveBar',
      color: isDailyStopRow_(event) ? '#e53935' : '#fb8c00',
      shape: event.positionSide === 'long' ? 'arrowDown' : 'arrowUp',
      text: event.memo.replace(/^GSAXO/, ''),
    },
    priceLine: event.price,
    tradingView: tradingViewSymbol_(event.pairId),
  };
}

function renderHtml_(charts, meta) {
  const payload = JSON.stringify({ charts, meta });
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>G-SAXO 損切レビュー</title>
  <script src="https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js"></script>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 16px 20px 40px; background: #0f1114; color: #e8eaed; }
    h1 { font-size: 1.25rem; margin: 0 0 8px; }
    .meta { color: #9aa0a6; font-size: 0.9rem; margin-bottom: 24px; }
    .card { background: #1a1d23; border: 1px solid #2d323b; border-radius: 10px; padding: 16px; margin-bottom: 28px; }
    .card h2 { margin: 0 0 8px; font-size: 1.05rem; }
    .tags { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 12px; }
    .tag { font-size: 0.78rem; padding: 3px 8px; border-radius: 999px; background: #2d323b; }
    .tag.daily { background: #5c1f1f; color: #ffcdd2; }
    .tag.h1 { background: #4a3312; color: #ffe0b2; }
    table.info { width: 100%; border-collapse: collapse; font-size: 0.88rem; margin-bottom: 12px; }
    table.info th, table.info td { text-align: left; padding: 4px 8px 4px 0; vertical-align: top; }
    table.info th { color: #9aa0a6; width: 120px; font-weight: 500; }
    a { color: #8ab4f8; }
    .chart-wrap { position: relative; height: 360px; margin-bottom: 4px; }
    .chart { height: 100%; border-radius: 8px; overflow: hidden; }
    .split-line { position: absolute; top: 0; bottom: 28px; width: 2px; background: #e53935; opacity: 0.85; pointer-events: none; z-index: 2; }
    .split-label { position: absolute; top: 6px; font-size: 0.72rem; color: #ffcdd2; background: rgba(92,31,31,0.85); padding: 2px 6px; border-radius: 4px; pointer-events: none; z-index: 3; }
    .split-label.before { left: 8px; }
    .split-label.after { right: 8px; }
    .legend { font-size: 0.78rem; color: #9aa0a6; margin-top: 8px; }
    .empty { padding: 24px; text-align: center; color: #9aa0a6; }
  </style>
</head>
<body>
  <h1>G-SAXO 損切レビュー</h1>
  <div class="meta" id="meta"></div>
  <div id="root"></div>
  <script>
    const DATA = ${payload};

    document.getElementById('meta').textContent =
      '生成: ' + DATA.meta.generatedAt + ' / 件数: ' + DATA.charts.length +
      ' / 1H足: ' + (DATA.meta.windowLabel || '損切前1/3・損切後2/3');

    const root = document.getElementById('root');
    if (!DATA.charts.length) {
      root.innerHTML = '<div class="empty">損切履歴がありません</div>';
    }

    for (const ch of DATA.charts) {
      const card = document.createElement('div');
      card.className = 'card';
      const tvLink = ch.tradingView
        ? '<a href="https://www.tradingview.com/chart/?symbol=' + encodeURIComponent(ch.tradingView) + '&interval=60" target="_blank" rel="noopener">TradingView 1H</a>'
        : '';
      const trend = ch.trendSample
        ? 'ADX=' + ch.trendSample.adx + ' ER=' + ch.trendSample.er.toFixed(2) + ' @' + ch.trendSample.at
        : '—';
      const trendWatch = ch.trendWatchSide
        ? '方向=' + ch.trendWatchSide + ' 旧レンジ [' + ch.refDailyLow + ' – ' + ch.refDailyHigh + ']'
        : '';
      card.innerHTML =
        '<h2>' + ch.label + ' — ' + ch.time + '</h2>' +
        '<div class="tags">' +
          '<span class="tag ' + ch.stopKind + '">' + (ch.stopKind === 'daily' ? '日足損切' : '1H損切') + '</span>' +
          (ch.trendWatchSide ? '<span class="tag" style="background:#1a3a5c;color:#90caf9">TRENDウォッチ</span>' : '') +
          '<span class="tag">' + ch.memo + '</span>' +
        '</div>' +
        '<table class="info">' +
          '<tr><th>決済</th><td>' + ch.side + ' @' + ch.price + ' x' + ch.amount + '</td></tr>' +
          (trendWatch ? '<tr><th>TREND連動</th><td>' + trendWatch + '</td></tr>' : '') +
          '<tr><th>日足レンジ</th><td>' + (ch.daily.note || '—') +
            (ch.daily.high != null ? ' [' + ch.daily.low + ' – ' + ch.daily.high + ']' : '') + '</td></tr>' +
          '<tr><th>1Hレンジ</th><td>' + (ch.h1.note || '—') +
            (ch.h1.high != null ? ' [' + ch.h1.low + ' – ' + ch.h1.high + ']' : '') + '</td></tr>' +
          '<tr><th>損切時ADX/ER</th><td>' + trend + '</td></tr>' +
          '<tr><th>データ</th><td>' + (ch.dataSource || 'saxo') + '</td></tr>' +
          '<tr><th>外部</th><td>' + tvLink + '</td></tr>' +
        '</table>' +
        '<div class="chart-wrap" id="wrap-' + ch.id + '">' +
          '<div class="split-label before">損切前 ' + ch.beforeBars + '本</div>' +
          '<div class="split-label after">損切後 ' + ch.afterBars + '本</div>' +
          '<div class="chart" id="chart-' + ch.id + '"></div>' +
        '</div>' +
        '<div class="legend">赤縦線=損切時刻 · 赤/橙矢印=損切 · 青=日足上下 · 緑=1H上下(損切時) · 紫=損切価格</div>';
      root.appendChild(card);

      if (!ch.candles.length) continue;
      const wrap = document.getElementById('wrap-' + ch.id);
      const el = document.getElementById('chart-' + ch.id);
      const chart = LightweightCharts.createChart(el, {
        layout: { background: { color: '#12151a' }, textColor: '#c5cad1' },
        grid: { vertLines: { color: '#232831' }, horzLines: { color: '#232831' } },
        timeScale: { timeVisible: true, secondsVisible: false },
        rightPriceScale: { borderColor: '#2d323b' },
      });
      const series = chart.addCandlestickSeries({
        upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
        wickUpColor: '#26a69a', wickDownColor: '#ef5350',
      });
      series.setData(ch.candles);
      if (ch.marker) series.setMarkers([ch.marker]);
      if (ch.daily.high != null) {
        series.createPriceLine({ price: ch.daily.high, color: '#42a5f5', lineWidth: 1, lineStyle: 2, title: '日足High' });
        series.createPriceLine({ price: ch.daily.low, color: '#42a5f5', lineWidth: 1, lineStyle: 2, title: '日足Low' });
      }
      if (ch.h1.high != null) {
        series.createPriceLine({ price: ch.h1.high, color: '#66bb6a', lineWidth: 1, lineStyle: 2, title: '1H High' });
        series.createPriceLine({ price: ch.h1.low, color: '#66bb6a', lineWidth: 1, lineStyle: 2, title: '1H Low' });
      }
      if (ch.priceLine != null) {
        series.createPriceLine({ price: ch.priceLine, color: '#ab47bc', lineWidth: 2, title: '損切' });
      }
      chart.timeScale().fitContent();
      const split = document.createElement('div');
      split.className = 'split-line';
      const n = ch.candles.length || 1;
      const idx = ch.stopBarIndex != null ? ch.stopBarIndex : Math.round(n / 3);
      split.style.left = ((idx + 0.5) / n * 100) + '%';
      wrap.appendChild(split);
    }
  </script>
</body>
</html>`;
}

function inDateRangeJst_(timeStr, fromDate, toDate) {
  const d = timeStr.slice(0, 10);
  if (fromDate && d < fromDate) return false;
  if (toDate && d > toDate) return false;
  return true;
}

export async function gsaxoStopReview_(argv = process.argv) {
  const opts = parseArgs(argv);
  const cfg = loadGsaxoConfig();
  const state = await loadGsaxoState();
  let rows;
  if (opts.fromHtml) {
    rows = await loadStopsFromHtml_(opts.fromHtml);
  } else if (opts.stopsFile) {
    const raw = await readFile(opts.stopsFile, 'utf8');
    rows = JSON.parse(raw);
  } else {
    rows = await readAllTradeRows_();
  }
  const cutoff = Date.now() - opts.days * 86400000;

  let stops = opts.stopsFile ? rows : rows.filter(isStopTradeRow_);
  if (opts.dailyOnly && !opts.stopsFile) stops = stops.filter(isDailyStopRow_);
  if (opts.stopsFile) {
    stops = stops.filter((row) => inDateRangeJst_(row.time, opts.fromDate, opts.toDate));
  } else {
    stops = stops.filter((row) => {
      const ms = new Date(jstTradeTimeToIso_(row.time)).getTime();
      if (opts.fromDate || opts.toDate) {
        return inDateRangeJst_(row.time, opts.fromDate, opts.toDate);
      }
      return ms >= cutoff;
    });
  }

  stops = stops.map((row, i) => {
    const stopMs = new Date(jstTradeTimeToIso_(row.time)).getTime();
    return {
      id: row.id || `s${i}`,
      ...row,
      positionSide: positionSideFromRow_(row),
      trendSample: findTrendSample_(state, row.pairId, stopMs),
    };
  });

  if (opts.listOnly) {
    console.log(`損切 ${stops.length} 件（直近${opts.days}日${opts.dailyOnly ? '・日足のみ' : ''}）`);
    for (const s of stops) {
      const tv = tradingViewSymbol_(s.pairId);
      console.log(
        `${s.time}  ${s.pairId.padEnd(10)}  ${s.side.padEnd(8)}  @${s.price}  ${s.memo}` +
          (tv ? `  TV:${tv}` : '')
      );
    }
    return { count: stops.length, out: null };
  }

  let charts = [];
  let useYahoo = opts.yahoo;
  let saxoCfg = null;
  let accountKey = '';

  if (!opts.noFetch && stops.length) {
    if (!useYahoo) {
      try {
        saxoCfg = await resolveSaxoConfig();
        accountKey = await resolveAccountKey(saxoCfg);
      } catch (e) {
        console.warn(`Saxo 認証失敗 → Yahoo フォールバック: ${e.message}`);
        useYahoo = true;
      }
    }
    const cache = {};
    const src = useYahoo ? 'Yahoo Finance' : 'Saxo';
    const winLabel = opts.center ? '前後50%（中央=損切）' : '前1/3・後2/3';
    console.log(`${src} から ${stops.length} 件のチャートを取得中…（${winLabel}）`);
    for (let i = 0; i < stops.length; i++) {
      const event = stops[i];
      try {
        const chart = await buildStopChart_(saxoCfg, accountKey, event, cfg, cache, {
          totalBars: opts.bars,
          useYahoo,
          center: opts.center,
        });
        charts.push(chart);
        console.log(`  [${i + 1}/${stops.length}] ${event.time} ${event.pairId} OK (${chart.dataSource})`);
      } catch (e) {
        console.warn(`  [${i + 1}/${stops.length}] ${event.time} ${event.pairId} SKIP: ${e.message}`);
        charts.push({
          id: event.id,
          pairId: event.pairId,
          label: G_SAXO_INSTRUMENTS[event.pairId]?.label || event.pairId,
          time: event.time,
          side: event.side,
          positionSide: event.positionSide,
          price: event.price,
          amount: event.amount,
          memo: event.memo,
          stopKind: isDailyStopRow_(event) ? 'daily' : 'h1',
          trendSample: event.trendSample,
          daily: { note: '(取得失敗)' },
          h1: { note: '(取得失敗)' },
          candles: [],
          marker: null,
          priceLine: event.price,
          tradingView: tradingViewSymbol_(event.pairId),
          error: e.message,
        });
      }
      if (i < stops.length - 1) await sleep(600);
    }
  } else if (opts.noFetch) {
    charts = stops.map((event) => ({
      id: event.id,
      pairId: event.pairId,
      label: G_SAXO_INSTRUMENTS[event.pairId]?.label || event.pairId,
      time: event.time,
      side: event.side,
      positionSide: event.positionSide,
      price: event.price,
      amount: event.amount,
      memo: event.memo,
      stopKind: isDailyStopRow_(event) ? 'daily' : 'h1',
      trendSample: event.trendSample,
      daily: { note: '—' },
      h1: { note: '—' },
      candles: [],
      marker: null,
      priceLine: event.price,
      tradingView: tradingViewSymbol_(event.pairId),
    }));
  }

  const html = renderHtml_(charts, {
    generatedAt: new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Tokyo',
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date()),
    days: opts.days,
    dailyOnly: opts.dailyOnly,
    bars: opts.bars,
    window: opts.center ? 'center split' : '1/3 before stop, 2/3 after',
    windowLabel: opts.center ? '損切前後 各50%（決済時刻=中央）' : '損切前1/3・損切後2/3',
  });

  await mkdir(dirname(opts.out), { recursive: true });
  await writeFile(opts.out, html, 'utf8');
  console.log(`\nHTML: ${opts.out}`);
  console.log('ブラウザで開いてください（file:// または scp で Mac へ）');
  return { count: stops.length, out: opts.out };
}
