import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../src/hooks/useStaffNotifications', () => ({
  useStaffNotifications: () => ({
    notifications: [],
    loading: false,
    unreadCount: 0,
    markAllRead: async () => {},
  }),
  useModeratorApplication: () => null,
  inviteModeratorApplicant: vi.fn(),
}));

import { StaffNotificationCard } from '../../src/components/StaffNotificationsTab';

const application = {
  id: 'n1',
  kind: 'application',
  audience: 'moderator',
  applicationId: 'app1',
  name: 'Maria Muster',
  email: 'maria@example.at',
  message: 'Ich kenne viele Veranstalter:innen in Tirol.',
  regionIds: ['tirol'],
  hasPhoto: false,
  readAt: null,
};

describe('StaffNotificationCard (moderator application)', () => {
  it('offers "Jetzt <Name> als Moderator hinzufügen" while the application is open', async () => {
    const onInvite = vi.fn(async () => ({ emailSent: true }));
    render(
      <StaffNotificationCard
        notification={application}
        applicationStatus="open"
        onInvite={onInvite}
      />
    );
    const button = screen.getByTestId('staff-note-invite');
    expect(button).toHaveTextContent('Jetzt Maria Muster als Moderator hinzufügen');
    expect(button).toBeEnabled();
    // The reminder to share the team's chat group is part of the note.
    expect(screen.getByText(/WhatsApp, Signal oder Telegram/)).toBeInTheDocument();

    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Einladung verschickt')
    );
    expect(onInvite).toHaveBeenCalledWith(undefined);
  });

  it('is inactive once the person finished the onboarding', () => {
    render(
      <StaffNotificationCard
        notification={application}
        applicationStatus="done"
        onInvite={vi.fn()}
      />
    );
    const button = screen.getByTestId('staff-note-invite');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Maria Muster ist schon Moderator:in');
  });

  it('is inactive while the status is unknown, and says when an invitation is out', () => {
    const { rerender } = render(
      <StaffNotificationCard
        notification={application}
        applicationStatus={null}
        onInvite={vi.fn()}
      />
    );
    expect(screen.getByTestId('staff-note-invite')).toBeDisabled();
    rerender(
      <StaffNotificationCard
        notification={application}
        applicationStatus="invited"
        onInvite={vi.fn()}
      />
    );
    expect(screen.getByTestId('staff-note-invite')).toBeEnabled();
    expect(screen.getByTestId('staff-note-invited')).toBeInTheDocument();
  });

  it('shows the server refusal in plain German', async () => {
    const onInvite = vi.fn(async () => {
      throw Object.assign(new Error('Not your region.'), { code: 'functions/permission-denied' });
    });
    render(
      <StaffNotificationCard
        notification={application}
        applicationStatus="open"
        onInvite={onInvite}
      />
    );
    fireEvent.click(screen.getByTestId('staff-note-invite'));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'nur Bewerbungen aus deiner eigenen Region'
      )
    );
  });

  it('application without region: a Super-Admin picks one when several are active', async () => {
    const onInvite = vi.fn(async () => ({ emailSent: true }));
    render(
      <StaffNotificationCard
        notification={{ ...application, audience: 'superAdmin', regionIds: [] }}
        applicationStatus="open"
        regionChoices={[
          { id: 'vorarlberg', name: 'Vorarlberg' },
          { id: 'tirol', name: 'Tirol' },
        ]}
        onInvite={onInvite}
      />
    );
    fireEvent.click(screen.getByTestId('staff-note-invite'));
    expect(screen.getByRole('alert')).toHaveTextContent('Region');
    expect(onInvite).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('staff-note-region'), { target: { value: 'tirol' } });
    fireEvent.click(screen.getByTestId('staff-note-invite'));
    await waitFor(() => expect(onInvite).toHaveBeenCalledWith('tirol'));
  });

  it('with a single active region there is no visible picker (dark launch)', async () => {
    const onInvite = vi.fn(async () => ({ emailSent: true }));
    render(
      <StaffNotificationCard
        notification={{ ...application, audience: 'superAdmin', regionIds: [] }}
        applicationStatus="open"
        regionChoices={[{ id: 'vorarlberg', name: 'Vorarlberg' }]}
        onInvite={onInvite}
      />
    );
    expect(screen.queryByTestId('staff-note-region')).toBeNull();
    expect(screen.queryByText(/Vorarlberg/)).toBeNull();
    fireEvent.click(screen.getByTestId('staff-note-invite'));
    await waitFor(() => expect(onInvite).toHaveBeenCalledWith('vorarlberg'));
  });
});

describe('StaffNotificationCard (new moderator)', () => {
  const note = {
    id: 'n2',
    kind: 'newModerator',
    audience: 'moderator',
    applicationId: null,
    name: 'Maria Muster',
    regionIds: ['tirol'],
    readAt: null,
  };

  it('names the region only when given (two active regions) and has no invite button', () => {
    const { rerender } = render(<StaffNotificationCard notification={note} onInvite={vi.fn()} />);
    expect(screen.getByRole('heading')).toHaveTextContent('Neue:r Moderator:in');
    expect(screen.getByRole('heading')).not.toHaveTextContent('Tirol');
    expect(screen.queryByTestId('staff-note-invite')).toBeNull();
    expect(screen.getByText(/WhatsApp, Signal oder Telegram/)).toBeInTheDocument();

    rerender(
      <StaffNotificationCard
        notification={{ ...note, audience: 'superAdmin' }}
        regionLabel="Tirol"
        onInvite={vi.fn()}
      />
    );
    expect(screen.getByRole('heading')).toHaveTextContent('Neue:r Moderator:in für Tirol');
    expect(screen.queryByText(/WhatsApp/)).toBeNull();
  });
});
