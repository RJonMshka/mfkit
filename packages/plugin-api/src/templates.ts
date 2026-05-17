/**
 * Template resolver contract.
 *
 * Templates are how `create-mfkit` and `mfkit add mfe` materialize a new
 * MFE's source tree. Resolvers support multiple sources — npm-published
 * packages tagged `mfkit-template`, git repos, and local paths — so internal
 * teams can ship private templates without publishing.
 *
 * Phase 2 (CLI) is the consumer of these types. Plugin-api defines the
 * contract now so plugin authors can target a stable surface.
 */

import type { FrameworkId } from "./manifest.js";

export type TemplateLocatorType = "npm" | "git" | "local";

export interface TemplateLocator {
  readonly type: TemplateLocatorType;
  /** Package name, git URL, or filesystem path. */
  readonly source: string;
  /** Tag, branch, commit, or version. Resolver-specific. */
  readonly ref?: string;
}

export interface ResolvedTemplate {
  readonly id: string;
  readonly framework: FrameworkId;
  readonly version: string;
  /** Absolute path to the materialized template root. */
  readonly rootDir: string;
  /** Arbitrary template-supplied metadata (e.g. post-install hints). */
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface TemplateResolver {
  readonly id: string;
  /** Quick predicate so the CLI can pick the right resolver. */
  readonly canResolve: (locator: TemplateLocator) => boolean;
  /** Materialize the template to disk and report what was produced. */
  readonly resolve: (locator: TemplateLocator) => Promise<ResolvedTemplate>;
}
