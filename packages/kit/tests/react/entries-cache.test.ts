import type { MFEManifestEntry } from "@mfkit/plugin-api";
import { describe, expect, it } from "vitest";

import { createEntriesCache } from "../../src/react/entries-cache.js";

const mfeA: MFEManifestEntry = {
  name: "mfe_a",
  framework: "react",
  path: "apps/mfe-a",
  route: "/a",
};
const mfeB: MFEManifestEntry = {
  name: "mfe_b",
  framework: "svelte",
  path: "apps/mfe-b",
  route: "/b",
};

describe("createEntriesCache", () => {
  it("returns the same map for a structurally-equal but freshly-allocated array", () => {
    const resolve = createEntriesCache();

    // This is the `entries={[...]}` inline-literal case: a new array identity
    // every render. It must not produce a new map, or the provider's context
    // value churns and every outlet under it remounts (dx-findings #7).
    const first = resolve([{ ...mfeA }]);
    const second = resolve([{ ...mfeA }]);

    expect(second).toBe(first);
  });

  it("returns a new map when the entries actually change", () => {
    const resolve = createEntriesCache();

    const first = resolve([mfeA]);
    const second = resolve([mfeA, mfeB]);

    expect(second).not.toBe(first);
    expect(second.has("mfe_b")).toBe(true);
  });

  it("indexes entries by name", () => {
    const resolve = createEntriesCache();
    const map = resolve([mfeA, mfeB]);

    expect(map.get("mfe_a")).toEqual(mfeA);
    expect(map.get("mfe_b")).toEqual(mfeB);
    expect(map.size).toBe(2);
  });

  it("treats undefined and [] as a stable empty map", () => {
    const resolve = createEntriesCache();

    const fromUndefined = resolve(undefined);
    const fromEmpty = resolve([]);

    expect(fromUndefined.size).toBe(0);
    expect(fromEmpty).toBe(fromUndefined);
  });

  it("detects a changed field on an otherwise-identical entry", () => {
    const resolve = createEntriesCache();

    const first = resolve([mfeA]);
    const second = resolve([{ ...mfeA, route: "/moved" }]);

    expect(second).not.toBe(first);
    expect(second.get("mfe_a")?.route).toBe("/moved");
  });

  it("caches per instance — two providers do not share state", () => {
    const a = createEntriesCache();
    const b = createEntriesCache();

    expect(b([mfeA])).not.toBe(a([mfeA]));
  });
});
