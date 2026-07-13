// MFKitProvider — supplies the outlet with the things every MFE needs:
// a remote loader, a default healing strategy, and a shared quarantine
// registry. Outlets read these via context; each can override per-instance.

import type { HealingStrategy, MFEManifestEntry } from "@mfkit/plugin-api";
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import { createQuarantineRegistry, type QuarantineRegistry } from "../healing/quarantine.js";
import { forgivingStrategy } from "../healing/strategies.js";
import { createEntriesCache } from "./entries-cache.js";

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
  // Defaults are created once per provider instance, not per render. A fresh
  // quarantine registry each render would silently reset failure counts, so an
  // MFE would never actually reach its quarantine threshold.
  const [fallbackStrategy] = useState(forgivingStrategy);
  const [fallbackRegistry] = useState(createQuarantineRegistry);
  const [resolveEntries] = useState(createEntriesCache);

  const strategy = props.strategy ?? fallbackStrategy;
  const registry = props.registry ?? fallbackRegistry;
  const entries = resolveEntries(props.entries);

  const value = useMemo<MFKitProviderValue>(
    () => ({ loadRemote: props.loadRemote, strategy, registry, entries }),
    [props.loadRemote, strategy, registry, entries],
  );

  return <Context.Provider value={value}>{props.children}</Context.Provider>;
}

/** Read the active provider value, or `null` when none is in scope. */
export function useMFKitContext(): MFKitProviderValue | null {
  return useContext(Context);
}
