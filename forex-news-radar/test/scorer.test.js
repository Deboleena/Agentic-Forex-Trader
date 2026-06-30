const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { rankTopTen } = require('../lib/scorer');

const now = () => new Date().toISOString();
const old = () => new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(); // 72h ago

describe('scorer.rankTopTen', () => {
  test('empty input returns empty array', () => {
    assert.deepEqual(rankTopTen([]), []);
  });

  test('item with no keywords and old timestamp is filtered out', () => {
    const out = rankTopTen([
      { title: 'Cat video goes viral', description: '', pubDate: old() },
    ]);
    assert.equal(out.length, 0);
  });

  test('Fed keyword adds 10 + Fed tag', () => {
    const out = rankTopTen([
      { title: 'Federal Reserve signals decision', description: '', pubDate: old() },
    ]);
    assert.equal(out.length, 1);
    assert.ok(out[0].tags.includes('Fed'));
    assert.ok(out[0].score >= 10);
  });

  test('multiple keywords stack and produce multiple tags', () => {
    const out = rankTopTen([
      { title: 'Fed CPI rate hike on inflation', description: '', pubDate: old() },
    ]);
    const tags = out[0].tags;
    assert.ok(tags.includes('Fed'));
    assert.ok(tags.includes('Rates'));
    assert.ok(tags.includes('Inflation'));
    // 10 (Fed) + 8 (Rates) + 8 (Inflation) = 26 minimum
    assert.ok(out[0].score >= 26, `expected ≥26, got ${out[0].score}`);
  });

  test('recent items get up to ~5 point recency boost', () => {
    const fresh = rankTopTen([
      { title: 'Fed news', description: '', pubDate: now() },
    ])[0];
    const stale = rankTopTen([
      { title: 'Fed news', description: '', pubDate: old() },
    ])[0];
    assert.ok(fresh.score > stale.score, 'fresh should outscore stale');
    assert.ok(fresh.score - stale.score <= 5.01, 'recency boost capped at 5');
  });

  test('returns at most 10 items, sorted descending by score', () => {
    const items = Array.from({ length: 15 }, (_, i) => ({
      title: i % 2 ? 'Fed inflation' : 'ECB euro',
      description: '',
      pubDate: now(),
    }));
    const out = rankTopTen(items);
    assert.equal(out.length, 10);
    for (let i = 1; i < out.length; i++) {
      assert.ok(out[i - 1].score >= out[i].score, `out[${i-1}] !>= out[${i}]`);
    }
  });

  test('description text also contributes to matching', () => {
    const out = rankTopTen([
      { title: 'Some headline', description: 'Federal Reserve action expected', pubDate: old() },
    ]);
    assert.equal(out.length, 1);
    assert.ok(out[0].tags.includes('Fed'));
  });
});
