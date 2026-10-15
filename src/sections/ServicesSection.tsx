import { useRef } from 'react'
import { useSim } from '../lib/useSim'
import { lerpPoint, type Point } from '../lib/math'
import * as V from '../sims/services'
import { Section } from '../ui/Section'
import { CodePanel } from '../ui/CodePanel'
import { BreakIt, Button, Slider } from '../ui/controls'

const PLACES: Record<V.Place, Point> = {
  door: { x: 54, y: 146 },
  'm-menu': { x: 196, y: 92 },
  'm-orders': { x: 196, y: 150 },
  'm-payments': { x: 196, y: 208 },
  gw: { x: 52, y: 146 },
  menu: { x: 214, y: 58 },
  orders: { x: 214, y: 146 },
  payments: { x: 214, y: 234 },
}

const MODULE = { w: 140, h: 42 }
const SERVICE = { w: 124, h: 50 }

/** Scatter dots that share a place so you can count them. */
const jitter = (id: number, spread: number): Point => ({
  x: (((id * 37) % 11) / 10 - 0.5) * spread,
  y: (((id * 53) % 7) / 6 - 0.5) * spread * 0.45,
})

function position(side: V.Side, r: V.Req): Point {
  const op = r.ops[r.pc]
  if (r.state === 'queued' && op?.op === 'acquire') {
    const queue = side.pools[op.pool]!.queue
    const i = queue.indexOf(r)
    const p = PLACES[op.at]
    if (op.pool === 'mono' || op.pool === 'gw') return { x: p.x - 4 - (i % 3) * 9, y: p.y + 34 + Math.floor(i / 3) * 9 }
    return { x: p.x - SERVICE.w / 2 - 2 - (i % 5) * 9, y: p.y - 8 + Math.floor(i / 5) * 9 }
  }
  if (op?.op === 'hop' && r.state === 'run') return lerpPoint(PLACES[op.from], PLACES[op.to], Math.min(1, r.t / op.dur))
  const place = V.placeOf(r)
  const p = PLACES[place]
  if (place === 'door' || place === 'gw') {
    const j = jitter(r.id, 20)
    return { x: p.x + j.x, y: p.y + j.y }
  }
  // Inside a box: dots gather on the right, clear of the label.
  const j = jitter(r.id, 34)
  return { x: p.x + (place.startsWith('m-') ? 42 : 50) + j.x, y: p.y + j.y }
}

function Dots({ side }: { side: V.Side }) {
  return (
    <>
      {side.reqs.map((r) => {
        const p = position(side, r)
        const failed = r.state === 'failed'
        const cls = ['req', r.kind, failed ? 'failed' : '', r.gaveUp ? 'gave-up' : '', r.state === 'hung' || r.state === 'waiting' ? 'stuck' : '']
        return (
          <g key={r.id} className={cls.filter(Boolean).join(' ')} style={{ opacity: r.fade ? 1 - r.fade / V.FADE : 1 }}>
            {failed ? (
              <path d={`M ${p.x - 4} ${p.y - 4} l 8 8 m 0 -8 l -8 8`} />
            ) : (
              <circle cx={p.x} cy={p.y} r={4.5} />
            )}
          </g>
        )
      })}
    </>
  )
}

function Pips({ x, y, pool, blocked = 0, cols }: { x: number; y: number; pool: V.Pool; blocked?: number; cols: number }) {
  return (
    <g className="pips">
      {Array.from({ length: pool.workers }, (_, i) => {
        const state = i < pool.busy - blocked ? 'busy' : i < pool.busy ? 'blocked' : ''
        return <rect key={i} className={state} x={x + (i % cols) * 9} y={y + Math.floor(i / cols) * 9} width={7} height={7} rx={1.5} />
      })}
    </g>
  )
}

function Metrics({ sim, side }: { sim: V.ServicesSim; side: V.SideId }) {
  const rows = [
    { kind: 'browse' as const, label: 'Browse menu' },
    { kind: 'order' as const, label: 'Place order' },
  ]
  return (
    <table className="metrics">
      <tbody>
        {rows.map(({ kind, label }) => {
          const s = V.stats(sim, side, kind)
          const pct = s.success === null ? null : Math.round(s.success * 100)
          const tone = pct === null ? '' : pct >= 95 ? 'ok' : pct >= 60 ? 'warn' : 'bad'
          return (
            <tr key={kind}>
              <th>
                <span className={`legend-dot ${kind}`} /> {label}
              </th>
              <td className="bar-cell">
                <span className={`bar ${tone}`}>
                  <span style={{ width: `${pct ?? 0}%` }} />
                </span>
              </td>
              <td className={`num ${tone}`}>{pct === null ? '—' : `${pct}%`}</td>
              <td className="num muted">{s.latency === null ? '—' : `${s.latency.toFixed(2)}s`}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

const CODE_TIMEOUTS = [
  '// Orders service',
  'async placeOrder(order: Order) {',
  '  const paid = await fetch(PAYMENTS_URL, {',
  '    method: "POST",',
  '    body: JSON.stringify(order),',
  '    signal: AbortSignal.timeout(600),  // 0.6s max',
  '  })',
  '  …',
  '}',
]

export function ServicesSection() {
  const ref = useRef<HTMLElement>(null)
  const [sim, rerender] = useSim(() => V.createServices(), V.stepServices, ref)
  const { mono, micro } = sim
  const monoPool = mono.pools.mono!
  const restarting = mono.restarting > 0

  const code = [...CODE_TIMEOUTS]
  if (!sim.timeouts) code[5] = '    // no timeout: wait forever'

  return (
    <Section
      ref={ref}
      id="microservices"
      number={6}
      kind="Architecture"
      title="Monolith vs Microservices"
      lead="The same customers hit both systems at the same moment. Then Payments starts crashing."
      solves="Microservices split the system into separately deployed services. A crash in one service stays in its own process, so the rest can keep working. A monolith keeps everything in one process: it's simpler and faster, but when that process dies, every feature dies with it."
      whenNot={[
        'A small team or a young product. You pay for network hops, separate deploys, and monitoring for every service.',
        'You will not add timeouts, retries and circuit breakers. Without them you get a distributed monolith: one failure still takes everything down.',
        'Look at the latency numbers: when nothing is broken, the monolith is faster. In-process calls are almost free.',
      ]}
      aside={
        <>
          <BreakIt label="Remove the timeouts" on={!sim.timeouts} onChange={(on) => ((sim.timeouts = !on), rerender())}>
            Orders now waits forever for Payments. Its workers fill up (amber), then the gateway's connections, and then menu
            browsing fails too, even though the Menu service is healthy. Turn on <em>Payments crashes</em> to trigger it.
          </BreakIt>
          <CodePanel file="orders/placeOrder.ts" lines={code} hl={new Map()} bad={sim.timeouts ? [] : [5]} />
          <div className="legend">
            <span>
              <span className="legend-dot browse" /> browse menu
            </span>
            <span>
              <span className="legend-dot order" /> place order
            </span>
            <span>
              <span className="legend-x" /> failed
            </span>
            <span>
              <span className="legend-pip busy" /> busy worker
            </span>
            <span>
              <span className="legend-pip blocked" /> worker stuck waiting
            </span>
          </div>
        </>
      }
    >
      <div className="duo">
        <div className="stage">
          <div className="stage-title">
            <strong>Monolith</strong>
            <span className="muted">one process, 8 workers</span>
          </div>
          <svg viewBox="0 0 300 260" role="img" aria-label="Monolith simulation">
            <g className={restarting ? 'node process down' : 'node process'}>
              <rect x={36} y={52} width={250} height={196} rx={14} />
              <Pips x={56} y={62} pool={monoPool} cols={8} />
            </g>
            {(['m-menu', 'm-orders', 'm-payments'] as const).map((place) => {
              const p = PLACES[place]
              const name = place.slice(2)
              const bug = name === 'payments' && sim.bug
              return (
                <g key={place} className={bug ? 'node module bug' : 'node module'}>
                  <rect x={p.x - MODULE.w / 2} y={p.y - MODULE.h / 2} width={MODULE.w} height={MODULE.h} rx={8} />
                  <text x={p.x - MODULE.w / 2 + 12} y={p.y + 4} className="node-title tiny">
                    {name[0].toUpperCase() + name.slice(1)} module
                  </text>
                </g>
              )
            })}
            {restarting && (
              <g className="restart">
                <rect x={78} y={118} width={166} height={60} rx={10} />
                <text x={161} y={144} textAnchor="middle" className="node-title small">
                  💥 Process crashed
                </text>
                <text x={161} y={164} textAnchor="middle">
                  restarting… {mono.restarting.toFixed(1)}s
                </text>
              </g>
            )}
            <text x={36} y={30} className="node-sub">
              crashes: {mono.crashes}
            </text>
            <Dots side={mono} />
          </svg>
          <Metrics sim={sim} side="mono" />
        </div>

        <div className="stage">
          <div className="stage-title">
            <strong>Microservices</strong>
            <span className="muted">gateway + 3 services</span>
          </div>
          <svg viewBox="0 0 300 260" role="img" aria-label="Microservices simulation">
            {(['menu', 'orders'] as const).map((s) => (
              <line key={s} className="wire" x1={PLACES.gw.x} y1={PLACES.gw.y} x2={PLACES[s].x} y2={PLACES[s].y} />
            ))}
            <line className="wire" x1={PLACES.orders.x} y1={PLACES.orders.y} x2={PLACES.payments.x} y2={PLACES.payments.y} />
            <g className="node">
              <rect x={PLACES.gw.x - 26} y={PLACES.gw.y - 52} width={52} height={104} rx={10} />
              <text x={PLACES.gw.x} y={PLACES.gw.y - 36} textAnchor="middle" className="node-title tiny">
                Gateway
              </text>
              <Pips x={PLACES.gw.x - 16} y={PLACES.gw.y - 26} pool={micro.pools.gw!} cols={4} />
            </g>
            {(['menu', 'orders', 'payments'] as const).map((s) => {
              const p = PLACES[s]
              const down = s === 'payments' && sim.bug
              const pool = micro.pools[s]!
              return (
                <g key={s} className={down ? 'node service down' : 'node service'}>
                  <rect x={p.x - SERVICE.w / 2 + 14} y={p.y - SERVICE.h / 2} width={SERVICE.w} height={SERVICE.h} rx={10} />
                  <text x={p.x - SERVICE.w / 2 + 26} y={p.y - 6} className="node-title tiny">
                    {s[0].toUpperCase() + s.slice(1)}
                  </text>
                  {down ? (
                    <text x={p.x - SERVICE.w / 2 + 26} y={p.y + 12} className="node-sub down-text">
                      crash-looping
                    </text>
                  ) : (
                    <Pips x={p.x - SERVICE.w / 2 + 26} y={p.y + 4} pool={pool} blocked={s === 'orders' ? V.blocked(micro, 'orders') : 0} cols={4} />
                  )}
                </g>
              )
            })}
            <Dots side={micro} />
          </svg>
          <Metrics sim={sim} side="micro" />
        </div>
      </div>
      <div className="controls">
        <Button variant="danger" pressed={sim.bug} onClick={() => ((sim.bug = !sim.bug), rerender())}>
          {sim.bug ? '✓ Payments crashes its process' : '💥 Payments crashes its process'}
        </Button>
        <Slider label="Traffic" value={sim.rate} min={0.5} max={7} step={0.5} format={(v) => `${v} req/s`} onChange={(v) => ((sim.rate = v), rerender())} />
        <Slider label="Network hop (microservices)" value={sim.latency} min={0.05} max={0.6} step={0.05} format={(v) => `${Math.round(v * 1000)} ms`} onChange={(v) => ((sim.latency = v), rerender())} />
        <span className="hint">Success rate and average time over the last {V.WINDOW}s. The simulation runs in slow motion.</span>
      </div>
    </Section>
  )
}
