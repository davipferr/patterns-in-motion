import { createContext, useContext, useState, type ReactNode } from 'react'

interface Speed {
  speed: number
  setSpeed: (speed: number) => void
}

const SpeedContext = createContext<Speed>({ speed: 1, setSpeed: () => {} })

/** One global playback speed (0 = paused) shared by every simulation on the page. */
export function SpeedProvider({ children }: { children: ReactNode }) {
  const [speed, setSpeed] = useState(1)
  return <SpeedContext value={{ speed, setSpeed }}>{children}</SpeedContext>
}

export const useSpeed = () => useContext(SpeedContext)
