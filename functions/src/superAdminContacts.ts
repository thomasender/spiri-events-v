/**
 * getSuperAdminContacts: staff (Super-Admins and moderators) ask for the uids of the
 * Super-Admins, so the review notice "frage um Hilfe" can open a Postfach conversation
 * with one of them (Trello Hzf5ctgC). `admin_users` is readable only by its owner, so the
 * client cannot list them itself. Only uids are returned.
 */
import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { appCheckOptions, logMissingAppCheck } from './appCheck';
import { ALLOWED_ORIGINS } from './allowedOrigins';
import { assertStaff, SUPER_ADMIN_ROLE } from './staffRoles';

export const getSuperAdminContacts = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request): Promise<{ uids: string[] }> => {
    logMissingAppCheck('getSuperAdminContacts', request);
    await assertStaff(request.auth?.uid);
    const snap = await getFirestore()
      .collection('admin_users')
      .where('role', '==', SUPER_ADMIN_ROLE)
      .get();
    return { uids: snap.docs.map((d) => d.id).sort() };
  }
);
