import react from "@vitejs/plugin-react";

import type { FrameworkAdapter } from "@mfkit/plugin-api";

const adapter: FrameworkAdapter = {
  id: "react",
  defaultShared: {
    react: { singleton: true, requiredVersion: "^18.0.0" },
    "react-dom": { singleton: true, requiredVersion: "^18.0.0" },
  },
  plugins: () => {
    const p = react();
    return Array.isArray(p) ? p : [p];
  },
};

export default adapter;
