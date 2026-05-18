import { describe, expect, it, vi } from "vitest";

import {
  createManifestCache,
  memoryManifestStorage,
  type ManifestStorage,
} from "../../src/healing/manifest-cache.js";

interface Manifest {
  readonly version: string;
}

describe("memoryManifestStorage", () => {
  it("round-trips values and returns null for unknown keys", () => {
    const s = memoryManifestStorage();
    expect(s.get("missing")).toBeNull();
    s.set("k", "v");
    expect(s.get("k")).toBe("v");
    s.remove("k");
    expect(s.get("k")).toBeNull();
  });
});

describe("createManifestCache", () => {
  it("returns fresh on success and persists to storage", async () => {
    const cache = createManifestCache<Manifest>();
    const fetcher = vi.fn(async () => ({ version: "1.0.0" }));

    const r1 = await cache.load("mfe_a", fetcher);
    expect(r1).toEqual({ value: { version: "1.0.0" }, stale: false });

    // Subsequent failure path serves the persisted value.
    const r2 = await cache.load("mfe_a", () => Promise.reject(new Error("offline")));
    expect(r2.stale).toBe(true);
    expect(r2.value).toEqual({ version: "1.0.0" });
    expect(r2.error?.message).toBe("offline");
  });

  it("rethrows the original error when fetcher fails and no cache exists", async () => {
    const cache = createManifestCache<Manifest>();
    await expect(
      cache.load("missing", () => Promise.reject(new Error("404"))),
    ).rejects.toThrow("404");
  });

  it("invalidate removes the cached value", async () => {
    const cache = createManifestCache<Manifest>();
    await cache.load("k", async () => ({ version: "1.0.0" }));
    await cache.invalidate("k");
    await expect(
      cache.load("k", () => Promise.reject(new Error("offline"))),
    ).rejects.toThrow("offline");
  });

  it("supports async storage adapters", async () => {
    const inner = new Map<string, string>();
    const storage: ManifestStorage = {
      get: async (k) => inner.get(k) ?? null,
      set: async (k, v) => {
        inner.set(k, v);
      },
      remove: async (k) => {
        inner.delete(k);
      },
    };
    const cache = createManifestCache<Manifest>({ storage });

    await cache.load("k", async () => ({ version: "2.0.0" }));
    const stale = await cache.load("k", () => Promise.reject(new Error("dead")));
    expect(stale.value).toEqual({ version: "2.0.0" });
    expect(stale.stale).toBe(true);
  });

  it("swallows storage.set failures so fresh loads still succeed", async () => {
    const storage: ManifestStorage = {
      get: () => null,
      set: () => {
        throw new Error("quota exceeded");
      },
      remove: () => {},
    };
    const cache = createManifestCache<Manifest>({ storage });

    await expect(
      cache.load("k", async () => ({ version: "3.0.0" })),
    ).resolves.toEqual({ value: { version: "3.0.0" }, stale: false });
  });

  it("falls through to the underlying error if cached value is corrupted JSON", async () => {
    const storage: ManifestStorage = {
      get: () => "{not-json",
      set: () => {},
      remove: () => {},
    };
    const cache = createManifestCache<Manifest>({ storage });
    await expect(
      cache.load("k", () => Promise.reject(new Error("offline"))),
    ).rejects.toThrow("offline");
  });
});
