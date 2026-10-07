---
"@mfkit/kit": minor
"@mfkit/plugin-api": patch
---

Self-healing that actually heals, proven by a new fault-injection e2e:

- `@mfkit/kit/healing`: new `createFederationLoader(runtime)`. The Module
  Federation runtime caches failed remote-entry loads (and the browser caches
  failed module imports), so the outlet's retries replayed the first failure
  without touching the network. The loader re-registers a failed remote under
  a cache-busted URL so each retry really refetches. Use it as the provider's
  `loadRemote`:
  `createFederationLoader(await import("@module-federation/runtime"))`.
- Docs + example: shells must load remotes through the MF runtime, not
  `import("mfe_x/lifecycle")`. `@module-federation/vite` preloads every
  specifier-imported remote before the app starts, so a single outage left the
  whole shell blank.
- `@mfkit/kit/vite`: built-in React/Vue/Angular adapters no longer pin
  `requiredVersion` (`^18`/`^3`/`^17`). The MF plugin derived the *advertised*
  version from it, so React 19 apps claimed to provide react@18.0.0.
- `@mfkit/kit/vite`: the missing-peer hint names the package that is actually
  missing (e.g. `@angular/compiler-cli`, required by the analog plugin).
- `@mfkit/kit/react`: a mount waits for any pending async `unmount` on the same
  container, including one from a previous outlet instance.
- `@mfkit/kit/healing`: `MFEQuarantinedError` exposes `reason`; quarantine
  slots no longer truncate multi-line reasons.
- `@mfkit/plugin-api`: unwired fields (`discovery`, plugin `healing`/`setup`,
  `budgets`/`budgetBytes`, automatic `onVersionMismatch`) are marked
  `@experimental` in JSDoc. No type changes.
