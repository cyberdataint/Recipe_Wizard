# Recipe Wizard - Quick Start Checklist

## ✅ Setup Checklist

### 1. Install Dependencies
- [ ] Open **Command Prompt** (not PowerShell)
- [ ] Run: `npm install @google/generative-ai`
- [ ] Verify all packages are installed

### 2. Supabase Database Setup
- [ ] Go to [Supabase SQL Editor](https://app.supabase.com)
- [ ] Open `supabase-setup.sql` from your project folder
- [ ] Copy the entire SQL script
- [ ] Paste into Supabase SQL Editor
- [ ] Click **Run** to create tables
- [ ] Verify tables created: `pantry_items`, `shopping_list_items`, `meal_plans`, `user_preferences`

### 3. Environment Variables (Already Done!)
- [x] VITE_SUPABASE_URL configured
- [x] VITE_SUPABASE_ANON_KEY configured
- [x] VITE_SPOONACULAR_API_KEY configured
- [x] VITE_GEMINI_API_KEY configured

### 4. Start Development Server
- [ ] Run: `npm run dev`
- [ ] Open browser to: `http://localhost:5173`

### 5. Test the Application
- [ ] Sign up for a new account
- [ ] Check email for confirmation link
- [ ] Sign in to your account
- [ ] Search for a recipe
- [ ] Add ingredients to pantry
- [ ] Add ingredients to shopping list
- [ ] Test checking off shopping items
- [ ] Test moving items from shopping list to pantry

## 🎯 Key Features to Test

### Recipe Search
- [ ] Search by recipe name (e.g., "pasta carbonara")
- [ ] Search by ingredients (e.g., "chicken, rice")
- [ ] Click on recipe to view details
- [ ] View ingredients list
- [ ] View cooking instructions
- [ ] View nutrition information

### Pantry Management
- [ ] Search for ingredients using Spoonacular
- [ ] Add ingredient from search results
- [ ] Manually add ingredient
- [ ] View all pantry items
- [ ] Delete pantry item

### Shopping List
- [ ] Manually add item to shopping list
- [ ] Add single ingredient from recipe
- [ ] Add all ingredients from recipe
- [ ] Check off purchased items
- [ ] Move checked item to pantry (🥫 button)
- [ ] Clear all checked items

### Smart Features
- [ ] Ingredients in pantry show "✓ In Pantry" badge in recipes
- [ ] Only missing ingredients show "+ Add to List" button
- [ ] Recipe name is saved with shopping list items

## 🐛 Common Issues

### Issue: npm command not working in PowerShell
**Solution**: Use Command Prompt (cmd.exe) instead

### Issue: Supabase connection error
**Solution**: 
1. Verify `.env` has correct URL and key
2. Check Supabase project is active
3. Verify SQL script ran successfully

### Issue: No recipes found
**Solution**:
1. Check internet connection
2. Verify Spoonacular API key is valid
3. Try different search terms

### Issue: Can't add to shopping list
**Solution**:
1. Make sure you're signed in
2. Verify Supabase tables exist
3. Check browser console for errors

## 📊 API Usage Tracking

### Spoonacular (150 requests/day free)
Each action costs:
- Recipe search: 1 request
- Recipe details: 1 request
- Ingredient autocomplete: 1 request

### Current Usage:
- Recipe search: ~1-2 requests per search
- Adding ingredients: 1 request per search
- Total per recipe: ~2-3 requests

**Tip**: Cache recipe data to reduce API calls!

## 🚀 Next Steps

After setup is complete:
1. Populate your pantry with common ingredients
2. Search for recipes you want to try
3. Use the shopping list for grocery shopping
4. Check off items as you shop
5. Move purchased items to your pantry

## 💡 Pro Tips

1. **Batch Add**: When viewing a recipe, click "Add All to Shopping List" to add all ingredients at once
2. **Pantry First**: Add your common pantry items first to see which recipes you can make with what you have
3. **Recipe Planning**: Add ingredients from multiple recipes to plan your week
4. **Smart Shopping**: The app highlights which ingredients you already have
5. **Quick Cleanup**: Use "Clear Checked Items" to remove completed shopping items

## 📞 Need Help?

- Check `SETUP_GUIDE.md` for detailed instructions
- Review code comments in source files
- Check Supabase dashboard for database issues
- Verify API keys are valid and active

---

**Ready to cook! 🍳**
