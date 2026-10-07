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

// Pending unmounts, keyed by container. A restart (or React re-running the
// outlet effect, which builds a *new* controller) mounts into the same
// container the previous cycle is still tearing down. With an async
// `unmount` (Angular destroy, exit transitions) the old teardown could resolve
// after the new mount and wipe it out. Every mount waits for the container's
// pending teardown first — shared across controller instances on purpose.
const pendingTeardowns = new WeakMap<HTMLElement, Promise<void>>();

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
  /** Pending half-open probe after a cooldown quarantine (review O5). */
  let probeTimer: ReturnType<typeof setTimeout> | null = null;

  function clearProbe(): void {
    if (probeTimer !== null) clearTimeout(probeTimer);
    probeTimer = null;
  }

  // With a cooldown registry, a quarantined outlet re-probes on its own when
  // the record goes half-open — no click, no reload.
  function scheduleProbe(myGen: number): void {
    const retryAt = opts.registry?.snapshot().get(opts.entry.name)?.retryAt;
    if (retryAt === undefined) return;
    clearProbe();
    probeTimer = setTimeout(
      () => {
        probeTimer = null;
        if (generation === myGen) controller.start();
      },
      Math.max(0, retryAt - Date.now()),
    );
  }

  function setState(state: OutletState): void {
    opts.onState(state);
  }

  function tearDownMounted(): Promise<void> {
    const m = mounted;
    if (!m) return Promise.resolve();
    mounted = null;
    const previous = pendingTeardowns.get(m.container) ?? Promise.resolve();
    const done = previous.then(async () => {
      try {
        await m.definition.unmount(m.container);
        opts.onUnmount?.();
      } catch (raw) {
        const err = raw instanceof Error ? raw : new Error(String(raw));
        opts.onError?.(err);
      }
    });
    pendingTeardowns.set(m.container, done);
    void done.then(() => {
      if (pendingTeardowns.get(m.container) === done) pendingTeardowns.delete(m.container);
    });
    return done;
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
      emitFailure(raw, opts, myGen);
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

    // O7: never mount over an unmount that hasn't finished yet.
    await pendingTeardowns.get(opts.container);
    if (generation !== myGen || signal.aborted) return;

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
      emitFailure(raw, opts, myGen);
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

  const controller: OutletController = {
    start(): void {
      clearProbe();
      const myGen = ++generation;
      // Cancel anything in-flight and tear down a prior mount.
      abortController?.abort();
      void tearDownMounted();
      abortController = new AbortController();
      void run(myGen);
    },
    async stop(): Promise<void> {
      clearProbe();
      generation++;
      abortController?.abort();
      abortController = null;
      await tearDownMounted();
      setState({ kind: "idle" });
    },
  };
  return controller;

  function emitFailure(raw: unknown, ctx: OutletControllerOptions, myGen: number): void {
    const err = raw instanceof Error ? raw : new Error(String(raw));
    if (err.name === "AbortError") return;
    if (err instanceof MFEQuarantinedError) {
      setState({ kind: "quarantined", reason: err.reason });
      scheduleProbe(myGen);
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

let mountCounter = 0;
function defaultGenerateMountId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `mfkit-mount-${++mountCounter}`;
}
