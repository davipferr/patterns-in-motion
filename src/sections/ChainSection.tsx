import { useRef } from 'react'
import { useSim } from '../lib/useSim'
import { clamp, easeInOut, lerp, money } from '../lib/math'
import * as C from '../sims/chain'
import { Section } from '../ui/Section'
import { CodePanel } from '../ui/CodePanel'
import { BreakIt, Button, Checkbox, Stat } from '../ui/controls'

const CUSTOMER = { x: 44, y: 150 }
const CARD = { w: 92, h: 84, y: 150 }
/** Refund tickets travel along this line, above the handlers. */
const TRACK = 76
const PILE = 262
const END_R = 20

const cardX = (i: number) => 142 + i * 108
const trackX = (i: number) => (i < 0 ? CUSTOMER.x : cardX(i))

function ticket(r: C.Refund, n: number) {
  if (r.phase === 'move') {
    const p = easeInOut(clamp(r.t / r.dur, 0, 1))
    return { x: lerp(trackX(r.from), trackX(r.at), p), y: TRACK, opacity: 1 }
  }
  if (r.phase === 'check') return { x: trackX(r.at), y: TRACK, opacity: 1 }
  const opacity = 1 - clamp((r.t - 0.6) / (C.FADE - 0.6), 0, 1)
  if (r.outcome === 'approved') return { x: cardX(r.at), y: lerp(TRACK, PILE, easeInOut(clamp(r.t / 0.5, 0, 1))), opacity }
  return { x: trackX(Math.min(r.at, n)), y: TRACK, opacity }
}

export function ChainSection() {
  const ref = useRef<HTMLElement>(null)
  const [sim, rerender] = useSim(() => C.createChain(), C.stepChain, ref)
  const act = (fn: () => void) => () => (fn(), rerender())
  const n = sim.chain.length
  const checking = new Set(sim.refunds.filter((r) => r.phase === 'check').map((r) => r.at))

  return (
    <Section
      ref={ref}
      id="chain"
      number={4}
      kind="Design pattern"
      title="Chain of Responsibility"
      lead="A refund goes to the cashier. Anything the cashier can't approve is passed up the line until someone can, or until the chain runs out."
      solves="The customer hands every refund to the first handler and never needs to know who ends up approving it. Each handler decides on its own: approve it, or pass it to the next one. Handlers can be added, reordered or go on a break without the customer's code changing."
      whenNot={[
        'Order matters and the code hides it. Move the Owner to the front: now the owner approves every $4 refund.',
        'A request can fall off the end with nobody handling it. You need a sensible default at the end of the chain.',
        'There is exactly one obvious handler for each request. A direct call or a lookup table is simpler to read.',
      ]}
      aside={
        <>
          <BreakIt label="The client picks the handler" on={sim.direct} onChange={(on) => (C.setDirect(sim, on), rerender())}>
            No chain: the customer's code checks the amount and calls the right person itself. It has to know every handler and
            its limit, adding one means editing it, and when that person is on a break the refund just fails, even if someone
            else could have approved it.
          </BreakIt>
          <CodePanel
            file={sim.direct ? 'RefundDesk.ts' : 'refunds.ts'}
            lines={C.chainCode(sim)}
            hl={sim.hl}
            bad={sim.direct ? sim.chain.map((_, i) => C.L.directIf(i)) : []}
          />
        </>
      }
    >
      <div className="stage">
        <svg viewBox="0 0 620 330" role="img" aria-label="A refund request passed along a chain of handlers">
          <defs>
            <marker id="chain-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M 0 0 L 8 4 L 0 8 z" className="arrow-head" />
            </marker>
          </defs>

          {sim.direct
            ? sim.chain.map((h, i) => (
                <path key={h.id} className="wire faint" d={`M ${CUSTOMER.x} ${CUSTOMER.y - 26} Q ${(CUSTOMER.x + cardX(i)) / 2} 26 ${cardX(i)} ${CARD.y - CARD.h / 2}`} />
              ))
            : [-1, ...sim.chain.map((_, i) => i)].map((i) => {
                const x1 = i < 0 ? CUSTOMER.x + 26 : cardX(i) + CARD.w / 2
                const x2 = i + 1 < n ? cardX(i + 1) - CARD.w / 2 : cardX(n) - END_R
                return <line key={i} className="wire" x1={x1} y1={CARD.y} x2={x2 - 2} y2={CARD.y} markerEnd="url(#chain-arrow)" />
              })}

          <g className="node">
            <circle cx={CUSTOMER.x} cy={CUSTOMER.y} r={26} />
            <text x={CUSTOMER.x} y={CUSTOMER.y + 6} textAnchor="middle" className="emoji">
              🧑
            </text>
            <text x={CUSTOMER.x} y={CUSTOMER.y + 46} textAnchor="middle" className="node-sub">
              customer
            </text>
          </g>

          {sim.chain.map((h, i) => {
            const x = cardX(i) - CARD.w / 2
            const y = CARD.y - CARD.h / 2
            const cls = ['node', 'card', 'clickable', h.away ? 'paused' : '', checking.has(i) ? 'on' : ''].filter(Boolean).join(' ')
            return (
              <g
                key={h.id}
                className={cls}
                onClick={act(() => C.toggleAway(sim, h.id))}
                role="button"
                tabIndex={0}
                aria-pressed={h.away}
                aria-label={`${h.away ? 'Bring back' : 'Send on a break:'} ${h.label}`}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (C.toggleAway(sim, h.id), rerender())}
              >
                <rect x={x} y={y} width={CARD.w} height={CARD.h} rx={10} />
                <rect className="flash-fill" x={x} y={y} width={CARD.w} height={CARD.h} rx={10} style={{ opacity: h.flash * 0.3 }} />
                <text x={cardX(i)} y={y + 24} textAnchor="middle" className="node-title tiny">
                  {h.label}
                </text>
                <text x={cardX(i)} y={y + 44} textAnchor="middle" className="mono-text small">
                  ≤ {money(h.limit).replace('.00', '')}
                </text>
                <text x={cardX(i)} y={y + 66} textAnchor="middle" className="node-sub">
                  {h.away ? 'on a break' : `approved ${h.handled}`}
                </text>
              </g>
            )
          })}

          <g className="node end">
            <circle cx={cardX(n)} cy={CARD.y} r={END_R} />
            <text x={cardX(n)} y={CARD.y + 5} textAnchor="middle" className="node-title small">
              ∅
            </text>
            <text x={cardX(n)} y={CARD.y + END_R + 16} textAnchor="middle" className="node-sub">
              nobody
            </text>
          </g>

          <text x={cardX(0) - CARD.w / 2} y={PILE + 30} className="node-sub">
            approved refunds drop below the person who approved them
          </text>
          <text x={CUSTOMER.x - 26} y={316} className="node-sub">
            {sim.direct ? 'The customer knows every handler and its limit.' : `The customer only knows ${sim.chain[0].varName}.`}
          </text>

          {sim.refunds.map((r) => {
            const p = ticket(r, n)
            const cls =
              r.outcome === 'approved' ? 'refund ok' : r.outcome ? 'refund bad' : r.phase === 'check' ? 'refund checking' : 'refund'
            return (
              <g key={r.id} className={cls} transform={`translate(${p.x} ${p.y})`} style={{ opacity: p.opacity }}>
                <rect x={-21} y={-11} width={42} height={22} rx={6} />
                <text y={4} textAnchor="middle">
                  ${r.amount}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="controls column">
        <div className="row">
          <span className="hint">Send a refund:</span>
          {[8, 35, 150, 600].map((amount) => (
            <Button key={amount} onClick={act(() => C.send(sim, amount))}>
              ${amount}
            </Button>
          ))}
          <Checkbox label="Auto" checked={sim.auto} onChange={(on) => ((sim.auto = on), rerender())} />
          <Button onClick={act(() => C.addHandler(sim))} disabled={!C.canAddHandler(sim)}>
            + Add {C.EXTRA.label} (≤ ${C.EXTRA.limit})
          </Button>
        </div>
        <div className="row chips">
          {sim.chain.map((h, i) => (
            <span key={h.id} className={h.away ? 'chip' : 'chip on'}>
              <button type="button" onClick={act(() => C.toggleAway(sim, h.id))} aria-pressed={!h.away}>
                {h.away ? '☕ ' : '✓ '}
                {h.label}
              </button>
              <button type="button" className="chip-move" title="Earlier in the chain" aria-label={`Move ${h.label} earlier`} disabled={i === 0} onClick={act(() => C.moveHandler(sim, h.id, -1))}>
                ←
              </button>
              <button type="button" className="chip-move" title="Later in the chain" aria-label={`Move ${h.label} later`} disabled={i === n - 1} onClick={act(() => C.moveHandler(sim, h.id, 1))}>
                →
              </button>
            </span>
          ))}
          <span className="hint">Click a handler to send them on a break. ← / → reorder the chain.</span>
        </div>
        <div className="stats">
          <Stat label="approved" value={sim.counts.approved} tone="ok" />
          <Stat label="nobody could approve" value={sim.counts.unhandled} tone={sim.counts.unhandled ? 'warn' : undefined} />
          {sim.direct && <Stat label="failed: handler on a break" value={sim.counts.failed} tone={sim.counts.failed ? 'bad' : 'ok'} />}
          <Stat label="edits to the client" value={sim.clientEdits} tone={sim.clientEdits ? 'bad' : 'ok'} />
        </div>
      </div>
    </Section>
  )
}
