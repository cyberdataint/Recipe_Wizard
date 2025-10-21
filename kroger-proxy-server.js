// Simple Node.js proxy server for Kroger API
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
    url.searchParams.append('filter.locationId', locationId);
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

// Locations endpoint - list locations near a lat/long
app.get('/api/kroger/locations', async (req, res) => {
  try {
    // Defaults: Oakland County, MI centroid-ish and 50 mile radius
    const {
      lat = '42.660',
      lon = '-83.385',
      radius = '50',
      limit = '200',
      chain = ''
    } = req.query;

  const token = await getAccessToken('product.compact');
    const url = new URL('https://api.kroger.com/v1/locations');
    // Use geospatial filter
    url.searchParams.append('filter.latLong.near', `${lat},${lon}`);
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
    const { ingredients, locationId = '01400943' } = req.body;
    
    if (!ingredients || !Array.isArray(ingredients)) {
      return res.status(400).json({ error: 'Invalid ingredients array' });
    }

    // Obtain token once per batch to avoid hammering token endpoint
    const token = await getAccessToken('product.compact');
    const results = await Promise.allSettled(
      ingredients.map(async (ingredient) => {
        const url = new URL('https://api.kroger.com/v1/products');
        url.searchParams.append('filter.term', ingredient);
        url.searchParams.append('filter.locationId', String(locationId));
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
      ingredient: ingredients[index],
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
  console.log(`\n🚀 Kroger API proxy running on http://localhost:${PORT}`);
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
    console.log(`  2. Run with a different port: PORT=3002 npm run proxy\n`);
    process.exit(1);
  } else {
    throw err;
  }
});
