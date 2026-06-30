const RATING_TO_NUM = {
  'strong buy': 2,
  'weak buy': 1,
  neutral: 0,
  'weak sale': -1,
  'strong sale': -2,
};

// Move (as % of price) above which we say "significant relative to typical 48h range".
// Computed as: |move| compared to half the 48h high-low range.
const SIG_RATIO = 0.6;

function assessPair(pairInfo, quote) {
  if (!quote || quote.error) {
    return {
      state: 'unavailable',
      label: 'Price data unavailable',
      reason: quote?.error || 'no quote',
    };
  }

  const recNum = RATING_TO_NUM[pairInfo.rating] ?? 0;
  const moveSign = Math.sign(quote.changePct);
  const halfRange = Math.max(quote.rangePct / 2, 0.05);
  const magnitudeRatio = Math.abs(quote.changePct) / halfRange;
  const significant = magnitudeRatio >= SIG_RATIO;

  let state;
  let label;
  let reason;

  if (Math.abs(recNum) < 1) {
    state = 'na';
    label = 'No directional call';
    reason = `Gemini said neutral; 48h move ${fmtPct(quote.changePct)} not evaluated.`;
  } else {
    const recSign = Math.sign(recNum);
    const aligned = recSign === moveSign && moveSign !== 0;

    if (aligned && significant) {
      state = 'priced-in';
      label = 'Likely priced in';
      reason = `Market already moved ${fmtPct(quote.changePct)} with the thesis (${(magnitudeRatio).toFixed(1)}× the typical half-range). Chasing risks late entry.`;
    } else if (aligned && !significant) {
      state = 'partial';
      label = 'Partially expressed';
      reason = `Move (${fmtPct(quote.changePct)}) is aligned with the call but small vs 48h range. Thesis still has room.`;
    } else if (!aligned && significant) {
      state = 'divergent';
      label = 'Market diverges';
      reason = `Price moved ${fmtPct(quote.changePct)} AGAINST the call — meaningful magnitude. Either thesis is wrong or market is mispriced.`;
    } else {
      state = 'fresh';
      label = 'Fresh — not yet in price';
      reason = `Price is roughly flat (${fmtPct(quote.changePct)}). Thesis is not yet expressed in the market.`;
    }
  }

  return {
    state,
    label,
    reason,
    changePct: round(quote.changePct, 3),
    rangePct: round(quote.rangePct, 3),
    magnitudeRatio: round(magnitudeRatio, 2),
    latest: quote.latest,
    first: quote.first,
  };
}

function assessAll(pairs, quotes) {
  const out = {};
  for (const [pair, info] of Object.entries(pairs)) {
    const a = assessPair(info, quotes[pair]);
    out[pair] = { ...info, assessment: a, quote: quotes[pair] };
  }
  return out;
}

function fmtPct(n) {
  if (!Number.isFinite(n)) return 'n/a';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function round(n, p = 2) {
  if (!Number.isFinite(n)) return null;
  const m = 10 ** p;
  return Math.round(n * m) / m;
}

module.exports = { assessAll };
