import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveWizardDraft,
  loadWizardDraft,
  clearWizardDraft,
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
          organizer: { firstName: 'Anna', lastName: 'Muster', email: 'a@b.com' },
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
});
