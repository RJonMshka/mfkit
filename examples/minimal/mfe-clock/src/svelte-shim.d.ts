// Minimal *.svelte declaration so plain `tsc --noEmit` can typecheck files
// that import Svelte components. Full component-level checking is
// svelte-check's job and out of scope for this example.
declare module "*.svelte" {
  import type { Component } from "svelte";

  const component: Component<Record<string, unknown>>;
  export default component;
}
