# examples/minimal

The smallest complete MFKit app: a React shell hosting two federated MFEs —
one React, one Svelte. This is the repo's living smoke test (it runs in CI)
and the "second consumer" that keeps the kit honest beyond DevNexus.

```
mfkit.config.ts   ← single source of truth for everything below
shell/            ← React host; <MFKitProvider> + <MFKitOutlet> per MFE
mfe-hello/        ← React MFE  (port 5175, route /hello)
mfe-clock/        ← Svelte MFE (port 5176, route /clock)
scripts/          ← gen (codegen), smoke (HTTP), e2e (headless Chrome)
.mfkit/generated/ ← derived artifacts: remotes.d.ts + turbo.json (committed, readable)
```

## Run it

From the repo root:

```sh
pnpm install
pnpm build          # builds @mfkit/* then the three apps
cd examples/minimal
pnpm dev            # all three dev servers → shell on http://localhost:3000
```

Production-style check: `pnpm build` (root) then `pnpm smoke` and `pnpm e2e`
here — both boot `vite preview` for all three apps; e2e drives headless
Chrome and asserts each outlet reaches `data-mfkit-state="mounted"`.

## How the pieces connect

**One manifest.** `mfkit.config.ts` declares the shell and both MFEs (name,
framework, route, port). Everything else derives from it:

- Each app's `vite.config.ts` is 3 lines: `mfkitShell(config, …)` or
  `mfkitMFE(config, "<name>", …)`. Framework plugins, Module Federation
  wiring, ports, and shared singletons all come from the manifest + adapter.
- `pnpm gen` regenerates `.mfkit/generated/remotes.d.ts` (typed
  `import("mfe_hello/lifecycle")` in the shell) and `turbo.json` (a
  `shell#dev` task that starts every MFE dev server `with` it).
- Anything the kit inferred (the shell's port 3000, mfe_clock's expose map)
  is logged once at dev startup — look for `[mfkit] … inferred defaults`.

**Each MFE exposes one thing.** `src/lifecycle.ts(x)` default-exports
`defineMFE({ mount, unmount })`. React uses `createRoot`, Svelte 5 uses
`mount`/`unmount` — the contract doesn't care. Every MFE also runs standalone
(`pnpm dev` inside its folder) via a tiny harness in `src/main.ts(x)`.

**The shell injects the loader.** `@mfkit/kit` has no hard dependency on a
Module Federation runtime. `shell/src/App.tsx` maps federated ids to static
`import()` calls (rewritten by `@module-federation/vite`) and hands that to
`<MFKitProvider loadRemote={…}>`. Outlets get retry/quarantine/error slots
from the kit's forgiving healing strategy; the clock outlet shows a custom
`errorFallback`.

## Known rough edge

The Svelte MFE's `<style>` block is extracted into a CSS asset that federated
consumers don't load — its markup arrives unstyled in the shell (the React
MFE uses inline styles, which travel with the JS). Kit-level remote-CSS
delivery is tracked for the hardening pass; until then, style federated
Svelte MFEs with inline styles or ship CSS-in-JS.
