// @mfkit/kit/healing — runtime self-healing primitives.
//
// All behavior routes through the HealingStrategy contract in
// @mfkit/plugin-api so enterprises can swap forgiving defaults for a
// stricter strategy without touching the runner, outlet, or version check.
//
// Surface:
//   - forgivingStrategy / strictStrategy   default strategy factories
//   - resolveHealingStrategy(config)       config.healing ?? forgivingStrategy()
//   - createQuarantineRegistry             shared "give-up" state per MFE
//   - runWithHealing                       orchestrator used by the outlet
//   - checkSingletonVersion                version-skew gate
//   - createManifestCache                  last-known-good fallback
//   - createFederationLoader               MF-runtime loadRemote whose retries refetch

import type { HealingStrategy, MFKitConfig } from "@mfkit/plugin-api";

import { forgivingStrategy } from "./healing/strategies.js";

export {
  createFederationLoader,
  type FederationRemoteLike,
  type FederationRuntimeLike,
} from "./healing/federation-loader.js";
export {
  createManifestCache,
  type ManifestCache,
  type ManifestCacheOptions,
  type ManifestLoadResult,
  type ManifestStorage,
  memoryManifestStorage,
} from "./healing/manifest-cache.js";

export {
  createQuarantineRegistry,
  type QuarantineRecord,
  type QuarantineRegistry,
} from "./healing/quarantine.js";

export {
  type HealingOpKind,
  MFEHealingError,
  MFEQuarantinedError,
  type RunWithHealingOptions,
  runWithHealing,
} from "./healing/runner.js";
export {
  type ForgivingStrategyOptions,
  forgivingStrategy,
  type StrictStrategyOptions,
  strictStrategy,
} from "./healing/strategies.js";
export {
  checkSingletonVersion,
  SingletonVersionError,
} from "./healing/version.js";

/**
 * The strategy a consumer's config declares: `config.healing`, else the last
 * plugin that supplies one (later plugins win), else `forgivingStrategy()`.
 * Same precedence as `resolveConfig`, but synchronous and dependency-free so
 * a browser shell can call it on the manifest it imports.
 */
export function resolveHealingStrategy(config: MFKitConfig): HealingStrategy {
  if (config.healing) return config.healing;
  const plugins = config.plugins ?? [];
  for (let i = plugins.length - 1; i >= 0; i--) {
    const h = plugins[i]?.healing;
    if (h) return h;
  }
  return forgivingStrategy();
}
