import supabase from './Supabase'

// Favorites API for recipes and ingredients
// Table design (SQL in README):
// favorites(id uuid pk, user_id uuid, type text, key text, title text, metadata jsonb, created_at timestamptz)
// Unique: (user_id, type, key)

const TABLE = 'favorites'

export async function listFavorites(userId, type) {
  if (!userId) return []
  let query = supabase.from(TABLE).select('*').eq('user_id', userId).order('created_at', { ascending: false })
  if (type) query = query.eq('type', type)
  const { data, error } = await query
  if (error) {
    if (import.meta.env.DEV) console.error('[favorites] list error', error)
    return []
  }
  return data || []
}

export async function isFavorited(userId, type, key) {
  if (!userId || !key) return false
  const { data, error } = await supabase
    .from(TABLE)
    .select('id')
    .eq('user_id', userId)
    .eq('type', type)
    .eq('key', String(key))
    .maybeSingle()
  if (error && error.code !== 'PGRST116') {
    if (import.meta.env.DEV) console.error('[favorites] isFavorited error', error)
  }
  return !!data
}

export async function addFavorite({ userId, type, key, title, metadata }) {
  if (!userId || !type || !key) throw new Error('Missing userId/type/key')
  const payload = { user_id: userId, type, key: String(key), title: title || String(key), metadata: metadata || {} }
  const { data, error } = await supabase
    .from(TABLE)
    .insert([payload])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function removeFavorite({ userId, type, key }) {
  if (!userId || !type || !key) throw new Error('Missing userId/type/key')
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('type', type)
    .eq('key', String(key))
  if (error) throw error
  return true
}

export async function toggleFavorite({ userId, type, key, title, metadata }) {
  const exist = await isFavorited(userId, type, key)
  if (exist) {
    await removeFavorite({ userId, type, key })
    return { favorited: false }
  }
  await addFavorite({ userId, type, key, title, metadata })
  return { favorited: true }
}

export default {
  listFavorites,
  isFavorited,
  addFavorite,
  removeFavorite,
  toggleFavorite,
}
