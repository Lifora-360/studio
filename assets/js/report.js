import { $, store, readSharedClient, writeSharedClient, clearSharedClient, fontsReady, frameScheduler,
  safePart, prettyDate, today, downloadBlob, shareBlob, canShareFiles, toast, loadScript, ICON, DOCTORS } from './common.js';

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

const ICONS = {
  glucose: '<path d="M50 12C39 28 28 40 28 55a22 22 0 0 0 44 0c0-15-11-27-22-43Z"/><path d="M37 57c4 8 10 12 19 13"/>',
  lipid: '<path d="M50 15c-8 14-25 27-25 45a25 25 0 0 0 50 0C75 42 58 29 50 15Z"/><path d="M39 61c6-5 15-6 22-1"/>',
  cbc: '<circle cx="35" cy="35" r="11"/><circle cx="63" cy="34" r="10"/><circle cx="27" cy="62" r="10"/><circle cx="53" cy="62" r="12"/><circle cx="74" cy="61" r="9"/>',
  renal: '<path d="M39 20c-13 0-20 12-18 27 2 15 10 25 21 22 8-2 10-11 7-18-3-7-1-17-10-19"/><path d="M61 20c13 0 20 12 18 27-2 15-10 25-21 22-8-2-10-11-7-18 3-7 1-17 10-19"/><path d="M50 18v65"/>',
  liver: '<path d="M18 57c9-28 27-38 63-33 5 1 7 6 3 10-9 9-15 26-29 36-13 9-31 4-37-13Z"/><path d="M50 40c8 4 17 5 27 3"/>',
  pancreas: '<path d="M18 55c12-17 28-23 45-17 10 4 17 13 19 22-12 6-26 7-40 4-9-2-17-5-24-9Z"/><circle cx="29" cy="53" r="3"/><circle cx="43" cy="49" r="3"/><circle cx="57" cy="51" r="3"/>',
  bone: '<path d="M31 27a9 9 0 1 1-12 12l22 22a9 9 0 1 1-12 12 9 9 0 0 1 12-12l22-22a9 9 0 1 1 12-12 9 9 0 1 1-12 12L41 61"/>',
  thyroid: '<path d="M50 35c-7-9-18-9-22 2-4 12 3 28 15 28 5 0 7-5 7-11"/><path d="M50 35c7-9 18-9 22 2 4 12-3 28-15 28-5 0-7-5-7-11"/><path d="M50 18v64"/>',
  vitamin: '<circle cx="50" cy="50" r="27"/><path d="M50 31v38M31 50h38"/>',
  heart: '<path d="M50 78S20 60 20 39c0-11 15-18 25-5 10-13 25-6 25 5 0 21-30 39-30 39Z"/><path d="M29 49h12l5-12 7 23 5-11h13"/>',
  immune: '<circle cx="50" cy="50" r="25"/><path d="M50 25v50M25 50h50M32 32l36 36M68 32L32 68"/>',
  hormone: '<path d="M28 24h44l-8 24v22a14 14 0 0 1-28 0V48l-8-24Z"/><path d="M38 48h24M41 60h18"/>',
  male: '<circle cx="43" cy="57" r="20"/><path d="M58 42l22-22M61 20h19v19"/>',
  urine: '<path d="M50 14c-8 15-20 27-20 43a20 20 0 0 0 40 0c0-16-12-28-20-43Z"/><path d="M40 61c4 5 9 7 16 7"/>',
  glp: '<circle cx="50" cy="50" r="28"/><path d="M35 55c8-13 22-18 31-8M35 65c10-3 20-1 29 5"/><circle cx="38" cy="42" r="3"/><circle cx="62" cy="38" r="3"/>',
  imaging: '<rect x="19" y="20" width="62" height="60" rx="5"/><circle cx="50" cy="50" r="19"/><circle cx="50" cy="50" r="6"/>',
  custom: '<path d="M30 20h40v60H30z"/><path d="M40 35h20M40 47h20M40 59h12"/>'
};
const SVG_NS = 'http://www.w3.org/2000/svg';
/* Inline <svg> (not data-URI <img>) so html2canvas never drops an icon. */
function icon(name, color, cls) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  if (cls) svg.setAttribute('class', cls);
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('fill', 'none'); g.setAttribute('stroke', color);
  g.setAttribute('stroke-width', '3.2'); g.setAttribute('stroke-linecap', 'round'); g.setAttribute('stroke-linejoin', 'round');
  g.innerHTML = ICONS[name] || ICONS.glucose; // static catalogue markup, never user input
  svg.appendChild(g);
  return svg;
}
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/* ==========================================================================
   Page geometry — single source of truth
   ========================================================================== */
const PAGE_W = 1024, PAGE_H = 1536, MX = 72, CONTENT_W = PAGE_W - MX * 2;
const FOOT_FULL = 210, FOOT_BAND = 60, GAP_TOP = 24, GAP_BOTTOM = 16;
const GEOM = {
  'signature-cont': { first: 170, cont: 170, layout: 'grid2', iconColor: '#174b3c' },
  minimal: { first: 410, cont: 170, layout: 'singlecol', iconColor: '#173c31' },
  navy: { first: 360, cont: 170, layout: 'grid2', iconColor: '#0f2a29' },
  ivory: { first: 440, cont: 170, layout: 'menu', iconColor: '#173c31' }
};
const DESIGNS = [
  { id: 'signature', name: 'Signature botanical', colors: ['#173c31', '#efe4c9'] },
  { id: 'minimal', name: 'Modern minimal', colors: ['#fbfaf5', '#173c31'] },
  { id: 'navy', name: 'Clinical navy', colors: ['#0f2a29', '#c9a24b'] },
  { id: 'ivory', name: 'Ivory & gold', colors: ['#faf6ea', '#c9a24b'] }
];

const DRAFT_KEY = 'lifora.report.draft';
const state = { design: 'signature', custom: [], uid: 1 };

/* ==========================================================================
   Sidebar
   ========================================================================== */
const caret = '<svg class="pkg-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

function buildPackages() {
  const root = $('packages');
  PACKAGES.forEach((pkg, pi) => {
    const det = el('details', 'pkg');
    if (pi === 0) det.open = true;
    const sum = el('summary');
    const name = el('span', 'pkg-name', pkg.name);
    name.appendChild(el('span', 'pkg-desc', pkg.desc));
    const badge = el('span', 'pkg-badge'); badge.dataset.pkgBadge = pi;
    sum.append(name, badge);
    sum.insertAdjacentHTML('beforeend', caret);
    det.appendChild(sum);

    const body = el('div', 'pkg-body');
    pkg.groups.forEach(([title, ic, tests]) => {
      const box = el('div', 'tg');
      const head = el('div', 'tg-head');
      const t = el('div', 'tg-title');
      t.append(icon(ic, '#174b3c'), document.createTextNode(title));
      const all = el('button', 'tg-all', tests.length > 1 ? 'Select all' : 'Select');
      all.type = 'button';
      all.addEventListener('click', () => {
        const boxes = tests.map(([id]) => document.querySelector(`[data-test="${id}"]`));
        const on = !boxes.every((b) => b.checked);
        boxes.forEach((b) => { b.checked = on; });
        changed();
      });
      head.append(t, all);
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
  $('selCount').textContent = total ? `${total} selected` : 'None selected';
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
    count.textContent = q ? (shown ? `${shown} of ${total} tests` : 'No test matches. Add it below as a custom investigation.') : '';
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

function buildChips() {
  const wrap = $('themeChips');
  wrap.innerHTML = '';
  DESIGNS.forEach((d) => {
    const b = el('button', 'chip'); b.type = 'button';
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(d.id === state.design));
    const sw = el('span', 'sw'); sw.style.background = `linear-gradient(135deg, ${d.colors[0]} 0 50%, ${d.colors[1]} 50% 100%)`;
    b.append(sw, document.createTextNode(d.name));
    b.addEventListener('click', () => { if (state.design !== d.id) { state.design = d.id; buildChips(); changed(); } });
    wrap.appendChild(b);
  });
}

/* ==========================================================================
   Selection model
   ========================================================================== */
function collect() {
  const name = $('name').value.trim(), age = $('age').value.trim(), doctor = $('doctor').value.trim();
  const chosen = [...document.querySelectorAll('[data-test]:checked')].map((x) => x.dataset.test);
  const blocks = [];
  OUTPUT.forEach(([title, ids, ic]) => {
    const sel = ids.filter((id) => chosen.includes(id));
    if (sel.length) blocks.push({ title, icon: ic, items: sel.map((id) => LABEL[id]) });
  });
  const imaging = [];
  if (chosen.includes('mri')) imaging.push('MRI, ' + ($('mriRegion').value.trim() || 'region to be specified'));
  if (chosen.includes('ct')) imaging.push('CT, ' + ($('ctRegion').value.trim() || 'region to be specified'));
  if (chosen.includes('dexa')) imaging.push('DEXA Scan');
  if (imaging.length) blocks.push({ title: 'Imaging & Body Composition', icon: 'imaging', items: imaging });
  if (state.custom.length) blocks.push({ title: 'Additional Investigations', icon: 'custom', items: state.custom.map((c) => c.label) });
  const cardiac = [];
  if (chosen.includes('ecg')) cardiac.push({ title: LABEL.ecg, icon: 'heart', items: ['Cardiac electrical activity'] });
  if (chosen.includes('echo')) cardiac.push({ title: LABEL.echo, icon: 'imaging', items: ['Cardiac structure and pumping function'] });
  return { name, age, doctor, date: prettyDate(), chosen, blocks, cardiac, total: chosen.length + state.custom.length };
}

/* ==========================================================================
   Page building + pagination
   ========================================================================== */
function profileNode(block, design) {
  if (design === 'signature') {
    const d = el('div', 'profile');
    d.appendChild(icon(block.icon, '#173c31', 'profile-icon'));
    const c = el('div');
    c.append(el('div', 'profile-title', block.title), el('div', 'profile-items', block.items.join('  •  ')));
    d.appendChild(c);
    return d;
  }
  const d = el('div', 'pg-profile');
  d.append(icon(block.icon, GEOM[design].iconColor), el('div', 'pg-profile-title', block.title), el('div', 'pg-profile-items', block.items.join('  •  ')));
  return d;
}

/* Append blocks one at a time and measure real height; anything that would
   overflow (and everything after it, to keep order) is handed back. A lone
   block taller than an empty page is kept so the loop always terminates. */
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

function fieldsRow(sel, withDate) {
  const wrap = el('div', 'pg-fields');
  const add = (k, v) => { const f = el('div', 'f', k); f.appendChild(el('b', null, v)); wrap.appendChild(f); };
  add('Name', sel.name || '—');
  add('Age', sel.age ? sel.age + ' yrs' : '—');
  if (withDate) add('Date', sel.date);
  if (sel.doctor) add('Recommended by', /^dr\b/i.test(sel.doctor) ? sel.doctor : 'Dr ' + sel.doctor);
  return wrap;
}

function header(design, isFirst, sel, pageIndex) {
  const g = GEOM[design];
  const h = el('div', 'pg-header');
  h.style.cssText = `position:absolute;left:0;top:0;width:100%;height:${isFirst ? g.first : g.cont}px;padding:36px ${MX}px;display:flex;flex-direction:column;justify-content:${design === 'navy' ? 'center' : 'flex-start'};`;
  const word = el('div', 'pg-wordmark', 'lifora');
  word.style.fontSize = (isFirst ? 50 : 30) + 'px';
  h.appendChild(word);
  const eb = el('div', 'pg-eyebrow', isFirst ? 'METABOLIC WELLNESS' : `ADDITIONAL INVESTIGATIONS, PAGE ${pageIndex}`);
  eb.style.marginTop = '6px';
  h.appendChild(eb);
  if (isFirst) {
    const title = el('div', 'pg-title', 'Your personalised investigation panel');
    title.style.marginTop = '24px';
    const sub = el('div', 'pg-sub', 'Prepared for you from the assessments chosen at your consultation. Take this to any reputed diagnostic laboratory.');
    sub.style.cssText = 'margin-top:10px;max-width:600px';
    const f = fieldsRow(sel, true); f.style.marginTop = '20px';
    const pill = el('div', 'pg-pill', 'SELECTED INVESTIGATIONS'); pill.style.marginTop = '18px';
    h.append(title, sub, f, pill);
  } else {
    const f = fieldsRow(sel, false); f.style.marginTop = '12px';
    h.appendChild(f);
  }
  return h;
}

function footer(pageIndex, withNote) {
  const fh = withNote ? FOOT_FULL : FOOT_BAND;
  const wrap = el('div');
  wrap.style.cssText = `position:absolute;left:0;top:${PAGE_H - fh}px;width:100%;height:${fh}px;`;
  if (withNote) {
    const note = el('div', 'pg-note');
    note.style.cssText = `position:absolute;left:${MX}px;top:18px;width:${CONTENT_W}px;`;
    const c1 = el('div', 'fcol');
    c1.append(el('h4', null, 'Where to get these done'), el('p', null, 'At any standard, reputed diagnostic laboratory near you. Bring this sheet and share the reports with your Lifora care team.'));
    const c2 = el('div', 'fcol');
    const ul = el('ul');
    ['Fast for 8–12 hours before blood tests', 'Morning sample collection is best', 'Plain water is fine', 'Take your usual medicines only as your doctor advised'].forEach((t) => ul.appendChild(el('li', null, t)));
    c2.append(el('h4', null, 'Before your blood test'), ul);
    note.append(c1, c2);
    wrap.appendChild(note);
  }
  const band = el('div', 'pg-band');
  band.style.cssText = `position:absolute;left:0;bottom:0;width:100%;height:46px;padding:0 ${MX}px;`;
  const num = el('div', 'pg-page-num', 'Page ' + pageIndex);
  band.append(el('div', 'tag', 'Know today. Improve tomorrow.'), num);
  wrap.appendChild(band);
  return wrap;
}

function shell(design, isFirst, sel, pageIndex, withNote) {
  const page = el('div', 'page tpl-' + design);
  if (design === 'ivory') page.appendChild(el('div', 'pg-frame'));
  page.appendChild(header(design, isFirst, sel, pageIndex));
  const g = GEOM[design];
  const top = (isFirst ? g.first : g.cont) + GAP_TOP;
  const budget = PAGE_H - (withNote ? FOOT_FULL : FOOT_BAND) - top - GAP_BOTTOM;
  const content = el('div', 'pg-content layout-' + g.layout);
  content.style.cssText = `position:absolute;left:${MX}px;top:${top}px;width:${CONTENT_W}px;height:${budget}px;`;
  page.append(content, footer(pageIndex, withNote));
  return { page, content, budget };
}

/* Each page first tries the remainder with the smaller "with note" budget.
   If it all fits, that's the last page (and gets the note). Otherwise the
   page is rebuilt without the note and filled, capped so the final page
   always keeps room for the preparation note. */
function paginate(design, sel, blocks, root, startIndex, firstHeader) {
  if (!blocks.length) {
    const s = shell(design, firstHeader, sel, startIndex, true);
    root.appendChild(s.page);
    const e = el('div', null, 'Choose tests on the left and they’ll appear here.');
    e.style.cssText = 'grid-column:1/-1;font-size:14px;color:#8a938c;text-align:center;padding-top:60px;';
    s.content.appendChild(e);
    return [s.page];
  }
  blocks.forEach((b) => { b.node = profileNode(b, design); });
  const pages = [];
  let remaining = blocks, n = 0;
  while (remaining.length && n < 20) {
    n++;
    const isFirst = firstHeader && n === 1, idx = startIndex + n - 1, before = remaining;
    const trial = shell(design, isFirst, sel, idx, true);
    root.appendChild(trial.page);
    const left = fillZone(trial.content, before, trial.budget);
    if (!left.length) { pages.push(trial.page); remaining = []; break; }
    root.removeChild(trial.page);
    const s = shell(design, isFirst, sel, idx, false);
    root.appendChild(s.page);
    const after = fillZone(s.content, before, s.budget);
    if (after.length) { pages.push(s.page); remaining = after; continue; }
    root.removeChild(s.page);
    const s2 = shell(design, isFirst, sel, idx, false);
    root.appendChild(s2.page);
    fillZone(s2.content, before.slice(0, before.length - left.length), s2.budget);
    pages.push(s2.page);
    remaining = left;
  }
  return pages;
}

function signatureFlow(sel, root) {
  const p = el('div', 'page tpl-signature');
  const nm = el('div', 'overlay client-name', sel.name || '—');
  const ag = el('div', 'overlay client-age', sel.age ? sel.age + ' years' : '—');
  const tests = el('div', 'overlay dynamic-tests');
  const cardio = el('div', 'overlay cardio');
  const meta = el('div', 'overlay sig-meta', [sel.date, sel.doctor && ('Recommended by ' + (/^dr\b/i.test(sel.doctor) ? sel.doctor : 'Dr ' + sel.doctor))].filter(Boolean).join('    '));
  p.append(nm, ag, tests, cardio, meta);
  root.appendChild(p);
  sel.blocks.forEach((b) => { b.node = profileNode(b, 'signature'); });
  const overflow = fillZone(tests, sel.blocks, 535);
  if (!tests.children.length) tests.appendChild(el('div', 'empty', 'Choose tests on the left and they’ll appear here.'));
  sel.cardiac.forEach((b) => cardio.appendChild(profileNode(b, 'signature')));
  cardio.style.display = sel.cardiac.length ? 'grid' : 'none';
  const pages = [p];
  if (overflow.length) {
    overflow.forEach((b) => { delete b.node; });
    paginate('signature-cont', sel, overflow, root, 2, false).forEach((x) => pages.push(x));
  }
  return pages;
}

/* ==========================================================================
   Render + preview scaling
   ========================================================================== */
let pageCount = 1;
function render() {
  const sel = collect();
  updateBadges(sel.chosen);
  const root = $('pagesRoot');
  root.innerHTML = '';
  const pages = state.design === 'signature'
    ? signatureFlow(sel, root)
    : paginate(state.design, sel, sel.blocks.concat(sel.cardiac), root, 1, true);
  pageCount = pages.length;
  pages.forEach((p, i) => {
    const pn = p.querySelector('.pg-page-num');
    if (pn) pn.textContent = pageCount > 1 ? `Page ${i + 1} of ${pageCount}` : 'Page 1';
  });
  $('pageMeta').textContent = pageCount === 1 ? '1 page, A4' : `${pageCount} pages, A4`;
  const st = $('status');
  st.classList.toggle('warn', pageCount > 2);
  st.textContent = sel.total ? `${sel.total} test${sel.total === 1 ? '' : 's'} in ${sel.blocks.length + sel.cardiac.length} profile${sel.blocks.length + sel.cardiac.length === 1 ? '' : 's'}` : '';
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
    design: state.design, custom: state.custom, doctor: $('doctor').value,
    chosen: [...document.querySelectorAll('[data-test]:checked')].map((x) => x.dataset.test),
    mri: $('mriRegion').value, ct: $('ctRegion').value
  });
  writeSharedClient({ name: $('name').value.trim(), age: $('age').value.trim() });
}
function loadDraft() {
  const d = store.get(DRAFT_KEY);
  const c = readSharedClient();
  if (c.name) $('name').value = c.name;
  if (c.age) $('age').value = c.age;
  if (!d) return;
  if (DESIGNS.some((x) => x.id === d.design)) state.design = d.design;
  state.custom = Array.isArray(d.custom) ? d.custom.filter((x) => x && x.label) : [];
  state.uid = state.custom.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
  $('doctor').value = d.doctor || '';
  (d.chosen || []).forEach((id) => { const cb = document.querySelector(`[data-test="${id}"]`); if (cb) cb.checked = true; });
  $('mriRegion').value = d.mri || '';
  $('ctRegion').value = d.ct || '';
}
function resetAll() {
  document.querySelectorAll('[data-test]').forEach((x) => { x.checked = false; });
  ['name', 'age', 'doctor', 'mriRegion', 'ctRegion', 'customTest'].forEach((id) => { $(id).value = ''; });
  state.custom = [];
  renderCustom();
  store.remove(DRAFT_KEY); store.remove('lifora.profile.draft'); clearSharedClient();
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
function pdfName() { return `Lifora_Investigations_${safePart($('name').value, 'Client')}_${today()}.pdf`; }

async function buildPdf(onProgress) {
  await Promise.all([loadScript('../vendor/html2canvas.min.js'), loadScript('../vendor/jspdf.umd.min.js')]);
  await fontsReady();
  render();
  const pages = [...document.querySelectorAll('#pagesRoot .page')];
  const pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const A4W = 210, A4H = 297, drawH = A4H, drawW = drawH * (PAGE_W / PAGE_H), offX = (A4W - drawW) / 2;
  document.body.classList.add('exporting');
  try {
    for (let i = 0; i < pages.length; i++) {
      onProgress(`Rendering page ${i + 1} of ${pages.length}…`);
      const canvas = await window.html2canvas(pages[i], {
        scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
        onclone: (doc) => { const p = doc.getElementById('pagesRoot'); if (p) p.style.transform = 'none'; }
      });
      if (i > 0) pdf.addPage();
      pdf.setFillColor(255, 255, 255); pdf.rect(0, 0, A4W, A4H, 'F');
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', offX, 0, drawW, drawH, undefined, 'FAST');
    }
  } finally {
    document.body.classList.remove('exporting');
    fit();
  }
  return pdf.output('blob');
}

async function withBusy(btn, fn) {
  const btns = [$('pdfBtn'), $('shareBtn')];
  btn.classList.add('busy'); btns.forEach((b) => { b.disabled = true; });
  try { await fn(); } finally { btn.classList.remove('busy'); btns.forEach((b) => { b.disabled = false; }); }
}

async function onPdf() {
  if (!validate()) return;
  await withBusy($('pdfBtn'), async () => {
    const st = $('status');
    try {
      const blob = await buildPdf((m) => { st.textContent = m; });
      const url = downloadBlob(blob, pdfName());
      st.textContent = `Downloaded ${pdfName()}`;
      toast('PDF downloaded.', { label: 'Open instead', run: () => window.open(url, '_blank') });
    } catch (e) {
      console.error(e);
      st.classList.add('warn');
      st.textContent = 'The PDF couldn’t be made here. Use Print and choose “Save as PDF”.';
    }
  });
}

async function onShare() {
  if (!validate()) return;
  await withBusy($('shareBtn'), async () => {
    const st = $('status');
    try {
      const blob = await buildPdf((m) => { st.textContent = m; });
      const r = await shareBlob(blob, pdfName(), 'Lifora investigation report');
      if (r === 'unsupported') { downloadBlob(blob, pdfName()); toast('Sharing isn’t available here, so the PDF was downloaded.'); }
      st.textContent = '';
      render();
    } catch (e) {
      console.error(e);
      st.textContent = 'The PDF couldn’t be made here. Use Print and choose “Save as PDF”.';
    }
  });
}

/* ==========================================================================
   Init
   ========================================================================== */
async function init() {
  document.querySelectorAll('[data-icon]').forEach((n) => { n.outerHTML = ICON[n.dataset.icon]; });
  $('doctorList').innerHTML = DOCTORS.map((d) => `<option>${d}</option>`).join('');
  buildPackages();
  wireSearch();
  loadDraft();
  renderCustom();
  buildChips();

  const form = document.querySelector('.form-body');
  form.addEventListener('change', (e) => { if (e.target.matches('[data-test]')) changed(); });
  form.addEventListener('input', (e) => {
    if (['name', 'age', 'doctor', 'mriRegion', 'ctRegion'].includes(e.target.id)) changed();
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
  $('printBtn').addEventListener('click', () => window.print());
  if (canShareFiles('application/pdf')) { $('shareBtn').hidden = false; $('shareBtn').addEventListener('click', onShare); }
  new ResizeObserver(() => fit()).observe($('stage'));

  render();
  await fontsReady();
  render(); // re-measure pagination with the real fonts
}
init();
