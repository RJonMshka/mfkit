// Minimal default slots. Structural only — no styling, no copy beyond what is
// needed for the user to see the state. Consumers replace these via the
// `loadingFallback`, `errorFallback`, and `quarantinedFallback` props.

import type { ReactElement } from "react";

import type {
  ErrorSlotInfo,
  LoadingSlotInfo,
  QuarantinedSlotInfo,
  RetryingSlotInfo,
} from "./types.js";

export function DefaultLoading(info: LoadingSlotInfo): ReactElement {
  const label = info.entry.label ?? info.entry.name;
  return (
    <div role="status" aria-busy="true" data-mfkit-state="loading">
      Loading {label}…
    </div>
  );
}

export function DefaultRetrying(info: RetryingSlotInfo): ReactElement {
  const label = info.entry.label ?? info.entry.name;
  return (
    <div role="status" aria-busy="true" data-mfkit-state="retrying">
      Retrying {label} (attempt {info.attempt})…
    </div>
  );
}

export function DefaultError(info: ErrorSlotInfo): ReactElement {
  const label = info.entry.label ?? info.entry.name;
  return (
    <div role="alert" data-mfkit-state="error">
      <p>
        {label} failed to load: {info.error.message}
      </p>
      <button type="button" onClick={info.retry}>
        Retry
      </button>
    </div>
  );
}

export function DefaultQuarantined(info: QuarantinedSlotInfo): ReactElement {
  const label = info.entry.label ?? info.entry.name;
  return (
    <div role="alert" data-mfkit-state="quarantined">
      <p>
        {label} is quarantined: {info.reason}
      </p>
      <button type="button" onClick={info.retry}>
        Try again
      </button>
    </div>
  );
}
