import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { chatPhotoUrl } from '../utils/chat';

// Name, photo and public profile slug of a member, from the public profile.
// Cached per page load: names rarely change and the inbox asks for many people.
const cache = new Map();
const pending = new Map();

const DELETED = { name: 'Gelöschtes Mitglied', photoURL: null, slug: '', exists: false };

function fetchMember(uid) {
  if (cache.has(uid)) return Promise.resolve(cache.get(uid));
  if (!pending.has(uid)) {
    pending.set(
      uid,
      getDoc(doc(db, 'users', uid, 'publicProfile', 'data'))
        .then((snap) => {
          const data = snap.exists() ? snap.data() : null;
          const info = data
            ? {
                name: (data.displayName || '').trim() || 'Mitglied',
                photoURL: chatPhotoUrl(data.photoURL),
                slug: typeof data.slug === 'string' ? data.slug : '',
                exists: true,
              }
            : DELETED;
          cache.set(uid, info);
          return info;
        })
        .catch(() => ({ ...DELETED, name: 'Mitglied' }))
        .finally(() => pending.delete(uid))
    );
  }
  return pending.get(uid);
}

export function useMemberInfo(uid) {
  const [info, setInfo] = useState(() => (uid ? (cache.get(uid) ?? null) : null));

  useEffect(() => {
    let cancelled = false;
    if (!uid) {
      setInfo(null);
      return undefined;
    }
    fetchMember(uid).then((value) => !cancelled && setInfo(value));
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return info;
}

// Many at once, e.g. for the conversation list: { [uid]: info } fills in as it loads.
export function useMemberInfos(uids) {
  const key = [...new Set(uids.filter(Boolean))].sort().join(',');
  const [infos, setInfos] = useState(() =>
    Object.fromEntries(
      key
        .split(',')
        .filter((u) => u && cache.has(u))
        .map((u) => [u, cache.get(u)])
    )
  );

  useEffect(() => {
    let cancelled = false;
    key
      .split(',')
      .filter(Boolean)
      .forEach((uid) => {
        fetchMember(uid).then((value) => {
          if (!cancelled)
            setInfos((prev) => (prev[uid] === value ? prev : { ...prev, [uid]: value }));
        });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return infos;
}
