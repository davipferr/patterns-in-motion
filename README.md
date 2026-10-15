# Patterns in Motion

Design and architecture patterns as live simulations you can poke, tune and break.
One pizza shop, built eight different ways.

Every section has three parts:

- **A running simulation** you can click and tune (not a recording).
- **A code panel** whose lines light up the moment the simulation runs them.
- **A "Break it" switch** that shows what goes wrong without the pattern, or when it's done badly.

| # | Pattern | Break it |
| --- | --- | --- |
| 1 | **Observer**: the oven notifies every subscribed screen | Forget to unsubscribe: unmounted screens become ghosts that keep getting notified |
| 2 | **Strategy**: Checkout prices orders with a swappable strategy | Hardcode it as a `switch`: every new rule edits and redeploys Checkout |
| 3 | **Decorator**: toppings wrap a pizza; `getPrice()` walks in and back out | Use subclasses: one class per combination, 2ⁿ of them |
| 4 | **Chain of Responsibility**: a refund is passed along cashier → manager → owner until someone can approve it | The client picks the handler: it knows every limit, needs an edit per new handler, and fails when that person is on a break |
| 5 | **Layered**: Controller → Service → Repository → Database | SQL in the controller: skips the approval rule, couples HTTP to the database |
| 6 | **Monolith vs Microservices**: the same traffic hits both | Remove the timeouts: a crashing Payments cascades through the gateway to the menu |
| 7 | **Event-driven**: Orders publishes one event, subscribers each have a queue | Call every subscriber directly: slow checkouts, and one paused subscriber fails them |
| 8 | **Load balancer + cache**: round-robin over healthy servers, a shared cache in front of the database | No health checks: a crashed server stays in the rotation and every request sent to it fails |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm test` | Vitest: each simulation's behaviour (no React needed) |
| `npm run build` | Typecheck + static build into `dist/` |
| `npm run typecheck` | `tsc --noEmit` |

## How it's built

React 19 + TypeScript + Vite, drawn with plain SVG. No animation or chart libraries.

- `src/sims/`: each pattern is a plain TypeScript simulation (state + `step(dt)`), unit-tested in `sims.test.ts`.
- `src/sections/`: one React component per pattern that draws its simulation and wires the controls.
- `src/lib/useSim.ts`: steps a simulation every animation frame while its section is on screen,
  scaled by the global speed control (pause / ½× / 1× / 2×).
- `src/lib/highlight.ts`: simulations "flash" code-panel lines as they run; flashes fade out.

The Monolith vs Microservices section is a small queueing model: both sides get the same Poisson
arrivals; the monolith has one shared worker pool, the microservices side has a connection-limited
gateway, per-service worker pools and a network hop per call. Orders holds its worker while it waits
for Payments, which is what lets a failure spread when there are no timeouts.

The Load balancer + cache section uses the same kind of model: Poisson arrivals, round-robin over the
servers that pass their health check, and a cache-aside lookup with a TTL. The database has only two
connections, and a server holds its worker while it waits for one, so turning the cache off (or
flushing it) backs up the database first and then the servers in front of it.

`vite.config.ts` uses `base: './'`, so the build works from any sub-path, e.g. GitHub Pages.
