# Architecture

The system is a **composed pipeline** rather than a single autonomous agent. Each LLM call has one narrow job, deterministic glue moves data between stages, and the orchestration lives in plain JavaScript. This is a deliberate design choice — see the design notes at the bottom for why.

---

## End-to-end pipeline

```
                ┌──────────────────────────────────────────────────────────────────┐
                │                       /api/news (5-min cache)                    │
                │                                                                  │
  Google News   │   ┌──────────┐   raw items   ┌──────────┐  top 10        ┌─────────┐ │
  RSS (8 ───────┼──▶│ fetcher  │──────────────▶│  scorer  │───────────────▶│ analyzer│ │
  queries)      │   └──────────┘               └──────────┘  + impact      └────┬────┘ │
                │                              keyword + recency           1× Gemini   │
                │                                                          batched     │
                │                                                          (10 hl × 6  │
                │                                                          pairs)      │
  Yahoo (6  ───┐│                                                                ▼     │
  pairs, par.) ││   ┌──────────┐                                          ┌──────────┐ │
                ┼──▶│  quotes  │─────────────────────────────────────────▶│aggregator│ │
                │   └──────────┘                                          └────┬─────┘ │
                │   48h hourly OHLC                          weighted average   ▼      │
                │                                            per pair        ┌──────┐  │
                │                                                            │analy-│  │
                │                                                            │ zer  │  │
                │                                                            │(2nd) │  │
                │                                                            └──┬───┘  │
                │                                          1× Gemini rationale │      │
                │                                          per pair (one call) ▼      │
                │                                                          ┌──────────┐│
                │                                                          │ assessor ││
                │                                                          └────┬─────┘│
                │                                       deterministic: market   │      │
                │                                       vs rec direction +       │      │
                │                                       magnitude → 1 of 5 chips │      │
                │                                                                ▼      │
                │   payload: { pairs[6] = {rating, score, rationale, contributors,      │
                │              assessment, quote}, items[10], pairOrder, ...}           │
                └────────────────────────────────────────┬─────────────────────────────┘
                                                         │
                                                         ▼
                                                   Browser UI
                                              (auto-refresh 5 min)

           ┌─────────────────┐                       │
           │  /api/trade     │  ←────────────────────┤
           │  /api/close     │  Buy/Sell/Close from  │
           │  /api/portfolio │  pair cards & table   │
           └────────┬────────┘                       │
                    │                                │
                    ▼                                │
              ┌──────────┐                           │
              │ broker.js│  factory: mock | oanda    │
              └────┬─────┘                           │
                   ├──────────────┐                  │
                   ▼              ▼                  │
            ┌──────────┐    ┌───────────┐            │
            │ Mock     │    │ OANDA v20 │ (skeleton) │
            │ in-mem   │    │ HTTP API  │            │
            └──────────┘    └───────────┘            │
                  ▲                                  │
                  └ uses last cached Yahoo mid ──────┘
                    from /api/news payload
```

---

## Stages

### 1. `lib/fetcher.js` — News collection
- 8 parallel `axios` calls to Google News RSS, one per FX-relevant query
  (`Federal Reserve OR ECB OR BOJ`, `inflation CPI report`, `trade deficit OR tariffs`, …)
- `fast-xml-parser` to extract title / link / pubDate / source / description
- De-duplicates by lowercased title

### 2. `lib/scorer.js` — Impact scoring (deterministic)
- Pure function; no network, no LLM
- Per-headline keyword weights: Fed=10, ECB/BOJ=9, CPI/NFP=8, Rates=8, FX=4–7, geopolitics=5, etc.
- Recency boost: `5 * max(0, 1 − ageHours/48)`
- Filters score > 0, sorts descending, returns top 10
- **Why deterministic:** This is a relevance filter, not a judgement call. Keywords are cheap, transparent, and easy to test. LLMs would be slower and less accountable.

### 3. `lib/analyzer.js` — Per-headline rating (1× LLM call, batched)
- Single Gemini call with a structured-output schema:
  `{ results: [ { headlineIndex, ratings: { "EUR/USD": {rating, reason}, ... } } ] }`
- All 10 headlines numbered and submitted in one prompt; the schema forces one result per headline with valid 5-point ratings on all 6 pairs
- **Why batched:** the v1 of this module made 10 separate calls and immediately hit the Gemini free tier's 5 RPM limit. Batching dropped that to 1 call total, also let the model see headlines in context.

### 4. `lib/aggregator.js` — Per-pair aggregate (deterministic)
- Maps each rating to a number (`strong buy`=+2 … `strong sale`=−2)
- News-impact-weighted average: `Σ(rating_num × max(score, 0.1)) / Σ(weight)`
- Re-buckets the average back into the 5-point scale at thresholds ±1.25 (strong) and ±0.4 (weak)
- Contributors per pair sorted by `|rating_num| × news_score` so the biggest swing headlines surface first

### 5. `lib/analyzer.synthesizePairRationales` — Per-pair rationale (1× LLM call)
- Second Gemini call: takes the 6 aggregated pair ratings + top-5 contributing headlines per pair, returns one 2–3 sentence paragraph per pair explaining the call
- Structured output: `{ "EUR/USD": "...", "USD/JPY": "...", ... }`

### 6. `lib/quotes.js` — Market data (no LLM)
- 6 parallel Yahoo Finance v8 chart calls, interval=1h, range=2d
- Per pair: returns `{closes[], first, latest, changePct, rangePct}`
- Gold quirk: `XAUUSD=X` returns empty from Yahoo; we use `GC=F` (COMEX gold futures) as a tracker

### 7. `lib/assessor.js` — Recommendation vs market (deterministic)
- For each pair, compares Gemini's rating to the 48h price action:
  - `magnitudeRatio = |changePct| / (rangePct/2)`
  - Aligned + ratio ≥ 0.6 → **priced-in** (orange)
  - Aligned + ratio < 0.6 → **partial** (green)
  - Opposed + ratio ≥ 0.6 → **divergent** (red)
  - Opposed or flat + small move → **fresh** (cyan)
  - Rating neutral → **n/a** (grey)
- **Why deterministic:** the math is the whole signal. An LLM here would just paraphrase numbers and add hallucination surface area for no benefit.

### 8. Trading (mock or real)
- `lib/broker.js` — factory; reads `$BROKER` to pick mock vs OANDA
- `lib/brokers/mock.js` — in-memory $100k portfolio with simulated per-pair spread, weighted-average entry, correct realized P&L on partial close / flip-through-zero (a bug the test suite caught and forced me to fix)
- `lib/brokers/oanda.js` — OANDA v20 skeleton; real REST calls are written out and commented in, ready to enable

---

## Data flow per request

A cold `/api/news` request triggers, in order:

```
parallel: [ Google News (8 × HTTP), Yahoo Finance (6 × HTTP) ]   ~1–2 s
sequential:
  scorer (sync, <5 ms)
  Gemini batched analyzer (1 × HTTP)                              ~3–6 s
  aggregator (sync, <5 ms)
  Gemini pair-rationale (1 × HTTP)                                ~2–4 s
  assessor (sync, <5 ms)
total wall clock: ~6–12 s on a cold load
```

Server-side cache: 5 minutes. The frontend auto-refresh interval is also 5 minutes, deliberately matched.

Trade endpoints (`/api/trade`, `/api/close`, `/api/portfolio`) reuse the cached Yahoo mid-price for instant mock fills — no extra network calls per trade.

---

## Cost & quota model

| Resource | Per cold refresh | Per cached refresh | Per trade |
|---|---|---|---|
| Google News HTTP | 8 | 0 | 0 |
| Yahoo Finance HTTP | 6 | 0 | 0 |
| Gemini API call | **2** | 0 | 0 |
| Mock broker | 0 | 0 | 0 (local) |

Gemini's `gemini-2.5-flash` free tier allows 5 requests/minute and 200/day. With a 5-minute cache, normal use is 24 cold refreshes/day = 48 Gemini calls/day — well under the daily cap and obviously under the per-minute cap.

---

## Design notes — why this shape

**Why a composed pipeline, not a single agent loop?**
The course is "AI Agents" so the natural temptation is to put everything inside one Gemini-with-tools loop. I considered it and decided against it for this domain:

- The pipeline is **deterministic in shape** (always news → rate → aggregate → assess). An agent loop with planning would just re-discover that shape every call, slower and less reliably.
- Each stage is **independently testable**. 63 unit tests cover the pure-logic modules cleanly; testing an agent loop is much harder.
- **Cost predictability**: exactly 2 LLM calls per refresh, not "however many the agent decides to plan for."
- **Failure isolation**: if Gemini rate-limits the rationale call, the per-headline ratings (and assessments and trades) still work. In a single loop, one failure usually kills the whole turn.

The LLM **does** earn its place — in the two stages (translating natural-language news into structured directional calls, and synthesizing a multi-source rationale paragraph) that genuinely require language understanding. The rest is keyword math and HTTP plumbing where an LLM would be a worse choice.

**Why OANDA-shaped mock instead of Robinhood?**
Robinhood doesn't support spot FX. OANDA does. The mock broker's interface mirrors OANDA's v20 REST API closely enough that the real broker is a single-file swap (`BROKER=oanda` env var + uncomment the HTTP bodies in `lib/brokers/oanda.js`).
