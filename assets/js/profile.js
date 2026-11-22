import { $, store, readSharedClient, writeSharedClient, clearSharedClient, fontsReady, frameScheduler,
  safePart, today, downloadBlob, shareBlob, canShareFiles, toast, ICON, DOCTORS } from './common.js';

/* ==========================================================================
   Themes — same five program styles as v3, retuned for the new type.
   ========================================================================== */
const THEMES = [
  { id: 'emerald', label: 'Signature emerald', tag: 'Core metabolic wellness',
    bgStart: '#fbfaf4', bgEnd: '#e9eee0', ink: '#16362f', ink2: '#4c6259', ink3: '#87978d',
    metal: '#b0863f', metalSoft: '#e3d3ae', card: '#fffdf8', cardLine: 'rgba(22,54,47,.13)',
    pillBg: '#f2e7cf', pillLine: '#cba55e', pillInk: '#5c4720',
    accents: ['#6f8a6a', '#b0863f', '#b5674a', '#4f7c86', '#7c9177', '#8a7355'], dark: false },
  { id: 'midnight', label: 'Midnight reserve', tag: 'Executive metabolic program',
    bgStart: '#22352e', bgEnd: '#0f1916', ink: '#f3efe1', ink2: '#bdc7bd', ink3: '#8b998f',
    metal: '#d4af6a', metalSoft: '#6f5f38', card: '#20332d', cardLine: 'rgba(212,175,106,.28)',
    pillBg: '#3a3222', pillLine: '#d4af6a', pillInk: '#eeddb4',
    accents: ['#8fae83', '#d4af6a', '#c98268', '#7fa6ad', '#9db98f', '#c2a679'], dark: true },
  { id: 'ivory', label: 'Ivory & gold', tag: 'Longevity program',
    bgStart: '#fdf9ef', bgEnd: '#f0e3c4', ink: '#4a3720', ink2: '#7a6748', ink3: '#a8977a',
    metal: '#a67c2e', metalSoft: '#e2cd9b', card: '#fffefa', cardLine: 'rgba(74,55,32,.14)',
    pillBg: '#f3e6c4', pillLine: '#c79a44', pillInk: '#5c451e',
    accents: ['#8f7a45', '#c79a44', '#b06b4a', '#7d8f6a', '#a68a52', '#8f7a5c'], dark: false },
  { id: 'terracotta', label: 'Terracotta root', tag: 'Metabolic reset program',
    bgStart: '#fbf3ea', bgEnd: '#ead4bf', ink: '#4a2c1f', ink2: '#7a5744', ink3: '#a98a77',
    metal: '#a15c3e', metalSoft: '#e0bca4', card: '#fffaf6', cardLine: 'rgba(74,44,31,.15)',
    pillBg: '#f1ded1', pillLine: '#b97148', pillInk: '#5c3120',
    accents: ['#7c8f5e', '#c08a3e', '#a15c3e', '#6f8a86', '#8f6a4a', '#9c7a5c'], dark: false },
  { id: 'slate', label: 'Slate quietude', tag: 'Women’s metabolic program',
    bgStart: '#f5f8f9', bgEnd: '#dde5e8', ink: '#1f3347', ink2: '#54697a', ink3: '#91a1ac',
    metal: '#7d8ca0', metalSoft: '#c6cfd7', card: '#fbfcfc', cardLine: 'rgba(31,51,71,.14)',
    pillBg: '#e4eaee', pillLine: '#8a97a8', pillInk: '#33465a',
    accents: ['#5c7f95', '#8a97a8', '#7a6a8a', '#4f7c86', '#6a8f8a', '#8a7a9a'], dark: false }
];
const THEME_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t]));

/* Card icons — 24-unit stroke paths, drawn with Path2D so they stay crisp at 1600 px. */
const ICONS = {
  objectives: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z M12 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9Z M12 11.3a.7.7 0 1 0 0 1.4a.7.7 0 1 0 0-1.4Z',
  ask: 'M4.5 5h15v10.5H10l-5.5 4Z M8.5 9.5h7 M8.5 12.2h4.5',
  allergies: 'M12 3.8 21 19.5H3Z M12 9.8v4.6 M12 16.9v.2',
  conditions: 'M9.2 3.8h5.6v5.4h5.4v5.6h-5.4v5.4H9.2v-5.4H3.8V9.2h5.4Z',
  intolerances: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z M5.7 5.7l12.6 12.6',
  notAddressed: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z M7.8 12h8.4'
};

/* ---------- field rules ---------- */
const RULES = {
  name: { lines: 1, chars: 28 }, objectives: { lines: 6, chars: 180 }, conditions: { lines: 6, chars: 180 },
  ask: { lines: 2, chars: 90 }, allergies: { lines: 2, chars: 55 }, intolerances: { lines: 2, chars: 55 },
  notAddressed: { lines: 2, chars: 70 }, clientId: { lines: 1, chars: 20 }, program: { lines: 1, chars: 30 },
  week: { lines: 1, chars: 14 }, doctor: { lines: 1, chars: 30 }
};
const FIELDS = ['name', 'sex', 'age', 'height', 'weight', 'diet', 'objectives', 'conditions', 'ask',
  'allergies', 'intolerances', 'notAddressed', 'program', 'clientId', 'week', 'doctor'];
const DRAFT_KEY = 'lifora.profile.draft';

const state = { theme: 'emerald' };

/* ==========================================================================
   Form wiring
   ========================================================================== */
function val(id) { return String($(id).value || '').replace(/\r/g, '').trim(); }

function enforce(id) {
  const el = $(id), r = RULES[id];
  if (!el || !r) return;
  let v = String(el.value || '').replace(/\r/g, '').slice(0, r.chars);
  const lines = v.split('\n');
  if (lines.length > r.lines) v = lines.slice(0, r.lines).join('\n');
  // Unbroken strings longer than a card line can't wrap; cap each line.
  v = v.split('\n').map((l) => l.slice(0, id === 'name' ? 28 : 46)).join('\n');
  if (v !== el.value) el.value = v;
}

function updateCount(id) {
  const out = document.querySelector(`[data-count="${id}"]`);
  if (!out) return;
  const n = $(id).value.length, max = RULES[id].chars;
  out.textContent = n ? `${n}/${max}` : '';
  out.classList.toggle('near', n >= max * 0.85);
}

function bmi() {
  const h = parseFloat($('height').value), w = parseFloat($('weight').value);
  if (!(h > 50 && h < 260 && w > 15 && w < 350)) return null;
  const v = w / Math.pow(h / 100, 2);
  // WHO Asian cut-offs, which is what an Indian metabolic clinic works with.
  const band = v < 18.5 ? 'Underweight' : v < 23 ? 'Normal' : v < 25 ? 'Overweight' : v < 30 ? 'Obese I' : 'Obese II';
  return { value: v.toFixed(1), band };
}

function updateBmi() {
  const b = bmi(), out = $('bmiOut');
  out.innerHTML = '';
  if (!b) { out.textContent = 'Add height and weight'; return; }
  const strong = document.createElement('b'); strong.textContent = b.value;
  out.append(strong, document.createTextNode(' ' + b.band + ' (Asian cut-offs)'));
}

function saveDraft() {
  const data = { theme: state.theme };
  FIELDS.forEach((id) => { data[id] = $(id).value; });
  store.set(DRAFT_KEY, data);
  writeSharedClient({ name: val('name'), age: val('age'), sex: $('sex').value });
}

function loadDraft() {
  const d = store.get(DRAFT_KEY);
  const shared = readSharedClient();
  if (d) {
    FIELDS.forEach((id) => { if (d[id] != null) $(id).value = d[id]; });
    if (d.theme && THEME_BY_ID[d.theme]) state.theme = d.theme;
  }
  // Name/age typed in the report tool flow in here if this tool has none.
  if (!val('name') && shared.name) $('name').value = shared.name;
  if (!val('age') && shared.age) $('age').value = shared.age;
  if (!$('sex').value && shared.sex) $('sex').value = shared.sex;
}

function resetForm() {
  FIELDS.forEach((id) => {
    const el = $(id);
    if (el.tagName === 'SELECT') el.selectedIndex = 0; else el.value = '';
  });
  store.remove(DRAFT_KEY);
  clearSharedClient();
  Object.keys(RULES).forEach(updateCount);
  updateBmi();
  schedule();
  $('name').focus();
  toast('Cleared. Ready for the next client.');
}

/* ==========================================================================
   Canvas drawing
   ========================================================================== */
const W = 1600, CX = 800, CY = 800, R = 787;
const SERIF = 'Cormorant, Georgia, serif';
const SANS = 'Figtree, Arial, sans-serif';

function font(ctx, weight, size, family = SANS, style = '') {
  ctx.font = `${style} ${weight} ${size}px ${family}`.trim();
}
function setText(ctx, color, align = 'left', spacing = '0px') {
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = spacing;
}
function fitSize(ctx, text, maxW, start, min, weight, family = SANS) {
  for (let s = start; s > min; s--) {
    font(ctx, weight, s, family);
    if (ctx.measureText(text).width <= maxW) return s;
  }
  return min;
}
function ellipsize(ctx, text, maxW) {
  let out = String(text);
  if (ctx.measureText(out).width <= maxW) return out;
  while (out.length > 1 && ctx.measureText(out + '…').width > maxW) out = out.slice(0, -1);
  return out.trimEnd() + '…';
}
function wrapLines(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  let lines = [], line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines - 1).concat(lines.slice(maxLines - 1).join(' '));
  }
  return lines.map((l) => ellipsize(ctx, l, maxW));
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}
function drawIcon(ctx, name, cx, cy, size, color) {
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(ICONS[name]));
  ctx.restore();
}
function splitItems(v) { return String(v || '').split('\n').map((s) => s.trim()).filter(Boolean); }

function card(ctx, t, x, y, w, h, accent, icon, title) {
  roundRect(ctx, x, y, w, h, 26); ctx.fillStyle = t.card; ctx.fill();
  roundRect(ctx, x + .75, y + .75, w - 1.5, h - 1.5, 26); ctx.strokeStyle = t.cardLine; ctx.lineWidth = 1.5; ctx.stroke();
  roundRect(ctx, x, y, 8, h, [26, 0, 0, 26]); ctx.fillStyle = accent; ctx.fill();
  // icon disc
  ctx.beginPath(); ctx.arc(x + 66, y + 52, 29, 0, Math.PI * 2); ctx.fillStyle = withAlpha(accent, t.dark ? .22 : .13); ctx.fill();
  drawIcon(ctx, icon, x + 66, y + 52, 32, accent);
  font(ctx, 700, 23); setText(ctx, t.ink, 'left', '1.5px');
  ctx.fillText(title, x + 110, y + 60);
  setText(ctx, t.ink);
}

function drawList(ctx, t, items, x, y, maxW, maxY, accent) {
  let yy = y, drawn = 0;
  for (const item of items.slice(0, 6)) {
    const size = fitSize(ctx, item, maxW, 22, 18, 500);
    font(ctx, 500, size);
    const lines = wrapLines(ctx, item, maxW, 2);
    const lh = size + 6;
    const h = lines.length * lh;
    const reserve = drawn < items.length - 1 ? 24 : 0; // keep room for "+ N more"
    if (yy + h - lh > maxY - reserve) break;
    ctx.beginPath(); ctx.arc(x - 22, yy - size * .34, 5, 0, Math.PI * 2); ctx.fillStyle = accent; ctx.fill();
    setText(ctx, t.ink);
    lines.forEach((l, i) => ctx.fillText(l, x, yy + i * lh));
    yy += h + 7;
    drawn++;
  }
  const left = items.length - drawn;
  if (left > 0) {
    font(ctx, 600, 18); setText(ctx, t.ink3);
    ctx.fillText(`+ ${left} more`, x, Math.min(yy + 2, maxY + 18));
  }
}

function cardText(ctx, t, value, x, y, maxW) {
  const lines = splitItems(value);
  if (!lines.length) lines.push('Nil');
  let out = [];
  for (const l of lines) {
    font(ctx, 500, fitSize(ctx, l, maxW, 24, 18, 500));
    out = out.concat(wrapLines(ctx, l, maxW, 2 - out.length).map((s) => ({ s, f: ctx.font })));
    if (out.length >= 2) break;
  }
  setText(ctx, t.ink);
  out.slice(0, 2).forEach((o, i) => { ctx.font = o.f; ctx.fillText(o.s, x, y + i * 30); });
}

function draw(ctx = $('preview').getContext('2d')) {
  const t = THEME_BY_ID[state.theme];
  ctx.clearRect(0, 0, W, W);
  ctx.save();
  ctx.beginPath(); ctx.arc(CX, CY, R + 13, 0, Math.PI * 2); ctx.clip();

  const bg = ctx.createRadialGradient(CX, CY - 120, 60, CX, CY, R + 13);
  bg.addColorStop(0, t.bgStart); bg.addColorStop(1, t.bgEnd);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, W);

  ctx.beginPath(); ctx.arc(CX, CY, R - 2, 0, Math.PI * 2); ctx.strokeStyle = t.metal; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.arc(CX, CY, R - 16, 0, Math.PI * 2); ctx.strokeStyle = t.dark ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.08)'; ctx.lineWidth = 1.5; ctx.stroke();

  /* lockup — lowercase serif wordmark, as on the clinic's printed material */
  font(ctx, 600, 128, SERIF); setText(ctx, t.ink, 'center', '-1px');
  ctx.fillText('lifora', CX, 172);
  font(ctx, 600, 22); setText(ctx, t.ink2, 'center', '8px');
  ctx.fillText('METABOLIC WELLNESS', CX + 4, 212);

  /* program pill */
  const program = val('program') || t.tag;
  const pillText = program.toUpperCase();
  const ps = fitSize(ctx, pillText, 560, 18, 13, 700);
  font(ctx, 700, ps); setText(ctx, t.pillInk, 'center', '2.5px');
  const fitted = ellipsize(ctx, pillText, 560);
  const pw = Math.min(620, ctx.measureText(fitted).width + 60);
  roundRect(ctx, CX - pw / 2, 238, pw, 40, 20); ctx.fillStyle = t.pillBg; ctx.fill();
  roundRect(ctx, CX - pw / 2 + .75, 238.75, pw - 1.5, 38.5, 19.25); ctx.strokeStyle = t.pillLine; ctx.lineWidth = 1.4; ctx.stroke();
  font(ctx, 700, ps); setText(ctx, t.pillInk, 'center', '2.5px');
  ctx.fillText(fitted, CX, 264 - (18 - ps) * .3);

  /* client name — the one thing that must read at chat-list size */
  const name = val('name') || 'Client name';
  const ns = fitSize(ctx, name, 980, 80, 50, 800);
  font(ctx, 800, ns); setText(ctx, val('name') ? t.ink : t.ink3, 'center', '-0.5px');
  ctx.fillText(ellipsize(ctx, name, 980), CX, 372);

  /* vitals row */
  const b = bmi();
  const sex = $('sex').value, age = val('age');
  const cols = [
    ['Sex, age', [sex, age && age + ' yrs'].filter(Boolean).join(', ') || '—'],
    ['Height', val('height') ? val('height') + ' cm' : '—'],
    ['Weight', val('weight') ? val('weight') + ' kg' : '—'],
    ['BMI', b ? b.value : '—'],
    ['Diet', $('diet').value || '—']
  ];
  const colW = 262, x0 = CX - colW * 2;
  cols.forEach(([label, value], i) => {
    const cx = x0 + i * colW;
    font(ctx, 500, 21); setText(ctx, t.ink3, 'center', '0.5px');
    ctx.fillText(label, cx, 430);
    const vs = fitSize(ctx, value, colW - 30, 31, 20, 700);
    font(ctx, 700, vs); setText(ctx, t.ink, 'center');
    ctx.fillText(ellipsize(ctx, value, colW - 30), cx, 470);
    if (i > 0) {
      ctx.beginPath(); ctx.moveTo(cx - colW / 2, 410); ctx.lineTo(cx - colW / 2, 482);
      ctx.strokeStyle = t.dark ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.10)'; ctx.lineWidth = 2; ctx.stroke();
    }
  });
  if (b) { font(ctx, 600, 16); setText(ctx, t.metal, 'center'); ctx.fillText(b.band, x0 + 3 * colW, 496); }

  /* cards: two tall lists on the left, four short notes on the right */
  const LX = 125, LW = 640, RX = 830, RW = 645, TOP = 520, GAP = 14;
  const LH = (610 - GAP) / 2, RH = (610 - GAP * 3) / 4;
  const A = t.accents;
  card(ctx, t, LX, TOP, LW, LH, A[0], 'objectives', 'PRIMARY OBJECTIVES');
  card(ctx, t, LX, TOP + LH + GAP, LW, LH, A[3], 'conditions', 'EXISTING CONDITIONS');
  const right = [
    ['ask', 'CLIENT’S ASK', A[1]], ['allergies', 'ALLERGIES', A[2]],
    ['intolerances', 'INTOLERANCES', A[4]], ['notAddressed', 'NOT ADDRESSED NOW', A[5]]
  ];
  right.forEach(([id, title, color], i) => {
    const y = TOP + i * (RH + GAP);
    card(ctx, t, RX, y, RW, RH, color, id, title);
    cardText(ctx, t, $(id).value, RX + 110, y + 100, RW - 140);
  });
  const objectives = splitItems($('objectives').value);
  const conditions = splitItems($('conditions').value);
  drawList(ctx, t, objectives.length ? objectives : ['Add objectives in the form'], LX + 110, TOP + 106, LW - 140, TOP + LH - 14, A[0]);
  drawList(ctx, t, conditions.length ? conditions : ['Nil'], LX + 110, TOP + LH + GAP + 106, LW - 140, TOP + 2 * LH + GAP - 14, A[3]);

  /* footer */
  const fy = 1196;
  ctx.strokeStyle = t.metalSoft; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(560, fy); ctx.lineTo(764, fy); ctx.moveTo(836, fy); ctx.lineTo(1040, fy); ctx.stroke();
  drawLeaf(ctx, CX, fy, t.metal);

  let y = 1252;
  const doctor = val('doctor');
  if (doctor) {
    const d = /^dr\b/i.test(doctor) ? doctor : 'Dr ' + doctor;
    font(ctx, 700, 27); setText(ctx, t.metal, 'center', '0.5px');
    ctx.fillText(ellipsize(ctx, d, 900), CX, y); y += 40;
  }
  const info = [val('clientId'), val('week')].filter(Boolean).join('     ');
  if (info) {
    font(ctx, 600, 22); setText(ctx, t.ink2, 'center', '1px');
    ctx.fillText(ellipsize(ctx, info, 880), CX, y); y += 44;
  }
  font(ctx, 500, 36, SERIF, 'italic'); setText(ctx, t.ink2, 'center');
  ctx.fillText('Real roots. Lasting change.', CX, Math.max(y + 8, 1330));

  ctx.restore();
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

function drawLeaf(ctx, x, y, color) {
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 14); ctx.bezierCurveTo(-16, 4, -16, -12, 0, -20); ctx.bezierCurveTo(16, -12, 16, 4, 0, 14);
  ctx.moveTo(0, 14); ctx.lineTo(0, -10);
  ctx.stroke(); ctx.restore();
}

function drawThumb() {
  const c = $('thumb'), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage($('preview'), 0, 0, c.width, c.height);
}

const schedule = frameScheduler(() => { draw(); drawThumb(); saveDraft(); });

/* ==========================================================================
   Theme chips
   ========================================================================== */
function buildChips() {
  const wrap = $('themeChips');
  wrap.innerHTML = '';
  THEMES.forEach((t) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(t.id === state.theme));
    const sw = document.createElement('span'); sw.className = 'sw';
    sw.style.background = `linear-gradient(135deg, ${t.bgEnd} 0 50%, ${t.metal} 50% 100%)`;
    b.append(sw, document.createTextNode(t.label));
    b.addEventListener('click', () => { state.theme = t.id; buildChips(); schedule(); });
    wrap.appendChild(b);
  });
  $('themeNote').textContent = 'Suits: ' + THEME_BY_ID[state.theme].tag.toLowerCase();
  $('program').placeholder = THEME_BY_ID[state.theme].tag;
}

/* ==========================================================================
   Export
   ========================================================================== */
function filename() {
  return `Lifora_${safePart($('name').value, 'Client')}_${safePart($('clientId').value, 'profile')}_${today()}.png`;
}
function toBlob() {
  draw();
  return new Promise((res, rej) => $('preview').toBlob((b) => (b ? res(b) : rej(new Error('PNG failed'))), 'image/png'));
}
async function withBusy(btn, fn) {
  btn.classList.add('busy'); btn.disabled = true;
  try { await fn(); } finally { btn.classList.remove('busy'); btn.disabled = false; }
}

async function onDownload() {
  await withBusy($('downloadBtn'), async () => {
    try {
      const blob = await toBlob();
      const url = downloadBlob(blob, filename());
      $('status').textContent = 'Saved ' + filename();
      toast('PNG downloaded.', { label: 'Open instead', run: () => window.open(url, '_blank') });
    } catch {
      $('status').textContent = 'The PNG couldn’t be created. Try again, or use a different browser.';
    }
  });
}

async function onShare() {
  await withBusy($('shareBtn'), async () => {
    const blob = await toBlob();
    const r = await shareBlob(blob, filename(), 'Lifora profile picture');
    if (r === 'unsupported') { downloadBlob(blob, filename()); toast('Sharing isn’t available here, so the PNG was downloaded.'); }
  });
}

/* ==========================================================================
   Init
   ========================================================================== */
async function init() {
  document.querySelectorAll('[data-icon]').forEach((el) => { el.outerHTML = ICON[el.dataset.icon]; });
  $('doctorList').innerHTML = DOCTORS.map((d) => `<option>${d}</option>`).join('');
  loadDraft();
  buildChips();
  Object.keys(RULES).forEach((id) => { enforce(id); updateCount(id); });
  updateBmi();

  document.querySelector('.form-body').addEventListener('input', (e) => {
    const id = e.target.id;
    if (RULES[id]) { enforce(id); updateCount(id); }
    if (id === 'height' || id === 'weight') updateBmi();
    schedule();
  });
  document.querySelector('.form-body').addEventListener('change', schedule);
  $('resetBtn').addEventListener('click', resetForm);
  $('downloadBtn').addEventListener('click', onDownload);
  if (canShareFiles('image/png')) { $('shareBtn').hidden = false; $('shareBtn').addEventListener('click', onShare); }

  draw(); drawThumb();
  await fontsReady();
  draw(); drawThumb();
}
init();
