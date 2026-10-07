// Minimal *.vue declaration so plain `tsc --noEmit` can typecheck files that
// import SFCs. Full SFC checking is vue-tsc's job and out of scope here.
declare module "*.vue" {
  import type { DefineComponent } from "vue";

  const component: DefineComponent<Record<string, unknown>>;
  export default component;
}
