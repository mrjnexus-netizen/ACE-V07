import { Component, ErrorInfo, ReactNode } from 'react';
import { T } from '../context/TranslationContext';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    } else {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
  }

  private handleReset = () => {
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDev = import.meta.env.DEV;

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '40vh',
            padding: '2rem',
            color: 'var(--text-color)',
            backgroundColor: 'var(--surface-color)',
            fontFamily: 'var(--font-body)',
            textAlign: 'center',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
          }}
        >
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--accent-color)' }}>
            <T>Something went wrong</T>
          </h2>
          {isDev && this.state.error && (
            <pre
              style={{
                maxWidth: '100%',
                padding: '1rem',
                overflow: 'auto',
                textAlign: 'left',
                backgroundColor: 'var(--surface2-color)',
                borderRadius: '4px',
                fontSize: '0.85rem',
                marginBottom: '1rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                color: 'var(--text-muted-color)',
              }}
            >
              {this.state.error.toString()}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            style={{
              padding: '0.5rem 1.5rem',
              fontSize: '0.9rem',
              backgroundColor: 'var(--accent-color)',
              color: 'var(--surface-color)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
          >
            <T>Retry</T>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export const RouteErrorBoundary = () => {
  return (
    <ErrorBoundary>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          width: '100vw',
          color: 'var(--text-color)',
          backgroundColor: 'var(--surface-color)',
          fontFamily: 'var(--font-body)',
        }}
      >
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem', color: 'var(--accent-color)' }}>
          <T>Application Error</T>
        </h1>
        <p style={{ marginBottom: '2rem', opacity: 0.8, color: 'var(--text-muted-color)' }}>
          <T>A route-level error occurred. Please try reloading.</T>
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '0.75rem 2rem',
            fontSize: '1rem',
            backgroundColor: 'var(--accent-color)',
            color: 'var(--surface-color)',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          <T>Reload App</T>
        </button>
      </div>
    </ErrorBoundary>
  );
};