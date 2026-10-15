import { SpeedProvider, useSpeed } from './lib/speed'
import { ObserverSection } from './sections/ObserverSection'
import { StrategySection } from './sections/StrategySection'
import { DecoratorSection } from './sections/DecoratorSection'
import { ChainSection } from './sections/ChainSection'
import { LayeredSection } from './sections/LayeredSection'
import { ServicesSection } from './sections/ServicesSection'
import { EventsSection } from './sections/EventsSection'
import { BalancerSection } from './sections/BalancerSection'

const NAV = [
  { id: 'observer', label: 'Observer' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'decorator', label: 'Decorator' },
  { id: 'chain', label: 'Chain' },
  { id: 'layered', label: 'Layered' },
  { id: 'microservices', label: 'Microservices' },
  { id: 'events', label: 'Events' },
  { id: 'balancer', label: 'Load balancer' },
]

const SPEEDS = [
  { value: 0, label: '❚❚' },
  { value: 0.5, label: '½×' },
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
]

function SpeedControl() {
  const { speed, setSpeed } = useSpeed()
  return (
    <div className="segmented" role="radiogroup" aria-label="Simulation speed">
      {SPEEDS.map((s) => (
        <button
          key={s.value}
          type="button"
          role="radio"
          aria-checked={speed === s.value}
          aria-label={s.value === 0 ? 'Pause' : `${s.value}× speed`}
          className={speed === s.value ? 'on' : undefined}
          onClick={() => setSpeed(s.value)}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}

export function App() {
  return (
    <SpeedProvider>
      <nav className="topbar">
        <a href="#top" className="brand">
          <img src="./favicon.svg" alt="" width={22} height={22} />
          Patterns in Motion
        </a>
        <div className="nav-links">
          {NAV.map((n) => (
            <a key={n.id} href={`#${n.id}`}>
              {n.label}
            </a>
          ))}
        </div>
        <SpeedControl />
      </nav>

      <main className="page" id="top">
        <header className="hero">
          <h1>Patterns in Motion</h1>
          <p className="hero-lead">
            One pizza shop, built eight different ways. Each pattern below is a live simulation you can poke, tune and break.
          </p>
          <ul className="how">
            <li>
              <strong>Watch it run.</strong> Every diagram is a working simulation, not a recording. Click things.
            </li>
            <li>
              <strong>Follow the code.</strong> Lines light up in the code panel at the moment the simulation runs them.
            </li>
            <li>
              <strong>Break it.</strong> The red switch shows what goes wrong without the pattern, or when it's done badly.
            </li>
          </ul>
        </header>

        <div className="part">
          <span className="part-kicker">Part 1</span>
          <h2>Design patterns</h2>
          <p>How objects inside one program hand work to each other.</p>
        </div>
        <ObserverSection />
        <StrategySection />
        <DecoratorSection />
        <ChainSection />

        <div className="part">
          <span className="part-kicker">Part 2</span>
          <h2>Architecture patterns</h2>
          <p>How the whole system is split up, and what happens when part of it fails.</p>
        </div>
        <LayeredSection />
        <ServicesSection />
        <EventsSection />
        <BalancerSection />

        <footer className="footer">
          <p>
            Built with React, TypeScript and SVG. Every simulation is a plain TypeScript module in <code>src/sims</code>, with
            tests.
          </p>
        </footer>
      </main>
    </SpeedProvider>
  )
}
