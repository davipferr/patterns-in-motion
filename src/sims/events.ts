import { decay, flash, type Highlights } from '../lib/highlight'

/**
 * Event-driven: Orders publishes one "order.placed" event to a broker and answers the
 * customer right away. Every subscriber gets its own copy in its own queue and works
 * through it at its own pace. A paused subscriber just builds up a backlog.
 *
 * "Call everything directly" makes Orders call each one in turn and wait. Checkout gets
 * slower with every new subscriber, and one subscriber being down fails the checkout,
 * possibly after the earlier ones already acted on it.
 */

export const CONSUMERS = [
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'email', label: 'Email receipt' },
  { id: 'loyalty', label: 'Loyalty points' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'fraud', label: 'Fraud check' },
  { id: 'driver', label: 'Driver dispatch' },
] as const

export type ConsumerId = (typeof CONSUMERS)[number]['id']
export type Place = 'customer' | 'orders' | 'broker' | ConsumerId

export interface Consumer {
  id: ConsumerId
  label: string
  paused: boolean
  /** Events waiting in this subscriber's queue (event mode). */
  queue: number
  /** Progress through the event being handled, 0..1, or -1 when idle. */
  working: number
  handled: number
  flash: number
}

export type Leg =
  | { type: 'hop'; from: Place; to: Place; dur: number }
  | { type: 'work'; at: ConsumerId; dur: number }
  | { type: 'publish' }

export interface Checkout {
  id: number
  born: number
  legs: Leg[]
  pc: number
  t: number
  /** Sync mode: waiting on a paused subscriber. */
  waiting: boolean
  state: 'run' | 'ok' | 'failed'
  /** Subscribers that already acted on this order (sync mode). */
  acted: number
  /** A call timed out: the token is carrying the failure back to the customer. */
  doomed: boolean
  fade: number
}

export interface Copy {
  id: number
  to: ConsumerId
  t: number
}

export interface EventsSim {
  time: number
  rate: number
  sync: boolean
  consumers: Consumer[]
  checkouts: Checkout[]
  copies: Copy[]
  results: { t: number; ok: boolean; latency: number }[]
  spawnTimer: number
  nextId: number
  ordersEdits: number
  halfDone: number
  hl: Highlights
}

export const HOP = 0.3
export const FAN_OUT = 0.45
export const CALL = 0.25
export const WORK = 0.55
export const TIMEOUT = 1.2
export const WINDOW = 10

export function createEvents(): EventsSim {
  return {
    time: 0,
    rate: 0.9,
    sync: false,
    consumers: CONSUMERS.slice(0, 4).map(makeConsumer),
    checkouts: [],
    copies: [],
    results: [],
    spawnTimer: 0.3,
    nextId: 1,
    ordersEdits: 0,
    halfDone: 0,
    hl: new Map(),
  }
}

function makeConsumer({ id, label }: (typeof CONSUMERS)[number]): Consumer {
  return { id, label, paused: false, queue: 0, working: -1, handled: 0, flash: 0 }
}

export const canAddConsumer = (sim: EventsSim) => sim.consumers.length < CONSUMERS.length

export function addConsumer(sim: EventsSim) {
  const next = CONSUMERS[sim.consumers.length]
  if (!next) return
  sim.consumers.push(makeConsumer(next))
  // Publishing does not know who listens. Direct calls do: Orders must be edited.
  if (sim.sync) sim.ordersEdits++
}

export function togglePause(sim: EventsSim, id: ConsumerId) {
  const c = sim.consumers.find((c) => c.id === id)
  if (c) c.paused = !c.paused
}

export function setSync(sim: EventsSim, sync: boolean) {
  sim.sync = sync
  sim.checkouts = []
  sim.copies = []
  sim.results = []
  sim.hl.clear()
  for (const c of sim.consumers) {
    c.queue = 0
    c.working = -1
  }
}

/** Code panel line numbers (see eventsCode). */
export const L = { publish: 3, reply: 4, handler: 8, syncCall: (i: number) => 3 + i }

export function eventsCode(sim: EventsSim): string[] {
  if (sim.sync) {
    return [
      '// Orders.ts',
      'async placeOrder(order: Order) {',
      '  await this.db.save(order)',
      ...sim.consumers.map((c) => `  await ${camel(c.label)}.handle(order)`),
      '  return { ok: true }',
      '}',
    ]
  }
  return [
    '// Orders.ts',
    'async placeOrder(order: Order) {',
    '  await this.db.save(order)',
    "  broker.publish('order.placed', order)",
    '  return { ok: true }',
    '}',
    '',
    '// Kitchen.ts (and every other subscriber)',
    "broker.subscribe('order.placed', kitchen.cook)",
  ]
}

const camel = (label: string) =>
  label
    .split(' ')
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1)))
    .join('')

function legsFor(sim: EventsSim): Leg[] {
  const toOrders: Leg = { type: 'hop', from: 'customer', to: 'orders', dur: HOP }
  const reply: Leg = { type: 'hop', from: 'orders', to: 'customer', dur: HOP }
  if (!sim.sync) {
    return [toOrders, { type: 'hop', from: 'orders', to: 'broker', dur: HOP }, { type: 'publish' }, { type: 'hop', from: 'broker', to: 'orders', dur: HOP }, reply]
  }
  const calls: Leg[] = sim.consumers.flatMap((c): Leg[] => [
    { type: 'hop', from: 'orders', to: c.id, dur: CALL },
    { type: 'work', at: c.id, dur: WORK },
    { type: 'hop', from: c.id, to: 'orders', dur: CALL },
  ])
  return [toOrders, ...calls, reply]
}

function finish(sim: EventsSim, c: Checkout, ok: boolean) {
  c.state = ok ? 'ok' : 'failed'
  sim.results.push({ t: sim.time, ok, latency: sim.time - c.born })
  if (!ok && c.acted > 0) sim.halfDone++
}

function advance(sim: EventsSim, c: Checkout, dt: number) {
  let budget = dt
  for (let guard = 0; guard < 40 && c.state === 'run'; guard++) {
    const leg = c.legs[c.pc]
    if (!leg) {
      finish(sim, c, true)
      flash(sim.hl, sim.sync ? sim.consumers.length + 3 : L.reply)
      return
    }
    if (leg.type === 'publish') {
      for (const consumer of sim.consumers) sim.copies.push({ id: sim.nextId++, to: consumer.id, t: 0 })
      flash(sim.hl, L.publish)
      c.pc++
      continue
    }
    if (leg.type === 'work') {
      const consumer = sim.consumers.find((x) => x.id === leg.at)
      if (c.t === 0 && consumer) flash(sim.hl, L.syncCall(sim.consumers.indexOf(consumer)))
      if (!consumer || consumer.paused) {
        c.waiting = true
        c.t += budget
        if (c.t >= TIMEOUT) {
          // The call times out: send the failure back to the customer.
          c.waiting = false
          c.legs = [{ type: 'hop', from: leg.at, to: 'orders', dur: CALL }, { type: 'hop', from: 'orders', to: 'customer', dur: HOP }]
          c.pc = 0
          c.t = 0
          c.doomed = true
          continue
        }
        return
      }
      c.waiting = false
    }
    c.t += budget
    if (c.t < leg.dur) return
    budget = c.t - leg.dur
    c.t = 0
    if (leg.type === 'work') {
      const consumer = sim.consumers.find((x) => x.id === leg.at)!
      consumer.handled++
      consumer.flash = 1
      c.acted++
    }
    c.pc++
    if (c.pc >= c.legs.length && c.doomed) {
      finish(sim, c, false)
      return
    }
  }
}

export function stepEvents(sim: EventsSim, dt: number) {
  sim.time += dt
  decay(sim.hl, dt)

  sim.spawnTimer -= dt
  if (sim.spawnTimer <= 0) {
    sim.spawnTimer += 1 / sim.rate
    sim.checkouts.push({ id: sim.nextId++, born: sim.time, legs: legsFor(sim), pc: 0, t: 0, waiting: false, state: 'run', acted: 0, doomed: false, fade: 0 })
  }

  for (const c of sim.checkouts) {
    if (c.state === 'run') advance(sim, c, dt)
    else c.fade += dt
  }
  sim.checkouts = sim.checkouts.filter((c) => c.fade < 0.6)

  for (const copy of sim.copies) {
    copy.t += dt / FAN_OUT
    if (copy.t >= 1) {
      const consumer = sim.consumers.find((x) => x.id === copy.to)
      if (consumer) consumer.queue++
    }
  }
  sim.copies = sim.copies.filter((c) => c.t < 1)

  for (const consumer of sim.consumers) {
    consumer.flash = Math.max(0, consumer.flash - dt * 2.5)
    if (sim.sync || consumer.paused) continue
    if (consumer.working < 0 && consumer.queue > 0) {
      consumer.queue--
      consumer.working = 0
    }
    if (consumer.working >= 0) {
      consumer.working += dt / WORK
      if (consumer.working >= 1) {
        consumer.working = -1
        consumer.handled++
        consumer.flash = 1
        flash(sim.hl, L.handler)
      }
    }
  }

  const cutoff = sim.time - WINDOW
  sim.results = sim.results.filter((r) => r.t >= cutoff)
}

export function checkoutStats(sim: EventsSim) {
  const ok = sim.results.filter((r) => r.ok)
  return {
    count: sim.results.length,
    failed: sim.results.length - ok.length,
    latency: ok.length ? ok.reduce((s, r) => s + r.latency, 0) / ok.length : null,
  }
}

/** Where a checkout token is: a point between two places, with progress. */
export function checkoutPosition(c: Checkout): { from: Place; to: Place; p: number } {
  const leg = c.legs[Math.min(c.pc, c.legs.length - 1)]
  if (!leg || leg.type === 'publish') return { from: 'broker', to: 'broker', p: 1 }
  if (leg.type === 'work') return { from: leg.at, to: leg.at, p: 1 }
  if (c.state !== 'run') return { from: leg.to, to: leg.to, p: 1 }
  return { from: leg.from, to: leg.to, p: Math.min(1, c.t / leg.dur) }
}
