const KEY = 'imgCache_v1'
const TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days

function readStore() {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return {}
    const obj = JSON.parse(raw)
    return obj && typeof obj === 'object' ? obj : {}
  } catch {
    return {}
  }
}

function writeStore(obj) {
  try { sessionStorage.setItem(KEY, JSON.stringify(obj)) } catch {}
}

export function loadImageFromCache(term) {
  try {
    const store = readStore()
    const k = (term || '').toLowerCase()
    const rec = store[k]
    if (!rec) return null
    if (Date.now() - rec.t > TTL_MS) { delete store[k]; writeStore(store); return null }
    return rec.u || null
  } catch { return null }
}

export function saveImageToCache(term, url) {
  try {
    const store = readStore()
    const k = (term || '').toLowerCase()
    store[k] = { u: url, t: Date.now() }
    writeStore(store)
  } catch {}
}
