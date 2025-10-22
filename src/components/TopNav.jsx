import './TopNav.css'
import { NavLink } from 'react-router-dom'

export default function TopNav({ onSignOut, isAuthed }) {
  return (
    <nav className="topnav">
      <div className="brand">🍳 Recipe Wizard</div>
      {isAuthed && (
        <div className="tabs">
          <NavLink to="/recipes" className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>Recipes</NavLink>
          <NavLink to="/pantry" className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>Pantry</NavLink>
          <NavLink to="/shopping" className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>Shopping List</NavLink>
          <NavLink to="/planner" className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>Meal Planner</NavLink>
        </div>
      )}
      <div className="spacer" />
      {isAuthed && (
        <button className="signout" onClick={onSignOut}>Sign Out</button>
      )}
    </nav>
  )
}
