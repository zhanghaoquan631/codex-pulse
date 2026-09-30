import { useEffect, useRef, useState } from 'react'

// Preserve the sized preview shell and the studio's image selection while
// letting React dispose and recreate the actual renderer on every visit.
export default function ViewportCanvas({ children, ...props }) {
  const rootRef = useRef(null)
  const [active, setActive] = useState(false)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    let nearby = false
    const update = () => setActive(nearby && !document.hidden)
    const observer = new IntersectionObserver(([entry]) => {
      nearby = entry.isIntersecting
      update()
    }, { rootMargin: '300px' })
    observer.observe(root)
    document.addEventListener('visibilitychange', update)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', update)
    }
  }, [])

  return <div {...props} ref={rootRef} data-canvas-active={active}>
    {active ? children : null}
  </div>
}
