import { mfkitShell } from "@mfkit/kit/vite";
import { defineConfig } from "vite";

import config from "../mfkit.config";

// One manifest drives every app. `command` distinguishes `vite` (dev server)
// from `vite build`, so remote URLs point at the MFE dev servers during
// development and at production origins (or localhost previews) in builds.
export default defineConfig(({ command }) =>
  mfkitShell(config, { mode: command === "serve" ? "dev" : "build" }),
);
