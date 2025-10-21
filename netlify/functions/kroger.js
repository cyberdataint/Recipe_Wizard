// netlify/functions/kroger.js
// Node 18+ has global fetch on Netlify – no import needed.

function respond(status, data, extraHeaders = {}) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(data),
  };
}

function normalizeScope(raw) {
  const s = (raw || 'product.compact').trim();
  // Fix common typo and allow space-separated scopes
  return s
    .split(/\s+/)
    .map(tok => tok.replace(/campact/g, 'compact'))
    .join(' ');
}

// Extract the part after "/kroger", e.g. "/products"
function subpathFrom(event) {
  // Examples:
  // event.path = "/.netlify/functions/kroger/products"
  // or via redirect "/api/kroger/products"
  const idx = event.path.lastIndexOf('/kroger');
  return idx >= 0 ? event.path.slice(idx + '/kroger'.length) || '/' : event.path;
}

export async function handler(event) {
  try {
    const method = event.httpMethod;
    const sub = subpathFrom(event);

    // ----- DEBUG: GET /api/kroger/env-check (only when KROGER_DEBUG=true) -----
    if (sub === '/env-check' && method === 'GET') {
      if (process.env.KROGER_DEBUG !== 'true') return respond(404, { error: 'Not found' });
      const id = process.env.KROGER_CLIENT_ID || process.env.VITE_KROGER_CLIENT_ID;
      const secret = process.env.KROGER_CLIENT_SECRET || process.env.VITE_KROGER_CLIENT_SECRET;
      const scopeRaw = process.env.KROGER_SCOPE || 'product.compact';
      const scope = normalizeScope(scopeRaw);

      const mask = (val) => {
        if (!val) return null;
        const s = String(val);
        if (s.length <= 8) return s[0] + '***' + s[s.length - 1];
        return s.slice(0, 4) + '***' + s.slice(-4);
      };

      return respond(200, {
        hasId: !!id,
        hasSecret: !!secret,
        idPreview: mask(id),
        secretPreview: mask(secret),
        scopeRaw,
        scopeEffective: scope,
        usingViteVars: !!(process.env.VITE_KROGER_CLIENT_ID || process.env.VITE_KROGER_CLIENT_SECRET),
      });
    }

    // ----- TOKEN: POST|GET /api/kroger/token -----
    if (sub === '/token' && (method === 'POST' || method === 'GET')) {
      const id = process.env.KROGER_CLIENT_ID || process.env.VITE_KROGER_CLIENT_ID;
      const secret = process.env.KROGER_CLIENT_SECRET || process.env.VITE_KROGER_CLIENT_SECRET;
      const scope = normalizeScope(process.env.KROGER_SCOPE);

      if (!id || !secret) {
        return respond(500, { error: 'Missing KROGER_CLIENT_ID / KROGER_CLIENT_SECRET on server' });
      }
      const auth = Buffer.from(`${id}:${secret}`).toString('base64');
      const resp = await fetch('https://api.kroger.com/v1/connect/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'Authorization': `Basic ${auth}`,
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope,
        }).toString(),
      });
      const raw = await resp.text();
      let data;
      try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: 'non_json_response', raw }; }
      return respond(resp.status, data);
    }

    // Helper: get Bearer token from header or query (dev)
    const bearer =
      event.headers?.authorization?.replace(/^Bearer\s+/i, '') ||
      event.queryStringParameters?.token;

    if (!bearer && sub !== '/' && sub !== '/token') {
      return respond(401, { error: 'Missing Authorization: Bearer <token>' });
    }

    // ----- LOCATIONS: GET /api/kroger/locations?lat=..&lon=..&radius=..&limit=..&chain=.. -----
    if (sub === '/locations' && method === 'GET') {
      const qs = event.queryStringParameters || {};
      const url = new URL('https://api.kroger.com/v1/locations');

      // Friendly params mapping
      const lat = qs.lat ?? qs.latitude;
      const lon = qs.lon ?? qs.longitude;
      const radius = qs.radius ?? qs['filter.radiusInMiles'];
      const limit = qs.limit ?? qs['filter.limit'];
      const chain = qs.chain ?? qs['filter.chain'];

      if (lat != null && lon != null) url.searchParams.set('filter.latLong.near', `${lat},${lon}`);
      if (radius != null) url.searchParams.set('filter.radiusInMiles', String(radius));
      if (limit != null) url.searchParams.set('filter.limit', String(limit));
      if (chain) url.searchParams.set('filter.chain', String(chain));

      // Pass through any filter.* params directly as well
      for (const [k, v] of Object.entries(qs)) {
        if (k.startsWith('filter.') && v != null) url.searchParams.set(k, v);
      }

      const resp = await fetch(url, { headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' } });
      const raw = await resp.text();
      let data; try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: 'non_json_response', raw }; }
      return respond(resp.status, data);
    }

    // ----- PRODUCTS: GET /api/kroger/products?term=milk&locationId=xxxxx&limit=10 -----
    if (sub === '/products' && method === 'GET') {
      const qs = event.queryStringParameters || {};
      const url = new URL('https://api.kroger.com/v1/products');

      // Accept friendly names and map to Kroger’s expected keys
      const term = qs.term ?? qs['filter.term'];
      const locationId = qs.locationId ?? qs['filter.locationId'];
      const limit = qs.limit ?? qs['filter.limit'] ?? '10';

      if (term) url.searchParams.set('filter.term', term);
      if (locationId) url.searchParams.set('filter.locationId', locationId);
      url.searchParams.set('filter.limit', String(limit));

      const resp = await fetch(url, { headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' } });
      const raw = await resp.text();
      let data; try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: 'non_json_response', raw }; }
      return respond(resp.status, data);
    }

    // ----- BATCH SEARCH: POST /api/kroger/batch-search -----
    if (sub === '/batch-search' && method === 'POST') {
      const payload = event.body ? JSON.parse(event.body) : {};
      const { terms = [], locationId } = payload;

      // Limits to keep function under Netlify timeouts
      const perReqTimeoutMs = Number(process.env.KROGER_REQ_TIMEOUT_MS) || 2500;
      const deadlineMs = Number(process.env.KROGER_BATCH_DEADLINE_MS) || 6500;
      const concurrency = Math.max(1, Math.min(5, Number(process.env.KROGER_BATCH_CONCURRENCY) || 3));
      const started = Date.now();

      // Sanitize and dedupe terms
      const cleaned = Array.from(new Set(
        (terms || [])
          .map(t => (t || '').toString().trim())
          .filter(t => t.length > 1)
      ));

      // Helper to shape a single best-match product
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

      // Worker to fetch one term with timeout
      const fetchOne = async (term) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), perReqTimeoutMs);
        try {
          const url = new URL('https://api.kroger.com/v1/products');
          url.searchParams.set('filter.term', term);
          if (locationId) url.searchParams.set('filter.locationId', locationId);
          url.searchParams.set('filter.limit', '1');
          const resp = await fetch(url, { headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' }, signal: controller.signal });
          const raw = await resp.text();
          let data; try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: 'non_json_response', raw }; }
          const top = data?.data?.[0] || null;
          return { ingredient: term, product: shapeProduct(top), status: resp.status };
        } catch (err) {
          return { ingredient: term, product: null, status: 504, error: 'timeout_or_fetch_error', message: String(err) };
        } finally {
          clearTimeout(timer);
        }
      };

      // Concurrency pool with global deadline
      const out = [];
      let i = 0;
      let active = 0;
      return await new Promise((resolve) => {
        const maybeNext = () => {
          // Deadline reached: resolve with what we have
          if (Date.now() - started > deadlineMs) return resolve(respond(200, out));
          while (active < concurrency && i < cleaned.length) {
            const term = cleaned[i++];
            active++;
            fetchOne(term).then((res) => out.push(res)).catch((e) => out.push({ ingredient: term, product: null, status: 500, error: 'worker_error', message: String(e) }))
              .finally(() => {
                active--;
                if (out.length === cleaned.length || (i >= cleaned.length && active === 0)) {
                  resolve(respond(200, out));
                } else {
                  maybeNext();
                }
              });
          }
        };
        maybeNext();
      });
    }

    // Unknown route
    return respond(404, { error: 'Not found', path: sub });
  } catch (e) {
    return respond(500, { error: e.message });
  }
}
