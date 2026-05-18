import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    vite: "src/vite.ts",
    react: "src/react.ts",
    healing: "src/healing.ts",
    "vite-adapters/react": "src/vite/vite-adapters/react.ts",
    "vite-adapters/svelte": "src/vite/vite-adapters/svelte.ts",
    "vite-adapters/vue": "src/vite/vite-adapters/vue.ts",
    "vite-adapters/lit": "src/vite/vite-adapters/lit.ts",
    "vite-adapters/angular": "src/vite/vite-adapters/angular.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  splitting: false,
  external: [
    "@analogjs/vite-plugin-angular",
    "@module-federation/vite",
    "@sveltejs/vite-plugin-svelte",
    "@vitejs/plugin-react",
    "@vitejs/plugin-vue",
    "react",
    "react-dom",
    "vite",
  ],
});
