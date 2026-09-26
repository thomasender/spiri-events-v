import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import NotificationPreferencesCard from '../../src/components/NotificationPreferencesCard';

const allOn = {
  notifyOnSubmitted: true,
  notifyOnChangesRequested: true,
  notifyOnPublished: true,
  notifyOnDeleted: true,
  notifyNewsletter: true,
  notifyOnContactMessage: true,
};

describe('NotificationPreferencesCard', () => {
  it('renders four checkboxes (including the newsletter one) for non-admin users', () => {
    render(
      <NotificationPreferencesCard
        preferences={allOn}
        isAdmin={false}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.getByTestId('notification-pref-notifyOnChangesRequested')).toBeInTheDocument();
    expect(screen.getByTestId('notification-pref-notifyOnPublished')).toBeInTheDocument();
    expect(screen.getByTestId('notification-pref-notifyOnDeleted')).toBeInTheDocument();
    expect(screen.getByTestId('notification-pref-notifyNewsletter')).toBeInTheDocument();
    expect(screen.queryByTestId('notification-pref-notifyOnSubmitted')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('notification-pref-notifyOnContactMessage')
    ).not.toBeInTheDocument();
  });

  it('renders six checkboxes (including admin-only ones) for admins', () => {
    render(
      <NotificationPreferencesCard
        preferences={allOn}
        isAdmin
        onSave={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.getByTestId('notification-pref-notifyOnSubmitted')).toBeInTheDocument();
    expect(screen.getByTestId('notification-pref-notifyOnChangesRequested')).toBeInTheDocument();
    expect(screen.getByTestId('notification-pref-notifyOnPublished')).toBeInTheDocument();
    expect(screen.getByTestId('notification-pref-notifyOnDeleted')).toBeInTheDocument();
    expect(screen.getByTestId('notification-pref-notifyNewsletter')).toBeInTheDocument();
    expect(screen.getByTestId('notification-pref-notifyOnContactMessage')).toBeInTheDocument();
  });

  it('reflects the current preference values on the checkboxes', () => {
    render(
      <NotificationPreferencesCard
        preferences={{
          notifyOnChangesRequested: true,
          notifyOnPublished: false,
          notifyOnDeleted: true,
          notifyNewsletter: false,
        }}
        isAdmin={false}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.getByTestId('notification-pref-notifyOnChangesRequested')).toBeChecked();
    expect(screen.getByTestId('notification-pref-notifyOnPublished')).not.toBeChecked();
    expect(screen.getByTestId('notification-pref-notifyOnDeleted')).toBeChecked();
    expect(screen.getByTestId('notification-pref-notifyNewsletter')).not.toBeChecked();
  });

  it('calls onSave with the toggled preference when a checkbox changes', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<NotificationPreferencesCard preferences={allOn} isAdmin={false} onSave={onSave} />);

    fireEvent.click(screen.getByTestId('notification-pref-notifyOnPublished'));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith({ notifyOnPublished: false });
  });

  it('calls onSave with notifyNewsletter=true when the newsletter checkbox is toggled on', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <NotificationPreferencesCard
        preferences={{ ...allOn, notifyNewsletter: false }}
        isAdmin={false}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByTestId('notification-pref-notifyNewsletter'));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenLastCalledWith({ notifyNewsletter: true });
  });

  it('shows a brief "Gespeichert." indicator after a successful toggle', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<NotificationPreferencesCard preferences={allOn} isAdmin={false} onSave={onSave} />);

    fireEvent.click(screen.getByTestId('notification-pref-notifyOnPublished'));

    await waitFor(() => {
      expect(screen.getByTestId('notification-pref-saved')).toBeInTheDocument();
    });
  });

  it('shows an error message when save fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('boom'));
    render(<NotificationPreferencesCard preferences={allOn} isAdmin={false} onSave={onSave} />);

    fireEvent.click(screen.getByTestId('notification-pref-notifyOnPublished'));

    await waitFor(() => {
      expect(screen.getByTestId('notification-pref-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('notification-pref-error').textContent).toMatch(
      /Einstellung konnte nicht gespeichert werden/i
    );
  });

  it('toggles a checkbox back to its previous value and saves the new state', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <NotificationPreferencesCard preferences={allOn} isAdmin={false} onSave={onSave} />
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('notification-pref-notifyOnDeleted'));
    });

    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith({ notifyOnDeleted: false }));

    await act(async () => {
      rerender(
        <NotificationPreferencesCard
          preferences={{ ...allOn, notifyOnDeleted: false }}
          isAdmin={false}
          onSave={onSave}
        />
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('notification-pref-notifyOnDeleted'));
    });

    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith({ notifyOnDeleted: true }));
  });
});
