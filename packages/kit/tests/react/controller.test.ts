// Tests for the imperative outlet controller. No React, no DOM env — the
// controller operates on a HTMLElement-shaped object and is fully testable
// from Node. Component-level behavior is covered by integration with DevNexus
// in later steps.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQuarantineRegistry } from "../../src/healing/quarantine.js";
import { forgivingStrategy, strictStrategy } from "../../src/healing/strategies.js";
import type { MFEContext, MFEDefinition, MFEManifestEntry } from "../../src/index.js";
import {
  createOutletController,
  type OutletControllerOptions,
} from "../../src/react/controller.js";
import type { OutletState } from "../../src/react/types.js";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const entry: MFEManifestEntry = {
  name: "mfe_metrics",
  framework: "svelte",
  path: "apps/mfe-metrics",
  route: "/metrics",
};

function fakeContainer(): HTMLElement {
  return {} as HTMLElement;
}

interface MountCall {
  el: HTMLElement;
  ctx: MFEContext;
  props: unknown;
}

function fakeLifecycle(mountImpl?: (el: HTMLElement, ctx: MFEContext, props: unknown) => unknown) {
  const mountCalls: MountCall[] = [];
  const unmountCalls: HTMLElement[] = [];
  const definition: MFEDefinition = {
    mount: vi.fn(async (el, ctx, props) => {
      mountCalls.push({ el, ctx, props });
      if (mountImpl) await mountImpl(el, ctx, props);
    }),
    unmount: vi.fn(async (el) => {
      unmountCalls.push(el);
    }),
  };
  return { definition, mountCalls, unmountCalls };
}

interface Harness {
  states: OutletState[];
  onMount: ReturnType<typeof vi.fn>;
  onUnmount: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
}

function makeHarness(): Harness {
  return {
    states: [],
    onMount: vi.fn(),
    onUnmount: vi.fn(),
    onError: vi.fn(),
  };
}

function makeController(
  partial: Partial<OutletControllerOptions> & {
    loadRemote: OutletControllerOptions["loadRemote"];
  },
  harness: Harness = makeHarness(),
) {
  const controller = createOutletController({
    container: fakeContainer(),
    entry,
    strategy: forgivingStrategy({ initialDelayMs: 10 }),
    onState: (s) => harness.states.push(s),
    onMount: harness.onMount,
    onUnmount: harness.onUnmount,
    onError: harness.onError,
    generateMountId: () => "test-mount-id",
    ...partial,
  });
  return { controller, harness };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createOutletController — happy path", () => {
  it("loads, mounts, and transitions loading → mounted", async () => {
    const { definition, mountCalls } = fakeLifecycle();
    const loadRemote = vi.fn().mockResolvedValue(definition);

    const { controller, harness } = makeController({ loadRemote });
    controller.start();
    await vi.runAllTimersAsync();

    expect(harness.states.map((s) => s.kind)).toEqual(["loading", "loading", "mounted"]);
    expect(loadRemote).toHaveBeenCalledWith("mfe_metrics/lifecycle");
    expect(mountCalls).toHaveLength(1);
    expect(mountCalls[0]?.ctx).toMatchObject({
      basePath: "/metrics",
      mountId: "test-mount-id",
    });
    expect(mountCalls[0]?.ctx.signal).toBeInstanceOf(AbortSignal);
    expect(harness.onMount).toHaveBeenCalledTimes(1);
  });

  it("respects custom module and basePath", async () => {
    const { definition } = fakeLifecycle();
    const loadRemote = vi.fn().mockResolvedValue(definition);

    const { controller } = makeController({
      loadRemote,
      module: "widget",
      basePath: "/custom",
    });
    controller.start();
    await vi.runAllTimersAsync();

    expect(loadRemote).toHaveBeenCalledWith("mfe_metrics/widget");
    expect((definition.mount as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).toMatchObject({
      basePath: "/custom",
    });
  });

  it("forwards user props as the third mount argument", async () => {
    const { definition } = fakeLifecycle();
    const loadRemote = vi.fn().mockResolvedValue(definition);
    const props = { user: "ada", count: 7 } as const;

    const { controller } = makeController({ loadRemote, props });
    controller.start();
    await vi.runAllTimersAsync();

    const call = (definition.mount as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[2]).toEqual(props);
  });
});

describe("createOutletController — module extraction", () => {
  it("accepts a module whose default export is the lifecycle", async () => {
    const { definition } = fakeLifecycle();
    const loadRemote = vi.fn().mockResolvedValue({ default: definition });

    const { controller, harness } = makeController({ loadRemote });
    controller.start();
    await vi.runAllTimersAsync();

    expect(harness.onMount).toHaveBeenCalledTimes(1);
  });

  it("surfaces an error when the loaded module has no mount/unmount", async () => {
    const loadRemote = vi.fn().mockResolvedValue({ notALifecycle: true });

    const { controller, harness } = makeController({
      loadRemote,
      strategy: strictStrategy(),
    });
    controller.start();
    await vi.runAllTimersAsync();

    const last = harness.states.at(-1);
    expect(last?.kind).toBe("error");
    if (last?.kind === "error") {
      expect(last.error.message).toMatch(/did not expose a valid MFE lifecycle/);
    }
    expect(harness.onError).toHaveBeenCalled();
  });
});

describe("createOutletController — retry and quarantine", () => {
  it("emits a retrying state then mounts on a second try", async () => {
    const { definition } = fakeLifecycle();
    const loadRemote = vi
      .fn()
      .mockRejectedValueOnce(new Error("net"))
      .mockResolvedValueOnce(definition);

    const { controller, harness } = makeController({ loadRemote });
    controller.start();
    await vi.runAllTimersAsync();

    const kinds = harness.states.map((s) => s.kind);
    expect(kinds).toContain("retrying");
    expect(kinds.at(-1)).toBe("mounted");

    const retryState = harness.states.find((s) => s.kind === "retrying");
    if (retryState?.kind === "retrying") {
      expect(retryState.attempt).toBe(2);
      expect(retryState.error.message).toBe("net");
    }
  });

  it("transitions to quarantined and records the reason in the registry", async () => {
    const loadRemote = vi.fn().mockRejectedValue(new Error("down hard"));
    const registry = createQuarantineRegistry();
    const strategy = forgivingStrategy({ maxAttempts: 2, initialDelayMs: 5 });

    const { controller, harness } = makeController({
      loadRemote,
      strategy,
      registry,
    });
    controller.start();
    await vi.runAllTimersAsync();

    const last = harness.states.at(-1);
    expect(last?.kind).toBe("quarantined");
    if (last?.kind === "quarantined") {
      expect(last.reason).toBe("down hard");
    }
    expect(registry.isQuarantined(entry.name)).toBe(true);
    expect(harness.onError).toHaveBeenCalled();
    expect(harness.onMount).not.toHaveBeenCalled();
  });

  it("short-circuits with quarantined state when the registry already knows about it", async () => {
    const registry = createQuarantineRegistry();
    registry.quarantine(entry.name, "prior failure");
    const loadRemote = vi.fn();

    const { controller, harness } = makeController({
      loadRemote,
      registry,
    });
    controller.start();
    await vi.runAllTimersAsync();

    expect(loadRemote).not.toHaveBeenCalled();
    expect(harness.states.at(-1)?.kind).toBe("quarantined");
  });

  it("uses the strict strategy to surface an error state on first failure", async () => {
    const loadRemote = vi.fn().mockRejectedValue(new Error("nope"));

    const { controller, harness } = makeController({
      loadRemote,
      strategy: strictStrategy(),
    });
    controller.start();
    await vi.runAllTimersAsync();

    expect(harness.states.at(-1)?.kind).toBe("error");
  });
});

describe("createOutletController — stop and cancellation", () => {
  it("aborts an in-flight load and never mounts", async () => {
    type Resolver = (d: MFEDefinition) => void;
    let resolveLoad: Resolver | null = null;
    const loadRemote = vi.fn().mockImplementation(
      () =>
        new Promise<MFEDefinition>((resolve: Resolver) => {
          resolveLoad = resolve;
        }),
    );
    const { definition } = fakeLifecycle();

    const { controller, harness } = makeController({ loadRemote });
    controller.start();
    await vi.advanceTimersByTimeAsync(0);

    const stopPromise = controller.stop();
    // Resolve the dangling promise after stop — should be ignored.
    (resolveLoad as Resolver | null)?.(definition);
    await stopPromise;
    await vi.runAllTimersAsync();

    expect(harness.onMount).not.toHaveBeenCalled();
    expect(harness.states.at(-1)?.kind).toBe("idle");
  });

  it("calls unmount when stopped after mount", async () => {
    const { definition, unmountCalls } = fakeLifecycle();
    const loadRemote = vi.fn().mockResolvedValue(definition);

    const { controller, harness } = makeController({ loadRemote });
    controller.start();
    await vi.runAllTimersAsync();
    expect(harness.onMount).toHaveBeenCalledTimes(1);

    await controller.stop();
    expect(unmountCalls).toHaveLength(1);
    expect(harness.onUnmount).toHaveBeenCalledTimes(1);
    expect(harness.states.at(-1)?.kind).toBe("idle");
  });

  it("cancels a prior cycle when start() is called twice", async () => {
    type Resolver = (d: MFEDefinition) => void;
    let firstResolve: Resolver | null = null;
    const firstDef = fakeLifecycle().definition;
    const secondDef = fakeLifecycle().definition;
    const loadRemote = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<MFEDefinition>((resolve: Resolver) => {
            firstResolve = resolve;
          }),
      )
      .mockImplementationOnce(async () => secondDef);

    const { controller, harness } = makeController({ loadRemote });
    controller.start();
    await vi.advanceTimersByTimeAsync(0);

    controller.start();
    // Late resolution of the cancelled cycle must not mount.
    (firstResolve as Resolver | null)?.(firstDef);
    await vi.runAllTimersAsync();

    expect(firstDef.mount).not.toHaveBeenCalled();
    expect(secondDef.mount).toHaveBeenCalledTimes(1);
    expect(harness.onMount).toHaveBeenCalledTimes(1);
  });

  it("signal passed to mount aborts when stop() runs", async () => {
    let capturedSignal: AbortSignal | undefined;
    const { definition } = fakeLifecycle(async (_el, ctx) => {
      capturedSignal = ctx.signal;
    });
    const loadRemote = vi.fn().mockResolvedValue(definition);

    const { controller } = makeController({ loadRemote });
    controller.start();
    await vi.runAllTimersAsync();

    expect(capturedSignal?.aborted).toBe(false);
    await controller.stop();
    expect(capturedSignal?.aborted).toBe(true);
  });
});
