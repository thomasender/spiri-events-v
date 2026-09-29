import { Component, Suspense, lazy, useState } from 'react';

const RichTextEditor = lazy(() => import('./RichTextEditor.jsx'));

function RichTextEditorFallback() {
  return (
    <div
      style={{
        minHeight: 200,
        padding: '12px 16px',
        background: 'var(--bg-calendar)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--text-light)',
        fontSize: '0.9rem',
      }}
    >
      Editor lädt…
    </div>
  );
}

class ChunkLoadBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('Rich text editor chunk failed to load:', error);
    }
  }

  handleRetry = () => {
    this.setState({ error: null });
    this.props.onRetry();
  };

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          data-testid="rich-text-editor-load-error"
          style={{
            minHeight: 200,
            padding: '12px 16px',
            background: 'var(--bg-calendar)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-light)',
            fontSize: '0.9rem',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <span>Der Bio-Editor konnte nicht geladen werden.</span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={this.handleRetry}
            data-testid="rich-text-editor-retry"
          >
            Erneut versuchen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function RichTextEditorLazy(props) {
  const [retryCount, setRetryCount] = useState(0);
  return (
    <ChunkLoadBoundary onRetry={() => setRetryCount((n) => n + 1)}>
      <Suspense key={retryCount} fallback={<RichTextEditorFallback />}>
        <RichTextEditor {...props} />
      </Suspense>
    </ChunkLoadBoundary>
  );
}
