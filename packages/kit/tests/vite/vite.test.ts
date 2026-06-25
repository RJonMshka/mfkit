import { describe, expect, it, vi } from "vitest";

import {
  type FrameworkAdapter,
  MFKIT_CONFIG_VERSION,
  type MFKitConfig,
  MFKitConfigError,
} from "../../src/index.js";
import { mfkitMFE, mfkitShell } from "../../src/vite.js";

// @module-federation/vite inspects the surrounding Vite build context and
// returns no plugins outside one — which makes it useless for this integration
// test. We replace it with a deterministic stub that proves the call wiring
// (name/filename/exposes/remotes/shared all reach it) without depending on
// the real plugin's internals.
const federationCalls: Array<Record<string, unknown>> = [];
vi.mock("@module-federation/vite", () => ({
  federation: (opts: Record<string, unknown>) => {
    federationCalls.push(opts);
    return [{ name: "stub:module-federation" }];
  },
}));

// A no-op adapter used to keep these tests free of real framework plugins —
// the lazy-loaded built-ins are exercised by adapter-resolve.test.ts.
const stubAdapter: FrameworkAdapter = {
  id: "react",
  defaultShared: { react: { singleton: true, requiredVersion: "^18.0.0" } },
  plugins: () => [],
};

const baseConfig: MFKitConfig = {
  version: MFKIT_CONFIG_VERSION,
  name: "test",
  shell: { name: "shell", framework: "react", path: "apps/shell", port: 3000 },
  mfes: [
    {
      name: "mfe_a",
      framework: "react",
      path: "apps/mfe-a",
      route: "/a",
      port: 4001,
    },
  ],
};

describe("mfkitMFE", () => {
  it("returns a UserConfig with port, build target, and federation plugin", async () => {
    federationCalls.length = 0;
    const cfg = await mfkitMFE(baseConfig, "mfe_a", {
      adapters: [stubAdapter],
      logInferred: false,
    });

    expect(cfg.server?.port).toBe(4001);
    expect(cfg.preview?.port).toBe(4001);
    expect(cfg.build?.target).toBe("esnext");
    expect(cfg.plugins?.length).toBeGreaterThan(0);
    expect(federationCalls).toHaveLength(1);
    expect(federationCalls[0]).toMatchObject({
      name: "mfe_a",
      filename: "remoteEntry.js",
      exposes: { "./lifecycle": "./src/lifecycle.ts" },
      shared: { react: { singleton: true, requiredVersion: "^18.0.0" } },
    });
  });

  it("throws if the MFE name is not in the manifest", async () => {
    await expect(
      mfkitMFE(baseConfig, "missing", {
        adapters: [stubAdapter],
        logInferred: false,
      }),
    ).rejects.toBeInstanceOf(MFKitConfigError);
  });
});

describe("mfkitShell", () => {
  it("returns a UserConfig with shell port and federation plugin (with remotes map)", async () => {
    federationCalls.length = 0;
    const cfg = await mfkitShell(baseConfig, {
      adapters: [stubAdapter],
      logInferred: false,
      mode: "dev",
    });

    expect(cfg.server?.port).toBe(3000);
    expect(cfg.preview?.port).toBe(3000);
    expect(cfg.plugins?.length).toBeGreaterThan(0);
    expect(federationCalls).toHaveLength(1);
    expect(federationCalls[0]).toMatchObject({
      name: "shell",
      remotes: { mfe_a: "http://localhost:4001/remoteEntry.js" },
    });
    expect(federationCalls[0]?.exposes).toBeUndefined();
  });
});
