import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DuplicateEventDialog from '../../src/components/DuplicateEventDialog';

const candidates = [
  {
    id: 'e1',
    slug: 'kakao-yoga-in-dornbirn-20261205',
    title: 'Kakaozeremonie',
    date: '2026-12-05',
    time: '19:00',
    endTime: '21:00',
    place: 'Marktplatz 3',
    city: 'Dornbirn',
  },
  { id: 'e2', title: 'Online Kreis', date: '2026-12-05', isOnline: true },
];

function setup(props = {}) {
  const handlers = {
    onSubmitAnyway: vi.fn(),
    onSaveDraft: vi.fn(),
    onBack: vi.fn(),
    onDiscard: vi.fn(),
  };
  render(<DuplicateEventDialog isOpen candidates={candidates} {...handlers} {...props} />);
  return handlers;
}

describe('DuplicateEventDialog', () => {
  it('renders nothing when closed', () => {
    render(<DuplicateEventDialog isOpen={false} candidates={candidates} />);
    expect(screen.queryByTestId('duplicate-candidate')).not.toBeInTheDocument();
  });

  it('shows every candidate with date, time, place and a link in a new tab', () => {
    setup();
    expect(screen.getAllByTestId('duplicate-candidate')).toHaveLength(2);
    const link = screen.getByRole('link', { name: /Kakaozeremonie/ });
    expect(link).toHaveAttribute('href', '/event/kakao-yoga-in-dornbirn-20261205');
    expect(link).toHaveAttribute('target', '_blank');
    expect(
      screen.getByText(/05\.12\.2026 · 19:00 – 21:00 Uhr · Marktplatz 3, Dornbirn/)
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Online Kreis/ })).toHaveAttribute('href', '/event/e2');
  });

  it('calls the matching callback for each option', () => {
    const h = setup();
    fireEvent.click(screen.getByText('Mein Event ist anders, trotzdem einreichen'));
    fireEvent.click(screen.getByText('Als Entwurf speichern'));
    fireEvent.click(screen.getByText('Zurück und ändern'));
    fireEvent.click(screen.getByText('Mein Event verwerfen'));
    expect(h.onSubmitAnyway).toHaveBeenCalledTimes(1);
    expect(h.onSaveDraft).toHaveBeenCalledTimes(1);
    expect(h.onBack).toHaveBeenCalledTimes(1);
    expect(h.onDiscard).toHaveBeenCalledTimes(1);
  });
});
