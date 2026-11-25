import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveWizardDraft,
  loadWizardDraft,
  clearWizardDraft,
  adoptGuestWizardDraft,
  hasGuestWizardDraft,
  wizardDraftOwner,
  GUEST_DRAFT_ID,
  GUEST_DRAFT_MAX_AGE_MS,
} from '../../src/utils/wizardDraftStorage';

describe('wizardDraftStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('saveWizardDraft / loadWizardDraft round-trip', () => {
    it('saves and loads a draft for a given uid', () => {
      const draft = {
        formData: {
          title: 'Test Event',
          date: '2026-09-15',
          organizer: { name: 'Anna Muster', email: 'a@b.com' },
          customDates: ['2026-09-15', '2026-09-22'],
        },
        currentStep: 3,
        rightsConfirmed: false,
      };

      expect(saveWizardDraft('user-1', draft)).toBe(true);
      expect(loadWizardDraft('user-1')).toEqual(draft);
    });

    it('keys are per-user (does not leak between uids)', () => {
      saveWizardDraft('user-a', { formData: { title: 'A' }, currentStep: 1 });
      saveWizardDraft('user-b', { formData: { title: 'B' }, currentStep: 2 });

      expect(loadWizardDraft('user-a')).toMatchObject({ formData: { title: 'A' }, currentStep: 1 });
      expect(loadWizardDraft('user-b')).toMatchObject({ formData: { title: 'B' }, currentStep: 2 });
    });
  });

  describe('loadWizardDraft defensive parsing', () => {
    it('returns null when nothing is saved', () => {
      expect(loadWizardDraft('ghost')).toBeNull();
    });

    it('returns null when the stored JSON is corrupt', () => {
      localStorage.setItem('eventWizardDraft:user-1', '{not valid json');
      expect(loadWizardDraft('user-1')).toBeNull();
    });

    it('returns null when the schema version does not match', () => {
      localStorage.setItem(
        'eventWizardDraft:user-1',
        JSON.stringify({ version: 999, draft: { formData: {} } })
      );
      expect(loadWizardDraft('user-1')).toBeNull();
    });

    it('returns null when the draft payload is missing the formData', () => {
      localStorage.setItem(
        'eventWizardDraft:user-1',
        JSON.stringify({ version: 1, draft: { currentStep: 2 } })
      );
      expect(loadWizardDraft('user-1')).toBeNull();
    });
  });

  describe('saveWizardDraft defensive writing', () => {
    it('returns false and does not throw when uid is missing', () => {
      expect(saveWizardDraft(null, { formData: {} })).toBe(false);
      expect(saveWizardDraft('', { formData: {} })).toBe(false);
    });

    it('returns false for non-serializable payloads', () => {
      const circular = { formData: {} };
      circular.formData.self = circular;
      expect(saveWizardDraft('user-1', circular)).toBe(false);
    });
  });

  describe('clearWizardDraft', () => {
    it('removes the saved draft for the given uid', () => {
      saveWizardDraft('user-1', { formData: { title: 'X' }, currentStep: 1 });
      expect(loadWizardDraft('user-1')).not.toBeNull();

      clearWizardDraft('user-1');

      expect(loadWizardDraft('user-1')).toBeNull();
    });

    it('does not affect drafts belonging to other uids', () => {
      saveWizardDraft('user-a', { formData: { title: 'A' }, currentStep: 1 });
      saveWizardDraft('user-b', { formData: { title: 'B' }, currentStep: 1 });

      clearWizardDraft('user-a');

      expect(loadWizardDraft('user-a')).toBeNull();
      expect(loadWizardDraft('user-b')).not.toBeNull();
    });

    it('is a no-op when there is nothing to clear', () => {
      expect(() => clearWizardDraft('nobody')).not.toThrow();
    });
  });

  describe('guest drafts (no account yet)', () => {
    it('stores a guest draft under its own key', () => {
      expect(wizardDraftOwner(null)).toBe(GUEST_DRAFT_ID);
      expect(wizardDraftOwner({ uid: 'u1' })).toBe('u1');
      saveWizardDraft(wizardDraftOwner(null), { formData: { title: 'Gast' }, currentStep: 4 });
      expect(localStorage.getItem('eventWizardDraft:guest')).not.toBeNull();
      expect(hasGuestWizardDraft()).toBe(true);
    });

    it('counts only a guest draft that reached the last page (merely opening the wizard stores one too)', () => {
      saveWizardDraft(GUEST_DRAFT_ID, { formData: { title: '' }, currentStep: 1 });
      expect(hasGuestWizardDraft()).toBe(false);
    });

    it('drops a guest draft older than about two weeks', () => {
      saveWizardDraft(GUEST_DRAFT_ID, { formData: { title: 'Alt' }, currentStep: 2 });
      const later = Date.now() + GUEST_DRAFT_MAX_AGE_MS + 1000;
      expect(loadWizardDraft(GUEST_DRAFT_ID, later)).toBeNull();
      expect(localStorage.getItem('eventWizardDraft:guest')).toBeNull();
    });

    it('keeps account drafts regardless of their age', () => {
      saveWizardDraft('user-1', { formData: { title: 'Alt' }, currentStep: 2 });
      const later = Date.now() + GUEST_DRAFT_MAX_AGE_MS + 1000;
      expect(loadWizardDraft('user-1', later)).not.toBeNull();
    });

    it('moves the guest draft onto the account once and removes the guest key', () => {
      saveWizardDraft(GUEST_DRAFT_ID, { formData: { title: 'Gast' }, currentStep: 4 });
      expect(adoptGuestWizardDraft('user-1')).toBe(true);
      expect(loadWizardDraft('user-1')).toMatchObject({
        formData: { title: 'Gast' },
        currentStep: 4,
      });
      expect(localStorage.getItem('eventWizardDraft:guest')).toBeNull();
      expect(hasGuestWizardDraft()).toBe(false);
      expect(adoptGuestWizardDraft('user-1')).toBe(false);
    });

    it('lets the newer guest draft win over an older account draft, keeping other fields', () => {
      saveWizardDraft('user-1', {
        formData: { title: 'Alt', link: 'www.alt.at' },
        currentStep: 2,
        instagramConsent: true,
      });
      saveWizardDraft(GUEST_DRAFT_ID, { formData: { title: 'Neu' }, currentStep: 4 });
      adoptGuestWizardDraft('user-1');
      expect(loadWizardDraft('user-1')).toEqual({
        formData: { title: 'Neu', link: 'www.alt.at' },
        currentStep: 4,
        instagramConsent: true,
      });
    });

    it('does nothing without a guest draft or without a uid', () => {
      saveWizardDraft('user-1', { formData: { title: 'Eigen' }, currentStep: 1 });
      expect(adoptGuestWizardDraft('user-1')).toBe(false);
      expect(loadWizardDraft('user-1')).toMatchObject({ formData: { title: 'Eigen' } });
      saveWizardDraft(GUEST_DRAFT_ID, { formData: { title: 'Gast' }, currentStep: 1 });
      expect(adoptGuestWizardDraft('')).toBe(false);
      expect(loadWizardDraft(GUEST_DRAFT_ID)).not.toBeNull();
    });
  });
});
