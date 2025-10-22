import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// Lightweight portal tooltip that renders at the document level so it isn't clipped by overflow.
// Props:
// - open: boolean
// - text: string (tooltip content)
// - anchorRect: DOMRect from getBoundingClientRect() of the trigger element
// - maxWidth: number (optional)
export default function UITooltip({ open, text, anchorRect, maxWidth = 280 }) {
  const [pos, setPos] = useState(null)

  useEffect(() => {
    if (!open || !anchorRect) { setPos(null); return }
    // Position relative to viewport (position: fixed)
    const viewportPadding = 8
    const left = Math.min(
      Math.max(anchorRect.left + anchorRect.width / 2, viewportPadding),
      window.innerWidth - viewportPadding
    )
    const top = Math.max(anchorRect.top - 10, viewportPadding) // hover above the badge
    setPos({ top, left })
  }, [open, anchorRect])

  useEffect(() => {
    if (!open) return
    const handle = () => setPos(null) // hide on scroll/resize to avoid stale position
    window.addEventListener('scroll', handle, true)
    window.addEventListener('resize', handle)
    return () => {
      window.removeEventListener('scroll', handle, true)
      window.removeEventListener('resize', handle)
    }
  }, [open])

  if (!open || !pos) return null
  const content = (
    <div className="tooltip-portal" style={{ top: pos.top, left: pos.left }}>
      <div className="tooltip-bubble" style={{ maxWidth }}>
        {text}
        <span className="tooltip-arrow" />
      </div>
    </div>
  )
  return createPortal(content, document.body)
}
