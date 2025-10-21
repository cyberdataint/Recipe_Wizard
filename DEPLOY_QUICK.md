# Recipe Wizard - Quick Setup Card

## 🚀 Deploy in 10 Minutes

### 1️⃣ Deploy Backend (Render.com)
```
1. Sign up: https://render.com
2. New Web Service → Connect GitHub repo
3. Settings:
   - Build: npm install
   - Start: node kroger-proxy-server.js
   - Instance: Free
4. Add Environment Variables:
   VITE_KROGER_CLIENT_ID=recipewizard-bbc80bft
   VITE_KROGER_CLIENT_SECRET=YGM2vKRfKBIcIcUcgQ140_qO9QBtQHZV7MguhQoS
   KROGER_HEADERS_MODE=browser
5. Deploy (takes 2-3 min)
6. Copy URL: https://your-app.onrender.com
```

### 2️⃣ Deploy Frontend (GitHub Pages)
```
1. GitHub repo → Settings → Secrets → Actions
2. Add secrets:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
   - VITE_SPOONACULAR_API_KEY
   - VITE_GEMINI_API_KEY
3. Settings → Pages → Source: GitHub Actions
4. Actions → Run workflow "Deploy Vite site"
5. Done! https://cyberdataint.github.io/Recipe_Wizard/
```

### 3️⃣ Update Proxy URL (if needed)
Your Render URL is already configured: `https://recipe-wizard-oivb.onrender.com`

If you need to change it later:
```javascript
// src/KrogerAPI.jsx, line 11
this.proxyUrl = import.meta.env.PROD 
  ? 'https://recipe-wizard-oivb.onrender.com/api/kroger'
  : 'http://localhost:3001/api/kroger'
```

---

## 🧪 Test Deployment

### Frontend:
- [ ] Visit: https://cyberdataint.github.io/Recipe_Wizard/
- [ ] Sign in works
- [ ] Recipe search works
- [ ] Chat responds

### Backend:
- [ ] Visit: https://recipe-wizard-oivb.onrender.com/api/kroger/locations?lat=42.66&lon=-83.385
- [ ] Should return JSON with Kroger stores

### Integration:
- [ ] Shopping list shows Kroger prices
- [ ] Can select different stores
- [ ] Prices update when store changes

---

## 🔧 Common Issues

**"Failed to fetch" in shopping list:**
- Check Render proxy is running (not spun down)
- Verify CORS allows GitHub Pages domain
- Check Render logs for errors

**Build fails on GitHub Actions:**
- Verify all 4 secrets are added correctly
- Check Actions logs for specific error
- Make sure `package-lock.json` is committed

**Render proxy errors:**
- Check environment variables are set
- Verify Kroger API credentials are valid
- Check Logs tab in Render dashboard

**Recipe search returns 402 errors:**
- Spoonacular quota exceeded
- App auto-fallback to TheMealDB (free)
- Wait 24hrs or upgrade Spoonacular plan

---

## 📱 URLs

| Service | URL |
|---------|-----|
| Live Site | https://cyberdataint.github.io/Recipe_Wizard/ |
| Proxy | https://recipe-wizard-oivb.onrender.com |
| GitHub | https://github.com/cyberdataint/Recipe_Wizard |
| Render Dashboard | https://dashboard.render.com |
| Supabase | https://supabase.com/dashboard |

---

## 🆘 Emergency Commands

### Redeploy frontend:
```bash
git commit --allow-empty -m "Trigger deploy"
git push origin main
```

### Test proxy locally:
```bash
npm run proxy
# Visit: http://localhost:3001/api/kroger/locations?lat=42.66&lon=-83.385
```

### Check logs:
```bash
# Render: Dashboard → Your Service → Logs
# GitHub: Actions → Latest workflow → Build logs
```

---

## ✅ Pre-Deployment Checklist

- [ ] `.env` file is in `.gitignore` (never commit secrets!)
- [ ] All GitHub Secrets added (4 total)
- [ ] Render environment variables set (4 total)
- [ ] Proxy CORS allows GitHub Pages domain
- [ ] `vite.config.js` has correct `base: '/Recipe_Wizard/'`
- [ ] `package-lock.json` committed to repo

---

**Need help?** See full guide: [DEPLOYMENT.md](./DEPLOYMENT.md)
