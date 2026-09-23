// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProfileForm from '../../src/components/ProfileForm';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../src/lib/imageUpload', () => ({
  uploadProfileDescriptionImage: vi.fn(
    async () => 'https://firebasestorage.googleapis.com/v0/b/x/o/bio-photo.jpg'
  ),
  MAX_INPUT_SIZE_BYTES: 15 * 1024 * 1024,
}));

vi.mock('../../src/components/RichTextEditorLazy', () => ({
  default: ({ value, onChange, testId, hasError, maxLength }) => {
    const text = (value || '').replace(/<[^>]*>/g, '');
    const len = text.length;
    return (
      <div data-testid={testId} className={`rte-wrapper${hasError ? ' rte-wrapper--error' : ''}`}>
        <div
          role="textbox"
          aria-multiline="true"
          className="rte-content"
          contentEditable
          suppressContentEditableWarning
          onInput={(e) => onChange(`<p>${e.currentTarget.textContent || ''}</p>`)}
          dangerouslySetInnerHTML={{ __html: value || '' }}
        />
        <div className={`rte-counter${len > maxLength ? ' rte-counter--over' : ''}`}>
          {len} / {maxLength} Zeichen
        </div>
      </div>
    );
  },
}));

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
    bioHtml: '<p>Yoga-Lehrerin aus Vorarlberg.</p>',
    website: 'www.example.com',
    contact: 'maria@example.com',
    photoURL: null,
    slug: 'maria-musterfrau',
  };

  it('renders pre-filled form values from profile', async () => {
    renderForm(baseProfile);

    expect(screen.getByTestId('profile-displayName')).toHaveValue('Maria Musterfrau');

    const editor = screen.getByTestId('profile-bio-editor');
    await waitFor(() => expect(editor.querySelector('.rte-content')).toBeInTheDocument());
    expect(editor.querySelector('.rte-content')).toHaveTextContent('Yoga-Lehrerin aus Vorarlberg.');

    expect(screen.getByTestId('profile-website')).toHaveValue('www.example.com');
    expect(screen.getByTestId('profile-contact')).toHaveValue('maria@example.com');
  });

  it('shows a live character counter for bio based on plain text length', async () => {
    renderForm(baseProfile);

    const editor = screen.getByTestId('profile-bio-editor');
    await waitFor(() => expect(editor.querySelector('.rte-counter')).toBeInTheDocument());
    const counter = editor.querySelector('.rte-counter');
    expect(counter.textContent).toContain(` / 500`);
    expect(counter.textContent).toContain('29');
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

  it('calls onSave with trimmed values and the rich-text bioHtml', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderForm(baseProfile, { onSave });

    fireEvent.change(screen.getByTestId('profile-displayName'), {
      target: { value: '  Peter Mathis  ' },
    });
    fireEvent.input(screen.getByTestId('profile-bio-editor').querySelector('.rte-content'), {
      target: { textContent: '  Neue Bio  ' },
    });
    fireEvent.change(screen.getByTestId('profile-contact'), {
      target: { value: '  peter@example.com  ' },
    });
    fireEvent.click(screen.getByTestId('profile-save'));

    await waitFor(() => expect(onSave).toHaveBeenCalled());

    const payload = onSave.mock.calls[0][0];
    expect(payload.displayName).toBe('Peter Mathis');
    expect(payload.bio).toBe('Neue Bio');
    expect(payload.bioHtml).toContain('Neue Bio');
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
    const onSave = vi.fn().mockImplementation(() => Promise.reject(new Error('boom')));
    renderForm(baseProfile, { onSave });

    await act(async () => {
      fireEvent.click(screen.getByTestId('profile-save'));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByText(/Profil konnte nicht gespeichert werden/i)).toBeInTheDocument();
  });
});

describe('ProfileForm — social media (gIVugxij)', () => {
  const baseProfile = {
    displayName: 'Maria Musterfrau',
    bio: '',
    bioHtml: '',
    website: '',
    contact: '',
    photoURL: null,
    slug: 'maria-musterfrau',
    socialMedia: { facebook: '', instagram: '', sharePublicly: false },
  };

  it('renders Facebook and Instagram inputs and the sharePublicly checkbox', () => {
    renderForm(baseProfile);

    expect(screen.getByTestId('profile-social-media-section')).toBeInTheDocument();
    expect(screen.getByTestId('profile-facebook')).toBeInTheDocument();
    expect(screen.getByTestId('profile-instagram')).toBeInTheDocument();
    expect(screen.getByTestId('profile-share-publicly')).toBeInTheDocument();
    expect(screen.getByTestId('profile-share-publicly')).not.toBeChecked();
  });

  it('pre-fills social media values from the profile', () => {
    renderForm({
      ...baseProfile,
      socialMedia: {
        facebook: 'maria.example',
        instagram: '@maria_insta',
        sharePublicly: true,
      },
    });

    expect(screen.getByTestId('profile-facebook')).toHaveValue('maria.example');
    expect(screen.getByTestId('profile-instagram')).toHaveValue('@maria_insta');
    expect(screen.getByTestId('profile-share-publicly')).toBeChecked();
  });

  it('saves socialMedia with trimmed values and the sharePublicly flag', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderForm(baseProfile, { onSave });

    fireEvent.change(screen.getByTestId('profile-facebook'), {
      target: { value: '  maria.example  ' },
    });
    fireEvent.change(screen.getByTestId('profile-instagram'), {
      target: { value: '  maria_insta  ' },
    });
    fireEvent.click(screen.getByTestId('profile-share-publicly'));
    fireEvent.click(screen.getByTestId('profile-save'));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].socialMedia).toEqual({
      facebook: 'maria.example',
      instagram: 'maria_insta',
      sharePublicly: true,
    });
  });

  it('persists sharePublicly=false when the user opts out', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderForm(
      {
        ...baseProfile,
        socialMedia: { facebook: 'a', instagram: 'b', sharePublicly: true },
      },
      { onSave }
    );

    fireEvent.click(screen.getByTestId('profile-share-publicly'));
    fireEvent.click(screen.getByTestId('profile-save'));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].socialMedia.sharePublicly).toBe(false);
  });
});

describe('ProfileForm — Speichern & Profil anzeigen button (WBFFzVcm)', () => {
  const completeProfile = {
    displayName: 'Maria Musterfrau',
    bio: 'Yoga-Lehrerin aus Vorarlberg.',
    bioHtml: '<p>Yoga-Lehrerin aus Vorarlberg.</p>',
    website: '',
    contact: '',
    photoURL: null,
    slug: 'maria-musterfrau',
  };

  const incompleteProfile = {
    displayName: 'Maria Musterfrau',
    bio: '',
    bioHtml: '',
    website: '',
    contact: '',
    photoURL: null,
    slug: 'maria-musterfrau',
  };

  const newUserProfile = {
    displayName: '',
    bio: '',
    bioHtml: '',
    website: '',
    contact: '',
    photoURL: null,
    slug: '',
  };

  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders the "Speichern & Profil anzeigen" button when the profile has a slug', () => {
    renderForm(completeProfile);
    expect(screen.getByTestId('profile-save-and-view')).toBeInTheDocument();
    expect(screen.getByTestId('profile-save-and-view')).toHaveTextContent(
      /Speichern & Profil anzeigen/i
    );
  });

  it('renders only the "Speichern" button when the profile has no slug yet', () => {
    renderForm(newUserProfile);
    expect(screen.queryByTestId('profile-save-and-view')).toBeNull();
    expect(screen.getByTestId('profile-save')).toBeInTheDocument();
  });

  it('does not navigate when the plain "Speichern" button is clicked', async () => {
    const onSave = vi.fn().mockResolvedValue('maria-musterfrau');
    renderForm(completeProfile, { onSave });

    fireEvent.click(screen.getByTestId('profile-save'));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByTestId('profile-save-success')).toBeInTheDocument();
  });

  it('navigates to the public profile after saving when the profile is complete', async () => {
    const onSave = vi.fn().mockResolvedValue('maria-musterfrau');
    renderForm(completeProfile, { onSave });

    fireEvent.click(screen.getByTestId('profile-save-and-view'));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/maria-musterfrau'));
    expect(onSave).toHaveBeenCalled();
  });

  it('uses the slug returned by onSave (e.g. after renaming the displayName) when navigating', async () => {
    const onSave = vi.fn().mockResolvedValue('peter-mathis');
    renderForm({ ...completeProfile, slug: 'old-slug' }, { onSave });

    fireEvent.change(screen.getByTestId('profile-displayName'), {
      target: { value: 'Peter Mathis' },
    });
    fireEvent.click(screen.getByTestId('profile-save-and-view'));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/peter-mathis'));
  });

  it('shows the incomplete-profile dialog instead of navigating when bio is missing', async () => {
    const onSave = vi.fn().mockResolvedValue('maria-musterfrau');
    renderForm(incompleteProfile, { onSave });

    fireEvent.click(screen.getByTestId('profile-save-and-view'));

    await waitFor(() => {
      expect(screen.getByTestId('profile-incomplete-dialog')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByTestId('profile-incomplete-field-bio')).toBeInTheDocument();
  });

  it('still saves the profile even when the dialog blocks navigation', async () => {
    const onSave = vi.fn().mockResolvedValue('maria-musterfrau');
    renderForm(incompleteProfile, { onSave });

    fireEvent.click(screen.getByTestId('profile-save-and-view'));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(screen.getByTestId('profile-incomplete-dialog')).toBeInTheDocument();
  });

  it('does not render the "Speichern & Profil anzeigen" button when validation fails (empty name)', async () => {
    // The button only renders when a slug exists; for a brand-new account
    // there is no slug, so the button does not exist and validation must
    // happen via the plain "Speichern" path.
    const onSave = vi.fn();
    renderForm(newUserProfile, { onSave });

    expect(screen.queryByTestId('profile-save-and-view')).toBeNull();

    fireEvent.click(screen.getByTestId('profile-save'));

    await waitFor(() => {
      expect(screen.getByText(/Name ist erforderlich/i)).toBeInTheDocument();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('closes the dialog via its "Verstanden" button without navigating', async () => {
    const onSave = vi.fn().mockResolvedValue('maria-musterfrau');
    renderForm(incompleteProfile, { onSave });

    fireEvent.click(screen.getByTestId('profile-save-and-view'));

    await waitFor(() => {
      expect(screen.getByTestId('profile-incomplete-dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('profile-incomplete-dialog-confirm'));

    await waitFor(() => {
      expect(screen.queryByTestId('profile-incomplete-dialog')).toBeNull();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('closes the dialog via the close (X) button', async () => {
    const onSave = vi.fn().mockResolvedValue('maria-musterfrau');
    renderForm(incompleteProfile, { onSave });

    fireEvent.click(screen.getByTestId('profile-save-and-view'));

    await waitFor(() => {
      expect(screen.getByTestId('profile-incomplete-dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('profile-incomplete-dialog-close'));

    await waitFor(() => {
      expect(screen.queryByTestId('profile-incomplete-dialog')).toBeNull();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('getMissingProfileFields (WBFFzVcm)', () => {
  it('returns displayName and bio as missing for a null profile', async () => {
    const { getMissingProfileFields } = await import('../../src/utils/profile');
    expect(getMissingProfileFields(null)).toEqual([
      { key: 'displayName', label: 'Name' },
      { key: 'bio', label: 'Kurze Beschreibung' },
    ]);
  });

  it('returns no missing fields for a fully populated profile', async () => {
    const { getMissingProfileFields } = await import('../../src/utils/profile');
    expect(
      getMissingProfileFields({
        displayName: 'Maria',
        bio: 'Yoga-Lehrerin.',
      })
    ).toEqual([]);
  });

  it('returns bio when only bio is missing', async () => {
    const { getMissingProfileFields } = await import('../../src/utils/profile');
    expect(getMissingProfileFields({ displayName: 'Maria', bio: '   ' })).toEqual([
      { key: 'bio', label: 'Kurze Beschreibung' },
    ]);
  });

  it('ignores non-string values when checking fields', async () => {
    const { getMissingProfileFields } = await import('../../src/utils/profile');
    expect(getMissingProfileFields({ displayName: 'Maria', bio: null })).toEqual([
      { key: 'bio', label: 'Kurze Beschreibung' },
    ]);
  });
});
