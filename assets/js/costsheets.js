import { $, fontsReady, safePart, downloadBlob, toast, loadScript, ICON, dynamicButton } from './common.js';
import { db, money } from './pay-config.js';
import { costSheetPage } from './costsheet.js';

const PAGE_W = 1024;
let client = null, orders = [], current = null;
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const fmtDate = (v) => (v ? new Date(String(v).slice(0, 10) + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function fit() {
  const stage = $('stage'), pages = $('pagesRoot'), scaler = $('scaler');
  const cs = getComputedStyle(stage);
  const s = Math.min(1, (stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) / PAGE_W);
  pages.style.transform = `scale(${s})`;
  scaler.style.width = PAGE_W * s + 'px';
  scaler.style.height = pages.offsetHeight * s + 'px';
}
function show(o) {
  current = o;
  $('pagesRoot').innerHTML = '';
  $('pagesRoot').appendChild(costSheetPage(o));
  $('pdfBtn').disabled = false;
  $('status').textContent = `${o.client_name}, bill ${o.bill_no}, total cost ${money(o.cost_total)}`;
  document.querySelectorAll('.sheet').forEach((li) => li.setAttribute('aria-selected', String(li.dataset.id === o.id)));
  fit();
}
function renderList() {
  const q = $('q').value.trim().toLowerCase();
  const list = $('list'); list.innerHTML = '';
  const shown = orders.filter((o) => !q || (o.client_name + ' ' + o.bill_no).toLowerCase().includes(q));
  if (!shown.length) { list.appendChild(el('li', 'empty', orders.length ? 'No match.' : 'No cost sheets yet. They appear here once a supplement bill is downloaded.')); return; }
  shown.forEach((o) => {
    const li = el('li', 'sheet'); li.dataset.id = o.id; li.tabIndex = 0; li.setAttribute('role', 'option');
    const left = el('div'); left.append(el('b', null, o.client_name), el('div', 'sub', `${o.bill_no}, ${fmtDate(o.bill_date)}, ${(o.items || []).length} items`));
    const amt = el('div', 'amt', money(o.cost_total)); amt.appendChild(el('small', null, 'cost'));
    li.append(left, amt);
    li.addEventListener('click', () => show(o));
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(o); } });
    list.appendChild(li);
  });
}
async function load() {
  const { data, error } = await client.from('supplement_orders').select('*').order('updated_at', { ascending: false }).limit(500);
  if (error) { $('list').innerHTML = ''; $('list').appendChild(el('li', 'empty', 'Couldn’t load cost sheets: ' + error.message)); return; }
  orders = data || [];
  renderList();
  if (orders[0]) show(orders[0]);
}
async function onPdf() {
  if (!current) return;
  const b = dynamicButton($('pdfBtn'));
  b.busy('Preparing');
  try {
    await Promise.all([loadScript('../vendor/html2canvas.min.js'), loadScript('../vendor/jspdf.umd.min.js')]);
    await fontsReady();
    const page = document.querySelector('#pagesRoot .page');
    await Promise.all([...page.querySelectorAll('img')].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
    document.body.classList.add('exporting');
    let canvas;
    try { canvas = await window.html2canvas(page, { scale: 2, backgroundColor: '#ffffff', logging: false }); }
    finally { document.body.classList.remove('exporting'); fit(); }
    const pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    downloadBlob(pdf.output('blob'), `Lifora_INTERNAL_Cost_Sheet_${safePart(current.client_name, 'Client')}_${current.bill_no}.pdf`);
    b.flash('Downloaded');
  } catch (e) { console.error(e); b.reset(); toast('Couldn’t make the PDF. Try again.'); }
}

async function boot() {
  document.querySelectorAll('[data-icon]').forEach((n) => { n.outerHTML = ICON[n.dataset.icon]; });
  new ResizeObserver(fit).observe($('stage'));
  try { client = await db(); } catch { $('signin').hidden = false; $('signinErr').textContent = 'Couldn’t reach the server. Reload to try again.'; return; }
  const { data: { session } } = await client.auth.getSession();
  if (session) { $('app').hidden = false; load(); } else $('signin').hidden = false;
}
$('signin').addEventListener('submit', async (e) => {
  e.preventDefault(); $('signinErr').textContent = '';
  const { error } = await client.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
  if (error) { $('signinErr').textContent = error.message; return; }
  $('signin').hidden = true; $('app').hidden = false; load();
});
$('signout').addEventListener('click', async () => { await client.auth.signOut(); location.reload(); });
$('q').addEventListener('input', renderList);
$('pdfBtn').addEventListener('click', onPdf);
boot();
