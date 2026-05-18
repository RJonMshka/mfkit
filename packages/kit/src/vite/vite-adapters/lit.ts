// Lit uses native ESM and standard custom elements — Vite needs no Lit-specific
// plugin to dev/build a Lit MFE. The adapter exists so framework: "lit" in the
// manifest resolves to a defined contributor instead of an "unknown framework"
// error; it intentionally contributes zero plugins and zero default shared
// deps. Lit MFEs may still declare custom shared singletons in the manifest.

import type { FrameworkAdapter } from "@mfkit/plugin-api";

const adapter: FrameworkAdapter = {
  id: "lit",
  plugins: () => [],
};

export default adapter;
