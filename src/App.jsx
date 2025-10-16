import { useState } from 'react'
import './App.css'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Auth from './components/Auth'
import Pantry from './components/Pantry'
import ShoppingList from './components/ShoppingList'
import Recipes from './components/Recipes'
import TopNav from './components/TopNav'
import Chat from './components/Chat'

function AppShell() {
  const { user, signOut } = useAuth()
  const [tab, setTab] = useState('recipes')

  if (!user) {
    return (
      <div className="app">
        <TopNav current={tab} onChange={setTab} isAuthed={false} />
        <Auth />
      </div>
    )
  }

  return (
    <div className="app">
      <TopNav current={tab} onChange={setTab} onSignOut={signOut} isAuthed={true} />
      <header className="app-header">
        {tab === 'recipes' && <><h1>🍳 Recipe Wizard</h1><p>Search for delicious recipes with detailed ingredients!</p></>}
        {tab === 'pantry' && <><h1>🥫 Pantry</h1><p>Manage ingredients you already have.</p></>}
        {tab === 'shopping' && <><h1>🛒 Shopping List</h1><p>Track what you need to buy.</p></>}
        {tab === 'chat' && <><h1>💬 Chat</h1><p>Ask the AI for ideas, substitutions, and tips.</p></>}
      </header>
      {tab === 'recipes' && <Recipes />}
      {tab === 'pantry' && <div className="main-container"><Pantry /></div>}
      {tab === 'shopping' && <div className="main-container"><ShoppingList /></div>}
      {tab === 'chat' && <div className="main-container"><Chat /></div>}
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

