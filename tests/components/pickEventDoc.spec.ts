import { describe, it, expect } from 'vitest';
import { pickEventDoc } from '../../src/utils/pickEventDoc';

const doc = (id: string, status: string, createdMs = 0) => ({
  id,
  data: () => ({ status, createdAt: { toMillis: () => createdMs } }),
});

describe('pickEventDoc', () => {
  it('returns null for no docs', () => {
    expect(pickEventDoc([])).toBeNull();
  });

  it('prefers the submitted event over a draft with the same slug, regardless of order', () => {
    const draft = doc('draft', 'draft', 2000);
    const pending = doc('pending', 'pending', 1000);
    expect(pickEventDoc([draft, pending])?.id).toBe('pending');
    expect(pickEventDoc([pending, draft])?.id).toBe('pending');
  });

  it('prefers approved over pending', () => {
    expect(pickEventDoc([doc('p', 'pending'), doc('a', 'approved')])?.id).toBe('a');
  });

  it('takes the newest within the same status', () => {
    expect(pickEventDoc([doc('old', 'draft', 1), doc('new', 'draft', 2)])?.id).toBe('new');
  });
});
