import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BROADCAST_COOLDOWN_MS,
  BROADCAST_MAX_RECIPIENTS,
  BROADCAST_PACKET_SIZE,
  BROADCAST_TEXT_MAX,
  broadcastDocId,
  broadcastRefusal,
  broadcastTextLength,
  broadcastWaitMessage,
  broadcastWaitMs,
  chunk,
  countReasons,
  dmSnippet,
  messageWrite,
  normalizeBroadcastText,
  threadIdFor,
  threadWrite,
  validateBroadcastRequest,
} from '../../functions/src/adminBroadcastLogic';
import {
  sendBroadcastHandler,
  type BroadcastDeps,
  type BroadcastResult,
  type ClaimOutcome,
  type RecipientState,
} from '../../functions/src/adminBroadcast';
import { normalizeChatText, chatTextLength } from '../../src/utils/chat';
import {
  DM_MAX_LENGTH,
  dmSnippet as clientSnippet,
  threadIdFor as clientThreadId,
} from '../../src/utils/messenger';
import {
  BROADCAST_MAX_RECIPIENTS as CLIENT_MAX,
  broadcastRecipients,
  broadcastSkipLines,
  BROADCAST_SKIP_LABELS,
} from '../../src/utils/members';

const REQ = 'req-12345678';

describe('validateBroadcastRequest', () => {
  const ok = { recipientUids: ['a', 'b', 'a'], text: '  Hallo\r\nihr  ', requestId: REQ };

  it('de-duplicates recipients, cleans the text like the Postfach and defaults to a real send', () => {
    expect(validateBroadcastRequest(ok)).toEqual({
      recipientUids: ['a', 'b'],
      text: 'Hallo\nihr',
      dryRun: false,
      requestId: REQ,
    });
    expect(validateBroadcastRequest({ ...ok, dryRun: true }).dryRun).toBe(true);
  });

  it.each([
    ['no recipients', { ...ok, recipientUids: [] }, 'Empfänger'],
    ['recipients not a list', { ...ok, recipientUids: 'a' }, 'Empfänger'],
    ['an invalid uid', { ...ok, recipientUids: ['a', 'x/y'] }, 'ungültig'],
    ['a non-string uid', { ...ok, recipientUids: ['a', 3] }, 'ungültig'],
    [
      'too many recipients',
      { ...ok, recipientUids: Array.from({ length: 501 }, (_, i) => `u${i}`) },
      'Höchstens 500',
    ],
    ['empty text', { ...ok, text: ' \n ' }, 'leer'],
    ['text not a string', { ...ok, text: { html: '<b>x</b>' } }, 'leer'],
    ['text too long', { ...ok, text: 'x'.repeat(1001) }, 'höchstens 1000'],
    ['missing request id', { ...ok, requestId: undefined }, 'Anfrage'],
    ['odd request id', { ...ok, requestId: 'a/b' }, 'Anfrage'],
  ])('refuses %s', (_label, data, message) => {
    expect(() => validateBroadcastRequest(data)).toThrow(message);
  });

  it('accepts exactly 500 recipients and exactly 1000 characters (emoji count once)', () => {
    const uids = Array.from({ length: 500 }, (_, i) => `u${i}`);
    expect(validateBroadcastRequest({ ...ok, recipientUids: uids }).recipientUids).toHaveLength(
      500
    );
    expect(validateBroadcastRequest({ ...ok, text: '🎉'.repeat(1000) }).text).toHaveLength(2000);
  });
});

describe('client and server agree', () => {
  it('text cleaning, length, snippet, thread id and limits', () => {
    const raw = 'Hi‮ there ​\r\n\n\n\nnext 👨‍👩‍👧';
    expect(normalizeBroadcastText(raw)).toBe(normalizeChatText(raw));
    expect(broadcastTextLength('👨‍👩‍👧 ok')).toBe(chatTextLength('👨‍👩‍👧 ok'));
    const long = 'Wort '.repeat(60);
    expect(dmSnippet(long)).toBe(clientSnippet(long));
    expect(dmSnippet('a\nb')).toBe(clientSnippet('a\nb'));
    expect(threadIdFor('zed', 'amy')).toBe(clientThreadId('zed', 'amy'));
    expect(BROADCAST_TEXT_MAX).toBe(DM_MAX_LENGTH);
    expect(BROADCAST_MAX_RECIPIENTS).toBe(CLIENT_MAX);
  });
});

describe('broadcastRefusal', () => {
  const sender = { mode: 'all', account: { disabled: false, emailVerified: true }, banned: false };

  it('lets a verified, active admin send when the Postfach is open for all', () => {
    expect(broadcastRefusal(sender)).toBeNull();
  });

  it.each([
    ['Postfach off', { mode: 'off' }, 'nicht für alle Mitglieder'],
    ['Postfach only for admins', { mode: 'admins' }, 'nicht für alle Mitglieder'],
    ['flag missing', { mode: undefined }, 'nicht für alle Mitglieder'],
    ['own account missing', { account: null }, 'Konto'],
    ['own account disabled', { account: { disabled: true, emailVerified: true } }, 'Konto'],
    ['own address unverified', { account: { disabled: false, emailVerified: false } }, 'E-Mail'],
    ['muted in the chat', { banned: true }, 'stummgeschaltet'],
  ])('refuses: %s', (_label, over, message) => {
    expect(broadcastRefusal({ ...sender, ...over })).toContain(message);
  });
});

describe('throttle, packets and counters', () => {
  it('one Sammelnachricht every 10 minutes', () => {
    const t = 1_000_000_000;
    expect(broadcastWaitMs(null, t)).toBe(0);
    expect(broadcastWaitMs(t, t + 60_000)).toBe(BROADCAST_COOLDOWN_MS - 60_000);
    expect(broadcastWaitMs(t, t + BROADCAST_COOLDOWN_MS)).toBe(0);
    expect(broadcastWaitMessage(9 * 60_000 + 1)).toContain('10 Minuten');
    expect(broadcastWaitMessage(30_000)).toContain('1 Minute.');
  });

  it('packets stay under the 500-writes limit of a batch (two writes per recipient)', () => {
    expect(BROADCAST_PACKET_SIZE * 2).toBeLessThanOrEqual(500);
    const parts = chunk(
      Array.from({ length: 450 }, (_, i) => i),
      BROADCAST_PACKET_SIZE
    );
    expect(parts.map((p) => p.length)).toEqual([200, 200, 50]);
    expect(chunk([], 3)).toEqual([]);
    expect(() => chunk([1], 0)).toThrow();
  });

  it('counts skip reasons', () => {
    expect(countReasons(['blocked', 'self', 'blocked'])).toEqual({ blocked: 2, self: 1 });
    expect(countReasons([])).toEqual({});
  });

  it('the log id ties a request to its admin', () => {
    expect(broadcastDocId('admin', REQ)).toBe(`admin_${REQ}`);
  });
});

describe('thread and message writes match the Postfach client', () => {
  const NOW = { sentinel: 'serverTimestamp' };

  it('creates a new thread with sorted participants, read by the sender', () => {
    expect(threadWrite('zed', 'amy', 'Hallo', false, NOW)).toEqual({
      kind: 'create',
      data: {
        participants: ['amy', 'zed'],
        lastMessageText: 'Hallo',
        lastMessageAt: NOW,
        lastMessageBy: 'zed',
        readAt: { zed: NOW },
        createdAt: NOW,
      },
    });
  });

  it('only updates the summary of an existing thread, so it shows as unread for the member', () => {
    const w = threadWrite('zed', 'amy', 'x'.repeat(300), true, NOW);
    expect(w.kind).toBe('update');
    expect(Object.keys(w.data).sort()).toEqual([
      'lastMessageAt',
      'lastMessageBy',
      'lastMessageText',
    ]);
    expect((w.data.lastMessageText as string).length).toBeLessThanOrEqual(140);
  });

  it('the message carries the broadcast id next to the client fields', () => {
    expect(messageWrite('zed', 'Hallo', 'zed_req', NOW)).toEqual({
      text: 'Hallo',
      authorUid: 'zed',
      createdAt: NOW,
      broadcastId: 'zed_req',
    });
  });
});

// In-memory deps: records claims, packets and the final log.
function world(
  over: Partial<{ role: string | null; mode: unknown; lastSentAt: number | null }> = {}
) {
  const now = 5_000_000_000;
  const logs = new Map<string, BroadcastResult | null>();
  let lockAt: number | null = over.lastSentAt ?? null;
  const packets: { uid: string; threadExists: boolean }[][] = [];
  const finished: BroadcastResult[] = [];
  const active = { email: 'x@y.at', disabled: false, emailVerified: true };
  const recipients: Record<string, RecipientState> = {
    anna: { account: active, blocked: false, allowsDirectMessages: true, threadExists: true },
    bernd: { account: active, blocked: false, allowsDirectMessages: false, threadExists: false },
    carla: { account: active, blocked: true, allowsDirectMessages: true, threadExists: false },
    dora: { account: active, blocked: false, allowsDirectMessages: true, threadExists: false },
  };
  const deps: BroadcastDeps = {
    now: () => now,
    readRoleDoc: async (uid) =>
      uid === 'admin' && over.role !== null ? { role: over.role ?? 'Admin' } : null,
    readMessengerMode: async () => ('mode' in over ? over.mode : 'all'),
    readSender: async () => ({ account: { disabled: false, emailVerified: true }, banned: false }),
    readRecipients: async (_s, uids) =>
      new Map(uids.filter((u) => recipients[u]).map((u) => [u, recipients[u]])),
    readLastSentAt: async () => lockAt,
    claim: async (docId, _record, nowMs): Promise<ClaimOutcome> => {
      if (logs.has(docId)) return { status: 'duplicate', result: logs.get(docId) ?? null };
      const waitMs = broadcastWaitMs(lockAt, nowMs);
      if (waitMs > 0) return { status: 'wait', waitMs };
      logs.set(docId, null);
      lockAt = nowMs;
      return { status: 'claimed' };
    },
    writePacket: async (_s, packet) => {
      packets.push(packet);
    },
    finish: async (docId, _s, result) => {
      logs.set(docId, result);
      finished.push(result);
    },
  };
  return { deps, packets, finished, now, expireLock: () => (lockAt = now - BROADCAST_COOLDOWN_MS) };
}

const call = (data: Record<string, unknown>, uid = 'admin') => ({
  auth: { uid },
  data: {
    recipientUids: ['anna', 'bernd', 'carla', 'dora', 'admin', 'ghost'],
    text: 'Neu!',
    requestId: REQ,
    ...data,
  },
});

describe('sendBroadcastHandler', () => {
  it('refuses everybody but Super-Admins, moderators included', async () => {
    await expect(sendBroadcastHandler(call({}, 'nobody'), world().deps)).rejects.toThrow(
      'Admins only'
    );
    await expect(
      sendBroadcastHandler(call({}), world({ role: 'RegionModerator' }).deps)
    ).rejects.toThrow('Admins only');
    await expect(sendBroadcastHandler({ data: {} }, world().deps)).rejects.toThrow('signed in');
  });

  it('refuses when the Postfach is not open for all members', async () => {
    const w = world({ mode: 'admins' });
    await expect(sendBroadcastHandler(call({ dryRun: true }), w.deps)).rejects.toThrow(
      'nicht für alle Mitglieder'
    );
    expect(w.packets).toEqual([]);
  });

  it('dry run: counts reachable members and reasons, writes nothing', async () => {
    const w = world();
    const res = await sendBroadcastHandler(call({ dryRun: true }), w.deps);
    expect(res).toMatchObject({
      dryRun: true,
      requested: 6,
      sent: 2,
      skipped: 4,
      skipReasons: { no_direct_messages: 1, blocked: 1, self: 1, recipient_inactive: 1 },
      waitMs: 0,
    });
    expect(w.packets).toEqual([]);
    expect(w.finished).toEqual([]);
  });

  it('sends to the reachable members only and logs the result', async () => {
    const w = world();
    const res = await sendBroadcastHandler(call({}), w.deps);
    expect(res).toMatchObject({
      dryRun: false,
      sent: 2,
      skipped: 4,
      failed: 0,
      broadcastId: `admin_${REQ}`,
    });
    expect(w.packets).toEqual([
      [
        { uid: 'anna', threadExists: true },
        { uid: 'dora', threadExists: false },
      ],
    ]);
    expect(w.finished).toHaveLength(1);
  });

  it('a double click with the same request id sends once and returns the first result', async () => {
    const w = world();
    const first = await sendBroadcastHandler(call({}), w.deps);
    const second = await sendBroadcastHandler(call({}), w.deps);
    expect(w.packets).toHaveLength(1);
    expect(second).toEqual({ ...first, alreadyProcessed: true });
  });

  it('a second Sammelnachricht within 10 minutes is refused, afterwards allowed', async () => {
    const w = world();
    await sendBroadcastHandler(call({}), w.deps);
    const dry = await sendBroadcastHandler(
      call({ dryRun: true, requestId: 'req-other-1' }),
      w.deps
    );
    expect(dry.waitMs).toBe(BROADCAST_COOLDOWN_MS);
    await expect(sendBroadcastHandler(call({ requestId: 'req-other-1' }), w.deps)).rejects.toThrow(
      'alle 10 Minuten'
    );
    w.expireLock();
    await expect(
      sendBroadcastHandler(call({ requestId: 'req-other-2' }), w.deps)
    ).resolves.toMatchObject({
      sent: 2,
    });
  });

  it('refuses a send when nobody can receive it', async () => {
    const w = world();
    await expect(
      sendBroadcastHandler(call({ recipientUids: ['bernd', 'carla'] }), w.deps)
    ).rejects.toThrow('Keines der gewählten Mitglieder');
    expect(w.packets).toEqual([]);
  });

  it('a failed packet is counted, the others still go out', async () => {
    const w = world();
    let n = 0;
    const uids = Array.from({ length: BROADCAST_PACKET_SIZE + 5 }, (_, i) => `m${i}`);
    const active = { email: 'x@y.at', disabled: false, emailVerified: true };
    const deps: BroadcastDeps = {
      ...w.deps,
      readRecipients: async (_s, list) =>
        new Map(
          list.map((u) => [
            u,
            { account: active, blocked: false, allowsDirectMessages: true, threadExists: false },
          ])
        ),
      writePacket: async () => {
        n += 1;
        if (n === 1) throw new Error('boom');
      },
    };
    const res = await sendBroadcastHandler(call({ recipientUids: uids }), deps);
    expect(res).toMatchObject({ sent: 5, failed: BROADCAST_PACKET_SIZE, skipped: 0 });
  });
});

describe('members tab helpers', () => {
  it('ticked members win over the chosen list; without either nobody', () => {
    const list = { memberUids: ['a', 'b', 'b'] };
    expect(broadcastRecipients(new Set(['x']), list)).toEqual({ uids: ['x'], source: 'selected' });
    expect(broadcastRecipients(new Set(), list)).toEqual({ uids: ['a', 'b'], source: 'list' });
    expect(broadcastRecipients(new Set(), null)).toEqual({ uids: [], source: null });
  });

  it('every server skip reason has a plain label', () => {
    for (const reason of [
      'self',
      'recipient_inactive',
      'recipient_unverified',
      'blocked',
      'no_direct_messages',
      'write_failed',
    ]) {
      expect(BROADCAST_SKIP_LABELS[reason as keyof typeof BROADCAST_SKIP_LABELS]).toBeTruthy();
    }
    expect(broadcastSkipLines({ blocked: 2, self: 0 })).toEqual(['2 × Blockierung zwischen euch']);
  });
});

describe('mail trigger', () => {
  it('does not stop on a Sammelnachricht: it mails like any private message', () => {
    const src = readFileSync(join(__dirname, '../../functions/src/chat.ts'), 'utf8');
    const body = src.slice(src.indexOf('async function mailDirectMessage'));
    expect(body).not.toContain('isBroadcastMessage');
    expect(body).not.toContain("reason: 'broadcast'");
  });
});
