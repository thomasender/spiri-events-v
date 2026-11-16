import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { describe, it, expect, vi, afterEach } from 'vitest';
import LegalPage from '../../src/pages/LegalPage';
import { DEFAULT_REGION_CONTEXT, RegionContext } from '../../src/hooks/useRegion';

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

  it('has section 19 "Vereinsmitglieder" with an anchor, Mollie and legal bases; "Änderungen" is 20', () => {
    const { container } = renderLegalPage('datenschutz');
    const section = container.querySelector('section#vereinsmitglieder');
    expect(section).not.toBeNull();
    expect(section?.querySelector('h2')).toHaveTextContent('19. Vereinsmitglieder');
    const text = section?.textContent ?? '';
    expect(text).toContain('Mollie');
    expect(text).toContain('Art. 6 Abs. 1 lit. b DSGVO');
    expect(text).toContain('Art. 6 Abs. 1 lit. a DSGVO');
    expect(text).toContain('Abschnitt 6');
    const headings = Array.from(container.querySelectorAll('h2')).map((h) => h.textContent);
    expect(headings[19]).toMatch(/^20\. Änderungen/);
  });

  it('names Mollie as recipient in section 4 (membership fee and donations)', () => {
    const { container } = renderLegalPage('datenschutz');
    const sections = container.querySelectorAll('section');
    const four = sections[3].textContent ?? '';
    expect(sections[3].querySelector('h2')).toHaveTextContent('4. Keine Weitergabe an Dritte');
    expect(four).toContain('Mollie');
    expect(four).toContain('Mitgliedsbeitrag');
    expect(four).toContain('Spende');
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

describe('LegalPage hash scrolling', () => {
  const original = Element.prototype.scrollIntoView;
  afterEach(() => {
    Element.prototype.scrollIntoView = original;
  });

  it('scrolls to #vereinsmitglieder after rendering', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/datenschutz#vereinsmitglieder']}>
          <LegalPage page="datenschutz" />
        </MemoryRouter>
      </HelmetProvider>
    );
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toHaveProperty('id', 'vereinsmitglieder');
  });

  it('does not scroll without a hash', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    renderLegalPage('datenschutz');
    expect(scroll).not.toHaveBeenCalled();
  });
});

describe('LegalPage Instagram channels (per region)', () => {
  const renderWith = (page: 'datenschutz' | 'impressum', regions: Array<Record<string, unknown>>) =>
    render(
      <HelmetProvider>
        <RegionContext.Provider value={{ ...DEFAULT_REGION_CONTEXT, regions } as never}>
          <MemoryRouter>
            <LegalPage page={page} />
          </MemoryRouter>
        </RegionContext.Provider>
      </HelmetProvider>
    );
  const vbg = { id: 'vorarlberg', name: 'Vorarlberg' };
  const tirol = { id: 'tirol', name: 'Tirol', instagramHandle: '@tribetirol' };
  const wien = { id: 'wien', name: 'Wien' };

  it("Vorarlberg only: today's wording, no channel list", () => {
    const { container } = renderLegalPage('datenschutz');
    expect(container.textContent).toContain(
      'Wir betreiben den Instagram-Kanal @tribevorarlberg, auf dem wir Veranstaltungen bewerben.'
    );
    expect(container.textContent).toContain('auf unserem Instagram-Kanal veröffentlicht');
    expect(screen.queryByTestId('legal-instagram-channels')).toBeNull();
  });

  it('one channel plus a region without a handle still shows no list', () => {
    renderWith('datenschutz', [vbg, wien]);
    expect(screen.queryByTestId('legal-instagram-channels')).toBeNull();
  });

  it('two channels: generic wording and a collapsed list built from the regions', () => {
    const { container } = renderWith('datenschutz', [vbg, tirol, wien]);
    const details = screen.getByTestId('legal-instagram-channels') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')).toHaveTextContent('Unsere Instagram-Kanäle (2)');
    const links = Array.from(details.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toEqual([
      'https://www.instagram.com/tribevorarlberg/',
      'https://www.instagram.com/tribetirol/',
    ]);
    expect(details.querySelector('a')).toHaveAttribute('rel', 'noopener noreferrer');
    expect(container.textContent).not.toContain(
      'Wir betreiben den Instagram-Kanal @tribevorarlberg'
    );
    expect(container.textContent).toContain(
      'Wir betreiben für unsere Regionen eigene Instagram-Kanäle'
    );
    expect(container.textContent).toContain('Meta Platforms Ireland Limited');
  });

  it('Impressum: unchanged for one channel, the collapsed "Region: @name" list for several', () => {
    const first = renderLegalPage('impressum');
    expect(
      first.container.querySelector('a[href="https://www.instagram.com/tribevorarlberg"]')
    ).not.toBeNull();
    expect(screen.queryByTestId('legal-instagram-channels')).toBeNull();
    first.unmount();
    renderWith('impressum', [vbg, tirol, wien]);
    const details = screen.getByTestId('legal-instagram-channels');
    expect(details.querySelector('summary')).toHaveTextContent('Unsere Instagram-Kanäle (2)');
    const items = Array.from(details.querySelectorAll('li')).map((li) => li.textContent);
    expect(items).toEqual(['Vorarlberg: @tribevorarlberg', 'Tirol: @tribetirol']);
    expect(details.querySelector('a[href="https://www.instagram.com/tribetirol/"]')).not.toBeNull();
  });

  it('a name stored for the single active region replaces @tribevorarlberg', () => {
    const own = { ...vbg, instagramHandle: '@tribe.vbg' };
    const ds = renderWith('datenschutz', [own]);
    expect(ds.container.textContent).toContain('Wir betreiben den Instagram-Kanal @tribe.vbg,');
    expect(ds.container.textContent).not.toContain('@tribevorarlberg');
    ds.unmount();
    const { container } = renderWith('impressum', [own]);
    expect(
      container.querySelector('a[href="https://www.instagram.com/tribe.vbg/"]')
    ).not.toBeNull();
    expect(
      container.querySelector('a[href^="https://www.instagram.com/tribevorarlberg"]')
    ).toBeNull();
  });
});

describe('LegalPage back link', () => {
  it('leads to the region the visitor came from, not to Vorarlberg', () => {
    render(
      <HelmetProvider>
        <MemoryRouter>
          <RegionContext.Provider value={{ ...DEFAULT_REGION_CONTEXT, pageSlug: 'kaernten' }}>
            <LegalPage page="impressum" />
          </RegionContext.Provider>
        </MemoryRouter>
      </HelmetProvider>
    );
    expect(screen.getByRole('link', { name: 'Zurück zur Startseite' })).toHaveAttribute(
      'href',
      '/kaernten'
    );
  });
});
