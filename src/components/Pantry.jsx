import { useState, useEffect } from 'react'
import krogerAPI from '../KrogerAPI'
import { useAuth } from '../contexts/AuthContext'
import supabase from '../Supabase'
import './Pantry.css'

export default function Pantry() {
  const { user } = useAuth()
  const [pantryItems, setPantryItems] = useState([])
  const [itemImages, setItemImages] = useState({})
  const [loading, setLoading] = useState(true)
  const [newItem, setNewItem] = useState({
    ingredient_name: '',
    quantity: '',
    unit: '',
    category: '',
    notes: ''
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [spoonacularResults, setSpoonacularResults] = useState([])
  const [searchingIngredients, setSearchingIngredients] = useState(false)

  const SPOONACULAR_API_KEY = import.meta.env.VITE_SPOONACULAR_API_KEY

  useEffect(() => {
    if (user) {
      fetchPantryItems()
    }
  }, [user])

  const fetchPantryItems = async () => {
    try {
      const { data, error } = await supabase
        .from('pantry_items')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setPantryItems(data || [])

      // Fetch Kroger images for each item
      if (data && data.length > 0) {
        const imageResults = {}
        await Promise.all(
          data.map(async (item) => {
            try {
              const products = await krogerAPI.searchProducts(item.ingredient_name)
              const img = products?.[0]?.images?.[0]?.sizes?.[0]?.url || null
              imageResults[item.id] = img
            } catch {
              imageResults[item.id] = null
            }
          })
        )
        setItemImages(imageResults)
      }
    } catch (error) {
      console.error('Error fetching pantry items:', error)
    } finally {
      setLoading(false)
    }
  }

  const searchSpoonacularIngredients = async () => {
    if (!searchQuery.trim()) return

    setSearchingIngredients(true)
    try {
      const response = await fetch(
        `https://api.spoonacular.com/food/ingredients/autocomplete?query=${encodeURIComponent(searchQuery)}&number=10&apiKey=${SPOONACULAR_API_KEY}`
      )
      const data = await response.json()
      setSpoonacularResults(data)
    } catch (error) {
      console.error('Error searching ingredients:', error)
    } finally {
      setSearchingIngredients(false)
    }
  }

  const addIngredientFromSearch = (ingredient) => {
    setNewItem({
      ingredient_name: ingredient.name,
      quantity: '1',
      unit: '',
      category: '',
      notes: ''
    })
    setSpoonacularResults([])
    setSearchQuery('')
  }

  const addPantryItem = async (e) => {
    e.preventDefault()
    if (!newItem.ingredient_name.trim()) return

    try {
      const { error } = await supabase
        .from('pantry_items')
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
        notes: ''
      })
      fetchPantryItems()
    } catch (error) {
      console.error('Error adding pantry item:', error)
      alert('Failed to add item to pantry')
    }
  }

  const deletePantryItem = async (id) => {
    try {
      const { error } = await supabase
        .from('pantry_items')
        .delete()
        .eq('id', id)

      if (error) throw error
      fetchPantryItems()
    } catch (error) {
      console.error('Error deleting pantry item:', error)
    }
  }

  if (loading) {
    return <div className="loading">Loading pantry...</div>
  }

  return (
    <div className="pantry-container">

      {/* Spoonacular Ingredient Search */}
      <div className="ingredient-search">
        <div className="search-input-group">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for ingredients in Spoonacular..."
            onKeyPress={(e) => e.key === 'Enter' && searchSpoonacularIngredients()}
          />
          <button onClick={searchSpoonacularIngredients} disabled={searchingIngredients}>
            {searchingIngredients ? '🔍 Searching...' : '🔍 Search'}
          </button>
        </div>
        
        {spoonacularResults.length > 0 && (
          <div className="search-results">
            {spoonacularResults.map((ingredient) => (
              <div 
                key={ingredient.id} 
                className="search-result-item"
                onClick={() => addIngredientFromSearch(ingredient)}
              >
                <img 
                  src={`https://spoonacular.com/cdn/ingredients_100x100/${ingredient.image}`}
                  alt={ingredient.name}
                />
                <span>{ingredient.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add New Item Form */}
      <form onSubmit={addPantryItem} className="add-item-form">
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
          placeholder="Unit (e.g., cups, lbs)"
        />
        <input
          type="text"
          value={newItem.category}
          onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
          placeholder="Category (optional)"
        />
        <button type="submit">Add to Pantry</button>
      </form>

      {/* Pantry Items List */}
      <div className="items-list">
        {pantryItems.length === 0 ? (
          <p className="empty-message">Your pantry is empty. Add some ingredients!</p>
        ) : (
          pantryItems.map((item) => (
            <div key={item.id} className="pantry-item">
              {itemImages[item.id] && (
                <img 
                  src={itemImages[item.id]} 
                  alt={item.ingredient_name}
                  className="pantry-product-image"
                  style={{ width: '60px', height: '60px', objectFit: 'contain', marginRight: '12px' }}
                />
              )}
              <div className="item-info">
                <h4>{item.ingredient_name}</h4>
                <p>
                  {item.quantity} {item.unit}
                  {item.category && <span className="category"> • {item.category}</span>}
                </p>
                {item.notes && <p className="notes">{item.notes}</p>}
              </div>
              <button 
                onClick={() => deletePantryItem(item.id)}
                className="delete-btn"
                title="Delete item"
              >
                🗑️
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
