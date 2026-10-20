import { describe, it, expect } from 'vitest';
import { buildRevisionDraft, computeEventChanges } from '../../functions/src/eventRevisions';

describe('computeEventChanges', () => {
  it('returns only changed fields as from/to', () => {
    const changes = computeEventChanges(
      { title: 'Yoga', place: 'Bregenz', time: '18:00' },
      { title: 'Yoga Flow', place: 'Bregenz', time: '18:00' }
    );
    expect(changes).toEqual({ title: { from: 'Yoga', to: 'Yoga Flow' } });
  });

  it('ignores bookkeeping fields', () => {
    const changes = computeEventChanges(
      { title: 'A', updatedAt: 1, favoriteCount: 2, slug: 'a', approvedAt: 1 },
      { title: 'A', updatedAt: 2, favoriteCount: 3, slug: 'a-2', approvedAt: 2 }
    );
    expect(changes).toEqual({});
  });

  it('treats missing, null and empty values as equal', () => {
    expect(
      computeEventChanges(
        { feeNote: '', customDates: [] },
        { feeNote: null, customDates: undefined }
      )
    ).toEqual({});
  });

  it('detects nested object and array changes', () => {
    const changes = computeEventChanges(
      { organizer: { firstName: 'A', lastName: 'B' }, customDates: ['2026-01-01'] },
      { organizer: { lastName: 'B', firstName: 'C' }, customDates: ['2026-01-01', '2026-01-08'] }
    );
    expect(Object.keys(changes).sort()).toEqual(['customDates', 'organizer']);
  });

  it('converts timestamps to ISO strings', () => {
    const ts = { toMillis: () => Date.UTC(2026, 0, 1) };
    const changes = computeEventChanges({ x: null }, { x: ts });
    expect(changes.x.to).toBe('2026-01-01T00:00:00.000Z');
  });

  it('records added fields', () => {
    expect(computeEventChanges({}, { link: 'https://a.at' })).toEqual({
      link: { from: null, to: 'https://a.at' },
    });
  });
});

describe('buildRevisionDraft', () => {
  it('returns null when nothing relevant changed', () => {
    expect(
      buildRevisionDraft({ status: 'pending', updatedAt: 1 }, { status: 'pending', updatedAt: 2 })
    ).toBeNull();
  });

  it('records a pure status transition without changes', () => {
    expect(
      buildRevisionDraft({ status: 'pending' }, { status: 'approved', approvedAt: 5 })
    ).toEqual({
      statusFrom: 'pending',
      statusTo: 'approved',
      changes: {},
    });
  });

  it('keeps status out of the field changes', () => {
    const draft = buildRevisionDraft(
      { status: 'approved', title: 'A' },
      { status: 'pending', title: 'B' }
    );
    expect(draft?.statusFrom).toBe('approved');
    expect(draft?.statusTo).toBe('pending');
    expect(Object.keys(draft?.changes ?? {})).toEqual(['title']);
  });
});
