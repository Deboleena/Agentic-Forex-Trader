// Real OANDA v20 broker — skeleton.
//
// To wire this up:
//   1. Open a free practice account at https://www.oanda.com/account/login
//   2. Generate an API token in the "Manage API Access" page.
//   3. Copy your account id (looks like 101-001-1234567-001).
//   4. Set env vars before `npm start`:
//        BROKER=oanda
//        OANDA_API_KEY=...
//        OANDA_ACCOUNT_ID=101-001-1234567-001
//        OANDA_ENV=practice          # or 'live'
//   5. Uncomment the axios calls below and remove the `throw` stubs.
//
// API reference: https://developer.oanda.com/rest-live-v20/introduction/
//
// Instrument names use underscore form: EUR_USD, USD_JPY, XAU_USD, etc.
// Units are signed integers — positive = long, negative = short.

const axios = require('axios');

const PAIR_TO_INSTRUMENT = {
  'EUR/USD': 'EUR_USD',
  'USD/JPY': 'USD_JPY',
  'GBP/USD': 'GBP_USD',
  'XAU/USD': 'XAU_USD',
  'AUD/USD': 'AUD_USD',
  'USD/CAD': 'USD_CAD',
};

class OandaBroker {
  constructor({ apiKey, accountId, practice = true } = {}) {
    if (!apiKey) throw new Error('OANDA_API_KEY not set');
    if (!accountId) throw new Error('OANDA_ACCOUNT_ID not set');
    this.kind = 'oanda';
    this.accountId = accountId;
    this.base = practice
      ? 'https://api-fxpractice.oanda.com'
      : 'https://api-fxtrade.oanda.com';
    this.http = axios.create({
      baseURL: this.base,
      timeout: 10_000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept-Datetime-Format': 'RFC3339',
      },
    });
  }

  _instrument(pair) {
    const i = PAIR_TO_INSTRUMENT[pair];
    if (!i) throw new Error(`no OANDA instrument for ${pair}`);
    return i;
  }

  async placeOrder({ pair, side, units /* , mid (ignored — OANDA quotes itself) */ }) {
    // POST /v3/accounts/{accountId}/orders
    // Body: { order: { type: 'MARKET', instrument, units: signed string, timeInForce: 'FOK', positionFill: 'DEFAULT' } }
    throw new Error(
      'OandaBroker.placeOrder not implemented. ' +
      'Uncomment the body below and remove this throw.'
    );

    /*
    const instrument = this._instrument(pair);
    const signed = side === 'buy' ? Math.abs(units) : -Math.abs(units);
    const { data } = await this.http.post(
      `/v3/accounts/${this.accountId}/orders`,
      {
        order: {
          type: 'MARKET',
          instrument,
          units: String(signed),
          timeInForce: 'FOK',
          positionFill: 'DEFAULT',
        },
      }
    );
    const fill = data.orderFillTransaction;
    return {
      orderId: fill?.id ?? data.orderCreateTransaction?.id,
      pair,
      side,
      units: Math.abs(units),
      fillPrice: Number(fill?.price),
      ts: fill?.time,
    };
    */
  }

  async closePosition(pair /* , midByPair (ignored) */) {
    // PUT /v3/accounts/{accountId}/positions/{instrument}/close
    throw new Error('OandaBroker.closePosition not implemented.');

    /*
    const instrument = this._instrument(pair);
    const { data } = await this.http.put(
      `/v3/accounts/${this.accountId}/positions/${instrument}/close`,
      { longUnits: 'ALL', shortUnits: 'ALL' }
    );
    return data;
    */
  }

  async getPortfolio(/* midByPair */) {
    // GET /v3/accounts/{accountId}    → account summary + positions
    throw new Error('OandaBroker.getPortfolio not implemented.');

    /*
    const { data } = await this.http.get(`/v3/accounts/${this.accountId}`);
    const a = data.account;
    return {
      kind: this.kind,
      cash: Number(a.balance),
      unrealizedPL: Number(a.unrealizedPL),
      equity: Number(a.NAV),
      positions: a.positions
        .filter((p) => Number(p.long.units) !== 0 || Number(p.short.units) !== 0)
        .map((p) => {
          const longU = Number(p.long.units);
          const shortU = Number(p.short.units);
          const net = longU + shortU;
          return {
            pair: Object.keys(PAIR_TO_INSTRUMENT).find(
              (k) => PAIR_TO_INSTRUMENT[k] === p.instrument
            ) || p.instrument,
            units: net,
            avgPrice: net > 0 ? Number(p.long.averagePrice) : Number(p.short.averagePrice),
            unrealizedPL: Number(p.unrealizedPL),
          };
        }),
      orders: [],
    };
    */
  }
}

module.exports = OandaBroker;
