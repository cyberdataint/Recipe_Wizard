import { useEffect, useRef, useState } from 'react'
import './MealPlanner.css'
import { useAuth } from '../contexts/AuthContext'
import supabase from '../Supabase'
import krogerAPI from '../KrogerAPI'
import StorePicker from './StorePicker'

export default function MealPlanner() {
  const apiKey = (import.meta.env.VITE_GEMINI_API_KEY || '').trim()
  const SPOON_KEY = (import.meta.env.VITE_SPOONACULAR_API_KEY || '').trim()
  const { user } = useAuth()

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

  const plannerRef = useRef(null)
  const pantrySetRef = useRef(new Set())
  const favTitleSetRef = useRef(new Set())
  const refineAttemptsRef = useRef(0)
  const dietOptions = [
    { value: 'any', label: 'Any' },
    { value: 'vegetarian', label: 'Vegetarian' },
    { value: 'vegan', label: 'Vegan' },
    { value: 'gluten-free', label: 'Gluten-free' },
    { value: 'dairy-free', label: 'Dairy-free' },
    { value: 'keto', label: 'Keto' },
    { value: 'paleo', label: 'Paleo' }
  ]

  const ensureSdk = async () => {
    const mod = await import('@google/generative-ai')
    return mod
  }

  const generate = async () => {
    if (!apiKey) {
      setError('Missing VITE_GEMINI_API_KEY. Add it to your .env and restart the dev server.')
      return
    }
    setLoading(true)
    setError('')
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
          const [{ data: favR }, { data: favI }] = await Promise.all([
            supabase.from('favorites').select('title').eq('user_id', user.id).eq('type', 'recipe').limit(50),
            supabase.from('favorites').select('key, title').eq('user_id', user.id).eq('type', 'ingredient').limit(80)
          ])
          favRecipeTitles = (favR || []).map(r => r.title).filter(Boolean)
          favIngredients = (favI || []).map(i => i.key || i.title).filter(Boolean)
        }
        if (usePantry) {
          const { data: pantry } = await supabase.from('pantry_items').select('ingredient_name').eq('user_id', user.id).limit(100)
          pantryItems = (pantry || []).map(p => p.ingredient_name)
        }
      }
      favTitleSetRef.current = new Set(favRecipeTitles)
      pantrySetRef.current = new Set((pantryItems || []).map((n) => norm(n)))

      const { GoogleGenerativeAI } = await ensureSdk()
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

      const system = 'You are a meal planning assistant. Output strict JSON only, no prose.'
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
        constraints: { prefer_variety: true, avoid_repeats: true }
      }
      const schema = `Return JSON with keys:{\n  week: [ { day: string, meals: { breakfast?: string, lunch?: string, dinner?: string } } ],\n  recipes: { [title: string]: { servings: number, ingredients: [ { name: string, amount?: number, unit?: string, note?: string } ], instructions: string[] } },\n  groceryList?: string[],\n  estimatedCost?: number,\n  batchPrep?: string[]\n}\nRules:\n- recipes must include step-by-step instructions (short imperative sentences).\n- ingredient names should be grocery-friendly (e.g., 'garlic', 'olive oil').\n- If unsure of exact amounts, provide best estimate.`
      const text = `\n${system}\n${schema}\nInput:\n${JSON.stringify(prompt, null, 2)}\nOutput JSON:`

      const res = await model.generateContent(text)
      const raw = res.response.text()

      let data
      try {
        data = JSON.parse(raw)
      } catch {
        const match = raw.match(/\{[\s\S]*\}/)
        if (match) data = JSON.parse(match[0])
        else throw new Error('Model did not return JSON')
      }

      const wk = Array.isArray(data.week) ? data.week.slice(0, days) : []
      const next = {
        week: wk,
        groceryList: Array.isArray(data.groceryList) ? data.groceryList : [],
        estimatedCost: typeof data.estimatedCost === 'number' ? data.estimatedCost : null,
        batchPrep: Array.isArray(data.batchPrep) ? data.batchPrep : []
      }
  setPlan(next)

      // Seed recipeDetails from Gemini so the modal has steps immediately
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
      }
      // Analyze and optionally fit to budget
      const result = await analyzePlan(wk)
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

  // Normalize a simple name for aggregation
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

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

  const fetchRecipeByTitle = async (title) => {
    if (!SPOON_KEY) return null
    try {
      const url = `https://api.spoonacular.com/recipes/complexSearch?query=${encodeURIComponent(title)}&number=1&addRecipeInformation=true&fillIngredients=true&apiKey=${SPOON_KEY}`
      const res = await fetch(url)
      if (!res.ok) return null
      const data = await res.json()
      return data?.results?.[0] || null
    } catch { return null }
  }

  const analyzePlan = async (week) => {
    if (!week || week.length === 0) return
    setAnalyzing(true)
    try {
      const titles = getDistinctRecipeTitles(week)
      const details = { ...recipeDetails }
      // If user opted to use favorites and Spoonacular key is available, enrich only those titles
      if (useFavorites && SPOON_KEY) {
        for (const title of titles) {
          if (favTitleSetRef.current.has(title) && !details[title]) {
            details[title] = await fetchRecipeByTitle(title)
          }
        }
        setRecipeDetails(details)
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
      const agg = Array.from(map.values()).sort((a,b) => a.name.localeCompare(b.name))
      setAggGroceries(agg)

      // Split into to-buy vs already-in-pantry
      let buy = []
      let covered = []
      const pset = pantrySetRef.current
      for (const item of agg) {
        const key = norm(item.name)
        if (usePantry && pset.has(key)) covered.push(item); else buy.push(item)
      }

      // Fallback: if aggregation is empty (e.g., missing amounts), use simple plan.groceryList terms
      if (buy.length === 0 && (plan?.groceryList || []).length > 0) {
        const simple = (plan.groceryList || []).map((n) => ({ name: n, unit: '', amount: 0 }))
        buy = []
        covered = []
        for (const item of simple) {
          const key = norm(item.name)
          if (usePantry && pset.has(key)) covered.push(item); else buy.push(item)
        }
      }
      setBuyGroceries(buy)
      setPantryOnlyGroceries(covered)

      let localPrices = {}
      let estCalc = null
      if (krogerAPI.locationId && buy.length) {
        const names = buy.map(i => i.name)
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
    if (refineAttemptsRef.current >= 2) {
      setBudgetNote('Could not reach budget after 2 attempts')
      setTimeout(() => setBudgetNote(''), 3000)
      return
    }
    try {
      refineAttemptsRef.current += 1
      setBudgetNote(`Fitting to budget (attempt ${refineAttemptsRef.current})…`)
      const { GoogleGenerativeAI } = await ensureSdk()
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
      const feedback = {
        currentCost,
        targetBudget: Number(budget),
        guidance: 'Replace expensive recipes and ingredients with lower-cost options (beans, lentils, eggs, rice, seasonal produce, value brands). Prefer recipes that reuse inexpensive staples. Keep variety and dietary constraints. Preserve servings and days. Output full JSON again, same schema as before.'
      }
      const text = `\nRe-generate meal plan within budget.\nKeep days=${days}, servings=${servings}, diet=${diet}.\nHere is the current plan to improve:\n${JSON.stringify(currentWeek, null, 2)}\nFeedback:\n${JSON.stringify(feedback, null, 2)}\nReturn the same schema as before.`
      const res = await model.generateContent(text)
      const raw = res.response.text()
      let data
      try { data = JSON.parse(raw) } catch { const m = raw.match(/\{[\s\S]*\}/); data = m ? JSON.parse(m[0]) : null }
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
      }
      const result = await analyzePlan(wk)
      if (result?.estCost != null && Number(budget) > 0 && result.estCost > Number(budget)) {
        // Try once more if still over budget
        if (refineAttemptsRef.current < 2) {
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
          <label><input type="checkbox" checked={includeBreakfast} onChange={(e) => setIncludeBreakfast(e.target.checked)} /> Breakfast</label>
          <label><input type="checkbox" checked={includeLunch} onChange={(e) => setIncludeLunch(e.target.checked)} /> Lunch</label>
          <label><input type="checkbox" checked={includeDinner} onChange={(e) => setIncludeDinner(e.target.checked)} /> Dinner</label>
          <label><input type="checkbox" checked={useFavorites} onChange={(e) => setUseFavorites(e.target.checked)} /> Use favorites</label>
          <label><input type="checkbox" checked={usePantry} onChange={(e) => setUsePantry(e.target.checked)} /> Use pantry</label>
          <button className="gen-btn" onClick={generate} disabled={loading || !apiKey}>{loading ? 'Generating…' : 'Generate Plan'}</button>
          {plan && <button className="pdf-btn" onClick={exportPdf}>Download PDF</button>}
          <label style={{ marginLeft: 8 }}><input type="checkbox" checked={autoFitBudget} onChange={(e) => setAutoFitBudget(e.target.checked)} /> Auto fit to budget</label>
          <div style={{ marginLeft: 'auto' }}>
            <StorePicker onSelect={() => { if (plan?.week) analyzePlan(plan.week) }} />
          </div>
        </div>
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
                </div>
              </div>
              {sendStatus && <div className="send-status">{sendStatus}</div>}
              {
                <div className="grocery-scroll">
                  <ul>
                  {(buyGroceries.length ? buyGroceries : []).map((g, idx) => (
                    <li key={idx}>
                      {g.name} — {g.amount ? g.amount.toFixed(1) : ''} {g.unit || ''}
                      {prices[norm(g.name)] && (
                        <span style={{ color:'#28a745', fontWeight:700 }}> • ${prices[norm(g.name)].price.toFixed(2)}</span>
                      )}
                    </li>
                  ))}
                  {(!buyGroceries || buyGroceries.length === 0) && (
                    (plan.groceryList || []).map((g, idx) => <li key={idx}>{g}</li>)
                  )}
                  </ul>
                </div>
              }
              {pantryOnlyGroceries.length > 0 && (
                <div className="grocery-scroll">
                  <div className="subheading">Already in Pantry</div>
                  <ul className="muted">
                    {pantryOnlyGroceries.map((g, idx) => (
                      <li key={idx}>{g.name} — {g.amount ? g.amount.toFixed(1) : ''} {g.unit || ''} <span className="pantry-badge">pantry</span></li>
                    ))}
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
    </div>
  )
}
