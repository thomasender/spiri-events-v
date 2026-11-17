import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { resolveOrganizerProfilePath } from '../../src/utils/profile';
import { SYSTEM_UID } from '../../src/utils/systemAccount';

const DAY = 24 * 60 * 60 * 1000;
const auth: { user: unknown; loading: boolean } = { user: null, loading: false };
const organizerCall = vi.fn();

vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../../src/hooks/usePreEntries', () => ({
  preEntryOrganizer: (...args: unknown[]) => organizerCall(...args),
}));
vi.mock('../../src/components/SeoMeta', () => ({ default: () => null }));

import PreEntryPreviewPage from '../../src/pages/PreEntryPreviewPage';

const openPreview = {
  state: 'open',
  kind: 'preview',
  expiresAtMs: Date.now() + 5 * DAY,
  daysLeft: 5,
  canPublish: true,
  canReject: true,
  canClaim: true,
  eventStatus: 'draft',
  event: { title: 'Klangreise', description: '<p>Schön</p>', organizerName: 'Studio Klang' },
};

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/vorschau/${'a'.repeat(43)}`]}>
        <Routes>
          <Route path="/vorschau/:token" element={<PreEntryPreviewPage />} />
          <Route path="/login" element={<p>Login-Seite</p>} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  );
}

beforeEach(() => {
  organizerCall.mockReset();
  auth.user = null;
});

describe('PreEntryPreviewPage', () => {
  it('shows the event, the countdown and publishes without a profile only after the checkbox', async () => {
    organizerCall.mockImplementation(async (action: string) =>
      action === 'view'
        ? openPreview
        : { ok: true, publicUrl: 'https://t.at/event/k', takeoverUrl: 'https://t.at/vorschau/z' }
    );
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Klangreise' })).toBeInTheDocument();
    expect(screen.getByTestId('pre-entry-banner')).toHaveTextContent('noch 5 Tage');
    fireEvent.click(screen.getByTestId('pre-entry-open-publish'));
    const withoutProfile = screen.getByTestId('pre-entry-publish-without-profile');
    expect(withoutProfile).toBeDisabled();
    fireEvent.click(screen.getByTestId('pre-entry-rights'));
    expect(withoutProfile).toBeEnabled();
    fireEvent.click(withoutProfile);
    await waitFor(() =>
      expect(organizerCall).toHaveBeenCalledWith('publish', 'a'.repeat(43), {
        rightsConfirmed: true,
      })
    );
    expect(await screen.findByTestId('pre-entry-takeover-link')).toHaveTextContent(
      'https://t.at/vorschau/z'
    );
  });

  it('editing without an account leads to the sign-up first', async () => {
    organizerCall.mockResolvedValue(openPreview);
    renderPage();
    fireEvent.click(await screen.findByTestId('pre-entry-edit'));
    expect(await screen.findByText('Login-Seite')).toBeInTheDocument();
    expect(organizerCall).toHaveBeenCalledTimes(1);
  });

  it('after the expiry it says so and offers a contact', async () => {
    organizerCall.mockResolvedValue({ ...openPreview, state: 'expired', event: null });
    renderPage();
    expect(await screen.findByText('Dieser Link ist abgelaufen')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'admin@thetribe.at' })).toBeInTheDocument();
  });

  it('declining sends the optional comment', async () => {
    organizerCall.mockImplementation(async (action: string) =>
      action === 'view' ? openPreview : { ok: true }
    );
    renderPage();
    fireEvent.click(await screen.findByTestId('pre-entry-open-reject'));
    fireEvent.change(screen.getByTestId('pre-entry-reject-comment'), {
      target: { value: 'Lieber nicht' },
    });
    fireEvent.click(screen.getByTestId('pre-entry-reject'));
    await waitFor(() =>
      expect(organizerCall).toHaveBeenCalledWith('reject', 'a'.repeat(43), {
        comment: 'Lieber nicht',
      })
    );
  });
});

describe('events of "Dein Tribe"', () => {
  it('the organizer name is not linked to the system profile', () => {
    const event = { createdBy: SYSTEM_UID, organizer: { name: 'Studio Klang' } };
    expect(resolveOrganizerProfilePath(event, { slug: 'dein-tribe' })).toBeNull();
    expect(
      resolveOrganizerProfilePath({ ...event, createdBy: 'u1' }, { slug: 'studio-klang' })
    ).toBe('/studio-klang');
  });
});
