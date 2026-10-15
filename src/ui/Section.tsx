import type { ReactNode, Ref } from 'react'

interface SectionProps {
  id: string
  number: number
  kind: 'Design pattern' | 'Architecture'
  title: string
  lead: ReactNode
  /** The live simulation and its controls. */
  children: ReactNode
  /** Right column: break-it switch, code panel. */
  aside: ReactNode
  solves: ReactNode
  whenNot: ReactNode[]
  ref?: Ref<HTMLElement>
}

export function Section({ id, number, kind, title, lead, children, aside, solves, whenNot, ref }: SectionProps) {
  return (
    <section id={id} ref={ref} className="pattern" aria-labelledby={`${id}-title`}>
      <header className="pattern-head">
        <span className="number">{String(number).padStart(2, '0')}</span>
        <div>
          <span className="kicker">{kind}</span>
          <h2 id={`${id}-title`}>{title}</h2>
          <p className="lead">{lead}</p>
        </div>
      </header>
      <div className="pattern-grid">
        <div className="stage-col">{children}</div>
        <div className="aside-col">{aside}</div>
      </div>
      <div className="notes">
        <div className="note solves">
          <h3>The problem it solves</h3>
          <p>{solves}</p>
        </div>
        <div className="note when-not">
          <h3>When not to use it</h3>
          <ul>
            {whenNot.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

/** Wraps up text in an SVG into lines of at most `max` characters. */
export function wrap(text: string, max: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line && (line + ' ' + word).length > max) {
      lines.push(line)
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  if (line) lines.push(line)
  return lines
}
