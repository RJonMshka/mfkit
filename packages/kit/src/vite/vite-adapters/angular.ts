import angular from "@analogjs/vite-plugin-angular";

import type { FrameworkAdapter } from "@mfkit/plugin-api";

// No `requiredVersion` (review O2): @module-federation/vite fills it with
// `^<installed version>`. A hardcoded range went stale (React 19, Angular 18+)
// and was worse than stale — the MF plugin parses the *provided* version out of
// `requiredVersion`, so a React 19 app advertised itself as react@18.0.0.
const adapter: FrameworkAdapter = {
  id: "angular",
  defaultShared: {
    "@angular/core": { singleton: true },
    "@angular/common": { singleton: true },
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
