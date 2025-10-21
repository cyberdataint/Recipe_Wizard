import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import supabase from '../Supabase'
import krogerAPI from '../KrogerAPI'
import './ShoppingList.css'

export default function ShoppingList() {
  const { user } = useAuth()
  const isBrowser = typeof window !== 'undefined'
  const isLocalhost = isBrowser && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
  const [shoppingItems, setShoppingItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingPrices, setLoadingPrices] = useState(false)
  const [priceData, setPriceData] = useState({})
  const [error, setError] = useState('')
  const [stores, setStores] = useState([])
  const [selectedStore, setSelectedStore] = useState(() => {
    return localStorage.getItem('kroger_location_id') || '01400943'
  })
  const [newItem, setNewItem] = useState({
    ingredient_name: '',
    quantity: '',
    unit: '',
    category: '',
    recipe_name: ''
  })

  useEffect(() => {
    if (user) {
      fetchShoppingItems()
    }
  }, [user])

  // Load nearby stores on mount
  useEffect(() => {
    const loadStores = async () => {
      try {
        const data = await krogerAPI.listLocations({ lat: 42.66, lon: -83.385, radius: 50, limit: 200, chain: 'Kroger' })
        // Filter to Kroger family chains commonly shoppable (optional)
        const sorted = (data || []).sort((a, b) => {
          const an = a?.address?.city || ''
          const bn = b?.address?.city || ''
          return an.localeCompare(bn)
        })
        setStores(sorted)
      } catch (e) {
        console.error('Failed to load stores', e)
      }
    }
    loadStores()
  }, [])

  const fetchShoppingItems = async () => {
    try {
      const { data, error } = await supabase
        .from('shopping_list_items')
        .select('*')
        .eq('user_id', user.id)
  // .order('checked', { ascending: true })
        .order('created_at', { ascending: false })

      if (error) throw error
      setShoppingItems(data || [])
      
      // Auto-fetch prices after loading items
      if (data && data.length > 0) {
        fetchKrogerPrices(data)
      }
    } catch (error) {
      console.error('Error fetching shopping items:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateTotal = () => {
    let total = 0
    shoppingItems.forEach(item => {
      if (priceData[item.ingredient_name]) {
        total += priceData[item.ingredient_name].price
      }
    })
    return total.toFixed(2)
  }

  const onChangeStore = (e) => {
    const locId = e.target.value
    setSelectedStore(locId)
    krogerAPI.setLocationId(locId)
    // Refresh prices when changing store if items exist
    if (shoppingItems.length > 0) {
      fetchKrogerPrices(shoppingItems)
    }
  }

  const addShoppingItem = async (e) => {
    e.preventDefault()
    if (!newItem.ingredient_name.trim()) return

    try {
      const { error } = await supabase
        .from('shopping_list_items')
        .insert([{
          ...newItem,
          user_id: user.id
        }])

      if (error) throw error
      
      setNewItem({
        ingredient_name: '',
        quantity: '',
        unit: '',
        category: '',
        recipe_name: ''
      })
      fetchShoppingItems()
    } catch (error) {
      console.error('Error adding shopping item:', error)
      alert('Failed to add item to shopping list')
    }
  }

  // Fetch Kroger prices for shopping items
  const fetchKrogerPrices = async (items) => {
    if (!items || items.length === 0) return
    setLoadingPrices(true)
    // Clear any prior banner; we won't set a new one for Kroger timeouts
    setError('')
    try {
      const ingredientNames = items.map(item => item.ingredient_name)
      krogerAPI.setLocationId(selectedStore)
      const results = await krogerAPI.findMultipleIngredients(ingredientNames)
      // Merge into existing to prevent flicker when chunks fail/lag
      const next = { ...priceData }
      results.forEach((result) => {
        if (result && result.product) {
          next[result.ingredient] = result.product
        }
      })
      setPriceData(next)
    } catch (error) {
      // Suppress errors in UI; Kroger API can be slow and partial
      // If needed, enable the log below only in dev:
      // if (import.meta.env.DEV) console.warn('Kroger pricing fetch warning:', error)
    } finally {
      setLoadingPrices(false)
    }
  }

  const deleteShoppingItem = async (id) => {
    try {
      const { error } = await supabase
        .from('shopping_list_items')
        .delete()
        .eq('id', id)

      if (error) throw error
      fetchShoppingItems()
    } catch (error) {
      console.error('Error deleting shopping item:', error)
    }
  }

  const moveToCart = async (item) => {
    // First add to pantry
    try {
      const { error: pantryError } = await supabase
        .from('pantry_items')
        .insert([{
          user_id: user.id,
          ingredient_name: item.ingredient_name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
          notes: `Added from shopping list${item.recipe_name ? ` for ${item.recipe_name}` : ''}`
        }])

      if (pantryError) throw pantryError

      // Then remove from shopping list
      const { error: deleteError } = await supabase
        .from('shopping_list_items')
        .delete()
        .eq('id', item.id)

      if (deleteError) throw deleteError

      fetchShoppingItems()
      alert('Item moved to pantry!')
    } catch (error) {
      console.error('Error moving to pantry:', error)
      alert('Failed to move item to pantry')
    }
  }

  // Removed clearCheckedItems and all mass selection logic

  if (loading) {
    return <div className="loading">Loading shopping list...</div>
  }

  return (
    <div className="shopping-list-container">
      <div className="header">
        <div className="header-actions">
          {/* Store selector */}
          <div className="store-selector" title="Choose your Kroger store for accurate pricing and aisles">
            <label style={{ marginRight: '8px', color: "white" }}>Store:</label>
            <select style={{ padding: '0.75rem', fontSize:'1rem', borderRadius: '8px', border: 'none' }} value={selectedStore} onChange={onChangeStore}>
              {stores.length === 0 && (
                <option value={selectedStore}>Loading stores…</option>
              )}
              {stores.map((s) => (
                <option key={s.locationId} value={s.locationId}>
                  {s.name} • {s.address?.city || ''}
                </option>
              ))}
            </select>
          </div>
            {shoppingItems.length > 0 && (
              <button 
                onClick={() => fetchKrogerPrices(shoppingItems)} 
                className="refresh-prices-btn"
                disabled={loadingPrices}
              >
                {loadingPrices ? '🔄 Loading...' : '💲 Get Prices'}
              </button>
            )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="error-banner">
          <strong>⚠️ Pricing Unavailable</strong>
          <p>{error}</p>
          <p className="error-solution">
            <strong>Solution:</strong>{' '}
            {isLocalhost ? (
              <>
                Use the local Node proxy to avoid exposing secrets in the browser. Start it with <code>npm run proxy</code> (default: http://localhost:3001). The app auto-targets it on localhost.
              </>
            ) : (
              <>
                This site uses a serverless function backend. Ensure <code>KROGER_CLIENT_ID</code> and <code>KROGER_CLIENT_SECRET</code> are configured in your hosting platform (Netlify or Cloudflare Pages) and redeploy. For troubleshooting, temporarily set <code>KROGER_DEBUG=true</code> and open <code>/api/kroger/env-check</code>.
              </>
            )}
          </p>
        </div>
      )}

      {/* Cart Total */}
      {Object.keys(priceData).length > 0 && (
        <div className="cart-total">
          <div className="total-info">
            <span className="total-label">Estimated Total:</span>
            <span className="total-amount">${calculateTotal()}</span>
          </div>
          <p className="total-note">Based on Kroger prices • Excludes checked items</p>
        </div>
      )}

      {/* Add New Item Form */}
      <form onSubmit={addShoppingItem} className="add-item-form">
        <div className='inputs'>
          <input
            type="text"
            value={newItem.ingredient_name}
            onChange={(e) => setNewItem({ ...newItem, ingredient_name: e.target.value })}
            placeholder="Ingredient name"
            required
          />
          <input
            type="text"
            value={newItem.quantity}
            onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
            placeholder="Quantity"
          />
          <input
            type="text"
            value={newItem.unit}
            onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
            placeholder="Unit"
          />
          <input
            type="text"
            value={newItem.recipe_name}
            onChange={(e) => setNewItem({ ...newItem, recipe_name: e.target.value })}
            placeholder="For recipe (optional)"
          />
        </div>
        <div className='add-btn'>
          <button type="submit">Add Item</button>
        </div>
      </form>

      {/* Shopping Items List */}
      <div className="items-list">
        {shoppingItems.length === 0 ? (
          <p className="empty-message">Your shopping list is empty.</p>
        ) : (
          shoppingItems.map((item) => {
            const krogerProduct = priceData[item.ingredient_name]
            return (
              <div key={item.id} className="shopping-item">
                {krogerProduct?.image && (
                  <img 
                    src={krogerProduct.image} 
                    alt={item.ingredient_name}
                    className="product-image"
                  />
                )}
                <div className="item-info">
                  <h4>{item.ingredient_name}</h4>
                  <p>
                    {item.quantity} {item.unit}
                    {item.recipe_name && <span className="recipe"> • For: {item.recipe_name}</span>}
                  </p>
                  {krogerProduct && (
                    <div className="kroger-info">
                      <p className="product-desc">{krogerProduct.description}</p>
                      <p className="product-brand">{krogerProduct.brand} • {krogerProduct.size}</p>
                        {/* Removed aisle badge */}
                        {/* Removed aisle info */}
                      <div className="price-info">
                        {krogerProduct.onSale && (
                          <span className="regular-price">${krogerProduct.regularPrice.toFixed(2)}</span>
                        )}
                        <span className={`price ${krogerProduct.onSale ? 'sale-price' : ''}`}>
                          ${krogerProduct.price.toFixed(2)}
                        </span>
                        {krogerProduct.onSale && <span className="sale-badge">SALE</span>}
                      </div>
                    </div>
                  )}
                  {!krogerProduct && loadingPrices && (
                    <p className="loading-price">Loading price...</p>
                  )}
                </div>
                <div className="item-actions">
                  <button 
                    onClick={() => moveToCart(item)}
                    className="pantry-btn"
                    title="Move to pantry"
                  >
                    🥫
                  </button>
                  <button 
                    onClick={() => deleteShoppingItem(item.id)}
                    className="delete-btn"
                    title="Delete item"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
