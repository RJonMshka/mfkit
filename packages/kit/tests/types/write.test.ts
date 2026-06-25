import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MFKIT_CONFIG_VERSION, type MFKitConfig } from "../../src/index.js";
import { DEFAULT_REMOTE_TYPES_PATH, writeRemoteTypes } from "../../src/types/write.js";

let cwd: string;

function baseConfig(): MFKitConfig {
  return {
    version: MFKIT_CONFIG_VERSION,
    name: "host",
    shell: { name: "shell", framework: "react", path: "apps/shell" },
    mfes: [{ name: "mfe_a", framework: "react", path: "apps/mfe-a", route: "/a" }],
  };
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "mfkit-types-write-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe("writeRemoteTypes", () => {
  it("writes to the default path and creates parent dirs", async () => {
    const result = await writeRemoteTypes(baseConfig(), { cwd });
    expect(result.outPath).toBe(join(cwd, DEFAULT_REMOTE_TYPES_PATH));
    expect(result.unchanged).toBe(false);
    const written = readFileSync(result.outPath, "utf8");
    expect(written).toBe(result.content);
    expect(written).toContain('declare module "mfe_a/lifecycle"');
  });

  it("respects a custom outFile (relative resolves from cwd)", async () => {
    const result = await writeRemoteTypes(baseConfig(), {
      cwd,
      outFile: "types/remotes.d.ts",
    });
    expect(result.outPath).toBe(join(cwd, "types/remotes.d.ts"));
    expect(readFileSync(result.outPath, "utf8")).toBe(result.content);
  });

  it("respects a custom outFile (absolute path)", async () => {
    const abs = join(cwd, "absolute.d.ts");
    const result = await writeRemoteTypes(baseConfig(), {
      cwd,
      outFile: abs,
    });
    expect(result.outPath).toBe(abs);
  });

  it("skips the write when content already matches (unchanged=true)", async () => {
    const first = await writeRemoteTypes(baseConfig(), { cwd });
    const mtimeFirst = statSync(first.outPath).mtimeMs;

    await new Promise((r) => setTimeout(r, 20));
    const second = await writeRemoteTypes(baseConfig(), { cwd });
    const mtimeSecond = statSync(second.outPath).mtimeMs;

    expect(second.unchanged).toBe(true);
    expect(mtimeSecond).toBe(mtimeFirst);
  });

  it("writes when the existing file's content differs", async () => {
    await mkdir(join(cwd, ".mfkit/generated"), { recursive: true });
    writeFileSync(join(cwd, DEFAULT_REMOTE_TYPES_PATH), "// stale content\n", "utf8");

    const result = await writeRemoteTypes(baseConfig(), { cwd });
    expect(result.unchanged).toBe(false);
    expect(readFileSync(result.outPath, "utf8")).toContain('declare module "mfe_a/lifecycle"');
  });
});
