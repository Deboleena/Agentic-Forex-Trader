const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

// broker.js memoizes the instance per process, so we must reset
// require's cache around tests that change the BROKER env var.
function freshGetBroker() {
  delete require.cache[require.resolve('../lib/broker')];
  return require('../lib/broker').getBroker;
}

let savedBroker;
before(() => { savedBroker = process.env.BROKER; });
after(() => {
  if (savedBroker === undefined) delete process.env.BROKER;
  else process.env.BROKER = savedBroker;
});

describe('broker factory', () => {
  test('defaults to MockBroker when BROKER is unset', () => {
    delete process.env.BROKER;
    const getBroker = freshGetBroker();
    const b = getBroker();
    assert.equal(b.kind, 'mock');
  });

  test('returns the SAME instance on repeated calls (singleton)', () => {
    delete process.env.BROKER;
    const getBroker = freshGetBroker();
    assert.strictEqual(getBroker(), getBroker());
  });

  test('BROKER=oanda picks the OandaBroker; throws without creds', () => {
    process.env.BROKER = 'oanda';
    delete process.env.OANDA_API_KEY;
    delete process.env.OANDA_ACCOUNT_ID;
    const getBroker = freshGetBroker();
    assert.throws(() => getBroker(), /OANDA_API_KEY/);
  });

  test('BROKER=oanda with creds constructs successfully', () => {
    process.env.BROKER = 'oanda';
    process.env.OANDA_API_KEY = 'x';
    process.env.OANDA_ACCOUNT_ID = 'y';
    const getBroker = freshGetBroker();
    const b = getBroker();
    assert.equal(b.kind, 'oanda');
    delete process.env.OANDA_API_KEY;
    delete process.env.OANDA_ACCOUNT_ID;
  });
});
