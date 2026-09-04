/**
 * Shared IntersectionObserver so thumbnails are generated lazily, only for
 * rows/tiles that actually enter (or approach) the viewport.
 */

type Callback = () => void

const callbacks = new WeakMap<Element, Callback>()
let observer: IntersectionObserver | null = null

function ensureObserver(): IntersectionObserver {
  if (observer) return observer
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        observer?.unobserve(entry.target)
        callbacks.get(entry.target)?.()
        callbacks.delete(entry.target)
      }
    },
    { rootMargin: '160px' },
  )
  return observer
}

/** Calls `callback` once, when `el` first becomes (nearly) visible. */
export function whenVisible(el: Element, callback: Callback): void {
  callbacks.set(el, callback)
  ensureObserver().observe(el)
}

export function cancelVisibilityWatch(el?: Element | null): void {
  if (!el) return
  observer?.unobserve(el)
  callbacks.delete(el)
}
