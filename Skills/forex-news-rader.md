# Forex News Radar — Node.js Application

A Node.js app that pulls the top ten international news items from **news.google.com** (via its public RSS feed), ranks them by likely FX impact, and uses **Google Gemini** to rate each headline's directional signal for six key FX pairs: **EUR/USD, USD/JPY, GBP/USD, XAU/USD, AUD/USD, USD/CAD**. Comes with a lightweight browser frontend that aggregates the ratings into one signal per pair.

---

## 0. Quick start

```bash
cd forex-news-radar
npm install
export GEMINI_API_KEY=your-google-ai-studio-key
npm start
# open http://localhost:3000
```

Without `GEMINI_API_KEY` the app still runs — pairs default to **neutral** and the UI shows an "AI: off" badge.

---

## 1. Project Structure

```
forex-news-radar/
├── package.json
├── server.js              # Express backend
├── lib/
│   ├── fetcher.js         # Pulls forex-relevant RSS items from Google News
│   ├── scorer.js          # Scores each headline by forex impact
│   ├── analyzer.js        # Gemini call → per-pair rating per headline
│   └── aggregator.js      # News-score-weighted aggregate per pair
└── public/
    ├── index.html         # Frontend UI
    ├── styles.css
    └── app.js             # Calls /api/news, renders top 10
```

Create the folder and files exactly as shown below.

---

## 2. `package.json`

```json
{
  "name": "forex-news-radar",
  "version": "1.0.0",
  "description": "Top 10 forex-impacting international news from Google News",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "axios": "^1.7.7",
    "express": "^4.21.0",
    "fast-xml-parser": "^4.5.0"
  },
  "engines": {
    "node": ">=18"
  }
}
```

Install with:

```bash
cd forex-news-radar
npm install
```

---

## 3. `lib/fetcher.js` — Pull from Google News RSS

Google News exposes a public RSS endpoint at
`https://news.google.com/rss/search?q=<QUERY>&hl=en-US&gl=US&ceid=US:en`.
We query terms that surface forex-moving stories (central banks, inflation,
rates, trade, geopolitics) and merge the results.

```javascript
// lib/fetcher.js
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');

const FOREX_QUERIES = [
  'central bank interest rate decision',
  'inflation CPI report',
  'Federal Reserve OR ECB OR BOJ OR BOE OR PBOC',
  'currency exchange rate',
  'trade deficit OR trade war OR tariffs',
  'GDP growth report',
  'geopolitical tension oil',
  'sovereign debt crisis',
];

const RSS_BASE =
  'https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q=';

const parser = new XMLParser({ ignoreAttributes: false });

async function fetchQuery(query) {
  const url = RSS_BASE + encodeURIComponent(query);
  const { data } = await axios.get(url, {
    timeout: 10_000,
    headers: { 'User-Agent': 'forex-news-radar/1.0' },
  });
  const parsed = parser.parse(data);
  const items = parsed?.rss?.channel?.item ?? [];
  return (Array.isArray(items) ? items : [items]).map((it) => ({
    title: stripSourceSuffix(it.title),
    link: it.link,
    pubDate: it.pubDate,
    source: it.source?.['#text'] ?? it.source ?? 'Google News',
    description: cleanDescription(it.description),
    query,
  }));
}

function stripSourceSuffix(title = '') {
  // Google News titles end with " - SourceName"; trim it for cleaner display.
  return String(title).replace(/\s+-\s+[^-]+$/, '').trim();
}

function cleanDescription(html = '') {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchForexNews() {
  const batches = await Promise.allSettled(FOREX_QUERIES.map(fetchQuery));
  const all = batches.flatMap((b) => (b.status === 'fulfilled' ? b.value : []));

  // De-duplicate by title.
  const seen = new Map();
  for (const item of all) {
    const key = item.title.toLowerCase();
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()];
}

module.exports = { fetchForexNews };
```

---

## 4. `lib/scorer.js` — Rank by forex impact

A transparent keyword-weighted scorer. Higher weight = bigger expected
move in a major currency pair. Recency adds a small boost so a 2-hour-old
Fed headline outranks a two-day-old one.

```javascript
// lib/scorer.js
const WEIGHTS = [
  // Central banks & policy
  { re: /\b(federal reserve|fomc|fed\b|jerome powell)\b/i, w: 10, tag: 'Fed' },
  { re: /\b(ecb|european central bank|lagarde)\b/i, w: 9, tag: 'ECB' },
  { re: /\b(bank of japan|boj|ueda)\b/i, w: 9, tag: 'BOJ' },
  { re: /\b(bank of england|boe|bailey)\b/i, w: 8, tag: 'BOE' },
  { re: /\b(pboc|people'?s bank of china)\b/i, w: 8, tag: 'PBOC' },
  { re: /\b(snb|swiss national bank|rba|rbnz|boc|bank of canada)\b/i, w: 7, tag: 'CB' },
  { re: /\b(rate (hike|cut|decision|hold)|interest rate|monetary policy)\b/i, w: 8, tag: 'Rates' },

  // Macro data
  { re: /\b(cpi|inflation|core pce|ppi)\b/i, w: 8, tag: 'Inflation' },
  { re: /\b(non[- ]?farm payrolls|nfp|unemployment rate|jobs report)\b/i, w: 8, tag: 'Jobs' },
  { re: /\b(gdp|growth forecast|recession)\b/i, w: 6, tag: 'Growth' },
  { re: /\b(trade (deficit|surplus|balance)|tariffs?|trade war)\b/i, w: 6, tag: 'Trade' },

  // Currencies & FX directly
  { re: /\b(forex|fx market|currency (war|peg|crisis)|exchange rate|devaluation|intervention)\b/i, w: 7, tag: 'FX' },
  { re: /\b(usd|dollar|eur|euro|yen|jpy|gbp|sterling|cny|yuan|chf|aud|cad)\b/i, w: 4, tag: 'Currency' },

  // Risk / geopolitics
  { re: /\b(sanctions?|war|invasion|conflict|opec|oil price|crude)\b/i, w: 5, tag: 'Risk' },
  { re: /\b(default|sovereign debt|downgrade|credit rating)\b/i, w: 6, tag: 'Credit' },
];

function scoreItem(item) {
  const text = `${item.title} ${item.description}`;
  let score = 0;
  const tags = new Set();
  for (const { re, w, tag } of WEIGHTS) {
    if (re.test(text)) {
      score += w;
      tags.add(tag);
    }
  }

  // Recency boost: linearly decays over 48h.
  const ageHours = (Date.now() - new Date(item.pubDate).getTime()) / 3.6e6;
  if (Number.isFinite(ageHours)) {
    score += Math.max(0, 5 * (1 - ageHours / 48));
  }

  return { ...item, score: Number(score.toFixed(2)), tags: [...tags] };
}

function rankTopTen(items) {
  return items
    .map(scoreItem)
    .filter((it) => it.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

module.exports = { rankTopTen };
```

---

## 5. `server.js` — Express backend

Serves the API and the static frontend. Caches the news for 5 minutes so
we don't hammer Google's RSS endpoint.

```javascript
// server.js
const express = require('express');
const path = require('path');
const { fetchForexNews } = require('./lib/fetcher');
const { rankTopTen } = require('./lib/scorer');

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = { at: 0, payload: null };

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/news', async (req, res) => {
  try {
    const fresh = Date.now() - cache.at < CACHE_TTL_MS;
    if (fresh && cache.payload) return res.json(cache.payload);

    const raw = await fetchForexNews();
    const top = rankTopTen(raw);
    const payload = {
      fetchedAt: new Date().toISOString(),
      count: top.length,
      items: top,
    };
    cache = { at: Date.now(), payload };
    res.json(payload);
  } catch (err) {
    console.error('news fetch failed:', err.message);
    res.status(502).json({ error: 'Failed to fetch news', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Forex News Radar → http://localhost:${PORT}`);
});
```

---

## 6. Frontend — `public/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Forex News Radar</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header>
      <h1>Forex News Radar</h1>
      <p class="subtitle">Top 10 international news with potential FX impact</p>
      <button id="refresh">Refresh</button>
      <span id="updated"></span>
    </header>

    <main>
      <ol id="news-list" aria-live="polite"></ol>
      <p id="status"></p>
    </main>

    <script src="app.js"></script>
  </body>
</html>
```

---

## 7. `public/styles.css`

```css
:root {
  --bg: #0f1216;
  --panel: #181c22;
  --text: #e8ecf1;
  --muted: #9aa3ad;
  --accent: #4cc9f0;
  --tag: #2b3340;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.45;
}

header {
  padding: 1.5rem 2rem;
  border-bottom: 1px solid #222;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

header h1 { margin: 0; font-size: 1.4rem; }
.subtitle { color: var(--muted); margin: 0; flex: 1; }

#refresh {
  background: var(--accent);
  color: #000;
  border: 0;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}

#updated { color: var(--muted); font-size: 0.85rem; }

main { padding: 1rem 2rem 3rem; max-width: 900px; margin: 0 auto; }

ol { list-style: none; padding: 0; counter-reset: rank; }

li {
  background: var(--panel);
  margin-bottom: 0.75rem;
  padding: 1rem 1rem 1rem 3rem;
  border-radius: 8px;
  position: relative;
  counter-increment: rank;
}

li::before {
  content: counter(rank);
  position: absolute;
  left: 0.9rem;
  top: 0.9rem;
  font-weight: 700;
  color: var(--accent);
  font-size: 1.1rem;
}

li a {
  color: var(--text);
  text-decoration: none;
  font-weight: 600;
}
li a:hover { color: var(--accent); }

.meta {
  color: var(--muted);
  font-size: 0.8rem;
  margin-top: 0.25rem;
}

.tags { margin-top: 0.5rem; }
.tag {
  display: inline-block;
  background: var(--tag);
  color: var(--accent);
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.72rem;
  margin-right: 4px;
}

.score {
  float: right;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
  font-weight: 700;
}
```

---

## 8. `public/app.js`

```javascript
const list = document.getElementById('news-list');
const status = document.getElementById('status');
const updated = document.getElementById('updated');
const refresh = document.getElementById('refresh');

async function load() {
  status.textContent = 'Loading…';
  list.innerHTML = '';
  try {
    const res = await fetch('/api/news');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    render(data);
  } catch (err) {
    status.textContent = `Failed to load: ${err.message}`;
  }
}

function render(data) {
  status.textContent = '';
  updated.textContent = `Updated ${new Date(data.fetchedAt).toLocaleTimeString()}`;
  if (!data.items.length) {
    status.textContent = 'No forex-relevant news right now.';
    return;
  }
  for (const item of data.items) {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="score">${item.score}</span>
      <a href="${item.link}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a>
      <div class="meta">${escapeHtml(item.source)} · ${new Date(item.pubDate).toLocaleString()}</div>
      <div class="tags">${item.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
    `;
    list.appendChild(li);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

refresh.addEventListener('click', load);
load();
```

---

## 9. Run

```bash
npm install
npm start
# open http://localhost:3000
```

The page renders the top ten forex-impacting headlines, each with its
impact score, contributing tags (Fed, CPI, ECB, …), source, and timestamp.
Click **Refresh** to bypass the 5-minute cache on the next request.

---

## 10. Notes & next steps

- **Source legality**: the app uses the public Google News RSS feed
  (`news.google.com/rss/search`). No HTML scraping is performed.
- **Scoring** is intentionally transparent — tweak `WEIGHTS` in
  `lib/scorer.js` to favor specific currencies or themes (e.g. boost
  `JPY` if you trade USD/JPY).
- **Possible extensions**:
  - Per-pair filtering (USD/EUR/JPY/GBP buttons).
  - Sentiment analysis (positive/negative) via a small LLM call.
  - WebSocket push when a new high-score headline appears.
  - Persist history to SQLite for backtesting which headlines actually
    moved pairs.
