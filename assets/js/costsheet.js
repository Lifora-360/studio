import { money } from './pay-config.js';

/* Internal cost sheet, built from a saved supplement order (table supplement_orders).
   Only the private Cost sheets page draws this; the Supplements page never offers it
   for download, so it can't be sent to a client by mistake. */

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const td = (text, cls) => el('td', cls, text);
const ddmmyyyy = (v) => { if (!v) return ''; const [y, m, d] = String(v).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
function line(k, v, right) { const n = el('p', right ? 'r' : null); n.append(el('b', null, k + ': '), document.createTextNode(v || '')); return n; }

/** Turn the live form state into the row saved to supplement_orders. */
export function orderSnapshot({ billNo, date, clientName, clientPhone, doctorName, days, items, localItems, paymentRequestId }) {
  const cost = items.reduce((s, i) => s + i.qty * i.cost, 0);
  const client = items.reduce((s, i) => s + i.qty * i.client, 0);
  return {
    bill_no: billNo, bill_date: date || null, client_name: clientName, client_phone: clientPhone || null,
    doctor_name: doctorName || null, days, items, local_items: localItems,
    cost_total: cost, client_total: client, payment_request_id: paymentRequestId || null,
    updated_at: new Date().toISOString()
  };
}

export function costSheetPage(o) {
  const page = el('div', 'page doc'); const p = el('div', 'rx-page');
  const head = el('div', 'rx-head');
  const mark = el('div', 'rx-mark');
  const logo = el('img'); logo.src = '../assets/img/lockup.webp'; logo.alt = 'Lifora';
  mark.append(logo, el('div', 'tag', 'A Journey To A Better Life'));
  const right = el('div', 'rx-doc');
  right.append(el('div', 'internal-tag', 'INTERNAL · NOT FOR CLIENTS'), el('span', null, 'Bill no. ' + o.bill_no), el('span', null, 'Date: ' + ddmmyyyy(o.bill_date)));
  head.append(mark, right);
  p.appendChild(head);
  const t = el('div', 'doc-title'); t.append(el('h2', null, 'Internal cost sheet'), el('span', null, o.days ? `${o.days} days` : '')); p.appendChild(t);
  const pt = el('div', 'doc-pt'); pt.append(line('Client', o.client_name), line('Prescribed by', o.doctor_name, true)); p.appendChild(pt);

  const table = el('table', 'doc-table');
  const hr = el('tr');
  [['#', ''], ['Item', ''], ['Qty', 'num'], ['Cost / bottle', 'num'], ['Cost', 'num']].forEach(([h, c]) => hr.appendChild(el('th', c, h)));
  const thead = el('thead'); thead.appendChild(hr);
  const tb = el('tbody');
  const items = o.items || [];
  if (!items.length) { const tr = el('tr', 'doc-empty'); const c = td('No billed items'); c.colSpan = 5; tr.appendChild(c); tb.appendChild(tr); }
  items.forEach((it, i) => {
    const tr = el('tr'); const name = td(it.name, 'name');
    const sub = [it.label, it.pack === 'custom' ? 'added by hand' : (it.pack ? it.pack + ' list' : '')].filter(Boolean).join(' · ');
    if (sub) name.appendChild(el('small', null, sub));
    tr.append(td(String(i + 1)), name, td(String(it.qty), 'num'), td(money(it.cost), 'num'), td(money(it.qty * it.cost), 'num'));
    tb.appendChild(tr);
  });
  const tf = el('tfoot'); const g = el('tr', 'grand');
  const lab = td('Total cost'); lab.colSpan = 2;
  g.append(lab, td(String(items.reduce((s, i) => s + i.qty, 0)), 'num'), td(''), td(money(o.cost_total), 'num'));
  tf.appendChild(g);
  table.append(thead, tb, tf);
  p.appendChild(table);
  if ((o.local_items || []).length) p.appendChild(el('p', 'doc-note', `Not billed (local pharmacy): ${o.local_items.join(', ')}.`));
  page.appendChild(p);
  return page;
}
