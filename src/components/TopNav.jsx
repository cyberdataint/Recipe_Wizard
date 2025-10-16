import './TopNav.css'

export default function TopNav({ current, onChange, onSignOut, isAuthed }) {
  return (
    <nav className="topnav">
      <div className="brand">🍳 Recipe Wizard</div>
      {isAuthed && (
        <div className="tabs">
          {['recipes', 'pantry', 'shopping'].map((tab) => (
            <button
              key={tab}
              className={`tab ${current === tab ? 'active' : ''}`}
              onClick={() => onChange(tab)}
            >
              {tab === 'recipes' && 'Recipes'}
              {tab === 'pantry' && 'Pantry'}
              {tab === 'shopping' && 'Shopping List'}
            </button>
          ))}
        </div>
      )}
      <div className="spacer" />
      {isAuthed && (
        <button className="signout" onClick={onSignOut}>Sign Out</button>
      )}
    </nav>
  )
}
