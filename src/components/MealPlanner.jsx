import { useEffect, useRef, useState } from 'react'
import './MealPlanner.css'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import supabase from '../Supabase'
import krogerAPI from '../KrogerAPI'
import StorePicker from './StorePicker'
import { getModel as getGeminiModel, parseModelJson } from '../services/geminiService'
import { norm, collectWeekTitles, enforceDiversity, getSubstitutionTip } from '../utils/planUtils'
import UITooltip from './UITooltip'
import { fetchRecipeByTitle as fetchRecipeByTitleSvc } from '../services/spoonacularService'

export default function MealPlanner() {
  const apiKey = (import.meta.env.VITE_GEMINI_API_KEY || '').trim()
  const SPOON_KEY = (import.meta.env.VITE_SPOONACULAR_API_KEY || '').trim()
  const { user } = useAuth()
  const { favRecipeTitles: ctxFavRecipes, favIngredients: ctxFavIngs, pantryItems: ctxPantry } = useData()

  const [servings, setServings] = useState(4)
  const [budget, setBudget] = useState('')
  const [diet, setDiet] = useState('any')
  const [days, setDays] = useState(7)
  const [includeBreakfast, setIncludeBreakfast] = useState(false)
  const [includeLunch, setIncludeLunch] = useState(true)
  const [includeDinner, setIncludeDinner] = useState(true)
  const [useFavorites, setUseFavorites] = useState(true)
  const [usePantry, setUsePantry] = useState(true)

  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [analyzing, setAnalyzing] = useState(false)
  const [recipeDetails, setRecipeDetails] = useState({})
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [aggGroceries, setAggGroceries] = useState([])
  const [buyGroceries, setBuyGroceries] = useState([])
  const [pantryOnlyGroceries, setPantryOnlyGroceries] = useState([])
  const [prices, setPrices] = useState({})
  const [estCost, setEstCost] = useState(null)
  const [sending, setSending] = useState(false)
  const [sendStatus, setSendStatus] = useState('')
  const [autoFitBudget, setAutoFitBudget] = useState(false)
  const [budgetNote, setBudgetNote] = useState('')
  // Tooltip state (portal-based to avoid clipping inside scroll areas)
  const [tipOpen, setTipOpen] = useState(false)
  const [tipText, setTipText] = useState('')
  const [tipRect, setTipRect] = useState(null)

  // Preference options and state
  const PROTEIN_OPTIONS = ['chicken','beef','pork','turkey','fish','seafood','tofu','tempeh','eggs','beans','lentils']
  const EQUIPMENT_OPTIONS = ['stovetop','oven','slow cooker','instant pot','air fryer','grill']
  const ALLERGEN_OPTIONS = ['dairy','eggs','fish','shellfish','tree nuts','peanuts','wheat/gluten','soy','sesame']
  const [selectedProteins, setSelectedProteins] = useState([])
  const [avoidIngredientsText, setAvoidIngredientsText] = useState('')
  const [preferredCuisinesText, setPreferredCuisinesText] = useState('')
  const [maxCookTime, setMaxCookTime] = useState('')
  const [spiceLevel, setSpiceLevel] = useState('any')
  const [allowLeftovers, setAllowLeftovers] = useState(true)
  const [selectedEquipment, setSelectedEquipment] = useState([])
  const [selectedAllergens, setSelectedAllergens] = useState([])
  const [otherAllergensText, setOtherAllergensText] = useState('')
  const [advTab, setAdvTab] = useState('dietary') // 'dietary' | 'cooking' | 'allergies' | 'nutrition'
  // Nutrition
  const [dailyCalories, setDailyCalories] = useState('')
  const [nutritionStyle, setNutritionStyle] = useState('balanced')
  const [macroProtein, setMacroProtein] = useState('') // grams/day
  const [macroCarbs, setMacroCarbs] = useState('')
  const [macroFat, setMacroFat] = useState('')
  // Dietary extras
  const [strictProteinRotation, setStrictProteinRotation] = useState(false)
  const [seasonalProduce, setSeasonalProduce] = useState(false)
  const [wholeGrains, setWholeGrains] = useState(false)
  const [lowProcessed, setLowProcessed] = useState(false)
  const [minUniqueDinners, setMinUniqueDinners] = useState('')
  // Cooking extras
  const [difficulty, setDifficulty] = useState('any') // any|easy|moderate|advanced
  const [onePanMeals, setOnePanMeals] = useState(false)
  const [batchCookFriendly, setBatchCookFriendly] = useState(false)
  const [leftoversForLunch, setLeftoversForLunch] = useState(false)

  const plannerRef = useRef(null)
  const pantrySetRef = useRef(new Set())
  const favTitleSetRef = useRef(new Set())
  const refineAttemptsRef = useRef(0)
  const MAX_REFINE_ATTEMPTS = 10
  const dietOptions = [
    { value: 'any', label: 'Any' },
    { value: 'vegetarian', label: 'Vegetarian' },
    { value: 'vegan', label: 'Vegan' },
    { value: 'gluten-free', label: 'Gluten-free' },
    { value: 'dairy-free', label: 'Dairy-free' },
    { value: 'keto', label: 'Keto' },
    { value: 'paleo', label: 'Paleo' }
  ]

  

  const toggleSelect = (list, setter, value) => {
    if (list.includes(value)) setter(list.filter(v => v !== value))
    else setter([...list, value])
  }

  // Diversity helpers: persist recent titles and refine away duplicates
  const RECENT_KEY = 'planner_recent_titles'
  const loadRecentTitles = () => {
    try {
      const raw = localStorage.getItem(RECENT_KEY)
      const arr = raw ? JSON.parse(raw) : []
      return Array.isArray(arr) ? arr : []
    } catch { return [] }
  }
  const saveRecentTitles = (titles) => {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(Array.from(new Set(titles)).slice(-60))) } catch {}
  }
  

  const generate = async () => {
    if (!apiKey) {
      setError('Missing VITE_GEMINI_API_KEY. Add it to your .env and restart the dev server.')
      return
    }
    setLoading(true)
    setError('')
  refineAttemptsRef.current = 0
    try {
      // Gather context
      const selectedMeals = [
        ...(includeBreakfast ? ['breakfast'] : []),
        ...(includeLunch ? ['lunch'] : []),
        ...(includeDinner ? ['dinner'] : [])
      ]

      let favRecipeTitles = []
      let favIngredients = []
      let pantryItems = []
      if (user) {
        if (useFavorites) {
          favRecipeTitles = (ctxFavRecipes || []).slice(0, 50)
          favIngredients = (ctxFavIngs || []).slice(0, 80)
        }
        if (usePantry) {
          pantryItems = (ctxPantry || []).slice(0, 120)
        }
      }
      favTitleSetRef.current = new Set(favRecipeTitles)
      pantrySetRef.current = new Set((pantryItems || []).map((n) => norm(n)))

      const model = await getGeminiModel(apiKey, { temperature: 0.9, topP: 0.95 })

  const system = 'You are a meal planning assistant. Output strict JSON only, no prose.'
      const recentTitles = loadRecentTitles()
      const cuisines = preferredCuisinesText.split(',').map(s => s.trim()).filter(Boolean).slice(0, 10)
      const avoidIngredientsArr = avoidIngredientsText.split(',').map(s => s.trim()).filter(Boolean).slice(0, 30)
      const otherAllergens = otherAllergensText.split(',').map(s => s.trim()).filter(Boolean).slice(0, 20)
      const prompt = {
        servings,
        budget: budget ? Number(budget) : undefined,
        diet,
        days,
        meals: selectedMeals,
        favorites: {
          recipes: favRecipeTitles.slice(0, 30),
          ingredients: favIngredients.slice(0, 60)
        },
        pantry: pantryItems.slice(0, 100),
        preferences: {
          proteins: selectedProteins.slice(0, 10),
          cuisines,
          avoid_ingredients: avoidIngredientsArr,
          allergies: { flags: selectedAllergens.slice(0, 12), other: otherAllergens },
          spice_level: spiceLevel === 'any' ? undefined : spiceLevel,
          max_cook_time_minutes: maxCookTime ? Number(maxCookTime) : undefined,
          equipment: selectedEquipment.slice(0, 6),
          allow_leftovers: allowLeftovers,
          leftovers_for_lunch: leftoversForLunch,
          nutrition: {
            daily_calories: dailyCalories ? Number(dailyCalories) : undefined,
            style: nutritionStyle,
            macros_g_per_day: {
              protein: macroProtein ? Number(macroProtein) : undefined,
              carbs: macroCarbs ? Number(macroCarbs) : undefined,
              fat: macroFat ? Number(macroFat) : undefined
            }
          },
          extras: {
            strict_protein_rotation: strictProteinRotation,
            seasonal_produce: seasonalProduce,
            whole_grains: wholeGrains,
            low_processed: lowProcessed,
            min_unique_dinners: minUniqueDinners ? Number(minUniqueDinners) : undefined,
            difficulty: difficulty,
            one_pan: onePanMeals,
            batch_cook_friendly: batchCookFriendly
          }
        },
        constraints: { prefer_variety: true, avoid_repeats: true, no_duplicate_titles: true, rotate_proteins: (selectedProteins.length > 0) || strictProteinRotation },
        do_not_repeat: recentTitles.slice(-60)
      }
  const schema = `Return JSON with keys:{\n  week: [ { day: string, meals: { breakfast?: string, lunch?: string, dinner?: string } } ],\n  recipes: { [title: string]: { servings: number, ingredients: [ { name: string, amount?: number, unit?: string, note?: string } ], instructions: string[] } },\n  groceryList?: string[],\n  estimatedCost?: number,\n  batchPrep?: string[]\n}\nRules:\n- Respect user preferences: choose proteins only from preferences.proteins; avoid any ingredients in preferences.avoid_ingredients; prefer cuisines in preferences.cuisines.\n- Strictly avoid all allergens in preferences.allergies.flags and preferences.allergies.other (e.g., no wheat/gluten, tree nuts, peanuts, etc.).\n- Aim for spice level ~ preferences.spice_level when set.\n- Keep dinner cook time under preferences.max_cook_time_minutes when set.\n- If leftovers are allowed, you may schedule 'Leftover X' sparingly; if preferences.leftovers_for_lunch is true, prefer leftover dinners for next-day lunch.\n- If preferences.nutrition.daily_calories is defined, aim for the total daily plan to be within ±10% of this value. Prefer recipes matching preferences.nutrition.style (balanced|high-protein|low-carb|low-fat). If macros (g/day) are provided, keep the day within ±15% of those targets.\n- Consider extras: enforce strict protein rotation when extras.strict_protein_rotation; prefer seasonal produce, whole grains; minimize processed foods; target at least extras.min_unique_dinners different dinner titles if provided; prefer one-pan and batch-cook-friendly recipes when flagged; honor difficulty when set.\n- No duplicate recipe titles across the week. Avoid titles in do_not_repeat.\n- Recipes must include step-by-step instructions (short imperative sentences).\n- Ingredient names should be grocery-friendly (e.g., 'garlic', 'olive oil').\n- If unsure of exact amounts, provide best estimate.`
      const text = `\n${system}\n${schema}\nInput:\n${JSON.stringify(prompt, null, 2)}\nOutput JSON:`

      const res = await model.generateContent(text)
      const raw = res.response.text()

      let data = parseModelJson(raw)
      if (!data) throw new Error('Model did not return JSON')

      let wk = Array.isArray(data.week) ? data.week.slice(0, days) : []
      // One-pass de-duplication refinement using Gemini if duplicates found
      wk = await enforceDiversity(wk, recentTitles.concat(favRecipeTitles))
      const next = {
        week: wk,
        groceryList: Array.isArray(data.groceryList) ? data.groceryList : [],
        estimatedCost: typeof data.estimatedCost === 'number' ? data.estimatedCost : null,
        batchPrep: Array.isArray(data.batchPrep) ? data.batchPrep : []
      }
  setPlan(next)

      // Seed recipeDetails from Gemini so the modal has steps immediately
      let seedFromModel = null
      if (data.recipes && typeof data.recipes === 'object') {
        const mapped = {}
        for (const [title, rec] of Object.entries(data.recipes)) {
          const extendedIngredients = (rec.ingredients || []).map((ing) => ({
            original: [ing.amount != null ? String(ing.amount) : '', ing.unit || '', ing.name || ''].filter(Boolean).join(' '),
            name: ing.name || '',
            unit: ing.unit || '',
            amount: typeof ing.amount === 'number' ? ing.amount : undefined
          }))
          const analyzedInstructions = [{ steps: (rec.instructions || []).map((s, i) => ({ number: i + 1, step: String(s) })) }]
          mapped[title] = {
            title,
            servings: rec.servings || servings,
            extendedIngredients,
            analyzedInstructions
          }
        }
        setRecipeDetails((prev) => ({ ...prev, ...mapped }))
        seedFromModel = mapped
      }
  // Persist recent titles to discourage repeats in future generations
  const finalTitles = collectWeekTitles(wk)
  saveRecentTitles(recentTitles.concat(finalTitles))
  // Analyze and optionally fit to budget
  const result = await analyzePlan(wk, seedFromModel)
      if (autoFitBudget && Number(budget) > 0 && result?.estCost != null && result.estCost > Number(budget)) {
        await regenerateWithinBudget({ currentWeek: wk, currentCost: result.estCost })
      }
    } catch (e) {
      console.error('Planner error:', e)
      setError(e?.message || 'Failed to generate plan')
    } finally {
      setLoading(false)
    }
  }

  // norm is imported from utils/planUtils

  const getDistinctRecipeTitles = (week) => {
    const titles = []
    for (const d of (week || [])) {
      const meals = d?.meals || {}
      for (const k of ['breakfast','lunch','dinner']) {
        const t = meals?.[k]
        if (!t) continue
        if (/^leftover/i.test(t)) continue
        titles.push(t)
      }
    }
    return Array.from(new Set(titles))
  }

  const fetchRecipeByTitle = (title) => fetchRecipeByTitleSvc(SPOON_KEY, title)

  const analyzePlan = async (week, seedDetails = null) => {
    if (!week || week.length === 0) return
    setAnalyzing(true)
    try {
      const titles = getDistinctRecipeTitles(week)
      const details = { ...(seedDetails || {}), ...recipeDetails }
      // If user opted to use favorites and Spoonacular key is available, enrich only those titles
      if (useFavorites && SPOON_KEY) {
        for (const title of titles) {
          if (favTitleSetRef.current.has(title) && !details[title]) {
            details[title] = await fetchRecipeByTitle(title)
          }
        }
        setRecipeDetails(details)
      }

      // Fill missing recipe details via Gemini to ensure all ingredients are considered
      const missingTitles = titles.filter((t) => !details[t])
      if (missingTitles.length > 0) {
        try {
          const model = await getGeminiModel(apiKey, { temperature: 0.4 })
          const schema = `Return JSON object where keys are recipe titles and values are { servings: number, ingredients: [ { name: string, amount?: number, unit?: string } ], instructions: string[] }. Use grocery-friendly names and numeric amounts when possible.`
          const text = `\nYou are a cooking assistant. Output strict JSON only.\n${schema}\nTitles:\n${JSON.stringify(missingTitles, null, 2)}\nJSON:`
          const res = await model.generateContent(text)
          const raw = res.response.text()
          let obj = parseModelJson(raw)
          if (obj && typeof obj === 'object') {
            const mapped = {}
            for (const [title, rec] of Object.entries(obj)) {
              const extendedIngredients = (rec?.ingredients || []).map((ing) => ({
                original: [ing.amount != null ? String(ing.amount) : '', ing.unit || '', ing.name || ''].filter(Boolean).join(' '),
                name: ing.name || '',
                unit: ing.unit || '',
                amount: typeof ing.amount === 'number' ? ing.amount : undefined
              }))
              mapped[title] = {
                title,
                servings: rec?.servings || undefined,
                extendedIngredients,
                analyzedInstructions: [{ steps: (rec?.instructions || []).map((s, i) => ({ number: i + 1, step: String(s) })) }]
              }
            }
            Object.assign(details, mapped)
            setRecipeDetails((prev) => ({ ...prev, ...mapped }))
          }
        } catch (e) {
          console.warn('Gemini fill for missing titles failed:', e)
        }
      }

      const countByTitle = {}
      for (const d of week) {
        for (const k of ['breakfast','lunch','dinner']) {
          const t = d?.meals?.[k]
          if (!t || /^leftover/i.test(t)) continue
          countByTitle[t] = (countByTitle[t] || 0) + 1
        }
      }

      const map = new Map()
      for (const [title, det] of Object.entries(details)) {
        if (!det?.extendedIngredients) continue
        const occurs = countByTitle[title] || 0
        if (occurs === 0) continue
        const baseServings = Number(det.servings) || servings
        const scale = (servings / baseServings) * occurs
        for (const ing of det.extendedIngredients) {
          const name = ing?.nameClean || ing?.name || ing?.originalName || ''
          const unit = ing?.unit || ''
          const baseAmt = Number(ing?.amount)
          const amount = (isNaN(baseAmt) ? 0 : baseAmt) * scale
          if (!name) continue
          const key = `${norm(name)}|${unit.toLowerCase()}`
          const prev = map.get(key)
          if (prev) prev.amount += amount; else map.set(key, { name, unit, amount })
        }
      }
      let agg = Array.from(map.values()).sort((a,b) => a.name.localeCompare(b.name))

      // Merge simple plan.groceryList terms for anything not already in agg
      if (plan?.groceryList && Array.isArray(plan.groceryList) && plan.groceryList.length > 0) {
        const existing = new Set(agg.map((a) => norm(a.name)))
        for (const n of plan.groceryList) {
          const k = norm(n)
          if (!existing.has(k)) {
            agg.push({ name: n, unit: '', amount: 0 })
            existing.add(k)
          }
        }
        agg = agg.sort((a,b) => a.name.localeCompare(b.name))
      }
      setAggGroceries(agg)

      // Split into to-buy vs already-in-pantry
      let buy = []
      let covered = []
      const pset = pantrySetRef.current
      for (const item of agg) {
        const key = norm(item.name)
        if (usePantry && pset.has(key)) covered.push(item); else buy.push(item)
      }

      // Note: plan.groceryList items were merged above, so no special fallback needed here
      setBuyGroceries(buy)
      setPantryOnlyGroceries(covered)

      let localPrices = {}
      let estCalc = null
      if (krogerAPI.locationId && buy.length) {
        // Pre-group unique normalized names to reduce pricing calls
        const uniqueNameMap = new Map()
        for (const item of buy) {
          const k = norm(item.name)
          if (!uniqueNameMap.has(k)) uniqueNameMap.set(k, item.name)
        }
        const names = Array.from(uniqueNameMap.values())
        const res = await krogerAPI.findMultipleIngredients(names)
        const pmap = {}
        let total = 0
        res.forEach(r => {
          if (r?.product) {
            pmap[norm(r.ingredient)] = r.product
            total += Number(r.product.price || 0)
          }
        })
        localPrices = pmap
        estCalc = total || null
        setPrices(localPrices)
        setEstCost(estCalc)
      } else {
        localPrices = {}
        estCalc = null
        setPrices({})
        setEstCost(null)
      }
      const result = { agg, buy, covered, prices: localPrices, estCost: estCalc }
      return result
    } finally {
      setAnalyzing(false)
    }
  }

  const regenerateWithinBudget = async ({ currentWeek, currentCost }) => {
    if (refineAttemptsRef.current >= MAX_REFINE_ATTEMPTS) {
      setBudgetNote(`Could not reach budget after ${MAX_REFINE_ATTEMPTS} attempts`)
      setTimeout(() => setBudgetNote(''), 3000)
      return
    }
    try {
      refineAttemptsRef.current += 1
      setBudgetNote(`Fitting to budget (attempt ${refineAttemptsRef.current} of ${MAX_REFINE_ATTEMPTS})…`)
  const model = await getGeminiModel(apiKey)
      const feedback = {
        currentCost,
        targetBudget: Number(budget),
        guidance: 'Replace expensive recipes and ingredients with lower-cost options (beans, lentils, eggs, rice, seasonal produce, value brands). Prefer recipes that reuse inexpensive staples. Keep variety and dietary constraints. Preserve servings and days. Maintain user preferences. Output full JSON again, same schema as before.',
        preferences: {
          proteins: selectedProteins,
          cuisines: preferredCuisinesText.split(',').map(s=>s.trim()).filter(Boolean).slice(0,10),
          avoid_ingredients: avoidIngredientsText.split(',').map(s=>s.trim()).filter(Boolean).slice(0,30),
          spice_level: spiceLevel === 'any' ? undefined : spiceLevel,
          max_cook_time_minutes: maxCookTime ? Number(maxCookTime) : undefined,
          equipment: selectedEquipment,
          allow_leftovers: allowLeftovers,
          allergies: { flags: selectedAllergens, other: otherAllergensText.split(',').map(s=>s.trim()).filter(Boolean).slice(0,20) },
          leftovers_for_lunch: leftoversForLunch,
          nutrition: { daily_calories: dailyCalories ? Number(dailyCalories) : undefined, style: nutritionStyle, macros_g_per_day: { protein: macroProtein ? Number(macroProtein) : undefined, carbs: macroCarbs ? Number(macroCarbs) : undefined, fat: macroFat ? Number(macroFat) : undefined } },
          extras: { strict_protein_rotation: strictProteinRotation, seasonal_produce: seasonalProduce, whole_grains: wholeGrains, low_processed: lowProcessed, min_unique_dinners: minUniqueDinners ? Number(minUniqueDinners) : undefined, difficulty, one_pan: onePanMeals, batch_cook_friendly: batchCookFriendly }
        }
      }
      const system = 'You are a meal planning assistant. Output strict JSON only, no prose.'
      const schema = `Return JSON with keys:{
  week: [ { day: string, meals: { breakfast?: string, lunch?: string, dinner?: string } } ],
  recipes: { [title: string]: { servings: number, ingredients: [ { name: string, amount?: number, unit?: string, note?: string } ], instructions: string[] } },
  groceryList?: string[],
  estimatedCost?: number,
  batchPrep?: string[]
}
Rules:
- Respect user preferences: choose proteins only from preferences.proteins; avoid any ingredients in preferences.avoid_ingredients; prefer cuisines in preferences.cuisines.
- Strictly avoid all allergens in preferences.allergies.flags and preferences.allergies.other (e.g., no wheat/gluten, tree nuts, peanuts, etc.).
- Aim for spice level ~ preferences.spice_level when set.
- Keep dinner cook time under preferences.max_cook_time_minutes when set.
- If leftovers are allowed, you may schedule 'Leftover X' sparingly; if preferences.leftovers_for_lunch is true, prefer leftover dinners for next-day lunch.
- If preferences.nutrition.daily_calories is defined, aim for the total daily plan to be within ±10% of this value. Prefer recipes matching preferences.nutrition.style (balanced|high-protein|low-carb|low-fat). If macros (g/day) are provided, keep the day within ±15% of those targets.
- Consider extras: enforce strict protein rotation when extras.strict_protein_rotation; prefer seasonal produce, whole grains; minimize processed foods; target at least extras.min_unique_dinners different dinner titles if provided; prefer one-pan and batch-cook-friendly recipes when flagged; honor difficulty when set.
- No duplicate recipe titles across the week. Avoid titles in do_not_repeat.
- Recipes must include step-by-step instructions (short imperative sentences).
- Ingredient names should be grocery-friendly (e.g., 'garlic', 'olive oil').
- If unsure of exact amounts, provide best estimate.`
      const text = `\n${system}\n${schema}\nRe-generate a full plan that fits the target budget. Keep days=${days}, servings=${servings}, diet=${diet}.\nMaintain these preferences (when provided):\n${JSON.stringify(feedback.preferences, null, 2)}\nHere is the current week array to improve (same shape required):\n${JSON.stringify(currentWeek, null, 2)}\nFeedback (reasoning signal only):\n${JSON.stringify(feedback, null, 2)}\nOutput JSON:`
      const res = await model.generateContent(text)
      const raw = res.response.text()
      let data = parseModelJson(raw)
      if (!data) throw new Error('Budget refinement failed')
      const wk = Array.isArray(data.week) ? data.week.slice(0, days) : []
      const next = {
        week: wk,
        groceryList: Array.isArray(data.groceryList) ? data.groceryList : [],
        estimatedCost: typeof data.estimatedCost === 'number' ? data.estimatedCost : null,
        batchPrep: Array.isArray(data.batchPrep) ? data.batchPrep : []
      }
      setPlan(next)
      // seed recipe details if provided
      let seedFromModel = null
      if (data.recipes && typeof data.recipes === 'object') {
        const mapped = {}
        for (const [title, rec] of Object.entries(data.recipes)) {
          const extendedIngredients = (rec.ingredients || []).map((ing) => ({
            original: [ing.amount != null ? String(ing.amount) : '', ing.unit || '', ing.name || ''].filter(Boolean).join(' '),
            name: ing.name || '', unit: ing.unit || '', amount: typeof ing.amount === 'number' ? ing.amount : undefined
          }))
          const analyzedInstructions = [{ steps: (rec.instructions || []).map((s, i) => ({ number: i + 1, step: String(s) })) }]
          mapped[title] = { title, servings: rec.servings || servings, extendedIngredients, analyzedInstructions }
        }
        setRecipeDetails((prev) => ({ ...prev, ...mapped }))
        seedFromModel = mapped
      }
      const result = await analyzePlan(wk, seedFromModel)
      if (result?.estCost != null && Number(budget) > 0 && result.estCost > Number(budget)) {
        // Try again if still over budget
        if (refineAttemptsRef.current < MAX_REFINE_ATTEMPTS) {
          // brief backoff to reduce contention and improve success rate
          await new Promise((r) => setTimeout(r, 150))
          await regenerateWithinBudget({ currentWeek: wk, currentCost: result.estCost })
        } else {
          setBudgetNote('Still over budget after refinement')
          setTimeout(() => setBudgetNote(''), 3000)
        }
      } else {
        setBudgetNote('Adjusted to fit budget')
        setTimeout(() => setBudgetNote(''), 2000)
      }
    } catch (e) {
      console.error('Budget refinement error:', e)
      setBudgetNote('Budget fitting failed')
      setTimeout(() => setBudgetNote(''), 3000)
    }
  }

  const exportPdf = async () => {
    try {
      const node = plannerRef.current
      if (!node) return
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf')
      ])
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff' })
      const img = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width, canvas.height] })
      pdf.addImage(img, 'PNG', 0, 0, canvas.width, canvas.height)
      pdf.save('meal-plan.pdf')
    } catch (e) {
      alert('Failed to export PDF')
      console.error(e)
    }
  }

  const sendGroceryListToShoppingList = async () => {
    if (!user) {
      setSendStatus('Please sign in to use the shopping list')
      setTimeout(() => setSendStatus(''), 2500)
      return
    }
    const items = (buyGroceries && buyGroceries.length > 0)
      ? buyGroceries.map(g => ({
          ingredient_name: g.name,
          quantity: g.amount ? String(Number(g.amount.toFixed(2))) : '',
          unit: g.unit || '',
          category: '',
          recipe_name: ''
        }))
      : (plan?.groceryList || []).map(name => ({ ingredient_name: name, quantity: '', unit: '', category: '', recipe_name: '' }))

    if (items.length === 0) {
      setSendStatus('Nothing to send')
      setTimeout(() => setSendStatus(''), 2000)
      return
    }
    try {
      setSending(true)
      const payload = items.map(i => ({
        ingredient_name: i.ingredient_name,
        quantity: i.quantity || '',
        unit: i.unit || '',
        category: i.category || '',
        recipe_name: i.recipe_name || '',
        notes: '',
        user_id: user.id,
        checked: false
      }))
      const { error } = await supabase.from('shopping_list_items').insert(payload)
      if (error) throw error
      setSendStatus(`Added ${items.length} item${items.length > 1 ? 's' : ''} to Shopping List`)
      setTimeout(() => setSendStatus(''), 2500)
    } catch (e) {
      console.error('Send grocery list error:', e)
      setSendStatus('Failed to add items')
      setTimeout(() => setSendStatus(''), 2500)
    } finally {
      setSending(false)
    }
  }

  const printGroceryList = () => {
    try {
      document.body.classList.add('print-grocery')
      const cleanup = () => document.body.classList.remove('print-grocery')
      if ('onafterprint' in window) {
        const handler = () => { window.removeEventListener('afterprint', handler); cleanup() }
        window.addEventListener('afterprint', handler)
      } else {
        setTimeout(cleanup, 1500)
      }
      window.print()
    } catch {}
  }

  return (
    <div className="planner">
      <div className="planner-controls">
        <div className="row">
          <label>Servings</label>
          <input type="number" min={1} max={10} value={servings} onChange={(e) => setServings(Number(e.target.value))} />
          <label>Budget ($)</label>
          <input type="number" min={0} step={1} placeholder="Optional" value={budget} onChange={(e) => setBudget(e.target.value)} />
          <label>Diet</label>
          <select value={diet} onChange={(e) => setDiet(e.target.value)}>
            {dietOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <label>Days</label>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[5,6,7].map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="row">
          <div className="adv-chipgroup">
            <label className="chip">
              <input type="checkbox" checked={includeBreakfast} onChange={(e) => setIncludeBreakfast(e.target.checked)} />
              <span>Breakfast</span>
            </label>
            <label className="chip">
              <input type="checkbox" checked={includeLunch} onChange={(e) => setIncludeLunch(e.target.checked)} />
              <span>Lunch</span>
            </label>
            <label className="chip">
              <input type="checkbox" checked={includeDinner} onChange={(e) => setIncludeDinner(e.target.checked)} />
              <span>Dinner</span>
            </label>
          </div>
          <div className="adv-chipgroup">
            <label className="chip">
              <input type="checkbox" checked={useFavorites} onChange={(e) => setUseFavorites(e.target.checked)} />
              <span>Use favorites</span>
            </label>
            <label className="chip">
              <input type="checkbox" checked={usePantry} onChange={(e) => setUsePantry(e.target.checked)} />
              <span>Use pantry</span>
            </label>
            <label className="chip" style={{ marginLeft: 8 }}>
              <input type="checkbox" checked={autoFitBudget} onChange={(e) => setAutoFitBudget(e.target.checked)} />
              <span>Auto fit to budget</span>
            </label>
          </div>
          <button className="gen-btn" onClick={generate} disabled={loading || !apiKey}>{loading ? 'Generating…' : 'Generate Plan'}</button>
          {plan && <button className="pdf-btn" onClick={exportPdf}>Download PDF</button>}
        </div>
        <div className="row store-row">
          <StorePicker onSelect={() => {
            if (!plan?.week) return
            if (!plannerRef.current) plannerRef.current = {}
            if (!plannerRef.current._debounce) plannerRef.current._debounce = null
            clearTimeout(plannerRef.current._debounce)
            plannerRef.current._debounce = setTimeout(() => analyzePlan(plan.week), 300)
          }} />
        </div>
        <details className="advanced">
          <summary>Advanced options</summary>
          <div className="content">
            <div className="adv-tabs" role="tablist">
              <button className={`adv-tab ${advTab==='dietary'?'active':''}`} role="tab" onClick={() => setAdvTab('dietary')}>Dietary</button>
              <button className={`adv-tab ${advTab==='cooking'?'active':''}`} role="tab" onClick={() => setAdvTab('cooking')}>Cooking</button>
              <button className={`adv-tab ${advTab==='nutrition'?'active':''}`} role="tab" onClick={() => setAdvTab('nutrition')}>Nutrition</button>
              <button className={`adv-tab ${advTab==='allergies'?'active':''}`} role="tab" onClick={() => setAdvTab('allergies')}>Allergies</button>
            </div>

            {advTab === 'dietary' && (
              <div className="adv-pane">
                <div className="row">
                  <label>Proteins</label>
                  <div className="adv-chipgroup">
                    {PROTEIN_OPTIONS.map(p => (
                      <label key={p} className="chip">
                        <input type="checkbox" checked={selectedProteins.includes(p)} onChange={() => toggleSelect(selectedProteins, setSelectedProteins, p)} />
                        <span>{p}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="adv-sep" />
                <div className="row">
                  <label>Preferred cuisines</label>
                  <input type="text" style={{ minWidth: 260 }} placeholder="e.g., Mexican, Italian" value={preferredCuisinesText} onChange={(e) => setPreferredCuisinesText(e.target.value)} />
                  <label style={{ marginLeft: 12 }}>Spice</label>
                  <select value={spiceLevel} onChange={(e) => setSpiceLevel(e.target.value)}>
                    {['any','mild','medium','hot'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="row">
                  <label style={{ marginRight: 8 }}>Variety</label>
                  <input type="number" min={0} placeholder="Min unique dinners" value={minUniqueDinners} onChange={(e) => setMinUniqueDinners(e.target.value)} />
                  <label className="chip" style={{ marginLeft: 8 }}>
                    <input type="checkbox" checked={strictProteinRotation} onChange={(e) => setStrictProteinRotation(e.target.checked)} />
                    <span>Strict protein rotation</span>
                  </label>
                </div>
                <div className="row">
                  <label className="chip">
                    <input type="checkbox" checked={seasonalProduce} onChange={(e) => setSeasonalProduce(e.target.checked)} />
                    <span>Prefer seasonal produce</span>
                  </label>
                  <label className="chip">
                    <input type="checkbox" checked={wholeGrains} onChange={(e) => setWholeGrains(e.target.checked)} />
                    <span>Whole grains</span>
                  </label>
                  <label className="chip">
                    <input type="checkbox" checked={lowProcessed} onChange={(e) => setLowProcessed(e.target.checked)} />
                    <span>Minimize processed foods</span>
                  </label>
                </div>
              </div>
            )}

            {advTab === 'cooking' && (
              <div className="adv-pane">
                <div className="row">
                  <label>Equipment</label>
                  <div className="adv-chipgroup">
                    {EQUIPMENT_OPTIONS.map(eq => (
                      <label key={eq} className="chip">
                        <input type="checkbox" checked={selectedEquipment.includes(eq)} onChange={() => toggleSelect(selectedEquipment, setSelectedEquipment, eq)} />
                        <span>{eq}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="adv-sep" />
                <div className="row">
                  <label>Max cook time (min)</label>
                  <input type="number" min={0} placeholder="e.g., 30" value={maxCookTime} onChange={(e) => setMaxCookTime(e.target.value)} />
                  <label style={{ marginLeft: 12 }}><input type="checkbox" checked={allowLeftovers} onChange={(e) => setAllowLeftovers(e.target.checked)} /> Allow leftovers</label>
                  <label style={{ marginLeft: 12 }}><input type="checkbox" checked={leftoversForLunch} onChange={(e) => setLeftoversForLunch(e.target.checked)} /> Use leftovers for lunch</label>
                </div>
                <div className="row">
                  <label>Difficulty</label>
                  <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                    {['any','easy','moderate','advanced'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <label className="chip" style={{ marginLeft: 8 }}>
                    <input type="checkbox" checked={onePanMeals} onChange={(e) => setOnePanMeals(e.target.checked)} />
                    <span>One-pan meals</span>
                  </label>
                  <label className="chip">
                    <input type="checkbox" checked={batchCookFriendly} onChange={(e) => setBatchCookFriendly(e.target.checked)} />
                    <span>Batch-cook friendly</span>
                  </label>
                </div>
              </div>
            )}

            {advTab === 'allergies' && (
              <div className="adv-pane">
                <div className="row">
                  <label>Common allergens</label>
                  <div className="adv-chipgroup">
                    {ALLERGEN_OPTIONS.map(a => (
                      <label key={a} className="chip">
                        <input type="checkbox" checked={selectedAllergens.includes(a)} onChange={() => toggleSelect(selectedAllergens, setSelectedAllergens, a)} />
                        <span>{a}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="row">
                  <label>Other allergens</label>
                  <input type="text" style={{ minWidth: 320 }} placeholder="e.g., coconut, cilantro" value={otherAllergensText} onChange={(e) => setOtherAllergensText(e.target.value)} />
                  <label style={{ marginLeft: 12 }}>Avoid ingredients</label>
                  <input type="text" style={{ minWidth: 260 }} placeholder="e.g., mushrooms" value={avoidIngredientsText} onChange={(e) => setAvoidIngredientsText(e.target.value)} />
                </div>
              </div>
            )}

            {advTab === 'nutrition' && (
              <div className="adv-pane">
                <div className="row">
                  <label>Daily calories</label>
                  <input type="number" min={0} placeholder="e.g., 2000" value={dailyCalories} onChange={(e) => setDailyCalories(e.target.value)} />
                  <label style={{ marginLeft: 12 }}>Style</label>
                  <select value={nutritionStyle} onChange={(e) => setNutritionStyle(e.target.value)}>
                    {['balanced','high-protein','low-carb','low-fat'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="adv-sep" />
                <div className="row">
                  <label>Macros (g/day)</label>
                  <input type="number" min={0} placeholder="protein" value={macroProtein} onChange={(e) => setMacroProtein(e.target.value)} />
                  <input type="number" min={0} placeholder="carbs" value={macroCarbs} onChange={(e) => setMacroCarbs(e.target.value)} />
                  <input type="number" min={0} placeholder="fat" value={macroFat} onChange={(e) => setMacroFat(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        </details>
        {!apiKey && <div className="warn">Missing VITE_GEMINI_API_KEY in .env</div>}
        {useFavorites && !SPOON_KEY && (
          <div className="warn">Favorites enrichment is limited: add VITE_SPOONACULAR_API_KEY to enhance favorite recipes.</div>
        )}
        {budgetNote && <div className="warn">{budgetNote}</div>}
        {error && <div className="error">{error}</div>}
      </div>

      {plan && (
        <div className="planner-output" ref={plannerRef}>
          <div className="week-grid">
            {(plan.week || []).map((d, i) => (
              <div className="day" key={i}>
                <div className="day-title">{d.day || `Day ${i+1}`}</div>
                {['breakfast','lunch','dinner'].map((m) => {
                  const title = d.meals?.[m]
                  const clickable = title && !/^leftover/i.test(title)
                  return (
                    <div className="meal" key={m}>
                      <strong>{m.charAt(0).toUpperCase()+m.slice(1)}</strong>
                      <div>
                        {clickable ? (
                          <button style={{ background:'transparent', border:'none', color:'#6b6ef5', cursor:'pointer', padding:0 }}
                                  onClick={async () => {
                                    if (!recipeDetails[title] && SPOON_KEY) {
                                      const det = await fetchRecipeByTitle(title)
                                      setRecipeDetails((prev) => ({ ...prev, [title]: det }))
                                      setSelectedRecipe(det)
                                    } else {
                                      setSelectedRecipe(recipeDetails[title])
                                    }
                                  }}>
                            {title}
                          </button>
                        ) : (title || '—')}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="side">
            <div className="panel grocery">
              <div className="grocery-actions">
                <div className="panel-title">Grocery List {analyzing && <span style={{fontWeight:400}}>(analyzing…)</span>}</div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button className="send-list-btn" onClick={sendGroceryListToShoppingList} disabled={sending}>
                    {sending ? 'Adding…' : 'Send to Shopping List'}
                  </button>
                  <button className="send-list-btn" onClick={printGroceryList} title="Print grocery list">Print</button>
                </div>
              </div>
              {sendStatus && <div className="send-status">{sendStatus}</div>}
              {
                <div className="grocery-scroll" onScroll={() => setTipOpen(false)}>
                  <ul>
                  {(!buyGroceries || buyGroceries.length === 0) && (!plan?.groceryList || plan.groceryList.length === 0) && (
                    <li style={{ listStyle: 'none', color: '#6b7280' }}>No grocery items yet. Generate a plan or adjust settings.</li>
                  )}
                  {(buyGroceries.length ? buyGroceries : []).map((g, idx) => {
                    const tip = getSubstitutionTip(g.name)
                    return (
                      <li key={idx}>
                        {g.name} — {g.amount ? g.amount.toFixed(1) : ''} {g.unit || ''}
                        {prices[norm(g.name)] && (
                          <span style={{ color:'#28a745', fontWeight:700 }}> • ${prices[norm(g.name)].price.toFixed(2)}</span>
                        )}
                        {tip && (
                          <span
                            className="tip"
                            onMouseEnter={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect()
                              setTipText(tip)
                              setTipRect(rect)
                              setTipOpen(true)
                            }}
                            onMouseLeave={() => setTipOpen(false)}
                          >
                            ?
                          </span>
                        )}
                      </li>
                    )
                  })}
                  {(!buyGroceries || buyGroceries.length === 0) && (
                    (plan.groceryList || []).map((g, idx) => {
                      const tip = getSubstitutionTip(g)
                      return (
                        <li key={idx}>
                          {g}
                          {tip && (
                            <span
                              className="tip"
                              onMouseEnter={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect()
                                setTipText(tip)
                                setTipRect(rect)
                                setTipOpen(true)
                              }}
                              onMouseLeave={() => setTipOpen(false)}
                            >
                              ?
                            </span>
                          )}
                        </li>
                      )
                    })
                  )}
                  </ul>
                </div>
              }
              {pantryOnlyGroceries.length > 0 && (
                <div className="grocery-scroll" onScroll={() => setTipOpen(false)}>
                  <div className="subheading">Already in Pantry</div>
                  <ul className="muted">
                    {pantryOnlyGroceries.map((g, idx) => {
                      const tip = getSubstitutionTip(g.name)
                      return (
                        <li key={idx}>
                          {g.name} — {g.amount ? g.amount.toFixed(1) : ''} {g.unit || ''} <span className="pantry-badge">pantry</span>
                          {tip && (
                            <span
                              className="tip"
                              onMouseEnter={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect()
                                setTipText(tip)
                                setTipRect(rect)
                                setTipOpen(true)
                              }}
                              onMouseLeave={() => setTipOpen(false)}
                            >
                              ?
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
            <div className="panel">
              <div className="panel-title">Batch Prep</div>
              <ul>
                {(plan.batchPrep || []).map((t, idx) => <li key={idx}>{t}</li>)}
              </ul>
              {(estCost != null ? true : plan.estimatedCost != null) && (
                <div className="cost">Estimated Cost: ${Number(estCost != null ? estCost : plan.estimatedCost).toFixed(2)}{Number(budget) > 0 && estCost != null ? (estCost > Number(budget) ? ' (over budget)' : ' (within budget)') : ''}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedRecipe && (
        <div className="modal-overlay" onClick={() => setSelectedRecipe(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedRecipe(null)}>✕</button>
            <h2>{selectedRecipe.title}</h2>
            {selectedRecipe.image && (
              <img src={selectedRecipe.image} alt={selectedRecipe.title} className="modal-image" />
            )}
            {selectedRecipe.extendedIngredients && (
              <div className="recipe-section">
                <h3>Ingredients</h3>
                <ul className="ingredients-list">
                  {selectedRecipe.extendedIngredients.map((ing, idx) => {
                    const nm = ing?.nameClean || ing?.name || ing?.originalName || ''
                    const inPantry = pantrySetRef.current.has((nm || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
                    return (
                      <li key={idx}>
                        <span className="ingredient-amount">{ing.original}</span>
                        {inPantry && <span className="pantry-badge">pantry</span>}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
            {selectedRecipe.analyzedInstructions?.[0]?.steps && (
              <div className="recipe-section">
                <h3>Instructions</h3>
                <ol className="instructions-list">
                  {selectedRecipe.analyzedInstructions[0].steps.map((s) => (
                    <li key={s.number}><p>{s.step}</p></li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Global tooltip portal for substitution hints */}
      <UITooltip open={tipOpen} text={tipText} anchorRect={tipRect} />
    </div>
  )
}
