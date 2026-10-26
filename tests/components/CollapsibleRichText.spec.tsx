import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CollapsibleRichText from '../../src/components/CollapsibleRichText';

// jsdom has no layout: fake the measured heights on every element.
function mockHeights(scrollHeight: number, clientHeight: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(clientHeight);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CollapsibleRichText', () => {
  it('shows no toggle when the text fits', () => {
    mockHeights(100, 100);
    render(<CollapsibleRichText html="<p>Kurzer Text</p>" />);
    expect(screen.getByText('Kurzer Text')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers "Weiterlesen" when the text is cut off and toggles it', () => {
    mockHeights(400, 200);
    render(<CollapsibleRichText html="<p>Langer Text</p>" />);
    const toggle = screen.getByRole('button', { name: 'Weiterlesen' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    const less = screen.getByRole('button', { name: 'Weniger lesen' });
    expect(less).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(less);
    expect(screen.getByRole('button', { name: 'Weiterlesen' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('renders nothing visible for an empty description', () => {
    mockHeights(0, 0);
    render(<CollapsibleRichText html="" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
