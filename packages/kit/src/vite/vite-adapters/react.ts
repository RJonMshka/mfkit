import type { FrameworkAdapter } from "@mfkit/plugin-api";
import react from "@vitejs/plugin-react";

// No `requiredVersion` (review O2): @module-federation/vite fills it with
// `^<installed version>`. A hardcoded range went stale (React 19, Angular 18+)
// and was worse than stale — the MF plugin parses the *provided* version out of
// `requiredVersion`, so a React 19 app advertised itself as react@18.0.0.
const adapter: FrameworkAdapter = {
  id: "react",
  defaultShared: {
    react: { singleton: true },
    "react-dom": { singleton: true },
  },
  plugins: () => {
    const p = react();
    return Array.isArray(p) ? p : [p];
  },
};

export default adapter;
