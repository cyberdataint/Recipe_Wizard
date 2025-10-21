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
    const { path, httpMethod, queryStringParameters, headers, body } = event;

    // Helper: JSON response
    const json = (status, data) => ({ statusCode: status, body: JSON.stringify(data) });

    // ----- TOKEN: POST /api/kroger/token -----
    if (sub === '/token' && method === 'POST') {
      // Support a few common env var names to tolerate misnaming
      const id = process.env.KROGER_CLIENT_ID || process.env.VITE_KROGER_CLIENT_ID || process.env.KROGER_ID || process.env.KROGER_CLIENT;
      const secret = process.env.KROGER_CLIENT_SECRET || process.env.VITE_KROGER_CLIENT_SECRET || process.env.KROGER_SECRET || process.env.KROGER_CLIENT_SECRET_KEY;
      const scope = process.env.KROGER_SCOPE || 'product.compact';
      if (!id || !secret) {
        return json(500, { error: 'Missing KROGER_CLIENT_ID / KROGER_CLIENT_SECRET on server' });
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
<<<<<<< Updated upstream
      const data = await resp.json();
      return { statusCode: resp.status, body: JSON.stringify(data) };
=======
      // Try to parse JSON, but fall back to text so callers see real error details
      const raw = await resp.text();
      let data;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (e) {
        data = { error: 'token_response_non_json', raw };
      }
      return json(resp.status, data, { 'Cache-Control': 'no-store' });
>>>>>>> Stashed changes
    }

    // Helper: get Bearer token from header or query (dev)
    const bearer =
      event.headers.authorization?.replace(/^Bearer\s+/i, '') ||
      event.queryStringParameters?.token;

    if (!bearer && sub !== '/' && sub !== '/token') {
      return json(401, { error: 'Missing Authorization: Bearer <token>' });
    }

    // ----- LOCATIONS: GET /api/kroger/locations -----
    // Accepts either Kroger filter.* params or friendly keys: lat, lon, radius, limit, chain
    if (sub === '/locations' && method === 'GET') {
      const url = new URL('https://api.kroger.com/v1/locations');
      const qs = event.queryStringParameters || {};
      // Pass through any provided filter.* params
      for (const [k, v] of Object.entries(qs)) {
        if (v != null && k.startsWith('filter.')) url.searchParams.set(k, v);
      }
      // Map friendly params if present
      const lat = qs.lat ?? qs.latitude;
      const lon = qs.lon ?? qs.longitude;
      if (lat != null && lon != null) {
        url.searchParams.set('filter.latLong.near', `${lat},${lon}`);
      }
      if (qs.radius != null) url.searchParams.set('filter.radiusInMiles', String(qs.radius));
      if (qs.limit != null) url.searchParams.set('filter.limit', String(qs.limit));
      if (qs.chain != null) url.searchParams.set('filter.chain', qs.chain);
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
      const raw = await resp.text();
      let data;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (e) {
        data = { error: 'locations_response_non_json', raw };
      }
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

      if (term) url.searchParams.set("filter.term", term);
      if (locationId) url.searchParams.set("filter.locationId", locationId);
      url.searchParams.set("filter.limit", limit);

      const resp = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
<<<<<<< Updated upstream
      const data = await resp.json();
      return { statusCode: resp.status, body: JSON.stringify(data) };
=======
      const raw = await resp.text();
      let data;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (e) {
        data = { error: 'products_response_non_json', raw };
      }
      return json(resp.status, data);
>>>>>>> Stashed changes
    }

    // ----- Locations (optional) -----
    if (path.includes("/locations") && httpMethod === "GET") {
      const token = headers.authorization?.replace("Bearer ", "") || queryStringParameters?.token;
      if (!token) return json(401, { error: "Missing Authorization: Bearer <token>" });

      const url = new URL("https://api.kroger.com/v1/locations");
      for (const [k, v] of Object.entries(queryStringParameters || {})) {
        url.searchParams.set(k, v);
      }
<<<<<<< Updated upstream
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await resp.json();
      return { statusCode: resp.status, body: JSON.stringify(data) };
=======

      const results = [];
      for (const t of terms) {
        const url = new URL('https://api.kroger.com/v1/products');
        url.searchParams.set('filter.term', t);
        url.searchParams.set('filter.locationId', locationId);
        url.searchParams.set('filter.limit', String(limit));

        const resp = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
        const raw = await resp.text();
        let data;
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch (e) {
          data = { error: 'products_response_non_json', raw };
        }
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
      const raw = await resp.text();
      let data;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (e) {
        data = { error: 'product_detail_response_non_json', raw };
      }
      return json(resp.status, data);
>>>>>>> Stashed changes
    }

    // Unknown route
    return json(404, { error: 'Not found', path: sub });
  } catch (e) {
    return json(500, { error: e.message });
  }
}
