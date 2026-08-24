import { lazy, Suspense } from 'react';

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

export default function RichTextEditorLazy(props) {
  return (
    <Suspense fallback={<RichTextEditorFallback />}>
      <RichTextEditor {...props} />
    </Suspense>
  );
}
