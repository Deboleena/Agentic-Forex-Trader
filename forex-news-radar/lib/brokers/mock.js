// In-memory mock broker. API surface mirrors lib/brokers/oanda.js so swapping
// implementations is a one-line change in lib/broker.js.
//
// Fills happen instantly at the supplied `quote.latest` price (no slippage).
// A tiny configurable spread (in pips/points) is added on top to make buy/sell
// prices differ realistically.

const DEFAULT_SPREAD = {
  'EUR/USD': 0.00010,
  'USD/JPY': 0.010,
  'GBP/USD': 0.00015,
  'XAU/USD': 0.30,
  'AUD/USD': 0.00015,
  'USD/CAD': 0.00020,
};

class MockBroker {
  constructor({ startingCash = 100_000 } = {}) {
    this.kind = 'mock';
    this.startingCash = startingCash;
    this.cash = startingCash;
    this.positions = new Map();   // pair → { units, avgPrice, openedAt }
    this.orders = [];             // append-only audit log
    this._orderSeq = 1;
  }

  _spread(pair) {
    return DEFAULT_SPREAD[pair] ?? 0;
  }

  // Mock broker has no external quote feed; the server passes the latest
  // cached Yahoo close in as `mid`.
  quoteFromMid(pair, mid) {
    const s = this._spread(pair) / 2;
    return { pair, bid: mid - s, ask: mid + s, mid };
  }

  // pnl is reported in USD terms; we approximate JPY/CAD pairs by dividing
  // by the current quote so positions show in account currency.
  _pnl(pair, units, avgPrice, mid) {
    const raw = (mid - avgPrice) * units;
    if (pair === 'USD/JPY' || pair === 'USD/CAD') return raw / mid;
    return raw;
  }

  async placeOrder({ pair, side, units, mid }) {
    if (!['buy', 'sell'].includes(side)) throw new Error(`bad side: ${side}`);
    if (!Number.isFinite(units) || units <= 0) throw new Error('units must be > 0');
    if (!Number.isFinite(mid) || mid <= 0) throw new Error('no quote available for pair');

    const q = this.quoteFromMid(pair, mid);
    const fillPrice = side === 'buy' ? q.ask : q.bid;
    const signedUnits = side === 'buy' ? units : -units;

    // Net into existing position (averaging up / partially closing / flipping through zero).
    const cur = this.positions.get(pair) || { units: 0, avgPrice: 0, openedAt: null };
    const newUnits = cur.units + signedUnits;
    let newAvg = cur.avgPrice;

    const sameDirection = cur.units === 0 || Math.sign(cur.units) === Math.sign(signedUnits);
    if (sameDirection) {
      // Adding in same direction → weighted-average entry.
      const totalCost = cur.units * cur.avgPrice + signedUnits * fillPrice;
      newAvg = newUnits !== 0 ? totalCost / newUnits : 0;
    } else {
      // Opposite direction → realize P&L on the closing portion only.
      const closedAbs = Math.min(Math.abs(signedUnits), Math.abs(cur.units));
      const closedSigned = closedAbs * Math.sign(cur.units);
      this.cash += this._pnl(pair, closedSigned, cur.avgPrice, fillPrice);
      // If we flipped through zero, the residual opens at the new fill price.
      if (Math.abs(signedUnits) > Math.abs(cur.units)) newAvg = fillPrice;
      // else partial close: avgPrice unchanged on the residual.
    }

    if (newUnits === 0) {
      this.positions.delete(pair);
    } else {
      this.positions.set(pair, {
        units: newUnits,
        avgPrice: newAvg,
        openedAt: cur.openedAt || new Date().toISOString(),
      });
    }

    const order = {
      orderId: `MOCK-${this._orderSeq++}`,
      pair,
      side,
      units,
      fillPrice,
      ts: new Date().toISOString(),
    };
    this.orders.push(order);
    return order;
  }

  async closePosition(pair, midByPair) {
    const cur = this.positions.get(pair);
    if (!cur) throw new Error(`no open position on ${pair}`);
    const mid = midByPair[pair];
    if (!Number.isFinite(mid)) throw new Error(`no quote for ${pair}`);
    const side = cur.units > 0 ? 'sell' : 'buy';
    return this.placeOrder({ pair, side, units: Math.abs(cur.units), mid });
  }

  async getPortfolio(midByPair = {}) {
    const positions = [];
    let unrealized = 0;
    for (const [pair, pos] of this.positions.entries()) {
      const mid = midByPair[pair];
      const pl = Number.isFinite(mid) ? this._pnl(pair, pos.units, pos.avgPrice, mid) : null;
      if (pl !== null) unrealized += pl;
      positions.push({
        pair,
        units: pos.units,
        avgPrice: pos.avgPrice,
        currentPrice: mid ?? null,
        unrealizedPL: pl,
        openedAt: pos.openedAt,
      });
    }
    return {
      kind: this.kind,
      startingCash: this.startingCash,
      cash: this.cash,
      unrealizedPL: unrealized,
      equity: this.cash + unrealized,
      positions,
      orders: this.orders.slice(-25),
    };
  }
}

module.exports = MockBroker;
