const axios = require('axios');

const SYMBOL_MAP = {
  'EUR/USD': 'EURUSD=X',
  'USD/JPY': 'USDJPY=X',
  'GBP/USD': 'GBPUSD=X',
  'XAU/USD': 'GC=F',
  'AUD/USD': 'AUDUSD=X',
  'USD/CAD': 'USDCAD=X',
};

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';

async function fetchPair(pair) {
  const ticker = SYMBOL_MAP[pair];
  if (!ticker) return { pair, error: 'no ticker mapping' };

  const url = `${YAHOO_BASE}${encodeURIComponent(ticker)}?interval=1h&range=2d`;
  try {
    const { data } = await axios.get(url, {
      timeout: 8_000,
      headers: { 'User-Agent': 'forex-news-radar/1.0' },
    });
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error('empty chart result');

    const timestamps = result.timestamp || [];
    const q = result.indicators?.quote?.[0] || {};
    const bars = timestamps
      .map((t, i) => ({
        t,
        o: q.open?.[i],
        h: q.high?.[i],
        l: q.low?.[i],
        c: q.close?.[i],
      }))
      .filter((b) => Number.isFinite(b.c) && Number.isFinite(b.o));

    if (bars.length < 2) throw new Error(`only ${bars.length} valid bars`);

    const first = bars[0];
    const last = bars[bars.length - 1];
    const highs = bars.map((b) => b.h).filter(Number.isFinite);
    const lows = bars.map((b) => b.l).filter(Number.isFinite);
    const high48h = Math.max(...highs);
    const low48h = Math.min(...lows);

    return {
      pair,
      ticker,
      currency: result.meta?.currency,
      bars: bars.length,
      closes: bars.map((b) => b.c),
      first: first.o,
      latest: last.c,
      change: last.c - first.o,
      changePct: ((last.c - first.o) / first.o) * 100,
      high48h,
      low48h,
      rangePct: ((high48h - low48h) / first.o) * 100,
      firstAt: new Date(first.t * 1000).toISOString(),
      latestAt: new Date(last.t * 1000).toISOString(),
    };
  } catch (err) {
    return { pair, ticker, error: err.message };
  }
}

async function fetchAllPairs(pairs) {
  const results = await Promise.all(pairs.map((p) => fetchPair(p)));
  return Object.fromEntries(results.map((r) => [r.pair, r]));
}

module.exports = { fetchAllPairs, SYMBOL_MAP };
