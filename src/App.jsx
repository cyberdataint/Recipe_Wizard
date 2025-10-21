import { useState, lazy, Suspense, startTransition } from 'react'
import './App.css'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Auth from './components/Auth'
import TopNav from './components/TopNav'

// Lazy-load heavy sections so the auth page stays snappy
const Pantry = lazy(() => import('./components/Pantry'))
const ShoppingList = lazy(() => import('./components/ShoppingList'))
const Recipes = lazy(() => import('./components/Recipes'))
const Chat = lazy(() => import('./components/Chat'))
const MealPlanner = lazy(() => import('./components/MealPlanner'))

function AppShell() {
  const { user, signOut } = useAuth()
  const [tab, setTab] = useState('recipes')

  const changeTab = (next) => {
    startTransition(() => setTab(next))
  }

  if (!user) {
    return (
      <div className="app">
        <TopNav current={tab} onChange={changeTab} isAuthed={false} />
        <Auth />
      </div>
    )
  }

  return (
    <div className="app">
      <TopNav current={tab} onChange={changeTab} onSignOut={signOut} isAuthed={true} />
      <header className="app-header">
        {tab === 'recipes' && <><h1>🍳 Recipe Wizard</h1><p>Search for delicious recipes with detailed ingredients!</p></>}
        {tab === 'pantry' && <><h1>🥫 Pantry</h1><p>Manage ingredients you already have.</p></>}
        {tab === 'shopping' && <><h1>🛒 Shopping List</h1><p>Track what you need to buy.</p></>}
        {tab === 'planner' && <><h1>📆 Meal Planner</h1><p>Generate a smart weekly plan, grocery list, and prep steps.</p></>}
      </header>
      <Suspense fallback={null}>
        {tab === 'recipes' && <Recipes />}
        {tab === 'pantry' && <div className="main-container"><Pantry /></div>}
        {tab === 'shopping' && <div className="main-container"><ShoppingList /></div>}
        {tab === 'planner' && <div className="main-container"><MealPlanner /></div>}
        {/* Floating Chat Widget - always visible when authenticated */}
        <Chat />
      </Suspense>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}

