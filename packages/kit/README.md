# @mfkit/kit

The MFKit runtime: Vite config generation, the lifecycle contract,
self-healing primitives, and the React `<MFKitOutlet>`.

Subpath imports keep framework-specific code lazy:

```ts
import { defineConfig, defineMFE }        from "@mfkit/kit";
import { mfkitShell, mfkitMFE }           from "@mfkit/kit/vite";
import { MFKitOutlet, MFKitProvider }     from "@mfkit/kit/react";
import { forgivingStrategy, runWithHealing } from "@mfkit/kit/healing";
import { generateTurboConfig }            from "@mfkit/kit/turbo";
import { generateRemoteTypes, writeRemoteTypes } from "@mfkit/kit/types";
```

A complete working consumer (React shell + React MFE + Svelte MFE, one
manifest driving everything) lives in
[`examples/minimal`](../../examples/minimal) — start there.

## Things worth knowing

**Exposes are inferred by probing.** Omit `exposes` on an MFE and kit looks for
`./src/lifecycle.{ts,tsx,mts,js,jsx,mjs}`, exposing the first hit as
`./lifecycle`. Supply `exposes` yourself and kit never touches the filesystem —
your value always wins.

**Remote CSS is inlined into the remote entry.** A built MFE's styles would
otherwise be stranded in a CSS asset that only the remote's own `index.html`
references, so the MFE renders unstyled inside a shell. `mfkitMFE` folds them
into the entry chunks instead. Opt out when the host owns all styling:

```ts
mfkitMFE(config, "mfe_clock", { injectCss: false });
```

**Load remotes at runtime, through `createFederationLoader`.** In the shell,
`import("mfe_x/lifecycle")` makes `@module-federation/vite` preload every
remote before the app starts, so one remote outage blanks the whole shell.
Use the MF runtime instead, wrapped so that retries really refetch (the
runtime caches failed loads):

```ts
import { createFederationLoader } from "@mfkit/kit/healing";
import * as federationRuntime from "@module-federation/runtime";

<MFKitProvider loadRemote={createFederationLoader(federationRuntime)} config={config}>
```

**Inline `entries={[...]}` and `props={{...}}` are safe.** The entry map is keyed
on content and outlet props are compared shallowly, so a re-render above the
outlet won't remount your MFEs.

Status: alpha. Phase 1 surface is complete; validated by DevNexus and the
minimal example.
