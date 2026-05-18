import { beforeEach, describe, expect, it } from "vitest";

import { main, type CliIO } from "../src/cli.js";
import {
  __resetRegistry,
  registerCodemod,
  type CodemodManifest,
  type MigrationContext,
  type MigrationResult,
} from "../src/registry.js";

interface Capture {
  readonly io: CliIO;
  readonly out: string[];
  readonly err: string[];
}

function capture(): Capture {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: {
      stdout: (line) => out.push(line),
      stderr: (line) => err.push(line),
      cwd: "/tmp/test-cwd",
    },
    out,
    err,
  };
}

function fakeCodemod(
  id: string,
  fromVersion: number,
  apply?: CodemodManifest["apply"],
): CodemodManifest {
  return {
    id,
    description: `migrate v${fromVersion} → v${fromVersion + 1}`,
    fromVersion,
    toVersion: fromVersion + 1,
    apply:
      apply ??
      ((_ctx: MigrationContext): MigrationResult => ({
        id,
        filesChanged: [`apps/${id}.ts`],
      })),
  };
}

beforeEach(() => {
  __resetRegistry();
});

describe("help", () => {
  it("prints help on no args", async () => {
    const c = capture();
    const code = await main([], c.io);
    expect(code).toBe(0);
    expect(c.out.join("")).toMatch(/mfkit-migrate/);
    expect(c.out.join("")).toMatch(/Commands:/);
  });

  it("prints help on --help", async () => {
    const c = capture();
    expect(await main(["--help"], c.io)).toBe(0);
    expect(c.out.join("")).toMatch(/Commands:/);
  });

  it("returns exit code 2 on unknown command", async () => {
    const c = capture();
    expect(await main(["bogus"], c.io)).toBe(2);
    expect(c.err.join("")).toMatch(/unknown command/);
  });
});

describe("list", () => {
  it("reports empty registry", async () => {
    const c = capture();
    expect(await main(["list"], c.io)).toBe(0);
    expect(c.out.join("")).toMatch(/No codemods registered/);
  });

  it("prints registered codemods", async () => {
    registerCodemod(fakeCodemod("v1_v2", 1));
    const c = capture();
    expect(await main(["list"], c.io)).toBe(0);
    const out = c.out.join("");
    expect(out).toMatch(/Registered codemods \(1\)/);
    expect(out).toMatch(/v1_v2  v1 → v2/);
  });
});

describe("plan", () => {
  it("requires --from and --to", async () => {
    const c = capture();
    expect(await main(["plan"], c.io)).toBe(2);
    expect(c.err.join("")).toMatch(/both --from <n> and --to <n>/);
  });

  it("rejects non-integer flags", async () => {
    const c = capture();
    expect(await main(["plan", "--from", "abc", "--to", "2"], c.io)).toBe(2);
    expect(c.err.join("")).toMatch(/must be integers/);
  });

  it("reports nothing to do when from === to", async () => {
    const c = capture();
    expect(await main(["plan", "--from", "1", "--to", "1"], c.io)).toBe(0);
    expect(c.out.join("")).toMatch(/Nothing to do/);
  });

  it("surfaces planner errors as exit 1", async () => {
    const c = capture();
    expect(await main(["plan", "--from", "1", "--to", "2"], c.io)).toBe(1);
    expect(c.err.join("")).toMatch(/no codemod registered for v1 → v2/);
  });

  it("prints the planned sequence", async () => {
    registerCodemod(fakeCodemod("v1_v2", 1));
    registerCodemod(fakeCodemod("v2_v3", 2));
    const c = capture();
    expect(await main(["plan", "--from", "1", "--to", "3"], c.io)).toBe(0);
    const out = c.out.join("");
    expect(out).toMatch(/Plan v1 → v3 \(2 steps\)/);
    expect(out).toMatch(/1 → 2  v1_v2/);
    expect(out).toMatch(/2 → 3  v2_v3/);
  });
});

describe("up", () => {
  it("reports nothing to do on empty registry when from === to", async () => {
    const c = capture();
    expect(await main(["up", "--from", "1", "--to", "1"], c.io)).toBe(0);
    expect(c.out.join("")).toMatch(/Nothing to do/);
  });

  it("applies codemods and reports changed files", async () => {
    registerCodemod(fakeCodemod("v1_v2", 1));
    const c = capture();
    expect(await main(["up", "--from", "1", "--to", "2"], c.io)).toBe(0);
    const out = c.out.join("");
    expect(out).toMatch(/Applying 1 codemod/);
    expect(out).toMatch(/▸ v1_v2/);
    expect(out).toMatch(/~ apps\/v1_v2\.ts/);
    expect(out).toMatch(/Done\./);
  });

  it("passes dryRun=true through to codemods", async () => {
    let observedDryRun: boolean | undefined;
    registerCodemod(
      fakeCodemod("v1_v2", 1, (ctx) => {
        observedDryRun = ctx.dryRun;
        return { id: "v1_v2", filesChanged: [] };
      }),
    );
    const c = capture();
    expect(
      await main(["up", "--from", "1", "--to", "2", "--dry-run"], c.io),
    ).toBe(0);
    expect(observedDryRun).toBe(true);
    expect(c.out.join("")).toMatch(/Dry run complete/);
  });

  it("propagates codemod failures as exit 1", async () => {
    registerCodemod(
      fakeCodemod("v1_v2", 1, () => {
        throw new Error("boom");
      }),
    );
    const c = capture();
    expect(await main(["up", "--from", "1", "--to", "2"], c.io)).toBe(1);
    expect(c.err.join("")).toMatch(/codemod "v1_v2" failed: boom/);
  });

  it("passes the consumer cwd into MigrationContext", async () => {
    let observedCwd: string | undefined;
    registerCodemod(
      fakeCodemod("v1_v2", 1, (ctx) => {
        observedCwd = ctx.cwd;
        return { id: "v1_v2", filesChanged: [] };
      }),
    );
    const c = capture();
    await main(["up", "--from", "1", "--to", "2"], c.io);
    expect(observedCwd).toBe("/tmp/test-cwd");
  });
});
