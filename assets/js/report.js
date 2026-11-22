import { $, store, readSharedClient, writeSharedClient, clearSharedClient, fontsReady, frameScheduler,
  safePart, prettyDate, today, downloadBlob, shareBlob, canShareFiles, toast, loadScript, ICON, dynamicButton } from './common.js';
import { counter } from './counter.js';
import { bounceSidebar } from './rail.js';
let selCounter = null;

/* ==========================================================================
   Test catalogue (unchanged from v2 so existing workflows carry over)
   ========================================================================== */
const PACKAGES = [
  { name: 'Lifora 1', desc: 'Core metabolic wellness', groups: [
    ['Metabolic Profile', 'glucose', [['fbs', 'Fasting Blood Sugar (FBS)'], ['hba1c', 'HbA1c'], ['insulin', 'Fasting Insulin']]],
    ['Lipid Profile', 'lipid', [['lipidTotal', 'Total Cholesterol'], ['trig', 'Triglycerides'], ['hdl', 'HDL Cholesterol'], ['ldl', 'LDL Cholesterol']]],
    ['Complete Blood Count (CBC)', 'cbc', [['cbc', 'Complete Hemogram / CBC']]],
    ['Iron & Nutritional Profile', 'vitamin', [['iron', 'Serum Iron'], ['ferritin', 'Ferritin']]],
    ['Renal Function Test (RFT)', 'renal', [['rftUrea', 'Urea'], ['rftUric', 'Uric Acid'], ['creat', 'Creatinine'], ['egfr', 'eGFR']]],
    ['Liver Function Test (LFT)', 'liver', [['lftALP', 'Alkaline Phosphatase'], ['bilirubin', 'Bilirubin, Total'], ['ggt', 'Gamma-GT (GGT)'], ['sgpt', 'SGPT / ALT'], ['sgot', 'SGOT / AST']]],
    ['Pancreatic Enzyme Profile', 'pancreas', [['amylase', 'Serum Amylase'], ['lipase', 'Serum Lipase']]],
    ['Bone & Mineral Profile', 'bone', [['ca', 'Serum Calcium'], ['mg', 'Serum Magnesium']]],
    ['Thyroid Profile', 'thyroid', [['t3', 'Total T3'], ['t4', 'Total T4'], ['tsh', 'TSH']]],
    ['Vitamin & Nutrient Profile', 'vitamin', [['b12', 'Vitamin B12'], ['vitd', 'Vitamin D']]],
    ['Cardiovascular Risk Profile', 'heart', [['homocysteine', 'Homocysteine'], ['hscrp', 'hsCRP']]],
    ['Urine & Kidney Risk Profile', 'urine', [['urinalysis', 'Complete Urinalysis'], ['microalbumin', 'Urine Microalbumin / ACR']]]
  ] },
  { name: 'Lifora 2', desc: 'Advanced and specialised', groups: [
    ['Advanced Hormonal Profile', 'hormone', [['acth', 'ACTH'], ['fsh', 'FSH'], ['igf1', 'IGF-1'], ['igfbp3', 'IGF-BP3'], ['lh', 'LH'], ['progesterone', 'Progesterone'], ['prolactin', 'Prolactin'], ['dht', 'DHT'], ['shbg', 'SHBG']]],
    ['Basic Hormonal Profile', 'hormone', [['testosterone', 'Testosterone, Total'], ['estradiol', 'Estradiol (E2)'], ['cortisol', 'Serum Cortisol'], ['dheas', 'DHEA-S']]],
    ['Autoimmune Profile', 'immune', [['accp', 'Anti-CCP (ACCP)']]],
    ['Thyroid Autoimmune Profile', 'immune', [['atpo', 'Anti-TPO (ATPO)'], ['atg', 'Anti-Thyroglobulin (ATg)']]],
    ['Men — Additional Assessment', 'male', [['psa', 'PSA']]]
  ] },
  { name: 'Specialised', desc: 'Cardiac, imaging and body composition', groups: [
    ['Cardiac Assessment', 'heart', [['ecg', 'ECG (Electrocardiogram)'], ['echo', 'ECHO (Echocardiogram)']]],
    ['Imaging & Body Composition', 'imaging', [['mri', 'MRI'], ['ct', 'CT'], ['dexa', 'DEXA Scan']]]
  ] },
  { name: 'GLP-1 / GIP', desc: 'Before and during therapy', groups: [
    ['Baseline Assessment', 'glp', [['glpA1c', 'HbA1c + Fasting Glucose'], ['glpCreat', 'Creatinine + eGFR'], ['glpLiver', 'AST/ALT + Platelet Count'], ['glpLipids', 'Lipid Profile'], ['glpCBC', 'CBC'], ['glpTsh', 'TSH when clinically relevant'], ['glpVits', 'Vitamin B12 + Vitamin D when indicated']]],
    ['Conditional / Clinically Indicated', 'glp', [['glpPreg', 'Pregnancy Test when applicable'], ['glpLipase', 'Amylase / Lipase when clinically indicated'], ['glpGall', 'Gallbladder Ultrasound when indicated'], ['glpECG', 'ECG when indicated'], ['glpEcho', 'ECHO when indicated'], ['glpCalcitonin', 'Targeted thyroid evaluation / calcitonin when indicated'], ['glpHormones', 'Targeted hormonal work-up when indicated']]]
  ] }
];
const LABEL = {};
PACKAGES.forEach((p) => p.groups.forEach((g) => g[2].forEach(([id, l]) => { LABEL[id] = l; })));

/* How selections are grouped on the client-facing report */
const OUTPUT = [
  ['Glycaemic & Insulin Resistance Profile', ['fbs', 'hba1c', 'insulin'], 'glucose'],
  ['Lipid Profile', ['lipidTotal', 'trig', 'hdl', 'ldl'], 'lipid'],
  ['Complete Blood Count', ['cbc'], 'cbc'],
  ['Iron & Nutritional Profile', ['iron', 'ferritin'], 'vitamin'],
  ['Renal Profile', ['rftUrea', 'rftUric', 'creat', 'egfr'], 'renal'],
  ['Liver Function Profile', ['lftALP', 'bilirubin', 'ggt', 'sgpt', 'sgot'], 'liver'],
  ['Pancreatic Enzyme Profile', ['amylase', 'lipase'], 'pancreas'],
  ['Bone & Mineral Profile', ['ca', 'mg'], 'bone'],
  ['Thyroid Profile', ['t3', 't4', 'tsh'], 'thyroid'],
  ['Thyroid Autoimmune Profile', ['atpo', 'atg'], 'immune'],
  ['Vitamin & Nutrient Profile', ['b12', 'vitd'], 'vitamin'],
  ['Cardiovascular Risk Profile', ['homocysteine', 'hscrp'], 'heart'],
  ['Autoimmune Profile', ['accp'], 'immune'],
  ['Advanced Hormonal Profile', ['acth', 'fsh', 'igf1', 'igfbp3', 'lh', 'progesterone', 'prolactin', 'dht', 'shbg'], 'hormone'],
  ['Basic Hormonal Profile', ['testosterone', 'estradiol', 'cortisol', 'dheas'], 'hormone'],
  ['Men’s Additional Assessment', ['psa'], 'male'],
  ['Urine & Kidney Risk Profile', ['urinalysis', 'microalbumin'], 'urine'],
  ['GLP-1 / GIP Baseline Assessment', ['glpA1c', 'glpCreat', 'glpLiver', 'glpLipids', 'glpCBC', 'glpTsh', 'glpVits'], 'glp'],
  ['GLP-1 / GIP Conditional Assessment', ['glpPreg', 'glpLipase', 'glpGall', 'glpECG', 'glpEcho', 'glpCalcitonin', 'glpHormones'], 'glp']
];

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/* ==========================================================================
   Page geometry — single source of truth (true A4 ratio)
   ========================================================================== */
const PAGE_W = 1024, PAGE_H = 1448, MX = 80, CONTENT_W = PAGE_W - MX * 2;
const HEAD_FIRST = 330, HEAD_CONT = 170;   // top of content area
const FOOT_NOTE = 250, FOOT_BAND = 90;     // reserved at the bottom
const DRAFT_KEY = 'lifora.report.v2';
const state = { custom: [], uid: 1 };

/* ==========================================================================
   Sidebar
   ========================================================================== */
const caret = '<svg class="pkg-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

function buildPackages() {
  const root = $('packages');
  PACKAGES.forEach((pkg, pi) => {
    const det = el('details', 'pkg');
    det.id = 'pkg-' + pi;
    if (pi === 0) det.open = true;
    const sum = el('summary');
    const name = el('span', 'pkg-name', pkg.name);
    name.appendChild(el('span', 'pkg-desc', pkg.desc));
    const badge = el('span', 'pkg-badge'); badge.dataset.pkgBadge = pi;
    sum.append(name, badge);
    sum.insertAdjacentHTML('beforeend', caret);
    det.appendChild(sum);
    const body = el('div', 'pkg-body');
    pkg.groups.forEach(([title, , tests]) => {
      const box = el('div', 'tg');
      const head = el('div', 'tg-head');
      const all = el('button', 'tg-all', tests.length > 1 ? 'Select all' : 'Select');
      all.type = 'button';
      all.addEventListener('click', () => {
        const boxes = tests.map(([id]) => document.querySelector(`[data-test="${id}"]`));
        const on = !boxes.every((b) => b.checked);
        boxes.forEach((b) => { b.checked = on; });
        changed();
      });
      head.append(el('div', 'tg-title', title), all);
      box.appendChild(head);
      tests.forEach(([id, label]) => {
        const row = el('label', 'test'); row.dataset.search = (label + ' ' + title).toLowerCase();
        const cb = el('input'); cb.type = 'checkbox'; cb.dataset.test = id;
        row.append(cb, el('span', null, label));
        box.appendChild(row);
        if (id === 'mri' || id === 'ct') {
          const r = el('div', 'region'); r.dataset.regionFor = id;
          const inp = el('input'); inp.id = id + 'Region'; inp.maxLength = 50;
          inp.placeholder = id === 'mri' ? 'Region, e.g. lumbar spine' : 'Region, e.g. abdomen';
          inp.setAttribute('aria-label', (id === 'mri' ? 'MRI' : 'CT') + ' region');
          r.appendChild(inp);
          box.appendChild(r);
        }
      });
      body.appendChild(box);
    });
    det.appendChild(body);
    root.appendChild(det);
  });
}

function updateBadges(chosen) {
  PACKAGES.forEach((pkg, pi) => {
    let n = 0;
    pkg.groups.forEach((g) => g[2].forEach(([id]) => { if (chosen.includes(id)) n++; }));
    document.querySelector(`[data-pkg-badge="${pi}"]`).textContent = n ? String(n) : '';
  });
  const total = chosen.length + state.custom.length;
  if (!selCounter) selCounter = counter($('selNum'));
  $('selNum').hidden = !total;
  if (total) selCounter.set(total);
  $('selWord').textContent = total ? ' selected' : 'None selected';
  document.querySelectorAll('.region').forEach((r) => r.classList.toggle('show', chosen.includes(r.dataset.regionFor)));
}

function wireSearch() {
  const input = $('testSearch'), count = $('searchCount');
  const openState = new Map();
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    let shown = 0, total = 0;
    document.querySelectorAll('.pkg').forEach((pkg) => {
      if (!openState.has(pkg)) openState.set(pkg, pkg.open);
      let pkgHas = false;
      pkg.querySelectorAll('.tg').forEach((g) => {
        let gHas = false;
        g.querySelectorAll('.test').forEach((t) => {
          total++;
          const hit = !q || t.dataset.search.includes(q);
          t.classList.toggle('hidden-by-search', !hit);
          if (hit) { gHas = true; shown++; }
        });
        g.classList.toggle('hidden-by-search', !gHas);
        pkgHas = pkgHas || gHas;
      });
      pkg.classList.toggle('hidden-by-search', !pkgHas);
      pkg.open = q ? pkgHas : openState.get(pkg);
    });
    if (!q) openState.clear();
    count.textContent = q ? (shown ? `${shown} of ${total} tests` : 'No match. Add it below as a custom test.') : '';
  });
}

function renderCustom() {
  const list = $('customList');
  list.innerHTML = '';
  state.custom.forEach((c) => {
    const chip = el('span', 'cchip', c.label);
    const x = el('button', null, '×'); x.type = 'button'; x.setAttribute('aria-label', 'Remove ' + c.label);
    x.addEventListener('click', () => { state.custom = state.custom.filter((k) => k.id !== c.id); renderCustom(); changed(); });
    chip.appendChild(x);
    list.appendChild(chip);
  });
}
function addCustom() {
  const v = $('customTest').value.trim();
  if (!v) return;
  state.custom.push({ id: state.uid++, label: v });
  $('customTest').value = '';
  renderCustom(); changed();
}

/* ==========================================================================
   Selection model
   ========================================================================== */
function collect() {
  const chosen = [...document.querySelectorAll('[data-test]:checked')].map((x) => x.dataset.test);
  const blocks = [];
  OUTPUT.forEach(([title, ids]) => {
    const sel = ids.filter((id) => chosen.includes(id));
    if (sel.length) blocks.push({ title, items: sel.map((id) => LABEL[id]) });
  });
  const imaging = [];
  if (chosen.includes('mri')) imaging.push('MRI, ' + ($('mriRegion').value.trim() || 'region to be specified'));
  if (chosen.includes('ct')) imaging.push('CT, ' + ($('ctRegion').value.trim() || 'region to be specified'));
  if (chosen.includes('dexa')) imaging.push('DEXA Scan');
  if (imaging.length) blocks.push({ title: 'Imaging & Body Composition', items: imaging });
  const cardiac = ['ecg', 'echo'].filter((id) => chosen.includes(id)).map((id) => LABEL[id]);
  if (cardiac.length) blocks.push({ title: 'Cardiac Assessment', items: cardiac });
  if (state.custom.length) blocks.push({ title: 'Additional Tests', items: state.custom.map((c) => c.label) });
  return {
    name: $('name').value.trim(), age: $('age').value.trim(), sex: $('sex').value,
    date: prettyDate(), chosen, blocks, total: chosen.length + state.custom.length
  };
}

/* ==========================================================================
   Page building + pagination
   ========================================================================== */
/* Tiny leaf bullet. Inline <svg> (not a CSS background) so html2canvas always draws it. */
const SVG_NS = 'http://www.w3.org/2000/svg';
function leaf() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 12 12'); svg.setAttribute('class', 'leaf'); svg.setAttribute('aria-hidden', 'true');
  const body = document.createElementNS(SVG_NS, 'path');
  body.setAttribute('d', 'M1.6 10.4C1.6 5.2 4.8 1.6 10.4 1.6C10.4 6.8 7.2 10.4 1.6 10.4Z');
  body.setAttribute('fill', '#3f7a71');
  const vein = document.createElementNS(SVG_NS, 'path');
  vein.setAttribute('d', 'M2.4 9.6L8.2 3.8');
  vein.setAttribute('stroke', '#ffffff'); vein.setAttribute('stroke-width', '0.9'); vein.setAttribute('stroke-linecap', 'round'); vein.setAttribute('fill', 'none');
  svg.append(body, vein);
  return svg;
}

function blockNode(b) {
  const d = el('div', 'pg-block');
  d.appendChild(el('h3', null, b.title));
  const ul = el('ul');
  b.items.forEach((t) => { const li = el('li'); li.append(leaf(), el('span', null, t)); ul.appendChild(li); });
  d.appendChild(ul);
  return d;
}

/* Append blocks one at a time and measure real height; whatever would
   overflow (and everything after it, to keep order) is handed back. A lone
   block taller than an empty page is kept so the loop always ends. */
function fillZone(container, blocks, budget) {
  const overflow = [];
  for (const b of blocks) {
    if (overflow.length) { overflow.push(b); continue; }
    container.appendChild(b.node);
    if (container.scrollHeight > budget + 2 && container.children.length > 1) {
      container.removeChild(b.node);
      overflow.push(b);
    }
  }
  return overflow;
}

function place(node, css) { node.style.cssText = 'position:absolute;' + css; return node; }

function brandRow(sel) {
  const row = el('div', 'pg-top');
  const brand = el('div', 'pg-brand');
  const img = el('img'); img.src = '../assets/img/emblem.webp'; img.alt = '';
  brand.append(img, el('span', null, 'Lifora'));
  row.append(brand, el('div', 'pg-meta', 'Test request, ' + sel.date));
  return row;
}

function shell(isFirst, sel, withNote) {
  const page = el('div', 'page');
  page.appendChild(place(brandRow(sel), `left:${MX}px;top:52px;width:${CONTENT_W}px;`));
  page.appendChild(place(el('div', 'pg-rule'), `left:${MX}px;top:112px;width:${CONTENT_W}px;`));

  if (isFirst) {
    const who = el('div');
    who.appendChild(el('div', 'pg-for', 'Tests requested for'));
    who.appendChild(el('div', 'pg-name', sel.name || 'Client name'));
    const facts = el('div', 'pg-facts');
    const fact = (k, v) => { const s = el('span', null, k); s.appendChild(el('b', null, v)); facts.appendChild(s); };
    if (sel.age) fact('Age', sel.age + ' yrs');
    if (sel.sex) fact('Sex', sel.sex);
    fact('Tests', String(sel.total));
    who.appendChild(facts);
    page.appendChild(place(who, `left:${MX}px;top:150px;width:${CONTENT_W}px;`));
  } else {
    page.appendChild(place(el('div', 'pg-cont-name', sel.name || 'Client name'), `left:${MX}px;top:128px;width:${CONTENT_W}px;`));
  }

  const top = isFirst ? HEAD_FIRST : HEAD_CONT;
  const budget = PAGE_H - (withNote ? FOOT_NOTE : FOOT_BAND) - top - 24;
  const content = place(el('div', 'pg-content'), `left:${MX}px;top:${top}px;width:${CONTENT_W}px;height:${budget}px;`);
  page.appendChild(content);

  if (withNote) {
    const note = el('div', 'pg-note');
    const c1 = el('div');
    c1.append(el('h4', null, 'Before your blood test'));
    const ul = el('ul');
    ['Fast for 8–12 hours; plain water is fine', 'Go in the morning if you can', 'Take your usual medicines only as your doctor advised'].forEach((t) => ul.appendChild(el('li', null, t)));
    c1.appendChild(ul);
    const c2 = el('div');
    c2.append(el('h4', null, 'Where to go'), el('p', null, 'Any reputed diagnostic laboratory near you. Show them this page, then send the reports to your Lifora care team.'));
    note.append(c1, c2);
    page.appendChild(place(note, `left:${MX}px;top:${PAGE_H - FOOT_NOTE + 20}px;width:${CONTENT_W}px;`));
  }
  const foot = el('div', 'pg-foot');
  foot.append(el('span', 'tag', 'A journey to a better life'), el('span', 'pg-num', ''));
  page.appendChild(place(foot, `left:${MX}px;top:${PAGE_H - 62}px;width:${CONTENT_W}px;`));
  return { page, content, budget };
}

/* Each page first tries the remainder with the smaller "with note" budget.
   If it all fits, that's the last page. Otherwise it's rebuilt without the
   note and filled, capped so the last page always keeps room for the note. */
function paginate(sel, root) {
  const blocks = sel.blocks;
  if (!blocks.length) {
    const s = shell(true, sel, true);
    root.appendChild(s.page);
    s.content.appendChild(el('div', 'pg-empty', 'Choose tests on the left and they’ll appear here.'));
    return [s.page];
  }
  blocks.forEach((b) => { b.node = blockNode(b); });
  const pages = [];
  let remaining = blocks, n = 0;
  while (remaining.length && n < 20) {
    n++;
    const isFirst = n === 1, before = remaining;
    const trial = shell(isFirst, sel, true);
    root.appendChild(trial.page);
    const left = fillZone(trial.content, before, trial.budget);
    if (!left.length) { pages.push(trial.page); break; }
    root.removeChild(trial.page);
    const s = shell(isFirst, sel, false);
    root.appendChild(s.page);
    const after = fillZone(s.content, before, s.budget);
    if (after.length) { pages.push(s.page); remaining = after; continue; }
    root.removeChild(s.page);
    const s2 = shell(isFirst, sel, false);
    root.appendChild(s2.page);
    fillZone(s2.content, before.slice(0, before.length - left.length), s2.budget);
    pages.push(s2.page);
    remaining = left;
  }
  return pages;
}

/* ==========================================================================
   Render + preview scaling
   ========================================================================== */
function render() {
  const sel = collect();
  updateBadges(sel.chosen);
  const root = $('pagesRoot');
  root.innerHTML = '';
  const pages = paginate(sel, root);
  pages.forEach((p, i) => { p.querySelector('.pg-num').textContent = pages.length > 1 ? `Page ${i + 1} of ${pages.length}` : ''; });
  const st = $('status');
  st.classList.remove('warn');
  st.textContent = sel.total
    ? `${sel.total} test${sel.total === 1 ? '' : 's'}, ${pages.length} page${pages.length === 1 ? '' : 's'} A4`
    : 'A4 PDF';
  fit();
}

function fit() {
  const stage = $('stage'), pages = $('pagesRoot'), scaler = $('scaler');
  const cs = getComputedStyle(stage);
  const avail = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const s = Math.min(1, avail / PAGE_W);
  pages.style.transform = `scale(${s})`;
  scaler.style.width = PAGE_W * s + 'px';
  scaler.style.height = pages.offsetHeight * s + 'px';
}

const schedule = frameScheduler(() => { render(); saveDraft(); });
function changed() { schedule(); }

/* ==========================================================================
   Draft persistence + shared client
   ========================================================================== */
function saveDraft() {
  store.set(DRAFT_KEY, {
    custom: state.custom, sex: $('sex').value,
    chosen: [...document.querySelectorAll('[data-test]:checked')].map((x) => x.dataset.test),
    mri: $('mriRegion').value, ct: $('ctRegion').value
  });
  writeSharedClient({ name: $('name').value.trim(), age: $('age').value.trim(), sex: $('sex').value });
}
function loadDraft() {
  const d = store.get(DRAFT_KEY), c = readSharedClient();
  if (c.name) $('name').value = c.name;
  if (c.age) $('age').value = c.age;
  if (c.sex) $('sex').value = c.sex;
  if (!d) return;
  state.custom = Array.isArray(d.custom) ? d.custom.filter((x) => x && x.label) : [];
  state.uid = state.custom.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
  (d.chosen || []).forEach((id) => { const cb = document.querySelector(`[data-test="${id}"]`); if (cb) cb.checked = true; });
  $('mriRegion').value = d.mri || '';
  $('ctRegion').value = d.ct || '';
}
function resetAll() {
  document.querySelectorAll('[data-test]').forEach((x) => { x.checked = false; });
  ['name', 'age', 'mriRegion', 'ctRegion', 'customTest'].forEach((id) => { $(id).value = ''; });
  $('sex').selectedIndex = 0;
  state.custom = [];
  renderCustom();
  store.remove(DRAFT_KEY); store.remove('lifora.profile.v2'); clearSharedClient();
  $('nameField').classList.remove('invalid');
  changed();
  $('name').focus();
  toast('Cleared. Ready for the next client.');
}

/* ==========================================================================
   PDF export (libraries served from this site, loaded on first use)
   ========================================================================== */
function validate() {
  if ($('name').value.trim()) return true;
  $('nameField').classList.add('invalid');
  $('name').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('name').focus({ preventScroll: true });
  return false;
}
const pdfName = () => `Lifora_Tests_${safePart($('name').value, 'Client')}_${today()}.pdf`;

async function buildPdf(onProgress) {
  await Promise.all([loadScript('../vendor/html2canvas.min.js'), loadScript('../vendor/jspdf.umd.min.js')]);
  await fontsReady();
  render();
  const pages = [...document.querySelectorAll('#pagesRoot .page')];
  await Promise.all(pages.flatMap((p) => [...p.querySelectorAll('img')]).map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  const pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  document.body.classList.add('exporting');
  try {
    for (let i = 0; i < pages.length; i++) {
      onProgress(`Making page ${i + 1} of ${pages.length}…`);
      const canvas = await window.html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', logging: false });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    }
  } finally {
    document.body.classList.remove('exporting');
    fit();
  }
  return pdf.output('blob');
}

function lockOther(btn, on) { [$('pdfBtn'), $('shareBtn')].forEach((b) => { if (b !== btn) b.disabled = on; }); }
// Progress shows on the button itself: "Preparing" → "Page 1 of 2" → "Downloaded".
const progressOn = (b) => (m) => { $('status').textContent = m; const pg = /page (\d+) of (\d+)/i.exec(m); if (pg && pg[2] !== '1') b.set(`Page ${pg[1]} of ${pg[2]}`, ICON.spin); };
function failed(e) {
  console.error(e);
  const st = $('status');
  st.classList.add('warn');
  st.textContent = 'The PDF couldn’t be made here. Opening the print dialog; choose “Save as PDF”.';
  setTimeout(() => window.print(), 400);
}
async function onPdf() {
  if (!validate()) return;
  const b = dynamicButton($('pdfBtn'));
  b.busy('Preparing'); lockOther($('pdfBtn'), true);
  try {
    const blob = await buildPdf(progressOn(b));
    const url = downloadBlob(blob, pdfName());
    $('status').textContent = 'Saved ' + pdfName();
    b.flash('Downloaded');
    toast('PDF downloaded.', { label: 'Open instead', run: () => window.open(url, '_blank') });
  } catch (e) { b.reset(); failed(e); }
  finally { lockOther($('pdfBtn'), false); }
}
async function onShare() {
  if (!validate()) return;
  const b = dynamicButton($('shareBtn'));
  b.busy('Preparing'); lockOther($('shareBtn'), true);
  try {
    const blob = await buildPdf(progressOn(b));
    const r = await shareBlob(blob, pdfName(), 'Lifora test request');
    if (r === 'shared') b.flash('Shared');
    else if (r === 'unsupported') { downloadBlob(blob, pdfName()); b.flash('Downloaded'); toast('Sharing isn’t available here, so the PDF was downloaded.'); }
    else b.reset();
    render();
  } catch (e) { b.reset(); failed(e); }
  finally { lockOther($('shareBtn'), false); }
}

/* ==========================================================================
   Jump list (wide screens): dot follows the section you're reading
   ========================================================================== */
function wireRail() {
  const ul = $('rail');
  if (!ul) return;
  const sections = [
    { label: 'Client', el: $('secClient') },
    ...PACKAGES.map((p, i) => ({ label: p.name, el: $('pkg-' + i), pkg: true })),
    { label: 'Custom', el: $('secCustom') }
  ];
  let jumping = 0;
  const rail = bounceSidebar(ul, {
    items: sections.map((s) => s.label),
    onChange: (i) => {
      const s = sections[i];
      if (s.pkg) s.el.open = true;
      // Let the dot rest on the clicked item until the page has finished scrolling there.
      clearTimeout(jumping);
      jumping = setTimeout(() => { jumping = 0; }, 400);
      s.el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }
  });
  let queued = false;
  const spy = () => {
    queued = false;
    if (jumping || !ul.offsetParent) return;
    // The section whose top has crossed ~40% of the screen is the one being read.
    const line = Math.max(140, window.innerHeight * 0.4);
    let current = 0;
    sections.forEach((s, i) => { if (!s.el.closest('.hidden-by-search') && s.el.getBoundingClientRect().top <= line) current = i; });
    // At the very bottom a short last section may never reach the line; pick it only if it's really on screen.
    const last = sections[sections.length - 1].el.getBoundingClientRect().top;
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4 && last < window.innerHeight * 0.85) current = sections.length - 1;
    rail.set(current);
  };
  window.addEventListener('scroll', () => {
    if (jumping) { clearTimeout(jumping); jumping = setTimeout(() => { jumping = 0; }, 150); return; }   // still travelling
    if (!queued) { queued = true; requestAnimationFrame(spy); }
  }, { passive: true });
}

/* ==========================================================================
   Init
   ========================================================================== */
async function init() {
  document.querySelectorAll('[data-icon]').forEach((n) => { n.outerHTML = ICON[n.dataset.icon]; });
  buildPackages();
  wireSearch();
  wireRail();
  loadDraft();
  renderCustom();
  const form = document.querySelector('.form-col');
  form.addEventListener('change', (e) => { if (e.target.matches('[data-test]') || e.target.id === 'sex') changed(); });
  form.addEventListener('input', (e) => {
    if (['name', 'age', 'mriRegion', 'ctRegion'].includes(e.target.id)) changed();
    if (e.target.id === 'name' && e.target.value.trim()) $('nameField').classList.remove('invalid');
  });
  $('addCustom').addEventListener('click', addCustom);
  $('customTest').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } });
  $('clearAll').addEventListener('click', () => {
    document.querySelectorAll('[data-test]').forEach((x) => { x.checked = false; });
    state.custom = []; renderCustom(); changed();
  });
  $('resetBtn').addEventListener('click', resetAll);
  $('pdfBtn').addEventListener('click', onPdf);
  if (canShareFiles('application/pdf')) { $('shareBtn').hidden = false; $('shareBtn').addEventListener('click', onShare); }
  new ResizeObserver(() => fit()).observe($('stage'));
  render();
  await fontsReady();
  render(); // re-measure with the real fonts
}
init();
