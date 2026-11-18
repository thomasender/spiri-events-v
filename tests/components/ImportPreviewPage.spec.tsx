import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

const calls = vi.hoisted(() => ({
  log: [] as Array<{ name: string; data: Record<string, unknown> }>,
  handlers: {} as Record<string, (data: Record<string, unknown>) => unknown>,
}));

vi.mock('../../src/lib/firebase', () => ({
  callable: (name: string) => async (data: Record<string, unknown>) => {
    calls.log.push({ name, data });
    const handler = calls.handlers[name];
    if (!handler) throw new Error(`unexpected callable ${name}`);
    return { data: await handler(data) };
  },
}));

import ImportPreviewPage from '../../src/pages/ImportPreviewPage';
import {
  CONSENT_WORDING_VERSION,
  applyPrivatePageMeta,
  formatPreviewPrice,
  formatPreviewWhen,
  redactPrivatePath,
  redactPrivateUrl,
} from '../../src/utils/importConsent';

const TOKEN = 'T'.repeat(43);

const preview = (over: Record<string, unknown> = {}) => ({
  organizer: { name: 'Yogaverein Tirol', website: 'https://www.yoga-tirol.at' },
  consent: 'asked',
  syncMode: 'curated_once',
  scopes: null,
  wordingVersion: CONSENT_WORDING_VERSION,
  retentionDays: 90,
  expiresAt: '2026-11-25T10:00:00.000Z',
  events: [
    {
      key: 'e1',
      title: 'Kakaozeremonie',
      date: '2026-12-05',
      endDate: '',
      time: '18:00',
      endTime: '20:00',
      place: 'Studio',
      city: 'Innsbruck',
      isOnline: false,
      contribution: 'fee',
      fee: 20,
      feeMax: null,
      priceCurrency: 'EUR',
      link: 'https://www.yoga-tirol.at/kakao',
      category: 'Zeremonie',
      description: 'Ein Abend mit Kakao',
      imageUrl: 'https://www.yoga-tirol.at/img/kakao.jpg',
      published: false,
    },
  ],
  ...over,
});

async function renderAt(url: string) {
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/vorschau/:token" element={<ImportPreviewPage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  );
  await act(async () => {});
}

describe('ImportPreviewPage', () => {
  beforeEach(() => {
    calls.log.length = 0;
    calls.handlers = { getImportPreview: () => preview() };
    document.head.innerHTML =
      '<meta name="robots" content="index, follow"><meta property="og:image" content="https://www.thetribe.at/hero.jpeg">';
  });

  it('renders the events with the preview notice and the hotlinked image without referrer', async () => {
    await renderAt(`/vorschau/${TOKEN}`);
    expect(calls.log[0]).toEqual({ name: 'getImportPreview', data: { token: TOKEN } });
    expect(
      screen.getByText(/Das ist eine Vorschau. Nichts davon ist öffentlich./)
    ).toBeInTheDocument();
    expect(screen.getByText('Kakaozeremonie')).toBeInTheDocument();
    expect(screen.getByText('Sa, 05.12.2026, 18:00 bis 20:00 Uhr')).toBeInTheDocument();
    expect(screen.getByText('Studio, Innsbruck')).toBeInTheDocument();
    const img = screen.getByRole('img', { name: 'Kakaozeremonie' });
    expect(img.getAttribute('src')).toBe('https://www.yoga-tirol.at/img/kakao.jpg');
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(screen.getByRole('link', { name: /Art. 14 DSGVO/ }).getAttribute('href')).toBe(
      '/datenschutz-import'
    );
  });

  it('shows a placeholder when the organizer’s image fails to load', async () => {
    await renderAt(`/vorschau/${TOKEN}`);
    fireEvent.error(screen.getByRole('img', { name: 'Kakaozeremonie' }));
    expect(screen.queryByRole('img', { name: 'Kakaozeremonie' })).toBeNull();
    expect(screen.getByTestId('preview-image-placeholder')).toBeInTheDocument();
  });

  it('sets noindex and no-referrer and removes the social image while open', async () => {
    await renderAt(`/vorschau/${TOKEN}`);
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, nofollow'
    );
    expect(document.head.querySelector('meta[name="referrer"]')?.getAttribute('content')).toBe(
      'no-referrer'
    );
    expect(document.head.querySelector('meta[property="og:image"]')).toBeNull();
  });

  it('approves only after the first checkbox and sends the chosen scopes', async () => {
    calls.handlers.submitImportConsent = () => ({ consent: 'manual_ok', syncMode: 'curated_once' });
    await renderAt(`/vorschau/${TOKEN}`);
    const approve = screen.getByTestId('action-approve-once') as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('scope-event'));
    fireEvent.click(screen.getByTestId('scope-images'));
    expect(approve.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(approve);
    });
    expect(calls.log[1]).toEqual({
      name: 'submitImportConsent',
      data: {
        token: TOKEN,
        action: 'approve_once',
        scopes: { event: true, images: true, persons: false },
        wordingVersion: CONSENT_WORDING_VERSION,
      },
    });
    expect(screen.getByText(/du hast zugestimmt/)).toBeInTheDocument();
  });

  it('the decline link preselects declining; one click declines', async () => {
    calls.handlers.submitImportConsent = () => ({ consent: 'declined', syncMode: 'declined' });
    await renderAt(`/vorschau/${TOKEN}?aktion=ablehnen`);
    const box = screen.getByTestId('decline-preselected');
    await act(async () => {
      fireEvent.click(box.querySelector('button') as HTMLButtonElement);
    });
    expect(calls.log[1].data).toMatchObject({ action: 'decline', token: TOKEN });
    expect(screen.getByText(/Du hast abgelehnt/)).toBeInTheDocument();
    expect(screen.queryByText('Kakaozeremonie')).toBeNull();
    expect(screen.queryByTestId('action-decline')).toBeNull();
  });

  it('calls self_manage and decline with their own actions', async () => {
    calls.handlers.submitImportConsent = (data) =>
      data.action === 'self_manage'
        ? { consent: 'asked', syncMode: 'self_managed' }
        : { consent: 'declined', syncMode: 'declined' };
    await renderAt(`/vorschau/${TOKEN}`);
    await act(async () => {
      fireEvent.click(screen.getByTestId('action-self-manage'));
    });
    expect(calls.log[1].data.action).toBe('self_manage');
    await act(async () => {
      fireEvent.click(screen.getByTestId('action-decline'));
    });
    expect(calls.log[2].data.action).toBe('decline');
  });

  it('a wrong link shows the generic message and calls nothing for a malformed token', async () => {
    await renderAt('/vorschau/kurz');
    expect(calls.log).toHaveLength(0);
    expect(screen.getByText(/ungültig oder abgelaufen/)).toBeInTheDocument();
  });
});

describe('preview helpers', () => {
  it('keeps the token out of analytics paths and URLs', () => {
    expect(redactPrivatePath(`/vorschau/${TOKEN}`)).toBe('/vorschau');
    expect(redactPrivatePath('/vorschau')).toBe('/vorschau');
    expect(redactPrivatePath('/event/vorschau-abend')).toBe('/event/vorschau-abend');
    expect(redactPrivateUrl(`https://www.thetribe.at/vorschau/${TOKEN}`)).toBe(
      'https://www.thetribe.at/vorschau'
    );
  });

  it('restores the page meta on leaving', () => {
    document.head.innerHTML = '<meta name="robots" content="index, follow">';
    const cleanup = applyPrivatePageMeta(document);
    cleanup();
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'index, follow'
    );
    expect(document.head.querySelector('meta[name="referrer"]')).toBeNull();
  });

  it('formats price and time like the calendar', () => {
    expect(formatPreviewPrice({ contribution: 'donation' })).toBe('Freie Spende');
    expect(formatPreviewPrice({ contribution: 'free' })).toBe('Kostenlos');
    expect(
      formatPreviewPrice({ contribution: 'fee', fee: 20, feeMax: 30, priceCurrency: 'CHF' })
    ).toBe('20–30 CHF');
    expect(formatPreviewWhen({ date: '2026-12-05', endDate: '2026-12-06', time: '' })).toBe(
      'Sa, 05.12.2026 bis So, 06.12.2026'
    );
  });
});
