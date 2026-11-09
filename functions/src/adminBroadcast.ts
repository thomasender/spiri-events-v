/**
 * adminSendBroadcastDm: a Super-Admin sends one text to many members as a
 * normal 1:1 private message from her own account ("Sammelnachricht",
 * Verwaltung -> Mitglieder). Every recipient gets dm_threads/{uidA_uidB} plus a
 * message, written exactly like the Postfach client does (useMessenger.send),
 * so answers land in the admin's own Postfach. See docs/messenger.md.
 *
 * - Super-Admin only (admin_users role 'Admin'); moderators are refused.
 * - The messenger must be open for all ('all'); the sender must be verified,
 *   active and not muted (broadcastRefusal).
 * - Per recipient decideBroadcastRecipient: skips the sender herself, deleted
 *   or disabled accounts, unverified addresses, a block in either direction and
 *   "keine Privatnachrichten" (dm_settings.allowDirectMessages == false).
 * - dryRun: only counts, writes nothing.
 * - At most 500 recipients, one Sammelnachricht per admin every 10 minutes
 *   (admin_broadcast_locks/{uid}), idempotent per client request id
 *   (admin_broadcasts/{uid}_{requestId}): a double click returns the first result.
 * - Messages carry `broadcastId`; onDirectMessageMailNotify sends no e-mail for them.
 * - admin_broadcasts keeps sender, time, counts, skip reasons and the full text;
 *   admin_audit_log gets an entry. Logs carry counts and reasons, never the text.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Timestamp } from 'firebase-admin/firestore';
import { appCheckOptions, logMissingAppCheck } from './appCheck';
import { assertSuperAdmin, readRoleDoc, type RoleDocReader } from './staffRoles';
import { ALLOWED_ORIGINS } from './allowedOrigins';
import { AUDIT_LOG_COLLECTION } from './adminModerators';
import {
  decideBroadcastRecipient,
  isBanActive,
  type BroadcastSkipReason,
  type MailAccount,
} from './chatMailNotify';
import {
  AUTH_LOOKUP_SIZE,
  BROADCAST_COLLECTION,
  BROADCAST_LOCK_COLLECTION,
  BROADCAST_PACKET_SIZE,
  broadcastDocId,
  broadcastRefusal,
  broadcastWaitMessage,
  broadcastWaitMs,
  chunk,
  countReasons,
  messageWrite,
  threadIdFor,
  threadWrite,
  validateBroadcastRequest,
  type BroadcastSender,
  type BroadcastSkipCounts,
} from './adminBroadcastLogic';

if (getApps().length === 0) {
  initializeApp();
}

export interface RecipientState {
  account: MailAccount | null;
  blocked: boolean;
  allowsDirectMessages: boolean;
  threadExists: boolean;
}

export interface BroadcastResult {
  dryRun: boolean;
  /** Distinct members asked for. */
  requested: number;
  /** dryRun: would receive it; send: received it. */
  sent: number;
  skipped: number;
  skipReasons: BroadcastSkipCounts;
  /** Packets that could not be written (send only). */
  failed: number;
  broadcastId: string | null;
  /** dryRun: ms until the next Sammelnachricht is allowed (0 = now). */
  waitMs: number;
  /** The same request id was already processed (double click). */
  alreadyProcessed?: boolean;
}

export type ClaimOutcome =
  | { status: 'claimed' }
  | { status: 'duplicate'; result: BroadcastResult | null }
  | { status: 'wait'; waitMs: number };

export interface BroadcastRecord {
  senderUid: string;
  requestId: string;
  text: string;
  requested: number;
}

export interface BroadcastDeps {
  now: () => number;
  readRoleDoc: RoleDocReader;
  readMessengerMode: () => Promise<unknown>;
  readSender: (uid: string) => Promise<{ account: BroadcastSender['account']; banned: boolean }>;
  readRecipients: (senderUid: string, uids: string[]) => Promise<Map<string, RecipientState>>;
  readLastSentAt: (senderUid: string) => Promise<number | null>;
  /** Transaction: idempotency check, throttle check, then the log doc + lock. */
  claim: (docId: string, record: BroadcastRecord, nowMs: number) => Promise<ClaimOutcome>;
  writePacket: (
    senderUid: string,
    packet: { uid: string; threadExists: boolean }[],
    text: string,
    broadcastId: string
  ) => Promise<void>;
  finish: (docId: string, senderUid: string, result: BroadcastResult) => Promise<void>;
}

interface CallableRequest {
  auth?: { uid?: string } | null;
  data?: unknown;
}

export async function sendBroadcastHandler(
  request: CallableRequest,
  deps: BroadcastDeps
): Promise<BroadcastResult> {
  const senderUid = request.auth?.uid;
  await assertSuperAdmin(senderUid, deps.readRoleDoc);
  const uid = senderUid as string;
  const req = validateBroadcastRequest(request.data);

  const [mode, sender] = await Promise.all([deps.readMessengerMode(), deps.readSender(uid)]);
  const refusal = broadcastRefusal({ mode, account: sender.account, banned: sender.banned });
  if (refusal) throw new HttpsError('failed-precondition', refusal);

  const states = await deps.readRecipients(uid, req.recipientUids);
  const sendable: { uid: string; threadExists: boolean }[] = [];
  const reasons: BroadcastSkipReason[] = [];
  for (const recipientUid of req.recipientUids) {
    const state = states.get(recipientUid);
    const decision = decideBroadcastRecipient({
      senderUid: uid,
      recipientUid,
      recipient: state?.account ?? null,
      blocked: state?.blocked ?? false,
      recipientAllowsDirectMessages: state?.allowsDirectMessages ?? true,
    });
    if (decision.send) sendable.push({ uid: recipientUid, threadExists: !!state?.threadExists });
    else reasons.push(decision.reason);
  }

  const now = deps.now();
  if (req.dryRun) {
    return {
      dryRun: true,
      requested: req.recipientUids.length,
      sent: sendable.length,
      skipped: reasons.length,
      skipReasons: countReasons(reasons),
      failed: 0,
      broadcastId: null,
      waitMs: broadcastWaitMs(await deps.readLastSentAt(uid), now),
    };
  }
  if (sendable.length === 0) {
    throw new HttpsError(
      'failed-precondition',
      'Keines der gewählten Mitglieder kann die Nachricht empfangen.'
    );
  }

  const docId = broadcastDocId(uid, req.requestId);
  const claim = await deps.claim(
    docId,
    {
      senderUid: uid,
      requestId: req.requestId,
      text: req.text,
      requested: req.recipientUids.length,
    },
    now
  );
  if (claim.status === 'wait') {
    throw new HttpsError('resource-exhausted', broadcastWaitMessage(claim.waitMs));
  }
  if (claim.status === 'duplicate') {
    return {
      ...(claim.result ?? {
        dryRun: false,
        requested: req.recipientUids.length,
        sent: 0,
        skipped: 0,
        skipReasons: {},
        failed: 0,
        broadcastId: docId,
        waitMs: 0,
      }),
      alreadyProcessed: true,
    };
  }

  let sent = 0;
  const failedReasons: 'write_failed'[] = [];
  for (const packet of chunk(sendable, BROADCAST_PACKET_SIZE)) {
    try {
      await deps.writePacket(uid, packet, req.text, docId);
      sent += packet.length;
    } catch (err) {
      logger.error('Broadcast packet failed', {
        broadcastId: docId,
        size: packet.length,
        error: err instanceof Error ? err.message : String(err),
      });
      packet.forEach(() => failedReasons.push('write_failed'));
    }
  }
  const result: BroadcastResult = {
    dryRun: false,
    requested: req.recipientUids.length,
    sent,
    skipped: reasons.length,
    skipReasons: countReasons(reasons),
    failed: failedReasons.length,
    broadcastId: docId,
    waitMs: 0,
  };
  await deps.finish(docId, uid, result);
  // Counts and reasons only: the text stays in admin_broadcasts.
  logger.info('Broadcast sent', {
    broadcastId: docId,
    senderUid: uid,
    requested: result.requested,
    sent: result.sent,
    skipped: result.skipped,
    failed: result.failed,
    skipReasons: result.skipReasons,
  });
  return result;
}

function toMillis(value: unknown): number | null {
  const ts = value as Timestamp | undefined;
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : null;
}

async function getAllDocs(
  paths: string[]
): Promise<Map<string, FirebaseFirestore.DocumentSnapshot>> {
  const db = getFirestore();
  const out = new Map<string, FirebaseFirestore.DocumentSnapshot>();
  for (const part of chunk(paths, 300)) {
    const snaps = await db.getAll(...part.map((p) => db.doc(p)));
    snaps.forEach((snap, i) => out.set(part[i], snap));
  }
  return out;
}

const broadcastDeps: BroadcastDeps = {
  now: () => Date.now(),
  readRoleDoc,
  async readMessengerMode() {
    return (await getFirestore().doc('app_settings/messenger').get()).get('mode');
  },
  async readSender(uid) {
    const [user, ban] = await Promise.all([
      getAuth()
        .getUser(uid)
        .catch(() => null),
      getFirestore().doc(`chat_bans/${uid}`).get(),
    ]);
    return {
      account: user ? { disabled: user.disabled, emailVerified: user.emailVerified } : null,
      banned: isBanActive(ban.exists ? toMillis(ban.get('until')) : null, Date.now()),
    };
  },
  async readRecipients(senderUid, uids) {
    const accounts = new Map<string, MailAccount>();
    for (const part of chunk(uids, AUTH_LOOKUP_SIZE)) {
      const res = await getAuth().getUsers(part.map((uid) => ({ uid })));
      for (const u of res.users) {
        accounts.set(u.uid, {
          email: u.email ?? null,
          disabled: u.disabled,
          emailVerified: u.emailVerified,
        });
      }
    }
    const others = uids.filter((u) => u !== senderUid);
    const docs = await getAllDocs(
      others.flatMap((u) => [
        `dm_blocks/${u}_${senderUid}`,
        `dm_blocks/${senderUid}_${u}`,
        `dm_settings/${u}`,
        `dm_threads/${threadIdFor(senderUid, u)}`,
      ])
    );
    const out = new Map<string, RecipientState>();
    for (const u of uids) {
      out.set(u, {
        account: accounts.get(u) ?? null,
        blocked:
          !!docs.get(`dm_blocks/${u}_${senderUid}`)?.exists ||
          !!docs.get(`dm_blocks/${senderUid}_${u}`)?.exists,
        allowsDirectMessages: docs.get(`dm_settings/${u}`)?.get('allowDirectMessages') !== false,
        threadExists: !!docs.get(`dm_threads/${threadIdFor(senderUid, u)}`)?.exists,
      });
    }
    return out;
  },
  async readLastSentAt(senderUid) {
    const snap = await getFirestore().doc(`${BROADCAST_LOCK_COLLECTION}/${senderUid}`).get();
    return snap.exists ? toMillis(snap.get('lastSentAt')) : null;
  },
  async claim(docId, record, nowMs) {
    const db = getFirestore();
    const logRef = db.doc(`${BROADCAST_COLLECTION}/${docId}`);
    const lockRef = db.doc(`${BROADCAST_LOCK_COLLECTION}/${record.senderUid}`);
    return db.runTransaction(async (tx): Promise<ClaimOutcome> => {
      const [logSnap, lockSnap] = await Promise.all([tx.get(logRef), tx.get(lockRef)]);
      if (logSnap.exists) {
        const result = logSnap.get('result');
        return { status: 'duplicate', result: result ? (result as BroadcastResult) : null };
      }
      const waitMs = broadcastWaitMs(
        lockSnap.exists ? toMillis(lockSnap.get('lastSentAt')) : null,
        nowMs
      );
      if (waitMs > 0) return { status: 'wait', waitMs };
      tx.create(logRef, {
        senderUid: record.senderUid,
        requestId: record.requestId,
        text: record.text,
        requestedCount: record.requested,
        status: 'sending',
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(lockRef, { lastSentAt: FieldValue.serverTimestamp(), broadcastId: docId });
      return { status: 'claimed' };
    });
  },
  async writePacket(senderUid, packet, text, broadcastId) {
    const db = getFirestore();
    const batch = db.batch();
    // One server timestamp per batch: summary and message carry the same time,
    // as the dm_threads rules require of a client send.
    const now = FieldValue.serverTimestamp();
    for (const { uid, threadExists } of packet) {
      const threadRef = db.doc(`dm_threads/${threadIdFor(senderUid, uid)}`);
      const thread = threadWrite(senderUid, uid, text, threadExists, now);
      if (thread.kind === 'update') batch.update(threadRef, thread.data);
      // merge: a thread that appeared since the read keeps the other person's readAt.
      else batch.set(threadRef, thread.data, { merge: true });
      batch.set(
        threadRef.collection('messages').doc(),
        messageWrite(senderUid, text, broadcastId, now)
      );
    }
    await batch.commit();
  },
  async finish(docId, senderUid, result) {
    const db = getFirestore();
    const batch = db.batch();
    batch.update(db.doc(`${BROADCAST_COLLECTION}/${docId}`), {
      status: 'done',
      sentCount: result.sent,
      skippedCount: result.skipped,
      failedCount: result.failed,
      skipReasons: result.skipReasons,
      result,
      finishedAt: FieldValue.serverTimestamp(),
    });
    batch.create(db.collection(AUDIT_LOG_COLLECTION).doc(), {
      action: 'sendBroadcastDm',
      actorUid: senderUid,
      broadcastId: docId,
      sentCount: result.sent,
      skippedCount: result.skipped,
      failedCount: result.failed,
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
  },
};

export const adminSendBroadcastDm = onCall(
  {
    region: 'europe-west3',
    cors: ALLOWED_ORIGINS,
    timeoutSeconds: 300,
    ...appCheckOptions(),
  },
  async (request): Promise<BroadcastResult> => {
    logMissingAppCheck('adminSendBroadcastDm', request);
    return sendBroadcastHandler(request, broadcastDeps);
  }
);
