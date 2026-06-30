# Forex News Radar

A small dashboard that:

1. Pulls the top 10 international news stories from Google News.
2. Asks **Gemini** to rate each one's directional impact on six FX pairs.
3. Aggregates those ratings into one signal per pair.
4. Checks whether the market has **already moved** in the direction of each call (48h of price data from Yahoo Finance).
5. Lets you **paper-trade** the pairs via a built-in mock broker (with an OANDA-shaped interface ready for real trading later).

Pairs covered: **EUR/USD, USD/JPY, GBP/USD, XAU/USD, AUD/USD, USD/CAD**.

---

## Quick start

```bash
cd forex-news-radar
npm install

# Optional but recommended — without this, pair cards show "AI: off" and ratings stay neutral
export GEMINI_API_KEY=your-google-ai-studio-key

npm start
# open http://localhost:3000
```

Get a free Gemini key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

---

## The UI at a glance

```
┌────────────────────────────────────────────────────────────────────┐
│  Forex News Radar     [ Refresh ]  Updated 14:32:01   AI: Gemini   │
├────────────────────────────────────────────────────────────────────┤
│  PAIR SIGNALS                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                            │
│  │ EUR/USD  │ │ USD/JPY  │ │ GBP/USD  │ … six pair cards in a grid │
│  │ weak buy │ │ neutral  │ │ weak sale│                            │
│  │ ▁▂▃▄▅ +0.42%│           │           │                           │
│  │ [PARTIAL]│ │ [N/A]    │ │ [FRESH]  │                            │
│  └──────────┘ └──────────┘ └──────────┘                            │
│                                                                    │
│  TOP HEADLINES                                                     │
│  1. Fed signals hike — Reuters · 14:00                             │
│     [Fed] [Rates] [Inflation]                       score: 30.4    │
│     EUR/USD weak sale  Higher US inflation strengthens USD vs EUR. │
│     USD/JPY weak buy   Fed hike bets boost USD against JPY.        │
│     … (4 more pairs)                                               │
│  2. …                                                              │
└────────────────────────────────────────────────────────────────────┘
```

---

## Reading a pair card

Each of the six pair cards shows four things, top to bottom:

1. **Pair name and aggregate score** — e.g. `EUR/USD  +0.42`. The score is the weighted average of Gemini's per-headline ratings (mapped to −2 … +2 and weighted by each headline's impact score). Magnitude indicates conviction; sign indicates direction.
2. **Aggregate rating chip** — one of: `strong buy / weak buy / neutral / weak sale / strong sale`. Colored green for buy, red for sale, grey for neutral. This is the recommendation for the **base currency** of the pair (so "weak buy" on USD/JPY means a mildly bullish USD call).
3. **48h price row** — a tiny sparkline of hourly closes, plus the 48h % change and 48h range. Sparkline is green if the period closed up, red if down.
4. **Assessment chip** — answers "has the market already done what Gemini is calling?" One of five states (see table below).

**Click any pair card to expand it.** The expanded panel shows:
- **Assessment reason** — one sentence explaining the chip (what move, vs what magnitude).
- **Why this call** — Gemini's 2–3 sentence rationale for the aggregate recommendation, naming the actual drivers (Fed, ECB, CPI, etc.).
- **Driving headlines** — the top 5 contributing news items, sorted by how much they pushed the pair. Each has a clickable title, the headline's per-pair rating, and Gemini's one-line reason.

### Assessment states

| Chip | Color | When it shows | What to do |
|---|---|---|---|
| **Likely priced in** | orange | Market already moved in the recommended direction, with magnitude ≥ 60% of typical half-range | Don't chase — late entry risk |
| **Partially expressed** | green | Aligned move, but smaller than typical half-range | Best setup — thesis playing out, room left |
| **Fresh — not yet in price** | cyan | Price is roughly flat | Highest signal — thesis hasn't been expressed yet |
| **Market diverges** | red | Price moved meaningfully **against** the recommendation | Caution: thesis may be wrong, or this is a contrarian setup |
| **No directional call** | grey | Gemini said neutral overall | Nothing to test |

---

## Reading the headline list

The numbered list below the pair grid shows the top 10 news items, ranked by an internal **impact score** (right side of each row). The score is keyword-weighted: Fed-related news scores 10, ECB/BOJ 9, CPI/jobs 8, etc., plus a recency boost that decays over 48h.

Below each headline, you see a **3-column grid**:

```
PAIR     RATING         REASON
EUR/USD  weak sale      Higher US inflation expectations strengthen USD vs EUR.
USD/JPY  weak buy       Fed rate hike expectations would boost USD against JPY.
…
```

This is Gemini's per-headline, per-pair take — every pair gets a rating from every headline, with a one-line justification. Use it to trace any pair-card rating back to the specific headlines that drove it.

Click the headline title to open the original article on Google News.

---

## Interacting

- **Refresh** (top right) — forces a re-fetch. Bypasses the 5-minute cache on the next request.
- **Click a pair card** — expand / collapse the detail panel. Multiple cards can be open at once.
- **Click a headline title** — opens the source article in a new tab.
- **AI badge** (top right, next to "Updated") — shows whether Gemini is in use:
  - `AI: Gemini` (green) — key is set, ratings are live
  - `AI: off` (orange) — no key; pairs default to neutral

---

## Paper trading (mock broker)

Each pair card has **Buy** and **Sell** buttons. Clicking either submits a market order to a built-in **mock broker** that maintains an in-memory $100,000 portfolio. No real money or external broker involved — fills happen instantly at the latest cached Yahoo mid-price, with a small simulated bid/ask spread.

### Using it

1. Set the **Order size** input at the top of the page (default 10,000 units = "mini lot"). All trades use this size.
2. Click **Buy** on a pair card → opens a long position. Click **Sell** → opens a short.
3. Open positions appear in the **Portfolio** section below the pair grid with live P&L (in approximate USD).
4. Click **Close** in the position row to flatten and book the realized P&L to cash.
5. **Equity** at the top of the Portfolio section is `cash + unrealized P&L`, with the running net change from your $100k starting balance.

### Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/api/trade` | `{pair, side: "buy"\|"sell", units}` | `{order, portfolio}` |
| `POST` | `/api/close` | `{pair}` | `{order, portfolio}` |
| `GET` | `/api/portfolio` | — | `{cash, equity, unrealizedPL, positions[], orders[]}` |

### Behavior notes

- **Spread**: simulated, per-pair (`0.0001` for EUR/USD, `0.01` for USD/JPY, `0.30` for XAU/USD, etc.). Buys fill at `mid + spread/2`, sells at `mid − spread/2`.
- **Averaging**: re-buying an existing long updates the weighted-average entry price. Buying when short (or vice versa) closes the smaller side first; if you cross through zero, the closing leg books realized P&L to cash and the residual opens a new position at the new fill price.
- **P&L currency**: reported in approximate USD. Pairs ending in USD (EUR/USD, GBP/USD, AUD/USD, XAU/USD) are exact; USD/JPY and USD/CAD are converted to USD using the current quote (good enough for a paper-trade view).
- **State is in-memory**: restart the server and the portfolio resets to $100k. Add persistence if you need it.

### Swapping to real OANDA later

The mock broker mirrors the interface of a real OANDA v20 client. `lib/brokers/oanda.js` is a skeleton with the real endpoints commented in — fill in your credentials, uncomment, and switch:

```bash
export BROKER=oanda
export OANDA_API_KEY=...
export OANDA_ACCOUNT_ID=101-001-1234567-001
export OANDA_ENV=practice          # use 'live' only when you mean it
npm start
```

Get a free practice account and API token at [oanda.com](https://www.oanda.com/account/login). The dashboard's "Broker:" badge in the header switches from `mock` (orange) to `oanda` (green) when configured.

**Robinhood note**: Robinhood does not offer spot FX. The six pairs in this app cannot be traded there. If you want a similar dashboard for crypto pairs (BTC/USD, ETH/USD), that's a different broker integration.

---

## Caching and call budget

- Server caches the entire payload for **5 minutes**. Loading the page within that window costs zero API calls.
- A cache-cold request costs **2 Gemini calls** (1 batched per-headline analysis + 1 pair rationale synthesis) and **6 Yahoo calls** (one per pair, parallel).
- All Yahoo calls are free and unauthenticated. Gemini calls count against your free-tier or paid quota.

---

## Testing

The project ships with a unit-test suite using **Node's built-in test runner** (zero new dependencies — requires Node 18+, recommended Node 20+).

```bash
npm test            # run the full suite once
npm run test:watch  # re-run on file change
```

### What's covered

| Module | Tests | Notes |
|---|---|---|
| `lib/scorer.js` | 7 | keyword weighting, recency boost, top-10 ranking |
| `lib/aggregator.js` | 9 | weighted averaging, rating thresholds, contributor sorting |
| `lib/assessor.js` | 11 | the 5 assessment states, SIG_RATIO boundary, missing-quote fallback |
| `lib/analyzer.js` | 5 | exports + offline fallback (no Gemini key needed) |
| `lib/quotes.js` | 3 | SYMBOL_MAP shape (the XAU/USD → GC=F workaround) |
| `lib/broker.js` | 4 | factory: mock vs oanda selection, singleton behavior |
| `lib/brokers/mock.js` | 16 | spread mechanics, opening/closing/flipping positions, realized vs unrealized P&L |
| `lib/brokers/oanda.js` | 7 | constructor validation, practice-vs-live URL, stub method behavior |
| **Total** | **63** | |

### What's NOT covered

- **Network-dependent code paths** (`lib/fetcher.js`, live `lib/quotes.js` HTTP, live Gemini calls in `analyzer.js`) — these are exercised end-to-end by running the app, not in unit tests. Adding them would require either mocking `axios` or hitting real services in CI.
- **HTTP routes in `server.js`** — covered by manual smoke tests via `curl` (see "Paper trading" above). For automated coverage, add supertest as a dev dep.
- **Frontend (`public/*`)** — no browser tests. The UI is small enough to verify visually.

### Running a single suite

```bash
node --test test/aggregator.test.js
node --test test/brokers/mock.test.js
```

---

## Troubleshooting

- **"AI: off" badge** — set `GEMINI_API_KEY` in the env and restart `npm start`. Verify on startup the console prints `AI ratings: ON (Gemini)`.
- **All pair ratings are neutral with `AI: Gemini`** — likely hit a Gemini rate limit (free tier is 5 req/min). Wait a minute, click Refresh. The batched design means a normal refresh only uses 2 calls, so this should be rare.
- **"Price data unavailable"** on a pair — Yahoo's chart endpoint occasionally returns empty over weekends. Refresh later, or check that the ticker map in `lib/quotes.js` matches a symbol that returns data (gold uses `GC=F` because `XAUUSD=X` is unreliable).
- **Page is empty / Loading… forever** — the Google News RSS fetch failed. Check the server console; usually a transient timeout.
- **"Failed to load: HTTP 502"** in the UI — the news fetch or Gemini call hit an exception. Server console will show the detail.

---

## Project layout

```
forex-news-radar/
├── server.js              Express server: /api/news, /api/trade, /api/close, /api/portfolio
├── lib/
│   ├── fetcher.js         Pulls forex-relevant Google News RSS items
│   ├── scorer.js          Keyword-weighted impact score per headline
│   ├── analyzer.js        Gemini: per-headline ratings + per-pair rationales
│   ├── aggregator.js      Score-weighted average → one rating per pair
│   ├── quotes.js          Yahoo 48h hourly OHLC per pair
│   ├── assessor.js        Recommendation-vs-market classifier
│   ├── broker.js          Broker factory (mock vs oanda, picked by $BROKER)
│   └── brokers/
│       ├── mock.js        In-memory paper broker with simulated spread
│       └── oanda.js       OANDA v20 skeleton (uncomment to enable real orders)
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── test/                  Unit tests (node:test runner) — run with `npm test`
│   ├── *.test.js
│   └── brokers/*.test.js
└── package.json
```

---

## Disclaimer

This is a learning / dashboard tool, not trading advice. Gemini's ratings are model output, not signals from a backtested system. The "assessment" is a simple direction-vs-magnitude heuristic, not a measure of risk-adjusted opportunity. Trade your own book.
