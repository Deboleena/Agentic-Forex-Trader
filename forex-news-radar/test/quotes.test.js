const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { SYMBOL_MAP } = require('../lib/quotes');

describe('quotes.SYMBOL_MAP', () => {
  test('has an entry for every covered pair', () => {
    for (const pair of ['EUR/USD', 'USD/JPY', 'GBP/USD', 'XAU/USD', 'AUD/USD', 'USD/CAD']) {
      assert.ok(SYMBOL_MAP[pair], `missing ticker for ${pair}`);
    }
  });

  test('XAU/USD uses GC=F (gold futures) — XAUUSD=X is unreliable on Yahoo', () => {
    assert.equal(SYMBOL_MAP['XAU/USD'], 'GC=F');
  });

  test('FX pairs use Yahoo =X form', () => {
    assert.equal(SYMBOL_MAP['EUR/USD'], 'EURUSD=X');
    assert.equal(SYMBOL_MAP['USD/JPY'], 'USDJPY=X');
    assert.equal(SYMBOL_MAP['GBP/USD'], 'GBPUSD=X');
    assert.equal(SYMBOL_MAP['AUD/USD'], 'AUDUSD=X');
    assert.equal(SYMBOL_MAP['USD/CAD'], 'USDCAD=X');
  });
});
