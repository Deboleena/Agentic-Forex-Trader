const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

// Save/restore env so tests don't leak state.
let savedKey;
before(() => { savedKey = process.env.GEMINI_API_KEY; });
after(() => {
  if (savedKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = savedKey;
});

const { isConfigured, analyzeItems, PAIRS, RATINGS } = require('../lib/analyzer');

describe('analyzer module exports', () => {
  test('exports the 6 covered pairs', () => {
    assert.deepEqual(PAIRS, ['EUR/USD', 'USD/JPY', 'GBP/USD', 'XAU/USD', 'AUD/USD', 'USD/CAD']);
  });

  test('exports the 5-point rating scale', () => {
    assert.deepEqual(RATINGS, ['strong buy', 'weak buy', 'neutral', 'weak sale', 'strong sale']);
  });
});

describe('analyzer.isConfigured', () => {
  test('false when GEMINI_API_KEY not set', () => {
    delete process.env.GEMINI_API_KEY;
    assert.equal(isConfigured(), false);
  });

  test('true when GEMINI_API_KEY set', () => {
    process.env.GEMINI_API_KEY = 'test-key-not-used';
    assert.equal(isConfigured(), true);
    delete process.env.GEMINI_API_KEY;
  });
});

describe('analyzer.analyzeItems (offline fallback)', () => {
  test('without key returns items with all-neutral ratings and the right reason', async () => {
    delete process.env.GEMINI_API_KEY;
    const items = [
      { title: 'Fed signals hike', source: 'Reuters', pubDate: new Date().toISOString(), description: '' },
    ];
    const out = await analyzeItems(items);
    assert.equal(out.length, 1);
    for (const pair of PAIRS) {
      assert.equal(out[0].ratings[pair].rating, 'neutral');
      assert.match(out[0].ratings[pair].reason, /GEMINI_API_KEY/);
    }
  });

  test('empty input yields empty output', async () => {
    delete process.env.GEMINI_API_KEY;
    const out = await analyzeItems([]);
    assert.deepEqual(out, []);
  });
});
