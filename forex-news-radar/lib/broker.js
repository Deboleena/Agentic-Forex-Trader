const MockBroker = require('./brokers/mock');
const OandaBroker = require('./brokers/oanda');

// Single broker instance for the process. Pick implementation via BROKER env var.
let instance = null;

function getBroker() {
  if (instance) return instance;
  const kind = (process.env.BROKER || 'mock').toLowerCase();
  if (kind === 'oanda') {
    instance = new OandaBroker({
      apiKey: process.env.OANDA_API_KEY,
      accountId: process.env.OANDA_ACCOUNT_ID,
      practice: (process.env.OANDA_ENV || 'practice') !== 'live',
    });
  } else {
    instance = new MockBroker({ startingCash: 100_000 });
  }
  return instance;
}

module.exports = { getBroker };
