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

    // ----- TOKEN: POST /api/kroger/token -----
    if (sub === '/token' && method === 'POST') {
      const id = process.env.KROGER_CLIENT_ID || process.env.VITE_KROGER_CLIENT_ID;
      const secret = process.env.KROGER_CLIENT_SECRET || process.env.VITE_KROGER_CLIENT_SECRET;
      const scope = process.env.KROGER_SCOPE || 'product.compact';

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
      const { terms = [], locationId, limit = 5 } = payload;

      const results = [];
      for (const term of terms) {
        const url = new URL('https://api.kroger.com/v1/products');
        url.searchParams.set('filter.term', term);
        if (locationId) url.searchParams.set('filter.locationId', locationId);
        url.searchParams.set('filter.limit', String(limit));
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' } });
        const raw = await resp.text();
        let data; try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: 'non_json_response', raw }; }
        results.push({ term, status: resp.status, data });
      }
      return respond(200, results);
    }

    // Unknown route
    return respond(404, { error: 'Not found', path: sub });
  } catch (e) {
    return respond(500, { error: e.message });
  }
}
