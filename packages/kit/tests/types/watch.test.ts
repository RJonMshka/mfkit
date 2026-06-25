// fs.watch is notoriously platform-sensitive. These tests exercise the
// watcher contract via the `trigger()` escape hatch — the manual-fire path
// covers reload → regenerate → write without depending on macOS/Linux event
// timing differences. The fs.watch call itself is verified by checking the
// watcher closes cleanly without leaking handles.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MFKIT_CONFIG_VERSION, type MFKitConfig } from "../../src/index.js";
import { watchRemoteTypes } from "../../src/types/watch.js";
import { DEFAULT_REMOTE_TYPES_PATH, type WriteRemoteTypesResult } from "../../src/types/write.js";

let cwd: string;

function configWith(mfeNames: readonly string[]): MFKitConfig {
  return {
    version: MFKIT_CONFIG_VERSION,
    name: "host",
    shell: { name: "shell", framework: "react", path: "apps/shell" },
    mfes: mfeNames.map((n, i) => ({
      name: n,
      framework: "react",
      path: `apps/${n}`,
      route: `/${i}`,
    })),
  };
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "mfkit-types-watch-"));
  // The watcher requires a real file to attach fs.watch to. The contents
  // don't matter — it's a sentinel for change events.
  writeFileSync(join(cwd, "mfkit.config.ts"), "// stub", "utf8");
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe("watchRemoteTypes", () => {
  it("emits the file on start using the supplied config (no reload)", async () => {
    let reloadCalls = 0;
    const writes: WriteRemoteTypesResult[] = [];
    const watcher = watchRemoteTypes(configWith(["mfe_a"]), {
      cwd,
      watchPaths: ["mfkit.config.ts"],
      reload: () => {
        reloadCalls++;
        return configWith(["mfe_a"]);
      },
      onWrite: (r) => writes.push(r),
    });

    // close() awaits the pending initial write — no trigger() needed.
    await watcher.close();

    const out = readFileSync(join(cwd, DEFAULT_REMOTE_TYPES_PATH), "utf8");
    expect(out).toContain('declare module "mfe_a/lifecycle"');
    expect(writes).toHaveLength(1);
    expect(reloadCalls).toBe(0);
  });

  it("trigger() reloads the manifest and regenerates", async () => {
    let current = configWith(["mfe_a"]);
    const watcher = watchRemoteTypes(current, {
      cwd,
      watchPaths: ["mfkit.config.ts"],
      reload: () => current,
    });

    // Wait for the initial (no-reload) write to settle before swapping.
    await watcher.trigger();
    expect(readFileSync(join(cwd, DEFAULT_REMOTE_TYPES_PATH), "utf8")).toContain(
      '"mfe_a/lifecycle"',
    );

    current = configWith(["mfe_a", "mfe_b"]);
    await watcher.trigger();
    await watcher.close();

    const out = readFileSync(join(cwd, DEFAULT_REMOTE_TYPES_PATH), "utf8");
    expect(out).toContain('"mfe_a/lifecycle"');
    expect(out).toContain('"mfe_b/lifecycle"');
  });

  it("routes reload errors through onError and keeps watching", async () => {
    const errors: unknown[] = [];
    let shouldThrow = false;
    let current = configWith(["mfe_a"]);

    const watcher = watchRemoteTypes(current, {
      cwd,
      watchPaths: ["mfkit.config.ts"],
      reload: () => {
        if (shouldThrow) throw new Error("boom");
        return current;
      },
      onError: (e) => errors.push(e),
    });

    await watcher.trigger();
    shouldThrow = true;
    await watcher.trigger();
    expect(errors).toHaveLength(1);

    shouldThrow = false;
    current = configWith(["mfe_a", "mfe_c"]);
    await watcher.trigger();
    await watcher.close();

    const out = readFileSync(join(cwd, DEFAULT_REMOTE_TYPES_PATH), "utf8");
    expect(out).toContain('"mfe_c/lifecycle"');
  });

  it("close() releases resources and is idempotent", async () => {
    const watcher = watchRemoteTypes(configWith(["mfe_a"]), {
      cwd,
      watchPaths: ["mfkit.config.ts"],
      reload: () => configWith(["mfe_a"]),
    });
    await watcher.close();
    // Second close should not throw.
    await watcher.close();
  });
});
