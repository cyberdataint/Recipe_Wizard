import { useState, useEffect } from "react";
import krogerAPI from "../KrogerAPI";
import favoritesAPI from "../FavoritesAPI";
import { useAuth } from "../contexts/AuthContext";
import supabase from "../Supabase";
import "./Pantry.css";
import {
  getModel as getGeminiModel,
  parseModelJson,
} from "../services/geminiService";
import { loadImageFromCache, saveImageToCache } from "../utils/imageCache";

export default function Pantry() {
  const { user } = useAuth();
  const apiKey = (import.meta.env.VITE_GEMINI_API_KEY || "").trim();
  const [pantryItems, setPantryItems] = useState([]);
  const [itemImages, setItemImages] = useState({});
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState({
    ingredient_name: "",
    quantity: "",
    unit: "",
    category: "",
    notes: "",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [spoonacularResults, setSpoonacularResults] = useState([]);
  const [searchingIngredients, setSearchingIngredients] = useState(false);
  const [favIngredients, setFavIngredients] = useState(() => new Set());
  // Pantry meal suggestions state
  const [suggestions, setSuggestions] = useState([]);
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState("");
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const inputMax = "16";

  const SPOONACULAR_API_KEY = import.meta.env.VITE_SPOONACULAR_API_KEY;

  useEffect(() => {
    if (user) {
      fetchPantryItems();
      loadFavs();
    }
  }, [user]);

  const fetchPantryItems = async () => {
    try {
      const { data, error } = await supabase
        .from("pantry_items")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPantryItems(data || []);

      // Defer product image fetching; hydrate from cache first to avoid network on critical path
      if (data && data.length > 0) {
        const cached = {};
        data.forEach((item) => {
          const u = loadImageFromCache(item.ingredient_name);
          if (u) cached[item.id] = u;
        });
        if (Object.keys(cached).length)
          setItemImages((prev) => ({ ...prev, ...cached }));
        // Queue the rest with small concurrency and after a brief delay so it doesn't affect LCP
        setTimeout(() => queueImages(data), 350);
      }
    } catch (error) {
      console.error("Error fetching pantry items:", error);
    } finally {
      setLoading(false);
    }
  };

  // Concurrency-limited image queue
  const queueImages = async (items) => {
    const CONCURRENCY = 3;
    const pending = [...items];
    let active = 0;
    const next = () => {
      if (!pending.length || active >= CONCURRENCY) return;
      const item = pending.shift();
      active += 1;
      loadImageForItem(item).finally(() => {
        active -= 1;
        next();
      });
      next();
    };
    next();
  };

  const pickSmallestImage = (product) => {
    try {
      const sizes = product?.images?.[0]?.sizes || [];
      if (!Array.isArray(sizes) || !sizes.length) return null;
      // Choose the smallest by width if provided; otherwise the first
      const sorted = [...sizes].sort((a, b) => (a.width || 0) - (b.width || 0));
      return sorted[0]?.url || sizes[0]?.url || null;
    } catch {
      return null;
    }
  };

  const loadImageForItem = async (item) => {
    // Skip if already loaded or cached
    if (itemImages[item.id]) return;
    const cached = loadImageFromCache(item.ingredient_name);
    if (cached) {
      setItemImages((prev) => ({ ...prev, [item.id]: cached }));
      return;
    }
    try {
      const products = await krogerAPI.searchProducts(item.ingredient_name);
      const img = pickSmallestImage(products?.[0]);
      if (img) {
        saveImageToCache(item.ingredient_name, img);
        setItemImages((prev) => ({ ...prev, [item.id]: img }));
      }
    } catch (e) {
      // ignore failures; keep UI snappy
    }
  };

  const loadFavs = async () => {
    try {
      if (!user) {
        setFavIngredients(new Set());
        return;
      }
      const list = await favoritesAPI.listFavorites(user.id, "ingredient");
      setFavIngredients(new Set(list.map((f) => String(f.key))));
    } catch (e) {}
  };

  const searchSpoonacularIngredients = async () => {
    if (!searchQuery.trim()) return;

    setSearchingIngredients(true);
    try {
      const response = await fetch(
        `https://api.spoonacular.com/food/ingredients/autocomplete?query=${encodeURIComponent(searchQuery)}&number=10&apiKey=${SPOONACULAR_API_KEY}`,
      );
      const data = await response.json();
      setSpoonacularResults(data);
    } catch (error) {
      console.error("Error searching ingredients:", error);
    } finally {
      setSearchingIngredients(false);
    }
  };

  const addIngredientFromSearch = (ingredient) => {
    setNewItem({
      ingredient_name: ingredient.name,
      quantity: "1",
      unit: "",
      category: "",
      notes: "",
    });
    setSpoonacularResults([]);
    setSearchQuery("");
  };

  const addPantryItem = async (e) => {
    e.preventDefault();
    if (!newItem.ingredient_name.trim()) return;

    try {
      const { error } = await supabase.from("pantry_items").insert([
        {
          ...newItem,
          user_id: user.id,
        },
      ]);

      if (error) throw error;

      setNewItem({
        ingredient_name: "",
        quantity: "",
        unit: "",
        category: "",
        notes: "",
      });
      fetchPantryItems();
    } catch (error) {
      console.error("Error adding pantry item:", error);
      alert("Failed to add item to pantry");
    }
  };

  const deletePantryItem = async (id) => {
    try {
      const { error } = await supabase
        .from("pantry_items")
        .delete()
        .eq("id", id);

      if (error) throw error;
      fetchPantryItems();
    } catch (error) {
      console.error("Error deleting pantry item:", error);
    }
  };

  const toggleFavIngredient = async (name) => {
    if (!user) {
      alert("Please sign in to save favorites");
      return;
    }
    const key = String(name);
    try {
      const res = await favoritesAPI.toggleFavorite({
        userId: user.id,
        type: "ingredient",
        key,
        title: name,
      });
      setFavIngredients((prev) => {
        const next = new Set(prev);
        if (res.favorited) next.add(key);
        else next.delete(key);
        return next;
      });
    } catch (e) {
      alert("Could not update favorite");
    }
  };

  // Handlers for pantry-only meal generation
  const generatePantryMeals = async (append = false) => {
    if (!apiKey) {
      setGenError("Missing VITE_GEMINI_API_KEY");
      return;
    }
    const names = pantryItems
      .map((p) => (p.ingredient_name || "").trim())
      .filter(Boolean);
    if (names.length === 0) {
      setGenError("Your pantry is empty");
      return;
    }
    setGenError("");
    setGenLoading(true);
    try {
      const existing = new Set((append ? suggestions : []).map((r) => r.title));
      const newOnes = await generatePantryMealsInternal({
        apiKey,
        pantryItems,
        existingTitles: existing,
        count: 6,
      });
      // Deduplicate by title
      const merged = append ? [...suggestions] : [];
      const have = new Set(merged.map((r) => r.title));
      for (const r of newOnes) {
        if (!have.has(r.title)) {
          merged.push(r);
          have.add(r.title);
        }
      }
      setSuggestions(merged);
    } catch (e) {
      console.error("Pantry generation error:", e);
      setGenError(e?.message || "Failed to generate meals");
    } finally {
      setGenLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading pantry...</div>;
  }

  return (
    <div className="pantry-container">
      {/* Spoonacular Ingredient Search */}
      <div className="ingredient-search">
        <div className="search-input-group">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for ingredients in Spoonacular..."
            onKeyPress={(e) =>
              e.key === "Enter" && searchSpoonacularIngredients()
            }
          />
          <button
            onClick={searchSpoonacularIngredients}
            disabled={searchingIngredients}
          >
            {searchingIngredients ? "🔍 Searching..." : "🔍 Search"}
          </button>
        </div>

        {spoonacularResults.length > 0 && (
          <div className="search-results">
            {spoonacularResults.map((ingredient) => (
              <div
                key={ingredient.id}
                className="search-result-item"
                onClick={() => addIngredientFromSearch(ingredient)}
              >
                <img
                  src={`https://spoonacular.com/cdn/ingredients_100x100/${ingredient.image}`}
                  alt={ingredient.name}
                />
                <span>{ingredient.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add New Item Form */}
      <form onSubmit={addPantryItem} className="add-item-form">
        <div className="inputs-container">
          <input
            type="text"
            value={newItem.ingredient_name}
            onChange={(e) =>
              setNewItem({ ...newItem, ingredient_name: e.target.value })
            }
            placeholder="Ingredient name"
            maxlength={inputMax}
            required
          />
          <input
            type="text"
            value={newItem.quantity}
            onChange={(e) =>
              setNewItem({ ...newItem, quantity: e.target.value })
            }
            placeholder="Quantity"
            maxlength={inputMax}
          />
          <input
            type="text"
            value={newItem.unit}
            onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
            placeholder="Unit (e.g., cups, lbs)"
            maxlength={inputMax}
          />
          <input
            type="text"
            value={newItem.category}
            onChange={(e) =>
              setNewItem({ ...newItem, category: e.target.value })
            }
            placeholder="Category (optional)"
            maxlength={inputMax}
          />
        </div>
        <div className="button-container">
          <button type="submit">Add to Pantry</button>
        </div>
      </form>

      {/* Pantry Items List */}
      <div className="items-list">
        {pantryItems.length === 0 ? (
          <p className="empty-message">
            Your pantry is empty. Add some ingredients!
          </p>
        ) : (
          pantryItems.map((item) => (
            <div key={item.id} className="pantry-item">
              {itemImages[item.id] && (
                <img
                  src={itemImages[item.id]}
                  alt={item.ingredient_name}
                  loading="lazy"
                  width="60"
                  height="60"
                  className="pantry-product-image"
                  style={{
                    width: "60px",
                    height: "60px",
                    objectFit: "contain",
                    marginRight: "12px",
                  }}
                />
              )}
              <div className="item-info">
                <h4>{item.ingredient_name}</h4>
                <p>
                  {item.quantity} {item.unit}
                  {item.category && (
                    <span className="category"> • {item.category}</span>
                  )}
                </p>
                {item.notes && <p className="notes">{item.notes}</p>}
              </div>
              <div className="item-actions">
                <button
                  onClick={() => toggleFavIngredient(item.ingredient_name)}
                  className="pantry-btn"
                  title={
                    favIngredients.has(String(item.ingredient_name))
                      ? "Unfavorite"
                      : "Favorite"
                  }
                >
                  {favIngredients.has(String(item.ingredient_name)) ? "★" : "☆"}
                </button>
                <button
                  onClick={() => deletePantryItem(item.id)}
                  className="delete-btn"
                  title="Delete item"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pantry-only meal generator */}
      <div className="pantry-gen">
        <div className="gen-header">
          <h3>Pantry-only Meals</h3>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button
              className="gen-btn"
              onClick={() => generatePantryMeals(false)}
              disabled={genLoading || !apiKey}
            >
              {genLoading ? "Generating…" : "Generate from Pantry"}
            </button>
            {suggestions.length > 0 && (
              <button
                className="gen-btn"
                onClick={() => generatePantryMeals(true)}
                disabled={genLoading || !apiKey}
              >
                Generate more
              </button>
            )}
          </div>
        </div>
        {!apiKey && (
          <div className="warn" style={{ marginTop: 8 }}>
            Missing VITE_GEMINI_API_KEY in .env
          </div>
        )}
        {genError && (
          <div className="error" style={{ marginTop: 8 }}>
            {genError}
          </div>
        )}
        {suggestions.length > 0 && (
          <div className="suggestions-grid">
            {suggestions.map((rec, idx) => (
              <div key={rec.title + "_" + idx} className="recipe-card">
                <div className="recipe-title">{rec.title}</div>
                {rec.image && <img alt={rec.title} src={rec.image} />}
                <ul className="ingredients-mini">
                  {(rec.extendedIngredients || []).slice(0, 6).map((ing, i) => (
                    <li key={i}>{ing.original}</li>
                  ))}
                  {(rec.extendedIngredients || []).length > 6 && <li>…</li>}
                </ul>
                <button
                  className="pantry-btn"
                  onClick={() => setSelectedRecipe(rec)}
                >
                  View
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedRecipe && (
        <div className="modal-overlay" onClick={() => setSelectedRecipe(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => setSelectedRecipe(null)}
            >
              ✕
            </button>
            <h2>{selectedRecipe.title}</h2>
            {selectedRecipe.image && (
              <img
                className="modal-image"
                src={selectedRecipe.image}
                alt={selectedRecipe.title}
              />
            )}
            {selectedRecipe.extendedIngredients && (
              <div className="recipe-section">
                <h3>Ingredients</h3>
                <ul className="ingredients-list">
                  {selectedRecipe.extendedIngredients.map((ing, i) => (
                    <li key={i}>
                      <span className="ingredient-amount">{ing.original}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {selectedRecipe.analyzedInstructions?.[0]?.steps && (
              <div className="recipe-section">
                <h3>Instructions</h3>
                <ol className="instructions-list">
                  {selectedRecipe.analyzedInstructions[0].steps.map((s) => (
                    <li key={s.number}>
                      <p>{s.step}</p>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Generate pantry-only meals (appends if append=true)
async function generatePantryMealsInternal({
  apiKey,
  pantryItems,
  existingTitles,
  count = 6,
}) {
  const model = await getGeminiModel(apiKey, { temperature: 0.6 });
  const pantry = pantryItems
    .map((i) => i.ingredient_name)
    .filter(Boolean)
    .slice(0, 120);
  const prompt = {
    pantry,
    count,
    do_not_repeat: Array.from(existingTitles || []),
    rules: {
      use_only_pantry_items: true,
      allow_basics: ["water", "salt", "pepper", "oil"],
    },
  };
  const schema = `Return JSON array of recipes. Each recipe: { title: string, servings?: number, ingredients: [ { name: string, amount?: number, unit?: string } ], instructions: string[] }.
Constraints: Use ONLY items from the provided pantry list (ignore case). You may assume basics like water/salt/pepper/oil if needed, otherwise no outside ingredients. Titles must be unique and not in do_not_repeat.`;
  const text = `You are a helpful cooking assistant. Output JSON only.\n${schema}\nInput:\n${JSON.stringify(prompt, null, 2)}\nJSON:`;
  const res = await model.generateContent(text);
  const raw = res.response.text();
  let data = parseModelJson(raw);
  if (!data) throw new Error("Model did not return JSON");
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data.recipes)
      ? data.recipes
      : [];
  // map to UI shape
  return arr.map((rec) => {
    const extendedIngredients = (rec.ingredients || []).map((ing) => ({
      original: [
        ing.amount != null ? String(ing.amount) : "",
        ing.unit || "",
        ing.name || "",
      ]
        .filter(Boolean)
        .join(" "),
      name: ing.name || "",
      unit: ing.unit || "",
      amount: typeof ing.amount === "number" ? ing.amount : undefined,
    }));
    const analyzedInstructions = [
      {
        steps: (rec.instructions || []).map((s, i) => ({
          number: i + 1,
          step: String(s),
        })),
      },
    ];
    return {
      title: rec.title,
      servings: rec.servings || undefined,
      extendedIngredients,
      analyzedInstructions,
    };
  });
}
