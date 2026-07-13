// The federated surface of this MFE — exposed as "./lifecycle" by the kit's
// default expose map. The shell only ever sees { mount, unmount }.
import { defineMFE } from "@mfkit/kit";
import { createRoot, type Root } from "react-dom/client";

import { Hello } from "./Hello";

export interface HelloProps {
  readonly greeting?: string | undefined;
}

// One React root per container — a host may mount several instances.
const roots = new WeakMap<HTMLElement, Root>();

export default defineMFE<HelloProps>({
  mount(el, ctx, props) {
    if (ctx.signal.aborted) return;
    const root = createRoot(el);
    roots.set(el, root);
    root.render(<Hello greeting={props?.greeting} basePath={ctx.basePath} />);
  },
  unmount(el) {
    roots.get(el)?.unmount();
    roots.delete(el);
  },
});
