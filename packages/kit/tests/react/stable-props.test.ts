import { describe, expect, it } from "vitest";

import { createPropsStabilizer } from "../../src/react/stable-props.js";

describe("createPropsStabilizer", () => {
  it("returns the first identity for shallow-equal inline objects", () => {
    const stabilize = createPropsStabilizer();
    const first = stabilize({ greeting: "hi", n: 1 });
    expect(stabilize({ greeting: "hi", n: 1 })).toBe(first);
    expect(stabilize({ n: 1, greeting: "hi" })).toBe(first);
  });

  it("returns the new object when any value changes", () => {
    const stabilize = createPropsStabilizer();
    const first = stabilize({ greeting: "hi" });
    const next = { greeting: "bye" };
    expect(stabilize(next)).toBe(next);
    expect(stabilize(next)).not.toBe(first);
  });

  it("treats different callbacks as different props (no stale closures)", () => {
    const stabilize = createPropsStabilizer();
    stabilize({ onSave: () => 1 });
    const next = { onSave: () => 2 };
    expect(stabilize(next)).toBe(next);
  });

  it("detects added and removed keys, and undefined transitions", () => {
    const stabilize = createPropsStabilizer();
    const a = stabilize({ x: 1 });
    expect(stabilize({ x: 1, y: undefined })).not.toBe(a);
    expect(stabilize(undefined)).toBeUndefined();
    const b = { x: 1 };
    expect(stabilize(b)).toBe(b);
  });
});
