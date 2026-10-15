import { useRef } from 'react'
import { useSim } from '../lib/useSim'
import { lerpPoint, type Point } from '../lib/math'
import * as E from '../sims/events'
import { Section } from '../ui/Section'
import { CodePanel } from '../ui/CodePanel'
import { BreakIt, Button, Slider, Stat } from '../ui/controls'

const CUSTOMER = { x: 44, y: 165 }
const ORDERS = { x: 168, y: 165, w: 96, h: 62 }
const BROKER = { x: 318, y: 165, w: 104, h: 170 }
const CONSUMER = { x: 452, w: 156, h: 38 }
const MAX_SQUARES = 6

const consumerY = (i: number, n: number) => {
  const gap = Math.min(54, 300 / n)
  return 165 + (i - (n - 1) / 2) * gap
}

export function EventsSection() {
  const ref = useRef<HTMLElement>(null)
  const [sim, rerender] = useSim(E.createEvents, E.stepEvents, ref)
  const n = sim.consumers.length

  const place = (p: E.Place): Point => {
    if (p === 'customer') return CUSTOMER
    if (p === 'orders') return ORDERS
    if (p === 'broker') return BROKER
    const i = sim.consumers.findIndex((c) => c.id === p)
    return { x: CONSUMER.x + 8, y: consumerY(i, n) }
  }

  const stats = E.checkoutStats(sim)
  const backlog = sim.consumers.reduce((s, c) => s + c.queue, 0)
  const waiting = sim.checkouts.filter((c) => c.state === 'run').length

  return (
    <Section
      ref={ref}
      id="events"
      number={7}
      kind="Architecture"
      title="Event-driven (Pub/Sub)"
      lead={`Orders announces "an order was placed" once and answers the customer. Everyone who cares picks it up from the broker in their own time.`}
      solves="Orders publishes one event and replies right away. Kitchen, email, loyalty and analytics each get their own copy in their own queue. A slow or paused subscriber only builds up a backlog, and adding a new subscriber doesn't change Orders at all."
      whenNot={[
        'The customer needs the answer now, like "was the payment approved?". Events are for work that can happen a moment later.',
        'Debugging gets harder: there is no single call stack showing what happened to an order.',
        'You now have a broker to run and monitor, and you must handle events that arrive twice or out of order.',
      ]}
      aside={
        <>
          <BreakIt label="Call every subscriber directly" on={sim.sync} onChange={(on) => (E.setSync(sim, on), rerender())}>
            Orders calls each subscriber in turn and waits for each one. Checkout gets slower with every subscriber you add, and
            pausing any of them fails the checkout, sometimes after the kitchen already started cooking it.
          </BreakIt>
          <CodePanel file="Orders.ts" lines={E.eventsCode(sim)} hl={sim.hl} bad={sim.sync ? sim.consumers.map((_, i) => E.L.syncCall(i)) : []} />
        </>
      }
    >
      <div className="stage">
        <svg viewBox="0 0 620 330" role="img" aria-label="Orders publishing events to subscribers">
          <line className="wire" x1={CUSTOMER.x} y1={CUSTOMER.y} x2={ORDERS.x} y2={ORDERS.y} />
          {sim.sync
            ? sim.consumers.map((c, i) => (
                <line key={c.id} className="wire" x1={ORDERS.x + ORDERS.w / 2} y1={ORDERS.y} x2={CONSUMER.x} y2={consumerY(i, n)} />
              ))
            : (
              <>
                <line className="wire" x1={ORDERS.x} y1={ORDERS.y} x2={BROKER.x} y2={BROKER.y} />
                {sim.consumers.map((c, i) => (
                  <line key={c.id} className="wire faint" x1={BROKER.x + BROKER.w / 2} y1={BROKER.y} x2={CONSUMER.x - 14} y2={consumerY(i, n)} />
                ))}
              </>
            )}

          <g className="node">
            <circle cx={CUSTOMER.x} cy={CUSTOMER.y} r={26} />
            <text x={CUSTOMER.x} y={CUSTOMER.y + 6} textAnchor="middle" className="emoji">
              🧑
            </text>
            <text x={CUSTOMER.x} y={CUSTOMER.y + 46} textAnchor="middle" className="node-sub">
              customers
            </text>
            <text x={CUSTOMER.x} y={CUSTOMER.y + 62} textAnchor="middle" className="node-sub">
              waiting: {waiting}
            </text>
          </g>

          <g className="node">
            <rect x={ORDERS.x - ORDERS.w / 2} y={ORDERS.y - ORDERS.h / 2} width={ORDERS.w} height={ORDERS.h} rx={10} />
            <text x={ORDERS.x} y={ORDERS.y - 4} textAnchor="middle" className="node-title small">
              Orders
            </text>
            <text x={ORDERS.x} y={ORDERS.y + 14} textAnchor="middle" className="node-sub">
              edits: {sim.ordersEdits}
            </text>
          </g>

          {!sim.sync && (
            <g className="node broker">
              <rect x={BROKER.x - BROKER.w / 2} y={BROKER.y - BROKER.h / 2} width={BROKER.w} height={BROKER.h} rx={12} />
              <text x={BROKER.x} y={BROKER.y - BROKER.h / 2 + 22} textAnchor="middle" className="node-title small">
                Broker
              </text>
              <text x={BROKER.x} y={BROKER.y - BROKER.h / 2 + 40} textAnchor="middle" className="mono-text small">
                order.placed
              </text>
            </g>
          )}
          {sim.sync && (
            <text x={BROKER.x} y={BROKER.y + BROKER.h / 2 + 4} textAnchor="middle" className="node-sub">
              no broker: Orders calls each one
            </text>
          )}

          {sim.consumers.map((c, i) => {
            const y = consumerY(i, n)
            const shown = Math.min(c.queue, MAX_SQUARES)
            return (
              <g key={c.id}>
                {!sim.sync &&
                  Array.from({ length: shown }, (_, k) => (
                    <rect key={k} className={c.paused ? 'queue-sq piling' : 'queue-sq'} x={CONSUMER.x - 14 - k * 10} y={y - 4} width={8} height={8} rx={2} />
                  ))}
                {!sim.sync && c.queue > MAX_SQUARES && (
                  <text x={CONSUMER.x - 14 - MAX_SQUARES * 10 - 2} y={y + 4} textAnchor="end" className="node-sub bad-text">
                    +{c.queue - MAX_SQUARES}
                  </text>
                )}
                <g
                  className={c.paused ? 'node card paused clickable' : 'node card clickable'}
                  onClick={() => (E.togglePause(sim, c.id), rerender())}
                  role="button"
                  tabIndex={0}
                  aria-pressed={c.paused}
                  aria-label={`${c.paused ? 'Resume' : 'Pause'} ${c.label}`}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (E.togglePause(sim, c.id), rerender())}
                >
                  <rect x={CONSUMER.x} y={y - CONSUMER.h / 2} width={CONSUMER.w} height={CONSUMER.h} rx={9} />
                  <rect className="flash-fill" x={CONSUMER.x} y={y - CONSUMER.h / 2} width={CONSUMER.w} height={CONSUMER.h} rx={9} style={{ opacity: c.flash * 0.3 }} />
                  <text x={CONSUMER.x + 12} y={y - 2} className="node-title tiny">
                    {c.label}
                  </text>
                  <text x={CONSUMER.x + 12} y={y + 13} className="node-sub">
                    {c.paused ? 'paused · click to resume' : `handled ${c.handled}${sim.sync ? '' : ` · queue ${c.queue}`}`}
                  </text>
                  {c.working >= 0 && <rect className="progress" x={CONSUMER.x + 6} y={y + CONSUMER.h / 2 - 5} width={(CONSUMER.w - 12) * c.working} height={3} rx={1.5} />}
                </g>
              </g>
            )
          })}

          {sim.copies.map((copy) => {
            const i = sim.consumers.findIndex((c) => c.id === copy.to)
            const from = { x: BROKER.x + BROKER.w / 2, y: BROKER.y }
            const p = lerpPoint(from, { x: CONSUMER.x - 14, y: consumerY(i, n) }, copy.t)
            return <rect key={copy.id} className="event-copy" x={p.x - 4} y={p.y - 4} width={8} height={8} rx={2} />
          })}

          {sim.checkouts.map((c) => {
            const pos = E.checkoutPosition(c)
            const p = lerpPoint(place(pos.from), place(pos.to), pos.p)
            const cls = c.state === 'failed' || c.doomed ? 'pulse bad' : c.state === 'ok' ? 'pulse ok' : c.waiting ? 'pulse warn' : 'pulse'
            return <circle key={c.id} className={cls} cx={p.x} cy={p.y} r={6} style={{ opacity: 1 - c.fade / 0.6 }} />
          })}
        </svg>
      </div>
      <div className="controls column">
        <div className="row">
          <Button onClick={() => (E.addConsumer(sim), rerender())} disabled={!E.canAddConsumer(sim)}>
            + Add a subscriber{E.canAddConsumer(sim) ? ` (${E.CONSUMERS[n].label})` : ''}
          </Button>
          <Slider label="Orders" value={sim.rate} min={0.3} max={1.6} step={0.1} format={(v) => `${v.toFixed(1)}/s`} onChange={(v) => ((sim.rate = v), rerender())} />
          <span className="hint">Click a subscriber to pause it.</span>
        </div>
        <div className="stats">
          <Stat label="avg checkout time" value={stats.latency === null ? '—' : `${stats.latency.toFixed(2)}s`} tone={stats.latency === null ? undefined : stats.latency > 2 ? 'bad' : 'ok'} />
          <Stat label={`failed checkouts (last ${E.WINDOW}s)`} value={stats.failed} tone={stats.failed ? 'bad' : 'ok'} />
          <Stat label="failed but partly done" value={sim.halfDone} tone={sim.halfDone ? 'bad' : undefined} />
          {!sim.sync && <Stat label="events waiting in queues" value={backlog} tone={backlog > 10 ? 'warn' : undefined} />}
          <Stat label="edits to Orders.ts" value={sim.ordersEdits} tone={sim.ordersEdits ? 'bad' : 'ok'} />
        </div>
      </div>
    </Section>
  )
}
