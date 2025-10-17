// Kroger API service for product search and pricing
// Note: Kroger API requires OAuth 2.0 authentication
// 
// CORS Fix: Set useProxy=true and run the proxy server (kroger-proxy-server.js)
// See KROGER_PROXY_SETUP.md for instructions

class KrogerAPI {
  constructor() {
    // Toggle between proxy server (avoids CORS) or direct API calls
    this.useProxy = true
    this.proxyUrl = 'http://localhost:3001/api/kroger'
    
    // Direct API configuration (only used if useProxy=false)
    this.clientId = import.meta.env.VITE_KROGER_CLIENT_ID
    this.clientSecret = import.meta.env.VITE_KROGER_CLIENT_SECRET
    this.accessToken = null
    this.tokenExpiry = null
    this.baseUrl = 'https://api.kroger.com/v1'
    // Selected store locationId, persisted in localStorage
    this.locationId = localStorage.getItem('kroger_location_id') || '01400943'
  }

  // Get OAuth access token
  async getAccessToken() {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken
    }

    try {
      const credentials = btoa(`${this.clientId}:${this.clientSecret}`)
      const response = await fetch('https://api.kroger.com/v1/connect/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`
        },
        body: 'grant_type=client_credentials&scope=product.compact'
      })

      if (!response.ok) {
        throw new Error(`Failed to get access token: ${response.status}`)
      }

      const data = await response.json()
      this.accessToken = data.access_token
      // Set expiry 5 minutes before actual expiry for safety
      this.tokenExpiry = Date.now() + ((data.expires_in - 300) * 1000)
      return this.accessToken
    } catch (error) {
      console.error('Kroger auth error:', error)
      throw error
    }
  }

  // Search for products
  async searchProducts(query, locationId = this.locationId || '01400943') {
    try {
      if (this.useProxy) {
        // Use proxy server to avoid CORS
  const url = `${this.proxyUrl}/products?term=${encodeURIComponent(query)}&locationId=${locationId}&limit=5`
        const response = await fetch(url)
        
        if (!response.ok) {
          throw new Error(`Proxy search failed: ${response.status}`)
        }
        
        const data = await response.json()
        return data.data || []
      } else {
        // Direct API call (requires server-side or will hit CORS)
        const token = await this.getAccessToken()
        const url = new URL(`${this.baseUrl}/products`)
        url.searchParams.append('filter.term', query)
  url.searchParams.append('filter.locationId', locationId)
        url.searchParams.append('filter.limit', '5')

        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        })

        if (!response.ok) {
          throw new Error(`Product search failed: ${response.status}`)
        }

        const data = await response.json()
        return data.data || []
      }
    } catch (error) {
      console.error('Kroger product search error:', error)
      return []
    }
  }

  // Get best match for an ingredient
  async findIngredient(ingredientName) {
    const products = await this.searchProducts(ingredientName, this.locationId)
    // Debug: log raw product response to inspect aisle info
    if (products.length > 0) {
      console.log('Raw Kroger product:', products[0]);
    }
    if (products.length === 0) {
      return null
    }

    // Return the first (most relevant) product
    const product = products[0]
    const firstItem = product.items?.[0] || {}
    const price = firstItem?.price?.regular || 0
    const promoPrice = firstItem?.price?.promo || null
    const aisleLoc = firstItem?.aisleLocations?.[0] || null
    const aisleParts = []
    if (aisleLoc?.number) aisleParts.push(`Aisle ${aisleLoc.number}`)
    if (aisleLoc?.description) aisleParts.push(aisleLoc.description)
    if (aisleLoc?.bayNumber) aisleParts.push(`Bay ${aisleLoc.bayNumber}`)
    const aisleText = aisleParts.length ? aisleParts.join(' \u2022 ') : null

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
      categories: product.categories || []
    }
  }

  // Batch search for multiple ingredients
  async findMultipleIngredients(ingredients) {
    if (this.useProxy) {
      // Use proxy batch endpoint for better performance
      try {
        const response = await fetch(`${this.proxyUrl}/batch-search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ingredients, locationId: this.locationId || '01400943' })
        })

        if (!response.ok) {
          throw new Error(`Batch search failed: ${response.status}`)
        }

        const batchResults = await response.json();
        // Debug: log all batch product results
        console.log('Batch Kroger products:', batchResults);
        return batchResults;
      } catch (error) {
        console.error('Proxy batch search error:', error)
        // Fallback to individual searches
        const results = await Promise.allSettled(
          ingredients.map(ing => this.findIngredient(ing))
        )

        return results.map((result, index) => ({
          ingredient: ingredients[index],
          product: result.status === 'fulfilled' ? result.value : null,
          error: result.status === 'rejected' ? result.reason : null
        }))
      }
    } else {
      // Direct API calls (will hit CORS in browser)
      const results = await Promise.allSettled(
        ingredients.map(ing => this.findIngredient(ing))
      )

      // Debug: log all batch product results
      console.log('Batch Kroger products:', results);
      return results.map((result, index) => ({
        ingredient: ingredients[index],
        product: result.status === 'fulfilled' ? result.value : null,
        error: result.status === 'rejected' ? result.reason : null
      }))
    }
  }

  // List locations near a latitude/longitude
  async listLocations({ lat = 42.66, lon = -83.385, radius = 50, limit = 200, chain = '' } = {}) {
    try {
      const params = new URLSearchParams({
        lat: String(lat),
        lon: String(lon),
        radius: String(radius),
        limit: String(limit)
      })
      if (chain) params.append('chain', chain)
      const res = await fetch(`${this.proxyUrl}/locations?${params.toString()}`)
      if (!res.ok) throw new Error(`Locations fetch failed: ${res.status}`)
      const data = await res.json()
      return data?.data || []
    } catch (err) {
      console.error('Kroger locations error:', err)
      return []
    }
  }

  setLocationId(locationId) {
    this.locationId = locationId
    try {
      localStorage.setItem('kroger_location_id', String(locationId))
    } catch {}
  }
}

// Export singleton instance
const krogerAPI = new KrogerAPI()
export default krogerAPI
