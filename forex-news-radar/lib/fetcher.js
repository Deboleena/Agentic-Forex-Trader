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
  return String(title).replace(/\s+-\s+[^-]+$/, '').trim();
}

function cleanDescription(html = '') {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchForexNews() {
  const batches = await Promise.allSettled(FOREX_QUERIES.map(fetchQuery));
  const all = batches.flatMap((b) => (b.status === 'fulfilled' ? b.value : []));

  const seen = new Map();
  for (const item of all) {
    const key = item.title.toLowerCase();
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()];
}

module.exports = { fetchForexNews };
