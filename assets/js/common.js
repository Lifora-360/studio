/* Lifora Studio — shared helpers. Everything runs in the browser; no client
   data ever leaves the device except through the person's own download/share. */

export const $ = (id) => document.getElementById(id);

/* ---------- storage (best-effort; works without it) ---------- */
export const store = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode etc. */ }
  },
  remove(key) { try { localStorage.removeItem(key); } catch {} }
};

/* The client both tools share: name + age (+ sex) typed once, reused in the other tool. */
const CLIENT_KEY = 'lifora.client';
export function readSharedClient() { return store.get(CLIENT_KEY, {}); }
export function writeSharedClient(patch) {
  const cur = readSharedClient();
  store.set(CLIENT_KEY, { ...cur, ...patch, updated: Date.now() });
}
export function clearSharedClient() { store.remove(CLIENT_KEY); }

/* ---------- fonts: canvas + html2canvas need them decoded first ---------- */
export async function fontsReady() {
  const faces = [
    '400 40px "Playfair Display"', '500 40px "Playfair Display"', '600 40px "Playfair Display"', 'italic 400 40px "Playfair Display"',
    '500 40px "EB Garamond"', 'italic 400 40px "EB Garamond"',
    '400 20px Figtree', '500 20px Figtree', '600 20px Figtree', '700 20px Figtree', '800 20px Figtree'
  ];
  try {
    await Promise.all(faces.map((f) => document.fonts.load(f)));
    await document.fonts.ready;
  } catch { /* fall back to system fonts */ }
}

/* ---------- rAF-batched redraw ---------- */
export function frameScheduler(fn) {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(); });
  };
}

/* ---------- filenames ---------- */
export function safePart(s, fallback) {
  const v = String(s || '').trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  return v || fallback;
}
export function today() { return new Date().toISOString().slice(0, 10); }
export function prettyDate(d = new Date()) {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ---------- download / share ---------- */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Keep the URL alive long enough for the "open instead" fallback.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return url;
}

export function canShareFiles(type = 'image/png') {
  try {
    const probe = new File([new Blob([''], { type })], 'probe', { type });
    return !!(navigator.canShare && navigator.canShare({ files: [probe] }));
  } catch { return false; }
}

/** Opens the system share sheet (WhatsApp etc.). Returns 'shared' | 'cancelled' | 'unsupported'. */
export async function shareBlob(blob, filename, title) {
  const file = new File([blob], filename, { type: blob.type });
  if (!(navigator.canShare && navigator.canShare({ files: [file] }))) return 'unsupported';
  try { await navigator.share({ files: [file], title }); return 'shared'; }
  catch (e) { return e && e.name === 'AbortError' ? 'cancelled' : 'unsupported'; }
}

/* ---------- toast ---------- */
let toastTimer;
export function toast(message, action) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast'; el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = message;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = action.label;
    b.addEventListener('click', () => { action.run(); el.classList.remove('show'); });
    el.appendChild(b);
  }
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 7000 : 3200);
}

/* ---------- load a same-origin script once ---------- */
const loaded = new Map();
export function loadScript(src) {
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve;
      s.onerror = () => { loaded.delete(src); reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    }));
  }
  return loaded.get(src);
}

/* ---------- icons used in buttons ---------- */
export const ICON = {
  download: '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  check: '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  spin: '<svg class="btn-icon dyn-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 9 9"/></svg>',
  share: '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4M8.2 13.2l7.6 4"/></svg>'
};


/* ---------- images (logo) ---------- */
const imgCache = new Map();
export function loadImage(src) {
  if (!imgCache.has(src)) {
    imgCache.set(src, new Promise((resolve) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => resolve(null);
      i.src = src;
    }));
  }
  return imgCache.get(src);
}

/* ---------- dynamic button ----------
   Vanilla port of the DynamicButton component: when the label (and icon) changes,
   the old one slides up and out, the new one slides in from below, and the button's
   width eases to fit the new content. Width animation is skipped for buttons that
   fill their container ({ full: true }) or when the user prefers reduced motion. */
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const DYN_MS = 180;

export function dynamicButton(btn, { full = false } = {}) {
  if (btn._dyn) return btn._dyn;
  const icon0 = (btn.querySelector('svg.btn-icon') || {}).outerHTML || '';
  btn.querySelectorAll('.spinner, svg.btn-icon').forEach((n) => n.remove());
  const text0 = btn.textContent.trim();
  btn.classList.add('dyn');
  btn.innerHTML = '<span class="dyn-in"><span class="dyn-ico"></span><span class="dyn-txt"></span></span><span class="dyn-measure" aria-hidden="true"></span>';
  const ico = btn.querySelector('.dyn-ico'), txt = btn.querySelector('.dyn-txt'), measure = btn.querySelector('.dyn-measure');
  let cur = { text: null, icon: null }, timer = null;

  function swap(slot, html, animate) {
    [...slot.children].forEach((old) => {
      if (!animate) { old.remove(); return; }
      old.classList.add('dyn-leave');
      setTimeout(() => old.remove(), DYN_MS);
    });
    if (!html) return;
    const n = document.createElement('span');
    n.className = 'dyn-item' + (animate ? ' dyn-enter' : '');
    n.innerHTML = html;
    slot.appendChild(n);
  }

  function set(text, icon = '', { animate = true } = {}) {
    clearTimeout(timer);
    if (text === cur.text && icon === cur.icon) return api;
    const move = animate && cur.text !== null && !reduceMotion();
    const before = btn.getBoundingClientRect().width;
    if (icon !== cur.icon) swap(ico, icon, move);
    if (text !== cur.text) swap(txt, escapeHtml(text), move);
    ico.hidden = !icon;
    btn.setAttribute('aria-label', text);
    cur = { text, icon };
    if (full) return api;            // layout decides the width; leave it alone
    if (!move) { btn.style.width = ''; return api; }
    // Measure the new content off-screen, then ease the width to it.
    measure.innerHTML = (icon ? `<span class="dyn-ico-m">${icon}</span>` : '') + `<span>${escapeHtml(text)}</span>`;
    const cs = getComputedStyle(btn);
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    const after = Math.ceil(measure.scrollWidth + pad);
    btn.style.width = before + 'px';
    void btn.offsetWidth;
    btn.style.width = after + 'px';
    const done = (e) => { if (e.propertyName !== 'width') return; btn.removeEventListener('transitionend', done); if (cur.text === text) btn.style.width = ''; };
    btn.addEventListener('transitionend', done);
    return api;
  }

  const api = {
    set,
    busy(text) { btn.disabled = true; return set(text, ICON.spin); },
    reset() { btn.disabled = false; return set(text0, icon0); },
    /** Show a result briefly, then go back to the original label. */
    flash(text, icon = ICON.check, ms = 1800) {
      btn.disabled = false;
      set(text, icon);
      timer = setTimeout(() => api.reset(), ms);
      return api;
    }
  };
  set(text0, icon0, { animate: false });
  btn._dyn = api;
  return api;
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
