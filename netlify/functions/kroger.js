// netlify/functions/kroger.js
// Node 18+ has global fetch on Netlify – no import needed.

function json(status, data, extraHeaders = {}) {
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
    const sub = subpathFrom(event); // e.g. "/products", "/token", "/batch-search"
    const method = event.httpMethod;

    // ----- TOKEN: POST /api/kroger/token -----
    if (sub === '/token' && method === 'POST') {
      const id = process.env.KROGER_CLIENT_ID;
      const secret = process.env.KROGER_CLIENT_SECRET;
      if (!id || !secret) {
        return json(500, { error: 'Missing KROGER_CLIENT_ID / KROGER_CLIENT_SECRET on server' });
      }
      const auth = Buffer.from(`${id}:${secret}`).toString('base64');
      const resp = await fetch('https://api.kroger.com/v1/connect/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${auth}`,
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope: 'product.compact', // adjust if you need other scopes
        }).toString(),
      });
      const data = await resp.json();
      return json(resp.status, data, { 'Cache-Control': 'no-store' });
    }

    // Helper: get Bearer token from header or query (dev)
    const bearer =
      event.headers.authorization?.replace(/^Bearer\s+/i, '') ||
      event.queryStringParameters?.token;

    if (!bearer && sub !== '/' && sub !== '/token') {
      return json(401, { error: 'Missing Authorization: Bearer <token>' });
    }

    // ----- LOCATIONS: GET /api/kroger/locations?filter.zipCode.near=...&filter.limit=... -----
    if (sub === '/locations' && method === 'GET') {
      const url = new URL('https://api.kroger.com/v1/locations');
      for (const [k, v] of Object.entries(event.queryStringParameters || {})) {
        if (v != null) url.searchParams.set(k, v);
      }
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
      const data = await resp.json();
      return json(resp.status, data);
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
      url.searchParams.set('filter.limit', limit);

      const resp = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
      const data = await resp.json();
      return json(resp.status, data);
    }

    // ----- BATCH SEARCH: POST /api/kroger/batch-search
    // Body: { terms: ["milk","eggs"], locationId: "xxxxx", limit: 10 }
    if (sub === '/batch-search' && method === 'POST') {
      const body = event.body ? JSON.parse(event.body) : {};
      const { terms = [], locationId, limit = 5 } = body;

      if (!Array.isArray(terms) || !terms.length || !locationId) {
        return json(400, { error: 'terms[] and locationId required' });
      }

      const results = [];
      for (const t of terms) {
        const url = new URL('https://api.kroger.com/v1/products');
        url.searchParams.set('filter.term', t);
        url.searchParams.set('filter.locationId', locationId);
        url.searchParams.set('filter.limit', String(limit));

        const resp = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
        const data = await resp.json();
        results.push({ term: t, status: resp.status, data });
      }
      return json(200, { results });
    }

    // ----- (optional) PRICES per item — add if your UI calls it -----
    // Example: GET /api/kroger/prices?productId=xxx&locationId=yyy
    if (sub === '/prices' && method === 'GET') {
      const { productId, locationId } = event.queryStringParameters || {};
      if (!productId || !locationId) return json(400, { error: 'productId and locationId required' });

      // NOTE: Some accounts need specific scopes for explicit pricing.
      // Many apps rely on price fields already present on /products items.
      const url = new URL(`https://api.kroger.com/v1/products/${encodeURIComponent(productId)}`);
      url.searchParams.set('filter.locationId', locationId);
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
      const data = await resp.json();
      return json(resp.status, data);
    }

    // Unknown route
    return json(404, { error: 'Not found', path: sub });
  } catch (e) {
    return json(500, { error: e.message });
  }
}
