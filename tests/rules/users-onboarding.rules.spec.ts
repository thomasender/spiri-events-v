import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8782').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-rules-onboarding',
    firestore: {
      rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
      host,
      port: Number(port),
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

const base = { displayName: 'Alice', bio: '' };

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/alice'), base);
  });
});

// The cross-device "onboarding dismissed" flag on the own user doc.
describe('users/{uid}.onboardingDismissed', () => {
  it('the owner can set it on update', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(updateDoc(doc(db, 'users/alice'), { onboardingDismissed: true }));
  });

  it('the owner can set it when the doc is created', async () => {
    const db = env.authenticatedContext('carol').firestore();
    await assertSucceeds(setDoc(doc(db, 'users/carol'), { ...base, onboardingDismissed: true }));
  });

  it('rejects a non-boolean value', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(updateDoc(doc(db, 'users/alice'), { onboardingDismissed: 'yes' }));
    await assertFails(
      setDoc(doc(env.authenticatedContext('carol').firestore(), 'users/carol'), {
        ...base,
        onboardingDismissed: 1,
      })
    );
  });

  it('nobody else can set it on someone elses doc', async () => {
    const db = env.authenticatedContext('bob').firestore();
    await assertFails(updateDoc(doc(db, 'users/alice'), { onboardingDismissed: true }));
  });

  it('other unknown fields are still rejected', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(updateDoc(doc(db, 'users/alice'), { somethingElse: true }));
  });
});

// The remembered "Wo bist du?" choice (place + radius) on the own user doc.
describe('users/{uid}.placeSelection', () => {
  const valid = {
    label: 'Bregenz',
    lat: 47.503,
    lon: 9.747,
    radiusKm: 25,
    regionId: 'vorarlberg',
    source: 'search',
    updatedAt: 1760000000000,
  };

  it('the owner can save and clear it', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(updateDoc(doc(db, 'users/alice'), { placeSelection: valid }));
    await assertSucceeds(updateDoc(doc(db, 'users/alice'), { placeSelection: null }));
  });

  it('a place without a region is fine (outside every region)', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'users/alice'), { placeSelection: { ...valid, regionId: null } })
    );
  });

  it.each([
    ['an unknown region', { regionId: 'narnia' }],
    ['a radius of 0', { radiusKm: 0 }],
    ['a radius above 200 km', { radiusKm: 500 }],
    ['an impossible latitude', { lat: 91 }],
    ['an impossible longitude', { lon: 181 }],
    ['an empty label', { label: '' }],
    ['a very long label', { label: 'x'.repeat(81) }],
    ['an unknown source', { source: 'ip' }],
    ['a stored exact position', { accuracy: 12 }],
  ])('rejects %s', async (_name, patch) => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(
      updateDoc(doc(db, 'users/alice'), { placeSelection: { ...valid, ...patch } })
    );
  });

  it('rejects something that is not a map', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(updateDoc(doc(db, 'users/alice'), { placeSelection: 'Bregenz' }));
  });

  it('nobody else can set it on someone elses doc', async () => {
    const db = env.authenticatedContext('bob').firestore();
    await assertFails(updateDoc(doc(db, 'users/alice'), { placeSelection: valid }));
  });
});

// "Onboarding finished" on the own user doc: false at registration, true once done.
describe('users/{uid}.onboardingCompleted', () => {
  it('the owner can set it at registration and on finishing', async () => {
    const carol = env.authenticatedContext('carol').firestore();
    await assertSucceeds(
      setDoc(doc(carol, 'users/carol'), { ...base, onboardingCompleted: false })
    );
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(updateDoc(doc(alice, 'users/alice'), { onboardingCompleted: true }));
  });

  it('rejects a non-boolean value and other people', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(updateDoc(doc(alice, 'users/alice'), { onboardingCompleted: 'yes' }));
    const bob = env.authenticatedContext('bob').firestore();
    await assertFails(updateDoc(doc(bob, 'users/alice'), { onboardingCompleted: true }));
  });
});

// In-app alerts for admins, written only by the Cloud Function.
describe('users/{uid}/adminAlerts', () => {
  const alert = { eventId: 'e1', eventTitle: 'Yoga', read: false, changeCount: 1 };

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice/adminAlerts/e1'), alert);
    });
  });

  it('the owner reads, marks as read and deletes', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(getDoc(doc(db, 'users/alice/adminAlerts/e1')));
    await assertSucceeds(updateDoc(doc(db, 'users/alice/adminAlerts/e1'), { read: true }));
    await assertSucceeds(deleteDoc(doc(db, 'users/alice/adminAlerts/e1')));
  });

  it('nobody else can read or change it', async () => {
    const db = env.authenticatedContext('bob').firestore();
    await assertFails(getDoc(doc(db, 'users/alice/adminAlerts/e1')));
    await assertFails(updateDoc(doc(db, 'users/alice/adminAlerts/e1'), { read: true }));
  });

  it('no client can create an alert, not even for themselves', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'users/alice/adminAlerts/e2'), alert));
  });

  it('the owner cannot edit anything but read, nor set it back to unread', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(updateDoc(doc(db, 'users/alice/adminAlerts/e1'), { changeCount: 9 }));
    await assertFails(updateDoc(doc(db, 'users/alice/adminAlerts/e1'), { read: false }));
  });
});

// "Last opened Review" marker for the staff notification dots.
describe('users/{uid}/seen/{area}', () => {
  const seen = () => ({ eventIds: ['e1', 'e2'], at: serverTimestamp() });

  it('the owner writes, reads and deletes her review marker', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(db, 'users/alice/seen/review'), seen()));
    await assertSucceeds(setDoc(doc(db, 'users/alice/seen/review'), seen()));
    await assertSucceeds(getDoc(doc(db, 'users/alice/seen/review')));
    await assertSucceeds(deleteDoc(doc(db, 'users/alice/seen/review')));
  });

  it('nobody else can read or write it', async () => {
    const db = env.authenticatedContext('bob').firestore();
    await assertFails(setDoc(doc(db, 'users/alice/seen/review'), seen()));
    await assertFails(getDoc(doc(db, 'users/alice/seen/review')));
  });

  it('only known areas, only eventIds + server time, at most 500 ids', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'users/alice/seen/other'), seen()));
    await assertFails(setDoc(doc(db, 'users/alice/seen/review'), { ...seen(), extra: 1 }));
    await assertFails(
      setDoc(doc(db, 'users/alice/seen/review'), { eventIds: [], at: new Date(0) })
    );
    const tooMany = Array.from({ length: 501 }, (_, i) => `e${i}`);
    await assertFails(
      setDoc(doc(db, 'users/alice/seen/review'), { eventIds: tooMany, at: serverTimestamp() })
    );
  });
});

// Feuerplatz: private place + switch on the user doc, only the name on the public doc.
describe('Feuerplatz fields', () => {
  const place = { label: 'Dornbirn', lat: 47.413, lon: 9.744 };
  const pub = (uid: string) => `users/${uid}/publicProfile/data`;

  it('the owner stores a valid place and the switch on the user doc, or removes the place', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'users/alice'), { fireplace: place, fireplaceVisible: true })
    );
    await assertSucceeds(updateDoc(doc(db, 'users/alice'), { fireplace: null }));
  });

  it('rejects malformed places and a non-boolean switch', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(updateDoc(doc(db, 'users/alice'), { fireplace: { ...place, label: '' } }));
    await assertFails(updateDoc(doc(db, 'users/alice'), { fireplace: { ...place, lat: 123 } }));
    await assertFails(updateDoc(doc(db, 'users/alice'), { fireplace: { ...place, extra: 1 } }));
    await assertFails(updateDoc(doc(db, 'users/alice'), { fireplace: 'Dornbirn' }));
    await assertFails(updateDoc(doc(db, 'users/alice'), { fireplaceVisible: 'yes' }));
  });

  it('the public profile takes only a place name, never coordinates or the private fields', async () => {
    const db = env.authenticatedContext('carol').firestore();
    await assertSucceeds(setDoc(doc(db, pub('carol')), { ...base, fireplaceLabel: 'Dornbirn' }));
    await assertSucceeds(setDoc(doc(db, pub('carol')), { ...base }));
    await assertFails(setDoc(doc(db, pub('carol')), { ...base, fireplace: place }));
    await assertFails(setDoc(doc(db, pub('carol')), { ...base, fireplaceVisible: true }));
    await assertFails(setDoc(doc(db, pub('carol')), { ...base, fireplaceLabel: { ...place } }));
    await assertFails(setDoc(doc(db, pub('carol')), { ...base, fireplaceLabel: '' }));
    await assertFails(setDoc(doc(db, pub('carol')), { ...base, fireplaceLabel: 'x'.repeat(81) }));
  });
});

// Vereinsmitglied: only the adminUpdateMember callable (Admin SDK) sets it.
describe('publicProfile.clubMember', () => {
  const pub = (uid: string) => `users/${uid}/publicProfile/data`;

  it('the owner can neither create nor set, change or remove it', async () => {
    const db = env.authenticatedContext('carol').firestore();
    await assertFails(setDoc(doc(db, pub('carol')), { ...base, clubMember: true }));
    await assertFails(setDoc(doc(db, pub('carol')), { ...base, clubMember: false }));
    await assertSucceeds(setDoc(doc(db, pub('carol')), { ...base }));
    await assertFails(updateDoc(doc(db, pub('carol')), { clubMember: true }));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), pub('carol')), { clubMember: true });
    });
    await assertFails(updateDoc(doc(db, pub('carol')), { clubMember: false }));
    await assertFails(updateDoc(doc(db, pub('carol')), { clubMember: deleteField() }));
    // The normal profile save (merge, without the field) keeps working.
    await assertSucceeds(setDoc(doc(db, pub('carol')), { ...base, bio: 'Neu' }, { merge: true }));
  });

  it('anyone, also logged out, can list the members (collection group query)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), pub('carol')), { ...base, clubMember: true });
    });
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(
      getDocs(query(collectionGroup(db, 'publicProfile'), where('clubMember', '==', true)))
    );
  });
});

// The domain the account was registered on; mails link to it.
describe('users/{uid}.siteOrigin', () => {
  it('the owner can set it when the doc is created', async () => {
    const db = env.authenticatedContext('carol').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users/carol'), { ...base, siteOrigin: 'https://www.deintribe.de' })
    );
  });

  it('rejects a non-string value on create', async () => {
    const db = env.authenticatedContext('carol').firestore();
    await assertFails(setDoc(doc(db, 'users/carol'), { ...base, siteOrigin: 5 }));
  });

  it('cannot be changed afterwards', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(
      updateDoc(doc(db, 'users/alice'), { siteOrigin: 'https://www.deintribe.ch' })
    );
  });
});

// Consent to the Nutzungsbedingungen: written with the profile doc at registration.
describe('users/{uid}.termsAcceptedAt / termsVersion', () => {
  const terms = () => ({ termsAcceptedAt: serverTimestamp(), termsVersion: '2026-11' });

  it('the owner stores the consent when the doc is created', async () => {
    const db = env.authenticatedContext('carol').firestore();
    await assertSucceeds(setDoc(doc(db, 'users/carol'), { ...base, ...terms() }));
  });

  it('accounts without consent still work (existing members are not asked again)', async () => {
    const carol = env.authenticatedContext('carol').firestore();
    await assertSucceeds(setDoc(doc(carol, 'users/carol'), { ...base }));
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(updateDoc(doc(alice, 'users/alice'), { bio: 'Hallo' }));
  });

  it('the owner can record a (new) consent later, with server time', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(updateDoc(doc(db, 'users/alice'), terms()));
  });

  it('rejects a back-dated or wrongly typed consent, or only one of the two fields', async () => {
    const carol = env.authenticatedContext('carol').firestore();
    await assertFails(
      setDoc(doc(carol, 'users/carol'), {
        ...base,
        termsAcceptedAt: new Date(0),
        termsVersion: '2026-11',
      })
    );
    await assertFails(setDoc(doc(carol, 'users/carol'), { ...base, ...terms(), termsVersion: 5 }));
    await assertFails(
      setDoc(doc(carol, 'users/carol'), { ...base, ...terms(), termsVersion: 'x'.repeat(21) })
    );
    await assertFails(setDoc(doc(carol, 'users/carol'), { ...base, termsVersion: '2026-11' }));
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(updateDoc(doc(alice, 'users/alice'), { termsAcceptedAt: serverTimestamp() }));
  });

  it('the consent cannot be removed or silently changed afterwards', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'users/alice'), {
        termsAcceptedAt: new Date(),
        termsVersion: '2026-11',
      });
    });
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(
      updateDoc(doc(db, 'users/alice'), {
        termsAcceptedAt: deleteField(),
        termsVersion: deleteField(),
      })
    );
    await assertFails(updateDoc(doc(db, 'users/alice'), { termsVersion: '2099-01' }));
    // A normal profile save (merge, without the fields) keeps them.
    await assertSucceeds(setDoc(doc(db, 'users/alice'), { ...base, bio: 'Neu' }, { merge: true }));
  });

  it('nobody else can set it on someone elses doc', async () => {
    const db = env.authenticatedContext('bob').firestore();
    await assertFails(updateDoc(doc(db, 'users/alice'), terms()));
    await assertFails(setDoc(doc(db, 'users/dave'), { ...base, ...terms() }));
  });
});

// Remembered answers of the create-event wizard on the own user doc (Trello 6afd8505).
describe('users/{uid}.eventFormDefaults / savedVenues', () => {
  const venue = (n: number) => ({ place: `Weg ${n}`, city: 'Dornbirn', cityPicked: true });

  it('the owner can write both on update', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'users/alice'), {
        eventFormDefaults: { organizerName: 'Alice', city: 'Dornbirn' },
        savedVenues: [venue(1)],
      })
    );
  });

  it('the owner can write both when the doc is created', async () => {
    const db = env.authenticatedContext('carol').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users/carol'), {
        ...base,
        eventFormDefaults: { organizerName: 'Carol' },
        savedVenues: [venue(1)],
      })
    );
  });

  it('rejects a wrong type or more than ten venues', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(updateDoc(doc(db, 'users/alice'), { eventFormDefaults: 'x' }));
    await assertFails(updateDoc(doc(db, 'users/alice'), { savedVenues: 'x' }));
    await assertFails(
      updateDoc(doc(db, 'users/alice'), {
        savedVenues: Array.from({ length: 11 }, (_, i) => venue(i)),
      })
    );
    await assertSucceeds(
      updateDoc(doc(db, 'users/alice'), {
        savedVenues: Array.from({ length: 10 }, (_, i) => venue(i)),
      })
    );
  });

  it('rejects an oversized defaults map', async () => {
    const db = env.authenticatedContext('alice').firestore();
    const big = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`k${i}`, 'x']));
    await assertFails(updateDoc(doc(db, 'users/alice'), { eventFormDefaults: big }));
  });

  it('nobody else can write them', async () => {
    const db = env.authenticatedContext('bob').firestore();
    await assertFails(updateDoc(doc(db, 'users/alice'), { savedVenues: [venue(1)] }));
  });
});

// Push (docs/push-notifications.md): opt-in switches on the user doc and the
// device tokens in users/{uid}/pushTokens/{sha256(token)}, owner only.
describe('push switches and tokens', () => {
  const hash = 'a'.repeat(64);
  const token = {
    token: 'fcm-token',
    platform: 'android',
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  };

  it('the owner can set the push switches, only as booleans', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'users/alice'), {
        pushOnEventStatus: true,
        pushOnReviewMessage: false,
        pushStaffReview: true,
      })
    );
    await assertFails(updateDoc(doc(db, 'users/alice'), { pushOnEventStatus: 'yes' }));
    await assertSucceeds(
      setDoc(doc(env.authenticatedContext('carol').firestore(), 'users/carol'), {
        ...base,
        pushOnReviewMessage: true,
      })
    );
  });

  it('the owner can store, refresh, read and delete her device token', async () => {
    const db = env.authenticatedContext('alice').firestore();
    const ref = doc(db, `users/alice/pushTokens/${hash}`);
    await assertSucceeds(setDoc(ref, token));
    await assertSucceeds(updateDoc(ref, { lastSeenAt: serverTimestamp() }));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(deleteDoc(ref));
  });

  it('nobody else can read, write or delete someone elses tokens', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/alice/pushTokens/${hash}`), { token: 'fcm-token' });
    });
    const bob = env.authenticatedContext('bob').firestore();
    const ref = doc(bob, `users/alice/pushTokens/${hash}`);
    await assertFails(getDoc(ref));
    await assertFails(setDoc(doc(bob, `users/alice/pushTokens/${'b'.repeat(64)}`), token));
    await assertFails(deleteDoc(ref));
    await assertFails(
      getDoc(doc(env.unauthenticatedContext().firestore(), `users/alice/pushTokens/${hash}`))
    );
  });

  it('rejects other fields, a missing token and ids that are not a hash', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, `users/alice/pushTokens/${hash}`), { ...token, email: 'x' }));
    await assertFails(setDoc(doc(db, `users/alice/pushTokens/${hash}`), { platform: 'ios' }));
    await assertFails(setDoc(doc(db, 'users/alice/pushTokens/short'), token));
  });

  it('the rate-limit markers are server-only', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(getDoc(doc(db, 'push_throttle/ev1_alice')));
    await assertFails(setDoc(doc(db, 'push_throttle/ev1_alice'), { at: serverTimestamp() }));
  });
});
