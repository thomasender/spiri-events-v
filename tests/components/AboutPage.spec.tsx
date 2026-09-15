import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { describe, it, expect } from 'vitest';
import AboutPage from '../../src/pages/AboutPage';

function renderAboutPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/ueber-uns']}>
        <Routes>
          <Route path="/ueber-uns" element={<AboutPage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  );
}

describe('AboutPage', () => {
  it('renders the hero headline', () => {
    renderAboutPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Dein Tribe ruft dich.');
  });

  it('renders all five content sections', () => {
    renderAboutPage();
    expect(screen.getByText('Deine Heimat Vorarlberg ruft dich.')).toBeInTheDocument();
    expect(screen.getByText('Kalender')).toBeInTheDocument();
    expect(screen.getByText('Unsere Werte')).toBeInTheDocument();
    expect(screen.getByText('Wer wir sind')).toBeInTheDocument();
    expect(screen.getByText('Unterstützung')).toBeInTheDocument();
  });

  it('renders the founders with photos and links', () => {
    const { container } = renderAboutPage();

    const peterImg = screen.getByAltText(/Peter Mathis/);
    expect(peterImg).toHaveAttribute('src', '/peter.jpg');

    const thomasImg = screen.getByAltText(/Thomas Ender/);
    expect(thomasImg).toHaveAttribute('src', '/thomas.jpg');

    const janaImg = screen.getByAltText(/Jana Sunjevic/);
    expect(janaImg).toHaveAttribute('src', '/jana.jpg');

    const links = container.querySelectorAll('.about-founder-link');
    const hrefs = Array.from(links).map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('https://www.petermathis.at');
    expect(hrefs).toContain('https://www.blissofkundalini.yoga');
    expect(hrefs).toContain('https://www.instagram.com/jana.select/');
  });

  it('embeds the donation block on the support section', () => {
    renderAboutPage();

    const supportSection = document.getElementById('spenden');
    expect(supportSection).not.toBeNull();
    expect(supportSection?.querySelector('.donation-block')).not.toBeNull();
  });

  it('highlights the core line "Zurück zu uns Selbst zu kommen"', () => {
    const { container } = renderAboutPage();
    const highlight = container.querySelector('.about-highlight');
    expect(highlight).not.toBeNull();
    expect(highlight?.textContent).toContain('Zurück zu uns Selbst zu kommen');
  });

  it('keeps a back link to the calendar', () => {
    renderAboutPage();
    const backLink = screen.getByRole('link', { name: /zurück zur startseite/i });
    expect(backLink).toHaveAttribute('href', '/');
  });
});
