import { useState } from 'react';
import { bezirkLabel } from '../utils/regions';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  Archive,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Eye,
  ExternalLink,
  RefreshCw,
  Send,
  SkipForward,
} from 'lucide-react';
import { db, functions } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import ConfirmDialog from './ConfirmDialog';
import {
  useInstagramSettings,
  useInstagramPosts,
  useUnpostedConsentEvents,
} from '../hooks/useInstagramAdmin';
import './InstagramTab.css';

export const TOKEN_WARNING_DAYS = 14;

const STATUS_LABELS = {
  publishing: 'Wird veröffentlicht',
  published: 'Veröffentlicht',
  failed: 'Fehlgeschlagen',
  skipped: 'Übersprungen',
  archived: 'Archiviert',
};

const OUTCOME_MESSAGES = {
  archived: 'Der Beitrag wurde ins Archiv verschoben.',
  published: 'Der Beitrag wurde veröffentlicht.',
  failed: 'Der Versuch ist erneut fehlgeschlagen. Details stehen in der Liste.',
  skipped: 'Das Event liegt in der Vergangenheit und wurde übersprungen.',
  disabled: 'Die Automatik ist ausgeschaltet. Bitte zuerst einschalten.',
  'no-consent': 'Der Veranstalter hat der Veröffentlichung auf Instagram nicht zugestimmt.',
  region: 'Es werden nur Events aus Vorarlberg auf Instagram gepostet.',
  duplicate: 'Es existiert bereits ein Eintrag für dieses Event.',
};

// Why a post was skipped, in plain words. Records written before the reason
// was stored have none.
export function describeSkipReason(skipReason) {
  if (skipReason === 'past-event') {
    return 'Das Event lag beim Genehmigen bereits in der Vergangenheit.';
  }
  if (skipReason === 'admin') return 'Ein Admin hat den Beitrag übersprungen.';
  return 'Grund unbekannt (älterer Eintrag).';
}

const CAROUSEL_RESULT_LABELS = {
  published: 'veröffentlicht',
  failed: 'fehlgeschlagen',
  duplicate: 'bereits vorhanden, nicht erneut gepostet',
};

// Groups of the dry run that would really be posted: a record in any status
// (even failed) blocks a second post for the same Bezirk and week.
export function postableCarouselGroups(preview) {
  return (preview?.groups ?? []).filter((g) => !g.existingStatus);
}

// Plain-language reasons why events of the week are not in the carousels,
// each with the events behind it (title, date, Bezirk).
export function describeCarouselSummary(summary) {
  if (!summary) return [];
  const details = summary.details ?? {};
  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const reasons = [
    [
      'withoutConsent',
      (n) => `${count(n, 'Termin', 'Termine')} ohne Zustimmung des Veranstalters zu Instagram`,
    ],
    [
      'regionExcluded',
      (n) =>
        `${count(n, 'Termin', 'Termine')} aus einer anderen Region (nur Vorarlberg wird gepostet)`,
    ],
    ['online', (n) => `${count(n, 'Online-Termin', 'Online-Termine')} (kommt nicht ins Karussell)`],
    ['otherRegion', (n) => `${count(n, 'Termin', 'Termine')} ohne passenden Bezirk`],
    ['notApproved', (n) => `${count(n, 'Termin', 'Termine')} noch nicht genehmigt`],
  ];
  return reasons
    .filter(([key]) => summary[key] > 0)
    .map(([key, label]) => ({
      key,
      text: label(summary[key]),
      events: (details[key] ?? []).map((e) => ({
        id: e.id,
        text: `${e.date} · ${e.title}${e.bezirk ? ` (${bezirkLabel(e.bezirk)})` : ''}`,
      })),
    }));
}

function formatDate(date) {
  return date ? date.toLocaleDateString('de-AT') : '–';
}

function formatDateTime(date) {
  return date ? date.toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' }) : '–';
}

export function daysUntil(date, now = new Date()) {
  return Math.floor((date.getTime() - now.getTime()) / 86400000);
}

const POST_SECTIONS = [
  {
    id: 'failed',
    title: 'Fehlgeschlagen',
    statuses: ['failed', 'publishing'],
    empty: 'Keine fehlgeschlagenen Beiträge.',
  },
  {
    id: 'skipped',
    title: 'Übersprungen',
    statuses: ['skipped'],
    empty: 'Keine übersprungenen Beiträge.',
  },
  {
    id: 'published',
    title: 'Bereits veröffentlichte Beiträge',
    statuses: ['published'],
    empty: 'Noch keine veröffentlichten Beiträge.',
  },
  {
    id: 'archived',
    title: 'Archiv',
    statuses: ['archived'],
    empty: 'Das Archiv ist leer.',
  },
];

// Card whose body is hidden until the heading is clicked; the count sits in a
// pill next to the title (same look as the filter chips).
function CollapsibleSection({ id, title, count, testId, children }) {
  const [open, setOpen] = useState(false);
  const panelId = `instagram-panel-${id}`;
  return (
    <div className="instagram-card" data-testid={testId}>
      <h2 className="instagram-collapsible-heading">
        <button
          type="button"
          className="instagram-collapsible-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          data-testid={`instagram-toggle-${id}`}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? (
            <ChevronDown size={18} aria-hidden="true" />
          ) : (
            <ChevronRight size={18} aria-hidden="true" />
          )}
          {title}
          {count !== null && count !== undefined && (
            <span className="instagram-count-pill" data-testid={`instagram-count-${id}`}>
              {count}
            </span>
          )}
        </button>
      </h2>
      {open && (
        <div id={panelId} className="instagram-collapsible-panel">
          {children}
        </div>
      )}
    </div>
  );
}

export default function InstagramTab() {
  const { user, role } = useAuth();
  const isAdmin = role === 'Admin';
  const {
    settings,
    loading: settingsLoading,
    error: settingsError,
  } = useInstagramSettings(isAdmin);
  const { posts, titles, loading: postsLoading, error: postsError } = useInstagramPosts(isAdmin);
  const { events: unposted, error: unpostedError } = useUnpostedConsentEvents(isAdmin, posts);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [carouselBusy, setCarouselBusy] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!isAdmin) return null;

  const enabled = settings?.enabled === true;

  const toggle = async () => {
    setSaving(true);
    setError(null);
    try {
      await setDoc(
        doc(db, 'app_settings', 'instagram'),
        { enabled: !enabled, updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null },
        { merge: true }
      );
    } catch (err) {
      console.error('Instagram toggle failed:', err);
      setError('Speichern fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (post, callableName, extra = {}) => {
    setBusyId(post.id);
    setError(null);
    setMessage(null);
    try {
      const result = await httpsCallable(functions, callableName, { timeout: 540000 })({
        eventId: post.eventId,
        ...extra,
      });
      const outcome = result?.data?.outcome;
      setMessage(OUTCOME_MESSAGES[outcome] || 'Erledigt.');
    } catch (err) {
      console.error(`${callableName} failed:`, err?.code, err?.message);
      setError(
        err?.code === 'functions/failed-precondition'
          ? 'Nicht möglich: Das Event ist nicht (mehr) genehmigt oder der Beitrag ist bereits veröffentlicht.'
          : `Aktion fehlgeschlagen (${err?.code || 'unbekannt'}). Bitte erneut versuchen.`
      );
    } finally {
      setBusyId(null);
    }
  };

  const loadPreview = async () => {
    setCarouselBusy('preview');
    setError(null);
    setMessage(null);
    try {
      const result = await httpsCallable(functions, 'adminPreviewWeeklyCarousels')();
      setPreview(result?.data ?? null);
    } catch (err) {
      console.error('adminPreviewWeeklyCarousels failed:', err?.code, err?.message);
      setError(`Vorschau fehlgeschlagen (${err?.code || 'unbekannt'}). Bitte erneut versuchen.`);
    } finally {
      setCarouselBusy(null);
    }
  };

  const postCarousels = async () => {
    setCarouselBusy('post');
    setError(null);
    setMessage(null);
    try {
      const result = await httpsCallable(functions, 'adminPostWeeklyCarousels', {
        timeout: 540000,
      })();
      const data = result?.data;
      if (data?.status === 'disabled') {
        setMessage(OUTCOME_MESSAGES.disabled);
      } else {
        const summary = (data?.results ?? [])
          .map((r) => `${r.id}: ${CAROUSEL_RESULT_LABELS[r.outcome] || r.outcome}`)
          .join(' · ');
        setMessage(summary ? `Karussells: ${summary}` : 'Es gab keine Karussells zu posten.');
      }
      setConfirmOpen(false);
      setPreview(null);
    } catch (err) {
      console.error('adminPostWeeklyCarousels failed:', err?.code, err?.message);
      setError(`Posten fehlgeschlagen (${err?.code || 'unbekannt'}). Bitte Liste prüfen.`);
      setConfirmOpen(false);
    } finally {
      setCarouselBusy(null);
    }
  };

  const postable = postableCarouselGroups(preview);

  const expiresAt = settings?.tokenExpiresAt ?? null;
  const daysLeft = expiresAt ? daysUntil(expiresAt) : null;
  const tokenWarn = daysLeft !== null && daysLeft < TOKEN_WARNING_DAYS;

  return (
    <section className="instagram-tab" data-testid="instagram-tab">
      <p className="instagram-description">
        Genehmigte Events werden automatisch auf Instagram gepostet, solange die Automatik
        eingeschaltet ist.
      </p>

      {(settingsError || postsError || unpostedError) && (
        <p className="instagram-error" role="alert">
          Daten konnten nicht geladen werden.
        </p>
      )}
      {error && (
        <p className="instagram-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="instagram-info" role="status">
          {message}
        </p>
      )}

      <p className="instagram-muted" data-testid="instagram-region-note">
        Es werden nur Events aus Vorarlberg gepostet.
      </p>

      <div className="instagram-card">
        <div className="instagram-switch-row">
          <div>
            <h2>Automatisches Posten</h2>
            <p
              className={`instagram-state instagram-state--${enabled ? 'on' : 'off'}`}
              data-testid="instagram-state"
            >
              {enabled ? 'Eingeschaltet' : 'Ausgeschaltet'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Automatisches Posten auf Instagram"
            className={`instagram-switch${enabled ? ' instagram-switch--on' : ''}`}
            onClick={toggle}
            disabled={saving || settingsLoading}
            data-testid="instagram-toggle"
          >
            <span className="instagram-switch-knob" />
          </button>
        </div>
      </div>

      <div className="instagram-card" data-testid="instagram-carousel">
        <h2>Wöchentliche Karussells</h2>
        <p className="instagram-muted">
          Jeden Sonntag um 10:00 Uhr entsteht pro Bezirk ein Karussell mit den Events der nächsten
          Woche. Hier siehst du vorab, was gepostet würde, und kannst es sofort veröffentlichen. Was
          schon gepostet wurde, wird am Sonntag nicht noch einmal gepostet.
        </p>
        <div className="instagram-post-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={loadPreview}
            disabled={carouselBusy !== null}
            data-testid="instagram-carousel-preview"
          >
            <Eye size={14} aria-hidden="true" />{' '}
            {carouselBusy === 'preview' ? 'Lade …' : 'Vorschau (Trockenlauf)'}
          </button>
        </div>

        {preview && (
          <div data-testid="instagram-carousel-result">
            <p className="instagram-muted">
              Woche {preview.weekLabel}. Es wird noch nichts gepostet.
            </p>
            {preview.summary && (
              <div data-testid="instagram-carousel-summary">
                <p className="instagram-muted">
                  In dieser Woche gibt es{' '}
                  {preview.summary.total === 1 ? '1 Termin' : `${preview.summary.total} Termine`},{' '}
                  {preview.summary.eligible} davon{' '}
                  {preview.summary.eligible === 1 ? 'kommt' : 'kommen'} ins Karussell.
                </p>
                <ul className="instagram-carousel-slides">
                  {describeCarouselSummary(preview.summary).map((reason) => (
                    <li key={reason.key}>
                      <details>
                        <summary>{reason.text}</summary>
                        <ul>
                          {reason.events.map((event, i) => (
                            <li key={`${event.id}-${i}`}>{event.text}</li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {preview.groups.length === 0 ? (
              <p className="instagram-muted" data-testid="instagram-carousel-empty">
                Für diese Woche wird kein Karussell gepostet. Ein Termin kommt ins Karussell, wenn
                er genehmigt ist, der Veranstalter Instagram zugestimmt hat und er nicht online ist.
              </p>
            ) : (
              <ul className="instagram-posts">
                {preview.groups.map((group) => (
                  <li
                    key={group.postId}
                    className="instagram-post"
                    data-testid="instagram-carousel-group"
                  >
                    <div className="instagram-post-main">
                      <strong>
                        {group.label || group.bezirk}
                        {group.parts > 1 ? ` (Teil ${group.part} von ${group.parts})` : ''}
                      </strong>
                      <span className="instagram-muted">
                        {group.events.length} {group.events.length === 1 ? 'Event' : 'Events'}
                      </span>
                      {group.existingStatus && (
                        <span
                          className={`instagram-badge instagram-badge--${group.existingStatus}`}
                          data-testid="instagram-carousel-existing"
                        >
                          {STATUS_LABELS[group.existingStatus] || group.existingStatus} (wird nicht
                          erneut gepostet)
                        </span>
                      )}
                    </div>
                    <ol className="instagram-carousel-slides">
                      <li>
                        Titelfolie: {group.cover.heading} {group.cover.bezirk},{' '}
                        {group.cover.dateRange}
                      </li>
                      {group.events.map((event) => (
                        <li key={event.id}>
                          {event.date} {event.time} – {event.title}
                          {event.place ? ` (${event.place})` : ''}
                          {event.organizerHandle ? ` · ${event.organizerHandle}` : ''}
                        </li>
                      ))}
                    </ol>
                    <pre className="instagram-caption" data-testid="instagram-carousel-caption">
                      {group.caption}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
            {preview.groups.length > 0 && (
              <div className="instagram-post-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setConfirmOpen(true)}
                  disabled={!enabled || postable.length === 0 || carouselBusy !== null}
                  data-testid="instagram-carousel-post"
                >
                  <Send size={14} aria-hidden="true" /> Jetzt veröffentlichen ({postable.length})
                </button>
                {!enabled && (
                  <span className="instagram-muted" data-testid="instagram-carousel-off">
                    Zum Veröffentlichen muss das automatische Posten eingeschaltet sein.
                  </span>
                )}
                {enabled && postable.length === 0 && (
                  <span className="instagram-muted">Alles ist bereits gepostet.</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Karussells jetzt veröffentlichen?"
        message={`${postable.length} ${
          postable.length === 1 ? 'Karussell wird' : 'Karussells werden'
        } auf dem Instagram-Kanal veröffentlicht. Das lässt sich nicht rückgängig machen.`}
        confirmLabel="Jetzt veröffentlichen"
        onConfirm={postCarousels}
        onCancel={() => setConfirmOpen(false)}
        loading={carouselBusy === 'post'}
        danger
      />

      <div className="instagram-card" data-testid="instagram-token">
        <h2>Zugangs-Token</h2>
        {tokenWarn && (
          <p className="instagram-warning" role="alert" data-testid="instagram-token-warning">
            <AlertTriangle size={16} aria-hidden="true" />
            {daysLeft < 0
              ? 'Der Token ist abgelaufen. Bitte umgehend erneuern.'
              : `Der Token läuft in ${daysLeft} Tagen ab. Bitte prüfen, ob die automatische Erneuerung funktioniert.`}
          </p>
        )}
        <dl className="instagram-facts">
          <dt>Läuft ab am</dt>
          <dd data-testid="instagram-token-expiry">
            {expiresAt ? `${formatDate(expiresAt)} (noch ${daysLeft} Tage)` : '–'}
          </dd>
          <dt>Zuletzt erneuert</dt>
          <dd>{formatDateTime(settings?.tokenRefreshedAt ?? null)}</dd>
          <dt>Letzter Fehler</dt>
          <dd data-testid="instagram-token-error">{settings?.tokenRefreshError || 'Keiner'}</dd>
        </dl>
      </div>

      <CollapsibleSection
        id="unposted"
        title="Genehmigt, aber noch nicht gepostet"
        count={unposted.length}
        testId="instagram-unposted"
      >
        <p className="instagram-muted">
          Der Veranstalter hat zugestimmt und das Event liegt noch in der Zukunft, ein Beitrag wurde
          aber noch nicht veröffentlicht (nie versucht, übersprungen oder fehlgeschlagen).
        </p>
        {unposted.length > 0 && (
          <ul className="instagram-posts">
            {unposted.map((event) => (
              <li
                key={event.eventId}
                className="instagram-post"
                data-testid="instagram-unposted-event"
              >
                <div className="instagram-post-main">
                  <strong>{event.title}</strong>
                  <span className="instagram-muted">{event.date || ''}</span>
                  <span className="instagram-muted" data-testid="instagram-unposted-status">
                    {event.postStatus ? STATUS_LABELS[event.postStatus] : 'Noch nicht versucht'}
                  </span>
                </div>
                <div className="instagram-post-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busyId === event.eventId}
                    onClick={() =>
                      runAction(
                        { id: event.eventId, eventId: event.eventId },
                        'adminRetryInstagramPost'
                      )
                    }
                  >
                    <RefreshCw size={14} aria-hidden="true" /> Jetzt posten
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      {POST_SECTIONS.map(({ id, title, statuses, empty }) => {
        const sectionPosts = posts.filter((post) => statuses.includes(post.status));
        return (
          <CollapsibleSection
            key={id}
            id={id}
            title={title}
            count={postsLoading ? null : sectionPosts.length}
            testId={`instagram-section-${id}`}
          >
            {postsLoading ? (
              <p className="instagram-muted">Lade …</p>
            ) : sectionPosts.length === 0 ? (
              <p className="instagram-muted" data-testid={`instagram-empty-${id}`}>
                {empty}
              </p>
            ) : (
              <ul className="instagram-posts">
                {sectionPosts.map((post) => {
                  const postTitle = titles[post.eventId] || post.eventId;
                  const busy = busyId === post.id;
                  return (
                    <li key={post.id} className="instagram-post" data-testid="instagram-post">
                      <div className="instagram-post-main">
                        <strong>{postTitle}</strong>
                        <span
                          className={`instagram-badge instagram-badge--${post.status}`}
                          data-testid="instagram-post-status"
                        >
                          {STATUS_LABELS[post.status] || post.status}
                        </span>
                        <span className="instagram-muted">Versuche: {post.attempts}</span>
                        {post.permalink && (
                          <a href={post.permalink} target="_blank" rel="noopener noreferrer">
                            Auf Instagram ansehen <ExternalLink size={14} aria-hidden="true" />
                          </a>
                        )}
                      </div>
                      {post.status === 'published' && post.inviteFallbackReason && (
                        <span className="instagram-muted" data-testid="instagram-post-no-invite">
                          ohne Einladung
                        </span>
                      )}
                      {post.status === 'skipped' && (
                        <p className="instagram-muted" data-testid="instagram-post-skip-reason">
                          {describeSkipReason(post.skipReason)}
                        </p>
                      )}
                      {post.error && (
                        <p className="instagram-post-error" data-testid="instagram-post-error">
                          {post.error}
                        </p>
                      )}
                      {post.status === 'skipped' && (
                        <div className="instagram-post-actions">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={busy}
                            onClick={() => runAction(post, 'adminRetryInstagramPost')}
                          >
                            <RefreshCw size={14} aria-hidden="true" /> Erneut versuchen
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  'Beitrag trotzdem auf Instagram veröffentlichen, auch wenn das Event schon vorbei ist?'
                                )
                              ) {
                                runAction(post, 'adminRetryInstagramPost', { force: true });
                              }
                            }}
                          >
                            <Send size={14} aria-hidden="true" /> Trotzdem posten
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={busy}
                            onClick={() => runAction(post, 'adminArchiveInstagramPost')}
                          >
                            <Archive size={14} aria-hidden="true" /> Archivieren
                          </button>
                        </div>
                      )}
                      {(post.status === 'failed' || post.status === 'publishing') && (
                        <div className="instagram-post-actions">
                          {post.status === 'failed' && (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              disabled={busy}
                              onClick={() => runAction(post, 'adminRetryInstagramPost')}
                            >
                              <RefreshCw size={14} aria-hidden="true" /> Erneut versuchen
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={busy}
                            onClick={() => runAction(post, 'adminSkipInstagramPost')}
                          >
                            <SkipForward size={14} aria-hidden="true" /> Überspringen
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CollapsibleSection>
        );
      })}
    </section>
  );
}
