import { describe, expect, it } from "vitest";

import { type FrameworkAdapter, MFKitConfigError } from "../../src/index.js";
import { resolveAdapter } from "../../src/vite/adapter-resolve.js";

describe("resolveAdapter", () => {
  it("returns user-supplied adapter when id matches (wins over built-in)", async () => {
    const fake: FrameworkAdapter = { id: "react", plugins: () => [] };
    const r = await resolveAdapter("react", [fake]);
    expect(r).toBe(fake);
  });

  it("resolves a built-in adapter for known ids", async () => {
    const r = await resolveAdapter("lit");
    expect(r.id).toBe("lit");
    expect(r.plugins({} as never)).toEqual([]);
  });

  it("throws MFKitConfigError for unknown framework", async () => {
    await expect(resolveAdapter("ember")).rejects.toBeInstanceOf(MFKitConfigError);
    await expect(resolveAdapter("ember")).rejects.toThrow(/No FrameworkAdapter for "ember"/);
  });
});
