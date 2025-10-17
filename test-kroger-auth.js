// Test script to verify Kroger API credentials
import fetch from 'node-fetch';
import { readFileSync } from 'fs';

// Load .env file
const envFile = readFileSync('.env', 'utf8');
let CLIENT_ID = '';
let CLIENT_SECRET = '';

envFile.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed.startsWith('VITE_KROGER_CLIENT_ID=')) {
    CLIENT_ID = trimmed.split('=')[1].replace(/['"]/g, '');
  }
  if (trimmed.startsWith('VITE_KROGER_CLIENT_SECRET=')) {
    CLIENT_SECRET = trimmed.split('=')[1].replace(/['"]/g, '');
  }
});

console.log('\n🔍 Testing Kroger API Credentials\n');
console.log('Client ID:', CLIENT_ID ? `${CLIENT_ID.substring(0, 10)}...${CLIENT_ID.substring(CLIENT_ID.length - 4)}` : '❌ MISSING');
console.log('Client Secret:', CLIENT_SECRET ? `${CLIENT_SECRET.substring(0, 10)}...${CLIENT_SECRET.substring(CLIENT_SECRET.length - 4)}` : '❌ MISSING');
console.log('\n---\n');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Missing credentials in .env file!');
  process.exit(1);
}

async function testAuth() {
  try {
    console.log('📡 Attempting OAuth authentication...\n');
    
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const response = await fetch('https://api.kroger.com/v1/connect/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: 'grant_type=client_credentials&scope=product.compact'
    });

    console.log(`Status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('\n❌ Authentication FAILED\n');
      console.error('Response:', errorText);
      console.error('\n📋 Possible causes:');
      console.error('  1. Invalid Client ID or Client Secret');
      console.error('  2. Application not approved in Kroger Developer Portal');
      console.error('  3. Product API scope not enabled for your app');
      console.error('  4. Credentials expired or revoked');
      console.error('\n🔗 Check your app at: https://developer.kroger.com/');
      process.exit(1);
    }

    const data = await response.json();
    console.log('\n✅ Authentication SUCCESSFUL!\n');
    console.log('Token type:', data.token_type);
    console.log('Expires in:', data.expires_in, 'seconds');
    console.log('Access token (first 20 chars):', data.access_token.substring(0, 20) + '...');
    
    // Test a product search
    console.log('\n📦 Testing product search for "milk"...\n');
    
    const searchUrl = new URL('https://api.kroger.com/v1/products');
    searchUrl.searchParams.append('filter.term', 'milk');
    searchUrl.searchParams.append('filter.locationId', '01400943');
    searchUrl.searchParams.append('filter.limit', '1');
    
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${data.access_token}`,
        'Accept': 'application/json'
      }
    });
    
    console.log(`Status: ${searchResponse.status} ${searchResponse.statusText}`);
    
    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('\n❌ Product search FAILED\n');
      console.error('Response:', errorText);
      process.exit(1);
    }
    
    const products = await searchResponse.json();
    console.log('\n✅ Product search SUCCESSFUL!\n');
    console.log('Products found:', products.data?.length || 0);
    
    if (products.data && products.data.length > 0) {
      const product = products.data[0];
      console.log('\nSample product:');
      console.log('  -', product.description);
      console.log('  - Brand:', product.brand);
      console.log('  - Price:', product.items?.[0]?.price?.regular || 'N/A');
    }
    
    console.log('\n🎉 All tests passed! Your Kroger API setup is working correctly.\n');
    
  } catch (error) {
    console.error('\n❌ Error during testing:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

testAuth();
