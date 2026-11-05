import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class AppErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Miroir render error:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main role="alert" style={{ minHeight: '100vh', padding: '32px', background: '#0B0F19', color: '#F8FAFC', fontFamily: 'system-ui, sans-serif' }}>
        <section style={{ maxWidth: '640px', margin: '10vh auto', padding: '28px', border: '1px solid #334155', borderRadius: '16px', background: '#111827' }}>
          <h1 style={{ margin: '0 0 12px', fontSize: '22px' }}>Miroir couldn’t render this screen</h1>
          <p style={{ color: '#CBD5E1', lineHeight: 1.6 }}>The app encountered a display error instead of loading normally. The details below can help identify the cause.</p>
          {import.meta.env.DEV && <pre style={{ maxHeight: '240px', overflow: 'auto', whiteSpace: 'pre-wrap', color: '#FCA5A5', fontSize: '12px' }}>{String(this.state.error?.stack || this.state.error?.message || this.state.error)}</pre>}
          <button onClick={() => window.location.assign('/')} style={{ marginTop: '12px', padding: '10px 16px', border: 0, borderRadius: '8px', background: '#3B82F6', color: 'white', cursor: 'pointer' }}>Return to Start</button>
        </section>
      </main>
    )
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
