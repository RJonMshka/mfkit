import type { FrameworkAdapter } from "@mfkit/plugin-api";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const adapter: FrameworkAdapter = {
  id: "svelte",
  plugins: () => {
    const p = svelte();
    return Array.isArray(p) ? p : [p];
  },
};

export default adapter;
