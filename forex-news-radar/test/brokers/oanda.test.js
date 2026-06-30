const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const OandaBroker = require('../../lib/brokers/oanda');

describe('OandaBroker', () => {
  test('constructor throws when apiKey missing', () => {
    assert.throws(() => new OandaBroker({ accountId: '101-001-1234567-001' }), /OANDA_API_KEY/);
  });

  test('constructor throws when accountId missing', () => {
    assert.throws(() => new OandaBroker({ apiKey: 'x' }), /OANDA_ACCOUNT_ID/);
  });

  test('practice flag defaults to true and selects fxpractice base URL', () => {
    const b = new OandaBroker({ apiKey: 'x', accountId: 'y' });
    assert.match(b.base, /api-fxpractice\.oanda\.com$/);
    assert.equal(b.kind, 'oanda');
  });

  test('practice:false selects live fxtrade base URL', () => {
    const b = new OandaBroker({ apiKey: 'x', accountId: 'y', practice: false });
    assert.match(b.base, /api-fxtrade\.oanda\.com$/);
  });

  test('placeOrder is a stub (not yet implemented)', async () => {
    const b = new OandaBroker({ apiKey: 'x', accountId: 'y' });
    await assert.rejects(
      b.placeOrder({ pair: 'EUR/USD', side: 'buy', units: 1000 }),
      /not implemented/
    );
  });

  test('closePosition is a stub', async () => {
    const b = new OandaBroker({ apiKey: 'x', accountId: 'y' });
    await assert.rejects(b.closePosition('EUR/USD'), /not implemented/);
  });

  test('getPortfolio is a stub', async () => {
    const b = new OandaBroker({ apiKey: 'x', accountId: 'y' });
    await assert.rejects(b.getPortfolio(), /not implemented/);
  });
});
