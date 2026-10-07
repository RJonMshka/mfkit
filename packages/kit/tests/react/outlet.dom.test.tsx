// @vitest-environment happy-dom
//
// L3 component tests (docs/testing-and-evaluation.md): the React glue around
// the controller — effect deps, refs, state initializers. This is where
// review R3 and dx-findings #7 lived; neither was visible to controller tests.

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createQuarantineRegistry } from "../../src/healing/quarantine.js";
import { forgivingStrategy, strictStrategy } from "../../src/healing/strategies.js";
import type { MFEDefinition, MFEManifestEntry } from "../../src/index.js";
import { MFKitOutlet, MFKitProvider } from "../../src/react.js";

afterEach(cleanup);

const entries: MFEManifestEntry[] = [
  { name: "mfe_a", framework: "react", path: "apps/a", route: "/a", label: "Alpha" },
];

/** A lifecycle that renders plain DOM and records every call. */
function trackedLifecycle() {
  const calls: string[] = [];
  const mounted = new Set<HTMLElement>();
  const definition: MFEDefinition<{ greeting?: string }> = {
    mount: vi.fn((el, _ctx, props) => {
      calls.push(`mount:${props?.greeting ?? ""}`);
      el.textContent = `hello ${props?.greeting ?? ""}`.trim();
      mounted.add(el);
    }),
    unmount: vi.fn((el) => {
      calls.push("unmount");
      el.textContent = "";
      mounted.delete(el);
    }),
  };
  return { definition, calls, mounted };
}

const fastStrategy = () => forgivingStrategy({ initialDelayMs: 1, maxDelayMs: 1 });

const stateOf = (name = "mfe_a") =>
  document.querySelector(`[data-mfkit-outlet="${name}"]`)?.getAttribute("data-mfkit-state");

describe("<MFKitOutlet> in the DOM", () => {
  it("shows the loading slot, then mounts with props", async () => {
    const { definition, calls } = trackedLifecycle();
    render(
      <MFKitProvider loadRemote={async () => definition} entries={entries}>
        <MFKitOutlet remote="mfe_a" props={{ greeting: "world" }} />
      </MFKitProvider>,
    );
    expect(screen.getByRole("status").textContent).toContain("Loading Alpha");
    await waitFor(() => expect(stateOf()).toBe("mounted"));
    expect(screen.getByText("hello world")).toBeTruthy();
    expect(calls).toEqual(["mount:world"]);
  });

  // R3 + dx-findings #7: inline literals for `props` and `entries` are new
  // identities on every render and must not remount the MFE.
  it("does not remount when the parent re-renders with inline props and entries", async () => {
    const { definition, calls } = trackedLifecycle();
    const loadRemote = async () => definition;
    let rerender = () => {};
    function Parent() {
      const [n, setN] = useState(0);
      rerender = () => setN((x) => x + 1);
      return (
        <MFKitProvider loadRemote={loadRemote} entries={[...entries]}>
          <span data-testid="count">{n}</span>
          <MFKitOutlet remote="mfe_a" props={{ greeting: "same" }} />
        </MFKitProvider>
      );
    }
    render(<Parent />);
    await waitFor(() => expect(stateOf()).toBe("mounted"));

    for (let i = 0; i < 3; i++) act(() => rerender());
    expect(screen.getByTestId("count").textContent).toBe("3");
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toEqual(["mount:same"]);
  });

  it("remounts when a prop value actually changes (until update? exists — review O4)", async () => {
    const { definition, calls } = trackedLifecycle();
    const loadRemote = async () => definition;
    const { rerender } = render(
      <MFKitProvider loadRemote={loadRemote} entries={entries}>
        <MFKitOutlet remote="mfe_a" props={{ greeting: "one" }} />
      </MFKitProvider>,
    );
    await waitFor(() => expect(calls).toEqual(["mount:one"]));
    rerender(
      <MFKitProvider loadRemote={loadRemote} entries={entries}>
        <MFKitOutlet remote="mfe_a" props={{ greeting: "two" }} />
      </MFKitProvider>,
    );
    await waitFor(() => expect(calls).toEqual(["mount:one", "unmount", "mount:two"]));
  });

  it("leaves exactly one live mount under StrictMode's double effects", async () => {
    const { definition, mounted } = trackedLifecycle();
    render(
      <StrictMode>
        <MFKitProvider loadRemote={async () => definition} entries={entries}>
          <MFKitOutlet remote="mfe_a" />
        </MFKitProvider>
      </StrictMode>,
    );
    await waitFor(() => expect(stateOf()).toBe("mounted"));
    await new Promise((r) => setTimeout(r, 10));
    expect(mounted.size).toBe(1);
  });

  it("renders the error slot under a strict strategy, and Retry remounts", async () => {
    const { definition, calls } = trackedLifecycle();
    const loadRemote = vi
      .fn<(id: string) => Promise<unknown>>()
      .mockRejectedValueOnce(new Error("remote 503"))
      .mockResolvedValue(definition);
    render(
      <MFKitProvider loadRemote={loadRemote} entries={entries} strategy={strictStrategy()}>
        <MFKitOutlet remote="mfe_a" />
      </MFKitProvider>,
    );
    await waitFor(() => expect(stateOf()).toBe("error"));
    expect(screen.getByRole("alert").textContent).toContain("remote 503");
    expect(loadRemote).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(stateOf()).toBe("mounted"));
    expect(calls).toEqual(["mount:"]);
  });

  it("quarantines after maxAttempts, and Try again clears the registry", async () => {
    const { definition } = trackedLifecycle();
    const registry = createQuarantineRegistry();
    let healthy = false;
    const loadRemote = vi.fn(async () => {
      if (!healthy) throw new Error("down");
      return definition;
    });
    const onError = vi.fn();
    render(
      <MFKitProvider
        loadRemote={loadRemote}
        entries={entries}
        strategy={fastStrategy()}
        registry={registry}
      >
        <MFKitOutlet remote="mfe_a" onError={onError} />
      </MFKitProvider>,
    );
    await waitFor(() => expect(stateOf()).toBe("quarantined"));
    expect(loadRemote).toHaveBeenCalledTimes(3);
    expect(registry.isQuarantined("mfe_a")).toBe(true);
    expect(onError).toHaveBeenCalledTimes(1);

    healthy = true;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(stateOf()).toBe("mounted"));
    expect(registry.isQuarantined("mfe_a")).toBe(false);
  });

  it("renders consumer slots instead of the defaults", async () => {
    const loadRemote = async () => {
      throw new Error("nope");
    };
    render(
      <MFKitProvider loadRemote={loadRemote} entries={entries} strategy={strictStrategy()}>
        <MFKitOutlet
          remote="mfe_a"
          loadingFallback={<p>custom loading</p>}
          errorFallback={({ entry, error }) => (
            <p>
              custom {entry.label}: {error.message}
            </p>
          )}
        />
      </MFKitProvider>,
    );
    expect(screen.getByText("custom loading")).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/custom Alpha: .*nope/)).toBeTruthy());
  });

  it("unmounts the MFE exactly once when the outlet leaves the tree", async () => {
    const { definition, calls } = trackedLifecycle();
    const onUnmount = vi.fn();
    const { unmount } = render(
      <MFKitProvider loadRemote={async () => definition} entries={entries}>
        <MFKitOutlet remote="mfe_a" onUnmount={onUnmount} />
      </MFKitProvider>,
    );
    await waitFor(() => expect(stateOf()).toBe("mounted"));
    unmount();
    await waitFor(() => expect(onUnmount).toHaveBeenCalledTimes(1));
    expect(calls).toEqual(["mount:", "unmount"]);
  });

  it("throws an actionable error without a loadRemote", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<MFKitOutlet remote="mfe_a" />)).toThrow(/no `loadRemote` available/);
    spy.mockRestore();
  });
});
