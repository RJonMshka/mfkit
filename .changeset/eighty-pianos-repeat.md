---
"@mfkit/kit": patch
---

Hardening pass against the remaining `examples/minimal` DX findings.

- **Remote CSS now reaches the shell.** A built MFE's styles were extracted to
  a CSS asset referenced only by the remote's own `index.html` — which a
  federated host never loads — so every remote rendered unstyled in the shell
  while looking correct standalone. `mfkitMFE` now folds the emitted CSS into
  the remote's entry chunks as an idempotent `<style>` injection. Opt out with
  `mfkitMFE(config, name, { injectCss: false })` when the host owns all
  styling. Dev was unaffected.
- **`exposes` is inferred by probing the filesystem.** Kit hardcoded
  `./src/lifecycle.ts`, so a React MFE (whose lifecycle is naturally `.tsx`)
  failed deep inside the MF plugin with no hint that kit had invented the
  path. Kit now probes `./src/lifecycle.{ts,tsx,mts,js,jsx,mjs}` and throws an
  actionable `MFKitConfigError` when nothing matches. User-supplied `exposes`
  is still never touched.
- **`MFKitProvider` no longer churns its context on an inline `entries`
  array.** The entry map is keyed on content rather than array identity, so a
  re-render above the provider no longer remounts every outlet under it. This
  also fixes a latent bug: the default quarantine registry was re-created on
  memo invalidation, silently resetting failure counts so an MFE could never
  reach its quarantine threshold.
- **Quieter dev boot.** Generated federation configs pass `dts: false`; kit
  owns remote type generation, and the MF plugin's dts machinery only produced
  a failed-to-prebundle warning on every startup.
