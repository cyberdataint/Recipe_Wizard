// Centralized Gemini service: model creation and robust JSON parsing
// Minimizes duplicated setup and encourages consistent JSON-only outputs.

let _sdkPromise = null
const ensureSdk = async () => {
  if (_sdkPromise) return _sdkPromise
  _sdkPromise = import('@google/generative-ai')
  return _sdkPromise
}

// Memoize clients per apiKey to avoid repeatedly constructing the SDK objects
const _clientCache = new Map()
const getClient = async (apiKey) => {
  if (!apiKey) throw new Error('Missing Gemini API key')
  const key = apiKey.trim()
  if (_clientCache.has(key)) return _clientCache.get(key)
  const { GoogleGenerativeAI } = await ensureSdk()
  const genAI = new GoogleGenerativeAI(key)
  _clientCache.set(key, genAI)
  return genAI
}

// Provide a standardized model with JSON output preference.
// opts: { model?: string, temperature?, topP?, responseMimeType?: string }
export const getModel = async (apiKey, opts = {}) => {
  const genAI = await getClient(apiKey)
  const {
    model = 'gemini-2.0-flash',
    temperature,
    topP,
    responseMimeType = 'application/json'
  } = opts
  const generationConfig = { responseMimeType }
  if (typeof temperature === 'number') generationConfig.temperature = temperature
  if (typeof topP === 'number') generationConfig.topP = topP
  return genAI.getGenerativeModel({ model, generationConfig })
}

// Robustly parse JSON from model output.
export const parseModelJson = (raw) => {
  if (!raw || typeof raw !== 'string') return null
  // Fast path
  try { return JSON.parse(raw) } catch {}
  // ```json fenced blocks
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence && fence[1]) {
    try { return JSON.parse(fence[1]) } catch {}
  }
  // Collect candidate objects and prefer those with expected keys
  const objects = raw.match(/\{[\s\S]*?\}/g) || []
  const score = (s) => {
    let pts = 0
    if (/"week"\s*:/.test(s)) pts += 3
    if (/"recipes"\s*:/.test(s)) pts += 2
    if (/"groceryList"\s*:/.test(s)) pts += 1
    if (/"estimatedCost"\s*:/.test(s)) pts += 1
    return pts
  }
  objects.sort((a,b) => score(b) - score(a))
  for (const m of objects) {
    try { const obj = JSON.parse(m); if (obj && typeof obj === 'object') return obj } catch {}
  }
  return null
}
