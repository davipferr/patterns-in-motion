import { decay, flash, type Highlights } from '../lib/highlight'
import { rng } from '../lib/math'

/**
 * Load balancer + cache: requests for menu items reach a load balancer, which spreads them
 * round-robin over the app servers its health checks say are up. Each server first looks
 * the item up in a shared cache (cache-aside) and only queries the database on a miss,
 * then keeps the answer for TTL seconds. The database has very few connections, so it is
 * what melts first when the cache is off or has just been flushed.
 *
 * "No health checks" keeps a crashed server in the rotation: every request the balancer
 * sends to it fails, one in N for N servers.
 *
 * A server's worker is held for the whole request, including the wait for the database,
 * which is how a slow database backs up the servers in front of it.
 */

export const MAX_SERVERS = 4
export const WORKERS = 3
export const DB_CONNECTIONS = 2
export const KEYS = 40
export const TTL = 10

export const HOP = 0.22
export const WORK = 0.12
export const CACHE_HOP = 0.12
export const DB_HOP = 0.16
export const DB_WORK = 0.35
export const REPLY = 0.3
/** Clients give up after this long. */
export const TIMEOUT = 3
/** How long a health check takes to notice a server went down or came back. */
export const HEALTH_DELAY = 1
export const WINDOW = 10
export const FADE = 0.5

export interface Server {
  id: number
  up: boolean
  /** What the load balancer believes. */
  inRotation: boolean
  /** Time since the server's state last disagreed with `inRotation`. */
  check: number
  busy: number
  queue: Req[]
  handled: number
}

export type Stage =
  | 'toLb'
  | 'toServer'
  | 'queued'
  | 'work'
  | 'toCache'
  | 'fromCache'
  | 'toDb'
  | 'dbQueued'
  | 'db'
  | 'fromDb'
  | 'reply'
  | 'done'

export interface Req {
  id: number
  key: number
  born: number
  stage: Stage
  t: number
  server: Server | null
  /** null until the cache was asked. */
  hit: boolean | null
  usedDb: boolean
  failed: boolean
  /** The client timed out; the servers keep working on it anyway. */
  gaveUp: boolean
  fade: number
}

export interface BalancerSim {
  time: number
  rate: number
  servers: Server[]
  reqs: Req[]
  healthChecks: boolean
  cacheOn: boolean
  /** key → expiry time. */
  cache: Map<number, number>
  db: { busy: number; queue: Req[] }
  rr: number
  spawnTimer: number
  nextId: number
  nextServerId: number
  results: { t: number; ok: boolean; latency: number }[]
  lookups: { t: number; hit: boolean }[]
  random: () => number
  hl: Highlights
}

const makeServer = (id: number): Server => ({ id, up: true, inRotation: true, check: 0, busy: 0, queue: [], handled: 0 })

export function createBalancer(seed = 3): BalancerSim {
  return {
    time: 0,
    rate: 4,
    servers: [makeServer(1), makeServer(2), makeServer(3)],
    reqs: [],
    healthChecks: true,
    cacheOn: true,
    cache: new Map(),
    db: { busy: 0, queue: [] },
    rr: 0,
    spawnTimer: 0.2,
    nextId: 1,
    nextServerId: 4,
    results: [],
    lookups: [],
    random: rng(seed),
    hl: new Map(),
  }
}

/** Code panel line numbers (see balancerCode). */
export const L = { pool: 1, route: 3, pick: 4, cacheGet: 9, hit: 10, query: 11, cacheSet: 12, reply: 13 }

export function balancerCode(sim: BalancerSim): string[] {
  return [
    '// loadBalancer.ts',
    sim.healthChecks ? 'const pool = () => servers.filter((s) => s.healthy)' : 'const pool = () => servers  // no health checks',
    'function route(req: Request) {',
    '  const list = pool()',
    '  return list[next++ % list.length].handle(req)',
    '}',
    '',
    '// server.ts (cache-aside)',
    'async getMenuItem(id: string) {',
    sim.cacheOn ? '  const hit = await cache.get(id)' : '  // no cache: every read goes to the database',
    sim.cacheOn ? '  if (hit) return hit' : '',
    '  const item = await db.query(id)',
    sim.cacheOn ? `  await cache.set(id, item, { ttl: ${TTL} })` : '',
    '  return item',
    '}',
  ]
}

// ---- Controls ----------------------------------------------------------

export function toggleServer(sim: BalancerSim, id: number) {
  const s = sim.servers.find((s) => s.id === id)
  if (!s) return
  s.up = !s.up
  s.check = 0
  if (!s.up) {
    // Everything on the crashed server is lost. Empty it first so no queued request gets promoted.
    s.busy = 0
    s.queue = []
    for (const r of sim.reqs) if (r.server === s && holdsServer(r)) fail(sim, r)
  }
}

export const canAddServer = (sim: BalancerSim) => sim.servers.length < MAX_SERVERS
export const canRemoveServer = (sim: BalancerSim) => sim.servers.length > 1

export function addServer(sim: BalancerSim) {
  if (!canAddServer(sim)) return
  // A new server joins the rotation once its first health check passes.
  sim.servers.push({ ...makeServer(sim.nextServerId++), inRotation: !sim.healthChecks })
}

export function removeServer(sim: BalancerSim) {
  if (!canRemoveServer(sim)) return
  const s = sim.servers.pop()!
  for (const r of sim.reqs) if (r.server === s) release(sim, r)
  sim.reqs = sim.reqs.filter((r) => r.server !== s)
}

export function setHealthChecks(sim: BalancerSim, on: boolean) {
  sim.healthChecks = on
  for (const s of sim.servers) {
    s.inRotation = on ? s.up : true
    s.check = 0
  }
}

export function setCache(sim: BalancerSim, on: boolean) {
  sim.cacheOn = on
  sim.cache.clear()
}

export const flushCache = (sim: BalancerSim) => sim.cache.clear()

// ---- Simulation --------------------------------------------------------

const SERVER_STAGES: Stage[] = ['queued', 'work', 'toCache', 'fromCache', 'toDb', 'dbQueued', 'db', 'fromDb']
const holdsServer = (r: Req) => SERVER_STAGES.includes(r.stage)

const durations: Partial<Record<Stage, number>> = {
  toLb: HOP,
  toServer: HOP,
  work: WORK,
  toCache: CACHE_HOP,
  fromCache: CACHE_HOP,
  toDb: DB_HOP,
  db: DB_WORK,
  fromDb: DB_HOP,
  reply: REPLY,
}

/** Give back whatever a request is holding: a server worker, a database connection, a queue spot. */
function release(sim: BalancerSim, r: Req) {
  const s = r.server
  if (s && r.stage === 'queued') s.queue = s.queue.filter((x) => x !== r)
  else if (s && holdsServer(r) && s.busy > 0) {
    s.busy--
    const next = s.queue.shift()
    if (next) {
      s.busy++
      enter(sim, next, 'work')
    }
  }
  if (r.stage === 'dbQueued') sim.db.queue = sim.db.queue.filter((x) => x !== r)
  if (r.stage === 'db') releaseDb(sim)
}

function releaseDb(sim: BalancerSim) {
  sim.db.busy--
  const next = sim.db.queue.shift()
  if (next) {
    sim.db.busy++
    enter(sim, next, 'db')
  }
}

function record(sim: BalancerSim, r: Req, ok: boolean) {
  if (!r.gaveUp) sim.results.push({ t: sim.time, ok, latency: sim.time - r.born })
}

function fail(sim: BalancerSim, r: Req) {
  release(sim, r)
  record(sim, r, false)
  r.failed = true
  r.stage = 'done'
  r.t = 0
}

function enter(sim: BalancerSim, r: Req, stage: Stage) {
  r.stage = stage
  r.t = 0
  if (stage === 'db') flash(sim.hl, L.query)
}

function arrive(sim: BalancerSim, r: Req) {
  switch (r.stage) {
    case 'toLb': {
      const pool = sim.healthChecks ? sim.servers.filter((s) => s.inRotation) : sim.servers
      flash(sim.hl, L.route, L.pick)
      if (!pool.length) return fail(sim, r)
      r.server = pool[sim.rr++ % pool.length]
      return enter(sim, r, 'toServer')
    }
    case 'toServer': {
      const s = r.server!
      if (!s.up) return fail(sim, r)
      if (s.busy < WORKERS) {
        s.busy++
        return enter(sim, r, 'work')
      }
      s.queue.push(r)
      return enter(sim, r, 'queued')
    }
    case 'work':
      return enter(sim, r, sim.cacheOn ? 'toCache' : 'toDb')
    case 'toCache': {
      const expiry = sim.cache.get(r.key)
      r.hit = expiry !== undefined && expiry > sim.time
      sim.lookups.push({ t: sim.time, hit: r.hit })
      flash(sim.hl, L.cacheGet)
      return enter(sim, r, 'fromCache')
    }
    case 'fromCache':
      if (r.hit) {
        flash(sim.hl, L.hit)
        return reply(sim, r)
      }
      return enter(sim, r, 'toDb')
    case 'toDb':
      r.usedDb = true
      if (sim.db.busy < DB_CONNECTIONS) {
        sim.db.busy++
        return enter(sim, r, 'db')
      }
      sim.db.queue.push(r)
      return enter(sim, r, 'dbQueued')
    case 'db':
      releaseDb(sim)
      return enter(sim, r, 'fromDb')
    case 'fromDb':
      if (sim.cacheOn) {
        sim.cache.set(r.key, sim.time + TTL)
        flash(sim.hl, L.cacheSet)
      }
      flash(sim.hl, L.reply)
      return reply(sim, r)
    case 'reply':
      record(sim, r, true)
      r.stage = 'done'
      r.t = 0
      return
  }
}

function reply(sim: BalancerSim, r: Req) {
  release(sim, r)
  r.server!.handled++
  enter(sim, r, 'reply')
}

/** Skewed toward a few popular items, like a real menu. */
const pickKey = (sim: BalancerSim) => Math.floor(KEYS * sim.random() ** 2.5)

export function stepBalancer(sim: BalancerSim, dt: number) {
  sim.time += dt
  decay(sim.hl, dt)

  sim.spawnTimer -= dt
  while (sim.spawnTimer <= 0) {
    // Poisson arrivals.
    sim.spawnTimer += -Math.log(1 - sim.random()) / sim.rate
    sim.reqs.push({ id: sim.nextId++, key: pickKey(sim), born: sim.time, stage: 'toLb', t: 0, server: null, hit: null, usedDb: false, failed: false, gaveUp: false, fade: 0 })
  }

  if (sim.healthChecks)
    for (const s of sim.servers) {
      if (s.up === s.inRotation) continue
      s.check += dt
      if (s.check >= HEALTH_DELAY) {
        s.inRotation = s.up
        s.check = 0
      }
    }

  for (const r of sim.reqs) {
    if (r.stage === 'done') {
      r.fade += dt
      continue
    }
    if (!r.gaveUp && sim.time - r.born > TIMEOUT) {
      r.gaveUp = true
      sim.results.push({ t: sim.time, ok: false, latency: TIMEOUT })
    }
    const dur = durations[r.stage]
    if (dur === undefined) continue
    r.t += dt
    if (r.t >= dur) arrive(sim, r)
  }
  sim.reqs = sim.reqs.filter((r) => r.stage !== 'done' || r.fade < FADE)

  const cutoff = sim.time - WINDOW
  sim.results = sim.results.filter((r) => r.t >= cutoff)
  sim.lookups = sim.lookups.filter((l) => l.t >= cutoff)
}

export function stats(sim: BalancerSim) {
  const ok = sim.results.filter((r) => r.ok)
  return {
    success: sim.results.length ? ok.length / sim.results.length : null,
    failed: sim.results.length - ok.length,
    latency: ok.length ? ok.reduce((s, r) => s + r.latency, 0) / ok.length : null,
    hitRate: sim.lookups.length ? sim.lookups.filter((l) => l.hit).length / sim.lookups.length : null,
  }
}
