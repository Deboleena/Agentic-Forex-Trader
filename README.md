# Agentic Forex Trader

> **Capstone — "AI Agents: Intensive Vibe Coding"**

A small but end-to-end agentic system that reads the day's international news, asks an LLM to translate each headline into a directional FX call on six major pairs, checks whether the market has already moved in that direction, and lets the user paper-trade against the resulting signal — all in one dashboard.

The "agent" here is a deliberately small composed pipeline rather than a single autonomous loop: each LLM call has a narrow, testable job, and the orchestration around it is plain JavaScript. The point of the project was to learn where an LLM **earns its place** in a real pipeline versus where deterministic code is the better tool.

---

## What it does, in one screen

1. Pulls the top ~10 international news stories from **Google News RSS** that are relevant to FX (Fed, ECB, BOJ, CPI, NFP, geopolitics, …) and keyword-scores them.
2. Sends those 10 headlines to **Google Gemini** (batched into one call) and asks for a 5-point directional rating (`strong buy → strong sale`) on each of: **EUR/USD, USD/JPY, GBP/USD, XAU/USD, AUD/USD, USD/CAD**.
3. **Aggregates** the per-headline ratings into one signal per pair using a news-impact-weighted average.
4. Sends the aggregated pair ratings + their driving headlines back to Gemini for a **2–3 sentence rationale** per pair.
5. Pulls the last 48 hours of **hourly OHLC from Yahoo Finance** for each pair and classifies whether the market has already moved with the call — `priced-in` / `partial` / `fresh` / `divergent` / `n/a`.
6. Lets the user click **Buy / Sell / Close** to paper-trade through a built-in **mock broker** (OANDA-v20-shaped so a real-broker swap is one file).

The dashboard auto-refreshes every 5 minutes; the manual Refresh button resets that timer.

---

## Repo layout

```
Agentic-Forex-Trader/
├── README.md             ← you are here (capstone overview)
├── ARCHITECTURE.md       ← pipeline diagram + per-stage breakdown
├── REFLECTION.md         ← vibe-coding retrospective
├── LICENSE               ← MIT
├── prompts.txt           ← every user prompt in the build, in order
├── .gitignore            ← keeps token.txt + node_modules out of git
├── forex-news-radar/     ← the Node.js app
│   ├── README.md         ← how to run + use the UI
│   ├── server.js
│   ├── lib/              ← pipeline modules (one job each)
│   ├── public/           ← frontend (vanilla HTML/CSS/JS)
│   └── test/             ← 63-test unit suite (node:test)
└── Skills/
    └── forex-news-rader.md  ← original spec / design doc
```

---

## Run it

```bash
cd forex-news-radar
npm install
export GEMINI_API_KEY=your-google-ai-studio-key   # free tier works
npm start
# open http://localhost:3000
```

Full operator manual (UI tour, assessment chip meanings, trade endpoints, troubleshooting, swap-to-real-OANDA recipe) is in [`forex-news-radar/README.md`](forex-news-radar/README.md).

## Test it

```bash
cd forex-news-radar
npm test    # 63 tests / 10 suites / ~70 ms, zero new dependencies
```

---

## What's in the demo (screenshots to capture)

For the submission, capture these UI states:

1. **Cold load** — header showing `AI: Gemini` badge + `Broker: mock` badge + auto-refresh countdown
2. **Pair grid** — all 6 cards with their aggregate rating chip, sparkline, 48h % change, and assessment chip in a visible mix of colors
3. **Expanded pair card** — assessment reason + Gemini's "Why this call" rationale + top driving headlines with per-pair reasons
4. **Headline row** — one headline showing its 3-column per-pair takes grid (pair × rating × brief reason for all 6 pairs)
5. **Portfolio panel after a trade** — one long and one short position with live P&L and Close buttons

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js 18+, Express | Standard, zero ceremony |
| LLM | Google Gemini (`gemini-2.5-flash`) via `@google/generative-ai` | Free tier covers normal use; structured-output schema means no fragile JSON parsing |
| News | Google News RSS (no key) | Free, reliable, real |
| Quotes | Yahoo Finance v8 chart API (no key) | Free, no signup; gold uses `GC=F` because `XAUUSD=X` returns empty |
| Trading | In-memory mock broker (OANDA v20 skeleton ready) | No real-money risk; swap to real broker by flipping `$BROKER` |
| Frontend | Vanilla HTML/CSS/JS, no build step | Reviewer can `npm start` and see it work |
| Tests | Node's built-in `node:test` runner | Zero new dependencies; runs in <100 ms |

Architecture deep-dive and per-stage rationale in [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## How this was built — and with what

This project was built in one extended pair-programming session with Antigravity Code. The course's default tool was Google Antigravity; I substituted Antigravity because I'd already paid for Antigravity tokens and wanted to compare the experience against Cursor/Antigravity-style flows.

The full conversation — every prompt I typed, in order, typos and all — is preserved verbatim in [`prompts.txt`](prompts.txt). It's a useful artifact for grading because the build's structure mirrors the prompt order: you can read it as a transcript of how the design evolved through iteration, including a couple of dead ends (e.g. asking for ADK and being talked out of it, asking for Robinhood and being told it doesn't support FX).

A more reflective retrospective on the vibe-coding process — what worked, what I had to redirect, the real bug a test caught — is in [`REFLECTION.md`](REFLECTION.md).

---

## License

MIT. See [`LICENSE`](LICENSE).

## Acknowledgments

- Google News, Yahoo Finance, and Google AI Studio for free public APIs.
- The OANDA v20 REST API documentation for the broker interface design.
- Course staff for the assignment scope.
