import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { describe, it, expect } from 'vitest';
import LegalPage from '../../src/pages/LegalPage';

/**
 * Replaces tests/integration/datenschutz-formatierung.spec.ts.
 *
 * The legal pages run their copy through a small inline formatter
 * (`*bold*` -> <strong>, `- ` -> <ul><li>). That is pure rendering logic and
 * needs neither a browser nor Firebase, so it lives here instead of costing a
 * Playwright run in two engines.
 */
function renderLegalPage(page: 'datenschutz' | 'impressum') {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <LegalPage page={page} />
      </MemoryRouter>
    </HelmetProvider>
  );
}

describe('LegalPage formatting', () => {
  it('renders *markers* as <strong> instead of literal asterisks', () => {
    const { container } = renderLegalPage('datenschutz');

    expect(screen.getByText('Datenschutzerklärung')).toBeInTheDocument();

    const strongTexts = Array.from(container.querySelectorAll('strong')).map((el) =>
      el.textContent?.trim()
    );
    expect(strongTexts).toContain('Account-Daten:');
    expect(strongTexts).toContain('Bei der Registrierung:');
    expect(strongTexts).toContain('Was bedeutet das für Sie?');

    // No literal asterisk markup survives into the rendered text.
    expect(container.textContent).not.toContain('*Account-Daten:*');
    expect(container.textContent).not.toContain('*Bei der Registrierung:*');
  });

  it('renders dash-prefixed lines as <ul> bullet lists', () => {
    const { container } = renderLegalPage('datenschutz');

    const lists = container.querySelectorAll('ul');
    expect(lists.length).toBeGreaterThan(0);

    const allItems = Array.from(container.querySelectorAll('li')).map((el) =>
      el.textContent?.trim()
    );
    expect(allItems).toContain('E-Mail-Adresse (für die Authentifizierung)');

    // The dash markers themselves are consumed, not printed.
    expect(container.textContent).not.toContain('- E-Mail-Adresse');
  });

  it('preserves the text content while reformatting', () => {
    const { container } = renderLegalPage('datenschutz');
    expect(container.textContent).toContain('Firebase Authentication');
    expect(container.textContent).toContain('Auskunftsrecht');
  });

  it('describes Google Analytics (consent only) and no longer claims "no tracking"', () => {
    const { container } = renderLegalPage('datenschutz');
    const text = container.textContent ?? '';
    expect(text).toContain('7. Statistik mit Google Analytics (nur mit Einwilligung)');
    expect(text).toContain('Cookie-Einstellungen');
    expect(text).not.toContain('Kein Tracking');
    expect(text).not.toContain('keine Tracking-Dienste');
  });

  it('numbers the sections consecutively and every "Abschnitt N" points to one of them', () => {
    const { container } = renderLegalPage('datenschutz');
    const numbers = Array.from(container.querySelectorAll('h2')).map((h) =>
      Number(/^(\d+)\./.exec(h.textContent ?? '')?.[1])
    );
    expect(numbers).toEqual(numbers.map((_n, i) => i + 1));

    const text = container.textContent ?? '';
    const refs = [...text.matchAll(/Abschnitte? (\d+)(?: und (\d+))?/g)].flatMap((m) =>
      [m[1], m[2]].filter(Boolean).map(Number)
    );
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(numbers).toContain(ref);
    // The calendar export section is where the cross references say it is.
    const headings = Array.from(container.querySelectorAll('h2')).map((h) => h.textContent);
    expect(headings[12]).toMatch(/^13\. Kalender-Export/);
    expect(headings[8]).toMatch(/^9\. Firebase/);
  });

  it('renders the Impressum content', () => {
    const { container } = renderLegalPage('impressum');
    expect(screen.getByText('Impressum')).toBeInTheDocument();
    expect(container.textContent).toContain('ZVR-Zahl');
  });

  it('names the map data sources and licence links in Datenschutz and Impressum', () => {
    for (const page of ['datenschutz', 'impressum'] as const) {
      const { container, unmount } = renderLegalPage(page);
      expect(container.textContent).toContain('BEV');
      expect(container.textContent).toContain('swisstopo');
      expect(container.textContent).toContain('Natural Earth');
      expect(container.textContent).toContain('verändert');
      expect(
        container.querySelector('a[href="https://creativecommons.org/licenses/by-sa/2.0/"]')
      ).not.toBeNull();
      unmount();
    }
  });
});
