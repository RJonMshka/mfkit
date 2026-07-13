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

## Open — feed into the hardening pass

4. **Remote CSS never reaches the shell.** A Svelte MFE's `<style>` block is
   extracted to a CSS asset referenced only by the remote's own index.html;
   federated consumers render it unstyled. Needs a kit-level answer: CSS
   injected via JS for MFE builds (e.g. `emitCss: false` in the Svelte
   adapter, or a css-injected-by-js plugin in `mfkitMFE`), or at minimum loud
   documentation. Affects Vue SFC styles and any imported CSS in React MFEs
   too — verify each adapter.

5. **Default expose map assumes `./src/lifecycle.ts`.** A React MFE's
   lifecycle is naturally `.tsx`, so the kit default silently points at a
   nonexistent file and the build fails inside the MF plugin, not with an
   MFKit error. Candidates: probe for `lifecycle.{ts,tsx,js}` at generation
   time, or fail fast with an actionable `MFKitConfigError`.

6. **Dev startup noise:** `Failed to resolve dependency:
   @module-federation/dts-plugin/dynamic-remote-type-hints-plugin, present in
   client 'optimizeDeps.include'` on every shell dev boot. Comes from the MF
   vite plugin's dts machinery; kit already owns type generation. Either
   disable the plugin's dts feature in generated configs or document the
   warning as harmless.

7. **`MFKitProvider` re-creates its context when `entries` is an inline
   array** (new identity every render → outlets remount in hosts that
   re-render above the provider). The example passes a module-constant
   manifest so it's safe, but a naive consumer writing
   `entries={[...]}` inline would churn. Consider deep-memoizing or
   documenting.

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
