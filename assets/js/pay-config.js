/* Payments configuration.
   Only the Supabase project URL and the PUBLIC (publishable/anon) key belong here.
   Never put a service-role key in browser code. */
export const SUPABASE = {
  url: 'https://xjqcurdcgxejhqixfdwz.supabase.co',
  anonKey: 'sb_publishable_42TU_PW4sXbjIHN7x-S2aA_XzIX2Izr'
};

/* Where UPI payments go. Check the ID before sharing links if the receiving account changes. */
export const UPI = { id: 'prakashbharathi0017@oksbi', name: 'Lifora' };

/* Quick fills on the "new payment link" form. Edit freely. */
export const PRESETS = [
  { label: '1-month program', purpose: 'Lifora program, 1 month', amount: 8000 },
  { label: '3-month program', purpose: 'Lifora program, 3 months', amount: 25000 }
];

let client = null;
export async function db() {
  if (client) return client;
  const { loadScript } = await import('./common.js');
  await loadScript(new URL('../../vendor/supabase-2.58.0.min.js', import.meta.url).href);
  // Sign-in lasts only while this browser tab is open: closing it signs the person out,
  // so the login is asked again next time. (Browsers can still save and fill in the password.)
  try { Object.keys(localStorage).filter((k) => /^sb-.*-auth-token$/.test(k)).forEach((k) => localStorage.removeItem(k)); } catch {}
  client = window.supabase.createClient(SUPABASE.url, SUPABASE.anonKey, {
    auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true }
  });
  return client;
}

export const money = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: Number(n) % 1 ? 2 : 0 }).format(Number(n));

export function upiUri(r) {
  const p = new URLSearchParams({
    pa: UPI.id, pn: UPI.name, am: Number(r.amount).toFixed(2), cu: 'INR', tn: 'Lifora ' + r.id.slice(0, 8)
  });
  return 'upi://pay?' + p.toString().replace(/\+/g, '%20').replace(/%40/g, '@');
}

export function checkoutLink(id) {
  return new URL('/pay/?id=' + id, location.origin).href;
}
