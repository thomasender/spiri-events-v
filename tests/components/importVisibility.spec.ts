import { describe, it, expect } from 'vitest';
import { filterCuratedForReview, approveBlockedReason } from '../../src/utils/eventImport';

const plain = { id: 'p' };
const unclaimed = { id: 'u', curation: { organizerRef: 'o', claimable: true } };
const claimed = { id: 'c', curation: { organizerRef: 'o', claimable: false } };
const events = [plain, unclaimed, claimed];

describe('filterCuratedForReview', () => {
  it('hides unclaimed curated events from moderators by default', () => {
    expect(
      filterCuratedForReview(events, { isSuperAdmin: false, moderatorsSeeInReview: false })
    ).toEqual([plain, claimed]);
  });
  it('shows them to moderators when the switch is on', () => {
    expect(
      filterCuratedForReview(events, { isSuperAdmin: false, moderatorsSeeInReview: true })
    ).toEqual(events);
  });
  it('always shows them to Super-Admins', () => {
    expect(
      filterCuratedForReview(events, { isSuperAdmin: true, moderatorsSeeInReview: false })
    ).toEqual(events);
  });
});

describe('approveBlockedReason', () => {
  it('blocks curated events without consent only', () => {
    expect(approveBlockedReason(unclaimed)).toMatch(/keine Zustimmung/);
    expect(approveBlockedReason({ curation: { consentAt: 1 } })).toBeNull();
    expect(approveBlockedReason(plain)).toBeNull();
  });
});
