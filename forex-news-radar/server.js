const fs = require('fs');
const express = require('express');
const path = require('path');

// Load GEMINI_API_KEY from token.txt if not already set in the environment.
// Looks in the project dir first, then the parent dir.
if (!process.env.GEMINI_API_KEY) {
  for (const p of [path.join(__dirname, 'token.txt'), path.join(__dirname, '..', 'token.txt')]) {
    try {
      const key = fs.readFileSync(p, 'utf8').trim();
      if (key) {
        process.env.GEMINI_API_KEY = key;
        break;
      }
    } catch {
      // file not found / unreadable — try next location
    }
  }
}

const { fetchForexNews } = require('./lib/fetcher');
const { rankTopTen } = require('./lib/scorer');
const {
  analyzeItems,
  synthesizePairRationales,
  isConfigured,
  PAIRS,
} = require('./lib/analyzer');
const { aggregateByPair } = require('./lib/aggregator');
const { fetchAllPairs } = require('./lib/quotes');
const { assessAll } = require('./lib/assessor');
const { getBroker } = require('./lib/broker');

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = { at: 0, payload: null };
const broker = getBroker();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Pull the latest cached mid-price per pair from quotes for mock fills.
function midByPair() {
  const pairs = cache.payload?.pairs || {};
  const out = {};
  for (const [pair, info] of Object.entries(pairs)) {
    const mid = info.quote?.latest;
    if (Number.isFinite(mid)) out[pair] = mid;
  }
  return out;
}

async function ensureQuotesFresh() {
  if (Object.keys(midByPair()).length === PAIRS.length) return;
  // Cold start — fetch only quotes (cheap) so trades have prices to fill against.
  const quotes = await fetchAllPairs(PAIRS);
  cache.payload = cache.payload || { pairs: {} };
  for (const pair of PAIRS) {
    cache.payload.pairs[pair] = cache.payload.pairs[pair] || {};
    cache.payload.pairs[pair].quote = quotes[pair];
  }
}

app.get('/api/news', async (req, res) => {
  try {
    const fresh = Date.now() - cache.at < CACHE_TTL_MS;
    if (fresh && cache.payload?.items) return res.json(cache.payload);

    const [raw, quotes] = await Promise.all([
      fetchForexNews(),
      fetchAllPairs(PAIRS),
    ]);
    const top = rankTopTen(raw);
    const analyzed = await analyzeItems(top);
    const pairsRaw = aggregateByPair(analyzed);
    const rationales = await synthesizePairRationales(pairsRaw);
    for (const p of Object.keys(pairsRaw)) {
      pairsRaw[p].rationale = rationales[p] || '';
    }
    const pairs = assessAll(pairsRaw, quotes);

    const payload = {
      fetchedAt: new Date().toISOString(),
      aiEnabled: isConfigured(),
      brokerKind: broker.kind,
      pairs,
      pairOrder: PAIRS,
      count: analyzed.length,
      items: analyzed,
    };
    cache = { at: Date.now(), payload };
    res.json(payload);
  } catch (err) {
    console.error('news fetch failed:', err.message);
    res.status(502).json({ error: 'Failed to fetch news', detail: err.message });
  }
});

app.post('/api/trade', async (req, res) => {
  try {
    const { pair, side, units } = req.body || {};
    if (!PAIRS.includes(pair)) return res.status(400).json({ error: `bad pair: ${pair}` });
    if (!['buy', 'sell'].includes(side)) return res.status(400).json({ error: `bad side: ${side}` });
    const u = Number(units);
    if (!Number.isFinite(u) || u <= 0) return res.status(400).json({ error: 'units must be > 0' });

    await ensureQuotesFresh();
    const mids = midByPair();
    const order = await broker.placeOrder({ pair, side, units: u, mid: mids[pair] });
    const portfolio = await broker.getPortfolio(mids);
    res.json({ order, portfolio });
  } catch (err) {
    console.error('trade failed:', err.message);
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/close', async (req, res) => {
  try {
    const { pair } = req.body || {};
    if (!PAIRS.includes(pair)) return res.status(400).json({ error: `bad pair: ${pair}` });
    await ensureQuotesFresh();
    const mids = midByPair();
    const order = await broker.closePosition(pair, mids);
    const portfolio = await broker.getPortfolio(mids);
    res.json({ order, portfolio });
  } catch (err) {
    console.error('close failed:', err.message);
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/portfolio', async (req, res) => {
  try {
    await ensureQuotesFresh();
    const portfolio = await broker.getPortfolio(midByPair());
    res.json(portfolio);
  } catch (err) {
    console.error('portfolio failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Forex News Radar → http://localhost:${PORT}`);
  console.log(`AI ratings: ${isConfigured() ? 'ON (Gemini)' : 'OFF (set GEMINI_API_KEY to enable)'}`);
  console.log(`Broker: ${broker.kind.toUpperCase()}${broker.kind === 'mock' ? ' (no real orders sent)' : ''}`);
});
