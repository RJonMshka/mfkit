import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetRegistry,
  type CodemodManifest,
  CodemodRegistryError,
  listCodemods,
  type MigrationContext,
  type MigrationResult,
  planMigration,
  registerCodemod,
} from "../src/registry.js";

function noopCodemod(
  partial: Partial<CodemodManifest> & {
    id: string;
    fromVersion: number;
    toVersion: number;
  },
): CodemodManifest {
  return {
    description: "noop",
    apply: (_ctx: MigrationContext): MigrationResult => ({
      id: partial.id,
      filesChanged: [],
    }),
    ...partial,
  };
}

beforeEach(() => {
  __resetRegistry();
});

describe("registerCodemod", () => {
  it("accepts a single-step manifest", () => {
    registerCodemod(noopCodemod({ id: "a", fromVersion: 1, toVersion: 2 }));
    expect(listCodemods()).toHaveLength(1);
  });

  it("rejects manifests that skip versions", () => {
    expect(() =>
      registerCodemod(noopCodemod({ id: "skip", fromVersion: 1, toVersion: 3 })),
    ).toThrow(CodemodRegistryError);
  });

  it("rejects negative or non-integer versions", () => {
    expect(() =>
      registerCodemod(noopCodemod({ id: "neg", fromVersion: -1, toVersion: 0 })),
    ).toThrow(CodemodRegistryError);
    expect(() =>
      registerCodemod(noopCodemod({ id: "frac", fromVersion: 1.5, toVersion: 2.5 })),
    ).toThrow(CodemodRegistryError);
  });

  it("rejects empty id and missing apply", () => {
    expect(() => registerCodemod(noopCodemod({ id: "", fromVersion: 1, toVersion: 2 }))).toThrow(
      CodemodRegistryError,
    );
    expect(() =>
      registerCodemod({
        id: "missing-apply",
        description: "",
        fromVersion: 1,
        toVersion: 2,
        apply: undefined as unknown as CodemodManifest["apply"],
      }),
    ).toThrow(CodemodRegistryError);
  });

  it("is idempotent for the same manifest reference", () => {
    const m = noopCodemod({ id: "stable", fromVersion: 1, toVersion: 2 });
    registerCodemod(m);
    expect(() => registerCodemod(m)).not.toThrow();
    expect(listCodemods()).toHaveLength(1);
  });

  it("rejects a different manifest under an existing id", () => {
    registerCodemod(noopCodemod({ id: "dup", fromVersion: 1, toVersion: 2 }));
    expect(() => registerCodemod(noopCodemod({ id: "dup", fromVersion: 1, toVersion: 2 }))).toThrow(
      /already registered/,
    );
  });
});

describe("listCodemods", () => {
  it("orders by fromVersion then id", () => {
    registerCodemod(noopCodemod({ id: "z", fromVersion: 2, toVersion: 3 }));
    registerCodemod(noopCodemod({ id: "a", fromVersion: 2, toVersion: 3 }));
    registerCodemod(noopCodemod({ id: "b", fromVersion: 1, toVersion: 2 }));
    expect(listCodemods().map((c) => c.id)).toEqual(["b", "a", "z"]);
  });

  it("returns a snapshot, not a live view", () => {
    registerCodemod(noopCodemod({ id: "a", fromVersion: 1, toVersion: 2 }));
    const before = listCodemods();
    registerCodemod(noopCodemod({ id: "b", fromVersion: 2, toVersion: 3 }));
    expect(before).toHaveLength(1);
  });
});

describe("planMigration", () => {
  it("returns [] when from === to", () => {
    expect(planMigration(3, 3)).toEqual([]);
  });

  it("chains single-step codemods in order", () => {
    registerCodemod(noopCodemod({ id: "v1_v2", fromVersion: 1, toVersion: 2 }));
    registerCodemod(noopCodemod({ id: "v2_v3", fromVersion: 2, toVersion: 3 }));
    registerCodemod(noopCodemod({ id: "v3_v4", fromVersion: 3, toVersion: 4 }));
    expect(planMigration(1, 4).map((c) => c.id)).toEqual(["v1_v2", "v2_v3", "v3_v4"]);
  });

  it("throws when a step has no codemod", () => {
    registerCodemod(noopCodemod({ id: "v1_v2", fromVersion: 1, toVersion: 2 }));
    expect(() => planMigration(1, 3)).toThrow(/v2 → v3/);
  });

  it("throws when a step is ambiguous", () => {
    registerCodemod(noopCodemod({ id: "a", fromVersion: 1, toVersion: 2 }));
    registerCodemod(noopCodemod({ id: "b", fromVersion: 1, toVersion: 2 }));
    expect(() => planMigration(1, 2)).toThrow(/ambiguous/);
  });

  it("refuses downgrades", () => {
    expect(() => planMigration(3, 1)).toThrow(/downgrade/);
  });

  it("validates inputs", () => {
    expect(() => planMigration(-1, 1)).toThrow(CodemodRegistryError);
    expect(() => planMigration(1, 1.5)).toThrow(CodemodRegistryError);
  });
});
