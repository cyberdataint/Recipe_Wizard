// netlify/functions/kroger.js
import fetch from "node-fetch";

export async function handler(event) {
  try {
    const { path, httpMethod, queryStringParameters, headers, body } = event;

<<<<<<< Updated upstream
    // Helper: JSON response
    const json = (status, data) => ({ statusCode: status, body: JSON.stringify(data) });

    // ----- OAuth token (client credentials) -----
    if (path.endsWith("/token") && httpMethod === "POST") {
      const id = process.env.KROGER_CLIENT_ID;
      const secret = process.env.KROGER_CLIENT_SECRET;
      if (!id || !secret) return json(500, { error: "Missing server env KROGER_CLIENT_ID/SECRET" });

      const auth = Buffer.from(`${id}:${secret}`).toString("base64");
      const resp = await fetch("https://api.kroger.com/v1/connect/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${auth}`,
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          scope: "product.compact",
        }).toString(),
      });
      const data = await resp.json();
      return { statusCode: resp.status, body: JSON.stringify(data) };
=======
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

    // ----- Products search -----
    if (path.includes("/products") && httpMethod === "GET") {
      const token = headers.authorization?.replace("Bearer ", "") || queryStringParameters?.token;
      if (!token) return json(401, { error: "Missing Authorization: Bearer <token>" });

      const url = new URL("https://api.kroger.com/v1/products");
      // Accept both your client parameter names and Kroger's expected names
      const term = queryStringParameters.term || queryStringParameters["filter.term"];
      const locationId = queryStringParameters.locationId || queryStringParameters["filter.locationId"];
      const limit = queryStringParameters.limit || queryStringParameters["filter.limit"] || "10";

<<<<<<< Updated upstream
      if (term) url.searchParams.set("filter.term", term);
      if (locationId) url.searchParams.set("filter.locationId", locationId);
      url.searchParams.set("filter.limit", limit);

      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await resp.json();
      return { statusCode: resp.status, body: JSON.stringify(data) };
=======
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
>>>>>>> Stashed changes
    }

    // ----- Locations (optional) -----
    if (path.includes("/locations") && httpMethod === "GET") {
      const token = headers.authorization?.replace("Bearer ", "") || queryStringParameters?.token;
      if (!token) return json(401, { error: "Missing Authorization: Bearer <token>" });

<<<<<<< Updated upstream
      const url = new URL("https://api.kroger.com/v1/locations");
      for (const [k, v] of Object.entries(queryStringParameters || {})) {
        url.searchParams.set(k, v);
      }
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await resp.json();
      return { statusCode: resp.status, body: JSON.stringify(data) };
=======
      // Accept friendly names and map to Kroger’s expected keys
      const term = qs.term ?? qs['filter.term'];
      const locationId = qs.locationId ?? qs['filter.locationId'];
      const limit = qs.limit ?? qs['filter.limit'] ?? '10';

      if (term) url.searchParams.set('filter.term', term);
      if (locationId) url.searchParams.set('filter.locationId', locationId);
      url.searchParams.set('filter.limit', limit);

      const resp = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
      const raw = await resp.text();
      let data;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (e) {
        data = { error: 'products_response_non_json', raw };
      }
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

    return json(404, { error: "Not found" });
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}
