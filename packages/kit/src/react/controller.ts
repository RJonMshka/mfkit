// Imperative outlet engine, framework-agnostic.
//
// The React component is a thin shell; this controller owns the load → mount
// → unmount cycle, threads everything through `runWithHealing`, and emits
// `OutletState` transitions for the renderer to consume. Keeping it free of
// React makes it directly testable without a DOM harness and reusable from
// future Vue/Svelte outlets.

import type {
  HealingStrategy,
  MFEContext,
  MFEDefinition,
  MFEManifestEntry,
} from "@mfkit/plugin-api";

import type { QuarantineRegistry } from "../healing/quarantine.js";
import { MFEHealingError, MFEQuarantinedError, runWithHealing } from "../healing/runner.js";

import type { LoadRemote, OutletState } from "./types.js";

const DEFAULT_MODULE = "lifecycle";

export interface OutletControllerOptions {
  readonly container: HTMLElement;
  readonly entry: MFEManifestEntry;
  readonly loadRemote: LoadRemote;
  readonly strategy: HealingStrategy;
  readonly registry?: QuarantineRegistry;
  readonly basePath?: string;
  readonly module?: string;
  readonly props?: Readonly<Record<string, unknown>>;
  readonly onState: (state: OutletState) => void;
  readonly onMount?: () => void;
  readonly onUnmount?: () => void;
  readonly onError?: (err: Error) => void;
  /**
   * Optional id generator. Defaults to `crypto.randomUUID()` when available,
   * else a monotonic counter. Tests override for determinism.
   */
  readonly generateMountId?: () => string;
}

export interface OutletController {
  /** Run the load → mount cycle. Cancels any prior in-flight cycle first. */
  start(): void;
  /** Tear down: aborts loading and awaits unmount on a mounted MFE. */
  stop(): Promise<void>;
}

export function createOutletController(opts: OutletControllerOptions): OutletController {
  let abortController: AbortController | null = null;
  let mounted: { definition: MFEDefinition; container: HTMLElement } | null = null;
  /** Generation counter — discards stale async results after a restart. */
  let generation = 0;

  function setState(state: OutletState): void {
    opts.onState(state);
  }

  async function tearDownMounted(): Promise<void> {
    const m = mounted;
    if (!m) return;
    mounted = null;
    try {
      await m.definition.unmount(m.container);
      opts.onUnmount?.();
    } catch (raw) {
      const err = raw instanceof Error ? raw : new Error(String(raw));
      opts.onError?.(err);
    }
  }

  async function run(myGen: number): Promise<void> {
    const moduleName = opts.module ?? DEFAULT_MODULE;
    const remoteId = `${opts.entry.name}/${moduleName}`;
    const ctrl = abortController;
    if (!ctrl) return;
    const signal = ctrl.signal;

    setState({ kind: "loading", attempt: 1 });

    let attempt = 1;
    let definition: MFEDefinition;
    try {
      const loaded = await runWithHealing<MFEDefinition>({
        op: async () => {
          const mod = await opts.loadRemote(remoteId);
          return extractDefinition(mod, remoteId);
        },
        entry: opts.entry,
        kind: "load",
        strategy: opts.strategy,
        ...(opts.registry ? { registry: opts.registry } : {}),
        signal,
        onRetry: (decision, error) => {
          if (generation !== myGen) return;
          attempt += 1;
          setState({
            kind: "retrying",
            attempt,
            nextDelayMs: decision.afterMs,
            error,
          });
        },
      });
      definition = loaded;
    } catch (raw) {
      if (generation !== myGen || signal.aborted) return;
      emitFailure(raw, opts);
      return;
    }

    if (generation !== myGen || signal.aborted) return;

    setState({ kind: "loading", attempt });

    const mountId = (opts.generateMountId ?? defaultGenerateMountId)();
    const ctx: MFEContext = {
      basePath: opts.basePath ?? opts.entry.route,
      mountId,
      signal,
    };

    try {
      await runWithHealing<void>({
        op: async () => {
          await definition.mount(opts.container, ctx, opts.props);
        },
        entry: opts.entry,
        kind: "mount",
        strategy: opts.strategy,
        ...(opts.registry ? { registry: opts.registry } : {}),
        signal,
        onRetry: (decision, error) => {
          if (generation !== myGen) return;
          attempt += 1;
          setState({
            kind: "retrying",
            attempt,
            nextDelayMs: decision.afterMs,
            error,
          });
        },
      });
    } catch (raw) {
      if (generation !== myGen || signal.aborted) return;
      emitFailure(raw, opts);
      return;
    }

    if (generation !== myGen || signal.aborted) {
      // Mounted into a stale container — clean up immediately.
      try {
        await definition.unmount(opts.container);
      } catch {
        /* best-effort */
      }
      return;
    }

    mounted = { definition, container: opts.container };
    setState({ kind: "mounted" });
    opts.onMount?.();
  }

  return {
    start(): void {
      const myGen = ++generation;
      // Cancel anything in-flight and tear down a prior mount.
      abortController?.abort();
      void tearDownMounted();
      abortController = new AbortController();
      void run(myGen);
    },
    async stop(): Promise<void> {
      generation++;
      abortController?.abort();
      abortController = null;
      await tearDownMounted();
      setState({ kind: "idle" });
    },
  };

  function emitFailure(raw: unknown, ctx: OutletControllerOptions): void {
    const err = raw instanceof Error ? raw : new Error(String(raw));
    if (err.name === "AbortError") return;
    if (err instanceof MFEQuarantinedError) {
      setState({ kind: "quarantined", reason: extractReason(err) });
    } else if (err instanceof MFEHealingError) {
      setState({ kind: "error", error: err });
    } else {
      setState({ kind: "error", error: err });
    }
    ctx.onError?.(err);
  }
}

function extractDefinition(mod: unknown, id: string): MFEDefinition {
  const candidate = (
    isRecord(mod) && isMFEDefinition(mod.default) ? mod.default : isMFEDefinition(mod) ? mod : null
  ) as MFEDefinition | null;
  if (!candidate) {
    throw new Error(
      `Remote "${id}" did not expose a valid MFE lifecycle (need { mount, unmount }).`,
    );
  }
  return candidate;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isMFEDefinition(v: unknown): v is MFEDefinition {
  return isRecord(v) && typeof v.mount === "function" && typeof v.unmount === "function";
}

function extractReason(err: MFEQuarantinedError): string {
  // MFEQuarantinedError messages are `MFE "<name>" quarantined: <reason>`.
  const m = /quarantined:\s*(.*)$/u.exec(err.message);
  return m?.[1] ?? err.message;
}

let mountCounter = 0;
function defaultGenerateMountId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `mfkit-mount-${++mountCounter}`;
}
