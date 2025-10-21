// netlify/functions/kroger.js
import fetch from "node-fetch";

export async function handler(event) {
  try {
    const { path, httpMethod, queryStringParameters, headers, body } = event;

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

      if (term) url.searchParams.set("filter.term", term);
      if (locationId) url.searchParams.set("filter.locationId", locationId);
      url.searchParams.set("filter.limit", limit);

      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await resp.json();
      return { statusCode: resp.status, body: JSON.stringify(data) };
    }

    // ----- Locations (optional) -----
    if (path.includes("/locations") && httpMethod === "GET") {
      const token = headers.authorization?.replace("Bearer ", "") || queryStringParameters?.token;
      if (!token) return json(401, { error: "Missing Authorization: Bearer <token>" });

      const url = new URL("https://api.kroger.com/v1/locations");
      for (const [k, v] of Object.entries(queryStringParameters || {})) {
        url.searchParams.set(k, v);
      }
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await resp.json();
      return { statusCode: resp.status, body: JSON.stringify(data) };
    }

    return json(404, { error: "Not found" });
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}
