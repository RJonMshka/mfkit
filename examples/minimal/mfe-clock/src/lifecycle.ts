// The federated surface of this MFE — exposed as "./lifecycle" via the kit's
// default expose map. Svelte 5's imperative mount/unmount maps 1:1 onto the
// MFKit lifecycle contract.
import { defineMFE } from "@mfkit/kit";
import { mount, unmount } from "svelte";

import Clock from "./Clock.svelte";

const instances = new WeakMap<HTMLElement, Record<string, unknown>>();

export default defineMFE({
  mount(el, ctx) {
    if (ctx.signal.aborted) return;
    const instance = mount(Clock, { target: el, props: { basePath: ctx.basePath } });
    instances.set(el, instance);
  },
  unmount(el) {
    const instance = instances.get(el);
    if (instance) {
      instances.delete(el);
      void unmount(instance);
    }
  },
});
