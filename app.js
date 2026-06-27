let items = [];

function addItem() {
  const input = document.getElementById('itemInput');
  const name = input.value.trim();
  if (!name) return;
  items.push({ name, qty: 1 });
  input.value = '';
  renderList();
  input.focus();
}

document.getElementById('itemInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addItem();
});

function renderList() {
  const list = document.getElementById('groceryList');
  const empty = document.getElementById('emptyState');
  const actions = document.getElementById('listActions');

  if (items.length === 0) {
    empty.style.display = 'block';
    actions.style.display = 'none';
    list.innerHTML = '';
    list.appendChild(empty);
    return;
  }

  empty.style.display = 'none';
  actions.style.display = 'flex';

  list.innerHTML = items.map((item, i) => `
    <div class="grocery-item">
      <div class="item-number">${i + 1}</div>
      <span class="item-name">${item.name}</span>
      <div class="item-qty">
        <button onclick="changeQty(${i}, -1)">−</button>
        <span>${item.qty}</span>
        <button onclick="changeQty(${i}, 1)">+</button>
      </div>
      <button class="item-delete" onclick="removeItem(${i})">×</button>
    </div>
  `).join('');
}

function changeQty(i, delta) {
  items[i].qty = Math.max(1, items[i].qty + delta);
  renderList();
}

function removeItem(i) {
  items.splice(i, 1);
  renderList();
}

function clearList() {
  items = [];
  renderList();
  document.getElementById('resultsSection').style.display = 'none';
}

async function compareAll() {
  if (items.length === 0) return;

  showLoading(true);
  document.getElementById('resultsSection').style.display = 'none';

  const results = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    document.getElementById('loadingText').textContent =
      `Searching for ${item.name} (${i + 1}/${items.length})...`;

    try {
      const res = await fetch(`/api/search?query=${encodeURIComponent(item.name)}`);
      const data = await res.json();
      results.push({ item: item.name, qty: item.qty, prices: data });
    } catch (e) {
      results.push({ item: item.name, qty: item.qty, prices: { kroger: [], walmart: [], amazon: [] } });
    }
  }

  showLoading(false);
  renderResults(results);
}

function getBestPrice(prices) {
  const candidates = [];
  if (prices.kroger?.[0]?.price) candidates.push({ store: 'Kroger', price: parseFloat(prices.kroger[0].price) });
  if (prices.walmart?.[0]?.price) candidates.push({ store: 'Walmart', price: parseFloat(prices.walmart[0].price) });
  if (prices.amazon?.[0]?.price) candidates.push({ store: 'Amazon', price: parseFloat(prices.amazon[0].price) });
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => a.price < b.price ? a : b);
}

function renderResults(results) {
  const section = document.getElementById('resultsSection');
  const body = document.getElementById('resultsBody');

  const totals = { Kroger: 0, Walmart: 0, Amazon: 0 };

  body.innerHTML = results.map(r => {
    const krogerPrice = r.prices.kroger?.[0]?.price ? parseFloat(r.prices.kroger[0].price) : null;
    const walmartPrice = r.prices.walmart?.[0]?.price ? parseFloat(r.prices.walmart[0].price) : null;
    const amazonPrice = r.prices.amazon?.[0]?.price ? parseFloat(r.prices.amazon[0].price) : null;
    const best = getBestPrice(r.prices);

    if (krogerPrice) totals.Kroger += krogerPrice * r.qty;
    if (walmartPrice) totals.Walmart += walmartPrice * r.qty;
    if (amazonPrice) totals.Amazon += amazonPrice * r.qty;

    const fmt = (p, store) => p !== null
      ? `<span class="price-cell ${best?.store === store ? 'best' : ''}">$${(p * r.qty).toFixed(2)}${r.qty > 1 ? ` <small>(${r.qty}x)</small>` : ''}</span>`
      : `<span class="price-cell unavail">—</span>`;

    return `
      <tr>
        <td class="item-cell">${r.item}</td>
        <td>${fmt(krogerPrice, 'Kroger')}</td>
        <td>${fmt(walmartPrice, 'Walmart')}</td>
        <td>${fmt(amazonPrice, 'Amazon')}</td>
        <td class="best-price-cell">
          ${best ? `$${(best.price * r.qty).toFixed(2)}<span class="best-store-tag">@ ${best.store}</span>` : '—'}
        </td>
      </tr>
    `;
  }).join('');

  // Store totals
  const validTotals = Object.entries(totals).filter(([, v]) => v > 0);
  const winnerStore = validTotals.length ? validTotals.reduce((a, b) => a[1] < b[1] ? a : b)[0] : null;
  const winnerTotal = winnerStore ? totals[winnerStore] : 0;

  document.getElementById('storeTotals').innerHTML = ['Kroger', 'Walmart', 'Amazon'].map(store => {
    const total = totals[store];
    const isWinner = store === winnerStore;
    const savings = total > 0 && winnerTotal > 0 && !isWinner ? `Save $${(total - winnerTotal).toFixed(2)} vs ${store}` : '';
    return `
      <div class="store-total-card ${isWinner ? 'winner' : ''}">
        <div class="store-name">${store === 'Kroger' ? '🏪' : store === 'Walmart' ? '🔵' : '📦'} ${store}</div>
        <div class="store-total">${total > 0 ? '$' + total.toFixed(2) : 'N/A'}</div>
        ${isWinner ? '<div class="winner-badge">✓ BEST DEAL</div>' : ''}
        ${savings ? `<div class="savings-tag">${savings}</div>` : ''}
      </div>
    `;
  }).join('');

  // Update savings badge
  const maxTotal = Math.max(...validTotals.map(([,v]) => v));
  const saved = maxTotal - winnerTotal;
  if (saved > 0) {
    document.querySelector('.savings-badge').textContent = `$${saved.toFixed(2)} saved today`;
  }

  document.getElementById('resultsSubtitle').textContent =
    `Comparing ${results.length} item${results.length > 1 ? 's' : ''} across 3 stores`;

  section.style.display = 'block';
  section.scrollIntoView({ behavior: 'smooth' });
}

function showLoading(show) {
  document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}
