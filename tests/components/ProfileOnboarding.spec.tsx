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
    expect(await screen.findByTestId('onboarding-gain')).toHaveTextContent('+33 %');

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

    expect(await screen.findByTestId('onboarding-badge')).toHaveTextContent('Profil vollständig');
    expect(percent()).toContain('100 %');
    expect(deleteImageByUrl).not.toHaveBeenCalled();
  });

  it('counts unsaved input live and drops it when the step is skipped', async () => {
    setup();
    fireEvent.click(screen.getByText('upload-1'));
    expect(percent()).toContain('33 %');
    skip();
    expect(percent()).toContain('0 %');
    // the unsaved upload is cleaned up
    expect(deleteImageByUrl).toHaveBeenCalledWith('https://x/new-1.jpg');

    fireEvent.change(await screen.findByTestId('onboarding-bio'), { target: { value: 'Hi' } });
    expect(percent()).toContain('33 %');
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
    expect(await screen.findByTestId('onboarding-badge')).toBeInTheDocument();
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
