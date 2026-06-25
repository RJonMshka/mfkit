// <MFKitOutlet> — the React-side host for one federated MFE.
//
// Owns a stable mount container, runs the imperative controller against
// `runWithHealing`, and renders the appropriate slot for the live state.
// All MFE-specific behavior (load policy, retry, quarantine) lives in the
// HealingStrategy plumbed through the provider or the `healing` prop.

import type { HealingStrategy, MFEManifestEntry } from "@mfkit/plugin-api";
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createQuarantineRegistry, type QuarantineRegistry } from "../healing/quarantine.js";
import { forgivingStrategy } from "../healing/strategies.js";

import { createOutletController } from "./controller.js";
import {
  DefaultError,
  DefaultLoading,
  DefaultQuarantined,
  DefaultRetrying,
} from "./default-slots.js";
import { MFEErrorBoundary } from "./error-boundary.js";
import { useMFKitContext } from "./provider.js";
import type { MFKitOutletProps, OutletState, RetryingSlotInfo } from "./types.js";

export function MFKitOutlet(props: MFKitOutletProps): ReactElement {
  const ctx = useMFKitContext();

  const loadRemote = props.loadRemote ?? ctx?.loadRemote;
  if (!loadRemote) {
    throw new Error(
      "MFKitOutlet: no `loadRemote` available — supply one via the prop or wrap in <MFKitProvider>.",
    );
  }

  const strategy: HealingStrategy = props.healing ?? ctx?.strategy ?? FALLBACK_STRATEGY;
  const registry: QuarantineRegistry =
    props.quarantineRegistry ?? ctx?.registry ?? FALLBACK_REGISTRY;

  // biome-ignore lint/correctness/useExhaustiveDependencies: resolveEntry uses only props.entry/remote/basePath — all listed; passing props avoids refactoring the helper
  const entry = useMemo<MFEManifestEntry>(
    () => resolveEntry(props, ctx?.entries),
    [props.entry, props.remote, props.basePath, ctx?.entries],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<OutletState>({ kind: "idle" });
  const [retryKey, setRetryKey] = useState(0);

  const retry = useCallback(() => {
    registry.clear(entry.name);
    setRetryKey((k) => k + 1);
  }, [registry, entry.name]);

  // Stable refs so the effect doesn't re-run when callbacks change identity.
  const onMountRef = useRef(props.onMount);
  const onUnmountRef = useRef(props.onUnmount);
  const onErrorRef = useRef(props.onError);
  onMountRef.current = props.onMount;
  onUnmountRef.current = props.onUnmount;
  onErrorRef.current = props.onError;

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryKey is an intentional trigger — incrementing it forces the effect to remount on retry
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const controller = createOutletController({
      container,
      entry,
      loadRemote,
      strategy,
      registry,
      ...(props.basePath !== undefined ? { basePath: props.basePath } : {}),
      ...(props.module !== undefined ? { module: props.module } : {}),
      ...(props.props !== undefined ? { props: props.props } : {}),
      onState: setState,
      onMount: () => onMountRef.current?.(),
      onUnmount: () => onUnmountRef.current?.(),
      onError: (err) => onErrorRef.current?.(err),
    });

    controller.start();

    return () => {
      void controller.stop();
    };
  }, [entry, loadRemote, strategy, registry, props.basePath, props.module, props.props, retryKey]);

  const overlay = renderOverlay(state, entry, props, retry);
  const isMounted = state.kind === "mounted";

  return (
    <MFEErrorBoundary
      onRetry={retry}
      fallback={(error, doRetry) =>
        renderSlot(props.errorFallback, DefaultError, {
          entry,
          error,
          retry: doRetry,
        })
      }
    >
      <div className={props.className} data-mfkit-outlet={entry.name} data-mfkit-state={state.kind}>
        {overlay}
        <div
          ref={containerRef}
          data-mfkit-mount={entry.name}
          style={isMounted ? undefined : HIDDEN_STYLE}
        />
      </div>
    </MFEErrorBoundary>
  );
}

const HIDDEN_STYLE = { display: "none" } as const;
const FALLBACK_STRATEGY = forgivingStrategy();
const FALLBACK_REGISTRY = createQuarantineRegistry();

function renderOverlay(
  state: OutletState,
  entry: MFEManifestEntry,
  props: MFKitOutletProps,
  retry: () => void,
): ReactNode {
  switch (state.kind) {
    case "idle":
    case "loading":
      return renderSlot(props.loadingFallback, DefaultLoading, {
        entry,
        attempt: state.kind === "loading" ? state.attempt : 1,
      });
    case "retrying": {
      const info: RetryingSlotInfo = {
        entry,
        attempt: state.attempt,
        nextDelayMs: state.nextDelayMs,
        error: state.error,
      };
      const slot = props.retryingFallback ?? props.loadingFallback;
      return renderSlot(slot, DefaultRetrying, info);
    }
    case "mounted":
      return null;
    case "quarantined":
      return renderSlot(props.quarantinedFallback, DefaultQuarantined, {
        entry,
        reason: state.reason,
        retry,
      });
    case "error":
      return renderSlot(props.errorFallback, DefaultError, {
        entry,
        error: state.error,
        retry,
      });
  }
}

function renderSlot<Info extends object>(
  slot: ReactNode | ((info: Info) => ReactNode) | undefined,
  fallback: (info: Info) => ReactNode,
  info: Info,
): ReactNode {
  if (slot === undefined) return fallback(info);
  if (typeof slot === "function") return slot(info);
  return slot;
}

function resolveEntry(
  props: MFKitOutletProps,
  entries: ReadonlyMap<string, MFEManifestEntry> | undefined,
): MFEManifestEntry {
  if (props.entry) return props.entry;
  const fromCtx = entries?.get(props.remote);
  if (fromCtx) return fromCtx;
  return {
    name: props.remote,
    framework: "unknown",
    path: "",
    route: props.basePath ?? "/",
  };
}
