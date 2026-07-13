// The single source of truth for this example. Vite configs, the shell's
// remote map, remote .d.ts, and the Turbo dev pipeline all derive from here.
//
// After editing, run `pnpm gen` to refresh `.mfkit/generated/`.
import { defineConfig } from "@mfkit/kit";

export default defineConfig({
  version: 1,
  name: "minimal",
  shell: {
    name: "minimal_shell",
    framework: "react",
    path: "shell",
    // port omitted on purpose — MFKit defaults the shell to 3000 and logs
    // the inference once at dev startup.
  },
  mfes: [
    {
      name: "mfe_hello",
      framework: "react",
      route: "/hello",
      path: "mfe-hello",
      port: 5175,
      label: "Hello (React)",
      // The kit default expose map assumes ./src/lifecycle.ts; this MFE's
      // lifecycle is .tsx (it renders JSX), so the mapping is explicit.
      exposes: { "./lifecycle": "./src/lifecycle.tsx" },
    },
    {
      name: "mfe_clock",
      framework: "svelte",
      route: "/clock",
      path: "mfe-clock",
      port: 5176,
      label: "Clock (Svelte)",
    },
  ],
});
