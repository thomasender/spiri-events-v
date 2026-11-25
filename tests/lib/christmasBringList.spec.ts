import { describe, expect, it } from 'vitest';
import {
  buildAttendees,
  buildBringSummary,
  countPersons,
} from '../../functions/src/christmasBringList';

describe('buildBringSummary', () => {
  it('counts case-insensitively, keeps the first spelling and sorts by count', () => {
    const out = buildBringSummary([
      { bring: ['Brot', 'Salat'] },
      { bring: ['brot ', 'Kekse'] },
      { bring: ['BROT'] },
      { bring: 'x' },
      {},
      { bring: ['', 5, 'Salat'] },
    ]);
    expect(out).toEqual([
      { label: 'Brot', count: 3 },
      { label: 'Salat', count: 2 },
      { label: 'Kekse', count: 1 },
    ]);
  });
});

describe('countPersons', () => {
  it('sums valid head counts and ignores junk', () => {
    expect(
      countPersons([{ persons: 2 }, { persons: 3 }, { persons: 'x' }, { persons: 99 }, {}])
    ).toBe(5);
  });
});

describe('buildAttendees', () => {
  it('lists only people who opted in, never contact data', () => {
    const out = buildAttendees([
      { showPublic: true, name: ' Anna ', photoURL: 'https://x/a.jpg' },
      { showPublic: false, name: 'Hidden' },
      { name: 'Also hidden' },
      { showPublic: true, name: 'Ben' },
      { showPublic: true, name: ' ' },
    ]);
    expect(out).toEqual([
      { name: 'Anna', photoURL: null, photoFocalPoint: null, photoZoom: null },
      { name: 'Ben', photoURL: null, photoFocalPoint: null, photoZoom: null },
    ]);
  });

  it('takes photo, focal point and zoom from the profile of signed-in people', () => {
    const profiles = new Map([
      [
        'u1',
        {
          photoURL: 'https://firebasestorage.googleapis.com/v0/b/x/o/p.jpg',
          photoFocalPoint: { x: 0.3, y: 0.2 },
          photoZoom: 9,
        },
      ],
    ]);
    const out = buildAttendees(
      [
        { showPublic: true, name: 'Anna', uid: 'u1', photoURL: 'https://old.example/a.jpg' },
        { showPublic: true, name: 'Ben', uid: 'u2' },
      ],
      profiles
    );
    expect(out[0]).toEqual({
      name: 'Anna',
      photoURL: 'https://firebasestorage.googleapis.com/v0/b/x/o/p.jpg',
      photoFocalPoint: { x: 0.3, y: 0.2 },
      photoZoom: 3,
    });
    expect(out[1]).toEqual({ name: 'Ben', photoURL: null, photoFocalPoint: null, photoZoom: null });
  });
});
