import { $, loadScript, toast } from './common.js';
import { db, UPI, money, upiUri } from './pay-config.js';

/* Public checkout: /pay/?id=<uuid>  (old links used ?pay=<uuid>; both work). */
const params = new URLSearchParams(location.search);
const id = params.get('id') || params.get('pay') || '';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const onPhone = matchMedia('(pointer:coarse)').matches || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
let request = null;

function show(section) {
  ['loading', 'due', 'reported', 'paid', 'missing'].forEach((s) => { $(s).hidden = s !== section; });
}

async function fetchRequest(client) {
  // Prefer the v2 function; fall back to the original one if the migration hasn't been run.
  let { data, error } = await client.rpc('get_checkout', { p_payment_id: id });
  if (error && /get_checkout|function|schema cache/i.test(error.message || '')) {
    ({ data, error } = await client.rpc('get_payment_request', { p_payment_id: id }));
  }
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

async function drawQr(text) {
  await loadScript('../vendor/qrcode-generator-1.4.4.js');
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  $('coQr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
  const svg = $('coQr').querySelector('svg');
  svg.querySelectorAll('path,rect').forEach((p) => { if (p.getAttribute('fill') === 'black' || p.getAttribute('fill') === '#000000') p.setAttribute('fill', '#0e3b38'); });
}

function renderDue(r) {
  const amount = money(r.amount);
  $('coFor').textContent = 'Payment for ' + r.customer_name;
  $('coAmount').textContent = amount;
  $('coAmt2').textContent = amount;
  $('coPurpose').textContent = r.purpose;
  $('coPayee').textContent = UPI.name;
  $('coUpi').textContent = UPI.id;
  const uri = upiUri(r);
  const query = uri.slice(uri.indexOf('?'));
  $('coPay').href = uri;
  $('coPay').textContent = 'Pay ' + amount + ' with a UPI app';
  // App-specific links: iPhones often ignore the generic upi:// link, these open the app directly.
  const APPS = { gpay: 'tez://upi/pay', phonepe: 'phonepe://pay', paytm: 'paytmmp://pay' };
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) APPS.gpay = 'gpay://upi/pay';
  document.querySelectorAll('.co-app').forEach((a) => { a.href = APPS[a.dataset.app] + query; });
  drawQr(uri).catch(() => { $('coQrWrap').hidden = true; });

  if (onPhone) {
    // The pay buttons come first; the QR (for paying from another phone) is one tap away.
    $('coQrWrap').hidden = true;
    $('coShowQr').hidden = false;
    $('coShowQr').addEventListener('click', () => { $('coQrWrap').hidden = false; $('coShowQr').hidden = true; });
  } else {
    // On a computer the buttons stay (a phone browser may still report a fine pointer), plus a hint to scan.
    $('coDeskHint').hidden = false;
  }

  document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const v = b.dataset.copy === 'upi' ? UPI.id : Number(r.amount).toFixed(Number(r.amount) % 1 ? 2 : 0);
    try { await navigator.clipboard.writeText(v); toast('Copied'); } catch { toast('Couldn’t copy. Select the text instead.'); }
  }));

  $('coRefForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ref = $('coRef').value.replace(/\s/g, '').toUpperCase();
    const msg = $('coRefMsg');
    if (!/^[A-Z0-9]{6,40}$/.test(ref)) { msg.className = 'co-msg err'; msg.textContent = 'Enter the reference exactly as your UPI app shows it (letters and numbers only).'; return; }
    msg.className = 'co-msg'; msg.textContent = 'Sending…';
    const client = await db();
    const { error } = await client.rpc('submit_payment_reference', { p_payment_id: r.id, p_reference: ref });
    if (error) {
      msg.className = 'co-msg err';
      msg.textContent = /function|schema cache/i.test(error.message || '')
        ? 'Please send this reference to your Lifora care team on WhatsApp.'
        : error.message;
      return;
    }
    show('reported');
  });
}

function renderPaid(r) {
  $('paidAmount').textContent = money(r.amount);
  const when = r.paid_at ? new Date(r.paid_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  $('paidText').textContent = r.purpose + (when ? ', confirmed on ' + when : '') + '. Thank you.';
  show('paid');
}

async function init() {
  if (!UUID.test(id)) { show('missing'); return; }
  try {
    const client = await db();
    request = await fetchRequest(client);
  } catch (e) { console.error(e); show('missing'); return; }
  if (!request || request.status === 'expired') { show('missing'); return; }
  if (request.status === 'paid') { renderPaid(request); return; }
  renderDue(request);
  show(request.reported ? 'reported' : 'due');
  if (request.reported) {
    // Let them still pay/see details if they reported by mistake.
    const back = document.createElement('button');
    back.type = 'button'; back.className = 'linkbtn'; back.textContent = 'Show payment details';
    back.addEventListener('click', () => show('due'));
    $('reported').appendChild(back);
  }
}
init();
