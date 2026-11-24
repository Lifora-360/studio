import { money } from './pay-config.js';

/* Cost sheet for the supply chain (Aegant), built from a saved supplement order
   (table supplement_orders). Only the admin's Cost sheets page draws this; staff
   can't open or download it, so it can't reach a client by mistake.

   Totals:  items at cost  −  commission (commission_pct of that total)  +  delivery fee  =  net payable */

export const SUPPLIER = 'Aegant';

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const td = (text, cls) => el('td', cls, text);
const ddmmyyyy = (v) => { if (!v) return ''; const [y, m, d] = String(v).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

export function sheetTotals(o) {
  const items = o.items || [];
  const total = round2(items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.cost || 0), 0));
  const pct = Number(o.commission_pct ?? 30);
  const commission = round2(total * pct / 100);
  const delivery = round2(o.delivery_fee || 0);
  return { total, pct, commission, delivery, net: round2(total - commission + delivery) };
}

export function costSheetPage(o) {
  const page = el('div', 'page doc'); const p = el('div', 'rx-page');

  const head = el('div', 'rx-head cs-head');
  head.appendChild(el('div', 'cs-supplier', SUPPLIER));
  const right = el('div', 'rx-doc');
  right.append(el('div', 'internal-tag', `FOR ${SUPPLIER.toUpperCase()}`), el('span', null, 'Bill no. ' + o.bill_no), el('span', null, 'Date: ' + ddmmyyyy(o.bill_date)));
  head.appendChild(right);
  p.appendChild(head);

  const t = el('div', 'doc-title'); t.append(el('h2', null, 'Cost sheet'), el('span', null, o.days ? `${o.days} days` : '')); p.appendChild(t);

  const ship = el('div', 'cs-ship');
  const row = (k, v) => { const d = el('div'); d.append(el('span', null, k), el('b', null, v || '—')); return d; };
  ship.append(row('Deliver to', o.client_name), row('Mobile', o.client_phone), row('Address', o.client_address));
  p.appendChild(ship);

  const table = el('table', 'doc-table');
  const hr = el('tr');
  [['#', ''], ['Item', ''], ['Qty', 'num'], ['Cost / bottle', 'num'], ['Amount', 'num']].forEach(([h, c]) => hr.appendChild(el('th', c, h)));
  const thead = el('thead'); thead.appendChild(hr);
  const tb = el('tbody');
  const items = o.items || [];
  if (!items.length) { const tr = el('tr', 'doc-empty'); const c = td('No items'); c.colSpan = 5; tr.appendChild(c); tb.appendChild(tr); }
  items.forEach((it, i) => {
    const tr = el('tr'); const name = td(it.name, 'name');
    if (it.label) name.appendChild(el('small', null, it.label));
    tr.append(td(String(i + 1)), name, td(String(it.qty), 'num'), td(money(it.cost), 'num'), td(money(Number(it.qty) * Number(it.cost)), 'num'));
    tb.appendChild(tr);
  });
  const s = sheetTotals(o);
  const tf = el('tfoot');
  const sumRow = (label, value, cls) => { const r = el('tr', cls); const l = td(label); l.colSpan = 4; r.append(l, td(value, 'num')); tf.appendChild(r); };
  sumRow('Total', money(s.total), 'cs-sub');
  sumRow(`Less commission (${s.pct}%)`, '− ' + money(s.commission), 'cs-sub');
  sumRow('Delivery fee', '+ ' + money(s.delivery), 'cs-sub');
  sumRow('Net payable', money(s.net), 'grand');
  table.append(thead, tb, tf);
  p.appendChild(table);
  page.appendChild(p);
  return page;
}
