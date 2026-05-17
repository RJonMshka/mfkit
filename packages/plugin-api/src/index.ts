/**
 * @mfkit/plugin-api — the stable TypeScript contract surface for MFKit.
 *
 * Every other `@mfkit/*` package implements these types; plugin authors
 * target them. A breaking change here requires a major bump and a codemod.
 *
 * Types only. Zero runtime. Side-effect-free.
 */

export {
  MFKIT_CONFIG_VERSION,
  type FrameworkId,
  type MFEManifestEntry,
  type MFKitConfig,
  type SharedDependency,
  type SharedDependencyMap,
  type ShellConfig,
} from "./manifest.js";

export type { MFEContext, MFEDefinition, MFELifecycle } from "./lifecycle.js";

export type {
  AdapterMode,
  FrameworkAdapter,
  FrameworkAdapterContext,
} from "./framework-adapter.js";

export type { DiscoveryContext, DiscoveryStrategy } from "./discovery.js";

export type {
  HealingContext,
  HealingDecision,
  HealingStrategy,
  VersionMismatchContext,
  VersionMismatchVerdict,
} from "./healing.js";

export type {
  ResolvedTemplate,
  TemplateLocator,
  TemplateLocatorType,
  TemplateResolver,
} from "./templates.js";

export type { MFKitPlugin } from "./plugin.js";

export type { MFKitOutletPropsBase } from "./outlet.js";
