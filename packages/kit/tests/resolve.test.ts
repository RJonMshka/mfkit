import { describe, expect, it, vi } from "vitest";

import { forgivingStrategy, resolveHealingStrategy, strictStrategy } from "../src/healing.js";
import {
  type DiscoveryStrategy,
  type FrameworkAdapter,
  type MFEManifestEntry,
  MFKIT_CONFIG_VERSION,
  type MFKitConfig,
  MFKitConfigError,
  type MFKitPlugin,
  resolveConfig,
} from "../src/index.js";

const declared: MFEManifestEntry = {
  name: "mfe_a",
  framework: "react",
  path: "apps/a",
  route: "/a",
  port: 5201,
};

function config(extra: Partial<MFKitConfig> = {}): MFKitConfig {
  return {
    version: MFKIT_CONFIG_VERSION,
    name: "t",
    shell: { name: "shell", framework: "react", path: "apps/shell" },
    mfes: [declared],
    ...extra,
  };
}

const discovery = (id: string, entries: MFEManifestEntry[]): DiscoveryStrategy => ({
  id,
  discover: async () => entries,
});

describe("resolveConfig", () => {
  it("passes a plain manifest through with empty plugin surfaces", async () => {
    const r = await resolveConfig(config());
    expect(r.mfes).toEqual([declared]);
    expect(r.healing).toBeUndefined();
    expect(r.adapters).toEqual([]);
    expect(r.discovered).toEqual([]);
  });

  it("memoizes per config object and accepts an already-resolved config", async () => {
    const c = config();
    const a = resolveConfig(c);
    expect(resolveConfig(c)).toBe(a);
    const r = await a;
    await expect(resolveConfig(r)).resolves.toBe(r);
  });

  it("healing: config.healing wins, else the last plugin's", async () => {
    const first = forgivingStrategy({ id: "first" });
    const second = forgivingStrategy({ id: "second" });
    const own = strictStrategy({ id: "own" });
    const plugins: MFKitPlugin[] = [
      { name: "p1", healing: first },
      { name: "p2", healing: second },
      { name: "p3" },
    ];
    expect((await resolveConfig(config({ plugins }))).healing?.id).toBe("second");
    expect((await resolveConfig(config({ plugins, healing: own }))).healing?.id).toBe("own");
  });

  it("orders plugin adapters highest-precedence first (later plugins win)", async () => {
    const a1: FrameworkAdapter = { id: "solid", plugins: () => [] };
    const a2: FrameworkAdapter = { id: "solid", plugins: () => [] };
    const r = await resolveConfig(
      config({
        plugins: [
          { name: "p1", frameworkAdapters: [a1] },
          { name: "p2", frameworkAdapters: [a2] },
        ],
      }),
    );
    expect(r.adapters).toEqual([a2, a1]);
  });

  it("discovery adds entries, never replaces declared ones, and later strategies win ties", async () => {
    const hijack = { ...declared, route: "/hijacked", port: 5299 };
    const b1: MFEManifestEntry = {
      name: "mfe_b",
      framework: "lit",
      path: "apps/b1",
      route: "/b",
      port: 5202,
    };
    const b2: MFEManifestEntry = { ...b1, path: "apps/b2" };
    const r = await resolveConfig(
      config({
        discovery: discovery("own", [hijack, b1]),
        plugins: [{ name: "p", discovery: discovery("plugin", [b2]) }],
      }),
    );
    expect(r.mfes.map((m) => `${m.name}:${m.path}`)).toEqual(["mfe_a:apps/a", "mfe_b:apps/b2"]);
    expect(r.discovered).toEqual(["mfe_b"]);
  });

  it("hands discovery the workspace root and the static manifest", async () => {
    const discover = vi.fn(async () => []);
    const c = config({ discovery: { id: "d", discover } });
    await resolveConfig(c, { cwd: "/repo" });
    expect(discover).toHaveBeenCalledWith({ cwd: "/repo", config: c });
  });

  it("validates discovered entries with the same rules as declared ones", async () => {
    const clash: MFEManifestEntry = {
      name: "mfe_b",
      framework: "lit",
      path: "b",
      route: "/b",
      port: 5201,
    };
    await expect(resolveConfig(config({ discovery: discovery("d", [clash]) }))).rejects.toThrow(
      /Port 5201 used by both/,
    );
  });

  it("reports a throwing strategy by id, and does not memoize the failure", async () => {
    let fail = true;
    const c = config({
      discovery: {
        id: "flaky-glob",
        discover: async () => {
          if (fail) throw new Error("EACCES");
          return [];
        },
      },
    });
    await expect(resolveConfig(c)).rejects.toThrow(
      /Discovery strategy "flaky-glob" failed: EACCES/,
    );
    fail = false;
    await expect(resolveConfig(c)).resolves.toMatchObject({ discovered: [] });
  });

  it("runs every plugin setup once, in order, with the resolved config", async () => {
    const calls: string[] = [];
    const c = config({
      plugins: [
        { name: "one", setup: (r) => void calls.push(`one:${r.mfes.length}`) },
        { name: "two", setup: async () => void calls.push("two") },
      ],
    });
    await Promise.all([resolveConfig(c), resolveConfig(c), resolveConfig(c)]);
    expect(calls).toEqual(["one:1", "two"]);
  });

  it("aggregates every malformed plugin/strategy into one error", async () => {
    const bad = config({
      healing: { id: "h" } as never,
      plugins: [
        { name: "" } as MFKitPlugin,
        { name: "x", discovery: { id: "d" } as never, setup: "nope" as never },
      ],
    });
    const err = await resolveConfig(bad).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MFKitConfigError);
    const paths = (err as MFKitConfigError).issues.map((i) => i.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "plugins[0]",
        "plugins[1].discovery",
        "plugins[1].setup",
        "healing.onLoadError",
        "healing.maxAttempts",
      ]),
    );
  });

  it("still applies defineConfig validation first", async () => {
    await expect(resolveConfig(config({ mfes: [{ ...declared, port: 80 }] }))).rejects.toThrow(
      /port must be >= 1024/,
    );
  });
});

describe("resolveHealingStrategy", () => {
  it("prefers config.healing, then the last plugin, then forgiving", () => {
    const own = strictStrategy({ id: "own" });
    const plugin = strictStrategy({ id: "plugin" });
    expect(
      resolveHealingStrategy(config({ healing: own, plugins: [{ name: "p", healing: plugin }] }))
        .id,
    ).toBe("own");
    expect(
      resolveHealingStrategy(config({ plugins: [{ name: "p", healing: plugin }, { name: "q" }] }))
        .id,
    ).toBe("plugin");
    expect(resolveHealingStrategy(config()).id).toBe("mfkit-forgiving");
  });
});
