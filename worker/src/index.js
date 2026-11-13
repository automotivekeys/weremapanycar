// We Remap Any Car: vehicle lookup API (Cloudflare Worker)
// Keeps the DVLA key and MyChip token secret. The website calls:
//   POST /api/reg       body {"reg":"AB12CDE"}  -> DVLA vehicle details
//   GET  /api/engines?make=&fuel=&cc=&year=     -> matching engines with stock and tuned figures
// Secrets (set in Cloudflare, never in code):  DVLA_KEY, MYCHIP_TOKEN
// Optional variable: ALLOWED_ORIGINS (comma-separated website addresses)

const DVLA_URL = 'https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles';
const MYCHIP_BASE = 'https://files.mychiptuningfiles.com/api';

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const origin = req.headers.get('origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || 'https://weremapanycar.com,https://www.weremapanycar.com,https://automotivekeys.github.io')
      .split(',').map(s => s.trim());
    const cors = {
      'access-control-allow-origin': allowed.includes(origin) ? origin : allowed[0],
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'vary': 'origin'
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const json = (data, status = 200, extra = {}) =>
      new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...cors, ...extra } });

    try {
      if (url.pathname === '/api/reg' && req.method === 'POST') {
        const { reg } = await req.json().catch(() => ({}));
        const clean = String(reg || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (clean.length < 2 || clean.length > 8) return json({ error: 'invalid' }, 400);
        const r = await fetch(DVLA_URL, {
          method: 'POST',
          headers: { 'x-api-key': env.DVLA_KEY, 'content-type': 'application/json' },
          body: JSON.stringify({ registrationNumber: clean })
        });
        if (r.status === 404) return json({ error: 'notfound' }, 404);
        if (!r.ok) return json({ error: 'dvla', status: r.status }, 502);
        const d = await r.json();
        // Only pass on what the site needs.
        return json({
          make: d.make, fuelType: d.fuelType, engineCapacity: d.engineCapacity,
          yearOfManufacture: d.yearOfManufacture, colour: d.colour
        });
      }

      if (url.pathname === '/api/engines' && req.method === 'GET') {
        const make = (url.searchParams.get('make') || '').toUpperCase();
        const fuel = (url.searchParams.get('fuel') || '').toUpperCase();
        const cc = +url.searchParams.get('cc') || 0;
        const year = +url.searchParams.get('year') || 0;
        const all = await loadEngines(env, ctx);
        const list = all.filter(e =>
          e.make === make &&
          (!fuel || !e.fuel || e.fuel === fuel) &&
          (!cc || !e.cc || Math.abs(e.cc - cc) <= 40) &&
          (!year || !e.from || (year >= e.from - 1 && year <= (e.to || 9999) + 1))
        ).slice(0, 30);
        return json(list, 200, { 'cache-control': 'public, max-age=3600' });
      }

      return json({ error: 'not found' }, 404);
    } catch (err) {
      return json({ error: 'server' }, 500);
    }
  }
};

// Load the full MyChip vehicle list once and cache it at Cloudflare's edge for a day.
async function loadEngines(env, ctx) {
  const cache = caches.default;
  const key = new Request('https://cache.internal/mychip-engines-v1');
  const hit = await cache.match(key);
  if (hit) return hit.json();
  const r = await fetch(`${MYCHIP_BASE}/types/${env.MYCHIP_TOKEN}/json`);
  if (!r.ok) throw new Error('mychip ' + r.status);
  const raw = await r.json();
  const engines = (Array.isArray(raw) ? raw : raw.data || raw.types || []).map(fromMyChip).filter(Boolean);
  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(engines), { headers: { 'cache-control': 'max-age=86400' } })));
  return engines;
}

// TODO once MyChip's documentation arrives: map their field names to ours.
// The names below are placeholders; adjust them to match their JSON.
function fromMyChip(t) {
  const n = v => (v == null || v === '' ? null : Math.round(+v));
  const hpToBhp = v => (v == null ? null : Math.round(v * 0.986)); // metric hp to bhp
  const make = (t.brand || t.make || '').toUpperCase();
  if (!make) return null;
  return {
    id: String(t.id ?? ''),
    make,
    model: [t.model, t.generation, t.engine || t.type].filter(Boolean).join(' '),
    fuel: (t.fuel || '').toUpperCase().startsWith('D') ? 'DIESEL' : (t.fuel ? 'PETROL' : ''),
    cc: n(t.ccm || t.cc),
    from: n(t.year_from || t.from),
    to: n(t.year_to || t.to),
    bhp: [hpToBhp(n(t.hp_stock)), hpToBhp(n(t.hp_stage1)), hpToBhp(n(t.hp_stage2))],
    nm: [n(t.nm_stock), n(t.nm_stage1), n(t.nm_stage2)]
  };
}
