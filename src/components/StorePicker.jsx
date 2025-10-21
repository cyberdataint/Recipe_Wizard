import { useEffect, useRef, useState } from 'react'
import krogerAPI from '../KrogerAPI'
import './StorePicker.css'

/*
  StorePicker: ZIP + radius store finder with a results panel
  Props:
    - onSelect(location): called with full location object when user selects
    - initialZip?: string
    - initialLocationId?: string
*/
export default function StorePicker({ onSelect, initialZip = '', initialLocationId = '' }) {
  const [zip, setZip] = useState(() => initialZip || localStorage.getItem('kroger_zip') || '')
  const [radius, setRadius] = useState(7)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError, setGeoError] = useState('')
  const [stores, setStores] = useState([])
  const [selectedId, setSelectedId] = useState(initialLocationId || krogerAPI.locationId || '')
  const wrapRef = useRef(null)

  useEffect(() => {
    const onClick = (e) => {
      if (open && wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [open])

  const search = async () => {
    if (!zip || zip.length < 5) return
    setLoading(true)
    try {
      localStorage.setItem('kroger_zip', String(zip))
      const uiLimit = 10
      const data = await krogerAPI.listLocationsByZip({ zip, radius, limit: uiLimit, chain: 'Kroger' })
      const filtered = (data || []).filter((s) => {
        const nm = (s?.name || '').toLowerCase()
        return !(nm.includes('fuel') || nm.includes('gas'))
      })
      const sorted = filtered.sort((a, b) => (a.distance || 0) - (b.distance || 0))
      const capped = sorted.slice(0, uiLimit)
      setStores(capped)
      setOpen(true)
    } finally { setLoading(false) }
  }

  const useMyLocation = async () => {
    setGeoError('')
    if (!('geolocation' in navigator)) {
      setGeoError('Geolocation not supported by this browser')
      return
    }
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude, longitude } = pos.coords
        const uiLimit = 10
        const data = await krogerAPI.listLocationsByLatLon({ lat: latitude, lon: longitude, radius, limit: uiLimit, chain: 'Kroger' })
        const filtered = (data || []).filter((s) => {
          const nm = (s?.name || '').toLowerCase()
          return !(nm.includes('fuel') || nm.includes('gas'))
        })
        const sorted = filtered.sort((a, b) => (a.distance || 0) - (b.distance || 0))
        const capped = sorted.slice(0, uiLimit)
        setStores(capped)
        // Best-effort: set ZIP from the first returned store
        const firstZip = capped?.[0]?.address?.zipCode
        if (firstZip) {
          setZip(String(firstZip))
          try { localStorage.setItem('kroger_zip', String(firstZip)) } catch {}
        }
        setOpen(true)
      } catch (e) {
        setGeoError('Unable to find stores near your location')
      } finally {
        setGeoLoading(false)
      }
    }, (err) => {
      setGeoLoading(false)
      if (err?.code === 1) setGeoError('Location permission denied')
      else setGeoError('Failed to get your location')
    }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 })
  }

  const choose = (loc) => {
    setSelectedId(loc.locationId)
    setOpen(false)
    krogerAPI.setLocationId(loc.locationId)
    if (onSelect) onSelect(loc)
  }

  const selected = stores.find(s => s.locationId === selectedId)

  return (
    <div className="storepicker" ref={wrapRef} style={{ position: 'relative' }}>
      <label className="sp-label">Store</label>
      <input
        className="zip-input"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="ZIP"
        value={zip}
        onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
        onKeyDown={(e) => { if (e.key === 'Enter') search() }}
      />
      <select className="radius-select" value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
        <option value={5}>5 mi</option>
        <option value={7}>7 mi</option>
        <option value={10}>10 mi</option>
        <option value={15}>15 mi</option>
      </select>
      <button className="find-btn refresh-prices-btn" onClick={search} disabled={loading || (zip || '').length < 5}>
        {loading ? 'Searching…' : 'Find stores'}
      </button>
      <button className="find-btn refresh-prices-btn" onClick={useMyLocation} disabled={geoLoading}>
        {geoLoading ? 'Locating…' : 'Use my location'}
      </button>

      {geoError && (
        <span style={{ color: '#ffdede' }}>{geoError}</span>
      )}

      {/* Selected summary */}
      {selectedId && (
        <button className="refresh-prices-btn" style={{ background: '#fff', color: '#000' }} onClick={() => setOpen((v) => !v)}>
          {selected?.name || 'Change store'}
        </button>
      )}

      {open && (
        <div className="panel">
          <div className="panel-header">
            <strong>Stores near {zip} • within {radius} miles</strong>
            <button className="select-btn" onClick={() => setOpen(false)}>Close</button>
          </div>
          <div className="results">
            {stores.length === 0 && (
              <div className="empty">No stores found. Try a larger radius.</div>
            )}
            {stores.map((s) => (
              <div key={s.locationId} className="item" onClick={() => choose(s)}>
                <div>
                  <div className="name">{s.name}</div>
                  <div className="meta">{s.address?.addressLine1 || ''}{s.address?.city ? ` • ${s.address.city}` : ''}{s.address?.state ? `, ${s.address.state}` : ''} {s.address?.zipCode || ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {s.distance != null && <div className="distance">{Number(s.distance).toFixed(1)} mi</div>}
                  <button className="select-btn">Select</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
