import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  readonly fallback: ReactNode;
  readonly children: ReactNode;
  readonly onError?: (error: unknown, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  readonly failed: boolean;
}

/**
 * Shows `fallback` instead of crashing when a child throws, e.g. when WebGL
 * is unavailable or the HDRI can't be downloaded. React only supports this
 * through a class component.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
