import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    vite: "src/vite.ts",
    react: "src/react.ts",
    healing: "src/healing.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  splitting: false,
  external: [
    "@module-federation/vite",
    "react",
    "react-dom",
    "vite",
  ],
});
