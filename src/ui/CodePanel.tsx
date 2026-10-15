import type { CSSProperties, ReactNode } from 'react'
import { glow, type Highlights } from '../lib/highlight'

const TOKEN =
  /(\/\/.*$)|('(?:[^'\\]|\\.)*')|\b(class|interface|implements|extends|abstract|const|let|return|if|else|new|async|await|throw|private|protected|constructor|for|of|this)\b|\b(\d+(?:\.\d+)?)\b|\b([A-Z][A-Za-z]*)\b/g

/** A tiny TypeScript highlighter: enough for the short snippets on this page. */
function highlight(line: string) {
  const parts: ReactNode[] = []
  let last = 0
  for (const m of line.matchAll(TOKEN)) {
    if (m.index > last) parts.push(line.slice(last, m.index))
    const kind = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'k' : m[4] ? 'n' : 't'
    parts.push(
      <span key={m.index} className={`tok-${kind}`}>
        {m[0]}
      </span>,
    )
    last = m.index + m[0].length
  }
  if (last < line.length) parts.push(line.slice(last))
  return parts
}

interface CodePanelProps {
  file: string
  lines: string[]
  hl: Highlights
  /** Lines drawn as the bug (the "break it" change). */
  bad?: number[]
  note?: string
}

export function CodePanel({ file, lines, hl, bad = [], note }: CodePanelProps) {
  return (
    <figure className="code">
      <figcaption>
        <span className="dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className="mono">{file}</span>
        {note && <span className="code-note">{note}</span>}
      </figcaption>
      <pre>
        {lines.map((line, i) => (
          <div
            key={i}
            className={bad.includes(i) ? 'line bad' : 'line'}
            style={{ '--glow': glow(hl, i) } as CSSProperties}
          >
            <span className="ln">{i + 1}</span>
            <code>{line ? highlight(line) : ' '}</code>
          </div>
        ))}
      </pre>
    </figure>
  )
}
