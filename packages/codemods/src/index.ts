// @mfkit/codemods — public surface.
//
// Phase 1 (Step 10) ships the version-manifest format and registry only.
// Zero codemods are registered; the first real migration lands in v0.3+
// when there is a v0.1 → v0.2 schema change to author.

export {
  __resetRegistry,
  type CodemodManifest,
  CodemodRegistryError,
  listCodemods,
  type MigrationContext,
  type MigrationLogger,
  type MigrationResult,
  planMigration,
  registerCodemod,
} from "./registry.js";
