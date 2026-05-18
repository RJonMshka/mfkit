// @mfkit/codemods/registry — the version-manifest format and the in-memory
// codemod registry. The shape is locked in Phase 1 (Step 10) so v0.1 → v0.2
// migrations can register against a stable contract when they land in v0.3+.
//
// Design: each codemod migrates a single MFKIT_CONFIG_VERSION step (n → n+1).
// Multi-step jumps compose by chaining single-step codemods, which keeps each
// migration small, auditable, and individually testable. The planner walks
// from→to one step at a time and refuses to plan a path with a gap or with
// two codemods covering the same step.

/**
 * A single MFKit upgrade. Each codemod migrates one schema version forward.
 *
 * `fromVersion`/`toVersion` correspond to `MFKitConfig.version` (the constant
 * `MFKIT_CONFIG_VERSION` re-exported from `@mfkit/plugin-api`). Codemods
 * dispatch on this number; the planner refuses any manifest whose
 * `toVersion !== fromVersion + 1`.
 */
export interface CodemodManifest {
  /** Unique slug. Kebab-case, e.g. `"config-v1-to-v2-rename-shared"`. */
  readonly id: string;
  /** One-line description shown by `mfkit-migrate list`. */
  readonly description: string;
  /** Schema version this codemod migrates from. */
  readonly fromVersion: number;
  /** Schema version this codemod produces. Must equal `fromVersion + 1`. */
  readonly toVersion: number;
  /** Run the migration. Side-effecting when `ctx.dryRun === false`. */
  apply(ctx: MigrationContext): Promise<MigrationResult> | MigrationResult;
}

/**
 * Execution context handed to every codemod. The codemod is responsible for
 * resolving paths relative to `cwd`, respecting `dryRun`, and emitting
 * progress through `logger` rather than calling `console` directly.
 */
export interface MigrationContext {
  /** Absolute path to the consumer project root. */
  readonly cwd: string;
  /** When true, no files may be written. The codemod still reports what *would* change. */
  readonly dryRun: boolean;
  /** Logger sink. Defaults to a console adapter in the CLI; tests pass a capturing logger. */
  readonly logger: MigrationLogger;
}

export interface MigrationLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

/**
 * Structured outcome of one codemod run. `filesChanged` is the canonical
 * record consumers diff against; on dry runs it lists files that *would* be
 * written so a downstream UI can preview the change.
 */
export interface MigrationResult {
  /** Codemod id that produced this result. */
  readonly id: string;
  /** Workspace-relative paths touched (or that would be touched on dry runs). */
  readonly filesChanged: readonly string[];
  /** Optional human-readable notes (deprecations, manual follow-ups, etc.). */
  readonly notes?: readonly string[];
}

/** Thrown by `registerCodemod` and `planMigration` on contract violations. */
export class CodemodRegistryError extends Error {
  override readonly name = "CodemodRegistryError";
}

// ─── Internal state ──────────────────────────────────────────────────────────
// Module-level registry. One process, one registry — matches how plugin
// ecosystems usually work and keeps the CLI dependency-free. Tests reset
// via `__resetRegistry()`.

const registry = new Map<string, CodemodManifest>();

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Register a codemod. Throws if `id` is already registered, if the version
 * step is not exactly one, or if either version is not a non-negative integer.
 *
 * Re-registering the same manifest object (reference-equal) under the same id
 * is a no-op — keeps hot-reload friendly without silently overwriting on
 * genuine duplicates.
 */
export function registerCodemod(manifest: CodemodManifest): void {
  validateManifest(manifest);

  const existing = registry.get(manifest.id);
  if (existing) {
    if (existing === manifest) return;
    throw new CodemodRegistryError(
      `Codemod "${manifest.id}" is already registered with a different definition.`,
    );
  }
  registry.set(manifest.id, manifest);
}

/** Snapshot of all registered codemods, ordered by `fromVersion` then `id`. */
export function listCodemods(): readonly CodemodManifest[] {
  return [...registry.values()].sort((a, b) => {
    if (a.fromVersion !== b.fromVersion) return a.fromVersion - b.fromVersion;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Compute the ordered codemod sequence to migrate from `from` to `to`.
 *
 * Returns `[]` when `from === to`. Throws when `from > to` (downgrade), when
 * any step has no registered codemod (gap), or when two codemods cover the
 * same step (ambiguous — the registry refuses to pick winners silently).
 */
export function planMigration(
  from: number,
  to: number,
): readonly CodemodManifest[] {
  if (!Number.isInteger(from) || from < 0) {
    throw new CodemodRegistryError(
      `planMigration: from must be a non-negative integer, got ${from}`,
    );
  }
  if (!Number.isInteger(to) || to < 0) {
    throw new CodemodRegistryError(
      `planMigration: to must be a non-negative integer, got ${to}`,
    );
  }
  if (from > to) {
    throw new CodemodRegistryError(
      `planMigration: downgrade not supported (from=${from}, to=${to}).`,
    );
  }
  if (from === to) return [];

  const all = [...registry.values()];
  const plan: CodemodManifest[] = [];

  for (let v = from; v < to; v++) {
    const matches = all.filter(
      (c) => c.fromVersion === v && c.toVersion === v + 1,
    );
    if (matches.length === 0) {
      throw new CodemodRegistryError(
        `planMigration: no codemod registered for v${v} → v${v + 1}.`,
      );
    }
    if (matches.length > 1) {
      const ids = matches.map((c) => `"${c.id}"`).join(", ");
      throw new CodemodRegistryError(
        `planMigration: ambiguous step v${v} → v${v + 1} (multiple codemods: ${ids}).`,
      );
    }
    plan.push(matches[0]!);
  }
  return plan;
}

/**
 * Test-only escape hatch. Clears the module-level registry so a test suite
 * can start from a known state. Not part of the public contract — name is
 * double-underscored to signal that.
 */
export function __resetRegistry(): void {
  registry.clear();
}

// ─── Internals ───────────────────────────────────────────────────────────────

function validateManifest(manifest: CodemodManifest): void {
  if (!manifest || typeof manifest !== "object") {
    throw new CodemodRegistryError(
      "registerCodemod: manifest must be an object.",
    );
  }
  if (typeof manifest.id !== "string" || manifest.id.length === 0) {
    throw new CodemodRegistryError(
      "registerCodemod: manifest.id must be a non-empty string.",
    );
  }
  if (typeof manifest.description !== "string") {
    throw new CodemodRegistryError(
      `registerCodemod: ${manifest.id} is missing a description.`,
    );
  }
  if (
    !Number.isInteger(manifest.fromVersion) ||
    manifest.fromVersion < 0 ||
    !Number.isInteger(manifest.toVersion) ||
    manifest.toVersion < 0
  ) {
    throw new CodemodRegistryError(
      `registerCodemod: ${manifest.id} has non-integer or negative version fields.`,
    );
  }
  if (manifest.toVersion !== manifest.fromVersion + 1) {
    throw new CodemodRegistryError(
      `registerCodemod: ${manifest.id} must migrate a single version step ` +
        `(got from=${manifest.fromVersion}, to=${manifest.toVersion}). ` +
        `Compose multi-step jumps by registering separate codemods.`,
    );
  }
  if (typeof manifest.apply !== "function") {
    throw new CodemodRegistryError(
      `registerCodemod: ${manifest.id}.apply must be a function.`,
    );
  }
}
