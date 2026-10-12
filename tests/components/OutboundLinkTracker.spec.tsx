import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EVENTS } from '../../src/lib/analytics';
import OutboundLinkTracker from '../../src/components/OutboundLinkTracker';

const track = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/analytics')>()),
  trackEvent: track,
}));

function renderLinks() {
  return render(
    <>
      <OutboundLinkTracker />
      <a href="https://tickets.example.com/buy/42?token=secret">ticket</a>
      <a href="https://www.instagram.com/someone/">
        <span>insta</span>
      </a>
      <a href="/event/foo">internal</a>
      <a href={window.location.origin + '/about'}>same origin</a>
      <a href="mailto:a@example.com">mail</a>
    </>
  );
}

describe('OutboundLinkTracker', () => {
  beforeEach(() => {
    track.mockClear();
    // happy-dom would navigate to the clicked external href.
    const noNav = (e: Event) => e.preventDefault();
    document.addEventListener('click', noNav, true);
    return () => document.removeEventListener('click', noNav, true);
  });

  it('reports only the domain of an external link', () => {
    renderLinks();
    fireEvent.click(screen.getByText('ticket'));
    expect(track).toHaveBeenCalledWith(EVENTS.OUTBOUND_CLICK, {
      link_domain: 'tickets.example.com',
    });
  });

  it('catches clicks on elements nested inside a link', () => {
    renderLinks();
    fireEvent.click(screen.getByText('insta'));
    expect(track).toHaveBeenCalledWith(EVENTS.OUTBOUND_CLICK, {
      link_domain: 'www.instagram.com',
    });
  });

  it('ignores internal, same-origin and mailto links', () => {
    renderLinks();
    fireEvent.click(screen.getByText('internal'));
    fireEvent.click(screen.getByText('same origin'));
    fireEvent.click(screen.getByText('mail'));
    expect(track).not.toHaveBeenCalled();
  });

  it('stops listening when unmounted', () => {
    const { unmount } = renderLinks();
    unmount();
    const a = document.createElement('a');
    a.href = 'https://example.org/';
    document.body.appendChild(a);
    fireEvent.click(a);
    expect(track).not.toHaveBeenCalled();
    a.remove();
  });
});
