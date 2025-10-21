// (Removed) Node.js proxy server for Kroger API - not used in GitHub Pages deployment
// This avoids CORS issues by making API calls server-side

import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
function loadEnv() {
  try {
    const envPath = join(__dirname, '.env');
    const envFile = readFileSync(envPath, 'utf8');
    
    envFile.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...values] = trimmed.split('=');
        let value = values.join('=').trim();
        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (key && value) {
          process.env[key.trim()] = value;
        }
      }
    });
    console.log('✓ Environment variables loaded from .env');
  } catch (error) {
    console.warn('⚠ Could not load .env file:', error.message);
    console.log('Set KROGER_CLIENT_ID and KROGER_CLIENT_SECRET manually');
  }
}

loadEnv();

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for your frontend (allow multiple ports for flexibility)
app.use(cors({
  origin: [
    'http://localhost:5173', 
    'http://localhost:5174', 
    'http://localhost:5175', 
    'http://localhost:5176', 
    'http://localhost:5177', 
    'http://localhost:5178', 
    'http://localhost:5179',
    'https://cyberdataint.github.io'
  ],
  credentials: true
}));

app.use(express.json());

// Store access token in memory
// Cache tokens per scope to avoid scope mismatches between APIs
const tokenCache = new Map(); // scope => { accessToken, tokenExpiry }
const tokenPromiseCache = new Map(); // scope => Promise

// Kroger credentials from environment variables
const KROGER_CLIENT_ID = process.env.KROGER_CLIENT_ID || process.env.VITE_KROGER_CLIENT_ID;
const KROGER_CLIENT_SECRET = process.env.KROGER_CLIENT_SECRET || process.env.VITE_KROGER_CLIENT_SECRET;

// Get OAuth token
async function getAccessToken(requiredScope = 'product.compact') {
  const cached = tokenCache.get(requiredScope);
  if (cached && cached.accessToken && cached.tokenExpiry && Date.now() < cached.tokenExpiry) {
    return cached.accessToken;
  }

  // If a token request is already in-flight for this scope, await it
  const inflight = tokenPromiseCache.get(requiredScope);
  if (inflight) {
    return inflight;
  }

  try {
    const delay = (ms) => new Promise(r => setTimeout(r, ms));
    const credentials = Buffer.from(`${KROGER_CLIENT_ID}:${KROGER_CLIENT_SECRET}`).toString('base64');
    const requestToken = async (scope) => {
      const mode = (process.env.KROGER_HEADERS_MODE || 'minimal').toLowerCase();
      const common = {
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        'Authorization': `Basic ${credentials}`,
        'Accept': 'application/json',
      };
      const browsery = {
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Origin': 'https://www.kroger.com',
        'Referer': 'https://www.kroger.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      };
      const headers = mode === 'browser' ? { ...common, ...browsery } : common;
      return fetch('https://api.kroger.com/v1/connect/oauth2/token', {
        method: 'POST',
        headers,
        body: `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`
      });
    };

    // Request token for the required scope only
    // Always use product.compact; some accounts are not provisioned for other scopes
    // Retry up to 5 times with exponential backoff if Access Denied or transient failures occur
    let response;
    for (let attempt = 1; attempt <= 5; attempt++) {
      const tokenPromise = requestToken('product.compact');
      tokenPromiseCache.set(requiredScope, tokenPromise);
      response = await tokenPromise;
      if (response.ok) break;

      const txt = await response.text();
      console.warn(`Token attempt ${attempt} failed: ${response.status} - ${txt}`);
      tokenPromiseCache.delete(requiredScope);
      if (attempt < 5) {
        const backoff = 400 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 400);
        await delay(backoff);
        continue;
      }
      const err = new Error(`Failed token with scope "product.compact": ${response.status} - ${txt}`);
      console.error(err.message);
      console.error(`Client ID (first 10 chars): ${KROGER_CLIENT_ID?.substring(0, 10)}...`);
      throw err;
    }

    const data = await response.json();
    const accessToken = data.access_token;
    const tokenExpiry = Date.now() + ((data.expires_in - 300) * 1000);
    tokenCache.set('product.compact', { accessToken, tokenExpiry });
    tokenPromiseCache.delete(requiredScope);
    return accessToken;
  } catch (error) {
    tokenPromiseCache.delete(requiredScope);
    console.error('Kroger auth error:', error);
    throw error;
  }
}

// Search products endpoint
app.get('/api/kroger/products', async (req, res) => {
  try {
    const { term, locationId = '01400943', limit = 5 } = req.query;
    
    if (!term) {
      return res.status(400).json({ error: 'Missing search term' });
    }

  const token = await getAccessToken('product.compact');
    const url = new URL('https://api.kroger.com/v1/products');
    url.searchParams.append('filter.term', term);
    if (locationId) {
      url.searchParams.append('filter.locationId', locationId);
    }
    url.searchParams.append('filter.limit', limit);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'close',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Product search failed: ${response.status} - ${text}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: error.message });
  }
});

// Token endpoint (parity with serverless) — supports GET or POST
app.all('/api/kroger/token', async (req, res) => {
  try {
    if (!KROGER_CLIENT_ID || !KROGER_CLIENT_SECRET) {
      return res.status(500).json({ error: 'Missing KROGER_CLIENT_ID / KROGER_CLIENT_SECRET on server' });
    }
    const credentials = Buffer.from(`${KROGER_CLIENT_ID}:${KROGER_CLIENT_SECRET}`).toString('base64');
    const response = await fetch('https://api.kroger.com/v1/connect/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
        'Accept': 'application/json'
      },
      body: 'grant_type=client_credentials&scope=product.compact'
    });
    const text = await response.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { error: 'non_json_response', raw: text }; }
    res.status(response.status).json(data);
  } catch (err) {
    console.error('Token endpoint error:', err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// Locations endpoint - list locations by ZIP (zip or postal)
app.get('/api/kroger/locations', async (req, res) => {
  try {
    const { radius = '15', limit = '50', chain = '' } = req.query;
    const zip = req.query.zip || req.query.postal || req.query['filter.zipCode.near'];
    if (!zip) {
      return res.status(400).json({ error: 'Missing zip. Provide ?zip=#####' });
    }

  const token = await getAccessToken('product.compact');
    const url = new URL('https://api.kroger.com/v1/locations');
    url.searchParams.append('filter.zipCode.near', String(zip));
    url.searchParams.append('filter.radiusInMiles', String(radius));
    url.searchParams.append('filter.limit', String(limit));
    // Optionally filter by chain when provided (e.g., 'Kroger')
    if (chain) {
      url.searchParams.append('filter.chain', chain);
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'close',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Locations fetch failed: ${response.status} ${text}`);
    }

    const data = await response.json();
    // Return raw data — frontend can filter further if needed
    res.json(data);
  } catch (error) {
    console.error('Error fetching locations:', error);
    res.status(500).json({ error: error.message });
  }
});

// Batch search endpoint
app.post('/api/kroger/batch-search', async (req, res) => {
  try {
    const { ingredients, terms, locationId } = req.body;
    const list = Array.isArray(ingredients) ? ingredients : (Array.isArray(terms) ? terms : null);
    
    if (!list) {
      return res.status(400).json({ error: 'Invalid ingredients array' });
    }

    // Obtain token once per batch to avoid hammering token endpoint
    const token = await getAccessToken('product.compact');
    const results = await Promise.allSettled(
  list.map(async (ingredient) => {
        const url = new URL('https://api.kroger.com/v1/products');
        url.searchParams.append('filter.term', ingredient);
  if (locationId) url.searchParams.append('filter.locationId', String(locationId));
        url.searchParams.append('filter.limit', '1');

        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
            'Connection': 'close',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to search for ${ingredient}`);
        }

        const data = await response.json();
        const product = data.data?.[0];
        
        if (!product) {
          return { ingredient, product: null };
        }

        const firstItem = product.items?.[0] || {};
        const price = firstItem?.price?.regular || 0;
        const promoPrice = firstItem?.price?.promo || null;

        // Build aisle text (best-effort)
        const aisleLoc = firstItem?.aisleLocations?.[0] || null;
        const aisleParts = [];
        if (aisleLoc?.number) aisleParts.push(`Aisle ${aisleLoc.number}`);
        if (aisleLoc?.description) aisleParts.push(aisleLoc.description);
        if (aisleLoc?.bayNumber) aisleParts.push(`Bay ${aisleLoc.bayNumber}`);
        const aisleText = aisleParts.length ? aisleParts.join(' • ') : null;

        return {
          ingredient,
          product: {
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
            categories: product.categories || []
          }
        };
      })
    );

    const formattedResults = results.map((result, index) => ({
      ingredient: list[index],
      product: result.status === 'fulfilled' ? result.value.product : null,
      error: result.status === 'rejected' ? result.reason.message : null
    }));

    res.json(formattedResults);
  } catch (error) {
    console.error('Error in batch search:', error);
    res.status(500).json({ error: error.message });
  }
});

const server = app.listen(PORT, () => {
  // (Removed) Proxy server startup log
  console.log(`\nCredentials status:`);
  console.log(`  Client ID: ${KROGER_CLIENT_ID ? '✓ Loaded' : '✗ Missing'}`);
  console.log(`  Client Secret: ${KROGER_CLIENT_SECRET ? '✓ Loaded' : '✗ Missing'}`);
  
  if (!KROGER_CLIENT_ID || !KROGER_CLIENT_SECRET) {
    console.log(`\n⚠ Missing credentials! Add to .env file:`);
    console.log(`  VITE_KROGER_CLIENT_ID=your_client_id`);
    console.log(`  VITE_KROGER_CLIENT_SECRET=your_client_secret\n`);
  } else {
    console.log(`\n✓ Ready to handle requests\n`);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use!`);
    console.log(`\nTo fix this, either:`);
    console.log(`  1. Stop the other process using port ${PORT}`);
  // (Removed) Proxy server port instructions
    process.exit(1);
  } else {
    throw err;
  }
});
