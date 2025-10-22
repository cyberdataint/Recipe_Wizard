import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import supabase from '../Supabase'
import { useAuth } from './AuthContext'

const DataContext = createContext(null)

export const useData = () => {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}

export const DataProvider = ({ children }) => {
  const { user } = useAuth()
  const [favRecipeTitles, setFavRecipeTitles] = useState([])
  const [favIngredients, setFavIngredients] = useState([])
  const [pantryItems, setPantryItems] = useState([])
  const [loading, setLoading] = useState(false)

  const loadFavorites = async () => {
    if (!user) { setFavRecipeTitles([]); setFavIngredients([]); return }
    try {
      const [{ data: favR }, { data: favI }] = await Promise.all([
        supabase.from('favorites').select('title').eq('user_id', user.id).eq('type', 'recipe').limit(100),
        supabase.from('favorites').select('key, title').eq('user_id', user.id).eq('type', 'ingredient').limit(150)
      ])
      setFavRecipeTitles((favR || []).map(r => r.title).filter(Boolean))
      setFavIngredients((favI || []).map(i => i.key || i.title).filter(Boolean))
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[Data] loadFavorites failed', e)
    }
  }

  const loadPantry = async () => {
    if (!user) { setPantryItems([]); return }
    try {
      const { data } = await supabase.from('pantry_items').select('ingredient_name').eq('user_id', user.id).limit(200)
      setPantryItems((data || []).map(p => p.ingredient_name))
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[Data] loadPantry failed', e)
    }
  }

  const refreshAll = async () => {
    if (!user) { setFavRecipeTitles([]); setFavIngredients([]); setPantryItems([]); return }
    setLoading(true)
    try { await Promise.all([loadFavorites(), loadPantry()]) } finally { setLoading(false) }
  }

  useEffect(() => {
    refreshAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const value = useMemo(() => ({
    favRecipeTitles,
    favIngredients,
    pantryItems,
    refreshFavorites: loadFavorites,
    refreshPantry: loadPantry,
    refreshAll,
    loading
  }), [favRecipeTitles, favIngredients, pantryItems, loading])

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  )
}
