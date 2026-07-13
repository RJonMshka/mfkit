# DX findings from building `examples/minimal`

> Living list. Everything here was hit while building the first non-DevNexus
> consumer from scratch (2026-07-05). Fixed items stay listed — they document
> what the example protects against regressing.

## Fixed during the exercise

1. **Shell remotes were emitted as plain URL strings — broken for ESM
   remotes.** `@module-federation/vite` builds module-type remote entries;
   the MF runtime defaults string remotes to script injection, which threw
   `Cannot use import statement outside a module` (RUNTIME-001) and the shell
   never booted. `mfkitShell` now emits `{ type: "module", name, entry }`.
   DevNexus never surfaced this — worth understanding why its host worked
   before trusting other DevNexus-only-validated paths.

2. **`generateTurboConfig` emitted `shell#dev dependsOn mfe#dev`, which
   Turbo 2.x rejects** (persistent tasks cannot be depended on). Now uses
   `with` (Turbo ≥ 2.4).

3. **`packages/kit/README.md` showed APIs that don't exist** (`mfkitVite`,
   `defaultHealing`). Rewritten against the real surface. Docs drift is the
   first thing an evaluating adopter hits.

## Fixed in the hardening pass (2026-07-13)

4. **Remote CSS never reaches the shell.** A Svelte MFE's `<style>` block is
   extracted to a CSS asset referenced only by the remote's own index.html;
   federated consumers render it unstyled. Fixed with a kit-owned
   `css-injected-by-js` Vite plugin (`src/vite/css-inject.ts`), on by default
   for `mfkitMFE` builds: the emitted CSS is folded into the remote's entry
   chunks as an idempotent, non-throwing `<style>` injection and the orphaned
   asset is dropped. Opt out with `mfkitMFE(config, name, { injectCss: false })`
   when the host owns all styling. Dev was never affected (Vite serves styles
   over the module graph). The example's e2e now asserts computed styles on the
   clock so this can't regress silently.

5. **Default expose map assumes `./src/lifecycle.ts`.** A React MFE's
   lifecycle is naturally `.tsx`, so the kit default silently pointed at a
   nonexistent file and the build failed inside the MF plugin, not with an
   MFKit error. Fixed: when `exposes` is omitted, kit probes
   `./src/lifecycle.{ts,tsx,mts,js,jsx,mjs}` and exposes the first hit; if
   none exists it throws an actionable `MFKitConfigError` naming the
   candidates. User-supplied `exposes` is never probed (invariant 4).
   The probe checks both `cwd` and `cwd + entry.path` — vite runs per-app
   (cwd *is* the MFE dir) while tooling runs from the workspace root, and the
   manifest path is root-relative in both cases.

6. **Dev startup noise:** `Failed to resolve dependency:
   @module-federation/dts-plugin/dynamic-remote-type-hints-plugin, present in
   client 'optimizeDeps.include'` on every shell dev boot. Fixed by passing
   `dts: false` to the MF plugin in generated configs — kit owns remote type
   generation via `@mfkit/kit/types`, so the plugin's dts machinery was
   redundant work that only produced a scary log line.

7. **`MFKitProvider` re-creates its context when `entries` is an inline
   array** (new identity every render → outlets remount in hosts that
   re-render above the provider). Fixed with `createEntriesCache()` — a pure,
   per-provider cache that keys the derived entry map on *content* rather than
   identity, so `entries={[...]}` inline is now safe. The same pass fixed a
   latent bug alongside it: the default quarantine registry and healing
   strategy were constructed *inside* the memo, so any memo invalidation
   (which, with an inline `entries` array, meant every render) handed out a
   fresh registry and silently reset failure counts — an MFE could never
   actually reach its quarantine threshold. Both are now created once per
   provider instance.

## Open — feed into the hardening pass

_(none — see the list above)_

## Validated (worked first try)

- `defineConfig` cross-field validation and aggregated error reporting.
- Port auto-assignment + shell port default + the `[mfkit] … inferred
  defaults` log — exactly the right visibility.
- `defineMFE` contract with React 18 `createRoot` and Svelte 5
  `mount`/`unmount`; StrictMode double-mount handled by the outlet
  controller.
- `<MFKitProvider>`/`<MFKitOutlet>` with injected `loadRemote`; custom
  `errorFallback` slot; `data-mfkit-state` attributes (great for e2e hooks).
- `writeRemoteTypes` (unchanged-skip works) and typed federated imports.
- Subpath isolation: the Svelte MFE never installs React.
