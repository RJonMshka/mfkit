import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text-summary", "json-summary", "html"],
      // Ratchet (testing plan L1): raise these as coverage grows; never lower
      // them to make a PR pass. Healing and port derivation *are* the product,
      // so they carry the strictest gate.
      thresholds: {
        lines: 90,
        branches: 85,
        "src/healing/**": { branches: 95, lines: 95 },
        "src/vite/derive.ts": { branches: 95, lines: 95 },
      },
    },
  },
});
