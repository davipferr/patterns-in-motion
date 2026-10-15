import { decay, flash, type Highlights } from '../lib/highlight'
import { rng } from '../lib/math'

/**
 * Strategy: Checkout prices every order with whatever PricingStrategy is plugged in.
 * Orders ride a conveyor through Checkout. Swapping the strategy never touches Checkout.
 * In "if/else" mode every new rule is another branch inside Checkout, so Checkout is
 * edited and redeployed (and stops pricing for a moment) each time.
 */

export interface Order {
  id: number
  subtotal: number
  km: number
  /** Conveyor position: 0 = enters on the left, 0.5 = inside Checkout, 1 = leaves on the right. */
  x: number
  price?: number
  priced?: string
}

export interface Rule {
  id: string
  name: string
  formula: string
  /** The `price()` body as source, for the code panel. */
  body: string
  price: (o: Pick<Order, 'subtotal' | 'km'>) => number
}

export const BASE_RULES: Rule[] = [
  { id: 'regular', name: 'Regular', formula: 'subtotal', body: 'o.subtotal', price: (o) => o.subtotal },
  {
    id: 'happyHour',
    name: 'HappyHour',
    formula: '30% off',
    body: 'o.subtotal * 0.7',
    price: (o) => o.subtotal * 0.7,
  },
  {
    id: 'distance',
    name: 'ByDistance',
    formula: '+ $1.20 per km',
    body: 'o.subtotal + o.km * 1.2',
    price: (o) => o.subtotal + o.km * 1.2,
  },
]

/** Rules the "Add a pricing rule" button adds, in order. */
export const EXTRA_RULES: Rule[] = [
  {
    id: 'student',
    name: 'Student',
    formula: '15% off',
    body: 'o.subtotal * 0.85',
    price: (o) => o.subtotal * 0.85,
  },
  {
    id: 'bigOrder',
    name: 'BigOrder',
    formula: '−$5 over $30',
    body: 'o.subtotal > 30 ? o.subtotal - 5 : o.subtotal',
    price: (o) => (o.subtotal > 30 ? o.subtotal - 5 : o.subtotal),
  },
  {
    id: 'rainyDay',
    name: 'RainyDay',
    formula: '+ $2 rain fee',
    body: 'o.subtotal + 2',
    price: (o) => o.subtotal + 2,
  },
  {
    id: 'lateNight',
    name: 'LateNight',
    formula: '+10% after 11pm',
    body: 'o.subtotal * 1.1',
    price: (o) => o.subtotal * 1.1,
  },
]

export interface StrategySim {
  rules: Rule[]
  active: string
  /** Card animation: 0..1 as a newly chosen strategy slides into the slot. */
  swap: number
  ifElse: boolean
  orders: Order[]
  spawnTimer: number
  nextId: number
  checkoutEdits: number
  newFiles: string[]
  /** Seconds left of a Checkout redeploy (if/else mode). Orders wait while it runs. */
  redeploy: number
  hl: Highlights
  random: () => number
}

export const SPEED = 0.16 // conveyor lengths per second
export const SPAWN_EVERY = 1.6
export const QUEUE_GAP = 0.145

export function createStrategy(seed = 7): StrategySim {
  return {
    rules: [...BASE_RULES],
    active: 'happyHour',
    swap: 1,
    ifElse: false,
    orders: [],
    spawnTimer: 0,
    nextId: 1,
    checkoutEdits: 0,
    newFiles: [],
    redeploy: 0,
    hl: new Map(),
    random: rng(seed),
  }
}

export const activeRule = (sim: StrategySim) => sim.rules.find((r) => r.id === sim.active)!

export function setStrategy(sim: StrategySim, id: string) {
  if (id === sim.active) return
  sim.active = id
  sim.swap = 0
  flash(sim.hl, sim.ifElse ? 1 : codeLines(sim).setStrategy)
}

export function canAddRule(sim: StrategySim) {
  return sim.rules.length < BASE_RULES.length + EXTRA_RULES.length
}

export function addRule(sim: StrategySim) {
  const next = EXTRA_RULES[sim.rules.length - BASE_RULES.length]
  if (!next) return
  sim.rules.push(next)
  if (sim.ifElse) {
    sim.checkoutEdits++
    sim.redeploy = 2.2
  } else {
    sim.newFiles.push(`${next.name}.ts`)
  }
}

export function setIfElse(sim: StrategySim, on: boolean) {
  sim.ifElse = on
  sim.hl.clear()
}

/**
 * Line numbers for the code panel. The panel's text is built by `strategyCode`,
 * so both modes and the growing if/else chain stay in sync with the simulation.
 */
export function codeLines(sim: StrategySim) {
  if (sim.ifElse) {
    const branch = sim.rules.findIndex((r) => r.id === sim.active)
    return { setStrategy: 1, price: [5 + branch] }
  }
  return { setStrategy: 11, price: [13, 5] }
}

export function strategyCode(sim: StrategySim): string[] {
  if (sim.ifElse) {
    return [
      'class Checkout {',
      `  mode = '${sim.active}'`,
      '',
      '  total(o: Order) {',
      '    switch (this.mode) {',
      ...sim.rules.map((r) => `      case '${r.id}': return ${r.body}`),
      "      default: throw new Error('unknown mode')",
      '    }',
      '  }',
      '}',
    ]
  }
  const rule = activeRule(sim)
  return [
    'interface PricingStrategy {',
    '  price(o: Order): number',
    '}',
    '',
    `class ${rule.name} implements PricingStrategy {`,
    `  price(o: Order) { return ${rule.body} }`,
    '}',
    '',
    'class Checkout {',
    '  constructor(private strategy: PricingStrategy) {}',
    '',
    `  setStrategy(s: PricingStrategy) { this.strategy = s }`,
    '  total(o: Order) {',
    '    return this.strategy.price(o)',
    '  }',
    '}',
  ]
}

export function stepStrategy(sim: StrategySim, dt: number) {
  decay(sim.hl, dt)
  sim.swap = Math.min(1, sim.swap + dt * 3)
  sim.redeploy = Math.max(0, sim.redeploy - dt)

  sim.spawnTimer -= dt
  // Hold new orders back while the queue reaches the entrance.
  if (sim.spawnTimer <= 0 && !sim.orders.some((o) => o.x < QUEUE_GAP)) {
    sim.spawnTimer = SPAWN_EVERY
    const subtotal = Math.round((12 + sim.random() * 30) * 2) / 2
    const km = Math.round(1 + sim.random() * 7)
    sim.orders.push({ id: sim.nextId++, subtotal, km, x: 0 })
  }

  // Move front to back so each order can stop behind the one ahead of it.
  const sorted = [...sim.orders].sort((a, b) => b.x - a.x)
  let ahead = Infinity
  for (const order of sorted) {
    let x = order.x + SPEED * dt
    const atCheckout = order.price === undefined && x >= 0.5
    // A redeploying Checkout cannot price anything: orders pile up in front of it.
    if (atCheckout && sim.redeploy > 0) x = 0.5
    if (atCheckout && sim.redeploy <= 0) {
      const rule = activeRule(sim)
      order.price = rule.price(order)
      order.priced = rule.name
      flash(sim.hl, ...codeLines(sim).price)
    }
    x = Math.min(x, ahead - QUEUE_GAP)
    order.x = Math.max(order.x, x)
    ahead = order.x
  }
  sim.orders = sim.orders.filter((o) => o.x < 1.05)
}
