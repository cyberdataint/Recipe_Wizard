import { getModel as getGeminiModel } from '../services/geminiService'

export const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export const collectWeekTitles = (week) => {
  const out = []
  for (const d of (week || [])) {
    const meals = d?.meals || {}
    for (const k of ['breakfast','lunch','dinner']) {
      const t = meals?.[k]
      if (!t) continue
      if (/^leftover/i.test(t)) continue
      out.push(t)
    }
  }
  return out
}

export const hasDuplicates = (titles) => {
  const seen = new Set()
  for (const t of titles.map((s) => (s || '').toLowerCase().trim())) {
    if (seen.has(t)) return true
    seen.add(t)
  }
  return false
}

// Replace duplicate recipes by asking Gemini to de-duplicate while preserving structure
export const enforceDiversity = async (wk, doNotRepeat, apiKey) => {
  const titles = collectWeekTitles(wk)
  if (!hasDuplicates(titles)) return wk
  try {
    const model = await getGeminiModel(apiKey)
    const instructions = {
      rule: 'Replace duplicate recipes with new distinct recipes. No repeated titles across the week. Keep servings, days, and meals the same.',
      avoidTitles: (doNotRepeat || []).slice(-60)
    }
    const text = `\nDe-duplicate this meal plan. Return only the week array, same shape.\nCurrent week:\n${JSON.stringify(wk, null, 2)}\nInstructions:\n${JSON.stringify(instructions, null, 2)}`
    const res = await model.generateContent(text)
    const raw = res.response.text()
    let data
    try { data = JSON.parse(raw) } catch { const m = raw.match(/\[[\s\S]*\]/); data = m ? JSON.parse(m[0]) : null }
    const newWeek = Array.isArray(data) ? data : wk
    return newWeek
  } catch { return wk }
}

// Quick, common substitution tips; keep short and generic
const SUBS = [
  { k: [/\begg(s)?\b/], tip: 'Sub: flax egg (1 tbsp ground flax + 3 tbsp water) for baking; or applesauce in some cakes.' },
  { k: [/\bbutter\b/], tip: 'Sub: olive oil for sautéing; coconut oil or margarine for baking.' },
  { k: [/\bmilk\b/], tip: 'Sub: almond/soy/oat milk (unsweetened) 1:1.' },
  { k: [/\bcream\b/], tip: 'Sub: half-and-half, evaporated milk, or cashew cream.' },
  { k: [/\bsour cream\b/], tip: 'Sub: Greek yogurt 1:1.' },
  { k: [/\bheavy cream\b/], tip: 'Sub: 3/4 cup milk + 1/4 cup butter (for cooking, not whipping).' },
  { k: [/\bbuttermilk\b/], tip: 'Sub: 1 cup milk + 1 tbsp lemon juice or vinegar (5–10 min rest).' },
  { k: [/\bflour\b/], tip: 'Sub: gluten-free blend 1:1 (check binding), or almond flour (adjust liquids).' },
  { k: [/\bsoy sauce\b/], tip: 'Sub: tamari (GF) or coconut aminos (sweeter, less salty).' },
  { k: [/\bvinegar\b/], tip: 'Sub: lemon juice (to taste), or another mild vinegar.' },
  { k: [/\bmayonnaise\b/], tip: 'Sub: Greek yogurt + a little oil and lemon.' },
  { k: [/\bcheddar|mozzarella|parmesan\b/], tip: 'Sub: similar melting cheese; for dairy-free use vegan shreds or nutritional yeast for flavor.' },
  { k: [/\bchicken breast\b/], tip: 'Sub: thighs (juicier), turkey breast, or tofu (press first).' },
  { k: [/\bbeef\b/], tip: 'Sub: turkey, chicken, or lentils for crumble.' },
  { k: [/\bfish\b/], tip: 'Sub: firm tofu or chickpeas for salads/curries.' },
  { k: [/\bwhite sugar\b|\bsugar\b/], tip: 'Sub: coconut sugar (1:1, browns darker) or honey (reduce liquid slightly).' },
]

export const getSubstitutionTip = (name) => {
  const n = (name || '').toLowerCase()
  for (const e of SUBS) {
    if (e.k.some((re) => re.test(n))) return e.tip
  }
  return ''
}
