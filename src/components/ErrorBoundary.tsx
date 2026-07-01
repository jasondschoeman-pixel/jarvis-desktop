// src/components/ErrorBoundary.tsx — Catches component errors so one view crash doesn't kill the app
import React from 'react';

interface Props {
  children: React.ReactNode;
  viewName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.viewName ? ' ' + this.props.viewName : ''}]`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="view-error">
          <h2>⚠️ View Error{this.props.viewName ? `: ${this.props.viewName}` : ''}</h2>
          <p className="view-error-msg">{this.state.error?.message || 'Unknown error'}</p>
          <button className="retry-btn" onClick={() => this.setState({ hasError: false, error: null })}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}