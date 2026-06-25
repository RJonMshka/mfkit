// @mfkit/kit/react — React-side outlet, provider, and slot types.
//
// Subpath entry. Pulled only by React consumers; Svelte/Vue-only builds never
// touch this file (enforced by tests/vite/subpath-isolation.test.ts).

export {
  createOutletController,
  type OutletController,
  type OutletControllerOptions,
} from "./react/controller.js";
export {
  DefaultError,
  DefaultLoading,
  DefaultQuarantined,
  DefaultRetrying,
} from "./react/default-slots.js";
export { MFKitOutlet } from "./react/outlet.js";
export {
  MFKitProvider,
  type MFKitProviderProps,
  type MFKitProviderValue,
  useMFKitContext,
} from "./react/provider.js";
export type {
  ErrorSlotInfo,
  LoadingSlotInfo,
  LoadRemote,
  MFKitOutletProps,
  OutletState,
  QuarantinedSlotInfo,
  RetryingSlotInfo,
} from "./react/types.js";
