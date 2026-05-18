import angular from "@analogjs/vite-plugin-angular";

import type { FrameworkAdapter } from "@mfkit/plugin-api";

const adapter: FrameworkAdapter = {
  id: "angular",
  defaultShared: {
    "@angular/core": { singleton: true, requiredVersion: "^17.0.0" },
    "@angular/common": { singleton: true, requiredVersion: "^17.0.0" },
  },
  optimizeDepsExclude: [
    "@angular/core",
    "@angular/common",
    "@angular/platform-browser",
    "@analogjs/vite-plugin-angular",
  ],
  plugins: () => {
    const p = angular();
    return Array.isArray(p) ? p : [p];
  },
};

export default adapter;
