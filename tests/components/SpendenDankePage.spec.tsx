import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { describe, it, expect } from 'vitest';
import SpendenDankePage from '../../src/pages/SpendenDankePage';

function renderDankePage() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/spenden/danke']}>
        <Routes>
          <Route path="/spenden/danke" element={<SpendenDankePage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  );
}

describe('SpendenDankePage', () => {
  it('renders the thank-you headline', () => {
    renderDankePage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Deine Spende ist unterwegs.'
    );
  });

  it('links back to the calendar', () => {
    renderDankePage();
    const link = screen.getByRole('link', { name: /zurück zum kalender/i });
    expect(link).toHaveAttribute('href', '/');
  });

  it('mentions the contact email for questions', () => {
    renderDankePage();
    expect(screen.getByText(/bei fragen/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'office@tribevorarlberg.at' })).toHaveAttribute(
      'href',
      'mailto:office@tribevorarlberg.at'
    );
  });
});
