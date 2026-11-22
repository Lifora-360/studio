import { $, readSharedClient, toast } from './common.js';
import { db, money, checkoutLink, PRESETS } from './pay-config.js';

let client, rows = [], filter = 'open';

/* ---------- helpers ---------- */
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const statusOf = (r) => r.status === 'paid' ? 'paid' : (new Date(r.expires_at) < new Date() ? 'expired' : (r.reported_at ? 'reported' : 'pending'));
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Link copied'); } catch { prompt('Copy this link', text); }
}
function waLink(r) {
  const link = checkoutLink(r.id);
  const first = String(r.customer_name).split(/\s+/)[0];
  const text = `Hello ${first}, here is your Lifora payment link for ${r.purpose} (${money(r.amount)}):\n${link}\n\nYou can pay with any UPI app. Thank you.`;
  const digits = String(r.customer_phone || '').replace(/\D/g, '');
  const phone = digits.length === 10 ? '91' + digits : (digits.length >= 11 ? digits : '');
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

/* ---------- auth ---------- */
async function boot() {
  try { client = await db(); } catch {
    $('signin').hidden = false;
    $('signinErr').textContent = 'Couldn’t reach the payments service. Check the connection and reload.';
    return;
  }
  const { data: { session } } = await client.auth.getSession();
  session ? openApp() : ($('signin').hidden = false);
}
$('signinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('signinErr').textContent = '';
  const { error } = await client.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
  if (error) { $('signinErr').textContent = error.message; return; }
  $('signin').hidden = true;
  openApp();
});
$('signout').addEventListener('click', async () => { await client.auth.signOut(); location.reload(); });

/* ---------- create ---------- */
function buildPresets() {
  PRESETS.forEach((p) => {
    const b = el('button', 'preset', `${p.label}, ${money(p.amount)}`); b.type = 'button';
    b.addEventListener('click', () => { $('cPurpose').value = p.purpose; $('cAmount').value = p.amount; });
    $('presets').appendChild(b);
  });
}
$('newForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('cName').value.trim(), phone = $('cPhone').value.trim(), purpose = $('cPurpose').value.trim();
  const amount = Number($('cAmount').value), days = Number($('cDays').value);
  const err = $('newErr'); err.textContent = '';
  if (!name || !purpose) { err.textContent = 'Add the client’s name and what the payment is for.'; return; }
  if (!(amount >= 1 && amount <= 10000000)) { err.textContent = 'Enter an amount between ₹1 and ₹1,00,00,000.'; return; }
  const btn = $('createBtn'); btn.classList.add('busy'); btn.disabled = true;
  const { data, error } = await client.rpc('create_payment_request', {
    p_customer_name: name, p_customer_phone: phone || null, purpose_text: purpose,
    p_amount: amount, p_expires_at: new Date(Date.now() + days * 86400000).toISOString()
  });
  btn.classList.remove('busy'); btn.disabled = false;
  if (error) { err.textContent = error.message; return; }
  const r = { id: data, customer_name: name, customer_phone: phone, purpose, amount };
  const res = $('result'); res.innerHTML = '';
  const link = checkoutLink(data);
  const a = el('a', null, link); a.href = link; a.target = '_blank'; a.rel = 'noopener';
  const row = el('div', 'row');
  const wa = el('a', 'btn btn-primary', 'Send on WhatsApp'); wa.href = waLink(r); wa.target = '_blank'; wa.rel = 'noopener'; wa.style.margin = '0';
  const cp = el('button', 'btn btn-line', 'Copy link'); cp.type = 'button'; cp.addEventListener('click', () => copy(link));
  row.append(wa, cp);
  res.append(el('strong', null, `Link ready for ${name}, ${money(amount)}`), a, row);
  res.hidden = false;
  ['cName', 'cPhone', 'cPurpose', 'cAmount'].forEach((id) => { $(id).value = ''; });
  load();
});

/* ---------- register ---------- */
async function load() {
  const { data, error } = await client.from('payment_requests').select('*').order('created_at', { ascending: false }).limit(500);
  if (error) { $('list').innerHTML = ''; $('list').appendChild(el('li', 'empty', 'Couldn’t load the register: ' + error.message)); return; }
  rows = (data || []).map((r) => ({ ...r, state: statusOf(r) }));
  const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
  const open = rows.filter((r) => r.state === 'pending' || r.state === 'reported');
  $('sPending').textContent = money(open.reduce((s, r) => s + Number(r.amount), 0));
  $('sPendingLabel').textContent = `Waiting, ${open.length} link${open.length === 1 ? '' : 's'}`;
  $('sReported').textContent = String(rows.filter((r) => r.state === 'reported').length);
  $('sMonth').textContent = money(rows.filter((r) => r.state === 'paid' && r.paid_at && new Date(r.paid_at) >= month).reduce((s, r) => s + Number(r.amount), 0));
  render();
}
function render() {
  const q = $('q').value.trim().toLowerCase();
  const list = $('list'); list.innerHTML = '';
  const shown = rows.filter((r) => {
    const okF = filter === 'all' || (filter === 'open' ? (r.state === 'pending' || r.state === 'reported') : r.state === filter);
    return okF && (!q || (r.customer_name + ' ' + r.purpose).toLowerCase().includes(q));
  });
  // Client-reported payments first: they need checking.
  shown.sort((a, b) => (b.state === 'reported') - (a.state === 'reported'));
  if (!shown.length) { list.appendChild(el('li', 'empty', filter === 'open' ? 'Nothing waiting to be collected.' : 'No requests here.')); return; }
  shown.forEach((r) => {
    const li = el('li', 'req');
    const left = el('div');
    const nm = el('div', 'req-name', r.customer_name);
    const label = { pending: 'Waiting', reported: 'Client says paid', paid: 'Paid', expired: 'Expired' }[r.state];
    nm.appendChild(el('span', 'chip ' + r.state, label));
    left.append(nm, el('div', 'req-sub', `${r.purpose}, created ${fmtDate(r.created_at)}${r.state === 'paid' && r.paid_at ? ', paid ' + fmtDate(r.paid_at) : ''}`));
    const amt = el('div', 'req-amt', money(r.amount));
    const acts = el('div', 'req-acts');
    if (r.customer_reference && r.state !== 'paid') acts.appendChild(el('span', 'utr', 'UTR ' + r.customer_reference));
    if (r.state === 'paid' && r.transaction_ref) acts.appendChild(el('span', 'req-sub', 'Ref ' + r.transaction_ref));
    if (r.state === 'pending' || r.state === 'reported') {
      const wa = el('a', 'linkbtn', 'WhatsApp'); wa.href = waLink(r); wa.target = '_blank'; wa.rel = 'noopener';
      const cp = el('button', 'linkbtn', 'Copy link'); cp.type = 'button'; cp.addEventListener('click', () => copy(checkoutLink(r.id)));
      const pd = el('button', 'btn btn-primary', 'Mark paid'); pd.type = 'button'; pd.style.cssText = 'padding:6px 12px;font-size:13px;margin-left:auto';
      pd.addEventListener('click', () => markPaid(r));
      acts.append(wa, cp, pd);
    }
    li.append(left, amt, acts);
    list.appendChild(li);
  });
}
document.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
  filter = b.dataset.f;
  document.querySelectorAll('[data-f]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  render();
}));
$('q').addEventListener('input', render);

function markPaid(r) {
  const dlg = $('paidDialog');
  $('paidWho').textContent = `${r.customer_name}, ${money(r.amount)} for ${r.purpose}`;
  $('paidRef').value = r.customer_reference || '';
  dlg.returnValue = '';
  dlg.showModal();
  dlg.addEventListener('close', async function once() {
    dlg.removeEventListener('close', once);
    if (dlg.returnValue !== 'ok') return;
    const { error } = await client.rpc('mark_payment_paid', { p_payment_id: r.id, p_transaction_ref: $('paidRef').value.trim() || null });
    if (error) { toast('Couldn’t update: ' + error.message); return; }
    toast('Marked paid');
    load();
  });
}

function openApp() {
  $('app').hidden = false;
  const c = readSharedClient();
  if (c.name && !$('cName').value) $('cName').value = c.name;
  load();
}

buildPresets();
boot();
