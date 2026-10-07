// Identity-stable outlet props.
//
// `<MFKitOutlet props={{ greeting: "hi" }} />` is the natural thing to write,
// and an inline object literal is a new identity every render. The outlet's
// mount effect depends on `props`, so identity churn meant every re-render of
// any ancestor tore the MFE down and mounted it again — the same class of bug
// as dx-findings #7, one level down.
//
// Shallow equality (Object.is per key) rather than a structural stringify:
// props can carry callbacks and class instances, and two different callbacks
// must never compare equal — a stale closure handed to an MFE is worse than a
// remount. Kept out of React, like the entries cache, so it tests without a
// renderer.

export type OutletProps = Readonly<Record<string, unknown>> | undefined;

/**
 * Build a resolver that returns the previously-seen props object for as long
 * as the incoming one is shallow-equal to it. One per outlet instance.
 */
export function createPropsStabilizer(): (next: OutletProps) => OutletProps {
  let last: OutletProps;
  let initialized = false;
  return (next) => {
    if (initialized && shallowEqual(last, next)) return last;
    initialized = true;
    last = next;
    return next;
  };
}

function shallowEqual(a: OutletProps, b: OutletProps): boolean {
  if (Object.is(a, b)) return true;
  if (a === undefined || b === undefined) return false;
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  return ak.every((k) => Object.hasOwn(b, k) && Object.is(a[k], b[k]));
}
