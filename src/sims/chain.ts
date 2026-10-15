import { decay, flash, type Highlights } from '../lib/highlight'
import { rng } from '../lib/math'

/**
 * Chain of Responsibility: a refund request goes to the first handler in a chain. Each
 * handler either approves it or passes it to the next one. The customer only knows the
 * first link, so handlers can be added, reordered or be away on a break without the
 * customer's code changing. The order of the chain decides who gets asked first.
 *
 * "The client picks the handler" replaces the chain with an if/else in the client. It
 * has to know every handler and its limit, every new handler is an edit to it, and when
 * the one it picks is away there is no fallback: the request just fails.
 */

export interface HandlerDef {
  id: string
  /** Class name in the code panel. */
  name: string
  label: string
  varName: string
  limit: number
}

export const HANDLERS: HandlerDef[] = [
  { id: 'cashier', name: 'Cashier', label: 'Cashier', varName: 'cashier', limit: 10 },
  { id: 'manager', name: 'ShiftManager', label: 'Shift manager', varName: 'manager', limit: 50 },
  { id: 'owner', name: 'Owner', label: 'Owner', varName: 'owner', limit: 200 },
]

/** The handler "+ Add" appends to the end of the chain. */
export const EXTRA: HandlerDef = { id: 'office', name: 'HeadOffice', label: 'Head office', varName: 'headOffice', limit: 1000 }

export interface Handler extends HandlerDef {
  away: boolean
  handled: number
  flash: number
}

export type Outcome = 'approved' | 'unhandled' | 'failed'

export interface Refund {
  id: number
  amount: number
  /** Chain index the refund is moving from (-1 = the customer). */
  from: number
  /** Chain index it is at or moving to. `chain.length` = fell off the end. */
  at: number
  phase: 'move' | 'check' | 'done'
  /** Seconds into the current phase. */
  t: number
  /** Duration of the current move. */
  dur: number
  outcome?: Outcome
}

export interface ChainSim {
  chain: Handler[]
  refunds: Refund[]
  auto: boolean
  spawnTimer: number
  nextId: number
  /** Break it: the client picks the handler itself. */
  direct: boolean
  clientEdits: number
  counts: Record<Outcome, number>
  /** Id of the handler class the code panel shows. */
  shown: string
  random: () => number
  hl: Highlights
}

export const HOP = 0.45
export const CHECK = 0.5
export const FADE = 1.2
/** Refunds per second while "Auto" is on. */
export const RATE = 0.6
export const AMOUNTS = [4, 6, 8, 15, 25, 35, 45, 90, 140, 180, 450]

const makeHandler = (def: HandlerDef): Handler => ({ ...def, away: false, handled: 0, flash: 0 })

export function createChain(seed = 7): ChainSim {
  return {
    chain: HANDLERS.map(makeHandler),
    refunds: [],
    auto: true,
    spawnTimer: 0.3,
    nextId: 1,
    direct: false,
    clientEdits: 0,
    counts: { approved: 0, unhandled: 0, failed: 0 },
    shown: HANDLERS[0].id,
    random: rng(seed),
    hl: new Map(),
  }
}

/** Handlers sorted by limit: the order the client's if/else checks them in. */
export const byLimit = (sim: ChainSim) => [...sim.chain].sort((a, b) => a.limit - b.limit)

/** Where the client sends a refund in direct mode: the cheapest handler allowed to approve it. */
export function directTarget(sim: ChainSim, amount: number) {
  const h = byLimit(sim).find((h) => amount <= h.limit)
  return h ? sim.chain.indexOf(h) : sim.chain.length
}

export function send(sim: ChainSim, amount: number) {
  const at = sim.direct ? directTarget(sim, amount) : 0
  sim.refunds.push({ id: sim.nextId++, amount, from: -1, at, phase: 'move', t: 0, dur: HOP * Math.max(1, at), outcome: undefined })
  flash(sim.hl, sim.direct ? L.directFn : L.send)
}

export function toggleAway(sim: ChainSim, id: string) {
  const h = sim.chain.find((h) => h.id === id)
  if (h) h.away = !h.away
}

/** Move a handler one step later (+1) or earlier (−1) in the chain. */
export function moveHandler(sim: ChainSim, id: string, dir: 1 | -1) {
  const i = sim.chain.findIndex((h) => h.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= sim.chain.length) return
  ;[sim.chain[i], sim.chain[j]] = [sim.chain[j], sim.chain[i]]
}

export const canAddHandler = (sim: ChainSim) => !sim.chain.some((h) => h.id === EXTRA.id)

export function addHandler(sim: ChainSim) {
  if (!canAddHandler(sim)) return
  sim.chain.push(makeHandler(EXTRA))
  // The chain only gets one more setNext(). The client's if/else needs a new branch.
  if (sim.direct) sim.clientEdits++
}

export function setDirect(sim: ChainSim, direct: boolean) {
  sim.direct = direct
  sim.refunds = []
  sim.counts = { approved: 0, unhandled: 0, failed: 0 }
  sim.hl.clear()
}

/** Code panel line numbers (see chainCode). */
export const L = {
  handle: 3,
  approve: 4,
  pass: 5,
  unhandled: 6,
  canHandle: 10,
  send: 14,
  directFn: 1,
  directIf: (i: number) => 2 + i,
}

export function chainCode(sim: ChainSim): string[] {
  if (sim.direct) {
    const sorted = byLimit(sim)
    return [
      '// RefundDesk.ts: the client picks who to ask',
      'function refund(r: Refund) {',
      ...sorted.map((h) => `  if (r.amount <= ${h.limit}) return ${h.varName}.approve(r)`),
      "  return 'nobody can approve it'",
      '}',
    ]
  }
  const shown = sim.chain.find((h) => h.id === sim.shown) ?? sim.chain[0]
  const [first, ...rest] = sim.chain
  return [
    'abstract class Handler {',
    '  private next?: Handler',
    '  setNext(h: Handler) { this.next = h; return h }',
    '  handle(r: Refund): string {',
    '    if (this.canHandle(r)) return this.approve(r)',
    '    if (this.next) return this.next.handle(r)',
    "    return 'nobody can approve it'",
    '  }',
    '}',
    `class ${shown.name} extends Handler {`,
    `  canHandle(r: Refund) { return this.onShift && r.amount <= ${shown.limit} }`,
    '}',
    '',
    first.varName + rest.map((h) => `.setNext(${h.varName})`).join(''),
    `${first.varName}.handle(refund)`,
  ]
}

function finish(sim: ChainSim, r: Refund, outcome: Outcome) {
  r.phase = 'done'
  r.t = 0
  r.outcome = outcome
  sim.counts[outcome]++
}

function arrive(sim: ChainSim, r: Refund) {
  r.t = 0
  if (r.at >= sim.chain.length) {
    finish(sim, r, 'unhandled')
    flash(sim.hl, sim.direct ? L.directIf(sim.chain.length) : L.unhandled)
    return
  }
  r.phase = 'check'
  const h = sim.chain[r.at]
  sim.shown = h.id
  if (sim.direct) flash(sim.hl, L.directIf(byLimit(sim).indexOf(h)))
  else flash(sim.hl, L.handle, L.canHandle)
}

function decide(sim: ChainSim, r: Refund) {
  const h = sim.chain[r.at]
  if (sim.direct) {
    if (h.away) return finish(sim, r, 'failed')
  } else if (h.away || r.amount > h.limit) {
    r.from = r.at
    r.at++
    r.phase = 'move'
    r.t = 0
    r.dur = HOP
    flash(sim.hl, L.pass)
    return
  } else flash(sim.hl, L.approve)
  h.handled++
  h.flash = 1
  finish(sim, r, 'approved')
}

export function stepChain(sim: ChainSim, dt: number) {
  decay(sim.hl, dt)
  for (const h of sim.chain) h.flash = Math.max(0, h.flash - dt * 2.5)

  if (sim.auto) {
    sim.spawnTimer -= dt
    if (sim.spawnTimer <= 0) {
      sim.spawnTimer += 1 / RATE
      send(sim, AMOUNTS[Math.floor(sim.random() * AMOUNTS.length)])
    }
  }

  for (const r of sim.refunds) {
    r.t += dt
    if (r.phase === 'move' && r.t >= r.dur) arrive(sim, r)
    else if (r.phase === 'check' && r.t >= CHECK) decide(sim, r)
  }
  sim.refunds = sim.refunds.filter((r) => r.phase !== 'done' || r.t < FADE)
}
