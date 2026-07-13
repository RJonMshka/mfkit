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

Status: alpha. Phase 1 surface is complete; validated by DevNexus and the
minimal example.
