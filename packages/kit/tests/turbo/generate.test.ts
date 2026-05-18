import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MFKIT_CONFIG_VERSION, type MFKitConfig } from "../../src/index.js";
import {
  generateTurboConfig,
  type TurboConfig,
} from "../../src/turbo.js";

let cwd: string;

function writePkg(rel: string, name: string | null): void {
  const dir = join(cwd, rel);
  mkdirSync(dir, { recursive: true });
  const body = name === null ? {} : { name };
  writeFileSync(join(dir, "package.json"), JSON.stringify(body));
}

function baseConfig(): MFKitConfig {
  return {
    version: MFKIT_CONFIG_VERSION,
    name: "host",
    shell: { name: "shell", framework: "react", path: "apps/shell" },
    mfes: [
      { name: "mfe_a", framework: "react", path: "apps/mfe-a", route: "/a" },
      { name: "mfe_b", framework: "svelte", path: "apps/mfe-b", route: "/b" },
    ],
  };
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "mfkit-turbo-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe("generateTurboConfig defaults", () => {
  it("emits the base task block", () => {
    writePkg("apps/shell", "@host/shell");
    writePkg("apps/mfe-a", "@host/mfe-a");
    writePkg("apps/mfe-b", "@host/mfe-b");

    const out = generateTurboConfig(baseConfig(), { cwd });

    expect(out.$schema).toBe("https://turbo.build/schema.json");
    expect(out.tasks["build"]).toEqual({
      dependsOn: ["^build"],
      outputs: ["dist/**"],
    });
    expect(out.tasks["dev"]).toEqual({ cache: false, persistent: true });
    expect(out.tasks["test"]).toEqual({
      dependsOn: ["^build"],
      outputs: ["coverage/**"],
    });
    expect(out.tasks["typecheck"]).toEqual({ dependsOn: ["^build"] });
    expect(out.tasks["clean"]).toEqual({ cache: false });
  });

  it("omits the ui field by default", () => {
    writePkg("apps/shell", "@host/shell");
    writePkg("apps/mfe-a", "@host/mfe-a");
    writePkg("apps/mfe-b", "@host/mfe-b");

    const out = generateTurboConfig(baseConfig(), { cwd });
    expect("ui" in out).toBe(false);
  });

  it("includes ui when supplied", () => {
    writePkg("apps/shell", "@host/shell");
    writePkg("apps/mfe-a", "@host/mfe-a");
    writePkg("apps/mfe-b", "@host/mfe-b");

    const out = generateTurboConfig(baseConfig(), { cwd, ui: "tui" });
    expect(out.ui).toBe("tui");
  });
});

describe("generateTurboConfig shell-dev orchestration", () => {
  it("wires <shell>#dev to depend on every <mfe>#dev", () => {
    writePkg("apps/shell", "@host/shell");
    writePkg("apps/mfe-a", "@host/mfe-a");
    writePkg("apps/mfe-b", "@host/mfe-b");

    const out = generateTurboConfig(baseConfig(), { cwd });
    expect(out.tasks["@host/shell#dev"]).toEqual({
      dependsOn: ["@host/mfe-a#dev", "@host/mfe-b#dev"],
      cache: false,
      persistent: true,
    });
  });

  it("skips orchestration when orchestrateShellDev=false", () => {
    writePkg("apps/shell", "@host/shell");
    writePkg("apps/mfe-a", "@host/mfe-a");
    writePkg("apps/mfe-b", "@host/mfe-b");

    const out = generateTurboConfig(baseConfig(), {
      cwd,
      orchestrateShellDev: false,
    });
    expect(Object.keys(out.tasks).filter((k) => k.includes("#"))).toEqual([]);
  });

  it("skips orchestration when manifest has no MFEs", () => {
    const cfg: MFKitConfig = {
      ...baseConfig(),
      mfes: [],
    };

    const out = generateTurboConfig(cfg, { cwd });
    expect(Object.keys(out.tasks).filter((k) => k.includes("#"))).toEqual([]);
  });
});

describe("generateTurboConfig baseTasks override", () => {
  it("shallow-merges overrides onto defaults", () => {
    writePkg("apps/shell", "@host/shell");
    writePkg("apps/mfe-a", "@host/mfe-a");
    writePkg("apps/mfe-b", "@host/mfe-b");

    const out = generateTurboConfig(baseConfig(), {
      cwd,
      baseTasks: {
        dev: { cache: false, persistent: true, env: ["VITE_*"] },
        lint: { dependsOn: ["^build"] },
      },
    });

    expect(out.tasks["dev"]).toEqual({
      cache: false,
      persistent: true,
      env: ["VITE_*"],
    });
    expect(out.tasks["lint"]).toEqual({ dependsOn: ["^build"] });
    expect(out.tasks["build"]).toEqual({
      dependsOn: ["^build"],
      outputs: ["dist/**"],
    });
  });
});

describe("generateTurboConfig errors", () => {
  it("throws with manifest path when shell package.json is missing", () => {
    writePkg("apps/mfe-a", "@host/mfe-a");
    writePkg("apps/mfe-b", "@host/mfe-b");

    try {
      generateTurboConfig(baseConfig(), { cwd });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toMatchObject({
        name: "MFKitConfigError",
        issues: [
          expect.objectContaining({
            path: "shell.path",
            message: expect.stringContaining("apps/shell"),
          }),
        ],
      });
    }
  });

  it("throws with mfes[i].path for the missing MFE", () => {
    writePkg("apps/shell", "@host/shell");
    writePkg("apps/mfe-a", "@host/mfe-a");

    try {
      generateTurboConfig(baseConfig(), { cwd });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toMatchObject({
        name: "MFKitConfigError",
        issues: [
          expect.objectContaining({
            path: "mfes[1].path",
            message: expect.stringContaining("apps/mfe-b"),
          }),
        ],
      });
    }
  });

  it("throws on invalid JSON", () => {
    mkdirSync(join(cwd, "apps/shell"), { recursive: true });
    writeFileSync(join(cwd, "apps/shell/package.json"), "{ not json");
    writePkg("apps/mfe-a", "@host/mfe-a");
    writePkg("apps/mfe-b", "@host/mfe-b");

    expect(() => generateTurboConfig(baseConfig(), { cwd })).toThrow(
      /not valid JSON/,
    );
  });

  it("throws when package.json has no name", () => {
    writePkg("apps/shell", null);
    writePkg("apps/mfe-a", "@host/mfe-a");
    writePkg("apps/mfe-b", "@host/mfe-b");

    expect(() => generateTurboConfig(baseConfig(), { cwd })).toThrow(
      /no "name" field/,
    );
  });
});

describe("generateTurboConfig output shape", () => {
  it("matches the TurboConfig type at compile time", () => {
    writePkg("apps/shell", "@host/shell");
    writePkg("apps/mfe-a", "@host/mfe-a");
    writePkg("apps/mfe-b", "@host/mfe-b");

    const out: TurboConfig = generateTurboConfig(baseConfig(), { cwd });
    expect(out.$schema).toBeTypeOf("string");
  });
});
