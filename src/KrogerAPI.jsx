// Kroger API service for product search and pricing
// Note: Kroger API requires OAuth 2.0 authentication
// 
// CORS Fix: Set useProxy=true and run the proxy server (kroger-proxy-server.js)
// See KROGER_PROXY_SETUP.md for instructions

class KrogerAPI {
  constructor() {
    // Toggle between proxy server (avoids CORS) or direct API calls
    // Always use a proxy in browser: token exchange requires client secret and
    // Kroger APIs generally do not enable CORS for browsers.
    this.useProxy = true
    // Choose proxy based on environment
    const isBrowser = typeof window !== 'undefined'
    const isLocalhost = isBrowser && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
    const localProxy = import.meta.env.VITE_LOCAL_KROGER_PROXY_URL || 'http://localhost:3001/api/kroger'
    const prodProxy = '/api/kroger'
  // Use local Node proxy in dev; serverless function (/api/kroger) in prod
    this.proxyUrl = isLocalhost ? localProxy : prodProxy   

    // Direct API configuration (only used if useProxy=false)
    this.clientId = import.meta.env.VITE_KROGER_CLIENT_ID
    this.clientSecret = import.meta.env.VITE_KROGER_CLIENT_SECRET
    this.accessToken = null
    this.tokenExpiry = null
    this.baseUrl = 'https://api.kroger.com/v1'
  // Selected store locationId, persisted in localStorage (no default)
  this.locationId = localStorage.getItem('kroger_location_id') || null
  // In-memory cache for ingredient -> product by store
  this._priceCache = new Map()
  this._priceCacheTTL = 15 * 60 * 1000 // 15 minutes
  this._priceCacheKey = 'kroger_price_cache_v1'
  this._priceCacheMax = 500
  this._loadCacheFromSession()
  }

  _now() { return Date.now() }
  _norm(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() }
  _loadCacheFromSession() {
    try {
      const raw = sessionStorage.getItem(this._priceCacheKey)
      if (!raw) return
      const obj = JSON.parse(raw)
      const now = this._now()
      for (const [key, val] of Object.entries(obj || {})) {
        if (val && typeof val === 'object' && typeof val.ts === 'number') {
          if ((now - val.ts) < this._priceCacheTTL) {
            this._priceCache.set(key, val)
          }
        }
      }
    } catch {}
  }
  _persistCacheToSession() {
    try {
      // Enforce max size: drop oldest entries if needed
      if (this._priceCache.size > this._priceCacheMax) {
        const drop = this._priceCache.size - this._priceCacheMax
        let i = 0
        for (const k of this._priceCache.keys()) {
          this._priceCache.delete(k)
          if (++i >= drop) break
        }
      }
      const obj = {}
      for (const [k, v] of this._priceCache.entries()) obj[k] = v
      sessionStorage.setItem(this._priceCacheKey, JSON.stringify(obj))
    } catch {}
  }

  // Get OAuth access token (via proxy or direct)
  async getAccessToken() {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken
    }

    try {
      if (this.useProxy) {
  // Get token from proxy server (server handles credentials)
  // NOTE: Include JSON body + content-type to prevent host "Forms" features from intercepting POST
        const response = await fetch(`${this.proxyUrl}/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}'
        })
        if (!response.ok) {
          // Try to read JSON, else fall back to text so we can see real Kroger errors
          const raw = await response.text()
          let errorData
          try {
            errorData = raw ? JSON.parse(raw) : {}
          } catch (e) {
            errorData = { error: 'non_json_error', raw }
          }
          const message = errorData.error_description || errorData.error || `Token fetch failed: ${response.status}`
          throw new Error(message)
        }
        const data = await response.json()
        this.accessToken = data.access_token
        // Set expiry 5 minutes before actual expiry for safety
        this.tokenExpiry = Date.now() + ((data.expires_in - 300) * 1000)
        return this.accessToken
      } else {
        // Direct API call (for local development)
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
      }
    } catch (error) {
        if (import.meta.env.DEV) console.error('Kroger auth error:', error)
      throw error
    }
  }

  // Search for products
  async searchProducts(query, locationId = this.locationId) {
    try {
      if (this.useProxy) {
        // Use proxy server to avoid CORS
        const token = await this.getAccessToken()
        const params = new URLSearchParams({ term: query, limit: 5 })
        if (locationId) params.append('locationId', locationId)
        const response = await fetch(`${this.proxyUrl}/products?${params.toString()}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        
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
    if (locationId) url.searchParams.append('filter.locationId', locationId)
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
        if (import.meta.env.DEV) console.error('Kroger product search error:', error)
      return []
    }
  }

  // Get best match for an ingredient
  async findIngredient(ingredientName) {
    const products = await this.searchProducts(ingredientName, this.locationId)
    // Debug: log raw product response to inspect aisle info
    // (silenced in production)
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
    const list = (ingredients || []).filter(Boolean)
    if (list.length === 0) return []

    const storeKey = String(this.locationId || 'none')
    const out = []
    const toFetch = []
    const now = this._now()

    // Check cache first
    for (const term of list) {
      const key = `${storeKey}|${this._norm(term)}`
      const cached = this._priceCache.get(key)
      if (cached && (now - cached.ts) < this._priceCacheTTL) {
        out.push({ ingredient: term, product: cached.product || null, error: null })
      } else {
        toFetch.push(term)
      }
    }

    if (toFetch.length === 0) return out

    const chunkSize = 10

    if (this.useProxy) {
      const token = await this.getAccessToken()
      const chunkPromises = []
      for (let i = 0; i < toFetch.length; i += chunkSize) {
        const chunk = toFetch.slice(i, i + chunkSize)
        const body = { terms: chunk, ...(this.locationId ? { locationId: this.locationId } : {}) }
        const p = (async () => {
          try {
            const response = await fetch(`${this.proxyUrl}/batch-search`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify(body)
            })
            if (!response.ok) throw new Error(`Batch search failed: ${response.status}`)
            const batch = await response.json()
            return batch
          } catch (err) {
            if (import.meta.env.DEV) console.error('Batch chunk failed, falling back to per-item:', err)
            const results = await Promise.allSettled(chunk.map(ing => this.findIngredient(ing)))
            return results.map((result, index) => ({
              ingredient: chunk[index],
              product: result.status === 'fulfilled' ? result.value : null,
              error: result.status === 'rejected' ? result.reason : null
            }))
          }
        })()
        chunkPromises.push(p)
      }
      const settled = await Promise.allSettled(chunkPromises)
      for (const s of settled) {
        if (s.status === 'fulfilled') {
          for (const r of s.value) {
            const key = `${storeKey}|${this._norm(r.ingredient)}`
            this._priceCache.set(key, { product: r.product || null, ts: now })
            this._persistCacheToSession()
            out.push(r)
          }
        }
      }
      return out
    } else {
      const results = await Promise.allSettled(toFetch.map(ing => this.findIngredient(ing)))
      results.forEach((res, idx) => {
        const ingredient = toFetch[idx]
        const product = res.status === 'fulfilled' ? res.value : null
        const key = `${storeKey}|${this._norm(ingredient)}`
        this._priceCache.set(key, { product, ts: now })
        this._persistCacheToSession()
        out.push({ ingredient, product, error: res.status === 'rejected' ? res.reason : null })
      })
      return out
    }
  }

  // Removed lat/long listing; use listLocationsByZip instead

  // List locations by ZIP code within a radius (miles)
  async listLocationsByZip({ zip, radius = 7, limit = 12, chain = 'Kroger' } = {}) {
    if (!zip) return []
    try {
      if (this.useProxy) {
        const token = await this.getAccessToken()
        const params = new URLSearchParams({
          'filter.zipCode.near': String(zip),
          'filter.radiusInMiles': String(radius),
          'filter.limit': String(limit)
        })
        if (chain) params.append('filter.chain', chain)
        const res = await fetch(`${this.proxyUrl}/locations?${params.toString()}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (!res.ok) throw new Error(`Locations (zip) failed: ${res.status}`)
        const data = await res.json()
        return data?.data || []
      } else {
        const token = await this.getAccessToken()
        const url = new URL(`${this.baseUrl}/locations`)
        url.searchParams.append('filter.zipCode.near', String(zip))
        url.searchParams.append('filter.radiusInMiles', String(radius))
        url.searchParams.append('filter.limit', String(limit))
        if (chain) url.searchParams.append('filter.chain', chain)
        const res = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
        })
        if (!res.ok) throw new Error(`Locations (zip) failed: ${res.status}`)
        const data = await res.json()
        return data?.data || []
      }
    } catch (err) {
        if (import.meta.env.DEV) console.error('Kroger locations by zip error:', err)
      return []
    }
  }

  // List locations by latitude/longitude within a radius (miles)
  async listLocationsByLatLon({ lat, lon, radius = 7, limit = 12, chain = 'Kroger' } = {}) {
    if (lat == null || lon == null) return []
    try {
      if (this.useProxy) {
        const token = await this.getAccessToken()
        const params = new URLSearchParams({
          lat: String(lat),
          lon: String(lon),
          'filter.radiusInMiles': String(radius),
          'filter.limit': String(limit)
        })
        if (chain) params.append('filter.chain', chain)
        const res = await fetch(`${this.proxyUrl}/locations?${params.toString()}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (!res.ok) throw new Error(`Locations (latlon) failed: ${res.status}`)
        const data = await res.json()
        return data?.data || []
      } else {
        const token = await this.getAccessToken()
        const url = new URL(`${this.baseUrl}/locations`)
        url.searchParams.append('filter.latLong.near', `${lat},${lon}`)
        url.searchParams.append('filter.radiusInMiles', String(radius))
        url.searchParams.append('filter.limit', String(limit))
        if (chain) url.searchParams.append('filter.chain', chain)
        const res = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
        })
        if (!res.ok) throw new Error(`Locations (latlon) failed: ${res.status}`)
        const data = await res.json()
        return data?.data || []
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('Kroger locations by lat/lon error:', err)
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
