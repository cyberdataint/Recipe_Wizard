# 🍳 Recipe Wizard

A modern, full-featured recipe management application built with React and Vite. Search recipes, manage your pantry, create shopping lists, and chat with an AI assistant powered by Google Gemini. Get real-time pricing from Kroger stores!

## ✨ Features

- � **Recipe Search** - Find recipes by name or ingredients using Spoonacular API
- 🤖 **AI Chat Assistant** - Natural language conversation with Gemini AI to find recipes, add items to pantry/shopping list
- � **Pantry Management** - Track ingredients you have at home
- 🛒 **Smart Shopping List** - Create shopping lists with real-time Kroger pricing and availability
- 💰 **Price Estimation** - See estimated cart totals from Kroger stores
- 🔐 **User Authentication** - Secure sign-in with Supabase
- 💾 **Persistent Storage** - All data saved to your account
- 📱 **Responsive Design** - Works on desktop and mobile

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Quick Links

📚 **Deployment Guides:**
- [🚀 Quick Deploy (10 minutes)](./DEPLOY_QUICK.md) - Fast deployment checklist
- [📖 Complete Deployment Guide](./DEPLOYMENT.md) - Detailed step-by-step instructions
- [📝 Setup Summary](./SETUP_SUMMARY.md) - Architecture and how everything works together

---

## 🌐 Live Demo

**Live Demo:** https://cyberdataint.github.io/Recipe_Wizard/

---

### Local Development

1. **Clone the repository**
```bash
git clone https://github.com/cyberdataint/Recipe_Wizard.git
cd Recipe_Wizard
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_SPOONACULAR_API_KEY=your_spoonacular_api_key
   VITE_GEMINI_API_KEY=your_google_gemini_api_key
   VITE_KROGER_CLIENT_ID=your_kroger_client_id
   VITE_KROGER_CLIENT_SECRET=your_kroger_client_secret
   ```


4. **Start the development server**
```bash
npm run dev
```



6. **Open your browser** to `http://localhost:5173` (or the port shown in your terminal)

## 🚀 NPM Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install all dependencies |
| `npm run dev` | Start Vite development server (port 5173) |

| `npm run build` | Build for production |
| `npm run preview` | Preview production build |


### Running the App

**For full functionality, you need TWO terminals:**

**Terminal 1 - Frontend:**
```bash
npm run dev
```



## 📖 Usage

### Recipe Search Tab
- Search by recipe name: "chocolate cake"
- Search by ingredients: "chicken, rice, broccoli"
- Click any recipe to see full details and ingredients

### Pantry Tab
- Add ingredients you have at home
- Track quantities and expiration dates
- Organized by category

### Shopping List Tab
- Add items you need to buy
- Click "Get Prices" to fetch real-time Kroger pricing
- See estimated cart total
- Check off items as you shop

### Chat Tab
- Ask the AI assistant for recipe suggestions
- Natural language requests: "Add milk and eggs to my shopping list"
- Get cooking tips and ingredient substitutions
- Chat history is saved to your account

## 🔌 APIs Used

- **[Spoonacular API](https://spoonacular.com/food-api)** - Recipe search and nutritional data
- **[Google Gemini AI](https://ai.google.dev/)** - Conversational AI chatbot with function calling
- **[Kroger API](https://developer.kroger.com/)** - Real-time product pricing and availability
- **[Supabase](https://supabase.com/)** - Authentication and PostgreSQL database

## 🛠️ Technologies Used

- **React 19.1.1** - UI framework
- **Vite 7.1.2** - Build tool and dev server
- **Supabase** - Backend (PostgreSQL + Auth)
- **Google Gemini AI** - LLM with function calling
- **Express** - Proxy server for Kroger API
- **Spoonacular API** - Recipe database
- **Kroger API** - Product pricing

## 📁 Project Structure 

```
Recipe_Wizard/
├── src/
│   ├── App.jsx                      # Main orchestrator - handles tab switching
│   ├── main.jsx                     # React entry point
│   ├── Supabase.jsx                 # Supabase client configuration
│   ├── KrogerAPI.jsx                # Kroger API service with OAuth
│   ├── components/
│   │   ├── Recipes.jsx              # Recipe search (Spoonacular)
│   │   ├── Pantry.jsx               # Pantry management (Supabase)
│   │   ├── ShoppingList.jsx         # Shopping list with pricing (Supabase + Kroger)
│   │   ├── Chat.jsx                 # Gemini AI chatbot with function calling
│   │   ├── Auth.jsx                 # Sign in/up UI
│   │   └── TopNav.jsx               # Tab navigation bar
│   └── contexts/
│       └── AuthContext.jsx          # Supabase authentication provider
├── kroger-proxy-server.js           # Express server for Kroger API (avoids CORS)
├── supabase_chat_table.sql          # Database schema for chat messages
├── test-kroger-auth.js              # Test script for Kroger credentials
├── .env                             # Environment variables (create this)
└── package.json                     # Dependencies and scripts
```
