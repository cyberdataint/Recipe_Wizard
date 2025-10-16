import { useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Auth from './components/Auth'
import Pantry from './components/Pantry'
import ShoppingList from './components/ShoppingList'
import supabase from './Supabase'
import './App.css'

function MainApp() {
  const { user, signOut } = useAuth()
  const [currentView, setCurrentView] = useState('recipes') // 'recipes', 'pantry', 'shopping'
  const [query, setQuery] = useState('')
  const [recipes, setRecipes] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [searchType, setSearchType] = useState('name') // 'name' or 'ingredient'
  const [pantryItems, setPantryItems] = useState([])
  
  const API_KEY = import.meta.env.VITE_SPOONACULAR_API_KEY

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setSelectedRecipe(null)
    try {
      let recipesData = []
      if (searchType === 'ingredient') {
        // Use the correct endpoint for ingredient search
        const url = `https://api.spoonacular.com/recipes/findByIngredients?ingredients=${encodeURIComponent(query)}&number=9&ranking=1&ignorePantry=true&apiKey=${API_KEY}`
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        })
        if (!response.ok) {
          throw new Error('Failed to fetch recipes')
        }
        recipesData = await response.json()
        setRecipes(recipesData)
        if (recipesData.length === 0) {
          alert('No recipes found. Try a different search!')
        }
      } else {
        // Search by recipe name
        const url = `https://api.spoonacular.com/recipes/complexSearch?query=${encodeURIComponent(query)}&number=9&addRecipeInformation=true&fillIngredients=true&apiKey=${API_KEY}`
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        })
        if (!response.ok) {
          throw new Error('Failed to fetch recipes')
        }
        const data = await response.json()
        setRecipes(data.results || [])
        if ((data.results || []).length === 0) {
          alert('No recipes found. Try a different search!')
        }
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Sorry, I encountered an error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const fetchRecipeDetails = async (recipeId) => {
    setLoadingDetails(true)
    
    try {
      const response = await fetch(
        `https://api.spoonacular.com/recipes/${recipeId}/information?includeNutrition=true&apiKey=${API_KEY}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
      
      if (!response.ok) {
        throw new Error('Failed to fetch recipe details')
      }
      
      const data = await response.json()
      setSelectedRecipe(data)
      
      // Also fetch user's pantry to check which ingredients they have
      if (user) {
        const { data: pantryData } = await supabase
          .from('pantry_items')
          .select('ingredient_name')
          .eq('user_id', user.id)
        
        setPantryItems(pantryData || [])
      }
      
    } catch (error) {
      console.error('Error:', error)
      alert('Sorry, could not load recipe details.')
    } finally {
      setLoadingDetails(false)
    }
  }

  const addIngredientToShoppingList = async (ingredient, recipeName) => {
    if (!user) {
      alert('Please sign in to add ingredients to your shopping list')
      return
    }

    try {
      const { error } = await supabase
        .from('shopping_list_items')
        .insert([{
          user_id: user.id,
          ingredient_name: ingredient.name || ingredient.original,
          quantity: ingredient.amount?.toString() || '1',
          unit: ingredient.unit || '',
          recipe_name: recipeName
        }])

      if (error) throw error
      alert('Ingredient added to shopping list!')
    } catch (error) {
      console.error('Error adding to shopping list:', error)
      alert('Failed to add ingredient to shopping list')
    }
  }

  const addAllIngredientsToShoppingList = async () => {
    if (!user) {
      alert('Please sign in to add ingredients to your shopping list')
      return
    }

    if (!selectedRecipe?.extendedIngredients) return

    try {
      const items = selectedRecipe.extendedIngredients.map(ingredient => ({
        user_id: user.id,
        ingredient_name: ingredient.name || ingredient.original,
        quantity: ingredient.amount?.toString() || '1',
        unit: ingredient.unit || '',
        recipe_name: selectedRecipe.title
      }))

      const { error } = await supabase
        .from('shopping_list_items')
        .insert(items)

      if (error) throw error
      alert(`Added ${items.length} ingredients to shopping list!`)
    } catch (error) {
      console.error('Error adding to shopping list:', error)
      alert('Failed to add ingredients to shopping list')
    }
  }

  const isInPantry = (ingredientName) => {
    return pantryItems.some(item => 
      item.ingredient_name.toLowerCase().includes(ingredientName.toLowerCase()) ||
      ingredientName.toLowerCase().includes(item.ingredient_name.toLowerCase())
    )
  }

  const handleSignOut = async () => {
    await signOut()
    setCurrentView('recipes')
  }

  if (currentView === 'pantry') {
    return (
      <div className="app">
        <nav className="navbar">
          <h1>🍳 Recipe Wizard</h1>
          <div className="nav-links">
            <button onClick={() => setCurrentView('recipes')}>Recipes</button>
            <button className="active">Pantry</button>
            <button onClick={() => setCurrentView('shopping')}>Shopping List</button>
            {user && <button onClick={handleSignOut} className="sign-out">Sign Out</button>}
          </div>
        </nav>
        <Pantry />
      </div>
    )
  }

  if (currentView === 'shopping') {
    return (
      <div className="app">
        <nav className="navbar">
          <h1>🍳 Recipe Wizard</h1>
          <div className="nav-links">
            <button onClick={() => setCurrentView('recipes')}>Recipes</button>
            <button onClick={() => setCurrentView('pantry')}>Pantry</button>
            <button className="active">Shopping List</button>
            {user && <button onClick={handleSignOut} className="sign-out">Sign Out</button>}
          </div>
        </nav>
        <ShoppingList />
      </div>
    )
  }

  return (
    <div className="app">
      <nav className="navbar">
        <h1>🍳 Recipe Wizard</h1>
        <div className="nav-links">
          <button className="active">Recipes</button>
          {user && <button onClick={() => setCurrentView('pantry')}>Pantry</button>}
          {user && <button onClick={() => setCurrentView('shopping')}>Shopping List</button>}
          {user && <button onClick={handleSignOut} className="sign-out">Sign Out</button>}
        </div>
      </nav>
      <header className="app-header">
        <h2>Search for delicious recipes with detailed ingredients!</h2>
      </header>

      <div className="main-container">
        <form onSubmit={handleSearch} className="search-form">
          <div className="search-type-toggle">
            <label>
              <input
                type="radio"
                name="searchType"
                value="name"
                checked={searchType === 'name'}
                onChange={() => setSearchType('name')}
                disabled={loading}
              />
              Search by Name
            </label>
            <label>
              <input
                type="radio"
                name="searchType"
                value="ingredient"
                checked={searchType === 'ingredient'}
                onChange={() => setSearchType('ingredient')}
                disabled={loading}
              />
              Search by Ingredient(s)
            </label>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchType === 'ingredient' ? "Enter ingredient(s), e.g. chicken, rice" : "Search for recipes (e.g., pasta, chicken, dessert)..."}
            className="search-input"
            disabled={loading}
          />
          <button 
            type="submit" 
            className="search-button"
            disabled={loading || !query.trim()}
          >
            {loading ? '🔍 Searching...' : '🔍 Search'}
          </button>
        </form>

        {recipes.length === 0 && !loading && (
          <div className="welcome-message">
            <h2>Welcome to Recipe Wizard!</h2>
            <p>Search for recipes by name, ingredients, or cuisine type:</p>
            <div className="example-searches">
              <button onClick={() => { setQuery('pasta carbonara'); }}>🍝 Pasta</button>
              <button onClick={() => { setQuery('chicken curry'); }}>🍛 Chicken</button>
              <button onClick={() => { setQuery('chocolate cake'); }}>🍰 Dessert</button>
              <button onClick={() => { setQuery('healthy salad'); }}>🥗 Healthy</button>
            </div>
          </div>
        )}

        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            <p>Searching for recipes...</p>
          </div>
        )}

        {recipes.length > 0 && (
          <div className="recipes-grid">
            {recipes.map((recipe) => (
              <div 
                key={recipe.id} 
                className="recipe-card"
                onClick={() => fetchRecipeDetails(recipe.id)}
              >
                <img 
                  src={recipe.image} 
                  alt={recipe.title || recipe.name}
                  className="recipe-image"
                />
                <div className="recipe-info">
                  <h3>{recipe.title || recipe.name}</h3>
                  <div className="recipe-meta">
                    {recipe.readyInMinutes && (
                      <span>⏱️ {recipe.readyInMinutes} min</span>
                    )}
                    {recipe.servings && (
                      <span>🍽️ {recipe.servings} servings</span>
                    )}
                    {recipe.usedIngredientCount !== undefined && (
                      <span>✅ {recipe.usedIngredientCount} used</span>
                    )}
                    {recipe.missedIngredientCount !== undefined && (
                      <span>❌ {recipe.missedIngredientCount} missing</span>
                    )}
                  </div>
                  <button className="view-details-btn">
                    View Recipe Details →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedRecipe && (
          <div className="modal-overlay" onClick={() => setSelectedRecipe(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setSelectedRecipe(null)}>
                ✕
              </button>
              
              {loadingDetails ? (
                <div className="loading">
                  <div className="spinner"></div>
                  <p>Loading recipe details...</p>
                </div>
              ) : (
                <>
                  <h2>{selectedRecipe.title}</h2>
                  <img 
                    src={selectedRecipe.image} 
                    alt={selectedRecipe.title}
                    className="modal-image"
                  />
                  
                  <div className="recipe-stats">
                    {selectedRecipe.readyInMinutes && (
                      <div className="stat">
                        <span className="stat-icon">⏱️</span>
                        <span>{selectedRecipe.readyInMinutes} minutes</span>
                      </div>
                    )}
                    {selectedRecipe.servings && (
                      <div className="stat">
                        <span className="stat-icon">🍽️</span>
                        <span>{selectedRecipe.servings} servings</span>
                      </div>
                    )}
                    {selectedRecipe.pricePerServing && (
                      <div className="stat">
                        <span className="stat-icon">💰</span>
                        <span>${(selectedRecipe.pricePerServing / 100).toFixed(2)} per serving</span>
                      </div>
                    )}
                  </div>

                  <div className="recipe-section">
                    <div className="section-header">
                      <h3>📋 Ingredients</h3>
                      {user && selectedRecipe.extendedIngredients && (
                        <button 
                          onClick={addAllIngredientsToShoppingList}
                          className="add-all-btn"
                        >
                          Add All to Shopping List
                        </button>
                      )}
                    </div>
                    <ul className="ingredients-list">
                      {selectedRecipe.extendedIngredients?.map((ingredient, index) => {
                        const inPantry = user && isInPantry(ingredient.name)
                        return (
                          <li key={index} className={inPantry ? 'in-pantry' : ''}>
                            <span className="ingredient-amount">
                              {inPantry && <span className="pantry-badge">✓ In Pantry</span>}
                              {ingredient.original}
                            </span>
                            {user && !inPantry && (
                              <button 
                                onClick={() => addIngredientToShoppingList(ingredient, selectedRecipe.title)}
                                className="add-to-list-btn"
                              >
                                + Add to List
                              </button>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </div>

                  {selectedRecipe.analyzedInstructions?.[0]?.steps && (
                    <div className="recipe-section">
                      <h3>👨‍🍳 Instructions</h3>
                      <ol className="instructions-list">
                        {selectedRecipe.analyzedInstructions[0].steps.map((step) => (
                          <li key={step.number}>
                            <p>{step.step}</p>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {selectedRecipe.nutrition?.nutrients && (
                    <div className="recipe-section">
                      <h3>📊 Nutrition (per serving)</h3>
                      <div className="nutrition-grid">
                        {selectedRecipe.nutrition.nutrients.slice(0, 8).map((nutrient, index) => (
                          <div key={index} className="nutrient">
                            <span className="nutrient-name">{nutrient.name}</span>
                            <span className="nutrient-value">
                              {nutrient.amount.toFixed(1)}{nutrient.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedRecipe.sourceUrl && (
                    <div className="recipe-section">
                      <a 
                        href={selectedRecipe.sourceUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="source-link"
                      >
                        🔗 View Original Recipe
                      </a>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

function AppContent() {
  const { user } = useAuth()

  if (!user) {
    return <Auth />
  }

  return <MainApp />
}

export default App
