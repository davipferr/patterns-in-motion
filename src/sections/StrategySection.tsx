import { useRef } from 'react'
import { useSim } from '../lib/useSim'
import { money } from '../lib/math'
import * as S from '../sims/strategy'
import { Section } from '../ui/Section'
import { CodePanel } from '../ui/CodePanel'
import { BreakIt, Button, Stat } from '../ui/controls'

const BELT = { x0: 16, x1: 584, y: 92 }
const CHECKOUT = { x: 222, y: 18, w: 156, h: 132 }
const SLOT_Y = CHECKOUT.y + 30
const TICKET = { w: 64, h: 40 }
const TRAY_Y = 196

export function StrategySection() {
  const ref = useRef<HTMLElement>(null)
  const [sim, rerender] = useSim(() => S.createStrategy(), S.stepStrategy, ref)
  const rule = S.activeRule(sim)
  const cardW = (BELT.x1 - BELT.x0 - (sim.rules.length - 1) * 8) / sim.rules.length

  return (
    <Section
      ref={ref}
      id="strategy"
      number={2}
      kind="Design pattern"
      title="Strategy"
      lead="Checkout doesn't know how to price an order. It asks whichever pricing strategy is plugged in."
      solves="Pricing rules change all the time: happy hour, delivery fees, student discounts. Each rule lives in its own small class with the same price() method. Checkout only calls strategy.price(order), so you can swap rules while it runs and add new ones without touching Checkout."
      whenNot={[
        'There are two rules and they almost never change. An if statement is fine.',
        'The rules need very different inputs, so one shared interface gets awkward.',
        'In TypeScript a plain function parameter is often enough. You do not need a class per strategy.',
      ]}
      aside={
        <>
          <BreakIt label="Hardcode it with if/else" on={sim.ifElse} onChange={(on) => (S.setIfElse(sim, on), rerender())}>
            Every rule is now a branch inside Checkout. Press <em>Add a pricing rule</em>: Checkout itself gets edited and
            redeployed, and orders pile up while it restarts.
          </BreakIt>
          <CodePanel
            file={sim.ifElse ? 'Checkout.ts' : `Checkout.ts + ${rule.name}.ts`}
            lines={S.strategyCode(sim)}
            hl={sim.hl}
            bad={sim.ifElse ? sim.rules.map((_, i) => 5 + i) : []}
          />
        </>
      }
    >
      <div className="stage">
        <svg viewBox="0 0 600 290" role="img" aria-label="Orders on a conveyor being priced by Checkout">
          <line className="belt" x1={BELT.x0} y1={BELT.y + TICKET.h / 2 + 6} x2={BELT.x1} y2={BELT.y + TICKET.h / 2 + 6} />

          <g className={sim.redeploy > 0 ? 'node down' : 'node'}>
            <rect x={CHECKOUT.x} y={CHECKOUT.y} width={CHECKOUT.w} height={CHECKOUT.h} rx={12} />
            <text x={CHECKOUT.x + CHECKOUT.w / 2} y={CHECKOUT.y + 20} textAnchor="middle" className="node-title small">
              Checkout
            </text>
          </g>

          {sim.orders.map((o) => {
            const x = BELT.x0 + o.x * (BELT.x1 - BELT.x0 - TICKET.w)
            const priced = o.price !== undefined
            return (
              <g key={o.id} className={priced ? 'ticket priced' : 'ticket'}>
                <rect x={x} y={BELT.y} width={TICKET.w} height={TICKET.h} rx={6} />
                <text x={x + TICKET.w / 2} y={BELT.y + 17} textAnchor="middle" className="ticket-main">
                  {priced ? money(o.price!) : money(o.subtotal)}
                </text>
                <text x={x + TICKET.w / 2} y={BELT.y + 31} textAnchor="middle" className="ticket-sub">
                  {priced ? o.priced : `${o.km} km`}
                </text>
              </g>
            )
          })}

          {sim.redeploy > 0 ? (
            <g className="redeploy">
              <text x={CHECKOUT.x + CHECKOUT.w / 2} y={SLOT_Y + 12} textAnchor="middle">
                redeploying Checkout…
              </text>
              <rect x={CHECKOUT.x + 16} y={SLOT_Y + 20} width={CHECKOUT.w - 32} height={4} rx={2} className="track" />
              <rect x={CHECKOUT.x + 16} y={SLOT_Y + 20} width={(CHECKOUT.w - 32) * (1 - sim.redeploy / 2.2)} height={4} rx={2} />
            </g>
          ) : (
            <g className="slot" style={{ opacity: sim.swap }}>
              <rect x={CHECKOUT.x + 12} y={SLOT_Y - (1 - sim.swap) * 12} width={CHECKOUT.w - 24} height={24} rx={6} />
              <text x={CHECKOUT.x + CHECKOUT.w / 2} y={SLOT_Y + 16 - (1 - sim.swap) * 12} textAnchor="middle">
                {sim.ifElse ? `mode = '${sim.active}'` : `strategy: ${rule.name}`}
              </text>
            </g>
          )}

          {!sim.ifElse && (
            <path
              className="plug"
              d={`M ${CHECKOUT.x + CHECKOUT.w / 2} ${CHECKOUT.y + CHECKOUT.h} V ${TRAY_Y - 16} H ${
                BELT.x0 + sim.rules.findIndex((r) => r.id === sim.active) * (cardW + 8) + cardW / 2
              } V ${TRAY_Y}`}
            />
          )}

          {sim.rules.map((r, i) => {
            const x = BELT.x0 + i * (cardW + 8)
            const on = r.id === sim.active
            return (
              <g
                key={r.id}
                className={on ? 'node card strategy on clickable' : 'node card strategy clickable'}
                onClick={() => (S.setStrategy(sim, r.id), rerender())}
                role="button"
                tabIndex={0}
                aria-label={`Use ${r.name} pricing`}
                aria-pressed={on}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (S.setStrategy(sim, r.id), rerender())}
              >
                <rect x={x} y={TRAY_Y} width={cardW} height={64} rx={10} />
                <text x={x + cardW / 2} y={TRAY_Y + 27} textAnchor="middle" className="node-title small">
                  {r.name}
                </text>
                <text x={x + cardW / 2} y={TRAY_Y + 46} textAnchor="middle" className="node-sub">
                  {r.formula}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="controls">
        <Button onClick={() => (S.addRule(sim), rerender())} disabled={!S.canAddRule(sim)}>
          + Add a pricing rule
        </Button>
        <span className="hint">Click a card to swap the strategy while orders are moving.</span>
        <div className="stats">
          <Stat label="edits to Checkout.ts" value={sim.checkoutEdits} tone={sim.checkoutEdits ? 'bad' : 'ok'} />
          <Stat label="new strategy files" value={sim.newFiles.length ? sim.newFiles.join(', ') : '—'} />
        </div>
      </div>
    </Section>
  )
}
