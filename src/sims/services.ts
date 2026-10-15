import { rng } from '../lib/math'

/**
 * Monolith vs microservices, as a small queueing simulation.
 *
 * Both sides get the exact same stream of requests:
 *   browse = look at the menu            (Menu)
 *   order  = place an order and pay      (Orders, which calls Payments and waits for it)
 *
 * Monolith: one process, one shared pool of workers, in-process calls (almost free).
 * Microservices: a gateway with a connection limit, three services with their own
 * workers, and a network hop for every call.
 *
 * "Payments crashes its process" takes down the process Payments runs in. In the
 * monolith that process is everything. In microservices it is only Payments, and how
 * far the damage spreads depends on whether callers use timeouts.
 */

export type SideId = 'mono' | 'micro'
export type Kind = 'browse' | 'order'
export type PoolId = 'mono' | 'gw' | 'menu' | 'orders' | 'payments'
/** Where a request can be drawn. 'door' is the monolith's entrance. */
export type Place = 'door' | 'm-menu' | 'm-orders' | 'm-payments' | 'gw' | 'menu' | 'orders' | 'payments'

export type Op =
  | { op: 'acquire'; pool: PoolId; at: Place }
  | { op: 'release'; pool: PoolId }
  | { op: 'hop'; from: Place; to: Place; dur: number }
  | { op: 'work'; at: Place; dur: number; crashes?: boolean }

export type ReqState = 'run' | 'queued' | 'hung' | 'waiting' | 'done' | 'failed'

export interface Req {
  id: number
  side: SideId
  kind: Kind
  born: number
  ops: Op[]
  pc: number
  /** Seconds spent in the current hop/work op, or waiting in a queue / for a timeout. */
  t: number
  state: ReqState
  held: PoolId[]
  /** The client stopped waiting and counted it as failed. The server may still be busy with it. */
  gaveUp: boolean
  reason?: string
  /** Where it ended, for the fade-out. */
  endedAt?: Place
  fade: number
}

export interface Pool {
  workers: number
  busy: number
  queue: Req[]
  /** Max queue length; 0 = reject immediately when all workers are busy. */
  cap: number
}

export interface Side {
  id: SideId
  pools: Partial<Record<PoolId, Pool>>
  reqs: Req[]
  /** Monolith only: seconds until the crashed process is back. */
  restarting: number
  crashes: number
}

export interface Outcome {
  t: number
  side: SideId
  kind: Kind
  ok: boolean
  latency: number
}

export interface ServicesSim {
  time: number
  rate: number
  latency: number
  bug: boolean
  timeouts: boolean
  mono: Side
  micro: Side
  outcomes: Outcome[]
  nextArrival: number
  nextId: number
  random: () => number
}

export const WORK = { menu: 0.35, orders: 0.3, payments: 0.35 }
export const IN_PROCESS = 0.12
export const RESTART = 3
export const CALL_TIMEOUT = 0.6
export const QUEUE_TIMEOUT = 2
export const CLIENT_GIVE_UP = 6
export const WINDOW = 10
export const FADE = 0.7

function makeSide(id: SideId): Side {
  const pools: Side['pools'] =
    id === 'mono'
      ? { mono: { workers: 8, busy: 0, queue: [], cap: 40 } }
      : {
          gw: { workers: 14, busy: 0, queue: [], cap: 0 },
          menu: { workers: 3, busy: 0, queue: [], cap: 40 },
          orders: { workers: 4, busy: 0, queue: [], cap: 40 },
          payments: { workers: 3, busy: 0, queue: [], cap: 40 },
        }
  return { id, pools, reqs: [], restarting: 0, crashes: 0 }
}

export function createServices(seed = 3): ServicesSim {
  return {
    time: 0,
    rate: 3,
    latency: 0.2,
    bug: false,
    timeouts: true,
    mono: makeSide('mono'),
    micro: makeSide('micro'),
    outcomes: [],
    nextArrival: 0.3,
    nextId: 1,
    random: rng(seed),
  }
}

export function script(side: SideId, kind: Kind, latency: number): Op[] {
  if (side === 'mono') {
    const enter: Op[] = [{ op: 'acquire', pool: 'mono', at: 'door' }]
    if (kind === 'browse') {
      return [
        ...enter,
        { op: 'hop', from: 'door', to: 'm-menu', dur: IN_PROCESS },
        { op: 'work', at: 'm-menu', dur: WORK.menu },
        { op: 'hop', from: 'm-menu', to: 'door', dur: IN_PROCESS },
        { op: 'release', pool: 'mono' },
      ]
    }
    return [
      ...enter,
      { op: 'hop', from: 'door', to: 'm-orders', dur: IN_PROCESS },
      { op: 'work', at: 'm-orders', dur: WORK.orders },
      { op: 'hop', from: 'm-orders', to: 'm-payments', dur: IN_PROCESS },
      { op: 'work', at: 'm-payments', dur: WORK.payments, crashes: true },
      { op: 'hop', from: 'm-payments', to: 'door', dur: IN_PROCESS },
      { op: 'release', pool: 'mono' },
    ]
  }
  const L = Math.max(0.05, latency)
  if (kind === 'browse') {
    return [
      { op: 'acquire', pool: 'gw', at: 'gw' },
      { op: 'hop', from: 'gw', to: 'menu', dur: L },
      { op: 'acquire', pool: 'menu', at: 'menu' },
      { op: 'work', at: 'menu', dur: WORK.menu },
      { op: 'release', pool: 'menu' },
      { op: 'hop', from: 'menu', to: 'gw', dur: L },
      { op: 'release', pool: 'gw' },
    ]
  }
  return [
    { op: 'acquire', pool: 'gw', at: 'gw' },
    { op: 'hop', from: 'gw', to: 'orders', dur: L },
    { op: 'acquire', pool: 'orders', at: 'orders' },
    { op: 'work', at: 'orders', dur: WORK.orders },
    // Orders keeps its worker while it waits for Payments: this is what lets failure spread.
    { op: 'hop', from: 'orders', to: 'payments', dur: L },
    { op: 'acquire', pool: 'payments', at: 'payments' },
    { op: 'work', at: 'payments', dur: WORK.payments },
    { op: 'release', pool: 'payments' },
    { op: 'hop', from: 'payments', to: 'orders', dur: L },
    { op: 'release', pool: 'orders' },
    { op: 'hop', from: 'orders', to: 'gw', dur: L },
    { op: 'release', pool: 'gw' },
  ]
}

/** Payments is unreachable on the microservices side while the bug is on (it crash-loops). */
const isDown = (sim: ServicesSim, side: Side, pool: PoolId) => side.id === 'micro' && pool === 'payments' && sim.bug

const ended = (r: Req) => r.state === 'done' || r.state === 'failed'

function record(sim: ServicesSim, r: Req, ok: boolean) {
  if (r.gaveUp) return
  sim.outcomes.push({ t: sim.time, side: r.side, kind: r.kind, ok, latency: sim.time - r.born })
}

function wake(side: Side, poolId: PoolId) {
  const pool = side.pools[poolId]!
  while (pool.busy < pool.workers && pool.queue.length) {
    const next = pool.queue.shift()!
    pool.busy++
    next.held.push(poolId)
    next.pc++
    next.t = 0
    next.state = 'run'
  }
}

function release(side: Side, r: Req, poolId: PoolId) {
  const i = r.held.indexOf(poolId)
  if (i < 0) return
  r.held.splice(i, 1)
  side.pools[poolId]!.busy--
  wake(side, poolId)
}

export function placeOf(r: Req): Place {
  if (r.endedAt) return r.endedAt
  const op = r.ops[r.pc]
  if (!op) return r.side === 'mono' ? 'door' : 'gw'
  if (op.op === 'hop') return op.to
  if (op.op === 'release') return r.side === 'mono' ? 'door' : 'gw'
  return op.at
}

function fail(sim: ServicesSim, side: Side, r: Req, reason: string) {
  r.endedAt = placeOf(r)
  for (const pool of Object.values(side.pools)) {
    const i = pool.queue.indexOf(r)
    if (i >= 0) pool.queue.splice(i, 1)
  }
  for (const pool of [...r.held]) release(side, r, pool)
  r.state = 'failed'
  r.reason = reason
  record(sim, r, false)
}

function crash(sim: ServicesSim, side: Side) {
  side.crashes++
  side.restarting = RESTART
  for (const r of side.reqs) {
    if (r.state === 'done' || r.state === 'failed') continue
    r.held = []
    r.endedAt = placeOf(r)
    r.state = 'failed'
    r.reason = 'process crashed'
    record(sim, r, false)
  }
  for (const pool of Object.values(side.pools)) {
    pool.busy = 0
    pool.queue = []
  }
}

/** Run one request forward by `dt` seconds. Acquire/release are instant; hops and work take time. */
function advance(sim: ServicesSim, side: Side, r: Req, dt: number) {
  let budget = dt
  for (let guard = 0; guard < 50; guard++) {
    if (r.state === 'queued') {
      r.t += budget
      if (sim.timeouts && r.t > QUEUE_TIMEOUT) fail(sim, side, r, 'waited too long in a queue')
      return
    }
    if (r.state === 'hung' || r.state === 'waiting') {
      const op = r.ops[r.pc] as Extract<Op, { op: 'acquire' }>
      if (!isDown(sim, side, op.pool)) {
        r.state = 'run'
        r.t = 0
        continue
      }
      r.t += budget
      if (r.state === 'waiting' && r.t >= CALL_TIMEOUT) fail(sim, side, r, 'Payments timed out')
      return
    }
    if (r.state !== 'run') return

    const op = r.ops[r.pc]
    if (!op) {
      r.state = 'done'
      r.endedAt = placeOf(r)
      record(sim, r, true)
      return
    }
    switch (op.op) {
      case 'acquire': {
        if (isDown(sim, side, op.pool)) {
          // With a timeout the caller gives up soon. Without one it waits on a dead socket forever.
          r.state = sim.timeouts ? 'waiting' : 'hung'
          r.t = 0
          return
        }
        const pool = side.pools[op.pool]!
        if (pool.busy < pool.workers) {
          pool.busy++
          r.held.push(op.pool)
          r.pc++
          continue
        }
        if (pool.queue.length >= pool.cap) {
          fail(sim, side, r, op.pool === 'gw' ? 'gateway full (503)' : `${op.pool} queue full`)
          return
        }
        pool.queue.push(r)
        r.state = 'queued'
        r.t = 0
        return
      }
      case 'release':
        release(side, r, op.pool)
        r.pc++
        continue
      case 'hop':
      case 'work': {
        if (op.op === 'work' && op.crashes && sim.bug && r.t === 0) {
          crash(sim, side)
          return
        }
        r.t += budget
        if (r.t < op.dur) return
        budget = r.t - op.dur
        r.t = 0
        r.pc++
        continue
      }
    }
  }
}

function arrive(sim: ServicesSim, side: Side, kind: Kind) {
  const r: Req = {
    id: sim.nextId++,
    side: side.id,
    kind,
    born: sim.time,
    ops: script(side.id, kind, sim.latency),
    pc: 0,
    t: 0,
    state: 'run',
    held: [],
    gaveUp: false,
    fade: 0,
  }
  side.reqs.push(r)
  if (side.restarting > 0) {
    r.state = 'failed'
    r.reason = 'process restarting'
    r.endedAt = 'door'
    record(sim, r, false)
    return
  }
  advance(sim, side, r, 0)
}

export function stepServices(sim: ServicesSim, dt: number) {
  sim.time += dt

  sim.nextArrival -= dt
  while (sim.nextArrival <= 0) {
    const kind: Kind = sim.random() < 0.5 ? 'browse' : 'order'
    arrive(sim, sim.mono, kind)
    arrive(sim, sim.micro, kind)
    // Poisson arrivals: exponential gaps with mean 1/rate.
    sim.nextArrival += -Math.log(1 - sim.random()) / sim.rate
  }

  for (const side of [sim.mono, sim.micro]) {
    side.restarting = Math.max(0, side.restarting - dt)
    for (const r of [...side.reqs]) {
      if (ended(r)) {
        r.fade += dt
        continue
      }
      advance(sim, side, r, dt)
      if (!r.gaveUp && !ended(r) && sim.time - r.born > CLIENT_GIVE_UP) {
        record(sim, r, false)
        r.gaveUp = true
      }
    }
    side.reqs = side.reqs.filter((r) => r.fade < FADE)
  }

  const cutoff = sim.time - WINDOW
  if (sim.outcomes.length && sim.outcomes[0].t < cutoff) sim.outcomes = sim.outcomes.filter((o) => o.t >= cutoff)
}

export interface Stats {
  success: number | null
  count: number
  latency: number | null
}

/** Success rate and mean latency of successful requests over the last WINDOW seconds. */
export function stats(sim: ServicesSim, side: SideId, kind: Kind): Stats {
  const mine = sim.outcomes.filter((o) => o.side === side && o.kind === kind)
  const ok = mine.filter((o) => o.ok)
  return {
    count: mine.length,
    success: mine.length ? ok.length / mine.length : null,
    latency: ok.length ? ok.reduce((s, o) => s + o.latency, 0) / ok.length : null,
  }
}

/** Workers that are held but waiting on another service (the amber pips). */
export function blocked(side: Side, pool: PoolId) {
  return side.reqs.filter((r) => r.held.includes(pool) && !r.endedAt && placeOf(r) !== pool).length
}

export function inFlight(side: Side) {
  return side.reqs.filter((r) => !ended(r)).length
}
