import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EventAdminListRow from '../../src/components/EventAdminListRow';

function renderRow(props: Record<string, unknown> = {}) {
  const defaultEvent = {
    id: 'e1',
    title: 'Test Event',
    date: '2026-09-15',
    time: '18:00',
    place: 'Test Place',
    category: 'Yoga',
    status: 'draft',
    recurrence: 'none',
  };
  return render(
    <MemoryRouter>
      <EventAdminListRow event={defaultEvent} {...props} />
    </MemoryRouter>
  );
}

describe('EventAdminListRow — trash actions (oSwjBKM3)', () => {
  it('renders the regular trash button when no onRestore is provided', () => {
    const onDeleteClick = vi.fn();
    renderRow({ onDeleteClick });
    expect(screen.getByRole('button', { name: /event löschen/i })).toBeInTheDocument();
    expect(screen.queryByTestId('trash-restore-button-e1')).not.toBeInTheDocument();
  });

  it('renders a restore and permanent-delete button when onRestore is provided', () => {
    const onRestore = vi.fn();
    const onPermanentDelete = vi.fn();
    renderRow({ onRestore, onPermanentDelete });
    expect(screen.getByTestId('trash-restore-button-e1')).toBeInTheDocument();
    expect(screen.getByTestId('trash-permanent-delete-button-e1')).toBeInTheDocument();
  });

  it('hides the edit link when onRestore is provided', () => {
    renderRow({ onRestore: vi.fn(), onPermanentDelete: vi.fn() });
    expect(screen.queryByRole('link', { name: /bearbeiten/i })).not.toBeInTheDocument();
  });

  it('triggers onRestore with the event when restore button clicked', () => {
    const onRestore = vi.fn();
    renderRow({ onRestore, onPermanentDelete: vi.fn() });
    screen.getByTestId('trash-restore-button-e1').click();
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onRestore.mock.calls[0][0].id).toBe('e1');
  });

  it('triggers onPermanentDelete with the event when permanent delete button clicked', () => {
    const onPermanentDelete = vi.fn();
    renderRow({ onRestore: vi.fn(), onPermanentDelete });
    screen.getByTestId('trash-permanent-delete-button-e1').click();
    expect(onPermanentDelete).toHaveBeenCalledTimes(1);
    expect(onPermanentDelete.mock.calls[0][0].id).toBe('e1');
  });

  it('falls back to onDeleteClick when onPermanentDelete is not provided', () => {
    const onDeleteClick = vi.fn();
    renderRow({ onDeleteClick });
    screen.getByRole('button', { name: /event löschen/i }).click();
    expect(onDeleteClick).toHaveBeenCalledTimes(1);
  });
});

describe('EventAdminListRow — Gelöscht am meta (oSwjBKM3)', () => {
  it('does not render trashedAt meta when showTrashedAt is false', () => {
    renderRow({
      event: {
        id: 'e1',
        title: 'Test Event',
        date: '2026-09-15',
        time: '18:00',
        place: 'Test Place',
        category: 'Yoga',
        status: 'trashed',
        recurrence: 'none',
        trashedAt: { toDate: () => new Date('2026-09-01') },
      },
    });
    expect(screen.queryByTestId('trash-event-trashed-at-e1')).not.toBeInTheDocument();
  });

  it('renders trashedAt meta when showTrashedAt is true', () => {
    renderRow({
      showTrashedAt: true,
      event: {
        id: 'e1',
        title: 'Test Event',
        date: '2026-09-15',
        time: '18:00',
        place: 'Test Place',
        category: 'Yoga',
        status: 'trashed',
        recurrence: 'none',
        trashedAt: { toDate: () => new Date('2026-09-01') },
      },
    });
    const meta = screen.getByTestId('trash-event-trashed-at-e1');
    expect(meta).toBeInTheDocument();
    expect(meta).toHaveTextContent(/Gelöscht am/);
  });
});
