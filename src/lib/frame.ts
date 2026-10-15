import { useEffect, useRef, type RefObject } from 'react'

/**
 * Run `callback(dt)` every animation frame while `target` is on screen.
 * Sections far down the page cost nothing until you scroll to them.
 * `dt` is in seconds and capped, so a background tab never causes a huge jump.
 */
export function useFrame(target: RefObject<Element | null>, callback: (dt: number) => void, enabled = true) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!enabled) return
    const element = target.current
    let raf = 0
    let last = 0

    const loop = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0
      last = now
      callbackRef.current(dt)
      raf = requestAnimationFrame(loop)
    }
    const start = () => {
      if (raf) return
      last = 0
      raf = requestAnimationFrame(loop)
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }

    if (!element) {
      start()
      return stop
    }
    const observer = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()), {
      rootMargin: '100px',
    })
    observer.observe(element)
    return () => {
      stop()
      observer.disconnect()
    }
  }, [enabled, target])
}
