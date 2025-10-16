// Simple Node.js proxy server for Kroger API
// This avoids CORS issues by making API calls server-side

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
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
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176', 'http://localhost:5177', 'http://localhost:5178', 'http://localhost:5179'],
  credentials: true
}));

app.use(express.json());

// Store access token in memory
let accessToken = null;
let tokenExpiry = null;

// Kroger credentials from environment variables
const KROGER_CLIENT_ID = process.env.KROGER_CLIENT_ID || process.env.VITE_KROGER_CLIENT_ID;
const KROGER_CLIENT_SECRET = process.env.KROGER_CLIENT_SECRET || process.env.VITE_KROGER_CLIENT_SECRET;

// Get OAuth token
async function getAccessToken() {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  try {
    const credentials = Buffer.from(`${KROGER_CLIENT_ID}:${KROGER_CLIENT_SECRET}`).toString('base64');
    const response = await fetch('https://api.kroger.com/v1/connect/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: 'grant_type=client_credentials&scope=product.compact'
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Kroger auth failed (${response.status}):`, errorText);
      console.error(`Client ID (first 10 chars): ${KROGER_CLIENT_ID?.substring(0, 10)}...`);
      throw new Error(`Failed to get access token: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    accessToken = data.access_token;
    tokenExpiry = Date.now() + ((data.expires_in - 300) * 1000);
    return accessToken;
  } catch (error) {
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

    const token = await getAccessToken();
    const url = new URL('https://api.kroger.com/v1/products');
    url.searchParams.append('filter.term', term);
    url.searchParams.append('filter.locationId', locationId);
    url.searchParams.append('filter.limit', limit);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Product search failed: ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: error.message });
  }
});

// Batch search endpoint
app.post('/api/kroger/batch-search', async (req, res) => {
  try {
    const { ingredients } = req.body;
    
    if (!ingredients || !Array.isArray(ingredients)) {
      return res.status(400).json({ error: 'Invalid ingredients array' });
    }

    const results = await Promise.allSettled(
      ingredients.map(async (ingredient) => {
        const token = await getAccessToken();
        const url = new URL('https://api.kroger.com/v1/products');
        url.searchParams.append('filter.term', ingredient);
        url.searchParams.append('filter.locationId', '01400943');
        url.searchParams.append('filter.limit', '1');

        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
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

        const price = product.items?.[0]?.price?.regular || 0;
        const promoPrice = product.items?.[0]?.price?.promo || null;

        return {
          ingredient,
          product: {
            productId: product.productId,
            description: product.description,
            brand: product.brand,
            price: promoPrice || price,
            regularPrice: price,
            onSale: !!promoPrice,
            size: product.items?.[0]?.size || '',
            image: product.images?.[0]?.sizes?.[0]?.url || null,
            upc: product.upc
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
