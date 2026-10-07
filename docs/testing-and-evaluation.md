# Testing & evaluation plan

> How MFKit proves it works (**testing**) and how we find out whether it's
> worth adopting (**evaluation**). Testing catches regressions in what we
> built. Evaluation catches the things we didn't think to build. Both are
> needed; the second is why `examples/minimal` found 7 bugs that 138 unit
> tests didn't.
>
> Status as of 2026-10-07. Update the "Today" columns when a layer lands.

---

## Part 1 — Testing

### The layers

Each layer has one job. A bug should be caught by the *cheapest* layer able
to see it; when a higher layer catches one, add a test one layer down too.

| # | Layer | Answers | Tooling | Today | Runs |
|---|---|---|---|---|---|
| L1 | **Unit (pure)** | Is the derivation/state-machine logic right? | vitest, `packages/*/tests` | 192 tests: derive, healing, controller, generators, registry, CLI | every PR |
| L2 | **Contract types** | Does the public type surface accept/reject what it should? | vitest `expectTypeOf` | plugin-api only (15) | every PR |
| L3 | **Component (DOM)** | Does `<MFKitOutlet>` render the right slot, not remount, clean up? | vitest + happy-dom + @testing-library/react | **missing** | every PR |
| L4 | **Package** | Does what we *publish* resolve and import for a consumer? | publint, are-the-types-wrong, pack-and-install | publint + attw ✅; pack-install **missing** | every PR |
| L5 | **Example e2e (build)** | Does a real shell load real remotes in a real browser, styled? | `examples/minimal` smoke + e2e, playwright-core | ✅ 2 MFEs, mount/props/tick/computed-style | every PR |
| L6 | **Fault injection** | Does self-healing actually heal? | e2e variants with a misbehaving server | **missing** | every PR |
| L7 | **Matrix** | Do other framework/tool versions work? | CI matrix over example variants | Node 22/24 only | nightly |
| L8 | **Canary consumer** | Does a real app still work on `main`? | DevNexus against `@mfkit/*@alpha` | manual | weekly / pre-release |

### L1 — Unit: keep doing what works, close three gaps

The pure-function + injected-I/O style (`derive.ts` takes `exists`,
`controller.ts` takes `loadRemote`) is why L1 is fast and stable. Keep it.

Gaps to close:

1. **Coverage gate.** Add `@vitest/coverage-v8`, report in CI, start the
   threshold at today's number and ratchet up. Suggested floors: `healing/**`
   and `vite/derive.ts` ≥ 95% branches (they *are* the product), the rest ≥ 85%
   lines. Don't chase 100% on adapters. They're one-liners tested by L5.
2. **Property-based tests (fast-check) for the invariants that are really
   universally quantified:**
   - `autoAssignPorts`: for any manifest, assigned ports are unique, inside
     the range, never equal an explicit MFE port or the shell's effective port,
     and stable across MFE reordering.
   - **MFE/shell agreement** (the R1 bug class): for any manifest and any
     adapter, `deriveMFE(...).port` equals the port in `buildRemotesMap(...)`.
   - `createEntriesCache` / `createPropsStabilizer`: equal input → same
     identity; any value change → new identity.
   - `defineConfig`: never throws a non-`MFKitConfigError`, for any input
     (fuzz with `fc.anything()`).
3. **Controller race tests** with deferred promises: async `unmount`
   resolving after the next `mount` (review O7), `stop()` during
   load-retry wait, `start()` twice in one tick.

### L2 — Contract types

`@mfkit/plugin-api` *is* types. Its tests should pin the surface so an
accidental breaking change fails CI:

- `expectTypeOf<MFKitConfig>()` assertions for every public type: required
  vs. optional fields, `readonly`, `FrameworkId` autocomplete union.
- An **API report** (`@microsoft/api-extractor` or `tsup --dts` output
  snapshot) committed to the repo; CI fails when it changes without a
  changeset. This turns invariant 1 from a code-review rule into a check.

### L3 — Component tests for the React binding (new)

The controller is well tested, but the React glue (effect deps, refs,
`useState` initializers) is where R3 and dx-findings #7 lived. Neither could
be caught by L1. Minimum suite (vitest `environment: "happy-dom"` for
`tests/react/**` only):

- renders the loading slot → mounted container → each slot kind
- **re-rendering the parent with inline `props`/`entries` does not call
  `unmount`** (R3 and #7 regressions)
- changing `props` values *does* remount (until `update?` exists, review O4)
- StrictMode double-effect: exactly one live mount after settle
- `retry` from error and quarantine slots clears the registry and remounts
- unmounting the outlet calls `unmount` once and aborts in-flight loads

`@testing-library/react` + `react-dom` are already dev-installable; keep them
dev-only so subpath isolation (L1 `subpath-isolation.test.ts`) still holds.

### L4 — Package tests

publint + are-the-types-wrong run in CI (`package` job). Add **pack-and-install**:

```
pnpm -r pack → tarballs
fresh temp dir: npm init -y && npm i ./mfkit-kit-*.tgz ./mfkit-plugin-api-*.tgz vite @module-federation/vite
node -e 'await import("@mfkit/kit"); await import("@mfkit/kit/vite"); …'
npx mfkit-migrate list      # would have caught R4
```

Plus a **Svelte-only install** variant with *no* React installed, importing
`@mfkit/kit` and `@mfkit/kit/vite`. That proves invariant 2 against the
published artifact, not just the source graph.

### L5 — Example e2e

Already strong. It asserts computed styles, not just mount state, and that
choice caught a bug nothing else could. Extend it:

- **Dev mode.** Today smoke and e2e run `vite preview` over production builds
  only. Add a dev-server pass: `vite` for all three apps, same assertions. Dev
  and build take different code paths (`mode: "dev"` origins, no CSS
  injection, MF dev runtime).
- **Navigation.** Unmount/remount through a route change; assert no leaked
  `<style>` duplicates and no console errors.
- **Console hygiene.** Fail the run on any `console.error` or unexpected
  `console.warn` (catches singleton-skew warnings, review O2).

### L6 — Fault injection (new; proves the headline feature)

"Self-healing" is MFKit's differentiator and currently has **no end-to-end
proof**. Add a tiny fault proxy in front of one MFE's preview server and drive
these scenarios:

| Scenario | Proxy behavior | Expected outcome |
|---|---|---|
| Transient outage | 503 on first 2 requests for `remoteEntry.js`, then OK | `retrying` → `mounted`; other MFE unaffected throughout |
| Hard outage | always 503 | `quarantined` slot after `maxAttempts`; shell and other MFE interactive |
| Slow remote | 3s latency | loading slot visible; no retry storm (count requests) |
| Mount throws | serve a lifecycle whose `mount` throws | `onMountError` path → quarantine; error surfaced via `onError` |
| Recovery | outage, then fix, then click "Try again" | registry cleared → `mounted` |
| Strict strategy | hard outage with `strictStrategy()` | `error` slot (not quarantine), exactly 1 request |

Each row asserts `data-mfkit-state` transitions, which already exist for this
purpose.

### L7 — Compatibility matrix (nightly)

Generate example variants from one manifest-driven template rather than
hand-maintaining copies:

| Axis | Values |
|---|---|
| Node | 22, 24 (PR CI) |
| Vite | 6.x, 7.x |
| `@module-federation/vite` | pinned min (1.5), latest |
| React | 18, **19** (review O2) |
| MFE frameworks | react, svelte (today) + **vue, lit, angular** |
| OS | ubuntu (PR), windows + macos (nightly: path handling in `derive.ts`/`turbo.ts`) |

Vue/Lit/Angular adapters exist but have **never run in this repo's CI**.
Angular via analog is the riskiest. Add one MFE per framework to a
`examples/polyglot` variant before claiming five-framework support in the
README.

### L8 — Canary: DevNexus

DevNexus is the original consumer and the plan's integration test. Make it
mechanical: a weekly workflow in DevNexus installs `@mfkit/*@alpha`, runs its
own e2e, and opens an issue in this repo on failure. Before each release,
re-run it manually against the release candidate.

### Quality gates per milestone

| Gate | alpha.2 | beta | v0.1.0 |
|---|---|---|---|
| L1 coverage | reported | healing/derive ≥ 95% br | ratchet holds |
| L2 API report | — | ✅ blocking | ✅ |
| L3 outlet DOM suite | ✅ | ✅ | ✅ |
| L4 pack-install + Svelte-only | ✅ | ✅ | ✅ |
| L5 dev-mode e2e | — | ✅ | ✅ |
| L6 fault scenarios | transient + hard | all 6 | all 6 |
| L7 matrix | React 19 | + vue, lit | + angular, windows |
| L8 DevNexus canary | manual | weekly automated | green 4 weeks running |

---

## Part 2 — Evaluation (is it worth adopting?)

Tests tell us the code does what we meant. Evaluation tells us whether what we
meant is what adopters need. The `mfe-landscape.md` research says the
real-world tax is *tooling and coordination*, so measure that tax directly.

### E1. Time-to-first-federated-mount (the headline DX metric)

Protocol: a developer who has never seen MFKit gets the README and a clean
machine. Measure:

- minutes from `git clone` (or, post-CLI, `npm create mfkit`) to a shell
  showing two framework-different MFEs
- number of files they had to hand-write
- number of times they had to read source code instead of docs
- every error message they hit, verbatim

Target for v0.1: under 15 minutes, zero source-reading. Run it with ≥ 3
people per milestone and record results in `docs/dx-findings.md` with the same
format as today (finding → fix → regression guard). The minimal example was
a run of this protocol by the author. The next run must be someone else.

### E2. Error-message audit

Every `MFKitConfigError` and every `[mfkit]` log line, collected into one
table, scored on three questions: does it say **what** is wrong, **where**
(manifest path), and **what to do next**? Anything scoring < 3/3 is a bug.
Several already score 3/3 (lifecycle probe, missing peer); make that the
standard.

### E3. "Docs don't lie" check

dx-findings #3 (README showed APIs that don't exist) and review R5 (error
message recommended an unwired API) are the same failure. Mechanize it:

- extract every fenced `ts` block in `README.md`, `packages/*/README.md`, and
  `docs/integration-guide.md` and typecheck it against the built packages in
  CI (a small script; blocks can opt out with `<!-- notest -->`)
- the README "What works today" matrix (review O1) is updated in the same PR
  as any wiring change. The PR template checklist asks.

### E4. Healing value, quantified

Using the L6 harness, report for each scenario: time the shell is
interactive, time to recovery, request count. Compare against a baseline shell
with a plain `React.lazy` + `ErrorBoundary`. That's the comparison an adopter
would make. If the forgiving strategy doesn't measurably beat the naïve
baseline on transient outages, the defaults need tuning.

### E5. Cost of the abstraction

- bytes added to the shell's initial bundle by `@mfkit/kit/react` + healing
  (track with `size-limit` per subpath; budget it, fail CI on regression)
- bytes added per remote by CSS injection vs. a `<link>`
- dev-server cold start with and without kit (target: within 5%)

### E6. Adoption signals (once public)

Track monthly, publish in release notes: npm weekly downloads per package,
GitHub issues opened by non-maintainers, time-to-first-response on issues,
external PRs merged, number of non-DevNexus consumers known. The plan's own
risk table says "wait for a second non-DevNexus consumer before abstracting".
This metric is that gate.

---

## Part 3 — First steps (in order)

1. L3 outlet DOM suite: the cheapest way to lock in R3/#7.
2. L6 transient + hard outage scenarios: proves the headline feature.
3. L4 pack-and-install + Svelte-only: would have caught R4 before release.
4. Coverage reporting (no threshold yet), then property tests for ports.
5. E1 with one outside developer. Write down everything.
