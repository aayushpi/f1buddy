import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  label?: string
}
interface State {
  error: Error | null
}

// Converts a render-time crash into a visible, readable message (with the
// stack) instead of a blank screen — essential for diagnosing issues remotely.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="panel" style={{ flex: 1, display: 'flex' }}>
          <div className="empty-state">
            <div className="big">⚠ {this.props.label ?? 'Something went wrong rendering this view'}</div>
            <div style={{ maxWidth: 560, lineHeight: 1.5, color: 'var(--amber)' }}>
              {this.state.error.message}
            </div>
            <button className="es-btn primary" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
