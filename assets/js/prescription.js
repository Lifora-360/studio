import { $, store, readSharedClient, writeSharedClient, fontsReady, frameScheduler, safePart,
  downloadBlob, shareBlob, canShareFiles, toast, loadScript, ICON, dynamicButton } from './common.js';
import { DOCTORS, PRESETS, DOSAGE_FORMS } from './rx-config.js';

const PAGE_W = 1024, PAGE_H = 1448, MAX_ROWS = 10;
const DRAFT_KEY = 'lifora.rx.draft', DOCS_KEY = 'lifora.rx.doctors', SIG_PREFIX = 'lifora.rx.sig.', MEDS_KEY = 'lifora.rx.meds';
const FIELDS = ['docName', 'docQual', 'docReg', 'pName', 'pAge', 'pSex', 'pWeight', 'rxDate', 'pAddress', 'diagnosis', 'advice', 'review'];
let rows = [];

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const val = (id) => String($(id).value || '').trim();
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const ddmmyyyy = (v) => { if (!v) return ''; const [y, m, d] = v.split('-'); return `${d}/${m}/${y}`; };
const blankRow = () => ({ medicine: '', form: '', frequency: '', duration: '' });

/* ==========================================================================
   Doctors (config list + ones saved on this device)
   ========================================================================== */
function doctors() {
  const saved = store.get(DOCS_KEY, []);
  const all = [...DOCTORS];
  saved.forEach((d) => { if (!all.some((x) => x.name === d.name)) all.push(d); });
  return all;
}
const sigKey = () => SIG_PREFIX + (val('docReg') || val('docName')).toLowerCase().replace(/\s+/g, '');
function fillDoctorPick() {
  const pick = $('docPick');
  pick.innerHTML = '';
  pick.appendChild(new Option('New doctor (type below)', 'new'));
  doctors().forEach((d, i) => pick.appendChild(new Option(`${d.name}${d.reg ? ', ' + d.reg : ''}`, String(i))));
  syncDoctorPick();
}
// The list follows what's typed: it shows a saved doctor only while the fields match them exactly.
function syncDoctorPick() {
  const i = doctors().findIndex((d) => d.name === val('docName') && (d.reg || '') === val('docReg') && (d.qual || '') === val('docQual'));
  $('docPick').value = i >= 0 ? String(i) : 'new';
  const onDevice = store.get(DOCS_KEY, []).some((d) => d.name === val('docName'));
  $('docForget').hidden = !onDevice;
}
function useDoctor(d) {
  $('docName').value = d.name || ''; $('docQual').value = d.qual || ''; $('docReg').value = d.reg || '';
  showSig();
  changed();
}
function showSig() {
  const s = store.get(sigKey());
  $('sigThumb').hidden = !s; $('sigClear').hidden = !s;
  if (s) $('sigThumb').src = s;
}
async function readSignature(file) {
  const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const scale = Math.min(1, 600 / img.width);            // keep it small enough for local storage
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

/* ==========================================================================
   Medicine rows
   ========================================================================== */
function rememberMedicine(name) {
  if (!name) return;
  const list = store.get(MEDS_KEY, []).filter((m) => m !== name);
  list.unshift(name);
  store.set(MEDS_KEY, list.slice(0, 40));
  fillMedList();
}
function fillMedList() {
  const names = [...new Set([...PRESETS.map((p) => p.medicine), ...store.get(MEDS_KEY, [])])];
  $('medList').innerHTML = '';
  names.forEach((n) => $('medList').appendChild(new Option(n)));
}

function renderRows() {
  const ol = $('rxRows');
  ol.innerHTML = '';
  rows.forEach((r, i) => {
    const li = el('li', 'rx-row');
    const f = el('div', 'fields');
    const field = (key, label, wide, build) => {
      const box = el('div', 'f' + (wide ? ' wide' : ''));
      const id = `rx-${key}-${i}`;
      const lab = el('label', null, label); lab.htmlFor = id;
      const input = build(); input.id = id; input.value = r[key] || '';
      input.addEventListener('input', () => { rows[i][key] = input.value; changed(); });
      if (key === 'medicine') input.addEventListener('change', () => rememberMedicine(input.value.trim()));
      box.append(lab, input); f.appendChild(box);
    };
    field('medicine', 'Medicine and strength', true, () => { const n = el('input'); n.maxLength = 80; n.setAttribute('list', 'medList'); n.placeholder = 'e.g. Inj. Vitamin B12 1500 mcg'; n.autocomplete = 'off'; return n; });
    field('form', 'Dosage form', false, () => { const n = el('input'); n.maxLength = 30; n.setAttribute('list', 'formList'); return n; });
    field('frequency', 'Frequency', false, () => { const n = el('input'); n.maxLength = 30; return n; });
    field('duration', 'Duration', true, () => { const n = el('input'); n.maxLength = 80; return n; });
    const acts = el('div', 'rx-row-acts');
    if (i > 0) { const up = el('button', 'linkbtn', 'Move up'); up.type = 'button'; up.addEventListener('click', () => { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; renderRows(); changed(); }); acts.appendChild(up); }
    const rm = el('button', 'linkbtn', 'Remove'); rm.type = 'button';
    rm.addEventListener('click', () => { rows.splice(i, 1); if (!rows.length) rows.push(blankRow()); renderRows(); changed(); });
    acts.appendChild(rm);
    li.append(f, acts);
    ol.appendChild(li);
  });
  $('addRow').disabled = rows.length >= MAX_ROWS;
  const filled = rows.filter((r) => r.medicine.trim()).length;
  $('rxCount').textContent = filled ? `${filled} on the prescription` : '';
}
function addRow(data) {
  const empty = rows.findIndex((r) => !r.medicine.trim() && !r.form && !r.frequency && !r.duration);
  if (empty >= 0) rows[empty] = { ...data }; else if (rows.length < MAX_ROWS) rows.push({ ...data });
  else { toast(`Up to ${MAX_ROWS} medicines fit on one page.`); return; }
  renderRows(); changed();
}

/* ==========================================================================
   The page
   ========================================================================== */
function buildPage() {
  const page = el('div', 'page');
  const p = el('div', 'rx-page');

  const head = el('div', 'rx-head');
  const mark = el('div', 'rx-mark');
  const logo = el('img'); logo.src = '../assets/img/lockup.webp'; logo.alt = 'Lifora';
  mark.append(logo, el('div', 'tag', 'A Journey To A Better Life'));
  const doc = el('div', 'rx-doc');
  doc.append(el('b', null, val('docName') || 'Doctor’s name'));
  if (val('docQual')) doc.append(el('span', null, val('docQual')));
  if (val('docReg')) doc.append(el('span', null, 'Reg No: ' + val('docReg')));
  head.append(mark, doc);

  const pt = el('div', 'rx-pt');
  const line = (k, v, right) => { const n = el('p', right ? 'r' : null); n.append(el('b', null, k + ': '), document.createTextNode(v)); return n; };
  const ageSex = [val('pAge'), $('pSex').value].filter(Boolean).join(' | ');
  pt.append(line('Patient Name', val('pName')), line('Date', ddmmyyyy(val('rxDate')), true),
    line('Age / Sex', ageSex), line('Weight', val('pWeight') ? val('pWeight') + ' kg' : '', true));
  if (val('pAddress')) pt.append(line('Address', val('pAddress')));

  p.append(head, pt);
  if (val('diagnosis')) { const dx = el('p', 'rx-dx'); dx.append(el('b', null, 'Diagnosis: '), document.createTextNode(val('diagnosis').replace(/\s*\n\s*/g, ', '))); p.append(dx); }

  p.append(el('div', 'rx-symbol', 'Rx'));
  const table = el('table', 'rx-table');
  const thead = el('thead'); const hr = el('tr');
  ['Medicine', 'Dosage Form', 'Frequency', 'Duration'].forEach((h) => hr.appendChild(el('th', null, h)));
  thead.appendChild(hr);
  const tbody = el('tbody');
  const meds = rows.filter((r) => r.medicine.trim());
  if (!meds.length) { const tr = el('tr', 'empty'); const td = el('td', null, 'Add medicines on the left'); td.colSpan = 4; tr.appendChild(td); tbody.appendChild(tr); }
  meds.forEach((r, i) => {
    const tr = el('tr');
    [`${i + 1}. ${r.medicine.trim()}`, r.form, r.frequency, r.duration].forEach((t) => tr.appendChild(el('td', null, (t || '').trim())));
    tbody.appendChild(tr);
  });
  table.append(thead, tbody);
  p.append(table);

  const advice = val('advice').split('\n').map((s) => s.trim()).filter(Boolean);
  if (advice.length) {
    const a = el('div', 'rx-advice'); a.append(el('h3', null, 'Advice & Investigations'));
    const ol = el('ol'); advice.forEach((t) => ol.appendChild(el('li', null, t))); a.append(ol); p.append(a);
  }
  if (val('review')) { const r = el('p', 'rx-review'); r.append(el('b', null, 'Next Review On: '), document.createTextNode(ddmmyyyy(val('review')))); p.append(r); }

  const sign = el('div', 'rx-sign');
  const sigBox = el('div', 'sig');
  const sig = store.get(sigKey());
  if (sig) { const im = el('img'); im.src = sig; im.alt = ''; sigBox.appendChild(im); }
  const regDigits = val('docReg').replace(/^[A-Za-z]+[-\s]*/, '');
  sign.append(sigBox, el('div', 'line', (val('docName') || 'Doctor') + (regDigits ? ' - ' + regDigits : '')), el('small', null, 'Doctor’s Signature & Stamp'));

  page.append(p, sign);
  return page;
}

function render() {
  const root = $('pagesRoot');
  root.innerHTML = '';
  const page = buildPage();
  root.appendChild(page);
  // Warn if the content would run into the signature block.
  const p = page.querySelector('.rx-page');
  const tooLong = p.scrollHeight > PAGE_H - 230;
  const st = $('status');
  st.classList.toggle('warn', tooLong);
  st.textContent = tooLong ? 'Too long for one page. Shorten the advice or split the medicines across two prescriptions.' : 'A4 PDF';
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
function saveDraft() {
  const d = { rows };
  FIELDS.forEach((id) => { d[id] = $(id).value; });
  store.set(DRAFT_KEY, d);
  writeSharedClient({ name: val('pName'), age: val('pAge'), sex: { M: 'Male', F: 'Female', Other: 'Other' }[$('pSex').value] || '' });
}
const schedule = frameScheduler(() => { render(); saveDraft(); });
function changed() { schedule(); }

function loadDraft() {
  const d = store.get(DRAFT_KEY);
  if (d) {
    FIELDS.forEach((id) => { if (d[id] != null) $(id).value = d[id]; });
    rows = Array.isArray(d.rows) && d.rows.length ? d.rows.slice(0, MAX_ROWS).map((r) => ({ ...blankRow(), ...r })) : [blankRow()];
  } else {
    rows = [blankRow()];   // doctor starts empty: whoever is prescribing fills in their own details
  }
  const c = readSharedClient();
  if (!val('pName') && c.name) $('pName').value = c.name;
  if (!val('pAge') && c.age) $('pAge').value = c.age;
  if (!$('pSex').value && c.sex) $('pSex').value = { Male: 'M', Female: 'F', Other: 'Other' }[c.sex] || '';
  if (!val('rxDate')) $('rxDate').value = iso(new Date());
}
function resetAll() {
  ['pName', 'pAge', 'pSex', 'pWeight', 'pAddress', 'diagnosis', 'advice', 'review'].forEach((id) => { $(id).value = ''; });
  $('rxDate').value = iso(new Date());
  rows = [blankRow()];
  $('nameField').classList.remove('invalid');
  renderRows(); changed();
  $('pName').focus();
  toast('Cleared. The doctor’s details were kept.');
}

/* ==========================================================================
   PDF
   ========================================================================== */
function validate() {
  if (!val('pName')) { $('nameField').classList.add('invalid'); $('pName').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('pName').focus({ preventScroll: true }); return false; }
  if (!val('docName')) { $('docNameField').classList.add('invalid'); $('docName').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('docName').focus({ preventScroll: true }); return false; }
  if (!val('docReg')) { $('docRegField').classList.add('invalid'); $('docReg').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('docReg').focus({ preventScroll: true }); return false; }
  if (!rows.some((r) => r.medicine.trim())) { toast('Add at least one medicine.'); return false; }
  return true;
}
const pdfName = () => `Lifora_Prescription_${safePart(val('pName'), 'Patient')}_${val('rxDate') || 'undated'}.pdf`;
async function buildPdf() {
  await Promise.all([loadScript('../vendor/html2canvas.min.js'), loadScript('../vendor/jspdf.umd.min.js')]);
  await fontsReady();
  render();
  const page = document.querySelector('#pagesRoot .page');
  await Promise.all([...page.querySelectorAll('img')].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  document.body.classList.add('exporting');
  try {
    const canvas = await window.html2canvas(page, { scale: 2, backgroundColor: '#ffffff', logging: false });
    const pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    return pdf.output('blob');
  } finally { document.body.classList.remove('exporting'); fit(); }
}
async function onPdf() {
  if (!validate()) return;
  const b = dynamicButton($('pdfBtn'));
  b.busy('Preparing');
  try {
    const url = downloadBlob(await buildPdf(), pdfName());
    b.flash('Downloaded');
    $('status').textContent = 'Saved ' + pdfName();
    toast('PDF downloaded.', { label: 'Open instead', run: () => window.open(url, '_blank') });
  } catch (e) {
    console.error(e); b.reset();
    $('status').textContent = 'The PDF couldn’t be made here. Opening the print dialog; choose “Save as PDF”.';
    setTimeout(() => window.print(), 400);
  }
}
async function onShare() {
  if (!validate()) return;
  const b = dynamicButton($('shareBtn'));
  b.busy('Preparing');
  try {
    const blob = await buildPdf();
    const r = await shareBlob(blob, pdfName(), 'Lifora prescription');
    if (r === 'shared') b.flash('Shared');
    else if (r === 'unsupported') { downloadBlob(blob, pdfName()); b.flash('Downloaded'); }
    else b.reset();
  } catch (e) { console.error(e); b.reset(); toast('Couldn’t make the PDF. Try Download instead.'); }
}

/* ==========================================================================
   Init
   ========================================================================== */
function init() {
  document.querySelectorAll('[data-icon]').forEach((n) => { n.outerHTML = ICON[n.dataset.icon]; });
  const formList = el('datalist'); formList.id = 'formList';
  DOSAGE_FORMS.forEach((f) => formList.appendChild(new Option(f)));
  document.body.appendChild(formList);
  PRESETS.forEach((p) => {
    const b = el('button', 'preset', p.label); b.type = 'button';
    b.addEventListener('click', () => addRow({ medicine: p.medicine, form: p.form, frequency: p.frequency, duration: p.duration }));
    $('rxPresets').appendChild(b);
  });
  fillMedList();
  loadDraft();
  fillDoctorPick();
  showSig();
  renderRows();

  $('docPick').addEventListener('change', () => {
    const v = $('docPick').value;
    if (v === 'new') { useDoctor({}); $('docName').focus(); } else useDoctor(doctors()[Number(v)]);
    syncDoctorPick();
  });
  $('docClear').addEventListener('click', () => { useDoctor({}); syncDoctorPick(); $('docName').focus(); });
  $('docForget').addEventListener('click', () => {
    store.set(DOCS_KEY, store.get(DOCS_KEY, []).filter((d) => d.name !== val('docName')));
    fillDoctorPick();
    toast('Removed from this device. The details stay on this prescription.');
  });
  $('docSave').addEventListener('click', () => {
    if (!val('docName')) { toast('Type the doctor’s name first.'); return; }
    const saved = store.get(DOCS_KEY, []).filter((d) => d.name !== val('docName'));
    saved.push({ name: val('docName'), qual: val('docQual'), reg: val('docReg') });
    store.set(DOCS_KEY, saved);
    if (!val('docReg')) toast('Saved. Add the registration number too before printing.');
    fillDoctorPick();
    dynamicButton($('docSave')).flash('Saved', '', 1500);
  });
  $('sigFile').addEventListener('change', async () => {
    const f = $('sigFile').files[0]; $('sigFile').value = '';
    if (!f) return;
    if (!val('docName')) { toast('Add the doctor’s name before the signature.'); return; }
    try { store.set(sigKey(), await readSignature(f)); showSig(); changed(); }
    catch { toast('That image couldn’t be read. Try a PNG or JPG.'); }
  });
  $('sigClear').addEventListener('click', () => { store.remove(sigKey()); showSig(); changed(); });
  document.querySelectorAll('[data-review]').forEach((b) => b.addEventListener('click', () => {
    const base = val('rxDate') ? new Date(val('rxDate') + 'T00:00') : new Date();
    base.setDate(base.getDate() + Number(b.dataset.review));
    $('review').value = iso(base); changed();
  }));
  document.querySelector('.form-col').addEventListener('input', (e) => {
    if (FIELDS.includes(e.target.id)) changed();
    if (['docName', 'docReg', 'docQual'].includes(e.target.id)) { showSig(); syncDoctorPick(); }
    if (e.target.id === 'docName' && val('docName')) $('docNameField').classList.remove('invalid');
    if (e.target.id === 'docReg' && val('docReg')) $('docRegField').classList.remove('invalid');
    if (e.target.id === 'pName' && val('pName')) $('nameField').classList.remove('invalid');
  });
  document.querySelector('.form-col').addEventListener('change', (e) => { if (FIELDS.includes(e.target.id)) changed(); });
  $('addRow').addEventListener('click', () => { rows.push(blankRow()); renderRows(); changed(); $(`rx-medicine-${rows.length - 1}`).focus(); });
  $('resetBtn').addEventListener('click', resetAll);
  $('pdfBtn').addEventListener('click', onPdf);
  if (canShareFiles('application/pdf')) { $('shareBtn').hidden = false; $('shareBtn').addEventListener('click', onShare); }
  new ResizeObserver(fit).observe($('stage'));
  render();
  fontsReady().then(render);
}
init();
