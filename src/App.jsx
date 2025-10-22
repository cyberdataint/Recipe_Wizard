import { lazy, Suspense, useEffect, useState } from 'react'
import './App.css'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { DataProvider } from './contexts/DataContext'
import Auth from './components/Auth'
import TopNav from './components/TopNav'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

// Lazy-load heavy sections so the auth page stays snappy
const Chat = lazy(() => import('./components/Chat'))

function HeaderByRoute() {
  const loc = useLocation()
  const path = loc.pathname || '/recipes'
  const get = () => {
    if (path.startsWith('/pantry')) return { title: '🥫 Pantry', sub: 'Manage ingredients you already have.' }
    if (path.startsWith('/shopping')) return { title: '🛒 Shopping List', sub: 'Track what you need to buy.' }
    if (path.startsWith('/planner')) return { title: '📆 Meal Planner', sub: 'Generate a smart weekly plan, grocery list, and prep steps.' }
    return { title: '🍳 Recipe Wizard', sub: 'Search for delicious recipes with detailed ingredients!' }
  }
  const { title, sub } = get()
  return (
    <header className="app-header">
      <h1>{title}</h1>
      <p>{sub}</p>
    </header>
  )
}

export function Protected() {
  const { user } = useAuth()
  return user ? <Outlet /> : <Navigate to="/auth" replace />
}

function AppShell() {
  const { user, signOut } = useAuth()
  return (
    <div className="app">
      <TopNav isAuthed={!!user} onSignOut={signOut} />
      <HeaderByRoute />
      <Suspense fallback={null}>
        <Outlet />
        {user && <LazyChat />}
      </Suspense>
    </div>
  )
}

// Mount the chat widget after page is idle to keep Pantry LCP clean
function LazyChat() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let id
    const trigger = () => setReady(true)
    if ('requestIdleCallback' in window) {
      // @ts-ignore
      id = window.requestIdleCallback(trigger, { timeout: 1800 })
      return () => { /* @ts-ignore */ window.cancelIdleCallback && window.cancelIdleCallback(id) }
    } else {
      id = setTimeout(trigger, 1200)
      return () => clearTimeout(id)
    }
  }, [])
  if (!ready) return null
  return <Chat />
}

export default function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <AppShell />
      </DataProvider>
    </AuthProvider>
  )
}

