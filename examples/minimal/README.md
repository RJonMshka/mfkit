# examples/minimal

The smallest complete MFKit app: a React shell hosting four federated MFEs,
one each in React, Svelte, Vue, and Lit. This is the repo's living test bed. CI
runs it in production *and* dev mode, and breaks its remotes on purpose to
prove the self-healing works.

```
mfkit.config.ts   ← single source of truth for everything below
shell/            ← React 19 host; <MFKitProvider config> + <MFKitOutlet> per MFE
mfe-hello/        ← React MFE  (port 5175, route /hello)
mfe-clock/        ← Svelte MFE (port 5176, route /clock)
mfe-vue/          ← Vue MFE    (port 5177, route /vue)
mfe-lit/          ← Lit MFE    (port 5178, route /lit)
scripts/          ← gen, smoke (HTTP), e2e (headless Chrome), faults (outages)
.mfkit/generated/ ← derived artifacts: remotes.d.ts + turbo.json (committed; CI checks they're fresh)
```

## Run it

From the repo root:

```sh
pnpm install
pnpm build          # builds @mfkit/* then every app
cd examples/minimal
pnpm dev            # all dev servers → shell on http://localhost:3000
```

Checks (run from this folder after a root `pnpm build`):

| Script | What it proves |
|---|---|
| `pnpm smoke` | every app's production build serves |
| `pnpm e2e` | all four outlets mount, receive props/`basePath`, are interactive and **styled inside the shell**, including under a strict `style-src 'nonce-…'` CSP |
| `pnpm e2e:dev` | the same against Vite dev servers |
| `pnpm faults` | with a remote broken at the network layer, the shell keeps working. Covers hard outage → quarantine, transient → recovers, slow → loading slot, `mount` throws, strict strategy, and "Try again" recovery |

## How the pieces connect

**One manifest.** `mfkit.config.ts` declares the shell and every MFE (name,
framework, route, port). Everything else derives from it:

- Each app's `vite.config.ts` is three lines: `mfkitShell(config, …)` or
  `mfkitMFE(config, "<name>", …)`. Framework plugins, Module Federation
  wiring, ports, and shared singletons come from the manifest + adapter.
- `pnpm gen` regenerates `.mfkit/generated/remotes.d.ts` (federated module
  types) and `turbo.json` (a `shell#dev` task that starts every MFE dev
  server `with` it).
- Anything the kit inferred (the shell's port 3000, each MFE's expose map,
  including `mfe_hello`'s `.tsx` lifecycle) is logged once at dev startup.
  Look for `[mfkit] … inferred defaults`.

**Each MFE exposes one thing.** `src/lifecycle.ts(x)` default-exports
`defineMFE({ mount, unmount })`. React uses `createRoot`, Svelte 5
`mount`/`unmount`, Vue `createApp`, Lit a custom element. The contract doesn't
care. Every MFE also runs standalone (`pnpm dev` inside its folder).

**Styles travel with the remote.** Svelte `<style>` blocks and Vue scoped
styles are folded into each remote's entry by kit's CSS injection, picking
up the host's CSP nonce from `<meta property="csp-nonce">`. Lit styles live
in the element's shadow root. React here uses inline styles.

**The shell loads remotes at runtime, through the kit.** `shell/src/App.tsx`
wraps `@module-federation/runtime` in `createFederationLoader` and passes it
to `<MFKitProvider loadRemote={…} config={config}>`. Two details matter:

- Remotes are *never* imported by specifier (`import("mfe_x/lifecycle")`) in
  the shell. `@module-federation/vite` would preload them all before the app
  starts, and one outage would blank the shell.
- `createFederationLoader` makes retries refetch. The MF runtime caches
  failed loads, so without it "retry" replays the first failure.

Healing comes from the config (the forgiving default here). Open
`http://localhost:3000/?mfkit-strategy=strict` to see the fail-fast strategy.
The clock outlet shows a custom `errorFallback` slot.
