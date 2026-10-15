import { decay, flash, type Highlights } from '../lib/highlight'

/**
 * Observer: the Oven (subject) keeps a set of observers and notifies all of them
 * when a pizza is ready. Screens mount and unmount; a correct screen unsubscribes
 * when it unmounts. In "leak" mode it forgets to, and the oven keeps notifying ghosts.
 */

export const KINDS = [
  { kind: 'kitchen', label: 'Kitchen screen' },
  { kind: 'sms', label: 'Customer SMS' },
  { kind: 'driver', label: 'Driver app' },
  { kind: 'analytics', label: 'Analytics' },
] as const

export type Kind = (typeof KINDS)[number]['kind']

export interface Instance {
  id: number
  kind: Kind
  /** The component is on screen. A subscribed instance that is not alive is a ghost. */
  alive: boolean
  received: number
  flash: number
}

export interface Pulse {
  id: number
  order: number
  to: number
  t: number
}

export interface ObserverSim {
  /** Every instance ever created, in creation order. */
  instances: Instance[]
  /** The Oven's observer set: instance ids. */
  subscribers: Set<number>
  pulses: Pulse[]
  leak: boolean
  autoBake: boolean
  bakeTimer: number
  nextOrder: number
  nextId: number
  ghostDeliveries: number
  ovenFlash: number
  hl: Highlights
}

/** Code panel line numbers (see ObserverSection). */
export const L = { subscribeAdd: 4, unsubscribe: 5, notifyLoop: 9, useSubscribe: 15, cleanup: 16 }

export const PULSE_TIME = 0.7
export const BAKE_EVERY = 2.6

export function createObserver(): ObserverSim {
  const sim: ObserverSim = {
    instances: [],
    subscribers: new Set(),
    pulses: [],
    leak: false,
    autoBake: true,
    bakeTimer: 0.8,
    nextOrder: 1,
    nextId: 1,
    ghostDeliveries: 0,
    ovenFlash: 0,
    hl: new Map(),
  }
  for (const { kind } of KINDS) mount(sim, kind)
  sim.hl.clear()
  return sim
}

export const current = (sim: ObserverSim, kind: Kind) => sim.instances.find((i) => i.kind === kind && i.alive)

export const ghosts = (sim: ObserverSim, kind: Kind) =>
  sim.instances.filter((i) => i.kind === kind && !i.alive && sim.subscribers.has(i.id))

export function mount(sim: ObserverSim, kind: Kind) {
  if (current(sim, kind)) return
  const instance: Instance = { id: sim.nextId++, kind, alive: true, received: 0, flash: 0 }
  sim.instances.push(instance)
  sim.subscribers.add(instance.id)
  flash(sim.hl, L.subscribeAdd, L.useSubscribe)
}

export function unmount(sim: ObserverSim, kind: Kind) {
  const instance = current(sim, kind)
  if (!instance) return
  instance.alive = false
  if (!sim.leak) {
    sim.subscribers.delete(instance.id)
    flash(sim.hl, L.unsubscribe, L.cleanup)
  }
}

export function toggle(sim: ObserverSim, kind: Kind) {
  if (current(sim, kind)) unmount(sim, kind)
  else mount(sim, kind)
}

export function bake(sim: ObserverSim) {
  const order = sim.nextOrder++
  sim.ovenFlash = 1
  flash(sim.hl, L.notifyLoop)
  // The subject only knows "a set of things with update()". It cannot tell a ghost from a live screen.
  for (const id of sim.subscribers) sim.pulses.push({ id: sim.nextId++, order, to: id, t: 0 })
}

/** Turning the bug off also cleans up: a reload starts from a fresh, correct set. */
export function setLeak(sim: ObserverSim, leak: boolean) {
  sim.leak = leak
  if (!leak) {
    for (const i of sim.instances) if (!i.alive) sim.subscribers.delete(i.id)
    sim.pulses = sim.pulses.filter((p) => sim.subscribers.has(p.to))
  }
}

export function stepObserver(sim: ObserverSim, dt: number) {
  decay(sim.hl, dt)
  sim.ovenFlash = Math.max(0, sim.ovenFlash - dt * 2)
  for (const i of sim.instances) i.flash = Math.max(0, i.flash - dt * 2.5)

  if (sim.autoBake) {
    sim.bakeTimer -= dt
    if (sim.bakeTimer <= 0) {
      sim.bakeTimer = BAKE_EVERY
      bake(sim)
    }
  }

  for (const pulse of sim.pulses) {
    pulse.t += dt / PULSE_TIME
    if (pulse.t >= 1) {
      const target = sim.instances.find((i) => i.id === pulse.to)!
      target.received++
      target.flash = 1
      if (!target.alive) sim.ghostDeliveries++
    }
  }
  sim.pulses = sim.pulses.filter((p) => p.t < 1)
}
