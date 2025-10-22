// Thin wrapper for Spoonacular lookups used by Favorites enrichment
export const fetchRecipeByTitle = async (apiKey, title) => {
  if (!apiKey) return null
  try {
    const url = `https://api.spoonacular.com/recipes/complexSearch?query=${encodeURIComponent(title)}&number=1&addRecipeInformation=true&fillIngredients=true&apiKey=${apiKey}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    return data?.results?.[0] || null
  } catch {
    return null
  }
}
export default { fetchRecipeByTitle }
