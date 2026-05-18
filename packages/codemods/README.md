# @mfkit/codemods

MFKit's upgrade tooling. Phase 1 ships the version-manifest format, the
in-memory codemod registry, and the `mfkit-migrate` CLI skeleton. Zero
codemods are registered yet — the first real migration lands in v0.3+ when
there is a v0.1 → v0.2 schema change to author.

## CLI

```bash
mfkit-migrate help
mfkit-migrate list
mfkit-migrate plan --from 1 --to 2
mfkit-migrate up   --from 1 --to 2 [--dry-run]
```

With zero registered codemods, `list` reports an empty registry, `plan` and
`up` either say "Nothing to do" (when `--from === --to`) or exit non-zero with
a "no codemod registered for vN → vN+1" message.

## Authoring a codemod (v0.3+ surface)

```ts
import { registerCodemod } from "@mfkit/codemods";

registerCodemod({
  id: "config-v1-to-v2-rename-shared",
  description: "Rename `shared` to `singletons` in mfkit.config.ts.",
  fromVersion: 1,
  toVersion: 2,
  async apply(ctx) {
    // ctx.cwd, ctx.dryRun, ctx.logger
    return { id: "config-v1-to-v2-rename-shared", filesChanged: [] };
  },
});
```

Each codemod migrates exactly one schema-version step (`toVersion ===
fromVersion + 1`). Multi-step jumps compose by registering separate codemods;
the planner walks the chain one step at a time and refuses any path with a gap
or two codemods covering the same step.
