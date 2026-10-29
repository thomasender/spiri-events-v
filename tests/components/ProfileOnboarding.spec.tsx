import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const deleteImageByUrl = vi.fn();

vi.mock('../../src/lib/imageUpload', () => ({
  deleteImageByUrl: (u: string) => deleteImageByUrl(u),
}));
vi.mock('../../src/hooks/useCategoryRegistry', () => ({
  useCategoryRegistry: () => ({ categories: [{ name: 'Yoga' }, { name: 'Tanz' }] }),
}));
vi.mock('../../src/components/ProfilePhotoUpload', () => ({
  default: ({ onUploaded, onRemoved, photoURL }: any) => (
    <div>
      <button onClick={() => onUploaded('https://x/new-1.jpg')}>upload-1</button>
      <button onClick={() => onUploaded('https://x/new-2.jpg')}>upload-2</button>
      <button onClick={() => onRemoved()}>remove</button>
      <span data-testid="photo-now">{photoURL || 'none'}</span>
    </div>
  ),
}));

import ProfileOnboarding from '../../src/components/ProfileOnboarding';

const emptyProfile = { displayName: 'Sandra', photoURL: null, bio: '' };

function setup(profile: any = emptyProfile) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const utils = render(
    <MemoryRouter>
      <button data-testid="opener">open</button>
      <ProfileOnboarding profile={profile} uid="u1" onSave={onSave} onClose={onClose} />
    </MemoryRouter>
  );
  return { onSave, onClose, ...utils };
}

const percent = () => screen.getByTestId('onboarding-percent').textContent;
const next = () => fireEvent.click(screen.getByTestId('onboarding-next'));
const skip = () => fireEvent.click(screen.getByTestId('onboarding-skip'));

describe('ProfileOnboarding', () => {
  beforeEach(() => {
    deleteImageByUrl.mockClear();
  });

  it('runs through all steps and ends with the badge', async () => {
    const { onSave } = setup();
    expect(percent()).toContain('0 %');
    expect(screen.getByTestId('onboarding-hint')).toBeInTheDocument();

    fireEvent.click(screen.getByText('upload-1'));
    next();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ photoURL: 'https://x/new-1.jpg' });
    expect(await screen.findByTestId('onboarding-gain')).toHaveTextContent('+25 %');

    fireEvent.change(await screen.findByTestId('onboarding-bio'), { target: { value: 'Hallo' } });
    next();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1][0]).toMatchObject({ bio: 'Hallo' });

    fireEvent.click(await screen.findByTestId('profile-directory-toggle'));
    fireEvent.click(screen.getByTestId('profile-directory-category-Yoga'));
    next();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(3));
    expect(onSave.mock.calls[2][0]).toMatchObject({
      listedInDirectory: true,
      directoryCategories: ['Yoga'],
    });

    // Instagram step: the permission is NOT ticked by default; the user must tick it.
    expect(await screen.findByTestId('onboarding-instagram-consent')).not.toBeChecked();
    fireEvent.click(screen.getByTestId('onboarding-instagram-consent'));
    fireEvent.change(screen.getByTestId('onboarding-instagram'), {
      target: { value: 'instagram.com/sandra.yoga' },
    });
    next();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(4));
    expect(onSave.mock.calls[3][0]).toMatchObject({
      instagramConsentDefault: true,
      socialMedia: { facebook: '', instagram: '@sandra.yoga', sharePublicly: false },
    });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(5));
    expect(onSave.mock.calls[4][0]).toMatchObject({ onboardingCompleted: true, bio: 'Hallo' });

    expect(await screen.findByTestId('onboarding-badge')).toHaveTextContent('Profil vollständig');
    expect(percent()).toContain('100 %');
    expect(deleteImageByUrl).not.toHaveBeenCalled();
  });

  it('counts unsaved input live and drops it when the step is skipped', async () => {
    setup();
    fireEvent.click(screen.getByText('upload-1'));
    expect(percent()).toContain('25 %');
    skip();
    expect(percent()).toContain('0 %');
    // the unsaved upload is cleaned up
    expect(deleteImageByUrl).toHaveBeenCalledWith('https://x/new-1.jpg');

    fireEvent.change(await screen.findByTestId('onboarding-bio'), { target: { value: 'Hi' } });
    expect(percent()).toContain('25 %');
    fireEvent.change(screen.getByTestId('onboarding-bio'), { target: { value: '   ' } });
    expect(percent()).toContain('0 %');
  });

  it('lets a person without description add one inside the directory step', async () => {
    const { onSave } = setup({ ...emptyProfile, photoURL: 'https://x/a.jpg' });
    skip(); // photo step is left alone (nothing changed)
    skip(); // skip description
    fireEvent.click(await screen.findByTestId('profile-directory-toggle'));
    fireEvent.click(screen.getByTestId('profile-directory-category-Tanz'));
    expect(screen.getByTestId('onboarding-bio-directory')).toBeInTheDocument();

    next();
    expect(await screen.findByText(/Kurzbeschreibung/, { selector: '.submit-error' })).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByText(/Schritt zurück/)).toBeNull();

    fireEvent.change(screen.getByTestId('onboarding-bio-directory'), {
      target: { value: 'Tanzlehrerin' },
    });
    next();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      bio: 'Tanzlehrerin',
      listedInDirectory: true,
      directoryCategories: ['Tanz'],
    });
    await screen.findByTestId('onboarding-instagram');
  });

  it('keeps the Instagram name and consent as they were when the step is skipped', async () => {
    const { onSave } = setup({ ...emptyProfile, socialMedia: { instagram: '@alt' } });
    skip();
    skip();
    skip();
    fireEvent.change(await screen.findByTestId('onboarding-instagram'), {
      target: { value: '@neu' },
    });
    fireEvent.click(screen.getByTestId('onboarding-instagram-consent'));
    skip();
    await screen.findByTestId('onboarding-finish');
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toEqual({
      displayName: 'Sandra',
      bio: '',
      onboardingCompleted: true,
    });
  });

  it('rejects an invalid Instagram name and stores the consent choice', async () => {
    const { onSave } = setup();
    skip();
    skip();
    skip();
    fireEvent.change(await screen.findByTestId('onboarding-instagram'), {
      target: { value: 'kein name' },
    });
    next();
    expect(await screen.findByText(/gültigen Instagram-Namen/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('onboarding-instagram'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('onboarding-instagram-consent'));
    next();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[0][0]).toMatchObject({ instagramConsentDefault: true });
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('socialMedia');
    expect(onSave.mock.calls[1][0]).toMatchObject({ onboardingCompleted: true });
  });

  it('saves no consent when the person leaves the Instagram checkbox untouched', async () => {
    const { onSave } = setup();
    skip();
    skip();
    skip();
    fireEvent.change(await screen.findByTestId('onboarding-instagram'), {
      target: { value: '@sandra' },
    });
    next();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[0][0]).toMatchObject({ instagramConsentDefault: false });
  });

  it('does not count as finished when closed before the end', async () => {
    const { onSave, onClose } = setup();
    skip();
    skip();
    await screen.findByTestId('profile-directory-toggle');
    fireEvent.click(screen.getByTestId('onboarding-close'));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not offer the extra bio field when a description is already saved', async () => {
    setup({ ...emptyProfile, bio: 'Schon da' });
    skip();
    skip();
    fireEvent.click(await screen.findByTestId('profile-directory-toggle'));
    expect(screen.queryByTestId('onboarding-bio-directory')).toBeNull();
  });

  it('deletes replaced and removed uploads that were never saved, and on close', () => {
    const { unmount } = setup();
    fireEvent.click(screen.getByText('upload-1'));
    fireEvent.click(screen.getByText('upload-2'));
    expect(deleteImageByUrl).toHaveBeenCalledWith('https://x/new-1.jpg');
    fireEvent.click(screen.getByText('remove'));
    expect(deleteImageByUrl).toHaveBeenCalledWith('https://x/new-2.jpg');

    fireEvent.click(screen.getByText('upload-1'));
    deleteImageByUrl.mockClear();
    unmount();
    expect(deleteImageByUrl).toHaveBeenCalledWith('https://x/new-1.jpg');
  });

  it('keeps a saved upload when the wizard closes', async () => {
    const { onSave, unmount } = setup();
    fireEvent.click(screen.getByText('upload-1'));
    next();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await screen.findByTestId('onboarding-bio');
    unmount();
    expect(deleteImageByUrl).not.toHaveBeenCalled();
  });

  describe('dialog behaviour', () => {
    it('is a labelled modal dialog', () => {
      setup();
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'onboarding-title');
      expect(document.getElementById('onboarding-title')).toBeInTheDocument();
    });

    it('moves focus into the dialog and back to the opener on close', () => {
      const opener = document.createElement('button');
      document.body.appendChild(opener);
      opener.focus();
      const { unmount } = render(
        <MemoryRouter>
          <ProfileOnboarding profile={emptyProfile} uid="u1" onSave={vi.fn()} onClose={vi.fn()} />
        </MemoryRouter>
      );
      expect(screen.getByRole('dialog')).toHaveFocus();
      unmount();
      expect(opener).toHaveFocus();
      opener.remove();
    });

    it('closes on Escape like the close button', () => {
      const { onClose } = setup();
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('keeps Tab inside the dialog', () => {
      setup();
      const dialog = screen.getByRole('dialog');
      const buttons = dialog.querySelectorAll('button:not([disabled])');
      const last = buttons[buttons.length - 1] as HTMLElement;
      const first = buttons[0] as HTMLElement;
      last.focus();
      fireEvent.keyDown(last, { key: 'Tab' });
      expect(first).toHaveFocus();
      fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
      expect(last).toHaveFocus();
    });
  });
});

describe('ProfileOnboarding Feuerplatz', () => {
  it('starts empty, is optional, and saves nothing extra when left alone', async () => {
    const { onSave } = setup({ ...emptyProfile, bio: 'Hallo', photoURL: 'https://x/a.jpg' });
    next(); // photo, unchanged
    next(); // bio, unchanged
    expect(await screen.findByTestId('fireplace-field')).toBeInTheDocument();
    expect(screen.queryByTestId('fireplace-chosen')).not.toBeInTheDocument();
    next();
    await waitFor(() => expect(screen.getByTestId('onboarding-instagram')).toBeInTheDocument());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('takes over the chosen place, private by default, in the directory step', async () => {
    const { onSave } = setup({ ...emptyProfile, bio: 'Hallo', photoURL: 'https://x/a.jpg' });
    next();
    next();
    fireEvent.change(await screen.findByTestId('place-search-input'), {
      target: { value: 'Dornbirn' },
    });
    fireEvent.click((await screen.findAllByTestId('place-search-option'))[0]);
    expect(screen.getByTestId('fireplace-visible')).not.toBeChecked();
    fireEvent.click(screen.getByTestId('fireplace-visible'));
    next();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0];
    expect(saved.fireplace).toMatchObject({ label: 'Dornbirn' });
    expect(saved.fireplaceVisible).toBe(true);
    expect(saved).not.toHaveProperty('listedInDirectory');
  });
});
