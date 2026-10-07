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
      // `exposes` omitted on purpose: the kit probes ./src/lifecycle.{ts,tsx,…}
      // and finds this MFE's .tsx lifecycle (dx-findings #5). The example
      // dogfoods the inference rather than hardcoding the path.
    },
    {
      name: "mfe_clock",
      framework: "svelte",
      route: "/clock",
      path: "mfe-clock",
      port: 5176,
      label: "Clock (Svelte)",
    },
    {
      name: "mfe_vue",
      framework: "vue",
      route: "/vue",
      path: "mfe-vue",
      port: 5177,
      label: "Counter (Vue)",
    },
    {
      name: "mfe_lit",
      framework: "lit",
      route: "/lit",
      path: "mfe-lit",
      port: 5178,
      label: "Badge (Lit)",
    },
  ],
});
