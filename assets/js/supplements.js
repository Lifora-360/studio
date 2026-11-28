import { $, store, readSharedClient, writeSharedClient, fontsReady, frameScheduler, safePart,
  downloadBlob, toast, loadScript, ICON, dynamicButton } from './common.js';
import { db, money, checkoutLink } from './pay-config.js';
import { DOCTORS } from './rx-config.js';
import { counter, rupeeCounter } from './counter.js';
import { sectionRail } from './rail.js';
import { withLogoLoader } from './logo-loader.js';
let supCounter = null, billCounter = null;

/* ==========================================================================
   Supplements: one form → two PDFs for the client
     schedule  — what to take and when (no prices)
     bill      — client prices and total, payment link/QR
   The internal cost sheet is never offered for download here. It is saved to
   supplement_orders whenever the bill is downloaded or a payment link is made,
   and opened only from the private /cost-sheets/ page.
   ========================================================================== */
const PAGE_W = 1024, PAGE_H = 1448;
const DRAFT_KEY = 'lifora.sup.draft';
const DEFAULT_INSTRUCTIONS = [
  'Follow the supplement schedule and instructions provided above.',
  'Do not change the dose or frequency without consulting the prescribing doctor.',
  'Inform the doctor about all current medicines, supplements, allergies, and any new symptoms or adverse reactions.',
  'Keep supplements out of reach of children and store them as directed on the product label.',
  'Contact the team if you have questions or experience any unexpected reaction.'
].join('\n');
const TIMINGS = ['After food', 'Before food', 'After food (with fat)', 'Empty stomach', 'Anytime', '1 hour before sleep'];
const OWN = '__own';
const DOCS = { schedule: 'Schedule', bill: 'Bill' };

let client = null, catalogue = new Map(), rows = [], days = 30, docView = 'schedule', billNo = '', pay = null, uid = 1;

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const val = (id) => String($(id).value || '').trim();
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const ddmmyyyy = (v) => { if (!v) return ''; const [y, m, d] = v.split('-'); return `${d}/${m}/${y}`; };
const int = (v) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };
const newBillNo = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `LS-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${Math.floor(1000 + Math.random() * 9000)}`; };

/* ==========================================================================
   Rows
   ========================================================================== */
function catFor(r) { return r.custom ? null : (catalogue.get(r.name) || {})[r.pack] || null; }
function daily(r) { return int(r.m) + int(r.a) + int(r.e) + int(r.d); }
function autoBottles(r) {
  if (r.local) return 0;
  const c = catFor(r);
  const per = c ? c.per_pack : null;
  if (per && daily(r) > 0) return Math.ceil((daily(r) * days) / per);
  return 1;
}
function bottles(r) { return r.local ? 0 : (r.manual ? int(r.bottles) : autoBottles(r)); }
function clientPrice(r) { const c = catFor(r); return c ? Number(c.client_price) : Number(r.price || 0); }
function packLabel(r) {
  const c = catFor(r);
  if (!c) return '';
  if (c.unit === 'sprays') return `${c.per_pack} sprays`;
  if (c.unit === 'pack' || !c.per_pack) return 'Pack';
  return `${c.per_pack} tablets`;
}
const billed = () => rows.filter((r) => r.name.trim() && !r.local && bottles(r) > 0);
const total = (fn) => billed().reduce((s, r) => s + bottles(r) * fn(r), 0);

function addFromCatalogue(name) {
  const packs = catalogue.get(name);
  const pack = packs['30s'] ? '30s' : '60s';
  const c = packs[pack];
  rows.push({ key: uid++, name, pack, timing: c.timing || '', m: c.morning, a: c.afternoon, e: c.evening, d: c.dinner, manual: false, bottles: 0, local: false, custom: false });
  renderRows(); renderCatalogue(); changed();
}
function addCustom() {
  rows.push({ key: uid++, name: '', pack: '', timing: 'After food', m: 1, a: 0, e: 0, d: 0, doseMode: 'grid', doseText: '', manual: true, bottles: 1, local: true, custom: true, price: 0, cost: 0 });
  renderRows(); changed();
  const inputs = document.querySelectorAll('.sup-name input'); if (inputs.length) inputs[inputs.length - 1].focus();
}

/* ---------- form: catalogue chips ---------- */
function renderCatalogue() {
  const box = $('catalogue');
  const q = val('supSearch').toLowerCase();
  box.innerHTML = '';
  const chosen = new Set(rows.filter((r) => !r.custom).map((r) => r.name));
  const names = [...catalogue.keys()].filter((n) => !q || n.toLowerCase().includes(q));
  if (!names.length) { box.appendChild(el('span', 'none', q ? 'Not in the list. Use “Add something not in the list”.' : 'The catalogue is empty.')); return; }
  names.forEach((n) => {
    const b = el('button', null, n); b.type = 'button';
    b.setAttribute('aria-pressed', String(chosen.has(n)));
    b.title = chosen.has(n) ? 'Already added' : 'Add';
    b.addEventListener('click', () => { if (!chosen.has(n)) addFromCatalogue(n); else toast(`${n} is already on the list.`); });
    box.appendChild(b);
  });
}

/* ---------- form: selected rows ---------- */
// Only supplements sold in both bottle sizes can be switched, one by one or all together.
// (Multi Vitamin, Q10, the spray and Shilajit have the same bottle on both lists, so they stay as they are.)
const switchable = (r) => {
  if (r.custom) return false;
  const c = catalogue.get(r.name) || {};
  return !!(c['30s'] && c['60s']) && c['30s'].per_pack !== c['60s'].per_pack && c['30s'].unit !== 'pack';
};
function updatePackAll() {
  const sw = rows.filter(switchable);
  $('packAll').hidden = !sw.length;
  document.querySelectorAll('#packAll [data-pack]').forEach((b) => {
    b.setAttribute('aria-checked', String(sw.length > 0 && sw.every((r) => r.pack === b.dataset.pack)));
  });
}
function switchAll(p) {
  const sw = rows.filter(switchable);
  const moved = sw.filter((r) => r.pack !== p).length;
  sw.forEach((r) => { r.pack = p; });
  renderRows(); changed();
  const fixed = rows.filter((r) => !r.custom && !switchable(r)).length;
  toast(moved ? `Switched ${moved} to the ${p} list${fixed ? `; ${fixed} only come${fixed === 1 ? 's' : ''} in one size` : ''}.` : `All are already on the ${p} list.`);
}
function renderRows() {
  const ol = $('rows');
  ol.innerHTML = '';
  updatePackAll();
  rows.forEach((r, i) => {
    const li = el('li', 'sup-row' + (r.local ? ' local' : ''));
    const top = el('div', 'sup-top');
    const name = el('div', 'sup-name');
    if (r.custom) {
      const inp = el('input'); inp.placeholder = 'e.g. Vitamin D 60000 IU'; inp.value = r.name; inp.setAttribute('aria-label', 'Supplement name');
      inp.addEventListener('input', () => { r.name = inp.value; changed(); });
      name.appendChild(inp);
    } else name.textContent = r.name;
    top.appendChild(name);
    if (switchable(r)) {
      const packs = el('div', 'packs'); packs.setAttribute('role', 'radiogroup'); packs.setAttribute('aria-label', 'Bottle size');
      ['30s', '60s'].forEach((p) => {
        const b = el('button', null, p === '30s' ? '30s list' : '60s list'); b.type = 'button';
        b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(r.pack === p));
        b.addEventListener('click', () => { r.pack = p; renderRows(); changed(); });
        packs.appendChild(b);
      });
      top.appendChild(packs);
    } else if (!r.custom) {
      const c = catFor(r);
      top.appendChild(el('span', 'pack-only', c && c.unit !== 'pack' && c.per_pack ? `${packLabel(r)} only` : 'One size'));
    }
    li.appendChild(top);

    const grid = el('div', 'sup-grid');
    const timingBox = el('div', 'wide');
    const tl = el('label', null, 'When to take');
    // A real dropdown (every option always visible), plus "Type your own".
    const sel = el('select'); sel.id = `t${r.key}`; tl.htmlFor = sel.id;
    TIMINGS.forEach((t) => sel.appendChild(new Option(t, t)));
    sel.appendChild(new Option('Type your own…', OWN));
    const known = TIMINGS.find((t) => t.toLowerCase() === String(r.timing || '').trim().toLowerCase());
    const own = el('input'); own.className = 'own-timing'; own.placeholder = 'e.g. With breakfast on Sundays'; own.setAttribute('aria-label', 'When to take, in your words');
    if (known || !String(r.timing || '').trim()) { sel.value = known || TIMINGS[0]; own.hidden = true; if (!known) r.timing = TIMINGS[0]; }
    else { sel.value = OWN; own.value = r.timing; }
    sel.addEventListener('change', () => {
      if (sel.value === OWN) { own.hidden = false; r.timing = own.value; own.focus(); }
      else { own.hidden = true; r.timing = sel.value; }
      changed();
    });
    own.addEventListener('input', () => { r.timing = own.value; changed(); });
    timingBox.append(tl, sel, own);
    const doseBox = el('div', 'wide');
    const textDose = r.custom && r.doseMode === 'text';
    const dHead = el('div', 'dose-head');
    dHead.appendChild(el('label', null, textDose ? 'Dose' : 'Dose (whole tablets or sprays)'));
    if (r.custom) {
      // Custom items: the usual morning/afternoon/evening/dinner counts, or any dose typed out.
      const mode = el('div', 'packs'); mode.setAttribute('role', 'radiogroup'); mode.setAttribute('aria-label', 'How to enter the dose');
      [['grid', 'Usual'], ['text', 'Type it']].forEach(([m, label]) => {
        const b = el('button', null, label); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String((r.doseMode || 'grid') === m));
        b.addEventListener('click', () => { r.doseMode = m; renderRows(); changed(); if (m === 'text') { const t = document.getElementById(`dt${r.key}`); if (t) t.focus(); } });
        mode.appendChild(b);
      });
      dHead.appendChild(mode);
    }
    doseBox.appendChild(dHead);
    if (textDose) {
      const dt = el('input'); dt.id = `dt${r.key}`; dt.value = r.doseText || ''; dt.placeholder = 'e.g. 1 capsule once a week (every Sunday)'; dt.setAttribute('aria-label', 'Dose');
      dt.addEventListener('input', () => { r.doseText = dt.value; changed(); });
      doseBox.appendChild(dt);
    } else {
      const doses = el('div', 'doses');
      [['m', 'Morning'], ['a', 'Afternoon'], ['e', 'Evening'], ['d', 'Dinner']].forEach(([k, label]) => {
        const w = el('div'); const lab = el('label', null, label); const inp = el('input');
        inp.type = 'number'; inp.inputMode = 'numeric'; inp.min = '0'; inp.max = '9'; inp.step = '1'; inp.value = String(int(r[k]));
        inp.id = `${k}${r.key}`; lab.htmlFor = inp.id;
        inp.addEventListener('input', () => { r[k] = int(inp.value); if (String(int(inp.value)) !== inp.value && inp.value !== '') inp.value = String(int(inp.value)); refreshRow(li, r); changed(); });
        w.append(lab, inp); doses.appendChild(w);
      });
      doseBox.appendChild(doses);
    }
    grid.append(timingBox, doseBox);

    if (!r.local) {
      const bBox = el('div');
      bBox.appendChild(el('label', null, 'Bottles'));
      const row = el('div', 'bottles');
      const bi = el('input'); bi.type = 'number'; bi.inputMode = 'numeric'; bi.min = '1'; bi.max = '99'; bi.step = '1'; bi.className = 'bottle-input';
      bi.setAttribute('aria-label', 'Bottles');
      bi.value = String(bottles(r));
      const auto = el('button', 'linkbtn auto', r.manual ? 'Use auto' : 'auto'); auto.type = 'button';
      auto.disabled = !r.manual || r.custom;
      bi.addEventListener('input', () => { r.manual = true; r.bottles = int(bi.value); auto.textContent = 'Use auto'; auto.disabled = r.custom; refreshRow(li, r); changed(); });
      auto.addEventListener('click', () => { r.manual = false; bi.value = String(autoBottles(r)); auto.textContent = 'auto'; auto.disabled = true; refreshRow(li, r); changed(); });
      row.append(bi, auto); bBox.appendChild(row);
      grid.appendChild(bBox);
      if (r.custom) {
        const pBox = el('div');
        pBox.appendChild(el('label', null, 'Client price per bottle'));
        const pi = el('input'); pi.type = 'number'; pi.inputMode = 'decimal'; pi.min = '0'; pi.value = r.price || ''; pi.setAttribute('aria-label', 'Client price per bottle');
        pi.addEventListener('input', () => { r.price = Number(pi.value) || 0; refreshRow(li, r); changed(); });
        pBox.appendChild(pi);
        grid.append(pBox);
      }
    }
    li.appendChild(grid);

    if (!r.local) li.appendChild(el('div', 'money-line'));

    const acts = el('div', 'sup-acts');
    const lab = el('label'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = r.local;
    cb.addEventListener('change', () => { r.local = cb.checked; if (!r.local && r.custom) r.bottles = r.bottles || 1; renderRows(); changed(); });
    lab.append(cb, document.createTextNode('Buy from a local pharmacy (not billed)'));
    const rm = el('button', 'linkbtn', 'Remove'); rm.type = 'button';
    rm.addEventListener('click', () => { rows.splice(i, 1); renderRows(); renderCatalogue(); changed(); });
    acts.append(lab, rm);
    li.appendChild(acts);
    ol.appendChild(li);
    refreshRow(li, r);
  });
  const n = rows.filter((r) => r.name.trim()).length;
  const sc = $('supCount');
  if (!supCounter) { sc.textContent = ''; const num = el('span'); const w = el('span'); w.id = 'supWord'; sc.append(num, w); supCounter = counter(num); }
  sc.firstChild.hidden = !n;
  if (n) supCounter.set(n);
  $('supWord').textContent = n ? ' on the schedule' : '';
}
function refreshRow(li, r) {
  const bi = li.querySelector('.bottle-input');
  if (bi && !r.manual) bi.value = String(autoBottles(r));
  const line = li.querySelector('.money-line');
  if (!line) return;
  const b = bottles(r), cp = clientPrice(r);
  line.innerHTML = '';
  const left = el('span'); left.append(document.createTextNode(`${b} × ${money(cp)}${packLabel(r) ? ' · ' + packLabel(r) : ''}`));
  line.append(left, el('b', null, money(b * cp)));
}
function refreshAllRows() { document.querySelectorAll('#rows .sup-row').forEach((li, i) => refreshRow(li, rows[i])); }

/* ==========================================================================
   Documents
   ========================================================================== */
function letterhead(rightBits) {
  const head = el('div', 'rx-head');
  const mark = el('div', 'rx-mark');
  const logo = el('img'); logo.src = '../assets/img/lockup.webp'; logo.alt = 'Lifora';
  mark.append(logo, el('div', 'tag', 'A Journey To A Better Life'));
  const right = el('div', 'rx-doc');
  rightBits.forEach(([tag, text]) => { if (text) right.append(el(tag, null, text)); });
  head.append(mark, right);
  return head;
}
const doctorBits = () => [['b', val('docName') || 'Doctor’s name'], ['span', val('docQual')], ['span', val('docReg') ? 'Reg No: ' + val('docReg') : '']];
function line(k, v, right) { const n = el('p', right ? 'r' : null); n.append(el('b', null, k + ': '), document.createTextNode(v || '')); return n; }
function td(text, cls) { return el('td', cls, text); }

function scheduleDoc() {
  const page = el('div', 'page doc'); const p = el('div', 'rx-page');
  p.appendChild(letterhead(doctorBits()));
  const t = el('div', 'doc-title'); t.append(el('h2', null, 'Supplement schedule'), el('span', null, `For ${days} days`)); p.appendChild(t);
  const pt = el('div', 'doc-pt');
  const ageSex = [val('cAge') && val('cAge') + ' yrs', $('cSex').value].filter(Boolean).join(' | ');
  pt.append(line('Name', val('cName')), line('Date', ddmmyyyy(val('cDate')), true), line('Age / Sex', ageSex));
  p.appendChild(pt);
  const table = el('table', 'doc-table');
  const hr = el('tr');
  [['#', ''], ['Supplement', ''], ['When to take', ''], ['Morning', 'mid'], ['Afternoon', 'mid'], ['Evening', 'mid'], ['Dinner', 'mid']].forEach(([h, c]) => hr.appendChild(el('th', c, h)));
  const thead = el('thead'); thead.appendChild(hr);
  const tb = el('tbody');
  const list = rows.filter((r) => r.name.trim());
  if (!list.length) { const tr = el('tr', 'doc-empty'); const c = td('Add supplements on the left'); c.colSpan = 7; tr.appendChild(c); tb.appendChild(tr); }
  list.forEach((r, i) => {
    const tr = el('tr');
    const name = td(r.name.trim(), 'name');
    if (r.local) name.appendChild(el('small', null, 'Buy from a local pharmacy'));
    tr.append(td(String(i + 1)), name, td(r.timing));
    if (r.custom && r.doseMode === 'text') { const c = td(r.doseText.trim() || '–', 'mid dose-text'); c.colSpan = 4; tr.appendChild(c); }
    else ['m', 'a', 'e', 'd'].forEach((k) => tr.appendChild(int(r[k]) ? td(String(int(r[k])), 'mid dose') : td('–', 'mid dash')));
    tb.appendChild(tr);
  });
  table.append(thead, tb);
  p.appendChild(table);
  const instr = val('instructions').split('\n').map((s) => s.trim().replace(/^\d+[.)]\s*/, '')).filter(Boolean);
  if (instr.length) {
    const box = el('div', 'doc-instr'); box.appendChild(el('h3', null, 'Client instructions'));
    const ol = el('ol'); instr.forEach((s) => ol.appendChild(el('li', null, s))); box.appendChild(ol); p.appendChild(box);
  }
  const sign = el('div', 'rx-sign'); const sigBox = el('div', 'sig');
  const sigKey = 'lifora.rx.sig.' + (val('docReg') || val('docName')).toLowerCase().replace(/\s+/g, '');
  const sig = store.get(sigKey); if (sig) { const im = el('img'); im.src = sig; im.alt = ''; sigBox.appendChild(im); }
  const regDigits = val('docReg').replace(/^[A-Za-z]+[-\s]*/, '');
  sign.append(sigBox, el('div', 'line', (val('docName') || 'Doctor') + (regDigits ? ' - ' + regDigits : '')), el('small', null, 'Doctor’s Signature & Stamp'));
  page.append(p, sign);
  return { page, reserve: 250 };
}

function billDoc() {
  const page = el('div', 'page doc'); const p = el('div', 'rx-page');
  p.appendChild(letterhead([['b', 'Bill no. ' + billNo], ['span', 'Date: ' + ddmmyyyy(val('cDate'))]]));
  const t = el('div', 'doc-title'); t.append(el('h2', null, 'Bill'), el('span', null, 'Supplements')); p.appendChild(t);
  const pt = el('div', 'doc-pt');
  pt.append(line('Billed to', val('cName')), line('Duration', `${days} days`, true));
  if (val('cPhone')) pt.append(line('Phone', val('cPhone')));
  p.appendChild(pt);
  const table = el('table', 'doc-table');
  const hr = el('tr');
  [['#', ''], ['Item', ''], ['Qty', 'num'], ['Rate', 'num'], ['Amount', 'num']].forEach(([h, c]) => hr.appendChild(el('th', c, h)));
  const thead = el('thead'); thead.appendChild(hr);
  const tb = el('tbody');
  const list = billed();
  if (!list.length) { const tr = el('tr', 'doc-empty'); const c = td('No billed items yet'); c.colSpan = 5; tr.appendChild(c); tb.appendChild(tr); }
  list.forEach((r, i) => {
    const tr = el('tr'); const name = td(r.name.trim(), 'name');
    if (packLabel(r)) name.appendChild(el('small', null, packLabel(r)));
    tr.append(td(String(i + 1)), name, td(String(bottles(r)), 'num'), td(money(clientPrice(r)), 'num'), td(money(bottles(r) * clientPrice(r)), 'num'));
    tb.appendChild(tr);
  });
  const tf = el('tfoot'); const g = el('tr', 'grand'); const lab = td('Total'); lab.colSpan = 4; g.append(lab, td(money(total(clientPrice)), 'num')); tf.appendChild(g);
  table.append(thead, tb, tf);
  p.appendChild(table);
  const locals = rows.filter((r) => r.name.trim() && r.local).map((r) => r.name.trim());
  if (locals.length) p.appendChild(el('p', 'doc-note', `Not billed (buy from a local pharmacy): ${locals.join(', ')}.`));
  if (pay && pay.amount === total(clientPrice)) {
    const box = el('div', 'bill-pay'); const qr = el('div', 'qr'); qr.dataset.qr = pay.link;
    const txt = el('p'); txt.append(el('b', null, 'Pay online by UPI'), document.createTextNode('Scan the code or open the link to pay.'), el('br'), el('span', null, pay.link));
    box.append(qr, txt); p.appendChild(box);
  }
  page.appendChild(p);
  return { page, reserve: 90 };
}

const BUILD = { schedule: scheduleDoc, bill: billDoc };

async function drawQrs(root) {
  const boxes = root.querySelectorAll('[data-qr]');
  if (!boxes.length) return;
  await loadScript('../vendor/qrcode-generator-1.4.4.min.js');
  boxes.forEach((b) => { const q = window.qrcode(0, 'M'); q.addData(b.dataset.qr); q.make(); b.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); });
}

/* Build one document into the preview, shrinking type until it fits one A4 page. */
function renderDoc(kind) {
  const root = $('pagesRoot');
  root.innerHTML = '';
  const { page, reserve } = BUILD[kind]();
  root.appendChild(page);
  const body = page.querySelector('.rx-page');
  let s = 1;
  while (body.scrollHeight > PAGE_H - reserve && s > 0.72) { s = +(s - 0.04).toFixed(2); page.style.setProperty('--s', s); }
  const fits = body.scrollHeight <= PAGE_H - reserve;
  drawQrs(page);
  return fits;
}
function render() {
  const fits = renderDoc(docView);
  const st = $('status');
  st.classList.toggle('warn', !fits);
  const n = billed().length;
  st.textContent = !fits ? 'Too many rows for one page. Split this into two lists.'
    : docView === 'schedule' ? `${rows.filter((r) => r.name.trim()).length} on the schedule, ${days} days`
    : docView === 'bill' ? `${n} billed, total ${money(total(clientPrice))}`
    : '';
  $('payBtn').hidden = docView !== 'bill';
  fit();
}
function fit() {
  const stage = $('stage'), pages = $('pagesRoot'), scaler = $('scaler');
  const cs = getComputedStyle(stage);
  const s = Math.min(1, (stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) / PAGE_W);
  pages.style.transform = `scale(${s})`;
  scaler.style.width = PAGE_W * s + 'px';
  scaler.style.height = pages.offsetHeight * s + 'px';
}

/* ==========================================================================
   Draft
   ========================================================================== */
const FIELDS = ['cName', 'cAge', 'cSex', 'cDate', 'cPhone', 'cAddress', 'docName', 'docQual', 'docReg', 'instructions'];
function saveDraft() {
  const d = { rows, days, billNo, pay, docView };
  FIELDS.forEach((id) => { d[id] = $(id).value; });
  store.set(DRAFT_KEY, d);
  writeSharedClient({ name: val('cName'), age: val('cAge'), sex: $('cSex').value });
}
function updateBillTotal() { if (!billCounter) billCounter = rupeeCounter($('billTotal')); billCounter.set(total(clientPrice)); }
const schedule = frameScheduler(() => { render(); saveDraft(); updatePayPanel(); updateBillTotal(); });
function changed() { schedule(); }

function loadDraft() {
  const d = store.get(DRAFT_KEY);
  if (d) {
    FIELDS.forEach((id) => { if (d[id] != null) $(id).value = d[id]; });
    rows = (Array.isArray(d.rows) ? d.rows : []).filter((r) => r.custom || catalogue.has(r.name));
    rows.forEach((r) => { r.key = uid++; if (!r.custom && !(catalogue.get(r.name) || {})[r.pack]) r.pack = catalogue.get(r.name)['30s'] ? '30s' : '60s'; });
    days = int(d.days) || 30; billNo = d.billNo || ''; pay = d.pay || null; docView = DOCS[d.docView] ? d.docView : 'schedule';
  }
  const c = readSharedClient();
  if (!val('cName') && c.name) $('cName').value = c.name;
  if (!val('cAge') && c.age) $('cAge').value = c.age;
  if (!$('cSex').value && c.sex) $('cSex').value = c.sex;
  if (!val('docName')) {   // last doctor used on the Prescription page
    const rx = store.get('lifora.rx.draft', {});
    $('docName').value = rx.docName || ''; $('docQual').value = rx.docQual || ''; $('docReg').value = rx.docReg || '';
  }
  if (!val('cDate')) $('cDate').value = iso(new Date());
  if (!val('instructions')) $('instructions').value = DEFAULT_INSTRUCTIONS;
  // Older drafts said "the clinic"; the wording is now "the team".
  $('instructions').value = $('instructions').value.replace('Contact the clinic if you have questions', 'Contact the team if you have questions');
  if (!billNo) billNo = newBillNo();
}
function setDays(n) {
  days = Math.min(365, Math.max(1, int(n) || 30));
  document.querySelectorAll('#daySeg [data-days]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.days) === days)));
  if ($('days').value !== String(days)) $('days').value = String(days);
  refreshAllRows(); changed();
}
function resetAll() {
  ['cName', 'cAge', 'cSex', 'cPhone', 'cAddress'].forEach((id) => { $(id).value = ''; });
  $('cDate').value = iso(new Date());
  rows = []; pay = null; billNo = newBillNo();
  renderRows(); renderCatalogue(); setDays(30);
  $('cName').focus();
  toast('Cleared. The doctor and instructions were kept.');
}

/* ==========================================================================
   Payment link (from the bill)
   ========================================================================== */
function waLink(link) {
  const first = val('cName').split(/\s+/)[0] || '';
  const text = `Hello ${first}, here is your Lifora supplements bill (${money(pay.amount)}). You can pay here with any UPI app:\n${link}\n\nThank you.`;
  const digits = val('cPhone').replace(/\D/g, '');
  const phone = digits.length === 10 ? '91' + digits : (digits.length >= 11 ? digits : '');
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
function updatePayPanel() {
  const box = $('payResult');
  if (!pay || docView !== 'bill') { box.hidden = true; return; }
  box.hidden = false; box.innerHTML = '';
  const stale = pay.amount !== total(clientPrice);
  box.appendChild(el('strong', null, stale ? `The bill changed since the payment link was made (${money(pay.amount)}). Create a new link.` : `Payment link for ${money(pay.amount)}`));
  const a = el('a', null, pay.link); a.href = pay.link; a.target = '_blank'; a.rel = 'noopener';
  const row = el('div', 'row');
  if (!stale) {
    const wa = el('a', 'linkbtn', 'Send on WhatsApp'); wa.href = waLink(pay.link); wa.target = '_blank'; wa.rel = 'noopener';
    const cp = el('button', 'linkbtn', 'Copy link'); cp.type = 'button';
    cp.addEventListener('click', async () => { try { await navigator.clipboard.writeText(pay.link); dynamicButton(cp).flash('Copied', '', 1500); } catch { prompt('Copy this link', pay.link); } });
    row.append(wa, cp);
  }
  box.append(el('br'), a, row);
  $('payBtn').textContent = stale ? 'Create new payment link' : 'Payment link made';
}
async function createPayLink() {
  if (!val('cName')) { $('nameField').classList.add('invalid'); $('cName').focus(); return; }
  const amount = total(clientPrice);
  if (!(amount >= 1)) { toast('Add at least one billed supplement first.'); return; }
  if (pay && pay.amount === amount && !confirm('A payment link for this amount already exists. Create another one?')) return;
  const b = dynamicButton($('payBtn'));
  b.busy('Creating link');
  const { data, error } = await client.rpc('create_payment_request', {
    p_customer_name: val('cName'), p_customer_phone: val('cPhone') || null,
    purpose_text: `Supplements, bill ${billNo}`, p_amount: amount,
    p_expires_at: new Date(Date.now() + 7 * 86400000).toISOString()
  });
  if (error) { b.reset(); toast('Couldn’t create the link: ' + error.message); return; }
  pay = { id: data, link: checkoutLink(data), amount };
  await saveCostSheet();
  b.flash('Link ready');
  changed();
}

/* ==========================================================================
   Private cost sheet: saved, never downloaded here
   ========================================================================== */
async function saveCostSheet() {
  // Cost prices are filled in by the database; this page never receives them.
  const items = billed().map((r) => ({ name: r.name.trim(), pack: r.custom ? 'custom' : r.pack, label: packLabel(r), qty: bottles(r), client: clientPrice(r) }));
  if (!items.length) return true;
  const { error } = await client.rpc('save_supplement_order', { p: {
    bill_no: billNo, bill_date: val('cDate'), client_name: val('cName'), client_phone: val('cPhone'), client_address: val('cAddress'),
    doctor_name: val('docName'), days, items, local_items: rows.filter((r) => r.name.trim() && r.local).map((r) => r.name.trim()),
    payment_request_id: pay && pay.amount === total(clientPrice) ? pay.id : null
  } });
  if (error) { console.error(error); toast('The bill is fine, but the cost sheet couldn’t be saved: ' + error.message); return false; }
  return true;
}

/* ==========================================================================
   PDFs
   ========================================================================== */
function validate() {
  if (!val('cName')) { $('nameField').classList.add('invalid'); $('cName').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('cName').focus({ preventScroll: true }); return false; }
  if (!rows.some((r) => r.name.trim())) { toast('Add at least one supplement.'); return false; }
  return true;
}
const fileName = (kind) => `Lifora_${{ schedule: 'Supplement_Schedule', bill: 'Bill' }[kind]}_${safePart(val('cName'), 'Client')}_${val('cDate') || 'undated'}.pdf`;
async function pdfFor(kind) {
  await Promise.all([loadScript('../vendor/html2canvas.min.js'), loadScript('../vendor/jspdf.umd.min.js')]);
  await fontsReady();
  renderDoc(kind);
  const page = document.querySelector('#pagesRoot .page');
  await drawQrs(page);
  await Promise.all([...page.querySelectorAll('img')].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  document.body.classList.add('exporting');
  try {
    const canvas = await window.html2canvas(page, { scale: 2, backgroundColor: '#ffffff', logging: false });
    const pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    return pdf.output('blob');
  } finally { document.body.classList.remove('exporting'); }
}
async function onPdf() {
  if (!validate()) return;
  const b = dynamicButton($('pdfBtn'));
  b.busy('Preparing');
  try { downloadBlob(await pdfFor(docView), fileName(docView)); if (docView === 'bill') await saveCostSheet(); b.flash('Downloaded'); }
  catch (e) { console.error(e); b.reset(); toast('Couldn’t make the PDF. Try again.'); }
  finally { render(); }
}
async function onAll() {
  if (!validate()) return;
  const b = dynamicButton($('allBtn'));
  try {
    for (const kind of Object.keys(DOCS)) {
      b.busy(`${DOCS[kind]}…`);
      downloadBlob(await pdfFor(kind), fileName(kind));
      await new Promise((r) => setTimeout(r, 400));   // browsers drop downloads fired too close together
    }
    await saveCostSheet();
    b.flash('2 PDFs saved');
  } catch (e) { console.error(e); b.reset(); toast('Couldn’t make all three PDFs. Try them one at a time.'); }
  finally { render(); }
}

/* ==========================================================================
   Sign-in + init
   ========================================================================== */
async function loadCatalogue() {
  const { data, error } = await client.rpc('get_supplement_catalogue');   // client prices only
  if (error) throw error;
  catalogue = new Map();
  (data || []).forEach((r) => { if (!catalogue.has(r.name)) catalogue.set(r.name, {}); catalogue.get(r.name)[r.pack] = r; });
  if (!catalogue.size) throw new Error('This account isn’t set up for Lifora Studio yet. Ask the admin to add you as staff.');
}
async function openApp() {
  $('signin').hidden = true;
  const host = $('appLoading'); host.hidden = false;
  try { await withLogoLoader(host, loadCatalogue(), { size: 72, ariaLabel: 'Loading the supplement list' }); }
  catch (e) { host.hidden = true; $('signin').hidden = false; $('signinErr').textContent = e.message || 'Couldn’t load the supplement list.'; return; }
  host.hidden = true;
  $('signin').hidden = true; $('app').hidden = false;
  const docs = [...DOCTORS, ...store.get('lifora.rx.doctors', [])];
  docs.forEach((d) => $('docList').appendChild(new Option(d.name)));
  loadDraft();
  renderCatalogue(); renderRows();
  setDays(days);
  document.querySelectorAll('.doc-tabs [data-doc]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.doc === docView)));
  changed();
  sectionRail($('rail'), [
    { label: 'Client', el: $('secClient') }, { label: 'Doctor', el: $('secDoctor') }, { label: 'Duration', el: $('secDays') },
    { label: 'Supplements', el: $('secSups') }, { label: 'Instructions', el: $('secInstr') }
  ]);
}
async function boot() {
  document.querySelectorAll('[data-icon]').forEach((n) => { n.outerHTML = ICON[n.dataset.icon]; });
  $('pagesRoot').appendChild(el('div', 'page doc'));
  new ResizeObserver(fit).observe($('stage'));
  try { client = await db(); } catch { $('signin').hidden = false; $('signinErr').textContent = 'Couldn’t reach the server. Check the connection and reload.'; return; }
  const { data: { session } } = await client.auth.getSession();
  if (session) openApp(); else $('signin').hidden = false;
}

$('signin').addEventListener('submit', async (e) => {
  e.preventDefault(); $('signinErr').textContent = '';
  const { error } = await client.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
  if (error) { $('signinErr').textContent = error.message; return; }
  openApp();
});
$('signout').addEventListener('click', async () => { await client.auth.signOut(); location.reload(); });
$('supSearch').addEventListener('input', renderCatalogue);
$('addCustom').addEventListener('click', addCustom);
document.querySelectorAll('#packAll [data-pack]').forEach((b) => b.addEventListener('click', () => switchAll(b.dataset.pack)));
document.querySelectorAll('#daySeg [data-days]').forEach((b) => b.addEventListener('click', () => setDays(b.dataset.days)));
$('days').addEventListener('input', () => { if (int($('days').value)) setDays($('days').value); });
document.querySelector('.form-col').addEventListener('input', (e) => {
  if (FIELDS.includes(e.target.id)) changed();
  if (e.target.id === 'cName' && val('cName')) $('nameField').classList.remove('invalid');
});
document.querySelector('.form-col').addEventListener('change', (e) => { if (FIELDS.includes(e.target.id)) changed(); });
// Picking a saved doctor from the list fills their details (only into empty fields).
$('docName').addEventListener('input', () => {
  const d = [...DOCTORS, ...store.get('lifora.rx.doctors', [])].find((x) => x.name === val('docName'));
  if (d) { if (!val('docQual')) $('docQual').value = d.qual || ''; if (!val('docReg')) $('docReg').value = d.reg || ''; changed(); }
});
document.querySelectorAll('.doc-tabs [data-doc]').forEach((t) => t.addEventListener('click', () => {
  docView = t.dataset.doc;
  document.querySelectorAll('.doc-tabs [data-doc]').forEach((x) => x.setAttribute('aria-selected', String(x === t)));
  changed();
}));
$('pdfBtn').addEventListener('click', onPdf);
$('allBtn').addEventListener('click', onAll);
$('payBtn').addEventListener('click', createPayLink);
$('resetBtn').addEventListener('click', resetAll);
boot();
