// Error boundary for the outlet. Must be a class component — React's only
// supported boundary mechanism. Catches synchronous render-time errors thrown
// from inside a successfully-mounted MFE; load/mount errors come through the
// controller's state machine and never reach the boundary.

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
