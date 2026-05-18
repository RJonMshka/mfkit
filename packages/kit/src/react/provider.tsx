// MFKitProvider — supplies the outlet with the things every MFE needs:
// a remote loader, a default healing strategy, and a shared quarantine
// registry. Outlets read these via context; each can override per-instance.

import { createContext, useContext, useMemo, type ReactElement, type ReactNode } from "react";

import type {
  HealingStrategy,
  MFEManifestEntry,
} from "@mfkit/plugin-api";

import { forgivingStrategy } from "../healing/strategies.js";
import {
  createQuarantineRegistry,
  type QuarantineRegistry,
} from "../healing/quarantine.js";

import type { LoadRemote } from "./types.js";

export interface MFKitProviderValue {
  readonly loadRemote: LoadRemote;
  readonly strategy: HealingStrategy;
  readonly registry: QuarantineRegistry;
  readonly entries: ReadonlyMap<string, MFEManifestEntry>;
}

const Context = createContext<MFKitProviderValue | null>(null);

export interface MFKitProviderProps {
  /** Resolver for federation remotes — typically `loadRemote` from the MF runtime. */
  readonly loadRemote: LoadRemote;
  /** Host-wide default healing strategy. Defaults to `forgivingStrategy()`. */
  readonly strategy?: HealingStrategy;
  /** Shared quarantine registry. Defaults to a fresh in-memory registry. */
  readonly registry?: QuarantineRegistry;
  /**
   * Manifest entries the provider knows about, used by outlets to resolve
   * `entry` from a `remote` prop. When omitted, outlets synthesize entries.
   */
  readonly entries?: readonly MFEManifestEntry[];
  readonly children: ReactNode;
}

export function MFKitProvider(props: MFKitProviderProps): ReactElement {
  const value = useMemo<MFKitProviderValue>(() => {
    const entries = new Map<string, MFEManifestEntry>();
    for (const e of props.entries ?? []) entries.set(e.name, e);
    return {
      loadRemote: props.loadRemote,
      strategy: props.strategy ?? forgivingStrategy(),
      registry: props.registry ?? createQuarantineRegistry(),
      entries,
    };
  }, [props.loadRemote, props.strategy, props.registry, props.entries]);

  return <Context.Provider value={value}>{props.children}</Context.Provider>;
}

/** Read the active provider value, or `null` when none is in scope. */
export function useMFKitContext(): MFKitProviderValue | null {
  return useContext(Context);
}
