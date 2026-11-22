import { $, store, readSharedClient, writeSharedClient, clearSharedClient, fontsReady, frameScheduler,
  safePart, today, prettyDate, downloadBlob, shareBlob, canShareFiles, toast, loadImage, ICON } from './common.js';

/* ==========================================================================
   Square profile picture, patient first.
   Order on the card: who (name + vitals) → existing conditions → allergies /
   intolerances → goals and the client's own words. Brand is a small sign-off.
   ========================================================================== */
const S = 1600, M = 120, CW = S - M * 2;
const C = {
  bg: '#ffffff', teal: '#0e3b38', ink: '#1a2b29', muted: '#6a7b78', faint: '#9aa8a5',
  line: '#e4e9e7', chip: '#eef4f3', gold: '#b8892e', alert: '#b4462f'
};
const SERIF = '"Playfair Display", Georgia, serif';
const SANS = 'Figtree, Arial, sans-serif';

const RULES = {
  name: { lines: 1, chars: 28 }, conditions: { lines: 8, chars: 160 }, allergies: { lines: 2, chars: 60 },
  intolerances: { lines: 2, chars: 60 }, objectives: { lines: 6, chars: 180 }, ask: { lines: 2, chars: 90 },
  notAddressed: { lines: 1, chars: 60 }
};
const FIELDS = ['name', 'sex', 'age', 'height', 'weight', 'diet', 'conditions', 'allergies', 'intolerances', 'objectives', 'ask', 'notAddressed'];
const DRAFT_KEY = 'lifora.profile.v2';
let emblem = null;

/* ==========================================================================
   Form
   ========================================================================== */
const val = (id) => String($(id).value || '').replace(/\r/g, '').trim();
const items = (id) => val(id).split('\n').map((s) => s.trim()).filter(Boolean);
const isNone = (v) => !v || /^(nil|none|no|na|n\/a|-|nkda)$/i.test(v.trim());

function enforce(id) {
  const el = $(id), r = RULES[id];
  if (!el || !r) return;
  let v = String(el.value || '').replace(/\r/g, '').slice(0, r.chars);
  const lines = v.split('\n');
  if (lines.length > r.lines) v = lines.slice(0, r.lines).join('\n');
  if (id === 'conditions' || id === 'objectives') v = v.split('\n').map((l) => l.slice(0, 48)).join('\n');
  if (v !== el.value) el.value = v;
}
function updateCount(id) {
  const out = document.querySelector(`[data-count="${id}"]`);
  if (!out) return;
  const n = $(id).value.length, max = RULES[id].chars;
  out.textContent = n >= max * 0.6 ? `${n}/${max}` : '';
  out.classList.toggle('near', n >= max * 0.85);
}

function bmi() {
  const h = parseFloat($('height').value), w = parseFloat($('weight').value);
  if (!(h > 50 && h < 260 && w > 15 && w < 350)) return null;
  const v = w / Math.pow(h / 100, 2);
  // WHO Asian cut-offs
  const band = v < 18.5 ? 'Underweight' : v < 23 ? 'Normal' : v < 25 ? 'Overweight' : v < 30 ? 'Obese I' : 'Obese II';
  return { value: v.toFixed(1), band };
}
function updateBmi() {
  const b = bmi(), out = $('bmiOut');
  out.textContent = '';
  if (!b) { out.textContent = 'From height and weight'; return; }
  const strong = document.createElement('b'); strong.textContent = b.value;
  out.append(strong, document.createTextNode(' ' + b.band));
}

function saveDraft() {
  const d = {};
  FIELDS.forEach((id) => { d[id] = $(id).value; });
  store.set(DRAFT_KEY, d);
  writeSharedClient({ name: val('name'), age: val('age'), sex: $('sex').value });
}
function loadDraft() {
  const d = store.get(DRAFT_KEY), c = readSharedClient();
  if (d) FIELDS.forEach((id) => { if (d[id] != null) $(id).value = d[id]; });
  if (!val('name') && c.name) $('name').value = c.name;
  if (!val('age') && c.age) $('age').value = c.age;
  if (!$('sex').value && c.sex) $('sex').value = c.sex;
}
function resetForm() {
  FIELDS.forEach((id) => { const el = $(id); if (el.tagName === 'SELECT') el.selectedIndex = 0; else el.value = ''; });
  store.remove(DRAFT_KEY); clearSharedClient();
  Object.keys(RULES).forEach(updateCount); updateBmi(); schedule();
  $('name').focus();
  toast('Cleared. Ready for the next client.');
}

/* ==========================================================================
   Canvas helpers
   ========================================================================== */
function font(ctx, weight, size, family = SANS, style = '') { ctx.font = `${style} ${weight} ${size}px ${family}`.trim(); }
function paint(ctx, color, align = 'left', spacing = '0px') {
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = spacing;
}
function fit(ctx, text, maxW, start, min, weight, family = SANS, style = '') {
  for (let s = start; s > min; s--) { font(ctx, weight, s, family, style); if (ctx.measureText(text).width <= maxW) return s; }
  font(ctx, weight, min, family, style);
  return min;
}
function ellipsize(ctx, text, maxW) {
  let out = String(text);
  if (ctx.measureText(out).width <= maxW) return out;
  while (out.length > 1 && ctx.measureText(out + '…').width > maxW) out = out.slice(0, -1);
  return out.trimEnd() + '…';
}
function wrap(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  let lines = [], line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) lines = lines.slice(0, maxLines - 1).concat(lines.slice(maxLines - 1).join(' '));
  return lines.map((l) => ellipsize(ctx, l, maxW));
}
function rule(ctx, y) { ctx.fillStyle = C.line; ctx.fillRect(M, y, CW, 2); }
function label(ctx, text, x, y, color = C.muted) { font(ctx, 600, 26); paint(ctx, color, 'left', '0.5px'); ctx.fillText(text, x, y); }

/* ==========================================================================
   Sections — each returns the y where the next one may start
   ========================================================================== */
function drawHeader(ctx) {
  const name = val('name') || 'Client name';
  fit(ctx, name, CW, 112, 64, 500, SERIF);
  paint(ctx, val('name') ? C.teal : C.faint, 'center', '-0.5px');
  ctx.fillText(ellipsize(ctx, name, CW), S / 2, 232);

  const b = bmi();
  const cols = [
    ['Sex, age', [$('sex').value, val('age') && val('age') + ' yrs'].filter(Boolean).join(', ')],
    ['Height', val('height') && val('height') + ' cm'],
    ['Weight', val('weight') && val('weight') + ' kg'],
    ['BMI', b ? b.value : ''],
    ['Diet', $('diet').value]
  ];
  const colW = CW / cols.length;
  cols.forEach(([k, v], i) => {
    const cx = M + colW * i + colW / 2;
    font(ctx, 500, 26); paint(ctx, C.muted, 'center', '0.5px'); ctx.fillText(k, cx, 318);
    fit(ctx, v || '—', colW - 24, 42, 26, 600); paint(ctx, v ? C.ink : C.faint, 'center');
    ctx.fillText(ellipsize(ctx, v || '—', colW - 24), cx, 372);
  });
  if (b) { font(ctx, 600, 22); paint(ctx, C.gold, 'center'); ctx.fillText(b.band, M + colW * 3.5, 408); }
  rule(ctx, 446);
  return 446;
}

function drawConditions(ctx, top) {
  let y = top + 74;
  label(ctx, 'Existing conditions', M, y, C.teal);
  const list = items('conditions');
  y += 34;
  if (!list.length) {
    font(ctx, 500, 40); paint(ctx, C.faint); ctx.fillText('None recorded', M, y + 52);
    return y + 100;
  }
  const H = 84, PAD = 30, GAP = 16, MAXROWS = 3, MORE_W = 150;
  // Lay out first, draw second, so an overflow note can take the last slot cleanly.
  const placed = [];
  let x = M, row = 0;
  for (const item of list) {
    const size = fit(ctx, item, CW - PAD * 2, 40, 28, 600);
    const text = ellipsize(ctx, item, CW - PAD * 2);
    const w = ctx.measureText(text).width + PAD * 2;
    if (x + w > M + CW) { row++; x = M; }
    if (row >= MAXROWS) break;
    placed.push({ text, size, x, w, row });
    x += w + GAP;
  }
  let more = list.length - placed.length;
  if (more > 0) {
    // make room for "+N more" at the end of the last row
    while (placed.length && placed[placed.length - 1].x + placed[placed.length - 1].w + GAP + MORE_W > M + CW) { placed.pop(); more++; }
  }
  placed.forEach((c) => {
    const cy = y + c.row * (H + GAP);
    ctx.beginPath(); ctx.roundRect(c.x, cy, c.w, H, H / 2); ctx.fillStyle = C.chip; ctx.fill();
    font(ctx, 600, c.size); paint(ctx, C.teal); ctx.fillText(c.text, c.x + PAD, cy + H / 2 + c.size * 0.36);
  });
  const rows = placed.length ? placed[placed.length - 1].row + 1 : 1;
  if (more > 0) {
    const last = placed[placed.length - 1];
    const mx = last ? last.x + last.w + GAP + 6 : M;
    font(ctx, 600, 28); paint(ctx, C.muted);
    ctx.fillText(`+${more} more`, mx, y + (rows - 1) * (H + GAP) + H / 2 + 10);
  }
  return y + rows * (H + GAP) + 20;
}

function drawSafety(ctx, top) {
  rule(ctx, top);
  const colW = (CW - 60) / 2;
  const cols = [['Allergies', val('allergies'), true], ['Intolerances', val('intolerances'), false]];
  let bottom = top;
  cols.forEach(([k, v, critical], i) => {
    const x = M + i * (colW + 60);
    const flagged = critical && !isNone(v);
    let y = top + 74;
    if (flagged) {
      ctx.beginPath(); ctx.arc(x + 9, y - 9, 9, 0, Math.PI * 2); ctx.fillStyle = C.alert; ctx.fill();
      label(ctx, k, x + 30, y, C.alert);
    } else label(ctx, k, x, y, C.teal);
    const text = isNone(v) ? 'None' : v.replace(/\n+/g, ', ');
    fit(ctx, text, colW, 42, 32, 600);
    const lines = wrap(ctx, text, colW, 2);
    paint(ctx, isNone(v) ? C.faint : (flagged ? C.alert : C.ink));
    y += 62;
    lines.forEach((l, j) => ctx.fillText(l, x, y + j * 50));
    bottom = Math.max(bottom, y + (lines.length - 1) * 50 + 40);
  });
  return bottom + 10;
}

function drawGoals(ctx, top, limit) {
  rule(ctx, top);
  const colW = (CW - 60) / 2, rx = M + colW + 60;
  /* left: goals */
  let y = top + 74;
  label(ctx, 'Goals', M, y, C.teal);
  const goals = items('objectives');
  y += 62;
  let shown = 0;
  if (!goals.length) { font(ctx, 500, 34); paint(ctx, C.faint); ctx.fillText('Not set yet', M, y); }
  // one size for the whole list, so items line up
  const gsize = goals.reduce((m, g) => Math.min(m, fit(ctx, g, (colW - 36) * 1.6, 34, 28, 500)), 34);
  for (const g of goals) {
    font(ctx, 500, gsize);
    const lines = wrap(ctx, g, colW - 36, 2);
    const need = lines.length * 44;
    const reserve = shown < goals.length - 1 ? 40 : 0;
    if (y + need - 44 > limit - reserve) break;
    ctx.fillStyle = C.gold; ctx.fillRect(M, y - 14, 16, 3);
    paint(ctx, C.ink);
    lines.forEach((l, j) => ctx.fillText(l, M + 36, y + j * 44));
    y += need + 12; shown++;
  }
  if (goals.length > shown) { font(ctx, 600, 26); paint(ctx, C.muted); ctx.fillText(`+${goals.length - shown} more`, M + 36, Math.min(y, limit)); }

  /* right: their words + not working on now */
  let ry = top + 74;
  label(ctx, 'In their words', rx, ry, C.teal);
  ry += 66;
  const ask = val('ask').replace(/\n+/g, ' ');
  if (ask) {
    font(ctx, 400, ask.length > 60 ? 34 : 40, SERIF, 'italic');
    const lines = wrap(ctx, '“' + ask + '”', colW, 4);
    paint(ctx, C.ink);
    lines.forEach((l, j) => ctx.fillText(l, rx, ry + j * 54));
    ry += lines.length * 54 + 30;
  } else { font(ctx, 400, 34, SERIF, 'italic'); paint(ctx, C.faint); ctx.fillText('Not recorded', rx, ry); ry += 84; }

  const na = val('notAddressed');
  if (na && !isNone(na) && ry + 70 < limit) {
    label(ctx, 'Not working on now', rx, ry);
    fit(ctx, na, colW, 32, 24, 500);
    paint(ctx, C.muted);
    ctx.fillText(ellipsize(ctx, na, colW), rx, ry + 48);
  }
}

function drawFooter(ctx) {
  const y = S - 104;
  rule(ctx, y - 52);
  if (emblem) {
    const h = 58, w = h * emblem.width / emblem.height;
    ctx.drawImage(emblem, M, y - h + 12, w, h);
    font(ctx, 500, 34, SERIF); paint(ctx, C.teal);
    ctx.fillText('Lifora', M + w + 16, y);
  } else { font(ctx, 500, 34, SERIF); paint(ctx, C.teal); ctx.fillText('Lifora', M, y); }
  font(ctx, 500, 24); paint(ctx, C.faint, 'right');
  ctx.fillText('Updated ' + prettyDate(), M + CW, y);
}

function draw() {
  const ctx = $('preview').getContext('2d');
  ctx.save();
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, S, S);
  let y = drawHeader(ctx);
  y = drawConditions(ctx, y);
  y = drawSafety(ctx, y);
  drawGoals(ctx, y, S - 200);
  drawFooter(ctx);
  ctx.restore();
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}
const schedule = frameScheduler(() => { draw(); saveDraft(); });

/* ==========================================================================
   Export
   ========================================================================== */
const filename = () => `Lifora_${safePart($('name').value, 'Client')}_${today()}.png`;
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
    } catch { $('status').textContent = 'The PNG couldn’t be made. Try again or use another browser.'; }
  });
}
async function onShare() {
  await withBusy($('shareBtn'), async () => {
    const blob = await toBlob();
    const r = await shareBlob(blob, filename(), 'Client profile picture');
    if (r === 'unsupported') { downloadBlob(blob, filename()); toast('Sharing isn’t available here, so the PNG was downloaded.'); }
  });
}

/* ==========================================================================
   Init
   ========================================================================== */
async function init() {
  document.querySelectorAll('[data-icon]').forEach((el) => { el.outerHTML = ICON[el.dataset.icon]; });
  loadDraft();
  Object.keys(RULES).forEach((id) => { enforce(id); updateCount(id); });
  updateBmi();
  const form = document.querySelector('.form-col');
  form.addEventListener('input', (e) => {
    const id = e.target.id;
    if (RULES[id]) { enforce(id); updateCount(id); }
    if (id === 'height' || id === 'weight') updateBmi();
    schedule();
  });
  form.addEventListener('change', schedule);
  $('resetBtn').addEventListener('click', resetForm);
  $('downloadBtn').addEventListener('click', onDownload);
  if (canShareFiles('image/png')) { $('shareBtn').hidden = false; $('shareBtn').addEventListener('click', onShare); }
  draw();
  [emblem] = await Promise.all([loadImage('../assets/img/emblem.webp'), fontsReady()]);
  draw();
}
init();
