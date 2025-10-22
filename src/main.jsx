import { StrictMode, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App, { Protected } from './App.jsx'
import Auth from './components/Auth'
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider, Navigate } from 'react-router-dom'

// Lazy-load heavy sections so the auth page stays snappy
const Pantry = lazy(() => import('./components/Pantry'))
const ShoppingList = lazy(() => import('./components/ShoppingList'))
const Recipes = lazy(() => import('./components/Recipes'))
const MealPlanner = lazy(() => import('./components/MealPlanner'))

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<App />}>
      <Route index element={<Navigate to="/recipes" replace />} />
      <Route path="auth" element={<Auth />} />
      <Route element={<Protected />}>
        <Route path="recipes" element={<Recipes />} />
        <Route path="pantry" element={<div className="main-container"><Pantry /></div>} />
        <Route path="shopping" element={<div className="main-container"><ShoppingList /></div>} />
        <Route path="planner" element={<div className="main-container"><MealPlanner /></div>} />
      </Route>
      <Route path="*" element={<Navigate to="/recipes" replace />} />
    </Route>
  ),
  {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    },
  }
)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
