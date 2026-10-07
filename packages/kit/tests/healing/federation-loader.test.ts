import { describe, expect, it, vi } from "vitest";

import {
  createFederationLoader,
  type FederationRemoteLike,
  type FederationRuntimeLike,
  withRetryParam,
} from "../../src/healing/federation-loader.js";

/**
 * A fake MF runtime that reproduces the real one's caching: loads are
 * memoized per (name, entry URL), rejections included — the behavior that
 * made retries a no-op (review R8).
 */
function fakeRuntime(isUp: (entry: string) => boolean) {
  const remotes: FederationRemoteLike[] = [
    { name: "mfe_clock", entry: "http://localhost:5176/remoteEntry.js" },
    { name: "mfe_hello", entry: "http://localhost:5175/remoteEntry.js" },
  ];
  const cache = new Map<string, Promise<unknown>>();
  const fetches: string[] = [];
  const runtime: FederationRuntimeLike = {
    loadRemote: vi.fn((id: string) => {
      const name = id.split("/")[0];
      const entry = remotes.find((r) => r.name === name)?.entry ?? "";
      const key = `${name}@${entry}`;
      let p = cache.get(key);
      if (!p) {
        fetches.push(entry);
        p = isUp(entry) ? Promise.resolve({ default: { id } }) : Promise.reject(new Error("503"));
        cache.set(key, p);
      }
      return p;
    }),
    registerRemotes: vi.fn((next, opts) => {
      expect(opts).toEqual({ force: true });
      for (const r of next) {
        const i = remotes.findIndex((x) => x.name === r.name);
        remotes[i] = r;
      }
    }),
    getInstance: () => ({ options: { remotes } }),
  };
  return { runtime, fetches, remotes };
}

describe("createFederationLoader", () => {
  it("without it, a cached rejection means retries never refetch (the bug)", async () => {
    const { runtime, fetches } = fakeRuntime(() => fetches.length > 1);
    await expect(runtime.loadRemote("mfe_clock/lifecycle")).rejects.toThrow("503");
    await expect(runtime.loadRemote("mfe_clock/lifecycle")).rejects.toThrow("503");
    expect(fetches).toHaveLength(1);
  });

  it("refetches under a cache-busted URL after a failure, then succeeds", async () => {
    let up = false;
    const { runtime, fetches } = fakeRuntime(() => up);
    const load = createFederationLoader(runtime);

    await expect(load("mfe_clock/lifecycle")).rejects.toThrow("503");
    await expect(load("mfe_clock/lifecycle")).rejects.toThrow("503");
    up = true;
    await expect(load("mfe_clock/lifecycle")).resolves.toEqual({
      default: { id: "mfe_clock/lifecycle" },
    });

    expect(fetches).toEqual([
      "http://localhost:5176/remoteEntry.js",
      "http://localhost:5176/remoteEntry.js?mfkit-retry=1",
      "http://localhost:5176/remoteEntry.js?mfkit-retry=2",
    ]);
  });

  it("leaves healthy remotes alone and does not bust on first load", async () => {
    const { runtime, fetches } = fakeRuntime((e) => e.includes("5175"));
    const load = createFederationLoader(runtime);
    await load("mfe_hello/lifecycle");
    await load("mfe_hello/lifecycle");
    await expect(load("mfe_clock/lifecycle")).rejects.toThrow();
    expect(runtime.registerRemotes).not.toHaveBeenCalled();
    expect(fetches).toEqual([
      "http://localhost:5175/remoteEntry.js",
      "http://localhost:5176/remoteEntry.js",
    ]);
  });

  it("treats a null resolution (errorLoadRemote swallowed it) as a failure", async () => {
    const runtime: FederationRuntimeLike = {
      loadRemote: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ ok: true }),
      registerRemotes: vi.fn(),
      getInstance: () => ({ options: { remotes: [{ name: "mfe_a", entry: "http://x/re.js" }] } }),
    };
    const load = createFederationLoader(runtime);
    await expect(load("mfe_a/lifecycle")).rejects.toThrow(/resolved to null/);
    await expect(load("mfe_a/lifecycle")).resolves.toEqual({ ok: true });
    expect(runtime.registerRemotes).toHaveBeenCalledWith(
      [{ name: "mfe_a", entry: "http://x/re.js?mfkit-retry=1" }],
      { force: true },
    );
  });

  it("keys scoped remote names on scope + name", async () => {
    const runtime: FederationRuntimeLike = {
      loadRemote: vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce({}),
      registerRemotes: vi.fn(),
      getInstance: () => ({
        options: { remotes: [{ name: "@org/remote", entry: "http://x/re.js" }] },
      }),
    };
    const load = createFederationLoader(runtime);
    await expect(load("@org/remote/lifecycle")).rejects.toThrow();
    await load("@org/remote/lifecycle");
    expect(runtime.registerRemotes).toHaveBeenCalledTimes(1);
  });
});

describe("withRetryParam", () => {
  it("adds, replaces, and preserves other params", () => {
    expect(withRetryParam("http://h/re.js", 1)).toBe("http://h/re.js?mfkit-retry=1");
    expect(withRetryParam("http://h/re.js?mfkit-retry=1", 2)).toBe("http://h/re.js?mfkit-retry=2");
    expect(withRetryParam("http://h/re.js?v=3&mfkit-retry=1", 2)).toBe(
      "http://h/re.js?v=3&mfkit-retry=2",
    );
  });
});
