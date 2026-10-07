// The federated surface of this MFE — exposed as "./lifecycle" via the kit's
// default expose map. Lit renders into its own shadow root, so its styles
// travel with the element (no CSS asset for kit to inject).
import { defineMFE } from "@mfkit/kit";

import { MfkitLitBadge, TAG } from "./badge";

// customElements.define throws on a second definition — a remount, or two
// instances, must not crash the MFE.
if (!customElements.get(TAG)) customElements.define(TAG, MfkitLitBadge);

export default defineMFE({
  mount(el, ctx) {
    if (ctx.signal.aborted) return;
    const badge = document.createElement(TAG) as MfkitLitBadge;
    badge.basePath = ctx.basePath;
    el.replaceChildren(badge);
  },
  unmount(el) {
    el.replaceChildren();
  },
});
