import { useRef } from 'react'
import { useSim } from '../lib/useSim'
import { lerpPoint, type Point } from '../lib/math'
import * as O from '../sims/observer'
import { Section } from '../ui/Section'
import { CodePanel } from '../ui/CodePanel'
import { BreakIt, Button, Checkbox, Stat } from '../ui/controls'

const OVEN = { x: 30, y: 128, w: 160, h: 84 }
const OVEN_OUT: Point = { x: OVEN.x + OVEN.w, y: OVEN.y + OVEN.h / 2 }
const CARD = { x: 400, w: 180, h: 56 }
const rowY = (i: number) => 18 + i * 76
const cardIn = (i: number): Point => ({ x: CARD.x, y: rowY(i) + CARD.h / 2 })
const ghostAt = (i: number, k: number): Point => ({ x: CARD.x - 26 - k * 26, y: rowY(i) + CARD.h / 2 })

const CODE = [
  'class Oven {',
  '  private observers = new Set<Observer>()',
  '',
  '  subscribe(o: Observer) {',
  '    this.observers.add(o)',
  '    return () => this.observers.delete(o)',
  '  }',
  '',
  '  pizzaReady(order: Order) {',
  '    for (const o of this.observers) o.update(order)',
  '  }',
  '}',
  '',
  '// DriverApp.tsx (every screen does this)',
  'useEffect(() => {',
  '  const unsubscribe = oven.subscribe(driverScreen)',
  '  return unsubscribe',
  '}, [])',
]

export function ObserverSection() {
  const ref = useRef<HTMLElement>(null)
  const [sim, rerender] = useSim(O.createObserver, O.stepObserver, ref)
  const act = (fn: () => void) => () => {
    fn()
    rerender()
  }

  /** Where each subscribed instance sits on screen. */
  const position = (id: number): Point => {
    const inst = sim.instances.find((i) => i.id === id)!
    const row = O.KINDS.findIndex((k) => k.kind === inst.kind)
    if (inst.alive) return cardIn(row)
    return ghostAt(row, O.ghosts(sim, inst.kind).indexOf(inst))
  }

  const code = [...CODE]
  if (sim.leak) code[O.L.cleanup] = '  // return unsubscribe   ← forgotten'
  const ghostCount = O.KINDS.reduce((n, k) => n + O.ghosts(sim, k.kind).length, 0)

  return (
    <Section
      ref={ref}
      id="observer"
      number={1}
      kind="Design pattern"
      title="Observer"
      lead="When a pizza is ready, the oven tells everyone on its list. It doesn't know or care who they are."
      solves="The oven shouldn't need to know every screen, phone and report that cares about a finished pizza. Anything can subscribe, and the oven just loops over its list. Add a new listener and the oven's code stays the same."
      whenNot={[
        'Only one thing ever listens. A direct call is simpler and easier to follow.',
        'You need the reactions to run in a set order, or to know whether they succeeded. Observers just fire.',
        'Observers that trigger other observers turn into chains that are hard to debug.',
      ]}
      aside={
        <>
          <BreakIt label="Forget to unsubscribe" on={sim.leak} onChange={(on) => (O.setLeak(sim, on), rerender())}>
            The screen's cleanup is gone. Unmount and remount the Driver app a few times: every old copy stays on the oven's
            list as a ghost and keeps getting notified. In a real app that's a memory leak and duplicate work.
          </BreakIt>
          <CodePanel file="Oven.ts" lines={code} hl={sim.hl} bad={sim.leak ? [O.L.cleanup] : []} />
        </>
      }
    >
      <div className="stage">
        <svg viewBox="0 0 600 320" role="img" aria-label="An oven notifying its subscribers">
          {[...sim.subscribers].map((id) => {
            const p = position(id)
            const ghost = !sim.instances.find((i) => i.id === id)!.alive
            return <line key={id} className={ghost ? 'wire ghost' : 'wire'} x1={OVEN_OUT.x} y1={OVEN_OUT.y} x2={p.x} y2={p.y} />
          })}

          <g className={sim.ovenFlash > 0 ? 'node hot' : 'node'}>
            <rect x={OVEN.x} y={OVEN.y} width={OVEN.w} height={OVEN.h} rx={12} />
            <text x={OVEN.x + 16} y={OVEN.y + 30} className="node-title">
              Oven
            </text>
            <text x={OVEN.x + 16} y={OVEN.y + 50} className="node-sub">
              subject
            </text>
            <text x={OVEN.x + 16} y={OVEN.y + 68} className="node-sub">
              observers: {sim.subscribers.size}
            </text>
            <text x={OVEN.x + OVEN.w - 20} y={OVEN.y + 44} className="emoji" textAnchor="middle" style={{ opacity: 0.4 + sim.ovenFlash * 0.6 }}>
              🍕
            </text>
          </g>

          {O.KINDS.map(({ kind, label }, row) => {
            const live = O.current(sim, kind)
            const y = rowY(row)
            return (
              <g key={kind}>
                {O.ghosts(sim, kind).map((g, k) => {
                  const p = ghostAt(row, k)
                  return (
                    <g key={g.id} className="ghost-chip" style={{ opacity: 0.55 + g.flash * 0.45 }}>
                      <rect x={p.x - 11} y={p.y - 11} width={22} height={22} rx={6} />
                      <text x={p.x} y={p.y + 4} textAnchor="middle">
                        {g.received}
                      </text>
                    </g>
                  )
                })}
                <g
                  className={live ? 'node card clickable' : 'node card unmounted clickable'}
                  onClick={act(() => O.toggle(sim, kind))}
                  role="button"
                  tabIndex={0}
                  aria-label={`${live ? 'Unmount' : 'Mount'} ${label}`}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (O.toggle(sim, kind), rerender())}
                >
                  <rect x={CARD.x} y={y} width={CARD.w} height={CARD.h} rx={10} style={live ? { strokeOpacity: 0.4 + live.flash * 0.6 } : undefined} />
                  {live && <rect className="flash-fill" x={CARD.x} y={y} width={CARD.w} height={CARD.h} rx={10} style={{ opacity: live.flash * 0.35 }} />}
                  <text x={CARD.x + 14} y={y + 24} className="node-title small">
                    {label}
                  </text>
                  <text x={CARD.x + 14} y={y + 42} className="node-sub">
                    {live ? `received ${live.received} · click to unmount` : 'unmounted · click to mount'}
                  </text>
                </g>
              </g>
            )
          })}

          {sim.pulses.map((pulse) => {
            const p = lerpPoint(OVEN_OUT, position(pulse.to), Math.min(1, pulse.t))
            const ghost = !sim.instances.find((i) => i.id === pulse.to)!.alive
            return <circle key={pulse.id} className={ghost ? 'pulse bad' : 'pulse'} cx={p.x} cy={p.y} r={6} />
          })}
        </svg>
      </div>
      <div className="controls">
        <Button variant="primary" onClick={act(() => O.bake(sim))}>
          🍕 Bake a pizza
        </Button>
        <Checkbox label="Auto-bake" checked={sim.autoBake} onChange={(on) => ((sim.autoBake = on), rerender())} />
        <div className="stats">
          <Stat label="ghost subscribers" value={ghostCount} tone={ghostCount ? 'bad' : undefined} />
          <Stat label="notifications to unmounted screens" value={sim.ghostDeliveries} tone={sim.ghostDeliveries ? 'bad' : undefined} />
        </div>
      </div>
    </Section>
  )
}
