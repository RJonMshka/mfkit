# Changesets

Each meaningful change to `@mfkit/*` packages gets a markdown file here
describing the change and the semver bump (`patch`, `minor`, `major`).

Run `pnpm changeset` to create one interactively. `pnpm version-packages`
consumes them to bump versions and write CHANGELOGs.

During Phase 1 (alpha), every change is `patch` against `0.0.x` until the
plugin API stabilizes.
