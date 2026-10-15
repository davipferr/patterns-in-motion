import { decay, flash, type Highlights } from '../lib/highlight'

/**
 * Layered architecture: a request travels Browser → Controller → Service → Repository →
 * Database and back. Each layer only talks to the one below it.
 * The shortcut ("SQL in the controller") skips Service and Repository, so it also skips
 * the business rule that lives in Service, and couples the controller to the database.
 */

export const LAYERS = [
  { id: 'browser', name: 'Browser', job: 'Sends HTTP, shows the result' },
  { id: 'controller', name: 'Controller', job: 'HTTP in and out, no rules' },
  { id: 'service', name: 'Service', job: 'Business rules live here' },
  { id: 'repo', name: 'Repository', job: 'The only code that knows SQL' },
  { id: 'db', name: 'Database', job: 'Stores rows' },
] as const

export type LayerId = (typeof LAYERS)[number]['id']
export const layerIndex = (id: LayerId) => LAYERS.findIndex((l) => l.id === id)

export interface RequestKind {
  id: 'post' | 'big'
  label: string
  total?: number
}

export const REQUESTS: RequestKind[] = [
  { id: 'post', label: 'POST /orders  $30' },
  { id: 'big', label: 'POST /orders  $150', total: 150 },
]

export interface Step {
  at: LayerId
  note: string
  lines: number[]
  /** Outcome shown on the response dot from here on. */
  status?: 'ok' | 'rejected' | 'bypassed'
}

/** Code panel line numbers (see layeredCode). */
const C = { ctrlCall: 2, ctrlReturn: 3, svcRule: 7, svcSave: 8, repoQuery: 12 }
const S = { ctrlQuery: 2, ctrlReturn: 3 }

export function route(kind: RequestKind['id'], shortcut: boolean): Step[] {
  const sql = 'INSERT INTO orders …'
  if (shortcut) {
    return [
      { at: 'browser', note: 'Submits an order', lines: [] },
      { at: 'controller', note: `Runs SQL itself: ${sql}`, lines: [S.ctrlQuery] },
      {
        at: 'db',
        note: kind === 'big' ? 'Saved a $150 order. Nobody checked the approval rule!' : 'Row inserted',
        lines: [],
        status: kind === 'big' ? 'bypassed' : 'ok',
      },
      { at: 'controller', note: 'Turns the row into JSON', lines: [S.ctrlReturn] },
      { at: 'browser', note: kind === 'big' ? '201 Created (it should not have been)' : '201 Created', lines: [] },
    ]
  }
  const head: Step[] = [
    { at: 'browser', note: 'Submits an order', lines: [] },
    { at: 'controller', note: 'Reads the HTTP request, calls the service', lines: [C.ctrlCall] },
  ]
  if (kind === 'big') {
    return [
      ...head,
      { at: 'service', note: 'Rule: orders over $100 need a manager. Rejected', lines: [C.svcRule], status: 'rejected' },
      { at: 'controller', note: 'Maps the error to 403', lines: [C.ctrlReturn] },
      { at: 'browser', note: '403: needs manager approval', lines: [] },
    ]
  }
  return [
    ...head,
    { at: 'service', note: 'Rule passes ($30 ≤ $100), asks the repository to save', lines: [C.svcRule, C.svcSave] },
    { at: 'repo', note: `Builds the SQL: ${sql}`, lines: [C.repoQuery] },
    { at: 'db', note: 'Row inserted', lines: [], status: 'ok' },
    { at: 'repo', note: 'Turns the row into an Order object', lines: [C.repoQuery] },
    { at: 'service', note: 'Returns the Order', lines: [C.svcSave] },
    { at: 'controller', note: 'Turns the Order into JSON', lines: [C.ctrlReturn] },
    { at: 'browser', note: '201 Created', lines: [] },
  ]
}

export function layeredCode(shortcut: boolean): string[] {
  if (shortcut) {
    return [
      '// OrderController.ts',
      'async post(req: Request) {',
      "  const row = await db.query('INSERT …', req.body)",
      '  return json(201, row)',
      '}',
      '',
      '// OrderService.ts: the approval rule is still here,',
      '// but this path never calls it.',
      'async place(input: NewOrder) {',
      '  if (input.total > 100) throw new NeedsApproval()',
      '  return this.repo.save(input)',
      '}',
    ]
  }
  return [
    '// OrderController.ts',
    'async post(req: Request) {',
    '  const order = await this.service.place(req.body)',
    '  return json(201, order)',
    '}',
    '// OrderService.ts',
    'async place(input: NewOrder) {',
    '  if (input.total > 100) throw new NeedsApproval()',
    '  return this.repo.save(input)',
    '}',
    '// OrderRepository.ts',
    'save(order: NewOrder) {',
    "  return db.query('INSERT …', order)",
    '}',
  ]
}

/** Which layers must change for each kind of change, given the current wiring. */
export const CHANGES = {
  mongo: {
    label: 'Swap Postgres for MongoDB',
    layered: ['repo'] as LayerId[],
    shortcut: ['controller', 'repo'] as LayerId[],
  },
  rule: {
    label: 'New rule: no orders after 11pm',
    layered: ['service'] as LayerId[],
    shortcut: ['controller', 'service'] as LayerId[],
  },
  json: {
    label: 'Return XML as well as JSON',
    layered: ['controller'] as LayerId[],
    shortcut: ['controller'] as LayerId[],
  },
}
export type ChangeId = keyof typeof CHANGES

export interface Trip {
  kind: RequestKind['id']
  steps: Step[]
  /** Index of the step we are moving toward (or dwelling at). */
  index: number
  /** 'move' between steps, then 'dwell' at the layer. */
  phase: 'move' | 'dwell'
  t: number
  status: Step['status']
}

export interface LayeredSim {
  shortcut: boolean
  trip: Trip | null
  queue: RequestKind['id'][]
  change: ChangeId | null
  changeT: number
  bypassed: number
  hl: Highlights
}

export const MOVE_TIME = 0.45
export const DWELL_TIME = 0.75

export function createLayered(): LayeredSim {
  return { shortcut: false, trip: null, queue: [], change: null, changeT: 0, bypassed: 0, hl: new Map() }
}

export function send(sim: LayeredSim, kind: RequestKind['id']) {
  if (sim.trip) sim.queue.push(kind)
  else start(sim, kind)
}

function start(sim: LayeredSim, kind: RequestKind['id']) {
  sim.trip = { kind, steps: route(kind, sim.shortcut), index: 0, phase: 'dwell', t: 0, status: undefined }
}

export function setShortcut(sim: LayeredSim, on: boolean) {
  sim.shortcut = on
  sim.trip = null
  sim.queue = []
  sim.hl.clear()
}

export function showChange(sim: LayeredSim, change: ChangeId) {
  sim.change = change
  sim.changeT = 4
}

export function stepLayered(sim: LayeredSim, dt: number) {
  decay(sim.hl, dt)
  if (sim.change) {
    sim.changeT -= dt
    if (sim.changeT <= 0) sim.change = null
  }
  const trip = sim.trip
  if (!trip) {
    const next = sim.queue.shift()
    if (next) start(sim, next)
    return
  }
  trip.t += dt / (trip.phase === 'move' ? MOVE_TIME : DWELL_TIME)
  if (trip.t < 1) return
  trip.t = 0
  if (trip.phase === 'move') {
    trip.phase = 'dwell'
    const step = trip.steps[trip.index]
    flash(sim.hl, ...step.lines)
    if (step.status) {
      trip.status = step.status
      if (step.status === 'bypassed') sim.bypassed++
    }
    return
  }
  if (trip.index + 1 >= trip.steps.length) {
    sim.trip = null
    return
  }
  trip.index++
  trip.phase = 'move'
}
