import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import supabase from '../Supabase'
import './ShoppingList.css'

export default function ShoppingList() {
  const { user } = useAuth()
  const [shoppingItems, setShoppingItems] = useState([])
  const [loading, setLoading] = useState(true)
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

  const fetchShoppingItems = async () => {
    try {
      const { data, error } = await supabase
        .from('shopping_list_items')
        .select('*')
        .eq('user_id', user.id)
        .order('checked', { ascending: true })
        .order('created_at', { ascending: false })

      if (error) throw error
      setShoppingItems(data || [])
    } catch (error) {
      console.error('Error fetching shopping items:', error)
    } finally {
      setLoading(false)
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

  const toggleChecked = async (id, currentChecked) => {
    try {
      const { error } = await supabase
        .from('shopping_list_items')
        .update({ checked: !currentChecked })
        .eq('id', id)

      if (error) throw error
      fetchShoppingItems()
    } catch (error) {
      console.error('Error updating shopping item:', error)
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

  const clearCheckedItems = async () => {
    const checkedIds = shoppingItems.filter(item => item.checked).map(item => item.id)
    
    if (checkedIds.length === 0) return

    if (!confirm('Remove all checked items?')) return

    try {
      const { error } = await supabase
        .from('shopping_list_items')
        .delete()
        .in('id', checkedIds)

      if (error) throw error
      fetchShoppingItems()
    } catch (error) {
      console.error('Error clearing checked items:', error)
    }
  }

  if (loading) {
    return <div className="loading">Loading shopping list...</div>
  }

  return (
    <div className="shopping-list-container">
      <div className="header">
        <div>
          <h2>🛒 Shopping List</h2>
          <p className="subtitle">Items you need to buy</p>
        </div>
        {shoppingItems.some(item => item.checked) && (
          <button onClick={clearCheckedItems} className="clear-btn">
            Clear Checked Items
          </button>
        )}
      </div>

      {/* Add New Item Form */}
      <form onSubmit={addShoppingItem} className="add-item-form">
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
        <button type="submit">Add Item</button>
      </form>

      {/* Shopping Items List */}
      <div className="items-list">
        {shoppingItems.length === 0 ? (
          <p className="empty-message">Your shopping list is empty.</p>
        ) : (
          shoppingItems.map((item) => (
            <div key={item.id} className={`shopping-item ${item.checked ? 'checked' : ''}`}>
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => toggleChecked(item.id, item.checked)}
                className="checkbox"
              />
              <div className="item-info">
                <h4>{item.ingredient_name}</h4>
                <p>
                  {item.quantity} {item.unit}
                  {item.recipe_name && <span className="recipe"> • For: {item.recipe_name}</span>}
                </p>
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
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
