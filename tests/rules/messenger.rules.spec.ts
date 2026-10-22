import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  FieldPath,
  Timestamp,
  collection,
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
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8782').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-rules-dm',
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

async function setMode(mode: string | null) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    if (mode === null) await deleteDoc(doc(db, 'app_settings/messenger'));
    else await setDoc(doc(db, 'app_settings/messenger'), { mode });
  });
}

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'admin_users/adminDoc'), { role: 'Admin' });
  });
  await setMode('all');
});

const anon = () => env.unauthenticatedContext();
const verified = (uid: string) => env.authenticatedContext(uid, { email_verified: true });
const unverified = (uid: string) => env.authenticatedContext(uid, { email_verified: false });
const admin = () => env.authenticatedContext('adminTok', { role: 'Admin', email_verified: true });

const threadId = (a: string, b: string) => [a, b].sort().join('_');

async function seedThread(a = 'alice', b = 'bob', lastMs = Date.now() - 60_000) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `dm_threads/${threadId(a, b)}`), {
      participants: [a, b].sort(),
      lastMessageText: 'Hi',
      lastMessageAt: Timestamp.fromMillis(lastMs),
      lastMessageBy: a,
      readAt: {},
      createdAt: Timestamp.fromMillis(lastMs),
    });
    await setDoc(doc(db, `dm_threads/${threadId(a, b)}/messages/m1`), {
      text: 'Hi',
      authorUid: a,
      createdAt: Timestamp.fromMillis(lastMs),
    });
  });
}

// What the client does for the first message of a conversation.
function startThread(db: Firestore, me: string, other: string, text = 'Hallo 🌿') {
  const id = threadId(me, other);
  const batch = writeBatch(db);
  batch.set(doc(db, `dm_threads/${id}`), {
    participants: [me, other].sort(),
    lastMessageText: text,
    lastMessageAt: serverTimestamp(),
    lastMessageBy: me,
    readAt: { [me]: serverTimestamp() },
    createdAt: serverTimestamp(),
  });
  batch.set(doc(collection(db, `dm_threads/${id}/messages`)), {
    text,
    authorUid: me,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, `dm_starters/${me}`), {
    lastThreadAt: serverTimestamp(),
    day: Math.floor(Date.now() / 86_400_000),
    count: 1,
  });
  return batch.commit();
}

// ... and for every later message.
function reply(db: Firestore, me: string, other: string, text = 'Antwort', extra = {}) {
  const id = threadId(me, other);
  const batch = writeBatch(db);
  batch.update(doc(db, `dm_threads/${id}`), {
    lastMessageText: text,
    lastMessageAt: serverTimestamp(),
    lastMessageBy: me,
  });
  batch.set(doc(collection(db, `dm_threads/${id}/messages`)), {
    text,
    authorUid: me,
    createdAt: serverTimestamp(),
    ...extra,
  });
  return batch.commit();
}

describe('feature flag and access', () => {
  it('needs login, a verified e-mail and an open flag', async () => {
    await assertSucceeds(startThread(verified('alice').firestore(), 'alice', 'bob'));
    await env.clearFirestore();
    await assertFails(startThread(anon().firestore(), 'alice', 'bob'));
    await assertFails(startThread(unverified('alice').firestore(), 'alice', 'bob'));
    await setMode('off');
    await assertFails(startThread(verified('alice').firestore(), 'alice', 'bob'));
    await setMode(null);
    await assertFails(startThread(verified('alice').firestore(), 'alice', 'bob'));
  });

  it('mode "admins" lets only admins in', async () => {
    await setMode('admins');
    await assertFails(startThread(verified('alice').firestore(), 'alice', 'bob'));
    await assertSucceeds(startThread(admin().firestore(), 'adminTok', 'bob'));
  });

  it('the flag is readable by everyone and writable by admins only', async () => {
    await assertSucceeds(getDoc(doc(anon().firestore(), 'app_settings/messenger')));
    await assertFails(
      updateDoc(doc(verified('alice').firestore(), 'app_settings/messenger'), { mode: 'all' })
    );
    await assertSucceeds(
      updateDoc(doc(admin().firestore(), 'app_settings/messenger'), {
        mode: 'admins',
        updatedAt: serverTimestamp(),
        updatedBy: 'adminTok',
      })
    );
    await assertFails(updateDoc(doc(admin().firestore(), 'app_settings/messenger'), { mode: 'x' }));
  });
});

describe('privacy: only the two participants, never admins', () => {
  beforeEach(async () => {
    await seedThread('alice', 'bob');
  });

  it('participants read the thread and its messages', async () => {
    for (const uid of ['alice', 'bob']) {
      const db = verified(uid).firestore();
      await assertSucceeds(getDoc(doc(db, 'dm_threads/alice_bob')));
      await assertSucceeds(getDocs(collection(db, 'dm_threads/alice_bob/messages')));
    }
  });

  it('others and admins cannot read, even by guessing the id', async () => {
    for (const ctx of [verified('carol'), admin(), anon()]) {
      const db = ctx.firestore();
      await assertFails(getDoc(doc(db, 'dm_threads/alice_bob')));
      await assertFails(getDocs(collection(db, 'dm_threads/alice_bob/messages')));
    }
  });

  it('lists only the own threads', async () => {
    const mine = query(
      collection(verified('alice').firestore(), 'dm_threads'),
      where('participants', 'array-contains', 'alice')
    );
    await assertSucceeds(getDocs(mine));
    const theirs = query(
      collection(verified('carol').firestore(), 'dm_threads'),
      where('participants', 'array-contains', 'alice')
    );
    await assertFails(getDocs(theirs));
    await assertFails(getDocs(collection(verified('alice').firestore(), 'dm_threads')));
  });

  it('a missing thread can be looked up by a participant (empty conversation)', async () => {
    await assertSucceeds(getDoc(doc(verified('alice').firestore(), 'dm_threads/alice_zoe')));
    await assertFails(getDoc(doc(verified('carol').firestore(), 'dm_threads/alice_zoe')));
  });
});

describe('starting a conversation', () => {
  it('creates thread, first message and starter marker in one batch', async () => {
    await assertSucceeds(startThread(verified('bob').firestore(), 'bob', 'alice'));
  });

  it('rejects a thread whose id does not match the participants', async () => {
    const db = verified('alice').firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'dm_threads/alice_zoe'), {
      participants: ['alice', 'bob'],
      lastMessageText: 'x',
      lastMessageAt: serverTimestamp(),
      lastMessageBy: 'alice',
      readAt: {},
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'dm_starters/alice'), {
      lastThreadAt: serverTimestamp(),
      day: Math.floor(Date.now() / 86_400_000),
      count: 1,
    });
    await assertFails(batch.commit());
  });

  it('rejects creating a thread between two other people', async () => {
    const db = verified('carol').firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'dm_threads/alice_bob'), {
      participants: ['alice', 'bob'],
      lastMessageText: 'x',
      lastMessageAt: serverTimestamp(),
      lastMessageBy: 'carol',
      readAt: {},
      createdAt: serverTimestamp(),
    });
    await assertFails(batch.commit());
  });

  it('limits new conversations: 20 s apart and 30 per day', async () => {
    const db = verified('alice').firestore();
    await assertSucceeds(startThread(db, 'alice', 'bob'));
    await assertFails(startThread(db, 'alice', 'carol'));

    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'dm_starters/alice'), {
        lastThreadAt: Timestamp.fromMillis(Date.now() - 60_000),
        day: Math.floor(Date.now() / 86_400_000),
        count: 30,
      })
    );
    await assertFails(startThread(db, 'alice', 'dave'));

    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'dm_starters/alice'), {
        lastThreadAt: Timestamp.fromMillis(Date.now() - 60_000),
        day: Math.floor(Date.now() / 86_400_000) - 1,
        count: 30,
      })
    );
    await assertSucceeds(startThread(db, 'alice', 'erin'));
  });
});

describe('sending messages', () => {
  beforeEach(async () => {
    await seedThread('alice', 'bob');
  });

  it('a participant replies', async () => {
    await assertSucceeds(reply(verified('bob').firestore(), 'bob', 'alice'));
  });

  it('rejects strangers, banned users and unverified users', async () => {
    await assertFails(reply(verified('carol').firestore(), 'carol', 'alice'));
    await assertFails(reply(unverified('bob').firestore(), 'bob', 'alice'));
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'chat_bans/bob'), {
        until: Timestamp.fromMillis(Date.now() + 3_600_000),
        reason: 'x',
        bannedBy: 'adminDoc',
      })
    );
    await assertFails(reply(verified('bob').firestore(), 'bob', 'alice'));
  });

  it("rejects a message in someone else's name or without the matching thread update", async () => {
    const db = verified('bob').firestore();
    await assertFails(reply(db, 'bob', 'alice', 'x', { authorUid: 'alice' }));
    await assertFails(reply(db, 'bob', 'alice', '', {}));
    await assertFails(reply(db, 'bob', 'alice', 'x', { extra: 1 }));
    const lone = writeBatch(db);
    lone.set(doc(collection(db, 'dm_threads/alice_bob/messages')), {
      text: 'x',
      authorUid: 'bob',
      createdAt: serverTimestamp(),
    });
    await assertFails(lone.commit());
  });

  it('lets the other person answer right away, but not the same sender twice in 2 s', async () => {
    // seeded: alice wrote last, a minute ago; make it "just now"
    await env.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), 'dm_threads/alice_bob'), {
        lastMessageAt: Timestamp.now(),
        lastMessageBy: 'alice',
      })
    );
    await assertSucceeds(reply(verified('bob').firestore(), 'bob', 'alice'));
  });

  it('has a 2 s cooldown per sender', async () => {
    const db = verified('bob').firestore();
    await assertSucceeds(reply(db, 'bob', 'alice'));
    await assertFails(reply(db, 'bob', 'alice'));
  });

  it('respects blocks and "no private messages"', async () => {
    // Contexts are created after each seeding step; a context made before
    // withSecurityRulesDisabled() fails with "Firestore has already been started".
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'dm_blocks/alice_bob'), {
        blocker: 'alice',
        blocked: 'bob',
        createdAt: Timestamp.now(),
      })
    );
    await assertFails(reply(verified('bob').firestore(), 'bob', 'alice'));
    // The blocker may still write to the blocked person.
    await assertSucceeds(reply(verified('alice').firestore(), 'alice', 'bob'));

    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await deleteDoc(doc(db, 'dm_blocks/alice_bob'));
      await setDoc(doc(db, 'dm_settings/alice'), { allowDirectMessages: false });
    });
    await assertFails(reply(verified('bob').firestore(), 'bob', 'alice'));
    await assertFails(startThread(verified('carol').firestore(), 'carol', 'alice'));
  });

  it("own messages can be deleted, others' cannot, admins cannot", async () => {
    const path = 'dm_threads/alice_bob/messages/m1';
    await assertFails(deleteDoc(doc(verified('bob').firestore(), path)));
    await assertFails(deleteDoc(doc(admin().firestore(), path)));
    await assertSucceeds(deleteDoc(doc(verified('alice').firestore(), path)));
  });
});

describe('reading marks', () => {
  beforeEach(async () => {
    await seedThread('alice', 'bob');
  });

  it('a participant marks only their own entry as read', async () => {
    const db = verified('bob').firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'dm_threads/alice_bob'), { 'readAt.bob': serverTimestamp() })
    );
    await assertFails(
      updateDoc(doc(db, 'dm_threads/alice_bob'), { 'readAt.alice': serverTimestamp() })
    );
    await assertFails(
      updateDoc(doc(db, 'dm_threads/alice_bob'), { 'readAt.bob': Timestamp.now() })
    );
    await assertFails(
      updateDoc(doc(verified('carol').firestore(), 'dm_threads/alice_bob'), {
        'readAt.carol': serverTimestamp(),
      })
    );
  });

  it('cannot rewrite participants or the summary while marking read', async () => {
    const db = verified('bob').firestore();
    await assertFails(
      updateDoc(doc(db, 'dm_threads/alice_bob'), {
        'readAt.bob': serverTimestamp(),
        participants: ['bob', 'carol'],
      })
    );
    await assertFails(updateDoc(doc(db, 'dm_threads/alice_bob'), { lastMessageText: 'fake' }));
  });
});

describe('reactions on private messages', () => {
  const path = 'dm_threads/alice_bob/messages/m1';
  const react = (db: Firestore, uid: string, emoji: string | null) =>
    updateDoc(doc(db, path), new FieldPath('reactions', uid), emoji ?? deleteField());

  beforeEach(async () => {
    await seedThread('alice', 'bob');
  });

  it('both participants react, replace and remove their own', async () => {
    await assertSucceeds(react(verified('bob').firestore(), 'bob', '❤️'));
    await assertSucceeds(react(verified('bob').firestore(), 'bob', '🙏'));
    await assertSucceeds(react(verified('alice').firestore(), 'alice', '👍'));
    const snap = await getDoc(doc(verified('alice').firestore(), path));
    expect(snap.data()?.reactions).toEqual({ bob: '🙏', alice: '👍' });
    await assertSucceeds(react(verified('bob').firestore(), 'bob', null));
  });

  it('outsiders and admins can neither react nor read reactions', async () => {
    await assertSucceeds(react(verified('bob').firestore(), 'bob', '❤️'));
    for (const [ctx, uid] of [
      [verified('carol'), 'carol'],
      [admin(), 'adminTok'],
    ] as const) {
      const db = ctx.firestore();
      await assertFails(react(db, uid, '❤️'));
      await assertFails(getDoc(doc(db, path)));
    }
    await assertFails(react(anon().firestore(), 'bob', '❤️'));
  });

  it('only own entry, only the five emoji, text stays untouched', async () => {
    const db = verified('bob').firestore();
    await assertFails(react(db, 'alice', '❤️'));
    await assertFails(react(db, 'bob', '🔥'));
    await assertFails(updateDoc(doc(db, path), { 'reactions.bob': '❤️', text: 'anders' }));
    await assertFails(updateDoc(doc(db, path), { text: 'anders' }));
    await assertSucceeds(react(verified('alice').firestore(), 'alice', '😂'));
    await assertFails(react(db, 'alice', null));
  });

  it('not when blocked, when the other takes no messages, when muted or the flag is off', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'dm_blocks/alice_bob'), {
        blocker: 'alice',
        blocked: 'bob',
        createdAt: Timestamp.now(),
      });
    });
    await assertFails(react(verified('bob').firestore(), 'bob', '❤️'));
    // The blocker's own side is not affected by that block.
    await assertSucceeds(react(verified('alice').firestore(), 'alice', '❤️'));
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await deleteDoc(doc(db, 'dm_blocks/alice_bob'));
      await setDoc(doc(db, 'dm_settings/alice'), { allowDirectMessages: false });
    });
    await assertFails(react(verified('bob').firestore(), 'bob', '❤️'));
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await deleteDoc(doc(db, 'dm_settings/alice'));
      await setDoc(doc(db, 'chat_bans/bob'), {
        until: Timestamp.fromMillis(Date.now() + 3_600_000),
        reason: 'Spam',
        bannedBy: 'adminTok',
      });
    });
    await assertFails(react(verified('bob').firestore(), 'bob', '❤️'));
    await setMode('off');
    await assertFails(react(verified('alice').firestore(), 'alice', '👍'));
    // Taking your own back is always possible.
    await assertSucceeds(react(verified('alice').firestore(), 'alice', null));
  });

  it('reactions disappear with the message', async () => {
    await assertSucceeds(react(verified('bob').firestore(), 'bob', '❤️'));
    await assertSucceeds(deleteDoc(doc(verified('alice').firestore(), path)));
    const snap = await getDoc(doc(verified('bob').firestore(), path));
    expect(snap.exists()).toBe(false);
  });
});

describe('blocks, settings, reports', () => {
  it('only the blocker creates, reads and removes a block', async () => {
    const db = verified('alice').firestore();
    const block = () =>
      setDoc(doc(db, 'dm_blocks/alice_bob'), {
        blocker: 'alice',
        blocked: 'bob',
        createdAt: serverTimestamp(),
      });
    await assertSucceeds(block());
    await assertFails(getDoc(doc(verified('bob').firestore(), 'dm_blocks/alice_bob')));
    await assertFails(getDoc(doc(admin().firestore(), 'dm_blocks/alice_bob')));
    await assertSucceeds(getDoc(doc(db, 'dm_blocks/alice_bob')));
    await assertFails(
      setDoc(doc(verified('bob').firestore(), 'dm_blocks/alice_carol'), {
        blocker: 'alice',
        blocked: 'carol',
        createdAt: serverTimestamp(),
      })
    );
    await assertFails(deleteDoc(doc(verified('bob').firestore(), 'dm_blocks/alice_bob')));
    await assertSucceeds(deleteDoc(doc(db, 'dm_blocks/alice_bob')));
  });

  it('settings: readable by members, writable by the owner only', async () => {
    await assertSucceeds(
      setDoc(doc(verified('alice').firestore(), 'dm_settings/alice'), {
        allowDirectMessages: false,
        updatedAt: serverTimestamp(),
      })
    );
    await assertSucceeds(getDoc(doc(verified('bob').firestore(), 'dm_settings/alice')));
    await assertFails(
      setDoc(doc(verified('bob').firestore(), 'dm_settings/alice'), { allowDirectMessages: true })
    );
    await assertFails(getDoc(doc(anon().firestore(), 'dm_settings/alice')));
  });

  const report = (me: string, overrides: Record<string, unknown> = {}) => ({
    threadId: 'alice_bob',
    reportedBy: me,
    reportedUid: me === 'alice' ? 'bob' : 'alice',
    reportedName: 'Bob',
    excerpt: 'Bob: Hallo',
    status: 'open',
    createdAt: serverTimestamp(),
    ...overrides,
  });

  it('a participant reports once; admins read and resolve', async () => {
    const db = verified('alice').firestore();
    await assertSucceeds(setDoc(doc(db, 'dm_reports/alice_bob_alice'), report('alice')));
    await assertFails(setDoc(doc(db, 'dm_reports/alice_bob_alice'), report('alice')));
    await assertFails(
      setDoc(doc(verified('carol').firestore(), 'dm_reports/alice_bob_carol'), report('carol'))
    );
    await assertFails(setDoc(doc(db, 'dm_reports/x'), report('alice')));
    await assertFails(getDoc(doc(db, 'dm_reports/alice_bob_alice')));
    const a = admin().firestore();
    await assertSucceeds(getDoc(doc(a, 'dm_reports/alice_bob_alice')));
    await assertSucceeds(
      updateDoc(doc(a, 'dm_reports/alice_bob_alice'), {
        status: 'resolved',
        resolvedAt: serverTimestamp(),
        resolvedBy: 'adminTok',
      })
    );
    await assertFails(updateDoc(doc(a, 'dm_reports/alice_bob_alice'), { excerpt: 'changed' }));
  });

  it('rejects reporting yourself or oversized excerpts', async () => {
    const db = verified('alice').firestore();
    await assertFails(
      setDoc(doc(db, 'dm_reports/alice_bob_alice'), report('alice', { reportedUid: 'alice' }))
    );
    await assertFails(
      setDoc(doc(db, 'dm_reports/alice_bob_alice'), report('alice', { excerpt: 'x'.repeat(3001) }))
    );
  });
});

describe('app_settings/onboarding', () => {
  it('is readable by everyone, writable only by admins with a valid mode', async () => {
    await assertSucceeds(getDoc(doc(anon().firestore(), 'app_settings/onboarding')));
    await assertFails(
      setDoc(doc(verified('alice').firestore(), 'app_settings/onboarding'), { mode: 'all' })
    );
    const db = admin().firestore();
    await assertSucceeds(
      setDoc(doc(db, 'app_settings/onboarding'), {
        mode: 'admins',
        updatedAt: serverTimestamp(),
        updatedBy: 'adminTok',
      })
    );
    await assertFails(setDoc(doc(db, 'app_settings/onboarding'), { mode: 'everyone' }));
    await assertFails(updateDoc(doc(db, 'app_settings/onboarding'), { mode: 'all', extra: 1 }));
  });
});
