/**
 * Outlet contract — framework-agnostic props shared by every host-side outlet
 * implementation (React's `<MFKitOutlet>`, future Vue/Svelte/etc.).
 *
 * Framework-specific subtypes (e.g. `MFKitOutletProps` in `@mfkit/kit/react`)
 * extend this base with framework-native fallback types (`ReactNode`, etc.).
 * Keeping the base agnostic means plugin-api never depends on a UI framework.
 */

import type { HealingStrategy } from "./healing.js";

export interface MFKitOutletPropsBase {
  /** MF remote name to load, e.g. `"mfe_metrics"`. */
  readonly remote: string;
  /** Exposed module path, defaults to `"lifecycle"`. */
  readonly module?: string;
  /** Route prefix passed to the MFE's `MFEContext.basePath`. */
  readonly basePath?: string;
  /** Arbitrary props forwarded to the MFE's `mount(el, ctx, props)`. */
  readonly props?: Readonly<Record<string, unknown>>;
  /** Override the host-default healing strategy for this single outlet. */
  readonly healing?: HealingStrategy;
  /** Fires once the MFE reports `mount` resolved successfully. */
  readonly onMount?: () => void;
  /** Fires when `unmount` resolves. */
  readonly onUnmount?: () => void;
  /** Fires on any error — load, mount, or version mismatch. */
  readonly onError?: (err: Error) => void;
}
