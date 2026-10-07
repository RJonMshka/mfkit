# Project review — October 2026

> Snapshot review of MFKit at `0.1.0-alpha.0` (Phase 1 complete), aimed at one
> question: **what stands between this repo and a project strangers can adopt
> and contribute to?** Findings are verified against the code, not inferred
> from docs. Items marked *fixed* landed with this review, each with a
> regression test. Everything else is a recommendation with an owner decision
> attached.
>
> Companion docs: [`testing-and-evaluation.md`](testing-and-evaluation.md)
> (how we prove it works), [`dx-findings.md`](dx-findings.md) (consumer-found
> bugs), [`mfe-landscape.md`](mfe-landscape.md) (market research).

---

## 1. Verdict

The core is in good shape. The contract/runtime split, subpath isolation,
pure-derivation-plus-injected-I/O style, and the "every fix ships with the
finding that motivated it" documentation are **better than most 1.0 OSS
projects**. Baseline at review time: build, typecheck, 182 unit tests, HTTP
smoke and headless-Chrome e2e all green.

The gaps are of three kinds:

1. **Correctness bugs in paths no consumer had exercised yet.** Six found,
   all fixed (§2).
2. **Contract surface that promises more than the runtime delivers.** Plugin
   hooks, discovery, and version-skew detection are typed but not wired (§3).
   This is the biggest adoption risk. An evaluator who writes a plugin
   against the types will find out it does nothing.
3. **Missing open-source scaffolding.** No contributing guide, no conduct or
   security policy, no issue templates, no provenance. Added (§5).

---

## 2. Bugs found and fixed in this review

| # | Area | Bug | How it was confirmed | Fix |
|---|---|---|---|---|
| R1 | `kit/vite` derive | **MFE serves on one port, shell fetches from another.** `FrameworkAdapter.defaultPort` won on the MFE side, but the shell computes remote URLs without loading MFE adapters, so it used the hash-assigned port. Two MFEs on the same adapter also both claimed the default port. | Probe: two MFEs with `defaultPort: 4000` → both served on 4000, shell expected 5270/5271. | Single port resolver shared by both sides; `defaultPort` ignored and marked `@deprecated` in plugin-api (JSDoc only). |
| R2 | `defineConfig` | **Shell/MFE port collision not detected.** Cross-checks covered MFE↔MFE only; shell port (explicit or default 3000) was never compared. | Probe: shell 5175 + MFE 5175 → accepted. | `crossCheck` includes the shell's effective port. `DEFAULT_SHELL_PORT` now exported from one place. |
| R3 | `kit/react` outlet | **Inline `props={{…}}` remounts the MFE on every parent re-render.** `props.props` was an effect dependency compared by identity. The example app does exactly this; it was invisible only because the example's `App` never re-renders. | Code read + same pattern as dx-findings #7. | `createPropsStabilizer()`: shallow `Object.is` per key, so callbacks never compare equal (no stale closures). Pure, tested without React. |
| R4 | `codemods` CLI | **`mfkit-migrate` did nothing when installed.** Entrypoint check compared `import.meta.url` to `process.argv[1]` verbatim. npm/pnpm launch bins through symlinks/shims, so the check failed: exit 0, no output. | Ran the built CLI through a symlink: silent. | Compare `realpathSync` of both. `isEntrypoint` exported and tested with a real symlink. |
| R5 | `kit/vite` adapters | **`MFKitPlugin.frameworkAdapters` was never read**, yet the unknown-framework error tells users to register adapters there. | `grep`: no consumer of `config.plugins`. | `collectAdapters()`: `opts.adapters` > plugins (last wins) > built-ins. |
| R6 | `kit/vite` CSS inject | **Sourcemaps shifted by one line** when `build.sourcemap` is on: the snippet was prepended after Rollup had produced maps. | Code read (`generateBundle` edits `chunk.code` without touching `chunk.map`). | Snippet appended instead; still runs during remote load, before `mount`. |

### Found while building the alpha.2 test layers

The new fault-injection e2e (testing plan L6) was the first test to ever take
a remote down. It found the two most serious bugs in this review, both
invisible to every test that only exercises the happy path.

| # | Area | Bug | How it was confirmed | Fix |
|---|---|---|---|---|
| R7 | example / integration pattern | **One remote down blanks the entire shell.** The example loaded remotes with `import("mfe_x/lifecycle")`. `@module-federation/vite` collects every remote imported by specifier and preloads them in its host bootstrap with `Promise.all`; the app module only loads if all succeed. A 503 on one remote → empty `#root`, no outlets, healing never runs. This is the exact failure MFKit exists to prevent. | L6 hard-outage scenario: `#root` empty; bootstrap source shows `await Promise.all(__mfRemotePreloads)` before the app import. | Shell loads remotes through the MF runtime's `loadRemote(id)` (no preload). Integration guide and both READMEs now warn against specifier imports in the shell. |
| R8 | `kit/healing` | **Retries never retried.** The MF runtime memoizes remote-entry loads per (name, URL) in `globalLoading`, rejections included, and the browser module map caches failed ESM imports. Every retry replayed the first failure with zero network requests. An MFE that blipped once stayed down until reload, and "retry with backoff" was a no-op. | L6: hard outage made 1 request across 3 attempts; transient outage never recovered. Runtime source: `getRemoteEntry` caches the promise before `.catch`. | `createFederationLoader(runtime)` in `@mfkit/kit/healing`: after a failure, re-registers the remote (`force: true`) under a `?mfkit-retry=N` entry URL, which is a fresh cache key for both caches. Fault e2e asserts exactly `maxAttempts` fetches. |
| R9 | `kit/vite` adapter-resolve | **Missing-peer hint named the wrong package.** With `@analogjs/vite-plugin-angular` installed but *its* peer `@angular/compiler-cli` missing, kit said "needs @analogjs/vite-plugin-angular installed", because it only checked whether the peer's name appeared anywhere in the error (it did, in the import path). | Loading the Angular adapter in this repo. | Hint parses the package from `Cannot find package '…'` and says "X is not installed (required by Y)". |

Small fixes alongside: the inverted `logInferred` JSDoc, a false claim in
`error-boundary.tsx` (see O3), a stale comment in `examples/minimal` (the
example now dogfoods `.tsx` lifecycle inference instead of hardcoding
`exposes`, so the e2e covers it), and lint failing on a per-developer
`.claude/settings.local.json`.

---

## 3. Open findings — need a decision

Ordered by adoption impact. "Contract" means the fix touches
`@mfkit/plugin-api` and goes through the steward/breaking-change protocol.

### O1. Typed-but-unwired contract surface — **high** · *alpha.2: documented*

> alpha.2: every unwired field now carries `@experimental` JSDoc saying it is
> not consumed (including `budgetBytes`/`budgets`, whose JSDoc claimed "Enforced
> in CI"), and the README matrix lists them. Wiring them is still open (A1).

| Surface | Status |
|---|---|
| `MFKitPlugin.frameworkAdapters` | **wired now** (R5) |
| `MFKitPlugin.healing`, `.setup`, `.discovery`, `.templateResolvers` | not read anywhere |
| `MFKitConfig.discovery` | not read anywhere |
| `MFKitConfig.healing` | only via `resolveHealingStrategy(config)`, which the React provider doesn't call. Users must pass `strategy={resolveHealingStrategy(config)}` themselves. |
| `HealingStrategy.onVersionMismatch` | never invoked by kit. `checkSingletonVersion` is a manual helper; nothing detects skew. |

**Recommendation:** for v0.1, mark every unwired field `@experimental — not yet
consumed by @mfkit/kit` in JSDoc, and add a "What works today" matrix to the
README. Then wire them in this order: `healing` (cheap; provider reads
`config`), version-skew detection (needs the MF runtime's share-scope info via
an injected hook, the same pattern as `loadRemote`), then `discovery`/`setup`
(need a resolved-config pipeline that doesn't exist yet; see A1).

### O2. Hardcoded, stale `requiredVersion` in built-in adapters — **resolved in alpha.2**

> Worse than described below: `@module-federation/vite` also derives the
> *provided* version from `requiredVersion`, so a React 19 app advertised
> `react@18.0.0` to the share scope. Adapters now declare `singleton` only; the
> plugin fills `^<installed>`. Verified: the React 19 example's share map
> advertises `19.3.0`.

`react` adapter ships `requiredVersion: "^18.0.0"`, `angular` ships
`"^17.0.0"`. React 19 and Angular 18+ consumers get skew warnings or, with
`strictVersion`, load failures, for doing nothing wrong. Kit's own peer range
is `react >=18`.

**Recommendation:** drop `requiredVersion` from adapter defaults and let
`@module-federation/vite` infer it from the consumer's installed package, or
resolve it from `cwd` at config time. Verify with a React 19 variant of the
example (see the test matrix in the testing doc).

### O3. Post-mount runtime errors are unobserved — **medium, contract**

The outlet's error boundary cannot see errors thrown inside a mounted MFE:
each MFE renders into its own root (separate React root, Svelte app, Angular
platform), and errors don't cross roots. The old comment claimed otherwise.
Today, a mounted MFE that crashes on click is invisible to the healing system.

**Recommendation:** additive, optional `MFEContext.reportError(err)` so
well-behaved MFEs can route their own boundaries into the strategy, plus
opt-in `window` `error`/`unhandledrejection` attribution by stack/script URL
to the owning remote. Additive fields don't break the contract.

### O4. Prop changes force a full remount — **medium, contract**

R3 stops *identity* churn from remounting, but a *real* prop change (new
`userId`) still unmounts and remounts the MFE, losing its internal state.

**Recommendation:** optional `MFEDefinition.update?(el, props)`. The
controller calls it when present and falls back to remount when absent. Purely
additive.

### O5. Quarantine is permanent until reload — **medium**

`createQuarantineRegistry` has no TTL or half-open state. One bad deploy
window, and an MFE stays dark for the life of the tab even after the remote
recovers.

**Recommendation:** circuit-breaker semantics in kit (no contract change):
`createQuarantineRegistry({ cooldownMs })` → after cooldown, the next outlet
start is a single half-open probe. Default off to keep today's behavior.

### O6. CSS injection vs. strict CSP and Shadow DOM — **medium**

The injected `<style>` needs `style-src 'unsafe-inline'` or a nonce, so
CSP-strict hosts (common in the enterprise audience the plan targets) will
silently get unstyled MFEs. It also targets `document.head`, so Shadow-DOM
mounts don't receive styles, and styles persist after unmount.

**Recommendation:** read a nonce at runtime (`document.querySelector("meta[property=csp-nonce]")`
or `__webpack_nonce__`-style global), document the CSP requirement in the
integration guide, and track scoped/shadow injection as a v0.2 item.

### O7. Async unmount can race a fast remount — **resolved in alpha.2**

> Confirmed with a deferred-`unmount` test (fails without the fix). Mounts now
> await a per-container pending-teardown promise, shared across controller
> instances because React's effect re-run creates a new controller.

`controller.start()` fires `void tearDownMounted()` and immediately begins the
next cycle into the *same* container. With a sync `unmount` (React, Svelte),
ordering is safe. With an async `unmount` (Angular `destroy`, transitions), the
old unmount can resolve after the new mount and tear it down. Not yet
reproduced.

**Recommendation:** serialize: `run()` awaits the pending teardown promise
before mounting. Add a controller test with a deferred `unmount`.

### O8. Node 20 is end-of-life — **resolved**

Node 20 left maintenance in April 2026. Decision (2026-10-07): the floor is now
`engines.node >= 22` on every package, `.nvmrc` is 22, `@types/node` is `^22`,
and CI tests the two maintained LTS lines, 22 and 24.

### O9. Small sharp edges

> alpha.2: `MFEQuarantinedError.reason` landed. The regex it replaced also
> truncated multi-line reasons (`.` stops at a newline).

- `MFEQuarantinedError` carries its reason only inside `message`; the
  controller regex-parses it back out. Add a `reason` field.
- Remote `.d.ts` types every exposed module as `MFEDefinition<unknown>`. A
  `propsType` hint per expose would give typed props across the boundary.
- `docs/mfekit-plan.md` still names `devnexus.config.ts` and DevNexus's
  `PLAN.md`; the filename itself has a typo (`mfekit`). Rename when next
  touched; leave a stub that links forward.

---

## 4. Architecture — taking it up a notch

Each move strengthens an existing invariant rather than adding a new
subsystem.

### A1. A resolved-config pipeline (unblocks O1)

Today every entry point (`mfkitMFE`, `mfkitShell`, `generateTurboConfig`,
`generateRemoteTypes`) reads the raw manifest independently, and plugins have
nowhere to run. Introduce one pure function:

```
resolveConfig(config, { cwd }) → ResolvedConfig
  1. validate (defineConfig rules)
  2. apply plugins in order (adapters, healing, discovery, setup)
  3. run discovery, merge entries (manifest first, last-wins by name)
  4. derive ports/exposes/origins once → frozen, with an `inferred` log
```

Every generator then consumes `ResolvedConfig`. Wins: plugins become real, a
port or expose can never be derived two different ways again (R1's root
cause), and inference logging happens in exactly one place.

### A2. Close the version-skew loop with an injected probe

Same move that made `loadRemote` work: kit doesn't import the MF runtime, the
host injects `getShareScope()`. The outlet compares the remote's declared
singleton versions against what's loaded, calls
`strategy.onVersionMismatch`, and the plan's headline "singleton version skew
→ actionable error" self-healing row becomes real.

### A3. Runtime graph as an observable (plan innovation #3)

The ingredients exist (`OutletState`, `QuarantineRegistry.snapshot()`, the
manifest). Expose `createMFKitRuntime()`, an event emitter of
`{ mfe, state, attempt, error, at }` that the provider owns and outlets report
into. That gives telemetry hooks (OpenTelemetry), a dev overlay, and the
future MCP federation-graph server a single source, without a state
framework (see `ideas.md` §1 for why that stays parked).

### A4. Framework-neutral outlet core

`react/controller.ts` is already React-free. Promote it to
`@mfkit/kit/outlet` and make `/react` a ~60-line binding. A Vue or Svelte
shell outlet then costs a day each. This is the polyglot promise applied to
the *shell* side, which is currently React-only.

### A5. A `mfkit` CLI that owns `gen`

Consumers currently hand-write `scripts/gen.ts` (see `examples/minimal`).
`mfkit sync` (generate types + turbo) and `mfkit doctor` (validate manifest,
check ports free, check peers installed, check generated artifacts fresh) are
the cheapest high-value Phase 2 items. `doctor` is also the natural home for
O2 and O8 diagnostics.

### A6. Security posture for remote code

Remote integrity is unaddressed: no SRI on remote entries, no origin
allowlist. Proposed: `origin` values validated as URLs in `defineConfig`, an
optional `integrity` field per MFE (build emits hashes; shell verifies before
`loadRemote`), and a documented CSP recipe (O6).

---

## 5. Open-source readiness — what landed

| Item | File |
|---|---|
| Contributing guide (setup, invariants, tests, changesets, commits) | `CONTRIBUTING.md` |
| Code of Conduct (Contributor Covenant 2.1, private reporting) | `CODE_OF_CONDUCT.md` |
| Security policy (private advisories, SLA, scope) | `SECURITY.md` |
| Issue forms (bug with area + versions, feature with contract-impact flag) | `.github/ISSUE_TEMPLATE/*` |
| PR template with the invariant checklist | `.github/PULL_REQUEST_TEMPLATE.md` |
| Code owners | `.github/CODEOWNERS` |
| Dependabot (grouped vite-ecosystem + tooling, actions) | `.github/dependabot.yml` |
| Editor + Node version pins | `.editorconfig`, `.nvmrc` |
| CI: read-only permissions, PR concurrency, Node 22/24 matrix, separate example job, generated-artifact drift check, publint + are-the-types-wrong | `.github/workflows/ci.yml` |
| Release: npm provenance (`id-token: write`), serialized publishes | `.github/workflows/release.yml` |
| npm `keywords`, `engines`, canonical `repository.url` on every package | `packages/*/package.json` |

### Still to do (needs the repo owner)

- Enable **GitHub Discussions** and **private vulnerability reporting** in
  repo settings (the templates link to both).
- Protect `main`: require the `verify`, `example`, and `package` checks.
- Second maintainer in `CODEOWNERS`: deferred by the owner (2026-10-07).
  Revisit before v0.1. Bus factor 1 is the first thing enterprise evaluators
  check.
- Docs site (VitePress on GitHub Pages) once API stabilizes; until then the
  `docs/` folder is the site.
- `docs/when-not-to-use-mfkit.md`, recommended by `mfe-landscape.md`, and cheap
  credibility.

---

## 6. Suggested sequencing

| Milestone | Contents | Why this order |
|---|---|---|
| **v0.1.0-alpha.1** (now) | This review's fixes + OSS scaffolding | Already done; ship it. |
| **v0.1.0-alpha.2** ✅ | O1 JSDoc `@experimental`, O2 adapter versions, O7 race, O9 `reason` field, coverage reporting, test layers L3/L4/L6 + React 19 — which surfaced and fixed R7–R9 | Done. The fault-injection layer paid for itself on its first run. |
| **v0.1.0-beta** | A1 resolved-config pipeline, `healing` wired, O5 cooldown, O6 CSP nonce, React 19 + Vue example variants | Makes the plugin system real, broadens the tested matrix. |
| **v0.2** | A4 outlet core + Vue shell, A5 `mfkit sync/doctor`, O3/O4 (additive contract fields) | Contract additions batched into one plugin-api minor. |
| **v0.3+** | A2 version-skew loop, A3 runtime graph, A6 integrity | Builds on A1/A4. |
