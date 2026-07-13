import { mfkitMFE } from "@mfkit/kit/vite";
import { defineConfig } from "vite";

import config from "../mfkit.config";

export default defineConfig(({ command }) =>
  mfkitMFE(config, "mfe_clock", { mode: command === "serve" ? "dev" : "build" }),
);
