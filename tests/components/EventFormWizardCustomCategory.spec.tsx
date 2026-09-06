import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EventFormWizard from '../../src/components/EventFormWizard';

const mockAuth = vi.hoisted(() => ({
  user: { uid: 'user-uid', email: 'user@test.local' },
  role: 'User',
}));

const mockProfile = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
}));

const mockEvents = vi.hoisted(() => ({
  addEvent: vi.fn(async () => ({ id: 'new-id' })),
  updateEvent: vi.fn(async () => ({})),
  deleteEvent: vi.fn(async () => ({})),
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockAuth.user, role: mockAuth.role }),
}));

vi.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({ profile: mockProfile.profile }),
}));

vi.mock('../../src/hooks/useEvents', () => ({
  useEvents: () => mockEvents,
  useAllEvents: () => ({ events: [], loading: false, error: null }),
  useEventById: () => ({ event: null, loading: false, error: null }),
  KATEGORIEN: ['Yoga', 'Breathwork', 'Meditation', 'Tanz', 'Singen', 'Soundhealing', 'Sonstiges'],
  BEZIRKE: ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe'],
}));

vi.mock('../../src/hooks/useCategories', () => ({
  useCategories: () => [
    'Yoga',
    'Breathwork',
    'Meditation',
    'Tanz',
    'Singen',
    'Soundhealing',
    'Sonstiges',
  ],
}));

vi.mock('../../src/lib/imageUpload', () => ({
  uploadImage: vi.fn(async () => ''),
  deleteImageByUrl: vi.fn(async () => {}),
  getImageDimensions: vi.fn(async () => ({ width: 1200, height: 800 })),
  getAspectRatioRecommendation: vi.fn(() => ({ isRecommended: true })),
  MAX_INPUT_SIZE_BYTES: 5 * 1024 * 1024,
}));

// Replace the (lazy-loaded) RichTextEditor with a plain textarea so the test
// doesn't have to wait for the Suspense fallback to resolve.
vi.mock('../../src/components/RichTextEditorLazy', () => ({
  default: ({ id, value, onChange }) => (
    <textarea
      id={id}
      data-testid="description-editor"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

function renderWizard() {
  return render(
    <MemoryRouter>
      <EventFormWizard />
    </MemoryRouter>
  );
}

async function fillStep1() {
  fireEvent.change(document.querySelector('#organizer\\.firstName'), {
    target: { value: 'Test' },
  });
  fireEvent.change(document.querySelector('#organizer\\.lastName'), {
    target: { value: 'User' },
  });
  fireEvent.change(document.querySelector('#kontakt'), {
    target: { value: 'test@test.local' },
  });
}

async function advanceToStep3() {
  fireEvent.click(screen.getByTestId('continue-button'));
  await waitFor(() => {
    expect(document.querySelector('#title')).toBeTruthy();
  });
  fireEvent.change(document.querySelector('#title'), {
    target: { value: 'Test-Event' },
  });
  // RichTextEditor is mocked to a textarea with data-testid="description-editor"
  const editor = document.querySelector('[data-testid="description-editor"]');
  fireEvent.change(editor, { target: { value: 'Beschreibung' } });
  fireEvent.click(screen.getByTestId('continue-button'));
  // Wait for step 3 (Date / Bezirk / Kategorie)
  await waitFor(() => {
    expect(document.querySelector('#date')).toBeTruthy();
  });
}

describe('EventFormWizard — custom category creation', () => {
  it('does NOT advance to the next step when pressing Enter in the category field', async () => {
    renderWizard();
    await fillStep1();
    await advanceToStep3();

    // We should be on step 3 (Details) — the category field is rendered here.
    // Confirm by looking for the wizard heading.
    expect(screen.getByRole('heading', { name: 'Details' })).toBeTruthy();
    // Step 4 heading "Zusammenfassung" must NOT be the active step yet.
    expect(screen.queryByRole('heading', { name: 'Zusammenfassung' })).toBeNull();

    // Type into the category input and press Enter
    const input = document.querySelector('.kategorie__input');
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: 'Pilates' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // We must still be on step 3 — Enter should not have advanced the wizard.
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Zusammenfassung' })).toBeNull();
    });
  });

  it('keeps the newly-created category visible as selected in the dropdown', async () => {
    renderWizard();
    await fillStep1();
    await advanceToStep3();

    const input = document.querySelector('.kategorie__input');
    fireEvent.change(input, { target: { value: 'Pilates' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    // The "Create" option should appear
    const createOption = await screen.findByText(/Pilates.*als neue Kategorie anlegen/);
    fireEvent.click(createOption);

    // After clicking "Create", the color picker opens. Pick the deep teal
    // swatch (the only free slot in the default palette) to commit the
    // category name + color into formData.
    const picker = await screen.findByTestId('category-color-picker');
    expect(picker).toBeTruthy();
    const swatch = picker.querySelector('[data-color="#4a7572"]');
    expect(swatch).toBeTruthy();
    fireEvent.click(swatch);

    // The picker should close and the category should be selected.
    await waitFor(() => {
      expect(screen.queryByTestId('category-color-picker')).toBeNull();
    });
    await waitFor(() => {
      const control = document.querySelector('.kategorie__control');
      expect(control).toBeTruthy();
      expect(control.textContent).toContain('Pilates');
    });
  });

  it('does not commit the new category when the color picker is cancelled', async () => {
    renderWizard();
    await fillStep1();
    await advanceToStep3();

    const input = document.querySelector('.kategorie__input');
    fireEvent.change(input, { target: { value: 'Pilates' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    const createOption = await screen.findByText(/Pilates.*als neue Kategorie anlegen/);
    fireEvent.click(createOption);

    const picker = await screen.findByTestId('category-color-picker');
    fireEvent.click(picker.querySelector('[data-testid="category-color-picker-cancel"]'));

    await waitFor(() => {
      expect(screen.queryByTestId('category-color-picker')).toBeNull();
    });
    // The category must NOT be in the dropdown selection.
    await waitFor(() => {
      const control = document.querySelector('.kategorie__control');
      expect(control.textContent).not.toContain('Pilates');
    });
  });

  it('clears the picked color when the user switches to an existing category', async () => {
    renderWizard();
    await fillStep1();
    await advanceToStep3();

    const input = document.querySelector('.kategorie__input');
    fireEvent.change(input, { target: { value: 'Pilates' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.click(await screen.findByText(/Pilates.*als neue Kategorie anlegen/));

    // Pick the teal swatch — both name and color are now in formData.
    const picker = await screen.findByTestId('category-color-picker');
    fireEvent.click(picker.querySelector('[data-color="#4a7572"]'));
    await waitFor(() => {
      expect(screen.queryByTestId('category-color-picker')).toBeNull();
    });

    // Now switch to an existing category via the dropdown.
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.click(await screen.findByText(/^Yoga$/));

    // The selected value should be Yoga, not Pilates, and the picker must
    // NOT re-open on its own.
    await waitFor(() => {
      const control = document.querySelector('.kategorie__control');
      expect(control.textContent).toContain('Yoga');
      expect(control.textContent).not.toContain('Pilates');
    });
    expect(screen.queryByTestId('category-color-picker')).toBeNull();
  });
});
