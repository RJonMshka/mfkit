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

**`<MFKitProvider entries={[...]} />` inline is safe.** The entry map is keyed
on content, not array identity, so a re-render above the provider won't remount
your MFEs.

Status: alpha. Phase 1 surface is complete; validated by DevNexus and the
minimal example.
