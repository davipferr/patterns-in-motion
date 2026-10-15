import { useRef } from 'react'
import { useSim } from '../lib/useSim'
import { clamp, easeInOut, lerpPoint, money, type Point } from '../lib/math'
import * as D from '../sims/decorator'
import { Section } from '../ui/Section'
import { CodePanel } from '../ui/CodePanel'
import { BreakIt, Button, Checkbox } from '../ui/controls'

const CENTER = { x: 215, y: 165 }
const BASE = { w: 150, h: 56 }
const BAND = 22

/** Rect of layer `i` (inner to outer), or of the base for i = -1. */
function box(i: number) {
  const w = BASE.w + 2 * BAND * (i + 1)
  const h = BASE.h + 2 * BAND * (i + 1)
  return { x: CENTER.x - w / 2, y: CENTER.y - h / 2, w, h }
}

const anchor = (i: number): Point => {
  if (i < 0) return { x: CENTER.x - BASE.w / 2 + 14, y: CENTER.y }
  const b = box(i)
  return { x: b.x + 9, y: b.y + 11 }
}

export function DecoratorSection() {
  const ref = useRef<HTMLElement>(null)
  const [sim, rerender] = useSim(D.createDecorator, D.stepDecorator, ref)
  const act = (fn: () => void) => () => (fn(), rerender())

  const all = D.stops(sim.layers.length)
  const call = sim.call
  const stop = D.currentStop(sim)
  let dot: Point | null = null
  if (call && call.step < all.length) {
    const prev = call.step > 0 ? anchor(all[call.step - 1].layer) : { x: CENTER.x - 210, y: box(sim.layers.length - 1).y + 11 }
    dot = lerpPoint(prev, anchor(all[call.step].layer), easeInOut(clamp(call.t / 0.4, 0, 1)))
  }
  const finished = call && call.step >= all.length
  const trace = call ? all.slice(0, Math.min(call.step + 1, all.length)).filter((s) => s.phase === 'out') : []
  let running = D.BASE_PRICE

  const subclasses = D.subclassNames(sim)

  return (
    <Section
      ref={ref}
      id="decorator"
      number={3}
      kind="Design pattern"
      title="Decorator"
      lead="Each topping wraps a pizza and is itself a pizza. Ask the outside for its price and the call travels to the middle and back out."
      solves="Toppings can be combined in any way. Instead of a class for every combination, each topping wraps another Pizza and adds its own bit to getPrice(). Any stack of wrappers is still a Pizza, so the rest of the code never knows they are there."
      whenNot={[
        'The order of the wrappers changes the result and nobody notices. Try ExtraLarge inside Cheese, then outside it.',
        'Deep stacks are hard to debug: the stack trace is wrappers all the way down.',
        'There are only a few fixed combinations. Plain fields on one class are simpler.',
      ]}
      aside={
        <>
          <BreakIt label="Use subclasses instead" on={sim.subclasses} onChange={(on) => ((sim.subclasses = on), rerender())}>
            No wrappers: one class for every combination of toppings. Five toppings already need {D.subclassNames({ ...sim, extraTypes: 0 }).total}{' '}
            classes, and every new topping type doubles it.
          </BreakIt>
          <CodePanel file="pizza.ts" lines={D.decoratorCode(sim)} hl={sim.hl} note={finished ? `→ ${money(call!.total!)}` : undefined} />
        </>
      }
    >
      {sim.subclasses ? (
        <div className="stage explosion">
          <div className="explosion-head">
            <strong>{subclasses.total.toLocaleString()} classes</strong>
            <span className="muted">
              {' '}
              for {D.TOPPINGS.length + sim.extraTypes} topping types (2<sup>{D.TOPPINGS.length + sim.extraTypes}</sup>), without even counting the order
            </span>
          </div>
          <div className="class-grid">
            {subclasses.names.map((name) => (
              <code key={name}>{name}</code>
            ))}
            {subclasses.total > subclasses.names.length && <span className="more">+ {(subclasses.total - subclasses.names.length).toLocaleString()} more</span>}
          </div>
        </div>
      ) : (
        <div className="stage">
          <svg viewBox="0 0 620 330" role="img" aria-label="A pizza wrapped in topping decorators">
            {[...sim.layers].reverse().map((id, ri) => {
              const i = sim.layers.length - 1 - ri
              const b = box(i)
              const t = D.topping(id)
              const active = stop && stop.layer === i
              return (
                <g key={id} className={active ? 'layer on' : 'layer'}>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={14 + i * 2} />
                  <text x={b.x + 20} y={b.y + 15} className="layer-label">
                    {t.name} <tspan className="op">{D.opText(t)}</tspan>
                  </text>
                </g>
              )
            })}
            <g className={stop && stop.layer === -1 ? 'layer base on' : 'layer base'}>
              <rect x={box(-1).x} y={box(-1).y} width={BASE.w} height={BASE.h} rx={12} />
              <text x={CENTER.x} y={CENTER.y - 2} textAnchor="middle" className="node-title small">
                Margherita
              </text>
              <text x={CENTER.x} y={CENTER.y + 16} textAnchor="middle" className="node-sub">
                {money(D.BASE_PRICE)}
              </text>
            </g>
            {dot && <circle className={stop?.phase === 'out' ? 'pulse ok' : 'pulse'} cx={dot.x} cy={dot.y} r={6} />}

            <g className="trace">
              <text x={438} y={36} className="mono-text">
                pizza.getPrice()
              </text>
              {call && !trace.length && (
                <text x={438} y={62} className="node-sub">
                  asking {stop && stop.layer >= 0 ? D.topping(sim.layers[stop.layer]).name : 'Margherita'} …
                </text>
              )}
              {trace.map((s, k) => {
                const before = running
                if (s.layer >= 0) running = D.apply(D.topping(sim.layers[s.layer]), running)
                const name = s.layer < 0 ? 'Margherita' : D.topping(sim.layers[s.layer]).name
                const text = s.layer < 0 ? `${money(D.BASE_PRICE)}` : `${money(before)} ${D.opText(D.topping(sim.layers[s.layer]))} = ${money(running)}`
                return (
                  <g key={k}>
                    <text x={438} y={62 + k * 22} className="node-sub">
                      {name}
                    </text>
                    <text x={608} y={62 + k * 22} textAnchor="end" className="mono-text small">
                      {text}
                    </text>
                  </g>
                )
              })}
              {finished && (
                <text x={608} y={62 + trace.length * 22 + 26} textAnchor="end" className="big-number">
                  {money(call!.total!)}
                </text>
              )}
            </g>
          </svg>
        </div>
      )}
      <div className="controls column">
        {sim.subclasses ? (
          <div className="row">
            <Button onClick={act(() => (sim.extraTypes = Math.min(D.MORE_TOPPINGS.length, sim.extraTypes + 1)))} disabled={sim.extraTypes >= D.MORE_TOPPINGS.length}>
              + Add a topping type{sim.extraTypes < D.MORE_TOPPINGS.length ? ` (${D.MORE_TOPPINGS[sim.extraTypes]})` : ''}
            </Button>
            <Button variant="ghost" onClick={act(() => (sim.extraTypes = 0))} disabled={!sim.extraTypes}>
              Reset
            </Button>
          </div>
        ) : (
          <>
            <div className="row chips">
              {D.TOPPINGS.map((t) => {
                const i = sim.layers.indexOf(t.id)
                const on = i >= 0
                return (
                  <span key={t.id} className={on ? 'chip on' : 'chip'}>
                    <button type="button" onClick={act(() => D.toggleLayer(sim, t.id))} aria-pressed={on}>
                      {on ? '✓ ' : '+ '}
                      {t.name} <span className="op">{D.opText(t)}</span>
                    </button>
                    {on && (
                      <>
                        <button type="button" className="chip-move" title="Move inward" aria-label={`Move ${t.name} inward`} disabled={i === 0} onClick={act(() => D.moveLayer(sim, t.id, -1))}>
                          ←
                        </button>
                        <button type="button" className="chip-move" title="Move outward" aria-label={`Move ${t.name} outward`} disabled={i === sim.layers.length - 1} onClick={act(() => D.moveLayer(sim, t.id, 1))}>
                          →
                        </button>
                      </>
                    )}
                  </span>
                )
              })}
            </div>
            <div className="row">
              <Button variant="primary" onClick={act(() => D.startCall(sim))}>
                Call getPrice()
              </Button>
              <Checkbox label="Repeat" checked={sim.autoCall} onChange={(on) => ((sim.autoCall = on), rerender())} />
              <span className="hint">← / → move a topping inward or outward. Same toppings, different order, different price.</span>
            </div>
          </>
        )}
      </div>
    </Section>
  )
}
