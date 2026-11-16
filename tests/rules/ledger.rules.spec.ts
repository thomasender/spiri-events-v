import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8782').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-rules-ledger',
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

const entry = {
  type: 'expense',
  date: '2026-10-29',
  amount: 12.5,
  description: 'Raummiete',
  category: null,
  note: null,
  source: 'manual',
  createdBy: 'adminDoc',
};

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admin_users/adminDoc'), { role: 'Admin' });
    await setDoc(doc(db, 'admin_users/mod'), { role: 'RegionModerator', regionIds: ['tirol'] });
    await setDoc(doc(db, 'ledger/l1'), entry);
    await setDoc(doc(db, 'ledger/mollie_tr_1'), {
      type: 'income',
      date: '2026-10-28',
      amount: 25,
      description: 'Spende via Mollie (einmalig)',
      source: 'mollie',
      molliePaymentId: 'tr_1',
    });
  });
});

describe('ledger', () => {
  it('lets Super-Admins read', async () => {
    const db = env.authenticatedContext('adminDoc').firestore();
    await assertSucceeds(getDoc(doc(db, 'ledger/l1')));
  });

  it.each([
    ['a region moderator', 'mod'],
    ['a logged-in member', 'someone'],
  ])('hides the books from %s', async (_label, uid) => {
    const db = env.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(db, 'ledger/l1')));
    await assertFails(setDoc(doc(db, 'ledger/x'), entry));
  });

  it('hides the books from anonymous visitors', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'ledger/l1')));
  });

  it('lets Super-Admins create a valid manual entry', async () => {
    const db = env.authenticatedContext('adminDoc').firestore();
    await assertSucceeds(setDoc(doc(db, 'ledger/new'), entry));
  });

  it('stores the creator name on create but never lets it change', async () => {
    const db = env.authenticatedContext('adminDoc').firestore();
    await assertSucceeds(setDoc(doc(db, 'ledger/named'), { ...entry, createdByName: 'Anna' }));
    await assertFails(updateDoc(doc(db, 'ledger/named'), { createdByName: 'Bob' }));
    await assertFails(updateDoc(doc(db, 'ledger/named'), { createdBy: 'other' }));
  });

  it.each([
    ['a negative amount', { amount: -1 }],
    ['a zero amount', { amount: 0 }],
    ['an unknown type', { type: 'gift' }],
    ['a malformed date', { date: '29.10.2026' }],
    ['an empty description', { description: '' }],
    ['a forged mollie source', { source: 'mollie' }],
    ['an unknown field', { extra: 1 }],
  ])('rejects %s on create', async (_label, patch) => {
    const db = env.authenticatedContext('adminDoc').firestore();
    await assertFails(setDoc(doc(db, 'ledger/bad'), { ...entry, ...patch }));
  });

  it('lets Super-Admins edit and delete manual and Mollie entries', async () => {
    const db = env.authenticatedContext('adminDoc').firestore();
    await assertSucceeds(updateDoc(doc(db, 'ledger/l1'), { amount: 13 }));
    await assertSucceeds(updateDoc(doc(db, 'ledger/mollie_tr_1'), { amount: 20 }));
    await assertSucceeds(deleteDoc(doc(db, 'ledger/mollie_tr_1')));
  });

  it('keeps source and payment id fixed on update', async () => {
    const db = env.authenticatedContext('adminDoc').firestore();
    await assertFails(updateDoc(doc(db, 'ledger/l1'), { source: 'mollie' }));
    await assertFails(updateDoc(doc(db, 'ledger/mollie_tr_1'), { molliePaymentId: 'tr_2' }));
    await assertFails(updateDoc(doc(db, 'ledger/l1'), { amount: -5 }));
  });

  it('accepts receipts as a list of at most ten', async () => {
    const db = env.authenticatedContext('adminDoc').firestore();
    const file = {
      path: 'ledger/new/1_a.pdf',
      name: 'a.pdf',
      size: 10,
      contentType: 'application/pdf',
    };
    await assertSucceeds(setDoc(doc(db, 'ledger/new'), { ...entry, attachments: [file] }));
    await assertSucceeds(updateDoc(doc(db, 'ledger/l1'), { attachments: [file] }));
    await assertFails(updateDoc(doc(db, 'ledger/l1'), { attachments: Array(11).fill(file) }));
    await assertFails(updateDoc(doc(db, 'ledger/l1'), { attachments: 'x' }));
  });
});

// Vereinsmitgliedschaft "Pioniere": Mollie ids, amounts and consents only for the
// member and the Super-Admins; written only by the Cloud Functions.
describe('club_memberships', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'club_memberships/member1'), {
        uid: 'member1',
        status: 'active',
        amount: 12.9,
        mollieCustomerId: 'cst_1',
      });
    });
  });

  it('lets the member and the Super-Admins read', async () => {
    await assertSucceeds(
      getDoc(doc(env.authenticatedContext('member1').firestore(), 'club_memberships/member1'))
    );
    await assertSucceeds(
      getDoc(doc(env.authenticatedContext('adminDoc').firestore(), 'club_memberships/member1'))
    );
  });

  it.each([
    ['another member', 'someone'],
    ['a region moderator', 'mod'],
  ])('hides a membership from %s', async (_label, uid) => {
    const db = env.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(db, 'club_memberships/member1')));
  });

  it('hides memberships from anonymous visitors', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'club_memberships/member1')));
  });

  it('lets nobody write from the client, not even the member or a Super-Admin', async () => {
    const own = env.authenticatedContext('member1').firestore();
    await assertFails(updateDoc(doc(own, 'club_memberships/member1'), { status: 'cancelled' }));
    await assertFails(setDoc(doc(own, 'club_memberships/x'), { status: 'active' }));
    const admin = env.authenticatedContext('adminDoc').firestore();
    await assertFails(updateDoc(doc(admin, 'club_memberships/member1'), { amount: 1 }));
    await assertFails(deleteDoc(doc(admin, 'club_memberships/member1')));
  });
});

describe('app_settings/membership', () => {
  const settings = { mode: 'admins', statutesUrl: '', statutesVersion: '' };

  it('is readable by everybody (the wizard needs mode and the Statuten link)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'app_settings/membership'), settings);
    });
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, 'app_settings/membership')));
  });

  it('lets Super-Admins switch it and set the Statuten link', async () => {
    const db = env.authenticatedContext('adminDoc').firestore();
    await assertSucceeds(setDoc(doc(db, 'app_settings/membership'), settings));
    await assertSucceeds(
      updateDoc(doc(db, 'app_settings/membership'), {
        mode: 'all',
        statutesUrl: 'https://example.org/statuten.pdf',
        statutesVersion: '2026-11',
      })
    );
  });

  it('refuses unknown modes, odd links and extra fields', async () => {
    const db = env.authenticatedContext('adminDoc').firestore();
    await assertFails(setDoc(doc(db, 'app_settings/membership'), { mode: 'everyone' }));
    await assertFails(
      setDoc(doc(db, 'app_settings/membership'), { mode: 'all', statutesUrl: 'javascript:x' })
    );
    await assertFails(setDoc(doc(db, 'app_settings/membership'), { ...settings, extra: 1 }));
  });

  it.each([
    ['a region moderator', 'mod'],
    ['a logged-in member', 'someone'],
  ])('refuses %s', async (_label, uid) => {
    const db = env.authenticatedContext(uid).firestore();
    await assertFails(setDoc(doc(db, 'app_settings/membership'), settings));
  });
});
