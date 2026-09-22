import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProfileForm from '../../src/components/ProfileForm';

function renderForm(profile, props = {}) {
  return render(
    <MemoryRouter>
      <ProfileForm profile={profile} uid="user-123" onSave={vi.fn()} {...props} />
    </MemoryRouter>
  );
}

describe('ProfileForm', () => {
  const baseProfile = {
    displayName: 'Maria Musterfrau',
    bio: 'Yoga-Lehrerin aus Vorarlberg.',
    website: 'www.example.com',
    contact: 'maria@example.com',
    photoURL: null,
    slug: 'maria-musterfrau',
  };

  it('renders pre-filled form values from profile', () => {
    renderForm(baseProfile);

    expect(screen.getByTestId('profile-displayName')).toHaveValue('Maria Musterfrau');
    expect(screen.getByTestId('profile-bio')).toHaveValue('Yoga-Lehrerin aus Vorarlberg.');
    expect(screen.getByTestId('profile-website')).toHaveValue('www.example.com');
    expect(screen.getByTestId('profile-contact')).toHaveValue('maria@example.com');
  });

  it('shows a live character counter for bio', () => {
    renderForm(baseProfile);

    const counter = screen.getByTestId('profile-bio-counter');
    expect(counter.textContent).toContain(` / 500`);
  });

  it('rejects empty displayName', async () => {
    const onSave = vi.fn();
    renderForm(baseProfile, { onSave });

    fireEvent.change(screen.getByTestId('profile-displayName'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByTestId('profile-save'));

    await waitFor(() => {
      expect(screen.getByText(/Name ist erforderlich/i)).toBeInTheDocument();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('rejects invalid website URL', async () => {
    const onSave = vi.fn();
    renderForm(baseProfile, { onSave });

    fireEvent.change(screen.getByTestId('profile-website'), {
      target: { value: 'not a url at all' },
    });
    fireEvent.click(screen.getByTestId('profile-save'));

    await waitFor(() => {
      expect(screen.getByText(/gültige URL/i)).toBeInTheDocument();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('normalises website without protocol to https://', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderForm(baseProfile, { onSave });

    fireEvent.change(screen.getByTestId('profile-website'), {
      target: { value: 'www.example.com' },
    });
    fireEvent.click(screen.getByTestId('profile-save'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
    expect(onSave.mock.calls[0][0].website).toBe('https://www.example.com');
  });

  it('converts http:// to https://', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderForm(baseProfile, { onSave });

    fireEvent.change(screen.getByTestId('profile-website'), {
      target: { value: 'http://example.com' },
    });
    fireEvent.click(screen.getByTestId('profile-save'));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].website).toBe('https://example.com');
  });

  it('calls onSave with trimmed values', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderForm(baseProfile, { onSave });

    fireEvent.change(screen.getByTestId('profile-displayName'), {
      target: { value: '  Peter Mathis  ' },
    });
    fireEvent.change(screen.getByTestId('profile-bio'), {
      target: { value: '  Neue Bio  ' },
    });
    fireEvent.change(screen.getByTestId('profile-contact'), {
      target: { value: '  peter@example.com  ' },
    });
    fireEvent.click(screen.getByTestId('profile-save'));

    await waitFor(() => expect(onSave).toHaveBeenCalled());

    const payload = onSave.mock.calls[0][0];
    expect(payload.displayName).toBe('Peter Mathis');
    expect(payload.bio).toBe('Neue Bio');
    expect(payload.contact).toBe('peter@example.com');
  });

  it('shows success message after save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderForm(baseProfile, { onSave });

    fireEvent.click(screen.getByTestId('profile-save'));

    await waitFor(() => {
      expect(screen.getByTestId('profile-save-success')).toBeInTheDocument();
    });
  });

  it('shows submit error when save fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('boom'));
    renderForm(baseProfile, { onSave });

    fireEvent.click(screen.getByTestId('profile-save'));

    await waitFor(() => {
      expect(screen.getByText(/Profil konnte nicht gespeichert werden/i)).toBeInTheDocument();
    });
  });
});

describe('ProfileForm — public profile link (VwXzeWqG)', () => {
  const baseProfile = {
    displayName: 'Maria Musterfrau',
    bio: 'Yoga-Lehrerin aus Vorarlberg.',
    website: 'www.example.com',
    contact: 'maria@example.com',
    photoURL: null,
    slug: 'maria-musterfrau',
  };

  it('renders a link to the public profile when the profile has a slug', () => {
    renderForm(baseProfile);

    const link = screen.getByTestId('profile-view-public');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/maria-musterfrau');
    expect(link).toHaveTextContent(/öffentliches Profil anzeigen/i);
  });

  it('does not render the public profile link when the profile has no slug yet', () => {
    renderForm({ ...baseProfile, slug: '' });

    expect(screen.queryByTestId('profile-view-public')).toBeNull();
  });
});
