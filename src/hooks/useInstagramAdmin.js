import { useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

function toDate(value) {
  return value && typeof value.toDate === 'function' ? value.toDate() : null;
}

// Live view of app_settings/instagram (kill switch + non-secret token status).
// A missing document means automation is off.
export function useInstagramSettings(enabled) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) return undefined;
    return onSnapshot(
      doc(db, 'app_settings', 'instagram'),
      (snap) => {
        const data = snap.exists() ? snap.data() : {};
        setSettings({
          enabled: data.enabled === true,
          tokenExpiresAt: toDate(data.tokenExpiresAt),
          tokenRefreshedAt: toDate(data.tokenRefreshedAt),
          tokenRefreshError:
            typeof data.tokenRefreshError === 'string' && data.tokenRefreshError
              ? data.tokenRefreshError
              : null,
        });
        setLoading(false);
      },
      (err) => {
        console.error('useInstagramSettings error:', err);
        setError(err);
        setLoading(false);
      }
    );
  }, [enabled]);

  return { settings, loading, error };
}

// Live list of instagram_posts, newest first, with the event title looked up
// once per event (falls back to the eventId in the UI when it is gone).
export function useInstagramPosts(enabled) {
  const [posts, setPosts] = useState([]);
  const [titles, setTitles] = useState({});
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const q = query(collection(db, 'instagram_posts'), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        setPosts(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              eventId: data.eventId || d.id.replace(/^feed_/, ''),
              status: data.status,
              attempts: data.attempts ?? 0,
              permalink: data.permalink || null,
              error: data.error || null,
              createdAt: toDate(data.createdAt),
            };
          })
        );
        setLoading(false);
      },
      (err) => {
        console.error('useInstagramPosts error:', err);
        setError(err);
        setLoading(false);
      }
    );
  }, [enabled]);

  useEffect(() => {
    const missing = posts.map((p) => p.eventId).filter((id) => !(id in titles));
    if (missing.length === 0) return undefined;
    let cancelled = false;
    Promise.all(
      [...new Set(missing)].map(async (id) => {
        try {
          const snap = await getDoc(doc(db, 'events', id));
          return [id, snap.exists() ? snap.data().title || null : null];
        } catch {
          return [id, null];
        }
      })
    ).then((entries) => {
      if (!cancelled) setTitles((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
    return () => {
      cancelled = true;
    };
  }, [posts, titles]);

  return { posts, titles, loading, error };
}

// Approved events whose organizer consented to Instagram but that have no
// instagram_posts record (e.g. approved while the automation was switched
// off). `posts` is the live list from useInstagramPosts; an event drops out
// of the result as soon as a record exists for it, whatever its status.
export function useUnpostedConsentEvents(enabled, posts) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const q = query(
      collection(db, 'events'),
      where('status', '==', 'approved'),
      where('instagramConsent', '==', true)
    );
    return onSnapshot(
      q,
      (snap) => {
        setEvents(
          snap.docs.map((d) => {
            const data = d.data();
            return { eventId: d.id, title: data.title || d.id, date: data.date || null };
          })
        );
        setLoading(false);
      },
      (err) => {
        console.error('useUnpostedConsentEvents error:', err);
        setError(err);
        setLoading(false);
      }
    );
  }, [enabled]);

  const posted = new Set(posts.map((p) => p.eventId));
  return {
    events: events.filter((e) => !posted.has(e.eventId)),
    loading,
    error,
  };
}
