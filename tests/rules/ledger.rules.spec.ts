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
});
