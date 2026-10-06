// Production helper for the Instagram automation (uses scripts/service-account.json).
//
//   node scripts/instagram-admin.mjs status              kill switch + token + last posts
//   node scripts/instagram-admin.mjs switch on|off       set app_settings/instagram.enabled
//   node scripts/instagram-admin.mjs test-event          create a future draft test event (consent = true)
//   node scripts/instagram-admin.mjs approve <eventId>   draft -> approved (this triggers the post!)
//   node scripts/instagram-admin.mjs post <eventId>      show instagram_posts/feed_<eventId>
//   node scripts/instagram-admin.mjs cleanup <eventId>   delete test event + its instagram_posts doc
//
// A real post to the live account is created by `approve` while the switch is on.
// Delete that post by hand in the Instagram app afterwards (the API cannot delete media).
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';

const sa = JSON.parse(readFileSync('scripts/service-account.json', 'utf8'));
initializeApp({ credential: cert(sa), projectId: 'spirieventsvbg' });
const db = getFirestore();

const [cmd, arg] = process.argv.slice(2);
const iso = (v) => v?.toDate?.()?.toISOString?.() ?? v ?? null;

async function status() {
  const s = await db.doc('app_settings/instagram').get();
  const d = s.data() ?? {};
  console.log('Kill-Switch enabled:', d.enabled === true, s.exists ? '' : '(Dokument existiert nicht = aus)');
  console.log('Token läuft ab:', iso(d.tokenExpiresAt), '| zuletzt erneuert:', iso(d.tokenRefreshedAt));
  console.log('Token-Fehler:', d.tokenRefreshError ?? null);
  const posts = await db.collection('instagram_posts').orderBy('createdAt', 'desc').limit(10).get();
  console.log(`\nLetzte ${posts.size} Posts:`);
  for (const p of posts.docs) {
    const x = p.data();
    console.log(`- ${p.id}  ${x.status}  ${x.permalink ?? ''}  ${x.error ? 'ERR: ' + x.error : ''}`);
  }
}

switch (cmd) {
  case 'status':
    await status();
    break;
  case 'switch': {
    if (arg !== 'on' && arg !== 'off') throw new Error('Usage: switch on|off');
    await db
      .doc('app_settings/instagram')
      .set(
        { enabled: arg === 'on', updatedAt: FieldValue.serverTimestamp(), updatedBy: 'script' },
        { merge: true }
      );
    console.log('Kill-Switch ist jetzt', arg === 'on' ? 'AN' : 'AUS');
    break;
  }
  case 'test-event': {
    const d = new Date();
    d.setDate(d.getDate() + 10);
    const date = d.toISOString().split('T')[0];
    const id = `ig-test-${Date.now()}`;
    await db.collection('events').doc(id).set({
      title: 'Test: Instagram Automation (bitte ignorieren)',
      slug: id,
      date,
      endDate: null,
      time: '19:00',
      endTime: '20:30',
      place: 'Testort, Dornbirn',
      description: '<p>Dies ist ein automatischer Test der Instagram-Anbindung. Bitte ignorieren.</p>',
      category: 'Sonstiges',
      bezirk: 'Dornbirn',
      organizer: { firstName: 'Test', lastName: 'Script', email: null, photoURL: null },
      status: 'draft',
      instagramConsent: true,
      createdBy: 'instagram-test',
      createdAt: Timestamp.now(),
    });
    console.log('Test-Event angelegt (draft):', id, '| Datum:', date);
    console.log(`Nächster Schritt: node scripts/instagram-admin.mjs approve ${id}`);
    break;
  }
  case 'approve': {
    if (!arg) throw new Error('Usage: approve <eventId>');
    await db.doc(`events/${arg}`).update({ status: 'approved', updatedAt: Timestamp.now() });
    console.log('Freigegeben. Die Function läuft jetzt (ca. 10-60 s).');
    console.log(`Ergebnis ansehen: node scripts/instagram-admin.mjs post ${arg}`);
    break;
  }
  case 'post': {
    if (!arg) throw new Error('Usage: post <eventId>');
    const s = await db.doc(`instagram_posts/feed_${arg}`).get();
    console.log(s.exists ? JSON.stringify(s.data(), (k, v) => (v?.toDate ? v.toDate().toISOString() : v), 2) : 'noch kein Dokument');
    break;
  }
  case 'cleanup': {
    if (!arg || !arg.startsWith('ig-test-')) throw new Error('Nur Test-Events (ig-test-*) werden gelöscht');
    await db.doc(`events/${arg}`).delete();
    await db.doc(`instagram_posts/feed_${arg}`).delete();
    console.log('Test-Event und Post-Dokument gelöscht. Den Instagram-Post selbst manuell in der App löschen!');
    break;
  }
  default:
    console.log('Befehle: status | switch on|off | test-event | approve <id> | post <id> | cleanup <id>');
}
process.exit(0);
