// Cloudflare Pages Functions: /api/kroger/* handler
// Mirrors capabilities of netlify/functions/kroger.js

const json = (status, data, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });

const normalizeScope = (raw) =>
  (raw || 'product.compact')
    .trim()
    .split(/\s+/)
    .map((tok) => tok.replace(/campact/g, 'compact'))
    .join(' ');

/** Compute subpath after /api/kroger */
const subpathFrom = (url) => {
  const idx = url.pathname.lastIndexOf('/api/kroger');
  return idx >= 0 ? url.pathname.slice(idx + '/api/kroger'.length) || '/' : url.pathname;
};

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const sub = subpathFrom(url);

    // DEBUG: GET /api/kroger/env-check (requires KROGER_DEBUG=true)
    if (sub === '/env-check' && method === 'GET') {
      if (env.KROGER_DEBUG !== 'true') return json(404, { error: 'Not found' });
      const id = env.KROGER_CLIENT_ID || env.VITE_KROGER_CLIENT_ID;
      const secret = env.KROGER_CLIENT_SECRET || env.VITE_KROGER_CLIENT_SECRET;
      const scopeRaw = env.KROGER_SCOPE || 'product.compact';
      const scope = normalizeScope(scopeRaw);
      const mask = (val) => {
        if (!val) return null;
        const s = String(val);
        if (s.length <= 8) return s[0] + '***' + s[s.length - 1];
        return s.slice(0, 4) + '***' + s.slice(-4);
      };
      return json(200, {
        hasId: !!id,
        hasSecret: !!secret,
        idPreview: mask(id),
        secretPreview: mask(secret),
        scopeRaw,
        scopeEffective: scope,
        usingViteVars: !!(env.VITE_KROGER_CLIENT_ID || env.VITE_KROGER_CLIENT_SECRET),
      });
    }

    // TOKEN: POST|GET /api/kroger/token
    if (sub === '/token' && (method === 'POST' || method === 'GET')) {
      const id = env.KROGER_CLIENT_ID || env.VITE_KROGER_CLIENT_ID;
      const secret = env.KROGER_CLIENT_SECRET || env.VITE_KROGER_CLIENT_SECRET;
      const scope = normalizeScope(env.KROGER_SCOPE);
      if (!id || !secret) return json(500, { error: 'Missing KROGER_CLIENT_ID / KROGER_CLIENT_SECRET on server' });

      const basic = btoa(`${id}:${secret}`);
      const body = new URLSearchParams({ grant_type: 'client_credentials', scope }).toString();
      const resp = await fetch('https://api.kroger.com/v1/connect/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'Authorization': `Basic ${basic}`,
        },
        body,
      });
      const raw = await resp.text();
      let data; try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: 'non_json_response', raw }; }
      return json(resp.status, data);
    }

    // Bearer from header or query
    const auth = request.headers.get('Authorization') || '';
    const bearer = auth.replace(/^Bearer\s+/i, '') || url.searchParams.get('token');
    if (!bearer && sub !== '/' && sub !== '/token') {
      return json(401, { error: 'Missing Authorization: Bearer <token>' });
    }

    // LOCATIONS: GET /api/kroger/locations
    if (sub === '/locations' && method === 'GET') {
      const qs = url.searchParams;
      const target = new URL('https://api.kroger.com/v1/locations');
      const lat = qs.get('lat') ?? qs.get('latitude');
      const lon = qs.get('lon') ?? qs.get('longitude');
      const radius = qs.get('radius') ?? qs.get('filter.radiusInMiles');
      const limit = qs.get('limit') ?? qs.get('filter.limit');
      const chain = qs.get('chain') ?? qs.get('filter.chain');
      if (lat != null && lon != null) target.searchParams.set('filter.latLong.near', `${lat},${lon}`);
      if (radius != null) target.searchParams.set('filter.radiusInMiles', String(radius));
      if (limit != null) target.searchParams.set('filter.limit', String(limit));
      if (chain) target.searchParams.set('filter.chain', String(chain));
      for (const [k, v] of qs.entries()) if (k.startsWith('filter.') && v != null) target.searchParams.set(k, v);
      const resp = await fetch(target, { headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' } });
      const raw = await resp.text();
      let data; try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: 'non_json_response', raw }; }
      return json(resp.status, data);
    }

    // PRODUCTS: GET /api/kroger/products
    if (sub === '/products' && method === 'GET') {
      const qs = url.searchParams;
      const target = new URL('https://api.kroger.com/v1/products');
      const term = qs.get('term') ?? qs.get('filter.term');
      const locationId = qs.get('locationId') ?? qs.get('filter.locationId');
      const limit = qs.get('limit') ?? qs.get('filter.limit') ?? '10';
      if (term) target.searchParams.set('filter.term', term);
      if (locationId) target.searchParams.set('filter.locationId', locationId);
      target.searchParams.set('filter.limit', String(limit));
      const resp = await fetch(target, { headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' } });
      const raw = await resp.text();
      let data; try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: 'non_json_response', raw }; }
      return json(resp.status, data);
    }

    // BATCH SEARCH: POST /api/kroger/batch-search
    if (sub === '/batch-search' && method === 'POST') {
      const payload = await request.json().catch(() => ({}));
      const { terms = [], locationId } = payload;
      const perReqTimeoutMs = Number(env.KROGER_REQ_TIMEOUT_MS) || 2500;
      const deadlineMs = Number(env.KROGER_BATCH_DEADLINE_MS) || 6500;
      const concurrency = Math.max(1, Math.min(5, Number(env.KROGER_BATCH_CONCURRENCY) || 3));
      const started = Date.now();
      const cleaned = Array.from(new Set((terms || []).map((t) => (t || '').toString().trim()).filter((t) => t.length > 1)));

      const shapeProduct = (product) => {
        if (!product) return null;
        const firstItem = product.items?.[0] || {};
        const price = firstItem?.price?.regular || 0;
        const promoPrice = firstItem?.price?.promo || null;
        const aisleLoc = firstItem?.aisleLocations?.[0] || null;
        const aisleParts = [];
        if (aisleLoc?.number) aisleParts.push(`Aisle ${aisleLoc.number}`);
        if (aisleLoc?.description) aisleParts.push(aisleLoc.description);
        if (aisleLoc?.bayNumber) aisleParts.push(`Bay ${aisleLoc.bayNumber}`);
        const aisleText = aisleParts.length ? aisleParts.join(' • ') : null;
        return {
          productId: product.productId,
          description: product.description,
          brand: product.brand,
          price: promoPrice || price,
          regularPrice: price,
          onSale: !!promoPrice,
          size: firstItem?.size || '',
          image: product.images?.[0]?.sizes?.[0]?.url || null,
          upc: product.upc,
          aisle: aisleText,
          aisleRaw: aisleLoc || null,
          categories: product.categories || [],
        };
      };

      const fetchOne = async (term) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), perReqTimeoutMs);
        try {
          const target = new URL('https://api.kroger.com/v1/products');
          target.searchParams.set('filter.term', term);
          if (locationId) target.searchParams.set('filter.locationId', locationId);
          target.searchParams.set('filter.limit', '1');
          const resp = await fetch(target, { headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' }, signal: controller.signal });
          const raw = await resp.text();
          let data; try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: 'non_json_response', raw }; }
          const top = data?.data?.[0] || null;
          return { ingredient: term, product: shapeProduct(top), status: resp.status };
        } catch (err) {
          return { ingredient: term, product: null, status: 504, error: 'timeout_or_fetch_error', message: String(err) };
        } finally { clearTimeout(timer); }
      };

      const out = [];
      let i = 0, active = 0;
      const result = await new Promise((resolve) => {
        const maybeNext = () => {
          if (Date.now() - started > deadlineMs) return resolve(out);
          while (active < concurrency && i < cleaned.length) {
            const term = cleaned[i++];
            active++;
            fetchOne(term)
              .then((res) => out.push(res))
              .catch((e) => out.push({ ingredient: term, product: null, status: 500, error: 'worker_error', message: String(e) }))
              .finally(() => {
                active--;
                if (out.length === cleaned.length || (i >= cleaned.length && active === 0)) resolve(out); else maybeNext();
              });
          }
        };
        maybeNext();
      });
      return json(200, result);
    }

    return json(404, { error: 'Not found', path: sub });
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
}
