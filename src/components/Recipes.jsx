import { useEffect, useMemo, useState } from 'react'
import '../App.css'
import { useAuth } from '../contexts/AuthContext'
import favoritesAPI from '../FavoritesAPI'

export default function Recipes() {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [recipes, setRecipes] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [favKeys, setFavKeys] = useState(() => new Set())
  // Simplify: single search bar (search by name)

  const API_KEY = import.meta.env.VITE_SPOONACULAR_API_KEY

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query.trim() || !API_KEY) return
    setLoading(true)
    setSelectedRecipe(null)
    try {
      const url = `https://api.spoonacular.com/recipes/complexSearch?query=${encodeURIComponent(query)}&number=9&addRecipeInformation=true&fillIngredients=true&apiKey=${API_KEY}`
      const response = await fetch(url)
      if (!response.ok) throw new Error('Failed to fetch recipes')
      const data = await response.json()
      setRecipes(data.results || [])
      if ((data.results || []).length === 0) {
        alert('No recipes found. Try a different search!')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Sorry, I encountered an error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Load recipe favorites for the signed-in user
  useEffect(() => {
    let mounted = true
    const load = async () => {
      if (!user) { setFavKeys(new Set()); return }
      const list = await favoritesAPI.listFavorites(user.id, 'recipe')
      if (!mounted) return
      setFavKeys(new Set(list.map((f) => String(f.key))))
    }
    load()
    return () => { mounted = false }
  }, [user])

  const toggleFavorite = async (recipe, e) => {
    e?.stopPropagation?.()
    if (!user) { alert('Please sign in to save favorites'); return }
    const key = String(recipe.id)
    const title = recipe.title || recipe.name
    const metadata = { image: recipe.image, servings: recipe.servings, url: recipe.sourceUrl }
    try {
      const res = await favoritesAPI.toggleFavorite({ userId: user.id, type: 'recipe', key, title, metadata })
      setFavKeys((prev) => {
        const next = new Set(prev)
        if (res.favorited) next.add(key); else next.delete(key)
        return next
      })
    } catch (err) {
      console.error('Failed to toggle favorite', err)
      alert('Could not update favorite. Please try again.')
    }
  }

  const fetchRecipeDetails = async (recipeId) => {
    if (!API_KEY) return
    setLoadingDetails(true)
    try {
      const response = await fetch(
        `https://api.spoonacular.com/recipes/${recipeId}/information?includeNutrition=true&apiKey=${API_KEY}`
      )
      if (!response.ok) throw new Error('Failed to fetch recipe details')
      const data = await response.json()
      setSelectedRecipe(data)
    } catch (error) {
      console.error('Error:', error)
      alert('Sorry, could not load recipe details.')
    } finally {
      setLoadingDetails(false)
    }
  }

  return (
    <div className="main-container">
      {!API_KEY && (
        <div className="welcome-message">
          <h2>Missing API Key</h2>
          <p>Please set VITE_SPOONACULAR_API_KEY in your .env to use recipe search.</p>
        </div>
      )}

      <div className='search-container'>
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={'Search for recipes (e.g., pasta, chicken, dessert)...'}
            className="search-input"
            disabled={loading || !API_KEY}
          />
          <button
            type="submit"
            className="search-button"
            disabled={loading || !query.trim() || !API_KEY}
          >
            {loading ? '🔍 Searching...' : '🔍 Search'}
          </button>
        </form>
      </div>

      {recipes.length === 0 && !loading && (
        <div className="welcome-message">
          <h2>Welcome to Recipe Wizard!</h2>
          <p>Search for recipes by name, ingredients, or cuisine type:</p>
          <div className="example-searches">
            <button onClick={() => { setQuery('pasta carbonara') }}>🍝 Pasta</button>
            <button onClick={() => { setQuery('chicken curry') }}>🍛 Chicken</button>
            <button onClick={() => { setQuery('chocolate cake') }}>🍰 Dessert</button>
            <button onClick={() => { setQuery('healthy salad') }}>🥗 Healthy</button>
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
            >
              {/* Favorite star overlay */}
              <button
                className={`recipe-fav-btn ${favKeys.has(String(recipe.id)) ? 'favorited' : ''}`}
                onClick={(e) => toggleFavorite(recipe, e)}
                title={favKeys.has(String(recipe.id)) ? 'Unfavorite' : 'Favorite'}
              >
                {favKeys.has(String(recipe.id)) ? '★' : '☆'}
              </button>
              <img
                src={recipe.image}
                alt={recipe.title || recipe.name}
                className="recipe-image"
                onClick={() => fetchRecipeDetails(recipe.id)}
              />
              <div className="recipe-info" onClick={() => fetchRecipeDetails(recipe.id)}>
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
                <button className="view-details-btn">View Recipe Details →</button>
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
                  <h3>📋 Ingredients</h3>
                  <ul className="ingredients-list">
                    {selectedRecipe.extendedIngredients?.map((ingredient, index) => (
                      <li key={index}>
                        <span className="ingredient-amount">{ingredient.original}</span>
                      </li>
                    ))}
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
                    <button
                      style={{ marginLeft: 12 }}
                      className="search-button"
                      onClick={(e) => toggleFavorite(selectedRecipe, e)}
                      title={favKeys.has(String(selectedRecipe.id)) ? 'Unfavorite' : 'Favorite'}
                    >
                      {favKeys.has(String(selectedRecipe.id)) ? '★ Favorited' : '☆ Add to Favorites'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
