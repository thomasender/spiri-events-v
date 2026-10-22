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
    projectId: 'demo-rules-chat',
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
    if (mode === null) await deleteDoc(doc(db, 'app_settings/chat'));
    else await setDoc(doc(db, 'app_settings/chat'), { mode });
  });
}

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admin_users/adminDoc'), { role: 'Admin' });
    await setDoc(doc(db, 'chat_rooms/lagerfeuer/messages/m1'), {
      text: 'Hallo',
      authorUid: 'alice',
      authorName: 'Alice',
      createdAt: Timestamp.now(),
    });
  });
  await setMode('all');
});

const anon = () => env.unauthenticatedContext();
const verified = (uid = 'alice') => env.authenticatedContext(uid, { email_verified: true });
const unverified = (uid = 'alice') => env.authenticatedContext(uid, { email_verified: false });
const adminVariants = {
  'admin (token claim)': () =>
    env.authenticatedContext('adminTok', { role: 'Admin', email_verified: true }),
  'admin (admin_users doc)': () => env.authenticatedContext('adminDoc', { email_verified: true }),
};

function messageData(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    text: 'Hallo zusammen 🌿',
    authorUid: uid,
    authorName: 'Alice',
    authorPhotoURL: null,
    createdAt: serverTimestamp(),
    ...overrides,
  };
}

// What the client does: message + cooldown marker in one batch.
async function send(
  db: Firestore,
  uid: string,
  overrides: Record<string, unknown> = {},
  { marker = true }: { marker?: boolean } = {}
) {
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'chat_rooms/lagerfeuer/messages')), messageData(uid, overrides));
  if (marker) {
    batch.set(doc(db, `chat_rooms/lagerfeuer/members/${uid}`), {
      lastMessageAt: serverTimestamp(),
    });
  }
  return batch.commit();
}

describe('chat messages: reading', () => {
  it('needs login and a verified e-mail', async () => {
    const ref = (db: Firestore) => collection(db, 'chat_rooms/lagerfeuer/messages');
    await assertFails(getDocs(ref(anon().firestore())));
    await assertFails(getDocs(ref(unverified().firestore())));
    await assertSucceeds(getDocs(ref(verified().firestore())));
  });

  it('only the room "lagerfeuer" exists', async () => {
    await assertFails(getDocs(collection(verified().firestore(), 'chat_rooms/other/messages')));
  });

  describe('feature flag', () => {
    it('is closed for everyone when off or missing', async () => {
      for (const mode of ['off', null]) {
        await setMode(mode);
        await assertFails(
          getDocs(collection(verified().firestore(), 'chat_rooms/lagerfeuer/messages'))
        );
        await assertFails(
          getDocs(
            collection(
              adminVariants['admin (token claim)']().firestore(),
              'chat_rooms/lagerfeuer/messages'
            )
          )
        );
      }
    });

    it('lets only admins in when the mode is "admins"', async () => {
      await setMode('admins');
      const path = 'chat_rooms/lagerfeuer/messages';
      await assertFails(getDocs(collection(verified().firestore(), path)));
      await assertSucceeds(
        getDocs(collection(adminVariants['admin (token claim)']().firestore(), path))
      );
      await assertSucceeds(
        getDocs(collection(adminVariants['admin (admin_users doc)']().firestore(), path))
      );
    });

    it('blocks sending while off', async () => {
      await setMode('off');
      await assertFails(send(verified().firestore(), 'alice'));
    });
  });
});

describe('chat messages: sending', () => {
  it('accepts a valid message with its cooldown marker', async () => {
    await assertSucceeds(send(verified().firestore(), 'alice'));
  });

  it('accepts a photo from Firebase Storage and rejects foreign hosts', async () => {
    const db = verified().firestore();
    await assertSucceeds(
      send(db, 'alice', {
        authorPhotoURL: 'https://firebasestorage.googleapis.com/v0/b/x/o/users%2Fa.jpg?alt=media',
      })
    );
    await env.clearFirestore();
    await setMode('all');
    await assertFails(
      send(verified().firestore(), 'alice', {
        authorPhotoURL: 'https://firebasestorage.googleapis.com.evil.example/x.png',
      })
    );
    await assertFails(
      send(verified().firestore(), 'alice', { authorPhotoURL: 'data:image/svg+xml;utf8,<svg/>' })
    );
    await assertSucceeds(
      send(verified('bob').firestore(), 'bob', {
        authorPhotoURL: 'https://lh5.googleusercontent.com/a/abc=s96-c',
      })
    );
    await assertFails(
      send(verified().firestore(), 'alice', { authorPhotoURL: 'https://evil.example/track.png' })
    );
  });

  it('rejects anonymous, unverified and banned users', async () => {
    await assertFails(send(anon().firestore(), 'alice'));
    await assertFails(send(unverified().firestore(), 'alice'));

    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'chat_bans/alice'), {
        until: Timestamp.fromMillis(Date.now() + 3_600_000),
        reason: 'x',
        bannedBy: 'adminDoc',
      })
    );
    await assertFails(send(verified('alice').firestore(), 'alice'));
  });

  it('lets a user whose ban has expired write again', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'chat_bans/alice'), {
        until: Timestamp.fromMillis(Date.now() - 1000),
        reason: 'x',
        bannedBy: 'adminDoc',
      })
    );
    await assertSucceeds(send(verified('alice').firestore(), 'alice'));
  });

  it("rejects a message written in someone else's name", async () => {
    await assertFails(send(verified('alice').firestore(), 'alice', { authorUid: 'bob' }));
  });

  it('rejects empty, oversized, non-string text and unknown or missing fields', async () => {
    const db = verified().firestore();
    await assertFails(send(db, 'alice', { text: '' }));
    await assertFails(send(db, 'alice', { text: 'a'.repeat(2001) }));
    await assertFails(send(db, 'alice', { text: 42 }));
    await assertFails(send(db, 'alice', { authorName: '' }));
    await assertFails(send(db, 'alice', { role: 'Admin' }));
    await assertFails(send(db, 'alice', { createdAt: Timestamp.fromMillis(1) }));
  });

  it('rejects a message without the cooldown marker', async () => {
    await assertFails(send(verified().firestore(), 'alice', {}, { marker: false }));
  });

  it('rate-limits: a second message within the cooldown is rejected', async () => {
    const db = verified().firestore();
    await assertSucceeds(send(db, 'alice'));
    await assertFails(send(db, 'alice'));
  });

  it('allows the next message after the cooldown', async () => {
    const db = verified().firestore();
    await assertSucceeds(send(db, 'alice'));
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'chat_rooms/lagerfeuer/members/alice'), {
        lastMessageAt: Timestamp.fromMillis(Date.now() - 10_000),
      })
    );
    await assertSucceeds(send(db, 'alice'));
  });

  it('does not let one user touch the cooldown marker of another', async () => {
    await assertFails(
      setDoc(doc(verified('bob').firestore(), 'chat_rooms/lagerfeuer/members/alice'), {
        lastMessageAt: serverTimestamp(),
      })
    );
  });

  it('cannot edit messages', async () => {
    await assertFails(
      updateDoc(doc(verified('alice').firestore(), 'chat_rooms/lagerfeuer/messages/m1'), {
        text: 'edited',
      })
    );
    await assertFails(
      updateDoc(
        doc(
          adminVariants['admin (token claim)']().firestore(),
          'chat_rooms/lagerfeuer/messages/m1'
        ),
        { text: 'edited' }
      )
    );
  });
});

describe('chat messages: deleting', () => {
  it('the author deletes their own message, others cannot', async () => {
    await assertFails(
      deleteDoc(doc(verified('bob').firestore(), 'chat_rooms/lagerfeuer/messages/m1'))
    );
    await assertFails(deleteDoc(doc(anon().firestore(), 'chat_rooms/lagerfeuer/messages/m1')));
    await assertSucceeds(
      deleteDoc(doc(verified('alice').firestore(), 'chat_rooms/lagerfeuer/messages/m1'))
    );
  });

  describe.each(Object.entries(adminVariants))('%s', (_n, make) => {
    it('deletes any message', async () => {
      await assertSucceeds(deleteDoc(doc(make().firestore(), 'chat_rooms/lagerfeuer/messages/m1')));
    });
  });
});

describe('chat messages: reactions', () => {
  const path = 'chat_rooms/lagerfeuer/messages/m1';
  const react = (db: Firestore, uid: string, emoji: string | null) =>
    updateDoc(doc(db, path), new FieldPath('reactions', uid), emoji ?? deleteField());

  it('a member sets, replaces and removes their own reaction', async () => {
    const db = verified('bob').firestore();
    await assertSucceeds(react(db, 'bob', '❤️'));
    await assertSucceeds(react(db, 'bob', '😂'));
    const snap = await getDoc(doc(db, path));
    expect(snap.data()?.reactions).toEqual({ bob: '😂' });
    await assertSucceeds(react(db, 'bob', null));
    // The author may react to their own message too.
    await assertSucceeds(react(verified('alice').firestore(), 'alice', '👍'));
  });

  it('only the five emoji, only your own entry, nothing else on the message', async () => {
    const db = verified('bob').firestore();
    await assertFails(react(db, 'bob', '💩'));
    await assertFails(react(db, 'bob', '❤'));
    await assertFails(react(db, 'alice', '❤️'));
    await assertFails(updateDoc(doc(db, path), { reactions: { bob: '❤️', carol: '❤️' } }));
    await assertFails(updateDoc(doc(db, path), { reactions: ['❤️'] }));
    await assertFails(updateDoc(doc(db, path), { 'reactions.bob': '❤️', text: 'x' }));
    await assertFails(updateDoc(doc(db, path), { text: 'geändert' }));
  });

  it('cannot remove someone else’s reaction', async () => {
    await assertSucceeds(react(verified('carol').firestore(), 'carol', '🙏'));
    await assertFails(react(verified('bob').firestore(), 'carol', null));
    await assertFails(react(adminVariants['admin (token claim)']().firestore(), 'carol', null));
  });

  it('needs the same access as sending: login, verified e-mail, open flag, no mute', async () => {
    await assertFails(react(anon().firestore(), 'bob', '❤️'));
    await assertFails(react(unverified('bob').firestore(), 'bob', '❤️'));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'chat_bans/bob'), {
        until: Timestamp.fromMillis(Date.now() + 3_600_000),
        reason: 'Spam',
        bannedBy: 'adminTok',
      });
    });
    await assertFails(react(verified('bob').firestore(), 'bob', '❤️'));
    await assertSucceeds(react(verified('carol').firestore(), 'carol', '❤️'));
    await setMode('off');
    await assertFails(react(verified('carol').firestore(), 'carol', '👍'));
    // Taking a reaction back stays possible (account deletion does that).
    await assertSucceeds(react(verified('carol').firestore(), 'carol', null));
  });

  it('account deletion finds own reactions with a query', async () => {
    const db = verified('bob').firestore();
    await assertSucceeds(react(db, 'bob', '😮'));
    const snap = await getDocs(
      query(
        collection(db, 'chat_rooms/lagerfeuer/messages'),
        where(new FieldPath('reactions', 'bob'), 'in', ['👍', '❤️', '😂', '😮', '🙏'])
      )
    );
    expect(snap.docs.map((d) => d.id)).toEqual(['m1']);
  });

  it('reactions go with the message', async () => {
    await assertSucceeds(react(verified('bob').firestore(), 'bob', '❤️'));
    await assertSucceeds(deleteDoc(doc(verified('alice').firestore(), path)));
    const snap = await getDoc(doc(verified('bob').firestore(), path));
    expect(snap.exists()).toBe(false);
  });
});

describe('chat_bans', () => {
  const ban = () => ({
    until: Timestamp.fromMillis(Date.now() + 86_400_000),
    reason: 'Spam',
    bannedBy: 'adminTok',
    userName: 'Alice',
  });

  it('only admins write; the affected user and admins read', async () => {
    await assertFails(setDoc(doc(verified('bob').firestore(), 'chat_bans/alice'), ban()));
    const admin = adminVariants['admin (token claim)']().firestore();
    await assertSucceeds(setDoc(doc(admin, 'chat_bans/alice'), ban()));
    await assertSucceeds(getDoc(doc(verified('alice').firestore(), 'chat_bans/alice')));
    await assertFails(getDoc(doc(verified('bob').firestore(), 'chat_bans/alice')));
    await assertSucceeds(deleteDoc(doc(admin, 'chat_bans/alice')));
  });

  it('rejects bans that name another admin or unknown fields', async () => {
    const admin = adminVariants['admin (token claim)']().firestore();
    await assertFails(setDoc(doc(admin, 'chat_bans/alice'), { ...ban(), bannedBy: 'someoneElse' }));
    await assertFails(setDoc(doc(admin, 'chat_bans/alice'), { ...ban(), extra: 1 }));
    await assertFails(setDoc(doc(admin, 'chat_bans/alice'), { ...ban(), until: 'tomorrow' }));
  });
});

describe('chat_reports', () => {
  const report = (uid: string, overrides: Record<string, unknown> = {}) => ({
    messageId: 'm1',
    messageText: 'Hallo',
    messageAuthorUid: 'alice',
    messageAuthorName: 'Alice',
    reportedBy: uid,
    status: 'open',
    createdAt: serverTimestamp(),
    ...overrides,
  });

  it('a chat member reports once per message under a deterministic id', async () => {
    const db = verified('bob').firestore();
    await assertSucceeds(setDoc(doc(db, 'chat_reports/m1_bob'), report('bob')));
    await assertFails(setDoc(doc(db, 'chat_reports/random'), report('bob')));
    await assertFails(setDoc(doc(db, 'chat_reports/m1_carol'), report('carol')));
    await assertFails(setDoc(doc(anon().firestore(), 'chat_reports/m1_bob'), report('bob')));
  });

  it('rejects a report that is already resolved or has extra fields', async () => {
    const db = verified('bob').firestore();
    await assertFails(
      setDoc(doc(db, 'chat_reports/m1_bob'), report('bob', { status: 'resolved' }))
    );
    await assertFails(setDoc(doc(db, 'chat_reports/m1_bob'), report('bob', { extra: 1 })));
  });

  it('only admins read, resolve and delete', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'chat_reports/m1_bob'), {
        ...report('bob', { createdAt: Timestamp.now() }),
      })
    );
    await assertFails(getDoc(doc(verified('bob').firestore(), 'chat_reports/m1_bob')));
    const admin = adminVariants['admin (admin_users doc)']().firestore();
    const snap = await assertSucceeds(getDoc(doc(admin, 'chat_reports/m1_bob')));
    expect(snap.exists()).toBe(true);
    await assertSucceeds(
      updateDoc(doc(admin, 'chat_reports/m1_bob'), {
        status: 'resolved',
        resolvedAt: serverTimestamp(),
        resolvedBy: 'adminDoc',
      })
    );
    await assertFails(updateDoc(doc(admin, 'chat_reports/m1_bob'), { messageText: 'changed' }));
    await assertSucceeds(deleteDoc(doc(admin, 'chat_reports/m1_bob')));
  });
});

describe('app_settings/chat', () => {
  it('is readable by everyone, writable only by admins with a valid mode', async () => {
    await assertSucceeds(getDoc(doc(anon().firestore(), 'app_settings/chat')));
    await assertFails(updateDoc(doc(verified().firestore(), 'app_settings/chat'), { mode: 'all' }));
    const admin = adminVariants['admin (token claim)']().firestore();
    await assertSucceeds(
      updateDoc(doc(admin, 'app_settings/chat'), {
        mode: 'admins',
        updatedAt: serverTimestamp(),
        updatedBy: 'adminTok',
      })
    );
    await assertFails(updateDoc(doc(admin, 'app_settings/chat'), { mode: 'everyone' }));
    await assertFails(updateDoc(doc(admin, 'app_settings/chat'), { mode: 'all', extra: 1 }));
  });
});

describe('chat presence', () => {
  const beat = (uid: string, overrides: Record<string, unknown> = {}) => ({
    displayName: 'Alice',
    photoURL: null,
    lastSeen: serverTimestamp(),
    ...overrides,
  });
  const path = (uid: string) => `chat_rooms/lagerfeuer/presence/${uid}`;

  it('a chat member writes and deletes only their own heartbeat', async () => {
    const db = verified('alice').firestore();
    await assertSucceeds(setDoc(doc(db, path('alice')), beat('alice')));
    await assertFails(setDoc(doc(verified('bob').firestore(), path('alice')), beat('alice')));
    await assertFails(deleteDoc(doc(verified('bob').firestore(), path('alice'))));
    await assertSucceeds(deleteDoc(doc(db, path('alice'))));
  });

  it('is readable by chat members only, and only while the chat is open', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), path('alice')), {
        displayName: 'Alice',
        lastSeen: Timestamp.now(),
      })
    );
    await assertSucceeds(
      getDocs(collection(verified('bob').firestore(), 'chat_rooms/lagerfeuer/presence'))
    );
    await assertFails(
      getDocs(collection(unverified('bob').firestore(), 'chat_rooms/lagerfeuer/presence'))
    );
    await assertFails(getDocs(collection(anon().firestore(), 'chat_rooms/lagerfeuer/presence')));
    await setMode('off');
    await assertFails(
      getDocs(collection(verified('bob').firestore(), 'chat_rooms/lagerfeuer/presence'))
    );
  });

  it('rejects unknown fields, a fake lastSeen and a foreign photo host', async () => {
    const db = verified('alice').firestore();
    await assertFails(setDoc(doc(db, path('alice')), beat('alice', { role: 'Admin' })));
    await assertFails(setDoc(doc(db, path('alice')), beat('alice', { lastSeen: Timestamp.now() })));
    await assertFails(
      setDoc(doc(db, path('alice')), beat('alice', { photoURL: 'https://evil.example/x.png' }))
    );
    await assertFails(setDoc(doc(db, path('alice')), beat('alice', { displayName: '' })));
  });

  it('limits heartbeats to one per 20 seconds', async () => {
    const db = verified('alice').firestore();
    await assertSucceeds(setDoc(doc(db, path('alice')), beat('alice')));
    await assertFails(setDoc(doc(db, path('alice')), beat('alice')));
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), path('alice')), {
        displayName: 'Alice',
        lastSeen: Timestamp.fromMillis(Date.now() - 60_000),
      })
    );
    await assertSucceeds(setDoc(doc(db, path('alice')), beat('alice')));
  });
});
