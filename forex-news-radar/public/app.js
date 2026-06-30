const list = document.getElementById('news-list');
const status = document.getElementById('status');
const updated = document.getElementById('updated');
const refresh = document.getElementById('refresh');
const pairsGrid = document.getElementById('pairs-grid');
const aiBadge = document.getElementById('ai-badge');
const brokerBadge = document.getElementById('broker-badge');
const unitsInput = document.getElementById('trade-units');
const portfolioSummary = document.getElementById('portfolio-summary');
const portfolioPositions = document.getElementById('portfolio-positions');
const portfolioEquity = document.getElementById('portfolio-equity');
const nextRefreshEl = document.getElementById('next-refresh');

const AUTO_REFRESH_MS = 5 * 60 * 1000;
let autoRefreshTimer = null;
let nextRefreshAt = 0;

async function load() {
  status.textContent = 'Loading…';
  list.innerHTML = '';
  pairsGrid.innerHTML = '';
  try {
    const res = await fetch('/api/news');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    render(data);
    refreshPortfolio();
  } catch (err) {
    status.textContent = `Failed to load: ${err.message}`;
  } finally {
    scheduleAutoRefresh();
  }
}

function scheduleAutoRefresh() {
  if (autoRefreshTimer) clearTimeout(autoRefreshTimer);
  nextRefreshAt = Date.now() + AUTO_REFRESH_MS;
  autoRefreshTimer = setTimeout(autoRefreshTick, AUTO_REFRESH_MS);
  updateCountdown();
}

function autoRefreshTick() {
  if (document.visibilityState === 'visible') {
    load();
  } else {
    // Tab is hidden — defer the refresh. visibilitychange will pick it up.
    nextRefreshAt = Date.now();
    updateCountdown();
  }
}

function updateCountdown() {
  if (!nextRefreshEl) return;
  const remaining = Math.max(0, nextRefreshAt - Date.now());
  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  nextRefreshEl.textContent =
    remaining > 0
      ? `next ${m}m ${String(s).padStart(2, '0')}s`
      : 'refreshing…';
}

setInterval(() => {
  if (document.visibilityState === 'visible') updateCountdown();
}, 1000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  updateCountdown();
  if (Date.now() >= nextRefreshAt) load();
});

function ratingClass(rating) {
  return 'rating-' + String(rating).toLowerCase().replace(' ', '-');
}

function sparkline(closes) {
  if (!closes || closes.length < 2) return '';
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const W = 100;
  const H = 28;
  const step = W / (closes.length - 1);
  const pts = closes
    .map((c, i) => `${(i * step).toFixed(1)},${(H - ((c - min) / range) * H).toFixed(1)}`)
    .join(' ');
  const up = closes[closes.length - 1] >= closes[0];
  return `<svg class="spark ${up ? 'up' : 'down'}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="${pts}" /></svg>`;
}

function fmtPct(n) {
  if (n === null || n === undefined || isNaN(n)) return 'n/a';
  return `${n >= 0 ? '+' : ''}${Number(n).toFixed(2)}%`;
}

function fmtUSD(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const sign = n >= 0 ? '+' : '−';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function fmtPrice(n) {
  if (!Number.isFinite(n)) return '—';
  return n >= 100 ? n.toFixed(2) : n.toFixed(5);
}

function getUnits() {
  const u = Number(unitsInput.value);
  return Number.isFinite(u) && u > 0 ? u : 10_000;
}

async function placeTrade(pair, side) {
  try {
    const res = await fetch('/api/trade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pair, side, units: getUnits() }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    renderPortfolio(body.portfolio);
  } catch (err) {
    alert(`Trade failed: ${err.message}`);
  }
}

async function closePosition(pair) {
  if (!confirm(`Close entire ${pair} position?`)) return;
  try {
    const res = await fetch('/api/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pair }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    renderPortfolio(body.portfolio);
  } catch (err) {
    alert(`Close failed: ${err.message}`);
  }
}

async function refreshPortfolio() {
  try {
    const res = await fetch('/api/portfolio');
    if (!res.ok) return;
    renderPortfolio(await res.json());
  } catch {/* ignore */}
}

function renderPortfolio(pf) {
  if (!pf) return;
  portfolioEquity.textContent = `Equity ${fmtUSD(pf.equity - pf.startingCash)} ($${pf.equity.toFixed(2)})`;
  portfolioSummary.innerHTML = `
    <div><span class="lbl">Cash</span> $${pf.cash.toFixed(2)}</div>
    <div><span class="lbl">Unrealized P&L</span> <span class="${pf.unrealizedPL >= 0 ? 'pl-up' : 'pl-down'}">${fmtUSD(pf.unrealizedPL)}</span></div>
    <div><span class="lbl">Open positions</span> ${pf.positions.length}</div>
    <div><span class="lbl">Broker</span> ${escapeHtml(pf.kind)}</div>
  `;

  if (!pf.positions.length) {
    portfolioPositions.innerHTML = '<p class="hint">No open positions. Use Buy/Sell on a pair card.</p>';
    return;
  }
  portfolioPositions.innerHTML = `
    <table class="positions">
      <thead>
        <tr><th>Pair</th><th>Side</th><th>Units</th><th>Avg</th><th>Current</th><th>P&L</th><th></th></tr>
      </thead>
      <tbody>
        ${pf.positions.map((p) => `
          <tr>
            <td>${escapeHtml(p.pair)}</td>
            <td>${p.units > 0 ? 'LONG' : 'SHORT'}</td>
            <td>${Math.abs(p.units).toLocaleString()}</td>
            <td>${fmtPrice(p.avgPrice)}</td>
            <td>${fmtPrice(p.currentPrice)}</td>
            <td class="${(p.unrealizedPL ?? 0) >= 0 ? 'pl-up' : 'pl-down'}">${fmtUSD(p.unrealizedPL)}</td>
            <td><button class="close-btn" data-pair="${escapeHtml(p.pair)}">Close</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  portfolioPositions.querySelectorAll('.close-btn').forEach((b) =>
    b.addEventListener('click', () => closePosition(b.dataset.pair))
  );
}

function renderPairs(data) {
  pairsGrid.innerHTML = '';
  const order = data.pairOrder || Object.keys(data.pairs || {});
  for (const pair of order) {
    const p = data.pairs?.[pair];
    if (!p) continue;
    const card = document.createElement('div');
    card.className = 'pair-card';
    const a = p.assessment || {};
    const q = p.quote || {};
    const moveUp = (a.changePct ?? 0) >= 0;
    card.innerHTML = `
      <div>
        <span class="pair-name">${escapeHtml(p.pair)}</span>
        <span class="pair-score">${p.score >= 0 ? '+' : ''}${p.score}</span>
      </div>
      <div class="pair-rating ${ratingClass(p.rating)}">${escapeHtml(p.rating)}</div>
      <div class="market-row">
        ${sparkline(q.closes)}
        <div class="market-meta">
          <div class="market-change ${moveUp ? 'up' : 'down'}">${fmtPct(a.changePct)}</div>
          <div class="market-sub">48h · range ${fmtPct(a.rangePct)}</div>
        </div>
      </div>
      <div class="assessment assessment-${a.state || 'na'}">${escapeHtml(a.label || 'N/A')}</div>
      <div class="trade-buttons">
        <button class="buy-btn" data-pair="${escapeHtml(p.pair)}">Buy</button>
        <button class="sell-btn" data-pair="${escapeHtml(p.pair)}">Sell</button>
        <span class="last-px">@ ${fmtPrice(q.latest)}</span>
      </div>
      <div class="pair-details">
        ${a.reason ? `<div class="assessment-reason">${escapeHtml(a.reason)}</div>` : ''}
        ${p.rationale ? `<div class="pair-rationale"><strong>Why this call:</strong> ${escapeHtml(p.rationale)}</div>` : ''}
        <div class="contributors-heading">Driving headlines</div>
        ${p.contributors.slice(0, 5).map((c) => `
          <div class="contributor">
            <a href="${c.link}" target="_blank" rel="noopener">${escapeHtml(c.title)}</a>
            <span class="tiny-rating ${ratingClass(c.rating)}">${escapeHtml(c.rating)}</span>
            <div class="why">${escapeHtml(c.reason)}</div>
          </div>
        `).join('') || '<div class="contributor">No contributing headlines.</div>'}
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return; // don't toggle when clicking trade buttons
      card.classList.toggle('open');
    });
    card.querySelector('.buy-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      placeTrade(p.pair, 'buy');
    });
    card.querySelector('.sell-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      placeTrade(p.pair, 'sell');
    });

    pairsGrid.appendChild(card);
  }
}

function renderNews(data) {
  list.innerHTML = '';
  if (!data.items.length) {
    status.textContent = 'No forex-relevant news right now.';
    return;
  }
  const order = data.pairOrder || [];
  for (const item of data.items) {
    const li = document.createElement('li');
    li.className = 'news-item';
    li.innerHTML = `
      <span class="news-score">${item.score}</span>
      <a class="title" href="${item.link}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a>
      <div class="meta">${escapeHtml(item.source)} · ${new Date(item.pubDate).toLocaleString()}</div>
      <div class="tags">${(item.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
      <div class="pair-takes">
        ${order.map((p) => {
          const r = item.ratings?.[p];
          if (!r) return '';
          return `
            <div class="take-pair">${escapeHtml(p)}</div>
            <div class="take-rating ${ratingClass(r.rating)}">${escapeHtml(r.rating)}</div>
            <div class="take-reason">${escapeHtml(r.reason)}</div>
          `;
        }).join('')}
      </div>
    `;
    list.appendChild(li);
  }
}

function render(data) {
  status.textContent = '';
  updated.textContent = `Updated ${new Date(data.fetchedAt).toLocaleTimeString()}`;
  aiBadge.textContent = data.aiEnabled ? 'AI: Gemini' : 'AI: off';
  aiBadge.classList.toggle('on', !!data.aiEnabled);
  aiBadge.classList.toggle('off', !data.aiEnabled);
  brokerBadge.textContent = `Broker: ${data.brokerKind || 'mock'}`;
  brokerBadge.classList.toggle('on', data.brokerKind === 'oanda');
  brokerBadge.classList.toggle('off', data.brokerKind !== 'oanda');
  renderPairs(data);
  renderNews(data);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

refresh.addEventListener('click', load);
load();
