import { useRef } from 'react'
import { useSim } from '../lib/useSim'
import { clamp, easeInOut, lerpPoint, type Point } from '../lib/math'
import * as Y from '../sims/layered'
import { Section, wrap } from '../ui/Section'
import { CodePanel } from '../ui/CodePanel'
import { BreakIt, Button, Stat } from '../ui/controls'

const BOX = { x: 60, w: 250, h: 50 }
const GAP = 66
const LANE_X = BOX.x + BOX.w / 2
const BYPASS_X = 28
const top = (i: number) => 14 + i * GAP
const mid = (i: number): Point => ({ x: LANE_X, y: top(i) + BOX.h / 2 })

/** A point along the move from layer a to layer b. Skipping layers detours around them on the left. */
function along(a: number, b: number, t: number): Point {
  if (Math.abs(a - b) <= 1) return lerpPoint(mid(a), mid(b), t)
  const pts = [mid(a), { x: BYPASS_X, y: mid(a).y }, { x: BYPASS_X, y: mid(b).y }, mid(b)]
  const lens = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y))
  let d = t * lens.reduce((s, l) => s + l, 0)
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i]) return lerpPoint(pts[i], pts[i + 1], d / lens[i])
    d -= lens[i]
  }
  return pts[3]
}

export function LayeredSection() {
  const ref = useRef<HTMLElement>(null)
  const [sim, rerender] = useSim(Y.createLayered, Y.stepLayered, ref)
  const trip = sim.trip

  let dot: Point | null = null
  let at = -1
  let note: string | null = null
  if (trip) {
    const step = trip.steps[trip.index]
    at = Y.layerIndex(step.at)
    if (trip.phase === 'move') {
      const from = Y.layerIndex(trip.steps[trip.index - 1].at)
      dot = along(from, at, easeInOut(clamp(trip.t, 0, 1)))
    } else {
      dot = mid(at)
      note = step.note
    }
  }
  const changed = sim.change ? Y.CHANGES[sim.change][sim.shortcut ? 'shortcut' : 'layered'] : []
  const skipped: Y.LayerId[] = sim.shortcut ? ['service', 'repo'] : []

  return (
    <Section
      ref={ref}
      id="layered"
      number={5}
      kind="Architecture"
      title="Layered (MVC-style)"
      lead="A request goes down through the layers to the database and comes back up. Each layer only talks to the one below it."
      solves="Each layer has one job. HTTP details stay in the controller, business rules in the service, SQL in the repository. Swap the database and only the repository changes. Add a rule and only the service changes. Click the change buttons to see it."
      whenNot={[
        'A small CRUD app where every layer just passes data through. That is ceremony, not structure.',
        'You end up writing service methods that only call the repository and add nothing.',
        'Hot paths where every extra hop and mapping step costs real time.',
      ]}
      aside={
        <>
          <BreakIt label="Put SQL in the controller" on={sim.shortcut} onChange={(on) => (Y.setShortcut(sim, on), rerender())}>
            The controller talks to the database directly. It's quicker to write, but it skips the Service, which is where the
            approval rule lives. Send the $150 order and see what gets saved.
          </BreakIt>
          <CodePanel file={sim.shortcut ? 'OrderController.ts' : 'Controller → Service → Repository'} lines={Y.layeredCode(sim.shortcut)} hl={sim.hl} bad={sim.shortcut ? [2] : []} />
        </>
      }
    >
      <div className="stage">
        <svg viewBox="0 0 600 340" role="img" aria-label="A request travelling through architecture layers">
          {!sim.shortcut && <line className="wire" x1={LANE_X} y1={mid(0).y} x2={LANE_X} y2={mid(4).y} />}
          {sim.shortcut && (
            <>
              <line className="wire" x1={LANE_X} y1={mid(0).y} x2={LANE_X} y2={mid(1).y} />
              <path className="wire bad" d={`M ${LANE_X} ${mid(1).y} H ${BYPASS_X} V ${mid(4).y} H ${LANE_X}`} />
            </>
          )}
          {Y.LAYERS.map((layer, i) => {
            const cls = ['node', 'layer-box', at === i ? 'on' : '', skipped.includes(layer.id) ? 'skipped' : '', changed.includes(layer.id) ? 'changed' : '']
            return (
              <g key={layer.id} className={cls.filter(Boolean).join(' ')}>
                <rect x={BOX.x} y={top(i)} width={BOX.w} height={BOX.h} rx={10} />
                <text x={BOX.x + 14} y={top(i) + 21} className="node-title small">
                  {layer.name}
                </text>
                <text x={BOX.x + 14} y={top(i) + 38} className="node-sub">
                  {layer.job}
                </text>
                {changed.includes(layer.id) && (
                  <g className="badge">
                    <rect x={BOX.x + BOX.w - 54} y={top(i) + 14} width={44} height={22} rx={11} />
                    <text x={BOX.x + BOX.w - 32} y={top(i) + 29} textAnchor="middle">
                      edit
                    </text>
                  </g>
                )}
              </g>
            )
          })}
          {note && (
            <g className={`callout ${trip?.status ?? ''}`}>
              <path d={`M ${BOX.x + BOX.w + 6} ${mid(at).y} l 12 -7 v 14 z`} />
              {wrap(note, 30).map((line, k, lines) => (
                <text key={k} x={BOX.x + BOX.w + 26} y={mid(at).y + 5 + (k - (lines.length - 1) / 2) * 17}>
                  {line}
                </text>
              ))}
            </g>
          )}
          {dot && <circle className={`pulse ${trip?.status === 'bypassed' ? 'bad' : trip?.status === 'rejected' ? 'warn' : trip?.status === 'ok' ? 'ok' : ''}`} cx={dot.x} cy={dot.y} r={7} />}
        </svg>
      </div>
      <div className="controls column">
        <div className="row">
          {Y.REQUESTS.map((r) => (
            <Button key={r.id} variant="primary" onClick={() => (Y.send(sim, r.id), rerender())}>
              Send <span className="mono">{r.label}</span>
            </Button>
          ))}
          <div className="stats">
            <Stat label="orders saved without approval" value={sim.bypassed} tone={sim.bypassed ? 'bad' : 'ok'} />
          </div>
        </div>
        <div className="row">
          <span className="hint">What has to change if…</span>
          {(Object.keys(Y.CHANGES) as Y.ChangeId[]).map((id) => (
            <Button key={id} variant="ghost" pressed={sim.change === id} onClick={() => (Y.showChange(sim, id), rerender())}>
              {Y.CHANGES[id].label}
            </Button>
          ))}
          {sim.change && (
            <span className={changed.length > 1 ? 'pill bad' : 'pill ok'}>
              {changed.length} layer{changed.length > 1 ? 's' : ''} to edit
            </span>
          )}
        </div>
      </div>
    </Section>
  )
}
