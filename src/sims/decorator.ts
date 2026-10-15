import { decay, flash, type Highlights } from '../lib/highlight'

/**
 * Decorator: a Margherita wrapped in toppings. Each wrapper is a Pizza that holds
 * another Pizza. Calling getPrice() on the outside walks in to the base, then each
 * layer adds its part on the way back out, so the order of the layers matters.
 */

export interface Topping {
  id: string
  name: string
  op: 'add' | 'mul'
  value: number
}

export const BASE_PRICE = 8

export const TOPPINGS: Topping[] = [
  { id: 'cheese', name: 'Cheese', op: 'add', value: 2 },
  { id: 'bacon', name: 'Bacon', op: 'add', value: 3 },
  { id: 'mushrooms', name: 'Mushrooms', op: 'add', value: 1.5 },
  { id: 'large', name: 'ExtraLarge', op: 'mul', value: 1.5 },
  { id: 'coupon', name: 'Coupon', op: 'add', value: -4 },
]

/** More topping types for the subclass-explosion counter. */
export const MORE_TOPPINGS = ['Olives', 'Pineapple', 'Jalapeno', 'Onion', 'Ham', 'Basil']

export const topping = (id: string) => TOPPINGS.find((t) => t.id === id)!

export const apply = (t: Topping, price: number) => (t.op === 'add' ? price + t.value : price * t.value)

export const opText = (t: Topping) =>
  t.op === 'mul' ? `× ${t.value}` : t.value < 0 ? `− ${Math.abs(t.value)}` : `+ ${t.value}`

/** Price of a stack of layers, listed inner to outer. */
export const priceOf = (layers: string[]) => layers.reduce((p, id) => apply(topping(id), p), BASE_PRICE)

export interface Stop {
  /** Index into `layers`, or -1 for the base pizza. */
  layer: number
  phase: 'in' | 'out'
}

/** The walk getPrice() takes: outer layer → base → back out. */
export function stops(count: number): Stop[] {
  const result: Stop[] = []
  for (let i = count - 1; i >= 0; i--) result.push({ layer: i, phase: 'in' })
  result.push({ layer: -1, phase: 'out' })
  for (let i = 0; i < count; i++) result.push({ layer: i, phase: 'out' })
  return result
}

export interface Call {
  step: number
  t: number
  /** The value returned so far on the way out; null while still going in. */
  total: number | null
  /** Seconds the final result stays on screen. */
  hold: number
}

export interface DecoratorSim {
  /** Inner to outer. */
  layers: string[]
  call: Call | null
  autoCall: boolean
  idle: number
  subclasses: boolean
  /** How many topping types the subclass approach has to cover. */
  extraTypes: number
  hl: Highlights
}

export const STOP_TIME = 0.5

export function createDecorator(): DecoratorSim {
  return {
    layers: ['cheese', 'bacon', 'large'],
    call: null,
    autoCall: true,
    idle: 0.6,
    subclasses: false,
    extraTypes: 0,
    hl: new Map(),
  }
}

export function toggleLayer(sim: DecoratorSim, id: string) {
  sim.layers = sim.layers.includes(id) ? sim.layers.filter((l) => l !== id) : [...sim.layers, id]
  sim.call = null
  sim.idle = 0.4
}

/** Move a layer one step outward (+1) or inward (−1). */
export function moveLayer(sim: DecoratorSim, id: string, dir: 1 | -1) {
  const i = sim.layers.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= sim.layers.length) return
  const next = [...sim.layers]
  ;[next[i], next[j]] = [next[j], next[i]]
  sim.layers = next
  sim.call = null
  sim.idle = 0.4
}

export function startCall(sim: DecoratorSim) {
  sim.call = { step: 0, t: 0, total: null, hold: 0 }
  flash(sim.hl, callLine(sim))
  enterStop(sim)
}

/** Code panel layout (see `decoratorCode`). */
export const L = { base: 3, wrapperGetPrice: 10, firstWrap: 14 }
export const callLine = (sim: DecoratorSim) => L.firstWrap + sim.layers.length

export function currentStop(sim: DecoratorSim): Stop | null {
  if (!sim.call) return null
  return stops(sim.layers.length)[sim.call.step] ?? null
}

function enterStop(sim: DecoratorSim) {
  const call = sim.call!
  const stop = stops(sim.layers.length)[call.step]
  if (stop.layer === -1) {
    call.total = BASE_PRICE
    flash(sim.hl, L.base)
  } else {
    if (stop.phase === 'out') call.total = apply(topping(sim.layers[stop.layer]), call.total!)
    flash(sim.hl, L.wrapperGetPrice, L.firstWrap + stop.layer)
  }
}

export function stepDecorator(sim: DecoratorSim, dt: number) {
  decay(sim.hl, dt)
  const call = sim.call
  if (!call) {
    if (!sim.autoCall) return
    sim.idle -= dt
    if (sim.idle <= 0) startCall(sim)
    return
  }
  const total = stops(sim.layers.length).length
  if (call.step >= total) {
    call.hold += dt
    if (call.hold > 1.6) {
      sim.call = null
      sim.idle = 0.5
    }
    return
  }
  call.t += dt / STOP_TIME
  if (call.t >= 1) {
    call.t = 0
    call.step++
    if (call.step < total) enterStop(sim)
  }
}

/** The source shown in the code panel. The wrapper class shown follows the call. */
export function decoratorCode(sim: DecoratorSim): string[] {
  const stop = currentStop(sim)
  const shown = topping(stop && stop.layer >= 0 ? sim.layers[stop.layer] : (sim.layers.at(-1) ?? 'cheese'))
  const op = shown.op === 'mul' ? `* ${shown.value}` : shown.value < 0 ? `- ${-shown.value}` : `+ ${shown.value}`
  return [
    'interface Pizza { getPrice(): number }',
    '',
    'class Margherita implements Pizza {',
    `  getPrice() { return ${BASE_PRICE} }`,
    '}',
    '',
    'abstract class Topping implements Pizza {',
    '  constructor(protected inner: Pizza) {}',
    '}',
    `class ${shown.name} extends Topping {`,
    `  getPrice() { return this.inner.getPrice() ${op} }`,
    '}',
    '',
    'let pizza: Pizza = new Margherita()',
    ...sim.layers.map((id) => `pizza = new ${topping(id).name}(pizza)`),
    'pizza.getPrice()',
  ]
}

/** Class names the subclass approach needs: one per combination of toppings. */
export function subclassNames(sim: DecoratorSim, limit = 96): { names: string[]; total: number } {
  const types = [...TOPPINGS.map((t) => t.name), ...MORE_TOPPINGS.slice(0, sim.extraTypes)]
  const total = 2 ** types.length
  const names: string[] = []
  for (let mask = 0; mask < total && names.length < limit; mask++) {
    const parts = types.filter((_, i) => mask & (1 << i))
    names.push(`${parts.join('') || 'Plain'}Pizza`)
  }
  names.sort((a, b) => a.length - b.length)
  return { names, total }
}
