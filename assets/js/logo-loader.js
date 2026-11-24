/* Logo trace loader — the Lifora lotus traced while work is in progress, resolving
 * into the filled emblem when it completes. Vanilla port of the LogoTraceLoader
 * component contract (Studio has no React build step).
 *
 *   const loader = logoTraceLoader(host, { size: 72, onDone: () => … });
 *   loader.complete();            // or loader.setLoading(false)
 *
 * Options (same names as the React props):
 *   loading = true, isComplete = false, size = 64 (px), strokeWidth = 2 (px),
 *   loopDurationSeconds = 1.6, fillFadeSeconds = 0.35, className, ariaLabel = 'Loading', onDone
 *
 * Phases: 'loop' → 'closingOutline' → 'fadingFill' → 'done'.
 * - loop: a short stroke segment runs around TRACE_PATH (CSS animation).
 * - closingOutline: the full outline draws closed from the top petal.
 * - fadingFill: FILL_PATHS fade in while the outline fades out.
 * - done: onDone is called exactly once.
 * Every step has a timeout fallback, so nothing depends only on transition events.
 * Reduced motion: the filled emblem is shown at once, and onDone fires as soon as
 * loading is complete (immediately if it already is).
 * Stroke and fill use currentColor, so `color` (via className or CSS) styles it. */
import { LOGO_VIEW_BOX, TRACE_PATH, FILL_PATHS } from './logo-data.js';

const NS = 'http://www.w3.org/2000/svg';
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const svgEl = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };

export function logoTraceLoader(host, opts = {}) {
  const o = { loading: true, isComplete: false, size: 64, strokeWidth: 2, loopDurationSeconds: 1.6, fillFadeSeconds: 0.35, className: '', ariaLabel: 'Loading', onDone: null, ...opts };
  const vbWidth = Number(LOGO_VIEW_BOX.split(/\s+/)[2]);
  const unit = vbWidth / o.size;                       // viewBox units per CSS pixel
  const sw = o.strokeWidth * unit;
  const closeSeconds = Math.min(0.8, Math.max(0.3, o.loopDurationSeconds * 0.4));

  // Width and height are fixed from the first render, so nothing shifts later.
  const svg = svgEl('svg', { role: 'status', 'aria-label': o.ariaLabel, viewBox: LOGO_VIEW_BOX, width: o.size, height: o.size, class: ('logo-loader ' + o.className).trim() });
  const ghost = svgEl('g', { opacity: '0.18' });
  ghost.appendChild(svgEl('path', { d: TRACE_PATH, fill: 'none', stroke: 'currentColor', 'stroke-width': Math.max(unit, sw / 2), 'stroke-linejoin': 'round' }));
  svg.appendChild(ghost);
  host.appendChild(svg);

  let phase = null, doneCalled = false, timer = 0, trace = null, fill = null;

  function finish() {
    phase = 'done';
    svg.dataset.phase = phase;
    svg.setAttribute('aria-busy', 'false');
    if (!doneCalled) { doneCalled = true; if (typeof o.onDone === 'function') o.onDone(); }
  }
  function showFill(instant) {
    fill = svgEl('g', { class: 'logo-loader-fill', 'fill-rule': 'evenodd' });
    FILL_PATHS.forEach((d) => fill.appendChild(svgEl('path', { d, fill: 'currentColor' })));
    svg.appendChild(fill);
    if (instant) { ghost.setAttribute('opacity', '0'); return; }
    fill.style.opacity = '0';
    fill.style.transition = `opacity ${o.fillFadeSeconds}s ease`;
    ghost.style.transition = `opacity ${o.fillFadeSeconds}s ease`;
    void fill.getBoundingClientRect();
    fill.style.opacity = '1';
    ghost.style.opacity = '0';
    if (trace) { trace.style.transition = `opacity ${o.fillFadeSeconds}s ease`; trace.style.opacity = '0'; }
  }
  function setPhase(next) {
    if (phase === next || phase === 'done') return;
    phase = next;
    svg.dataset.phase = phase;
    clearTimeout(timer);
    if (next === 'loop') {
      svg.setAttribute('aria-busy', 'true');
      trace = svgEl('path', { d: TRACE_PATH, fill: 'none', stroke: 'currentColor', 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: '1', 'stroke-dasharray': '0.16 0.84' });
      trace.style.animation = `logo-trace-loader-loop ${o.loopDurationSeconds}s linear infinite`;
      svg.appendChild(trace);
    } else if (next === 'closingOutline') {
      // Replace the moving segment with the outline drawing itself closed.
      if (trace) trace.remove();
      trace = svgEl('path', { d: TRACE_PATH, fill: 'none', stroke: 'currentColor', 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: '1', 'stroke-dasharray': '1 1' });
      trace.style.strokeDashoffset = '1';
      svg.appendChild(trace);
      void trace.getBoundingClientRect();
      trace.style.transition = `stroke-dashoffset ${closeSeconds}s cubic-bezier(.4,0,.2,1)`;
      trace.style.strokeDashoffset = '0';
      const next2 = () => setPhase('fadingFill');
      trace.addEventListener('transitionend', next2, { once: true });
      timer = setTimeout(next2, closeSeconds * 1000 + 120);       // fallback
    } else if (next === 'fadingFill') {
      showFill(false);
      const end = () => { clearTimeout(timer); finish(); };
      fill.addEventListener('transitionend', end, { once: true });
      timer = setTimeout(end, o.fillFadeSeconds * 1000 + 120);      // fallback
    }
  }

  function complete() {
    if (phase === 'closingOutline' || phase === 'fadingFill' || phase === 'done') return;
    if (reducedMotion()) { if (!fill) showFill(true); finish(); return; }
    setPhase('closingOutline');
  }

  if (reducedMotion()) {
    showFill(true);
    phase = 'static';
    if (!o.loading || o.isComplete) finish(); else svg.setAttribute('aria-busy', 'true');
  } else if (!o.loading || o.isComplete) {
    setPhase('loop');
    complete();
  } else setPhase('loop');

  return {
    el: svg,
    get phase() { return phase; },
    complete,
    setLoading(v) { if (!v) complete(); },
    destroy() { clearTimeout(timer); svg.remove(); }
  };
}

/** Show the loader in `host` only if `promise` takes longer than `delayMs` (fast loads
 *  never flash it). When the promise settles, the logo resolves, `host` is cleared, and
 *  the promise's result is returned (or its error thrown). */
export async function withLogoLoader(host, promise, { delayMs = 300, ...opts } = {}) {
  let loader = null, resolved = null;
  const doneP = new Promise((r) => { resolved = r; });
  const t = setTimeout(() => {
    loader = logoTraceLoader(host, { ...opts, onDone: () => { if (opts.onDone) opts.onDone(); resolved(); } });
  }, delayMs);
  let result, error = null;
  try { result = await promise; } catch (e) { error = e; }
  clearTimeout(t);
  if (loader) {
    loader.complete();
    await Promise.race([doneP, new Promise((r) => setTimeout(r, 4000))]);   // fallback
    loader.destroy();
  }
  if (error) throw error;
  return result;
}
