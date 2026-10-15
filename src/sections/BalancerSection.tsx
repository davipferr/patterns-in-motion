import { useRef } from 'react'
import { useSim } from '../lib/useSim'
import { lerpPoint, type Point } from '../lib/math'
import * as B from '../sims/balancer'
import { Section } from '../ui/Section'
import { CodePanel } from '../ui/CodePanel'
import { BreakIt, Button, Checkbox, Slider, Stat } from '../ui/controls'

const CLIENT = { x: 40, y: 165 }
const LB = { x: 128, y: 165, w: 66, h: 130 }
const SERVER = { x: 300, w: 128, h: 50 }
const CACHE = { x: 532, y: 84, w: 120, h: 72 }
const DB = { x: 532, y: 240, w: 120, h: 96 }

const serverY = (i: number, n: number) => 165 + (i - (n - 1) / 2) * Math.min(72, 290 / n)
const cacheIn: Point = { x: CACHE.x - CACHE.w / 2, y: CACHE.y }
const dbIn: Point = { x: DB.x - DB.w / 2, y: DB.y }

/** Scatter dots that share a place so you can count them. */
const jitter = (id: number, spread: number): Point => ({
  x: (((id * 37) % 11) / 10 - 0.5) * spread,
  y: (((id * 53) % 7) / 6 - 0.5) * spread * 0.4,
})

function position(sim: B.BalancerSim, r: B.Req): Point {
  const n = sim.servers.length
  const i = r.server ? sim.servers.indexOf(r.server) : -1
  const y = i >= 0 ? serverY(i, n) : LB.y
  const left = i >= 0 ? { x: SERVER.x - SERVER.w / 2, y } : LB
  const right = i >= 0 ? { x: SERVER.x + SERVER.w / 2, y } : LB
  const p = (dur: number) => Math.min(1, r.t / dur)
  switch (r.stage) {
    case 'toLb':
      return lerpPoint(CLIENT, LB, p(B.HOP))
    case 'toServer':
      return lerpPoint(LB, left, p(B.HOP))
    case 'queued': {
      const k = r.server!.queue.indexOf(r)
      return { x: left.x - 8 - (k % 4) * 9, y: y - 6 + Math.floor(k / 4) * 9 }
    }
    case 'work':
      return { x: SERVER.x + 38 + jitter(r.id, 24).x, y: y + jitter(r.id, 24).y }
    case 'toCache':
      return lerpPoint(right, cacheIn, p(B.CACHE_HOP))
    case 'fromCache':
      return lerpPoint(cacheIn, right, p(B.CACHE_HOP))
    case 'toDb':
      return lerpPoint(right, dbIn, p(B.DB_HOP))
    case 'fromDb':
      return lerpPoint(dbIn, right, p(B.DB_HOP))
    case 'dbQueued': {
      const k = sim.db.queue.indexOf(r)
      return { x: DB.x - DB.w / 2 + 14 + (k % 10) * 9, y: DB.y + 18 + Math.floor(k / 10) * 9 }
    }
    case 'db':
      return { x: DB.x + 30 + jitter(r.id, 20).x, y: DB.y - 14 }
    case 'reply':
      return lerpPoint(left, CLIENT, p(B.REPLY))
    case 'done':
      return r.failed ? (i >= 0 ? { x: SERVER.x + 38 + jitter(r.id, 24).x, y } : { x: LB.x + jitter(r.id, 20).x, y: LB.y + 40 }) : CLIENT
  }
}

function Dots({ sim }: { sim: B.BalancerSim }) {
  return (
    <>
      {sim.reqs.map((r) => {
        const p = position(sim, r)
        const cls = ['lb-req', r.failed ? 'failed' : r.hit ? 'hit' : r.usedDb ? 'miss' : '', r.gaveUp ? 'gave-up' : '']
        return (
          <g key={r.id} className={cls.filter(Boolean).join(' ')} style={{ opacity: r.fade ? 1 - r.fade / B.FADE : 1 }}>
            {r.failed ? <path d={`M ${p.x - 4} ${p.y - 4} l 8 8 m 0 -8 l -8 8`} /> : <circle cx={p.x} cy={p.y} r={4.5} />}
          </g>
        )
      })}
    </>
  )
}

function Pips({ x, y, total, busy }: { x: number; y: number; total: number; busy: number }) {
  return (
    <g className="pips">
      {Array.from({ length: total }, (_, i) => (
        <rect key={i} className={i < busy ? 'busy' : undefined} x={x + i * 10} y={y} width={8} height={8} rx={1.5} />
      ))}
    </g>
  )
}

export function BalancerSection() {
  const ref = useRef<HTMLElement>(null)
  const [sim, rerender] = useSim(() => B.createBalancer(), B.stepBalancer, ref)
  const act = (fn: () => void) => () => (fn(), rerender())
  const n = sim.servers.length
  const s = B.stats(sim)
  const pct = s.success === null ? null : Math.round(s.success * 100)
  const cached = [...sim.cache.values()].filter((expiry) => expiry > sim.time).length
  const dbBacklog = sim.db.queue.length
  const deadInRotation = sim.servers.some((x) => !x.up && (x.inRotation || !sim.healthChecks))

  return (
    <Section
      ref={ref}
      id="balancer"
      number={8}
      kind="Architecture"
      title="Load balancer + cache"
      lead="Menu requests are spread over several identical servers, and a shared cache answers the popular ones before they ever reach the database."
      solves="One server can only do so much, and it's a single point of failure. A load balancer spreads traffic over many identical servers and stops sending to any that fail their health check. The database is usually the real bottleneck, so a cache in front of it answers repeated reads from memory and the database only sees the misses."
      whenNot={[
        'Your traffic fits on one server. Two servers and a balancer mean two of everything to deploy, and no state kept in server memory.',
        'The data changes constantly or must always be fresh. A cached menu price can be up to TTL seconds old. Flush the cache and watch the database get stampeded.',
        'You cache to hide a slow query you could fix. The first visitor after every expiry still pays for it.',
      ]}
      aside={
        <>
          <BreakIt label="No health checks" on={!sim.healthChecks} onChange={(on) => (B.setHealthChecks(sim, !on), rerender())}>
            The balancer keeps every server in the rotation, dead or alive. Crash one: every request it is given fails, one in{' '}
            {n} with {n} servers, while the healthy servers sit there with spare workers.
          </BreakIt>
          <CodePanel file="menu-api.ts" lines={B.balancerCode(sim)} hl={sim.hl} bad={sim.healthChecks ? [] : [B.L.pool]} />
          <div className="legend">
            <span>
              <span className="legend-dot lb-new" /> request
            </span>
            <span>
              <span className="legend-dot lb-hit" /> served from cache
            </span>
            <span>
              <span className="legend-dot lb-miss" /> went to the database
            </span>
            <span>
              <span className="legend-x" /> failed
            </span>
            <span>
              <span className="legend-pip busy" /> busy worker / connection
            </span>
          </div>
        </>
      }
    >
      <div className="stage">
        <svg viewBox="0 0 620 330" role="img" aria-label="A load balancer in front of servers that share a cache and a database">
          <line className="wire" x1={CLIENT.x} y1={CLIENT.y} x2={LB.x} y2={LB.y} />
          {sim.servers.map((srv, i) => {
            const y = serverY(i, n)
            const cls = !srv.up && (srv.inRotation || !sim.healthChecks) ? 'wire bad' : srv.inRotation || !sim.healthChecks ? 'wire' : 'wire faint'
            return (
              <g key={srv.id}>
                <line className={cls} x1={LB.x + LB.w / 2} y1={LB.y} x2={SERVER.x - SERVER.w / 2} y2={y} />
                {sim.cacheOn && <line className="wire faint" x1={SERVER.x + SERVER.w / 2} y1={y} x2={cacheIn.x} y2={cacheIn.y} />}
                <line className="wire faint" x1={SERVER.x + SERVER.w / 2} y1={y} x2={dbIn.x} y2={dbIn.y} />
              </g>
            )
          })}

          <g className="node">
            <circle cx={CLIENT.x} cy={CLIENT.y} r={24} />
            <text x={CLIENT.x} y={CLIENT.y + 7} textAnchor="middle" className="emoji">
              🧑
            </text>
            <text x={CLIENT.x} y={CLIENT.y + 42} textAnchor="middle" className="node-sub">
              customers
            </text>
          </g>

          <g className="node broker">
            <rect x={LB.x - LB.w / 2} y={LB.y - LB.h / 2} width={LB.w} height={LB.h} rx={10} />
            <text x={LB.x} y={LB.y - 14} textAnchor="middle" className="node-title tiny">
              Load
            </text>
            <text x={LB.x} y={LB.y + 2} textAnchor="middle" className="node-title tiny">
              balancer
            </text>
            <text x={LB.x} y={LB.y + 22} textAnchor="middle" className="node-sub">
              round robin
            </text>
          </g>

          {sim.servers.map((srv, i) => {
            const y = serverY(i, n)
            const x = SERVER.x - SERVER.w / 2
            const cls = ['node', 'service', 'clickable', srv.up ? '' : 'down'].filter(Boolean).join(' ')
            const status = !srv.up
              ? srv.inRotation || !sim.healthChecks
                ? 'crashed · still sent traffic'
                : 'crashed · out of rotation'
              : !srv.inRotation && sim.healthChecks
                ? 'health check…'
                : `queue ${srv.queue.length}`
            return (
              <g
                key={srv.id}
                className={cls}
                onClick={act(() => B.toggleServer(sim, srv.id))}
                role="button"
                tabIndex={0}
                aria-pressed={!srv.up}
                aria-label={`${srv.up ? 'Crash' : 'Restart'} server ${srv.id}`}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (B.toggleServer(sim, srv.id), rerender())}
              >
                <rect x={x} y={y - SERVER.h / 2} width={SERVER.w} height={SERVER.h} rx={10} />
                <text x={x + 12} y={y - 6} className="node-title tiny">
                  Server {srv.id}
                </text>
                {srv.up && <Pips x={x + 74} y={y - 15} total={B.WORKERS} busy={srv.busy} />}
                <text x={x + 12} y={y + 13} className={srv.up ? 'node-sub' : 'node-sub down-text'}>
                  {status}
                </text>
              </g>
            )
          })}

          <g className={sim.cacheOn ? 'node broker' : 'node skipped'}>
            <rect x={CACHE.x - CACHE.w / 2} y={CACHE.y - CACHE.h / 2} width={CACHE.w} height={CACHE.h} rx={10} />
            <text x={CACHE.x} y={CACHE.y - 12} textAnchor="middle" className="node-title small">
              Cache
            </text>
            <text x={CACHE.x} y={CACHE.y + 6} textAnchor="middle" className="node-sub">
              {sim.cacheOn ? `${cached} of ${B.KEYS} items` : 'off'}
            </text>
            {sim.cacheOn && (
              <text x={CACHE.x} y={CACHE.y + 22} textAnchor="middle" className="node-sub">
                ttl {B.TTL}s
              </text>
            )}
          </g>

          <g className={dbBacklog >= 4 ? 'node paused' : 'node'}>
            <rect x={DB.x - DB.w / 2} y={DB.y - DB.h / 2} width={DB.w} height={DB.h} rx={10} />
            <text x={DB.x - DB.w / 2 + 12} y={DB.y - 24} className="node-title small">
              Database
            </text>
            <Pips x={DB.x + 20} y={DB.y - 18} total={B.DB_CONNECTIONS} busy={sim.db.busy} />
            <text x={DB.x - DB.w / 2 + 12} y={DB.y + 4} className={dbBacklog >= 4 ? 'node-sub bad-text' : 'node-sub'}>
              {dbBacklog ? `${dbBacklog} queries waiting` : `${B.DB_CONNECTIONS} connections`}
            </text>
          </g>

          <Dots sim={sim} />
        </svg>
      </div>
      <div className="controls column">
        <div className="row">
          <Button onClick={act(() => B.addServer(sim))} disabled={!B.canAddServer(sim)}>
            + Server
          </Button>
          <Button onClick={act(() => B.removeServer(sim))} disabled={!B.canRemoveServer(sim)}>
            − Server
          </Button>
          <Checkbox label="Cache" checked={sim.cacheOn} onChange={(on) => (B.setCache(sim, on), rerender())} />
          <Button onClick={act(() => B.flushCache(sim))} disabled={!sim.cacheOn}>
            Flush cache
          </Button>
          <Slider label="Traffic" value={sim.rate} min={1} max={12} step={0.5} format={(v) => `${v} req/s`} onChange={(v) => ((sim.rate = v), rerender())} />
          <span className="hint">Click a server to crash it. The simulation runs in slow motion.</span>
        </div>
        <div className="stats">
          <Stat label={`success (last ${B.WINDOW}s)`} value={pct === null ? '—' : `${pct}%`} tone={pct === null ? undefined : pct >= 95 ? 'ok' : pct >= 60 ? 'warn' : 'bad'} />
          <Stat label="avg response" value={s.latency === null ? '—' : `${s.latency.toFixed(2)}s`} tone={s.latency === null ? undefined : s.latency > 2.2 ? 'bad' : 'ok'} />
          <Stat label="cache hit rate" value={!sim.cacheOn || s.hitRate === null ? '—' : `${Math.round(s.hitRate * 100)}%`} />
          <Stat label="database queue" value={dbBacklog} tone={dbBacklog >= 4 ? 'bad' : undefined} />
          <Stat label="failed" value={s.failed} tone={s.failed ? 'bad' : 'ok'} />
        </div>
        {deadInRotation && <span className="hint bad-hint">A crashed server is still in the rotation.</span>}
      </div>
    </Section>
  )
}
