const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const MockBroker = require('../../lib/brokers/mock');

const EPS = 1e-6;
const approx = (a, b, eps = EPS) => Math.abs(a - b) < eps;

describe('MockBroker', () => {
  test('starts with cash = startingCash and no positions', async () => {
    const b = new MockBroker({ startingCash: 100_000 });
    const pf = await b.getPortfolio({});
    assert.equal(pf.cash, 100_000);
    assert.equal(pf.equity, 100_000);
    assert.equal(pf.positions.length, 0);
    assert.equal(pf.kind, 'mock');
  });

  test('quoteFromMid produces symmetric bid/ask around mid', () => {
    const b = new MockBroker();
    const q = b.quoteFromMid('EUR/USD', 1.1000);
    assert.equal(q.mid, 1.1000);
    assert.ok(q.ask > q.mid);
    assert.ok(q.bid < q.mid);
    assert.ok(approx(q.ask - q.mid, q.mid - q.bid));
  });

  test('buy fills at ask (mid + half-spread)', async () => {
    const b = new MockBroker();
    const order = await b.placeOrder({ pair: 'EUR/USD', side: 'buy', units: 10_000, mid: 1.1000 });
    assert.equal(order.side, 'buy');
    assert.equal(order.units, 10_000);
    assert.ok(approx(order.fillPrice, 1.10005));
  });

  test('sell fills at bid (mid - half-spread)', async () => {
    const b = new MockBroker();
    const order = await b.placeOrder({ pair: 'EUR/USD', side: 'sell', units: 10_000, mid: 1.1000 });
    assert.ok(approx(order.fillPrice, 1.09995));
  });

  test('bad side throws', async () => {
    const b = new MockBroker();
    await assert.rejects(
      b.placeOrder({ pair: 'EUR/USD', side: 'hodl', units: 10_000, mid: 1.1 }),
      /bad side/
    );
  });

  test('bad units throws', async () => {
    const b = new MockBroker();
    await assert.rejects(b.placeOrder({ pair: 'EUR/USD', side: 'buy', units: 0, mid: 1 }), /units/);
    await assert.rejects(b.placeOrder({ pair: 'EUR/USD', side: 'buy', units: -5, mid: 1 }), /units/);
    await assert.rejects(b.placeOrder({ pair: 'EUR/USD', side: 'buy', units: NaN, mid: 1 }), /units/);
  });

  test('missing/bad mid throws', async () => {
    const b = new MockBroker();
    await assert.rejects(b.placeOrder({ pair: 'EUR/USD', side: 'buy', units: 1000, mid: 0 }), /quote/);
    await assert.rejects(b.placeOrder({ pair: 'EUR/USD', side: 'buy', units: 1000 }), /quote/);
  });

  test('opens a long position', async () => {
    const b = new MockBroker();
    await b.placeOrder({ pair: 'EUR/USD', side: 'buy', units: 10_000, mid: 1.1000 });
    const pf = await b.getPortfolio({ 'EUR/USD': 1.1000 });
    assert.equal(pf.positions.length, 1);
    assert.equal(pf.positions[0].units, 10_000);
    assert.ok(approx(pf.positions[0].avgPrice, 1.10005));
  });

  test('opens a short position', async () => {
    const b = new MockBroker();
    await b.placeOrder({ pair: 'EUR/USD', side: 'sell', units: 10_000, mid: 1.1000 });
    const pf = await b.getPortfolio({ 'EUR/USD': 1.1000 });
    assert.equal(pf.positions[0].units, -10_000);
  });

  test('adding to a long averages the entry price', async () => {
    const b = new MockBroker();
    await b.placeOrder({ pair: 'EUR/USD', side: 'buy', units: 10_000, mid: 1.0000 });
    await b.placeOrder({ pair: 'EUR/USD', side: 'buy', units: 10_000, mid: 2.0000 });
    const pf = await b.getPortfolio({ 'EUR/USD': 2.0000 });
    // Fills at 1.00005 and 2.00005 → avg = 1.50005
    assert.equal(pf.positions[0].units, 20_000);
    assert.ok(approx(pf.positions[0].avgPrice, 1.50005, 1e-4));
  });

  test('closing a full position removes it and books PL to cash', async () => {
    const b = new MockBroker({ startingCash: 100_000 });
    await b.placeOrder({ pair: 'EUR/USD', side: 'buy', units: 10_000, mid: 1.0000 });
    // mid moved to 1.5000 → sell to close
    await b.placeOrder({ pair: 'EUR/USD', side: 'sell', units: 10_000, mid: 1.5000 });
    const pf = await b.getPortfolio({});
    assert.equal(pf.positions.length, 0);
    // bought at 1.00005 (ask) sold at 1.49995 (bid) → +0.4999 * 10000 = +4999
    assert.ok(approx(pf.cash - 100_000, 4999, 0.5));
  });

  test('flipping a long-to-short through zero books realized PL and opens new short', async () => {
    const b = new MockBroker({ startingCash: 100_000 });
    await b.placeOrder({ pair: 'EUR/USD', side: 'buy', units: 10_000, mid: 1.0000 });
    // mid moved up; sell 15k → closes 10k long, opens 5k short
    await b.placeOrder({ pair: 'EUR/USD', side: 'sell', units: 15_000, mid: 1.5000 });
    const pf = await b.getPortfolio({ 'EUR/USD': 1.5000 });
    assert.equal(pf.positions.length, 1);
    assert.equal(pf.positions[0].units, -5_000);
    // closed leg PL ≈ +4999, residual short opens at sell-fill 1.49995
    assert.ok(approx(pf.cash - 100_000, 4999, 0.5));
    assert.ok(approx(pf.positions[0].avgPrice, 1.49995, 1e-4));
  });

  test('closePosition with no open position throws', async () => {
    const b = new MockBroker();
    await assert.rejects(b.closePosition('EUR/USD', { 'EUR/USD': 1.1 }), /no open position/);
  });

  test('closePosition with no quote throws', async () => {
    const b = new MockBroker();
    await b.placeOrder({ pair: 'EUR/USD', side: 'buy', units: 1000, mid: 1.1 });
    await assert.rejects(b.closePosition('EUR/USD', {}), /no quote/);
  });

  test('unrealized PL for USD/JPY is converted to USD-ish via /mid', async () => {
    const b = new MockBroker();
    await b.placeOrder({ pair: 'USD/JPY', side: 'buy', units: 10_000, mid: 150.0 });
    const pf = await b.getPortfolio({ 'USD/JPY': 151.0 });
    // raw = (151 - 150.005) * 10000 = 9950 JPY → /151 ≈ 65.9 USD
    const pl = pf.positions[0].unrealizedPL;
    assert.ok(pl > 60 && pl < 70, `expected USD PL ~65, got ${pl}`);
  });

  test('orders log grows with each trade and exposes orderId', async () => {
    const b = new MockBroker();
    await b.placeOrder({ pair: 'EUR/USD', side: 'buy', units: 1000, mid: 1.1 });
    await b.placeOrder({ pair: 'USD/JPY', side: 'sell', units: 1000, mid: 150 });
    const pf = await b.getPortfolio({ 'EUR/USD': 1.1, 'USD/JPY': 150 });
    assert.equal(pf.orders.length, 2);
    assert.match(pf.orders[0].orderId, /^MOCK-\d+/);
    assert.notEqual(pf.orders[0].orderId, pf.orders[1].orderId);
  });
});
