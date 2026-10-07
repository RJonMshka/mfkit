## What & why

<!-- One or two sentences. Link the issue: "Fixes #123". -->

## How it was verified

<!-- Commands you ran and what you saw. For runtime changes, say whether you ran the example e2e. -->

## Checklist

- [ ] `pnpm lint && pnpm typecheck && pnpm build && pnpm test` pass locally
- [ ] Bug fixes include a regression test that fails without the fix
- [ ] User-visible change has a changeset (`pnpm changeset`) — not needed for docs/CI/tests only
- [ ] Touches `packages/plugin-api`? It stays types-only, and any breaking change bumps `MFKIT_CONFIG_VERSION` with a codemod plan
- [ ] Touches a `@mfkit/kit` subpath? No new hard dependency on an optional peer (`tests/vite/subpath-isolation.test.ts` passes)
- [ ] Docs updated (`README`, `docs/integration-guide.md`, or the package README) if behavior or API changed
