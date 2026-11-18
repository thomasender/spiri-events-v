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

  describe('chat e-mail switches', () => {
    const chatKeys = ['notifyOnDirectMessage', 'notifyOnEventChat'];

    it('stay hidden while Postfach and Event Chat are closed (dark launch)', () => {
      render(
        <NotificationPreferencesCard
          preferences={allOn}
          isAdmin
          onSave={vi.fn().mockResolvedValue(undefined)}
        />
      );
      for (const key of chatKeys) {
        expect(screen.queryByTestId(`notification-pref-${key}`)).not.toBeInTheDocument();
      }
    });

    it('show each switch only with its own feature open', () => {
      const { rerender } = render(
        <NotificationPreferencesCard
          preferences={allOn}
          messengerAvailable
          onSave={vi.fn().mockResolvedValue(undefined)}
        />
      );
      expect(screen.getByTestId('notification-pref-notifyOnDirectMessage')).toBeInTheDocument();
      expect(screen.queryByTestId('notification-pref-notifyOnEventChat')).not.toBeInTheDocument();

      rerender(
        <NotificationPreferencesCard
          preferences={allOn}
          chatAvailable
          onSave={vi.fn().mockResolvedValue(undefined)}
        />
      );
      expect(screen.getByTestId('notification-pref-notifyOnEventChat')).toBeInTheDocument();
      expect(
        screen.queryByTestId('notification-pref-notifyOnDirectMessage')
      ).not.toBeInTheDocument();
    });

    it('reflect the stored value and save a change', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      render(
        <NotificationPreferencesCard
          preferences={{ notifyOnDirectMessage: true, notifyOnEventChat: false }}
          messengerAvailable
          chatAvailable
          onSave={onSave}
        />
      );
      expect(screen.getByTestId('notification-pref-notifyOnDirectMessage')).toBeChecked();
      expect(screen.getByTestId('notification-pref-notifyOnEventChat')).not.toBeChecked();

      fireEvent.click(screen.getByTestId('notification-pref-notifyOnDirectMessage'));
      await waitFor(() => expect(onSave).toHaveBeenCalledWith({ notifyOnDirectMessage: false }));
    });
  });
});

describe('NotificationPreferencesCard push section', () => {
  const pushOf = (state: string, enable = vi.fn().mockResolvedValue({ ok: true })) => ({
    state,
    enable,
    disable: vi.fn().mockResolvedValue(undefined),
  });

  it('shows nothing about push while no key is configured', () => {
    render(
      <NotificationPreferencesCard preferences={allOn} push={pushOf('disabled')} onSave={vi.fn()} />
    );
    expect(screen.queryByTestId('notification-push')).not.toBeInTheDocument();
    render(<NotificationPreferencesCard preferences={allOn} onSave={vi.fn()} />);
    expect(screen.queryByTestId('notification-push')).not.toBeInTheDocument();
  });

  it('tells iPhone users in a Safari tab to add the app to the home screen', () => {
    render(
      <NotificationPreferencesCard preferences={allOn} push={pushOf('ios-tab')} onSave={vi.fn()} />
    );
    expect(screen.getByTestId('push-ios-hint')).toHaveTextContent('Zum Home-Bildschirm');
    expect(screen.queryByTestId('push-device-toggle')).not.toBeInTheDocument();
  });

  it('explains a blocked permission and offers no switch', () => {
    render(
      <NotificationPreferencesCard preferences={allOn} push={pushOf('denied')} onSave={vi.fn()} />
    );
    expect(screen.getByTestId('push-denied')).toBeInTheDocument();
    expect(screen.queryByTestId('push-device-toggle')).not.toBeInTheDocument();
  });

  it('says so when the browser cannot do push', () => {
    render(
      <NotificationPreferencesCard
        preferences={allOn}
        push={pushOf('unsupported')}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByTestId('push-unsupported')).toBeInTheDocument();
  });

  it('switching on the first device also switches the topics on', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const push = pushOf('available');
    render(<NotificationPreferencesCard preferences={allOn} push={push} onSave={onSave} />);
    const toggle = screen.getByTestId('push-device-toggle');
    expect(toggle).not.toBeChecked();
    expect(screen.queryByTestId('notification-pref-pushOnEventStatus')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    await waitFor(() => expect(push.enable).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ pushOnEventStatus: true, pushOnReviewMessage: true })
    );
  });

  it('keeps the chosen topics when a further device is switched on', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const push = pushOf('available');
    render(
      <NotificationPreferencesCard
        preferences={{ ...allOn, pushOnEventStatus: true, pushOnReviewMessage: false }}
        push={push}
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByTestId('push-device-toggle'));
    await waitFor(() => expect(push.enable).toHaveBeenCalledTimes(1));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves nothing when the person declines the browser prompt', async () => {
    const onSave = vi.fn();
    const push = pushOf(
      'available',
      vi.fn().mockResolvedValue({ ok: false, permission: 'denied' })
    );
    render(<NotificationPreferencesCard preferences={allOn} push={push} onSave={onSave} />);
    fireEvent.click(screen.getByTestId('push-device-toggle'));
    await waitFor(() => expect(push.enable).toHaveBeenCalled());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('an active device shows the topics and can be switched off', async () => {
    const push = pushOf('active');
    render(
      <NotificationPreferencesCard
        preferences={{ ...allOn, pushOnEventStatus: true }}
        push={push}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByTestId('push-device-toggle')).toBeChecked();
    expect(screen.getByTestId('notification-pref-pushOnEventStatus')).toBeChecked();
    expect(screen.getByTestId('notification-pref-pushOnReviewMessage')).not.toBeChecked();
    fireEvent.click(screen.getByTestId('push-device-toggle'));
    await waitFor(() => expect(push.disable).toHaveBeenCalledTimes(1));
  });

  it('only staff see the review switch, and the first device turns it on too', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(
      <NotificationPreferencesCard
        preferences={{ ...allOn, pushOnEventStatus: true }}
        push={pushOf('active')}
        onSave={vi.fn()}
      />
    );
    expect(screen.queryByTestId('notification-pref-pushStaffReview')).not.toBeInTheDocument();
    unmount();

    const push = pushOf('available');
    render(<NotificationPreferencesCard preferences={allOn} isStaff push={push} onSave={onSave} />);
    fireEvent.click(screen.getByTestId('push-device-toggle'));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        pushOnEventStatus: true,
        pushOnReviewMessage: true,
        pushStaffReview: true,
      })
    );
  });

  it('moderators (staff without admin rights) get the review switch on an active device', () => {
    render(
      <NotificationPreferencesCard
        preferences={allOn}
        isAdmin={false}
        isStaff
        push={pushOf('active')}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByTestId('notification-pref-pushStaffReview')).not.toBeChecked();
    // E-mail switches for admins stay admin-only.
    expect(screen.queryByTestId('notification-pref-notifyOnSubmitted')).not.toBeInTheDocument();
  });

  it('shows an error when switching on fails', async () => {
    const push = pushOf('available', vi.fn().mockRejectedValue(new Error('boom')));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<NotificationPreferencesCard preferences={allOn} push={push} onSave={vi.fn()} />);
    fireEvent.click(screen.getByTestId('push-device-toggle'));
    expect(await screen.findByTestId('notification-pref-error')).toBeInTheDocument();
  });
});
