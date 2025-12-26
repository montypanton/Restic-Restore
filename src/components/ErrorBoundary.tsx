import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Application error caught by boundary:', error, errorInfo);
    this.setState({
      errorInfo: errorInfo.componentStack
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px',
          maxWidth: '600px',
          margin: '80px auto',
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <h2 style={{ marginBottom: '16px', fontSize: '24px' }}>
            Something went wrong
          </h2>
          <p style={{ marginBottom: '24px', color: '#666' }}>
            The application encountered an unexpected error. Please try reloading.
          </p>

          <button
            onClick={this.handleReload}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              backgroundColor: '#007AFF',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              marginBottom: '24px'
            }}
          >
            Reload Application
          </button>

          {this.state.error && (
            <details style={{
              marginTop: '24px',
              textAlign: 'left',
              padding: '16px',
              backgroundColor: '#f5f5f5',
              borderRadius: '8px',
              fontSize: '14px'
            }}>
              <summary style={{
                cursor: 'pointer',
                fontWeight: 'bold',
                marginBottom: '8px'
              }}>
                Error details
              </summary>
              <pre style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: '8px 0',
                color: '#d32f2f'
              }}>
                {this.state.error.message}
              </pre>
              {this.state.errorInfo && (
                <pre style={{
                  whiteSpace: 'pre-wrap',
                  fontSize: '12px',
                  color: '#666',
                  maxHeight: '200px',
                  overflow: 'auto'
                }}>
                  {this.state.errorInfo}
                </pre>
              )}
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
