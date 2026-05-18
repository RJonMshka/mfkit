import { svelte } from "@sveltejs/vite-plugin-svelte";

import type { FrameworkAdapter } from "@mfkit/plugin-api";

const adapter: FrameworkAdapter = {
  id: "svelte",
  plugins: () => {
    const p = svelte();
    return Array.isArray(p) ? p : [p];
  },
};

export default adapter;
