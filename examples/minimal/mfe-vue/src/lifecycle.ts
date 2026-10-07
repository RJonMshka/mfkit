// The federated surface of this MFE — exposed as "./lifecycle" via the kit's
// default expose map. A Vue app per container maps 1:1 onto the contract.
import { defineMFE } from "@mfkit/kit";
import { type App, createApp } from "vue";

import Counter from "./Counter.vue";

const apps = new WeakMap<HTMLElement, App>();

export default defineMFE({
  mount(el, ctx) {
    if (ctx.signal.aborted) return;
    const app = createApp(Counter, { basePath: ctx.basePath });
    app.mount(el);
    apps.set(el, app);
  },
  unmount(el) {
    apps.get(el)?.unmount();
    apps.delete(el);
  },
});
