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
