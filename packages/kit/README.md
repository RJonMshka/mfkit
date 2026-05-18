# @mfkit/kit

The MFKit runtime: Vite config generation, the lifecycle contract,
self-healing primitives, and the React `<MFKitOutlet>`.

Subpath imports keep framework-specific code lazy:

```ts
import { defineConfig, defineMFE } from "@mfkit/kit";
import { mfkitVite }              from "@mfkit/kit/vite";
import { MFKitOutlet }            from "@mfkit/kit/react";
import { defaultHealing }         from "@mfkit/kit/healing";
import { generateTurboConfig }    from "@mfkit/kit/turbo";
import { generateRemoteTypes }    from "@mfkit/kit/types";
```

Status: alpha. Phase 1 fills each entry across Steps 2 / 4 / 6 / 7.
