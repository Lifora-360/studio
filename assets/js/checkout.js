import { $, loadScript, toast, store, safePart, downloadBlob, shareBlob, canShareFiles, fontsReady, dynamicButton } from './common.js';
import { rpc, UPI, money, upiUri } from './pay-config.js';
import { rupeeCounter } from './counter.js';

/* Public checkout: /pay/?id=<uuid>  (old links used ?pay=<uuid>; both work). */
const params = new URLSearchParams(location.search);
const id = params.get('id') || params.get('pay') || '';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const onPhone = matchMedia('(pointer:coarse)').matches || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
let request = null;

function show(section) {
  ['loading', 'due', 'reported', 'paid', 'missing'].forEach((s) => { $(s).hidden = s !== section; });
}

async function fetchRequest() {
  // The request was usually started by the inline script in <head>, before this file even loaded.
  const early = window.__lfCheckout && window.__lfCheckout.id === id ? window.__lfCheckout.promise : null;
  let { data, error } = early ? await early : await rpc('get_checkout', { p_payment_id: id });
  if (error && /get_checkout|function|schema cache/i.test(error.message || '')) {
    ({ data, error } = await rpc('get_payment_request', { p_payment_id: id }));
  }
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

async function drawQr(text) {
  await loadScript('../vendor/qrcode-generator-1.4.4.min.js');
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
    try { await navigator.clipboard.writeText(v); dynamicButton(b).flash('Copied', '', 1500); } catch { toast('Couldn’t copy. Select the text instead.'); }
  }));

  $('coRefForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ref = $('coRef').value.replace(/\s/g, '').toUpperCase();
    const msg = $('coRefMsg');
    if (!/^[A-Z0-9]{6,40}$/.test(ref)) { msg.className = 'co-msg err'; msg.textContent = 'Enter the reference exactly as your UPI app shows it (letters and numbers only).'; return; }
    msg.className = 'co-msg'; msg.textContent = '';
    const send = dynamicButton($('coRefForm').querySelector('button'));
    send.busy('Sending');
    const { error } = await rpc('submit_payment_reference', { p_payment_id: r.id, p_reference: ref });
    if (error) {
      send.reset();
      msg.className = 'co-msg err';
      msg.textContent = /function|schema cache/i.test(error.message || '')
        ? 'Please send this reference to your Lifora care team on WhatsApp.'
        : error.message;
      return;
    }
    send.flash('Sent');
    setTimeout(() => show('reported'), 700);
  });
}

/* ---------- receipt printer (paid state) ---------- */
// Zig-zag torn edge, same geometry as the React component: 40 teeth, 4px deep.
const TEETH = 40, DEPTH = 4;
const teeth = Array.from({ length: TEETH * 2 }, (_, i) => {
  const x = 100 - ((i + 1) * 100) / (TEETH * 2);
  return `${x}% ${i % 2 === 0 ? '100%' : `calc(100% - ${DEPTH}px)`}`;
}).join(', ');
const RECEIPT_CLIP = `polygon(0 0, 100% 0, 100% calc(100% - ${DEPTH}px), ${teeth})`;
const LABELS = { processing: 'Confirming your payment', printing: 'Printing your receipt', complete: 'Payment received' };

function setStage(stage) {
  $('rp').dataset.stage = stage;
  const l = $('rpLabel');
  l.textContent = LABELS[stage];
  l.classList.remove('swap'); void l.offsetWidth; l.classList.add('swap');
  $('rpFeed').setAttribute('aria-hidden', String(stage !== 'complete'));
  if (stage === 'complete') $('paid').classList.add('done');
}

function renderPaid(r) {
  const amount = money(r.amount);
  const paid = r.paid_at ? new Date(r.paid_at) : new Date();
  const screen = rupeeCounter($('rpScreenAmt'));
  $('rpAmt').textContent = amount;
  $('rpNo').textContent = 'LF-' + r.id.slice(0, 8).toUpperCase();
  $('rpDate').textContent = paid.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  $('rpFrom').textContent = r.customer_name;
  $('rpFor').textContent = r.purpose;
  $('rpPaper').style.clipPath = RECEIPT_CLIP;
  show('paid');

  // Print once per device; on later visits the receipt is simply there.
  const seenKey = 'lifora.receipt.' + r.id;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches || store.get(seenKey);
  if (still) { screen.set(r.amount); setStage('complete'); }
  else {
    // The screen counts up from ₹0 while the printer confirms.
    screen.set(0);
    requestAnimationFrame(() => screen.set(r.amount));
    setStage('processing');
    setTimeout(() => setStage('printing'), 900);
    setTimeout(() => { setStage('complete'); store.set(seenKey, 1); }, 900 + 1800);
  }

  $('rpSave').addEventListener('click', async () => {
    const b = dynamicButton($('rpSave'));
    b.busy('Saving');
    try {
      await loadScript('../vendor/html2canvas.min.js');
      await fontsReady();
      const canvas = await window.html2canvas($('rpPaper'), { scale: 3, backgroundColor: '#ffffff', logging: false });
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      const name = `Lifora_Receipt_${safePart(r.customer_name, 'Client')}_${r.id.slice(0, 8).toUpperCase()}.png`;
      let out = 'unsupported';
      if (canShareFiles('image/png')) out = await shareBlob(blob, name, 'Lifora payment receipt');
      if (out === 'unsupported') { downloadBlob(blob, name); b.flash('Saved'); }
      else if (out === 'shared') b.flash('Shared');
      else b.reset();
    } catch (e) { console.error(e); b.reset(); toast('Couldn’t save the receipt. Take a screenshot instead.'); }
  });
}

async function init() {
  if (!UUID.test(id)) { show('missing'); return; }
  try {
    request = await fetchRequest();
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
