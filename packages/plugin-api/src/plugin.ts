/**
 * MFKit plugin contract — the top-level extension point.
 *
 * A plugin is a bag of optional contributions to any of the pluggable
 * surfaces. Plugins are applied in manifest order; later plugins can override
 * earlier ones for surfaces that take a single value (e.g. `healing`).
 *
 * Conceptually: plugins are the "if you ever need to do this without forking
 * MFKit, here's where you do it" escape hatch.
 */

import type { DiscoveryStrategy } from "./discovery.js";
import type { FrameworkAdapter } from "./framework-adapter.js";
import type { HealingStrategy } from "./healing.js";
import type { MFKitConfig } from "./manifest.js";
import type { TemplateResolver } from "./templates.js";

export interface MFKitPlugin {
  readonly name: string;
  readonly version?: string;
  /** Framework adapters this plugin contributes. */
  readonly frameworkAdapters?: readonly FrameworkAdapter[];
  /** Discovery strategy this plugin contributes. */
  readonly discovery?: DiscoveryStrategy;
  /** Healing strategy override supplied by this plugin. */
  readonly healing?: HealingStrategy;
  /** Template resolvers this plugin registers with the CLI. */
  readonly templateResolvers?: readonly TemplateResolver[];
  /**
   * One-shot setup hook. Runs once after the resolved config is finalized
   * but before MFKit starts using it. Useful for side-effecting registration
   * (e.g. injecting OpenTelemetry hooks).
   */
  readonly setup?: (config: MFKitConfig) => void | Promise<void>;
}
