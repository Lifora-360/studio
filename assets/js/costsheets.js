import { $, fontsReady, safePart, downloadBlob, shareBlob, canShareFiles, toast, loadScript, ICON, dynamicButton, frameScheduler } from './common.js';
import { db, money } from './pay-config.js';
import { costSheetPage, sheetTotals, SUPPLIER } from './costsheet.js';

/* Admin-only: every supplement order's cost sheet, editable, then sent to the supply chain. */
const PAGE_W = 1024;
let client = null, orders = [], current = null, draft = null, dirty = false;
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const fmtDate = (v) => (v ? new Date(String(v).slice(0, 10) + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
const clone = (o) => JSON.parse(JSON.stringify(o));

function fit() {
  const stage = $('stage'), pages = $('pagesRoot'), scaler = $('scaler');
  const cs = getComputedStyle(stage);
  const s = Math.min(1, (stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) / PAGE_W);
  pages.style.transform = `scale(${s})`;
  scaler.style.width = PAGE_W * s + 'px';
  scaler.style.height = pages.offsetHeight * s + 'px';
}

/* ---------- preview + summary follow the draft ---------- */
const redraw = frameScheduler(() => {
  if (!draft) return;
  $('pagesRoot').innerHTML = '';
  $('pagesRoot').appendChild(costSheetPage(draft));
  const s = sheetTotals(draft);
  const sum = $('sum'); sum.innerHTML = '';
  const line = (k, v, cls) => { const d = el('div', cls); d.append(el('span', null, k), el('span', null, v)); sum.appendChild(d); };
  line('Total at cost', money(s.total));
  line(`Commission (${s.pct}%)`, '− ' + money(s.commission));
  line('Delivery fee', '+ ' + money(s.delivery));
  line('Net payable', money(s.net), 'net');
  $('status').textContent = `${draft.client_name}, bill ${draft.bill_no}, net payable ${money(s.net)}`;
  $('dirty').hidden = !dirty;
  fit();
});
function touch() { dirty = true; redraw(); }

/* ---------- editor ---------- */
function renderItems() {
  const ul = $('items'); ul.innerHTML = '';
  draft.items.forEach((it, i) => {
    const li = el('li', 'cs-item');
    const field = (label, key, attrs) => {
      const w = el('div'); const id = `it-${key}-${i}`; const l = el('label', null, label); l.htmlFor = id;
      const inp = el('input'); inp.id = id; Object.assign(inp, attrs); inp.value = it[key] ?? '';
      inp.addEventListener('input', () => { it[key] = attrs.type === 'number' ? num(inp.value) : inp.value; if (key === 'name') it.label = it.label || ''; touch(); });
      w.append(l, inp); return w;
    };
    const rm = el('button', 'linkbtn', 'Remove'); rm.type = 'button';
    rm.addEventListener('click', () => { draft.items.splice(i, 1); renderItems(); touch(); });
    li.append(field('Item', 'name', { maxLength: 120 }), field('Qty', 'qty', { type: 'number', min: '0', step: '1', inputMode: 'numeric' }),
      field('Cost / bottle', 'cost', { type: 'number', min: '0', step: '0.01', inputMode: 'decimal' }), rm);
    ul.appendChild(li);
  });
}
function open(o) {
  if (dirty && current && current.id !== o.id && !confirm('Discard unsaved changes to this cost sheet?')) return;
  current = o; draft = clone(o); dirty = false;
  draft.items = draft.items || [];
  if (draft.commission_pct == null) draft.commission_pct = 30;
  if (draft.delivery_fee == null) draft.delivery_fee = 0;
  $('eName').value = draft.client_name || ''; $('ePhone').value = draft.client_phone || ''; $('eAddress').value = draft.client_address || '';
  $('eDate').value = draft.bill_date ? String(draft.bill_date).slice(0, 10) : '';
  $('ePct').value = draft.commission_pct; $('eFee').value = draft.delivery_fee;
  renderItems();
  $('editor').hidden = false;
  $('pdfBtn').disabled = false; $('shareBtn').disabled = false;
  document.querySelectorAll('.sheet').forEach((li) => li.setAttribute('aria-selected', String(li.dataset.id === o.id)));
  redraw();
}

async function save(e) {
  e && e.preventDefault();
  if (!draft) return;
  if (!draft.client_name.trim()) { toast('Add the client’s name.'); $('eName').focus(); return; }
  const b = dynamicButton($('saveBtn'), { full: true });
  b.busy('Saving');
  const items = draft.items.filter((i) => String(i.name || '').trim()).map((i) => ({ ...i, name: String(i.name).trim(), qty: Math.trunc(num(i.qty)), cost: num(i.cost) }));
  const s = sheetTotals({ ...draft, items });
  const patch = {
    client_name: draft.client_name.trim(), client_phone: (draft.client_phone || '').trim() || null,
    client_address: (draft.client_address || '').trim() || null, bill_date: draft.bill_date || null,
    items, cost_total: s.total, commission_pct: s.pct, delivery_fee: s.delivery,
    admin_edited: true, updated_at: new Date().toISOString()
  };
  const { data, error } = await client.from('supplement_orders').update(patch).eq('id', draft.id).select().single();
  if (error) { b.reset(); toast('Couldn’t save: ' + error.message); return; }
  const i = orders.findIndex((o) => o.id === data.id);
  orders[i] = data; current = data; draft = clone(data); dirty = false;
  renderItems(); renderList(); redraw();
  b.flash('Saved');
}

/* ---------- list ---------- */
function renderList() {
  const q = $('q').value.trim().toLowerCase();
  const list = $('list'); list.innerHTML = '';
  $('count').textContent = orders.length ? String(orders.length) : '';
  const shown = orders.filter((o) => !q || (o.client_name + ' ' + o.bill_no).toLowerCase().includes(q));
  if (!shown.length) { list.appendChild(el('li', 'empty', orders.length ? 'No match.' : 'No cost sheets yet. They appear here once a supplement bill is downloaded.')); return; }
  shown.forEach((o) => {
    const li = el('li', 'sheet'); li.dataset.id = o.id; li.tabIndex = 0; li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(current && current.id === o.id));
    const left = el('div'); left.append(el('b', null, o.client_name), el('div', 'sub', `${o.bill_no}, ${fmtDate(o.bill_date)}${o.admin_edited ? ', edited' : ''}`));
    const amt = el('div', 'amt', money(sheetTotals(o).net)); amt.appendChild(el('small', null, 'net payable'));
    li.append(left, amt);
    li.addEventListener('click', () => open(o));
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(o); } });
    list.appendChild(li);
  });
}
async function load() {
  const { data, error } = await client.from('supplement_orders').select('*').order('updated_at', { ascending: false }).limit(500);
  if (error) { $('list').innerHTML = ''; $('list').appendChild(el('li', 'empty', 'Couldn’t load cost sheets: ' + error.message)); return; }
  orders = data || [];
  renderList();
  if (orders[0]) open(orders[0]);
}

/* ---------- PDF ---------- */
const pdfName = () => `${SUPPLIER}_Cost_Sheet_${safePart(draft.client_name, 'Client')}_${draft.bill_no}.pdf`;
async function makePdf() {
  await Promise.all([loadScript('../vendor/html2canvas.min.js'), loadScript('../vendor/jspdf.umd.min.js')]);
  await fontsReady();
  const page = document.querySelector('#pagesRoot .page');
  document.body.classList.add('exporting');
  let canvas;
  try { canvas = await window.html2canvas(page, { scale: 2, backgroundColor: '#ffffff', logging: false }); }
  finally { document.body.classList.remove('exporting'); fit(); }
  const pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
  return pdf.output('blob');
}
function unsavedOk() { return !dirty || confirm('This cost sheet has unsaved changes. Use it as shown anyway? (Save first to keep the changes.)'); }
async function onPdf() {
  if (!draft || !unsavedOk()) return;
  const b = dynamicButton($('pdfBtn'));
  b.busy('Preparing');
  try { downloadBlob(await makePdf(), pdfName()); b.flash('Downloaded'); }
  catch (e) { console.error(e); b.reset(); toast('Couldn’t make the PDF. Try again.'); }
}
async function onShare() {
  if (!draft || !unsavedOk()) return;
  const b = dynamicButton($('shareBtn'));
  b.busy('Preparing');
  try {
    const blob = await makePdf();
    const r = await shareBlob(blob, pdfName(), `${SUPPLIER} cost sheet`);
    if (r === 'shared') b.flash('Sent');
    else if (r === 'unsupported') { downloadBlob(blob, pdfName()); b.flash('Downloaded'); }
    else b.reset();
  } catch (e) { console.error(e); b.reset(); toast('Couldn’t make the PDF. Try again.'); }
}

/* ---------- boot ---------- */
async function enter() {
  const { data: role } = await client.rpc('studio_role');
  if (role !== 'admin') { $('signin').hidden = true; $('noAccess').hidden = false; return; }
  $('signin').hidden = true; $('app').hidden = false;
  load();
}
async function boot() {
  document.querySelectorAll('[data-icon]').forEach((n) => { n.outerHTML = ICON[n.dataset.icon]; });
  if (canShareFiles('application/pdf')) $('shareBtn').hidden = false;
  new ResizeObserver(fit).observe($('stage'));
  try { client = await db(); } catch { $('signin').hidden = false; $('signinErr').textContent = 'Couldn’t reach the server. Reload to try again.'; return; }
  const { data: { session } } = await client.auth.getSession();
  if (session) enter(); else $('signin').hidden = false;
}
$('signin').addEventListener('submit', async (e) => {
  e.preventDefault(); $('signinErr').textContent = '';
  const { error } = await client.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
  if (error) { $('signinErr').textContent = error.message; return; }
  enter();
});
$('signout').addEventListener('click', async () => { await client.auth.signOut(); location.reload(); });
$('q').addEventListener('input', renderList);
$('eName').addEventListener('input', () => { draft.client_name = $('eName').value; touch(); });
$('ePhone').addEventListener('input', () => { draft.client_phone = $('ePhone').value; touch(); });
$('eAddress').addEventListener('input', () => { draft.client_address = $('eAddress').value; touch(); });
$('eDate').addEventListener('input', () => { draft.bill_date = $('eDate').value; touch(); });
$('ePct').addEventListener('input', () => { draft.commission_pct = Math.min(100, num($('ePct').value)); touch(); });
$('eFee').addEventListener('input', () => { draft.delivery_fee = num($('eFee').value); touch(); });
$('addItem').addEventListener('click', () => { draft.items.push({ name: '', pack: 'custom', label: '', qty: 1, cost: 0, client: 0 }); renderItems(); touch(); const n = document.querySelectorAll('.cs-item input'); n[n.length - 3] && n[n.length - 3].focus(); });
$('editor').addEventListener('submit', save);
$('pdfBtn').addEventListener('click', onPdf);
$('shareBtn').addEventListener('click', onShare);
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
boot();
