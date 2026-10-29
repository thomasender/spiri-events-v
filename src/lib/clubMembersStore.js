import { collectionGroup, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase';

// One shared, live set of the uids of all Vereinsmitglieder
// (`users/{uid}/publicProfile/data.clubMember == true`). Every avatar on the
// page only asks `uids.has(uid)`, so there is one listener per session instead
// of one read per avatar. Always the live public profile, never the copies of
// name/photo stored on events or chat messages (those are stale and written by
// their author). Readable without login, like the directory.
//
// The listener starts with the first subscriber and then stays open for the
// session: avatars mount and unmount on every navigation, and restarting the
// query each time would re-read the whole set.

let state = { ready: false, uids: new Set() };
const listeners = new Set();
let started = false;

function setState(next) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function start() {
  started = true;
  try {
    onSnapshot(
      query(collectionGroup(db, 'publicProfile'), where('clubMember', '==', true)),
      (snap) =>
        setState({
          ready: true,
          uids: new Set(snap.docs.map((d) => d.ref.parent.parent?.id).filter(Boolean)),
        }),
      (err) => {
        // e.g. the collection-group index is still building: no badges, no crash.
        console.warn('Club member list unavailable:', err?.code || err);
        setState({ ready: true, uids: new Set() });
      }
    );
  } catch (err) {
    console.warn('Club member list unavailable:', err);
    setState({ ready: true, uids: new Set() });
  }
}

export function subscribe(listener) {
  listeners.add(listener);
  if (!started) start();
  return () => listeners.delete(listener);
}

export function getSnapshot() {
  return state;
}
