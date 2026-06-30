const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { aggregateByPair } = require('../lib/aggregator');
const { PAIRS } = require('../lib/analyzer');

const ALL_NEUTRAL = Object.fromEntries(
  PAIRS.map((p) => [p, { rating: 'neutral', reason: '' }])
);

function item({ score = 10, ratings = ALL_NEUTRAL, title = 't', link = 'l', source = 's' } = {}) {
  return { title, link, source, score, ratings };
}

describe('aggregator.aggregateByPair', () => {
  test('empty items returns all 6 pairs as neutral with score 0', () => {
    const out = aggregateByPair([]);
    assert.deepEqual(Object.keys(out).sort(), [...PAIRS].sort());
    for (const p of PAIRS) {
      assert.equal(out[p].rating, 'neutral');
      assert.equal(out[p].score, 0);
      assert.deepEqual(out[p].contributors, []);
    }
  });

  test('single strong-buy item produces strong-buy aggregate', () => {
    const ratings = { ...ALL_NEUTRAL, 'EUR/USD': { rating: 'strong buy', reason: 'r' } };
    const out = aggregateByPair([item({ ratings, score: 10 })]);
    assert.equal(out['EUR/USD'].rating, 'strong buy');
    assert.equal(out['EUR/USD'].score, 2);
  });

  test('two items in opposite directions with equal weight cancel to neutral', () => {
    const buy = { ...ALL_NEUTRAL, 'EUR/USD': { rating: 'strong buy', reason: '' } };
    const sale = { ...ALL_NEUTRAL, 'EUR/USD': { rating: 'strong sale', reason: '' } };
    const out = aggregateByPair([item({ ratings: buy }), item({ ratings: sale })]);
    assert.equal(out['EUR/USD'].rating, 'neutral');
    assert.equal(out['EUR/USD'].score, 0);
  });

  test('boundary: avg ≥ 1.25 maps to strong buy, < 1.25 to weak buy', () => {
    // two items with weak buy (+1) + strong buy (+2), equal weight = +1.5 → strong buy
    const strong = { ...ALL_NEUTRAL, 'EUR/USD': { rating: 'strong buy', reason: '' } };
    const weak = { ...ALL_NEUTRAL, 'EUR/USD': { rating: 'weak buy', reason: '' } };
    const out = aggregateByPair([item({ ratings: strong }), item({ ratings: weak })]);
    assert.equal(out['EUR/USD'].score, 1.5);
    assert.equal(out['EUR/USD'].rating, 'strong buy');

    // three weak-buy items = avg 1.0 → weak buy (below 1.25 threshold)
    const out2 = aggregateByPair([
      item({ ratings: weak }), item({ ratings: weak }), item({ ratings: weak }),
    ]);
    assert.equal(out2['EUR/USD'].rating, 'weak buy');
  });

  test('boundary: avg 0.4 weak buy, avg 0.39 neutral', () => {
    // 1 weak buy + 9 neutral, all equal weight → avg = 1/10 = 0.1 → neutral
    const weak = { ...ALL_NEUTRAL, 'EUR/USD': { rating: 'weak buy', reason: '' } };
    const items = [weak, ...Array(9).fill(ALL_NEUTRAL)].map((r) => item({ ratings: r }));
    assert.equal(aggregateByPair(items)['EUR/USD'].rating, 'neutral');
  });

  test('higher-weight item dominates the aggregate', () => {
    const buyHi = { ...ALL_NEUTRAL, 'EUR/USD': { rating: 'strong buy', reason: '' } };
    const saleLo = { ...ALL_NEUTRAL, 'EUR/USD': { rating: 'strong sale', reason: '' } };
    const out = aggregateByPair([
      item({ ratings: buyHi, score: 30 }),
      item({ ratings: saleLo, score: 1 }),
    ]);
    // weighted avg = (2*30 + (-2)*1) / 31 ≈ 1.87 → strong buy
    assert.equal(out['EUR/USD'].rating, 'strong buy');
    assert.ok(out['EUR/USD'].score > 1.5);
  });

  test('zero-score items still contribute (weight floor of 0.1)', () => {
    const buy = { ...ALL_NEUTRAL, 'EUR/USD': { rating: 'weak buy', reason: '' } };
    const out = aggregateByPair([item({ ratings: buy, score: 0 })]);
    assert.equal(out['EUR/USD'].score, 1); // (1 * 0.1) / 0.1 = 1
    assert.equal(out['EUR/USD'].rating, 'weak buy');
  });

  test('items missing rating for a pair are skipped for that pair', () => {
    const ratings = { 'EUR/USD': { rating: 'strong buy', reason: '' } }; // only EUR/USD
    const out = aggregateByPair([item({ ratings })]);
    assert.equal(out['EUR/USD'].rating, 'strong buy');
    // Other pairs had no data → neutral
    assert.equal(out['USD/JPY'].rating, 'neutral');
    assert.equal(out['USD/JPY'].contributors.length, 0);
  });

  test('contributors are sorted by magnitude × newsScore (descending)', () => {
    const strong = { ...ALL_NEUTRAL, 'EUR/USD': { rating: 'strong buy', reason: '' } };
    const weak = { ...ALL_NEUTRAL, 'EUR/USD': { rating: 'weak buy', reason: '' } };
    const out = aggregateByPair([
      item({ ratings: weak, score: 50, title: 'weak-big-news' }),
      item({ ratings: strong, score: 5, title: 'strong-small-news' }),
    ]);
    const titles = out['EUR/USD'].contributors.map((c) => c.title);
    // |1| * 50 = 50 vs |2| * 5 = 10 → weak-big-news first
    assert.deepEqual(titles, ['weak-big-news', 'strong-small-news']);
  });
});
