import vue from "@vitejs/plugin-vue";

import type { FrameworkAdapter } from "@mfkit/plugin-api";

const adapter: FrameworkAdapter = {
  id: "vue",
  defaultShared: {
    vue: { singleton: true, requiredVersion: "^3.0.0" },
  },
  plugins: () => {
    const p = vue();
    return Array.isArray(p) ? p : [p];
  },
};

export default adapter;
