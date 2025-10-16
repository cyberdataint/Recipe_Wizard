# 🍳 Recipe Wizard

A modern, interactive recipe search application built with React and Vite, powered by the Spoonacular API.

## Features

- 💬 Conversational interface for recipe queries
- 🔍 Smart recipe search using Spoonacular's AI
- 🎨 Beautiful, responsive UI with gradient design
- ⚡ Fast and optimized with Vite
- 📱 Mobile-friendly design

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository
```bash
git clone https://github.com/cyberdataint/Recipe_Wizard.git
cd Recipe_Wizard
```

2. Install dependencies
```bash
npm install
```

3. Start the development server
```bash
npm run dev
```

4. Open your browser to `http://localhost:5173`

## Usage

Simply type your recipe-related questions in the search bar:

- "What can I make with chicken and rice?"
- "Give me a healthy breakfast recipe"
- "How do I make pasta carbonara?"
- "What are some vegetarian dinner ideas?"

## API

This application uses the [Spoonacular Food API](https://spoonacular.com/food-api) for recipe and food information. The conversational endpoint provides natural language responses to food-related queries.

## Build

To create a production build:

```bash
npm run build
```

To preview the production build:

```bash
npm run preview
```

## Technologies Used

- React 
- Vite 
- Spoonacular API

## App structure (modular)

- `src/App.jsx` — thin orchestrator. Wraps `AuthProvider`, renders `TopNav`, and switches tabs.
- `src/components/Recipes.jsx` — recipe search UI and modal logic.
- `src/components/Pantry.jsx` — pantry (Supabase-backed).
- `src/components/ShoppingList.jsx` — shopping list (Supabase-backed).
- `src/components/Auth.jsx` — sign in/up UI.
- `src/components/TopNav.jsx` — simple tab navigation and sign-out.
- `src/contexts/AuthContext.jsx` — Supabase auth provider + hook.

Remove a feature by deleting its component and removing the tab in `App.jsx`.

## Environment

Create `.env` with:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_SPOONACULAR_API_KEY=...
```

