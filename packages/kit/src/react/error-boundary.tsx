// Error boundary for the outlet. Must be a class component — React's only
// supported boundary mechanism. Scope is narrower than it looks: it catches
// render errors from the outlet's own React subtree (consumer-supplied slots).
// It does NOT see errors from inside a mounted MFE — every MFE renders into
// its own root (a separate React root, a Svelte/Vue app, an Angular platform),
// and errors never propagate across roots. Load/mount failures come through
// the controller's state machine; post-mount runtime errors are currently
// unobserved by the kit (tracked in docs/project-review-2026-10.md).

import { Component, type ErrorInfo, type ReactNode } from "react";

interface BoundaryProps {
  readonly onRetry: () => void;
  readonly onError?: (error: Error, info: ErrorInfo) => void;
  readonly fallback: (error: Error, retry: () => void) => ReactNode;
  readonly children: ReactNode;
}

interface BoundaryState {
  readonly error: Error | null;
}

export class MFEErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  private readonly handleRetry = (): void => {
    this.setState({ error: null });
    this.props.onRetry();
  };

  override render(): ReactNode {
    if (this.state.error) {
      return this.props.fallback(this.state.error, this.handleRetry);
    }
    return this.props.children;
  }
}
