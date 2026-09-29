// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../src/components/RichTextEditor.jsx', () => {
  throw new Error('Simulated chunk load failure');
});

import RichTextEditorLazy from '../../src/components/RichTextEditorLazy';

describe('RichTextEditorLazy — chunk load failure', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a localized fallback when the lazy chunk fails to load', async () => {
    render(<RichTextEditorLazy testId="rte" value="" onChange={() => {}} maxLength={500} />);

    const alert = await screen.findByTestId('rich-text-editor-load-error');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Bio-Editor konnte nicht geladen werden/);
    expect(screen.getByTestId('rich-text-editor-retry')).toBeInTheDocument();
  });

  it('the fallback is contained — it does not throw to the parent tree', () => {
    const renderInParent = () =>
      render(
        <div data-testid="parent">
          <RichTextEditorLazy testId="rte" value="" onChange={() => {}} maxLength={500} />
        </div>
      );

    expect(renderInParent).not.toThrow();
    expect(screen.getByTestId('parent')).toBeInTheDocument();
  });
});
