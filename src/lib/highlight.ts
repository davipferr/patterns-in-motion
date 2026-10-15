/**
 * Code lines that "light up" when the simulation runs them.
 * Each flash fades out over `FLASH` seconds, so you can follow fast sequences.
 */
export const FLASH = 0.9

export type Highlights = Map<number, number>

export function flash(h: Highlights, ...lines: number[]) {
  for (const line of lines) h.set(line, FLASH)
}

export function decay(h: Highlights, dt: number) {
  for (const [line, left] of h) {
    if (left - dt <= 0) h.delete(line)
    else h.set(line, left - dt)
  }
}

/** 0..1 glow strength for a line. */
export const glow = (h: Highlights, line: number) => (h.get(line) ?? 0) / FLASH
