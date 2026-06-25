// React-side outlet types.
//
// Extends the framework-agnostic MFKitOutletPropsBase from @mfkit/plugin-api
// with React-native slot types. The base lives in plugin-api so future
// Vue/Svelte outlets share the same prop names without dragging React in.

import type { HealingStrategy, MFEManifestEntry, MFKitOutletPropsBase } from "@mfkit/plugin-api";
import type { ReactNode } from "react";

import type { QuarantineRegistry } from "../healing/quarantine.js";

/**
 * Function the outlet calls to fetch a remote module. Consumers inject this
 * (typically `loadRemote` from `@module-federation/enhanced/runtime`) so the
 * kit does not hard-depend on a specific MF runtime. The argument is the
 * canonical `${remote}/${module}` ID.
 */
export type LoadRemote = (id: string) => Promise<unknown>;

/** Reactive state surfaced by the outlet controller. */
export type OutletState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading"; readonly attempt: number }
  | {
      readonly kind: "retrying";
      readonly attempt: number;
      readonly nextDelayMs: number;
      readonly error: Error;
    }
  | { readonly kind: "mounted" }
  | { readonly kind: "quarantined"; readonly reason: string }
  | { readonly kind: "error"; readonly error: Error };

export interface LoadingSlotInfo {
  readonly entry: MFEManifestEntry;
  readonly attempt: number;
}

export interface RetryingSlotInfo {
  readonly entry: MFEManifestEntry;
  readonly attempt: number;
  readonly nextDelayMs: number;
  readonly error: Error;
}

export interface ErrorSlotInfo {
  readonly entry: MFEManifestEntry;
  readonly error: Error;
  /** Re-runs the load → mount cycle. */
  readonly retry: () => void;
}

export interface QuarantinedSlotInfo {
  readonly entry: MFEManifestEntry;
  readonly reason: string;
  /** Lifts the quarantine record (if a registry is in play) and retries. */
  readonly retry: () => void;
}

type Slot<Info> = ReactNode | ((info: Info) => ReactNode);

export interface MFKitOutletProps extends MFKitOutletPropsBase {
  /** Override the provider's loader. Required if no provider is in scope. */
  readonly loadRemote?: LoadRemote;
  /** Override the provider's quarantine registry. */
  readonly quarantineRegistry?: QuarantineRegistry;
  /** Override the provider's default strategy. */
  readonly healing?: HealingStrategy;
  /**
   * Full manifest entry. When omitted, the outlet looks the entry up by
   * `remote` from the provider's manifest, else synthesizes a minimal entry.
   */
  readonly entry?: MFEManifestEntry;
  /** Slot rendered while the MFE is loading or pre-mount. */
  readonly loadingFallback?: Slot<LoadingSlotInfo>;
  /** Slot rendered between retries. Defaults to the loading slot. */
  readonly retryingFallback?: Slot<RetryingSlotInfo>;
  /** Slot rendered when the strategy chose `{ action: "fail" }`. */
  readonly errorFallback?: Slot<ErrorSlotInfo>;
  /** Slot rendered once the MFE is quarantined. */
  readonly quarantinedFallback?: Slot<QuarantinedSlotInfo>;
  /** Class applied to the outer container. */
  readonly className?: string;
}
