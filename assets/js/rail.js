/* Bounce sidebar — vanilla port of the BounceSidebar React component.
 *
 * A vertical list with a small dot beside the active item. When the active item changes
 * the dot hops there along an arc (like motion's `arc()` path): the bulge is
 * min(0.8, 14 / distance), so short hops curve visibly and long ones stay almost straight.
 * Clockwise going up, counter-clockwise going down; 0.25s ease-out. Positions are snapped to
 * device pixels so the 6px dot stays crisp.
 *
 *   const rail = bounceSidebar(ul, { items: ['Client', { label: 'Lifora 1' }], onChange: i => … });
 *   rail.set(2);   // move without calling onChange (e.g. from scroll-spy)
 */

const easeOut = (t) => 1 - Math.pow(1 - t, 2);          // motion's "easeOut"
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function bounceSidebar(ul, { items, value = 0, onChange } = {}) {
  ul.classList.add('bounce');
  ul.textContent = '';
  const dot = document.createElement('span');
  dot.className = 'bounce-dot';
  dot.setAttribute('aria-hidden', 'true');
  ul.appendChild(dot);

  const lis = items.map((item, index) => {
    const label = typeof item === 'string' ? item : item.label;
    const li = document.createElement('li');
    if (typeof item !== 'string' && item.heading) {
      li.className = 'bounce-heading'; li.setAttribute('role', 'presentation'); li.textContent = label;
      return li;
    }
    const href = typeof item === 'string' ? null : item.href;
    const b = document.createElement(href ? 'a' : 'button');
    b.className = 'bounce-item';
    if (href) b.href = href; else b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => { select(index); onChange && onChange(index); });
    li.appendChild(b);
    return li;
  });
  lis.forEach((li) => ul.appendChild(li));

  let active = value, y = null, raf = 0;
  const px = (v) => { const dpr = window.devicePixelRatio || 1; return Math.round(v * dpr) / dpr; };
  const size = () => px(6);
  const targetY = (i) => { const li = lis[i]; return px(li.offsetTop + li.offsetHeight / 2 - size() / 2); };
  const place = (x, yy) => { dot.style.transform = `translate(${x}px, ${yy}px)`; };

  function mark() {
    lis.forEach((li, i) => { const b = li.querySelector('.bounce-item'); if (b) { b.dataset.active = String(i === active); if (i === active) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); } });
  }

  function snap() {
    if (!lis[active]) return;
    cancelAnimationFrame(raf);
    y = targetY(active);
    dot.style.width = dot.style.height = size() + 'px';
    place(0, y);
    ul.classList.add('ready');
  }

  function hop(toY) {
    const fromY = y;
    y = toY;
    const delta = toY - fromY;
    if (!delta) return;
    if (reduced()) { place(0, toY); return; }
    const distance = Math.abs(delta);
    const strength = Math.min(0.8, 14 / distance);
    // Perpendicular bulge of a quadratic arc between the two points.
    const bulge = strength * distance * 0.5 * (delta > 0 ? -1 : 1);
    const cx = bulge * 2, cy = (fromY + toY) / 2;     // control point (peak of the curve = bulge)
    const t0 = performance.now(), dur = 250;
    cancelAnimationFrame(raf);
    const step = (now) => {
      const t = easeOut(Math.min(1, (now - t0) / dur)), u = 1 - t;
      place(2 * u * t * cx, u * u * fromY + 2 * u * t * cy + t * t * toY);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function select(i) {
    if (i === active || !lis[i] || lis[i].classList.contains('bounce-heading')) return;
    active = i;
    mark();
    if (y === null) snap(); else hop(targetY(i));
  }

  mark();
  snap();
  requestAnimationFrame(snap);
  document.fonts && document.fonts.ready.then(snap);
  window.addEventListener('resize', snap);

  return { set: select, get value() { return active; }, snap };
}

/** A jump list for a long form: clicking scrolls to (and opens) a section, and the dot
 *  follows the section being read. `sections`: [{ label, el, open?: true }]. */
export function sectionRail(ul, sections) {
  if (!ul) return null;
  let jumping = 0;
  const motion = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
  const rail = bounceSidebar(ul, {
    items: sections.map((s) => s.label),
    onChange: (i) => {
      const s = sections[i];
      if (s.open && 'open' in s.el) s.el.open = true;
      // Let the dot rest on the clicked item until the page has finished scrolling there.
      clearTimeout(jumping);
      jumping = setTimeout(() => { jumping = 0; }, 400);
      s.el.scrollIntoView({ behavior: motion(), block: 'start' });
    }
  });
  let queued = false;
  const spy = () => {
    queued = false;
    if (jumping || !ul.offsetParent) return;
    // The section whose top has crossed ~40% of the screen is the one being read.
    const line = Math.max(140, window.innerHeight * 0.4);
    const live = sections.filter((s) => s.el.isConnected && !s.el.hidden && !s.el.closest('.hidden-by-search,[hidden]'));
    let current = 0;
    sections.forEach((s, i) => { if (live.includes(s) && s.el.getBoundingClientRect().top <= line) current = i; });
    // At the very bottom a short last section may never reach the line; pick it only if it's really on screen.
    const lastIdx = sections.indexOf(live[live.length - 1]);
    if (lastIdx >= 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4 &&
        sections[lastIdx].el.getBoundingClientRect().top < window.innerHeight * 0.85) current = lastIdx;
    rail.set(current);
  };
  window.addEventListener('scroll', () => {
    if (jumping) { clearTimeout(jumping); jumping = setTimeout(() => { jumping = 0; }, 150); return; }   // still travelling
    if (!queued) { queued = true; requestAnimationFrame(spy); }
  }, { passive: true });
  return rail;
}
