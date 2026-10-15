import { useReducer, useRef, type RefObject } from 'react'
import { useFrame } from './frame'
import { useSpeed } from './speed'

/**
 * Keep a mutable simulation object alive across renders, step it every frame
 * while its section is on screen, and re-render after each step.
 * Simulations are plain objects + functions (see src/sims), so they are testable without React.
 */
export function useSim<T>(create: () => T, step: (sim: T, dt: number) => void, target: RefObject<Element | null>) {
  const ref = useRef<T | null>(null)
  if (ref.current === null) ref.current = create()
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const { speed } = useSpeed()

  useFrame(target, (dt) => {
    if (dt > 0 && speed > 0) step(ref.current!, dt * speed)
    rerender()
  })

  return [ref.current, rerender] as const
}
