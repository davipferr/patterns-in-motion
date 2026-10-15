import { describe, expect, it } from 'vitest'
import * as obs from './observer'
import * as strat from './strategy'
import * as deco from './decorator'
import * as chain from './chain'
import * as lay from './layered'
import * as svc from './services'
import * as ev from './events'
import * as lb from './balancer'

const run = <T>(sim: T, step: (s: T, dt: number) => void, seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) step(sim, dt)
}

describe('observer', () => {
  it('notifies every live subscriber once per pizza', () => {
    const sim = obs.createObserver()
    sim.autoBake = false
    obs.bake(sim)
    run(sim, obs.stepObserver, 1)
    expect(sim.instances.map((i) => i.received)).toEqual([1, 1, 1, 1])
    expect(sim.ghostDeliveries).toBe(0)
  })

  it('a screen that forgets to unsubscribe keeps getting notified after it unmounts', () => {
    const sim = obs.createObserver()
    sim.autoBake = false
    obs.setLeak(sim, true)
    obs.unmount(sim, 'driver')
    obs.mount(sim, 'driver')
    obs.bake(sim)
    run(sim, obs.stepObserver, 1)
    expect(obs.ghosts(sim, 'driver')).toHaveLength(1)
    expect(sim.ghostDeliveries).toBe(1)
    obs.setLeak(sim, false)
    expect(obs.ghosts(sim, 'driver')).toHaveLength(0)
  })
})

describe('strategy', () => {
  it('prices with whichever strategy is plugged in when the order reaches checkout', () => {
    const sim = strat.createStrategy()
    run(sim, strat.stepStrategy, 5)
    const first = sim.orders.find((o) => o.price !== undefined)!
    expect(first.priced).toBe('HappyHour')
    expect(first.price).toBeCloseTo(first.subtotal * 0.7)
  })

  it('a new rule is a new file with the pattern, and a Checkout edit + redeploy without it', () => {
    const sim = strat.createStrategy()
    strat.addRule(sim)
    expect(sim.checkoutEdits).toBe(0)
    expect(sim.newFiles).toEqual(['Student.ts'])
    strat.setIfElse(sim, true)
    strat.addRule(sim)
    expect(sim.checkoutEdits).toBe(1)
    expect(sim.redeploy).toBeGreaterThan(0)
    expect(strat.strategyCode(sim).filter((l) => l.includes('case '))).toHaveLength(sim.rules.length)
  })
})

describe('decorator', () => {
  it('applies layers inner to outer, so order changes the price', () => {
    expect(deco.priceOf(['cheese', 'large'])).toBe((8 + 2) * 1.5)
    expect(deco.priceOf(['large', 'cheese'])).toBe(8 * 1.5 + 2)
  })

  it('the animated call ends with the same total as priceOf', () => {
    const sim = deco.createDecorator()
    sim.autoCall = false
    deco.startCall(sim)
    run(sim, deco.stepDecorator, deco.STOP_TIME * (2 * sim.layers.length + 1) + 0.2)
    expect(sim.call?.total).toBeCloseTo(deco.priceOf(sim.layers))
  })

  it('subclasses grow as 2^n', () => {
    const sim = deco.createDecorator()
    expect(deco.subclassNames(sim).total).toBe(32)
    sim.extraTypes = 2
    expect(deco.subclassNames(sim).total).toBe(128)
  })
})

describe('chain of responsibility', () => {
  const manual = () => {
    const sim = chain.createChain()
    sim.auto = false
    return sim
  }
  const handledBy = (sim: chain.ChainSim) => Object.fromEntries(sim.chain.map((h) => [h.id, h.handled]))

  it('each refund is approved by the first handler allowed to', () => {
    const sim = manual()
    for (const amount of [8, 35, 150]) chain.send(sim, amount)
    run(sim, chain.stepChain, 5)
    expect(handledBy(sim)).toEqual({ cashier: 1, manager: 1, owner: 1 })
    chain.send(sim, 600)
    run(sim, chain.stepChain, 5)
    expect(sim.counts.unhandled).toBe(1)
  })

  it('a handler on a break passes the refund on, and the order of the chain matters', () => {
    const sim = manual()
    chain.toggleAway(sim, 'cashier')
    chain.send(sim, 8)
    run(sim, chain.stepChain, 5)
    expect(handledBy(sim)).toEqual({ cashier: 0, manager: 1, owner: 0 })
    chain.toggleAway(sim, 'cashier')
    chain.moveHandler(sim, 'owner', -1)
    chain.moveHandler(sim, 'owner', -1)
    chain.send(sim, 8)
    run(sim, chain.stepChain, 5)
    expect(sim.chain[0].id).toBe('owner')
    expect(handledBy(sim).owner).toBe(1)
  })

  it('when the client picks the handler, one on a break fails it and a new handler edits the client', () => {
    const sim = manual()
    chain.addHandler(sim)
    expect(sim.clientEdits).toBe(0)
    chain.setDirect(sim, true)
    chain.toggleAway(sim, 'cashier')
    chain.send(sim, 8)
    run(sim, chain.stepChain, 5)
    expect(sim.counts.failed).toBe(1)
    expect(sim.counts.approved).toBe(0)
    sim.chain.pop()
    chain.addHandler(sim)
    expect(sim.clientEdits).toBe(1)
    expect(chain.chainCode(sim).filter((l) => l.includes('if (r.amount'))).toHaveLength(sim.chain.length)
  })
})

describe('layered', () => {
  it('the service rejects a $150 order, the shortcut saves it', () => {
    const sim = lay.createLayered()
    lay.send(sim, 'big')
    run(sim, lay.stepLayered, 10)
    expect(sim.bypassed).toBe(0)
    lay.setShortcut(sim, true)
    lay.send(sim, 'big')
    run(sim, lay.stepLayered, 10)
    expect(sim.bypassed).toBe(1)
  })

  it('the layered path visits every layer down and back up', () => {
    const route = lay.route('post', false).map((s) => s.at)
    expect(route).toEqual(['browser', 'controller', 'service', 'repo', 'db', 'repo', 'service', 'controller', 'browser'])
  })
})

describe('monolith vs microservices', () => {
  const after = (setup: (s: svc.ServicesSim) => void, seconds = 30) => {
    const sim = svc.createServices()
    setup(sim)
    run(sim, svc.stepServices, seconds)
    return sim
  }

  it('both sides serve everything when nothing is broken', () => {
    const sim = after(() => {})
    for (const side of ['mono', 'micro'] as const)
      for (const kind of ['browse', 'order'] as const) expect(svc.stats(sim, side, kind).success).toBeGreaterThan(0.95)
    // In-process calls are cheaper than network hops.
    expect(svc.stats(sim, 'mono', 'order').latency!).toBeLessThan(svc.stats(sim, 'micro', 'order').latency!)
  })

  it('a crashing Payments takes the whole monolith down, but only orders in microservices', () => {
    const sim = after((s) => (s.bug = true))
    expect(sim.mono.crashes).toBeGreaterThan(3)
    expect(svc.stats(sim, 'mono', 'browse').success!).toBeLessThan(0.6)
    expect(svc.stats(sim, 'micro', 'browse').success!).toBeGreaterThan(0.95)
    expect(svc.stats(sim, 'micro', 'order').success!).toBe(0)
  })

  it('without timeouts the failure cascades through the gateway to the menu', () => {
    const sim = after((s) => {
      s.bug = true
      s.timeouts = false
    })
    expect(svc.stats(sim, 'micro', 'browse').success!).toBeLessThan(0.3)
    expect(sim.micro.pools.gw!.busy).toBe(sim.micro.pools.gw!.workers)
  })

  it('workers are never over-allocated', () => {
    const sim = svc.createServices()
    sim.rate = 7
    for (let i = 0; i < 1800; i++) {
      svc.stepServices(sim, 1 / 60)
      if (i === 600) sim.bug = true
      if (i === 1200) sim.bug = false
      for (const side of [sim.mono, sim.micro])
        for (const pool of Object.values(side.pools)) {
          expect(pool.busy).toBeGreaterThanOrEqual(0)
          expect(pool.busy).toBeLessThanOrEqual(pool.workers)
        }
    }
  })
})

describe('event-driven', () => {
  it('a paused subscriber builds a backlog and drains it after resuming', () => {
    const sim = ev.createEvents()
    ev.togglePause(sim, 'email')
    run(sim, ev.stepEvents, 15)
    const email = sim.consumers.find((c) => c.id === 'email')!
    expect(email.queue).toBeGreaterThan(8)
    expect(ev.checkoutStats(sim).failed).toBe(0)
    ev.togglePause(sim, 'email')
    run(sim, ev.stepEvents, 40)
    expect(email.queue).toBeLessThan(3)
  })

  it('direct calls are slower and fail when one subscriber is down, after others acted', () => {
    const sim = ev.createEvents()
    run(sim, ev.stepEvents, 12)
    const asyncLatency = ev.checkoutStats(sim).latency!
    ev.setSync(sim, true)
    run(sim, ev.stepEvents, 12)
    expect(ev.checkoutStats(sim).latency!).toBeGreaterThan(asyncLatency * 3)
    ev.togglePause(sim, 'loyalty')
    run(sim, ev.stepEvents, 12)
    expect(ev.checkoutStats(sim).failed).toBeGreaterThan(3)
    expect(sim.halfDone).toBeGreaterThan(3)
  })
})

describe('load balancer + cache', () => {
  const after = (setup: (s: lb.BalancerSim) => void, seconds = 30) => {
    const sim = lb.createBalancer()
    setup(sim)
    run(sim, lb.stepBalancer, seconds)
    return sim
  }

  it('serves everything and mostly from cache when nothing is broken', () => {
    const sim = after(() => {})
    const s = lb.stats(sim)
    expect(s.success!).toBeGreaterThan(0.97)
    expect(s.hitRate!).toBeGreaterThan(0.6)
  })

  it('health checks take a crashed server out of the rotation', () => {
    const sim = after(() => {}, 10)
    lb.toggleServer(sim, 2)
    run(sim, lb.stepBalancer, 20)
    expect(lb.stats(sim).success!).toBeGreaterThan(0.95)
    expect(sim.servers[1].inRotation).toBe(false)
  })

  it('without health checks about one in three requests fails', () => {
    const sim = after(() => {}, 10)
    lb.setHealthChecks(sim, false)
    lb.toggleServer(sim, 2)
    run(sim, lb.stepBalancer, 20)
    const success = lb.stats(sim).success!
    expect(success).toBeLessThan(0.75)
    expect(success).toBeGreaterThan(0.55)
  })

  it('without the cache the database becomes the bottleneck', () => {
    const cached = after((s) => (s.rate = 6))
    const uncached = after((s) => {
      s.rate = 6
      lb.setCache(s, false)
    })
    expect(lb.stats(uncached).success!).toBeLessThan(0.8)
    expect(lb.stats(cached).success!).toBeGreaterThan(0.95)
    expect(uncached.db.queue.length).toBeGreaterThan(cached.db.queue.length)
  })

  it('workers and connections are never over-allocated', () => {
    const sim = lb.createBalancer()
    sim.rate = 10
    for (let i = 0; i < 1800; i++) {
      lb.stepBalancer(sim, 1 / 60)
      if (i === 300) lb.toggleServer(sim, 1)
      if (i === 600) lb.flushCache(sim)
      if (i === 900) lb.toggleServer(sim, 1)
      if (i === 1200) lb.removeServer(sim)
      for (const s of sim.servers) {
        expect(s.busy).toBeGreaterThanOrEqual(0)
        expect(s.busy).toBeLessThanOrEqual(lb.WORKERS)
      }
      expect(sim.db.busy).toBeGreaterThanOrEqual(0)
      expect(sim.db.busy).toBeLessThanOrEqual(lb.DB_CONNECTIONS)
    }
  })
})
