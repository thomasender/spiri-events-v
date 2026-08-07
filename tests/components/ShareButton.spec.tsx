import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ShareButton from '../../src/components/ShareButton';

const mockEvent = {
  id: 'event-1',
  slug: 'mindful-yoga-flow-bregenz-20260815',
  title: 'Mindful Yoga Flow',
};

function setClipboardMock() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  return writeText;
}

describe('ShareButton', () => {
  beforeEach(() => {
    setClipboardMock();
    window.open = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the trigger button', () => {
    render(<ShareButton event={mockEvent} />);
    expect(screen.getByTestId('share-event-button')).toBeInTheDocument();
    expect(screen.getByText('Teilen')).toBeInTheDocument();
  });

  it('does not render the overlay until the trigger is clicked', () => {
    render(<ShareButton event={mockEvent} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the overlay listing every channel plus the copy link action', () => {
    render(<ShareButton event={mockEvent} />);
    fireEvent.click(screen.getByTestId('share-event-button'));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Event teilen');
    expect(dialog).toHaveTextContent(mockEvent.title);

    for (const channel of ['facebook', 'instagram', 'whatsapp', 'telegram', 'signal']) {
      expect(screen.getByTestId(`share-channel-${channel}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('share-copy-link')).toBeInTheDocument();
  });

  it('opens the Facebook sharer with the event URL', () => {
    render(<ShareButton event={mockEvent} />);
    fireEvent.click(screen.getByTestId('share-event-button'));
    fireEvent.click(screen.getByTestId('share-channel-facebook'));

    expect(window.open).toHaveBeenCalledTimes(1);
    const [url, target, features] = window.open.mock.calls[0];
    expect(url).toContain('https://www.facebook.com/sharer/sharer.php');
    expect(url).toContain(encodeURIComponent('/event/mindful-yoga-flow-bregenz-20260815'));
    expect(target).toBe('_blank');
    expect(features).toContain('noopener');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the WhatsApp share endpoint with the event URL', () => {
    render(<ShareButton event={mockEvent} />);
    fireEvent.click(screen.getByTestId('share-event-button'));
    fireEvent.click(screen.getByTestId('share-channel-whatsapp'));

    expect(window.open).toHaveBeenCalledTimes(1);
    const [url] = window.open.mock.calls[0];
    expect(url).toContain('https://wa.me/');
    expect(url).toContain(encodeURIComponent('/event/mindful-yoga-flow-bregenz-20260815'));
  });

  it('opens the Telegram share endpoint with title and event URL', () => {
    render(<ShareButton event={mockEvent} />);
    fireEvent.click(screen.getByTestId('share-event-button'));
    fireEvent.click(screen.getByTestId('share-channel-telegram'));

    expect(window.open).toHaveBeenCalledTimes(1);
    const [url] = window.open.mock.calls[0];
    expect(url).toContain('https://t.me/share/url');
    expect(url).toContain(encodeURIComponent('/event/mindful-yoga-flow-bregenz-20260815'));
    expect(url).toContain(encodeURIComponent(mockEvent.title));
  });

  it('falls back to clipboard when Web Share API is unavailable for Instagram', async () => {
    render(<ShareButton event={mockEvent} />);
    fireEvent.click(screen.getByTestId('share-event-button'));
    fireEvent.click(screen.getByTestId('share-channel-instagram'));

    expect(window.open).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('/event/mindful-yoga-flow-bregenz-20260815')
      )
    );
    await waitFor(() =>
      expect(screen.getByTestId('share-copy-link')).toHaveTextContent('Kopiert!')
    );
  });

  it('copies the link and shows confirmation feedback', async () => {
    render(<ShareButton event={mockEvent} />);
    fireEvent.click(screen.getByTestId('share-event-button'));
    fireEvent.click(screen.getByTestId('share-copy-link'));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('/event/mindful-yoga-flow-bregenz-20260815')
      )
    );
    await waitFor(() =>
      expect(screen.getByTestId('share-copy-link')).toHaveTextContent('Kopiert!')
    );
  });

  it('uses the event id when the slug is missing', () => {
    render(<ShareButton event={{ id: 'legacy-id-123', title: 'Legacy Event' }} />);
    fireEvent.click(screen.getByTestId('share-event-button'));
    fireEvent.click(screen.getByTestId('share-channel-facebook'));

    const [url] = window.open.mock.calls[0];
    expect(url).toContain(encodeURIComponent('/event/legacy-id-123'));
  });

  it('closes the overlay when the close button is clicked', () => {
    render(<ShareButton event={mockEvent} />);
    fireEvent.click(screen.getByTestId('share-event-button'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the overlay when the Escape key is pressed', () => {
    render(<ShareButton event={mockEvent} />);
    fireEvent.click(screen.getByTestId('share-event-button'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
