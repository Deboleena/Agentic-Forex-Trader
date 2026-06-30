const WEIGHTS = [
  { re: /\b(federal reserve|fomc|fed\b|jerome powell)\b/i, w: 10, tag: 'Fed' },
  { re: /\b(ecb|european central bank|lagarde)\b/i, w: 9, tag: 'ECB' },
  { re: /\b(bank of japan|boj|ueda)\b/i, w: 9, tag: 'BOJ' },
  { re: /\b(bank of england|boe|bailey)\b/i, w: 8, tag: 'BOE' },
  { re: /\b(pboc|people'?s bank of china)\b/i, w: 8, tag: 'PBOC' },
  { re: /\b(snb|swiss national bank|rba|rbnz|boc|bank of canada)\b/i, w: 7, tag: 'CB' },
  { re: /\b(rate (hike|cut|decision|hold)|interest rate|monetary policy)\b/i, w: 8, tag: 'Rates' },

  { re: /\b(cpi|inflation|core pce|ppi)\b/i, w: 8, tag: 'Inflation' },
  { re: /\b(non[- ]?farm payrolls|nfp|unemployment rate|jobs report)\b/i, w: 8, tag: 'Jobs' },
  { re: /\b(gdp|growth forecast|recession)\b/i, w: 6, tag: 'Growth' },
  { re: /\b(trade (deficit|surplus|balance)|tariffs?|trade war)\b/i, w: 6, tag: 'Trade' },

  { re: /\b(forex|fx market|currency (war|peg|crisis)|exchange rate|devaluation|intervention)\b/i, w: 7, tag: 'FX' },
  { re: /\b(usd|dollar|eur|euro|yen|jpy|gbp|sterling|cny|yuan|chf|aud|cad)\b/i, w: 4, tag: 'Currency' },

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
