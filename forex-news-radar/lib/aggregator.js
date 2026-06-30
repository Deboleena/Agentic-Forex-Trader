const { PAIRS } = require('./analyzer');

const RATING_TO_NUM = {
  'strong buy': 2,
  'weak buy': 1,
  neutral: 0,
  'weak sale': -1,
  'strong sale': -2,
};

function numToRating(n) {
  if (n >= 1.25) return 'strong buy';
  if (n >= 0.4) return 'weak buy';
  if (n <= -1.25) return 'strong sale';
  if (n <= -0.4) return 'weak sale';
  return 'neutral';
}

function aggregateByPair(items) {
  const out = {};
  for (const pair of PAIRS) {
    let weightedSum = 0;
    let weightTotal = 0;
    const contributors = [];

    for (const item of items) {
      const r = item.ratings?.[pair];
      if (!r) continue;
      const num = RATING_TO_NUM[r.rating];
      if (num === undefined) continue;

      const w = Math.max(item.score || 0, 0.1);
      weightedSum += num * w;
      weightTotal += w;

      contributors.push({
        title: item.title,
        link: item.link,
        source: item.source,
        rating: r.rating,
        reason: r.reason,
        newsScore: item.score,
      });
    }

    const avg = weightTotal > 0 ? weightedSum / weightTotal : 0;
    out[pair] = {
      pair,
      rating: numToRating(avg),
      score: Number(avg.toFixed(2)),
      contributors: contributors.sort((a, b) => {
        const magA = Math.abs(RATING_TO_NUM[a.rating] || 0) * (a.newsScore || 0);
        const magB = Math.abs(RATING_TO_NUM[b.rating] || 0) * (b.newsScore || 0);
        return magB - magA;
      }),
    };
  }
  return out;
}

module.exports = { aggregateByPair };
