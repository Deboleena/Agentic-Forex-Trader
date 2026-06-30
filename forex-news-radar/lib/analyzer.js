const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

const PAIRS = ['EUR/USD', 'USD/JPY', 'GBP/USD', 'XAU/USD', 'AUD/USD', 'USD/CAD'];
const RATINGS = ['strong buy', 'weak buy', 'neutral', 'weak sale', 'strong sale'];

const PAIR_RATING_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: Object.fromEntries(
    PAIRS.map((p) => [
      p,
      {
        type: SchemaType.OBJECT,
        properties: {
          rating: { type: SchemaType.STRING, enum: RATINGS },
          reason: { type: SchemaType.STRING },
        },
        required: ['rating', 'reason'],
      },
    ])
  ),
  required: PAIRS,
};

const BATCH_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    results: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          headlineIndex: { type: SchemaType.INTEGER },
          ratings: PAIR_RATING_SCHEMA,
        },
        required: ['headlineIndex', 'ratings'],
      },
    },
  },
  required: ['results'],
};

const BATCH_SYSTEM_PROMPT = `You are a senior FX strategist. You receive a NUMBERED LIST of news
headlines and rate each one's directional impact on these currency pairs
over the next 1-3 trading days:

${PAIRS.map((p) => `- ${p}`).join('\n')}

Each rating is from the BASE currency's perspective (the first one):
- "strong buy"  = base likely to appreciate sharply vs quote
- "weak buy"    = base likely to appreciate mildly
- "neutral"     = no material directional impact
- "weak sale"   = base likely to depreciate mildly
- "strong sale" = base likely to depreciate sharply

For XAU/USD, "buy" means gold up / USD down; "sale" means gold down / USD up.

Be decisive but honest: most headlines are neutral for most pairs. Reserve
"strong" calls for headlines that directly hit a pair's drivers (rate
decisions, surprise CPI, central-bank intervention, major geopolitical shock).

Return JSON matching the schema. Include EXACTLY ONE result per input
headline, using its 0-based index. Each "reason" is ONE short sentence
(max 20 words).`;

const RATIONALE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: Object.fromEntries(
    PAIRS.map((p) => [p, { type: SchemaType.STRING }])
  ),
  required: PAIRS,
};

const RATIONALE_PROMPT = `You are an FX strategist briefing a trader. For each currency pair below
you are given its aggregate rating and the news headlines that drove it.
For each pair, write a SINGLE rationale paragraph (2-3 sentences, max 60 words)
explaining WHY the aggregate rating is what it is. Reference specific
drivers (Fed/ECB stance, inflation prints, geopolitics, etc.) — do not just
restate the rating. Be concrete and trader-focused.

Return strict JSON: one string per pair, keyed by the pair name.`;

function isConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  return new GoogleGenerativeAI(apiKey);
}

function neutralRatings(reason = 'analysis unavailable') {
  return Object.fromEntries(PAIRS.map((p) => [p, { rating: 'neutral', reason }]));
}

async function analyzeItems(items) {
  if (!isConfigured()) {
    return items.map((it) => ({ ...it, ratings: neutralRatings('GEMINI_API_KEY not set') }));
  }
  if (!items.length) return items;

  const model = getGenAI().getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    systemInstruction: BATCH_SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: BATCH_SCHEMA,
      temperature: 0.2,
    },
  });

  const prompt = items.map((it, i) =>
    `[${i}] "${it.title}" — ${it.source} — ${it.pubDate}\n    ${it.description || '(no description)'}`
  ).join('\n\n');

  try {
    const result = await model.generateContent(prompt);
    const { results } = JSON.parse(result.response.text());
    const byIndex = new Map(results.map((r) => [r.headlineIndex, r.ratings]));
    return items.map((it, i) => ({
      ...it,
      ratings: byIndex.get(i) || neutralRatings('missing from model response'),
    }));
  } catch (err) {
    console.error('batched analyzer failed:', err.message);
    const reason = `analysis error: ${err.message.slice(0, 120)}`;
    return items.map((it) => ({ ...it, ratings: neutralRatings(reason) }));
  }
}

async function synthesizePairRationales(pairsObj) {
  const fallback = (msg) => Object.fromEntries(PAIRS.map((p) => [p, msg]));
  if (!isConfigured()) return fallback('AI rationale unavailable (GEMINI_API_KEY not set).');

  const model = getGenAI().getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    systemInstruction: RATIONALE_PROMPT,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RATIONALE_SCHEMA,
      temperature: 0.3,
    },
  });

  const sections = PAIRS.map((pair) => {
    const p = pairsObj[pair];
    if (!p) return `${pair}: no data.`;
    const top = (p.contributors || []).slice(0, 5);
    const lines = top.map(
      (c) => `  - "${c.title}" → ${c.rating}: ${c.reason}`
    ).join('\n');
    return `${pair} — aggregate: ${p.rating} (score ${p.score})\n${lines || '  (no contributing headlines)'}`;
  }).join('\n\n');

  try {
    const result = await model.generateContent(sections);
    return JSON.parse(result.response.text());
  } catch (err) {
    console.error('rationale synthesis failed:', err.message);
    return fallback(`AI rationale error: ${err.message.slice(0, 120)}`);
  }
}

module.exports = {
  analyzeItems,
  synthesizePairRationales,
  isConfigured,
  PAIRS,
  RATINGS,
};
