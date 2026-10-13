import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import InstagramConsentField from '../../src/components/InstagramConsentField';
import {
  buildInstagramHandleOverridePatch,
  normalizeInstagramHandle,
  resolveInstagramHandleOverride,
  resolveOrganizerProfileHandle,
} from '../../src/utils/instagramHandle';

describe('normalizeInstagramHandle', () => {
  it.each([
    ['@max.muster', '@max.muster'],
    ['  max_muster  ', '@max_muster'],
    ['@@max', '@max'],
    ['https://www.instagram.com/max/', '@max'],
  ])('accepts %s', (input, expected) => {
    expect(normalizeInstagramHandle(input)).toBe(expected);
  });

  it.each(['', '   ', '@', 'max muster', 'max-muster', 'ma$x', 'a'.repeat(31)])(
    'rejects %j',
    (input) => {
      expect(normalizeInstagramHandle(input)).toBeNull();
    }
  );
});

describe('resolveInstagramHandleOverride', () => {
  it('returns the normalised override when it differs from the profile', () => {
    expect(resolveInstagramHandleOverride(' @other ', '@mine')).toBe('@other');
  });
  it('returns null when empty, invalid or equal to the profile handle', () => {
    expect(resolveInstagramHandleOverride('', '@mine')).toBeNull();
    expect(resolveInstagramHandleOverride('no good!', '@mine')).toBeNull();
    expect(resolveInstagramHandleOverride('@MINE', 'mine')).toBeNull();
  });
});

describe('resolveOrganizerProfileHandle: the creator, never the editor', () => {
  const admin = { uid: 'admin' };
  const adminProfile = { socialMedia: { instagram: '@the_admin' } };
  const organizerPublic = { socialMedia: { instagram: '@the_organizer' } };

  it("admin editing a user's event gets the creator's public handle", () => {
    const event = { createdBy: 'organizer' };
    expect(
      resolveOrganizerProfileHandle({
        event,
        user: admin,
        ownProfile: adminProfile,
        organizerPublicProfile: organizerPublic,
      })
    ).toBe('@the_organizer');
    // Creator does not share the handle publicly: empty, not the admin's.
    expect(
      resolveOrganizerProfileHandle({
        event,
        user: admin,
        ownProfile: adminProfile,
        organizerPublicProfile: null,
      })
    ).toBe('');
  });

  it("admin's own event and a new event use the admin's profile", () => {
    for (const event of [{ createdBy: 'admin' }, null]) {
      expect(
        resolveOrganizerProfileHandle({
          event,
          user: admin,
          ownProfile: adminProfile,
          organizerPublicProfile: organizerPublic,
        })
      ).toBe('@the_admin');
    }
  });
});

describe('buildInstagramHandleOverridePatch', () => {
  it('leaves an unchanged override alone, also when the creator handle is unknown', () => {
    expect(
      buildInstagramHandleOverridePatch({
        consent: true,
        input: '@event_name',
        organizerHandle: '',
        stored: '@event_name',
      })
    ).toEqual({});
    expect(
      buildInstagramHandleOverridePatch({
        consent: true,
        input: '',
        organizerHandle: '@org',
        stored: undefined,
      })
    ).toEqual({});
  });

  it('writes a changed override, or null when reset to the profile handle', () => {
    expect(
      buildInstagramHandleOverridePatch({
        consent: true,
        input: '@neu',
        organizerHandle: '@org',
        stored: '@alt',
      })
    ).toEqual({ instagramHandleOverride: '@neu' });
    expect(
      buildInstagramHandleOverridePatch({
        consent: true,
        input: '',
        organizerHandle: '@org',
        stored: '@alt',
      })
    ).toEqual({ instagramHandleOverride: null });
  });

  it('does not touch the stored value without consent', () => {
    expect(
      buildInstagramHandleOverridePatch({
        consent: false,
        input: '',
        organizerHandle: '',
        stored: '@alt',
      })
    ).toEqual({});
  });
});

describe('InstagramConsentField for an organizer (admin edit)', () => {
  it('names the organizer profile and offers editing when no handle is known', () => {
    render(
      <InstagramConsentField
        checked
        onChange={() => {}}
        instagramHandle=""
        forOrganizer
        handleOverride=""
        onHandleOverrideChange={() => {}}
      />
    );
    const hint = screen.getByTestId('instagram-consent-hint').textContent;
    expect(hint).toContain('aus dem Profil des Veranstalters');
    expect(hint).not.toContain('deinem Profil');
    expect(screen.getByTestId('instagram-handle-edit')).toBeTruthy();
  });
});

function Harness({ onOverride }: { onOverride?: (v: string) => void }) {
  const [override, setOverride] = useState('');
  return (
    <InstagramConsentField
      checked
      onChange={() => {}}
      instagramHandle="@petermathis_pm"
      handleOverride={override}
      onHandleOverrideChange={(v: string) => {
        setOverride(v);
        onOverride?.(v);
      }}
    />
  );
}

describe('InstagramConsentField handle editing', () => {
  it('turns the handle into an input inline and uses the entered handle', () => {
    const spy = vi.fn();
    render(<Harness onOverride={spy} />);
    expect(screen.getByTestId('instagram-handle-text').textContent).toBe('@petermathis_pm');

    fireEvent.click(screen.getByTestId('instagram-handle-edit'));
    const input = screen.getByTestId('instagram-handle-input') as HTMLInputElement;
    expect(input.value).toBe('@petermathis_pm');

    fireEvent.change(input, { target: { value: '@andere.person' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(spy).toHaveBeenCalledWith('@andere.person');
    expect(screen.queryByTestId('instagram-handle-input')).toBeNull();
    expect(screen.getByTestId('instagram-handle-text').textContent).toBe('@andere.person');
  });

  it('discards invalid input and keeps the previous handle', () => {
    const spy = vi.fn();
    render(<Harness onOverride={spy} />);
    fireEvent.click(screen.getByTestId('instagram-handle-edit'));
    fireEvent.change(screen.getByTestId('instagram-handle-input'), {
      target: { value: 'kein gültiger name' },
    });
    fireEvent.blur(screen.getByTestId('instagram-handle-input'));
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByTestId('instagram-handle-text').textContent).toBe('@petermathis_pm');
  });
});
