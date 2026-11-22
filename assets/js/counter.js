/* Animated counter — vanilla port of the AnimatedCounter React component.
 *
 * Each digit is a wheel of faces 0–9 (plus a trailing 0 so 9 → 0 lands on an identical face)
 * that rolls on a spring toward its digit, the way the value moved. Columns are keyed by their
 * distance from the right, so gaining a place slides the existing columns over (FLIP) and the
 * new one rolls in from 0; a lost place fades out of the flow. Masked top and bottom so a
 * resting digit is solid and a moving one fades through the air around it.
 *
 *   const c = counter(el, { prefix: '₹', grouping: 'indian' });
 *   c.set(25000);
 */

const WHEEL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
const BOUNCE = 0.18;
const EASE = 'cubic-bezier(.22,1,.36,1)';
const LEAVE_MS = 180;
const MAX_DECIMALS = 15, MAX_PAD = 24, MIN_DURATION = 0.01, MAX_DURATION = 60;

const mod = (n, m) => ((n % m) + m) % m;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
const isDigit = (c) => c >= '0' && c <= '9';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const EVERY_THREE = /\B(?=(\d{3})+(?!\d))/g;
const EVERY_TWO = /\B(?=(\d{2})+(?!\d))/g;
function group(whole, sep, grouping) {
  if (!sep) return whole;
  if (grouping !== 'indian') return whole.replace(EVERY_THREE, sep);
  const head = whole.slice(0, -3);            // indian: three at the end, pairs above
  if (!head) return whole;
  return `${head.replace(EVERY_TWO, sep)}${sep}${whole.slice(-3)}`;
}

function measure(value, decimals, padStart, duration) {
  const amount = Number.isFinite(value) ? value : 0;
  const places = clamp(Math.trunc(decimals), 0, MAX_DECIMALS);
  const pad = clamp(Math.trunc(padStart), 1, MAX_PAD);
  const scaled = Math.min(Number.MAX_SAFE_INTEGER, Math.round(Math.abs(amount) * 10 ** places));
  return { amount, scaled, places, pace: clamp(duration, MIN_DURATION, MAX_DURATION), width: Math.max(String(scaled).length, places + pad) };
}
function format({ scaled, places, width }, sep, dec, grouping) {
  const raw = String(scaled).padStart(width, '0');
  const whole = group(raw.slice(0, raw.length - places) || '0', sep, grouping);
  return places ? `${whole}${dec}${raw.slice(raw.length - places)}` : whole;
}
function toCells(chars, width) {
  const cells = []; let seen = 0, run = 0;
  for (const ch of chars) {
    if (isDigit(ch)) { run = 0; cells.push({ kind: 'digit', key: 'd' + (width - seen++), digit: Number(ch) }); }
    else cells.push({ kind: 'mark', key: `m${width - seen}-${run++}`, char: ch });
  }
  return cells;
}

/* Spring matching motion's { type: 'spring', visualDuration, bounce } */
function springFor(visualDuration) {
  const stiffness = Math.pow((2 * Math.PI) / (visualDuration * 1.2), 2);
  const damping = 2 * clamp(1 - BOUNCE, 0, 1) * Math.sqrt(stiffness);
  return { stiffness, damping };
}

function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

function makeDigit(from) {
  const node = el('span', 'ctr-d');
  for (let f = 0; f <= 9; f++) node.appendChild(el('span', 'ctr-sz', String(f))); // widest-face width
  const stack = el('span', 'ctr-st');
  WHEEL.forEach((f) => stack.appendChild(el('span', null, String(f))));
  node.appendChild(stack);
  const col = { kind: 'digit', el: node, stack, pos: from, vel: 0, goal: from, raf: 0 };
  paint(col);
  return col;
}
function paint(col) { col.stack.style.transform = `translateY(${(-mod(col.pos, 10) * 100) / WHEEL.length}%)`; }

function roll(col, digit, dir, pace) {
  if (reduced()) { cancelAnimationFrame(col.raf); col.pos = col.goal = digit; col.vel = 0; paint(col); return; }
  // re-aim only when the face changed; aim from where the wheel is, the way the value moved
  if (mod(col.goal, 10) !== digit) {
    const at = col.pos;
    col.goal = dir < 0 ? at - mod(at - digit, 10) : at + mod(digit - at, 10);
  }
  const { stiffness, damping } = springFor(pace);
  cancelAnimationFrame(col.raf);
  let last = performance.now();
  const step = (now) => {
    let dt = Math.min(0.064, (now - last) / 1000); last = now;
    while (dt > 0) {                           // small fixed sub-steps keep the spring stable
      const h = Math.min(dt, 1 / 240); dt -= h;
      const a = -stiffness * (col.pos - col.goal) - damping * col.vel;
      col.vel += a * h; col.pos += col.vel * h;
    }
    if (Math.abs(col.pos - col.goal) < 0.0005 && Math.abs(col.vel) < 0.005) { col.pos = col.goal; col.vel = 0; paint(col); return; }
    paint(col);
    col.raf = requestAnimationFrame(step);
  };
  col.raf = requestAnimationFrame(step);
}

export function counter(host, opts = {}) {
  const o = { decimals: 0, duration: 0.6, padStart: 1, separator: ',', decimalSeparator: '.', grouping: 'western', prefix: '', suffix: '', ...opts };
  host.classList.add('ctr');
  host.textContent = '';
  const pre = o.prefix ? el('span', 'ctr-fx', o.prefix) : null;
  const sr = el('span', 'sr-only');
  const vis = el('span', 'ctr-vis'); vis.setAttribute('aria-hidden', 'true');
  const minus = el('span', 'ctr-fx', '-');
  const suf = o.suffix ? el('span', 'ctr-fx', o.suffix) : null;
  host.append(...[pre, sr, vis, suf].filter(Boolean));

  const live = new Map();            // key -> column or mark
  let prev = null, dir = 1, mounted = false;

  function set(value, extra = {}) {
    const decimals = extra.decimals ?? o.decimals;
    const shape = measure(value, decimals, o.padStart, o.duration);
    const chars = format(shape, o.separator, o.decimalSeparator, o.grouping);
    const cells = toCells(chars, shape.width);
    const negative = shape.amount < 0 && shape.scaled > 0;
    sr.textContent = `${o.prefix}${negative ? '-' : ''}${chars}${o.suffix}`;
    if (prev !== null && shape.amount !== prev) dir = shape.amount >= prev ? 1 : -1;
    prev = shape.amount;
    const animate = mounted && !reduced();

    // FIRST: where every kept piece sits now (relative to the row)
    const base0 = vis.getBoundingClientRect().left;
    const first = new Map();
    live.forEach((c, k) => first.set(k, c.el.getBoundingClientRect().left - base0));
    const fixed0 = [pre, suf, minus].map((n) => n && n.isConnected ? n.getBoundingClientRect().left : null);

    // Build the next row
    const next = new Map(), order = [];
    for (const cell of cells) {
      let c = live.get(cell.key);
      if (c && (c.kind !== cell.kind || (c.kind === 'mark' && c.char !== cell.char))) c = null;
      const entering = !c;
      if (!c) {
        c = cell.kind === 'digit'
          ? makeDigit(mounted ? 0 : cell.digit)   // a place that appears later rolls in from 0
          : { kind: 'mark', char: cell.char, el: el('span', 'ctr-m', cell.char) };
      }
      c.entering = entering;
      next.set(cell.key, c);
      order.push(c);
    }

    // Leaving pieces: pull out of the flow where they stood, fade, remove (popLayout)
    live.forEach((c, k) => {
      if (next.get(k) === c) return;
      cancelAnimationFrame(c.raf || 0);
      if (!animate) { c.el.remove(); return; }
      const x = first.get(k);
      c.el.style.cssText += `;position:absolute;left:${x}px;top:50%;translate:0 -50%;pointer-events:none`;
      c.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: LEAVE_MS, easing: EASE, fill: 'forwards' }).onfinish = () => c.el.remove();
    });

    // Order the DOM (moving kept nodes keeps their wheels intact)
    if (negative) vis.insertBefore(minus, vis.firstChild); else minus.remove();
    let anchor = negative ? minus : null;
    for (const c of order) {
      const want = anchor ? anchor.nextSibling : vis.firstChild;
      if (c.el !== want) vis.insertBefore(c.el, want);
      anchor = c.el;
    }

    // Digits roll to their faces
    for (const cell of cells) if (cell.kind === 'digit') {
      const c = next.get(cell.key);
      if (!mounted) { c.pos = c.goal = cell.digit; paint(c); }
      else roll(c, cell.digit, dir, shape.pace);
    }

    // LAST + INVERT + PLAY: slide kept pieces from their old spot; fade new ones in
    if (animate) {
      const base1 = vis.getBoundingClientRect().left;
      const dur = Math.round(shape.pace * 1000);
      next.forEach((c, k) => {
        if (c.entering) { c.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur, easing: EASE }); return; }
        const dx = first.get(k) - (c.el.getBoundingClientRect().left - base1);
        if (Math.abs(dx) > 0.5) c.el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: dur, easing: EASE });
      });
      [pre, suf, minus].forEach((n, i) => {
        if (!n || !n.isConnected || fixed0[i] == null) return;
        const dx = fixed0[i] - n.getBoundingClientRect().left;
        if (Math.abs(dx) > 0.5) n.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: dur, easing: EASE });
      });
    }

    live.clear();
    next.forEach((c, k) => live.set(k, c));
    mounted = true;
    return api;
  }

  const api = { set, get value() { return prev; } };
  return api;
}

/** Indian-rupee counter: ₹1,00,000 style, paise only when there are any. */
export function rupeeCounter(host, opts = {}) {
  const c = counter(host, { prefix: '₹', grouping: 'indian', ...opts });
  return { set: (v) => c.set(v, { decimals: Number(v) % 1 ? 2 : 0 }), get value() { return c.value; } };
}
