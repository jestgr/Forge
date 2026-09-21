import React, { Component, ErrorInfo, ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  declare props: Props;
  state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("App caught render error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, fontFamily: 'system-ui, sans-serif', maxWidth: 600, margin: '60px auto', background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
          <h2 style={{ color: '#dc2626', marginTop: 0, fontSize: 20 }}>Application Error</h2>
          <p style={{ color: '#475569', fontSize: 14 }}>
            An unexpected error occurred while rendering the dashboard.
          </p>
          <pre style={{ background: '#f8fafc', padding: 12, borderRadius: 8, fontSize: 12, color: '#b91c1c', overflowX: 'auto', border: '1px solid #fee2e2' }}>
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button
              onClick={() => window.location.reload()}
              style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
            >
              Reload Page
            </button>
            <button
              onClick={() => {
                localStorage.removeItem('forge_workout_state');
                window.location.reload();
              }}
              style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', padding: '10px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
            >
              Reset Cached Workout State
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
