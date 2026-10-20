import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RevisionEntry } from '../../src/components/EventHistory';
import { diffWords } from '../../src/utils/wordDiff';

describe('diffWords', () => {
  it('marks removed and added words', () => {
    const segs = diffWords('Wir treffen uns am Montag', 'Wir treffen uns am Dienstag');
    expect(segs.filter((s) => s.type === 'del').map((s) => s.text)).toEqual(['Montag']);
    expect(segs.filter((s) => s.type === 'add').map((s) => s.text)).toEqual(['Dienstag']);
  });

  it('returns a single same segment for identical text', () => {
    expect(diffWords('a b', 'a b')).toEqual([{ type: 'same', text: 'a b' }]);
  });
});

describe('RevisionEntry', () => {
  it('shows who, status transition and field changes', () => {
    render(
      <RevisionEntry
        revision={{
          id: 'r1',
          at: new Date('2026-10-01T10:00:00Z'),
          byRole: 'User',
          byName: 'Anna',
          statusFrom: 'draft',
          statusTo: 'pending',
          changes: {
            place: { from: 'Bregenz', to: 'Dornbirn' },
            description: { from: '<p>Hallo Welt</p>', to: '<p>Hallo schöne Welt</p>' },
          },
        }}
      />
    );
    expect(screen.getByText(/Anna \(Veranstalter\)/)).toBeInTheDocument();
    expect(screen.getByText('Im Review')).toBeInTheDocument();
    expect(screen.getByTestId('history-change-place')).toHaveTextContent('Bregenz → Dornbirn');
    expect(screen.getByTestId('history-change-description').querySelector('ins')).toHaveTextContent(
      'schöne'
    );
  });
});
