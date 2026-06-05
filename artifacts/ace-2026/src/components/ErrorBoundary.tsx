import React, { Component, ErrorInfo, ReactNode } from "react";

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
      console.error("Uncaught error inside ErrorBoundary:", error, errorInfo);
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

      const isDev = process.env.NODE_ENV === "development";

      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "40vh",
            padding: "2rem",
            color: "var(--text-color, #f2f2f2)",
            backgroundColor: "var(--background-color, #1a1a1a)",
            fontFamily: "var(--font-family, sans-serif)",
            textAlign: "center",
            borderRadius: "4px",
            border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
          }}
        >
          <h2 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
            Something went wrong
          </h2>
          {isDev && this.state.error && (
            <pre
              style={{
                maxWidth: "100%",
                padding: "1rem",
                overflow: "auto",
                textAlign: "left",
                backgroundColor: "rgba(0, 0, 0, 0.3)",
                borderRadius: "4px",
                fontSize: "0.85rem",
                marginBottom: "1rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {this.state.error.toString()}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            style={{
              padding: "0.5rem 1.5rem",
              fontSize: "0.9rem",
              backgroundColor: "var(--primary-color, #007bff)",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              transition: "opacity 0.2s",
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
          >
            Retry
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
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          width: "100vw",
          color: "var(--text-color, #f2f2f2)",
          backgroundColor: "var(--background-color, #1a1a1a)",
          fontFamily: "var(--font-family, sans-serif)",
        }}
      >
        <h1 style={{ fontSize: "2rem", marginBottom: "1rem" }}>
          Application Error
        </h1>
        <p style={{ marginBottom: "2rem", opacity: 0.8 }}>
          A route-level error occurred. Please try reloading.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "0.75rem 2rem",
            fontSize: "1rem",
            backgroundColor: "var(--primary-color, #007bff)",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Reload App
        </button>
      </div>
    </ErrorBoundary>
  );
};
