const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { assessAll } = require('../lib/assessor');

const pair = (rating) => ({ rating });
const quote = ({ changePct, rangePct, latest = 1.0, first = 1.0 } = {}) => ({
  changePct, rangePct, latest, first,
});

describe('assessor.assessAll', () => {
  test('missing quote → unavailable', () => {
    const out = assessAll({ 'EUR/USD': pair('weak buy') }, { 'EUR/USD': null });
    assert.equal(out['EUR/USD'].assessment.state, 'unavailable');
  });

  test('quote with error field → unavailable', () => {
    const out = assessAll(
      { 'EUR/USD': pair('weak buy') },
      { 'EUR/USD': { error: 'fetch failed' } }
    );
    assert.equal(out['EUR/USD'].assessment.state, 'unavailable');
    assert.match(out['EUR/USD'].assessment.reason, /fetch failed/);
  });

  test('neutral recommendation → na', () => {
    const out = assessAll(
      { 'EUR/USD': pair('neutral') },
      { 'EUR/USD': quote({ changePct: 1, rangePct: 1 }) }
    );
    assert.equal(out['EUR/USD'].assessment.state, 'na');
  });

  test('aligned + big move → priced-in (orange)', () => {
    // weak buy + +1% move + 1% range → halfRange=0.5, ratio=2 ≥ 0.6 → priced-in
    const out = assessAll(
      { 'EUR/USD': pair('weak buy') },
      { 'EUR/USD': quote({ changePct: 1, rangePct: 1 }) }
    );
    assert.equal(out['EUR/USD'].assessment.state, 'priced-in');
    assert.equal(out['EUR/USD'].assessment.label, 'Likely priced in');
  });

  test('aligned + small move → partial', () => {
    // weak buy + +0.1% move + 1% range → halfRange=0.5, ratio=0.2 < 0.6 → partial
    const out = assessAll(
      { 'EUR/USD': pair('weak buy') },
      { 'EUR/USD': quote({ changePct: 0.1, rangePct: 1 }) }
    );
    assert.equal(out['EUR/USD'].assessment.state, 'partial');
  });

  test('opposed + big move → divergent', () => {
    // weak buy + -1% move + 1% range → !aligned + significant → divergent
    const out = assessAll(
      { 'EUR/USD': pair('weak buy') },
      { 'EUR/USD': quote({ changePct: -1, rangePct: 1 }) }
    );
    assert.equal(out['EUR/USD'].assessment.state, 'divergent');
  });

  test('flat move → fresh', () => {
    const out = assessAll(
      { 'EUR/USD': pair('weak buy') },
      { 'EUR/USD': quote({ changePct: 0, rangePct: 1 }) }
    );
    assert.equal(out['EUR/USD'].assessment.state, 'fresh');
  });

  test('strong sale + opposite big move classified as divergent', () => {
    // strong sale = -2, but market moved +2% on 2% range → !aligned + significant
    const out = assessAll(
      { 'EUR/USD': pair('strong sale') },
      { 'EUR/USD': quote({ changePct: 2, rangePct: 2 }) }
    );
    assert.equal(out['EUR/USD'].assessment.state, 'divergent');
  });

  test('strong sale + aligned big move classified as priced-in', () => {
    const out = assessAll(
      { 'EUR/USD': pair('strong sale') },
      { 'EUR/USD': quote({ changePct: -2, rangePct: 2 }) }
    );
    assert.equal(out['EUR/USD'].assessment.state, 'priced-in');
  });

  test('preserves original pair info and attaches quote', () => {
    const pairs = { 'EUR/USD': { rating: 'weak buy', rationale: 'because' } };
    const quotes = { 'EUR/USD': quote({ changePct: 0, rangePct: 1 }) };
    const out = assessAll(pairs, quotes);
    assert.equal(out['EUR/USD'].rationale, 'because');
    assert.ok(out['EUR/USD'].quote);
  });

  test('SIG_RATIO threshold: 0.6 inclusive', () => {
    // Construct so ratio is exactly 0.6: changePct=0.3, rangePct=1 → halfRange=0.5 → ratio=0.6
    const out = assessAll(
      { 'EUR/USD': pair('weak buy') },
      { 'EUR/USD': quote({ changePct: 0.3, rangePct: 1 }) }
    );
    assert.equal(out['EUR/USD'].assessment.state, 'priced-in');
  });
});
