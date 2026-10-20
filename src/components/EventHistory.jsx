import { History } from 'lucide-react';
import { useEventRevisions } from '../hooks/useEventRevisions';
import { diffWords } from '../utils/wordDiff';
import { stripHtml } from '../utils/sanitize';
import './EventHistory.css';

const FIELD_LABELS = {
  title: 'Titel',
  description: 'Beschreibung',
  date: 'Datum',
  endDate: 'Enddatum',
  time: 'Beginn',
  endTime: 'Ende',
  place: 'Adresse',
  city: 'Ort',
  bezirk: 'Bezirk',
  category: 'Kategorie',
  contribution: 'Beitrag',
  fee: 'Preis',
  feeMax: 'Preis bis',
  priceCurrency: 'Währung',
  feeNote: 'Preis-Hinweis',
  firstSessionFree: 'Erste Einheit gratis',
  link: 'Link',
  recurrence: 'Wiederholung',
  recurrenceEndDate: 'Wiederholung bis',
  customDates: 'Termine',
  exceptionDates: 'Ausnahmen',
  isOnline: 'Online',
  organizer: 'Veranstalter',
  kontakt: 'Kontakt',
  imageUrl: 'Bild',
  imageThumbUrl: 'Vorschaubild',
  imageFocalPoint: 'Bildausschnitt',
  imageZoom: 'Bild-Zoom',
  instagramImage: 'Instagram-Bild',
  instagramConsent: 'Instagram-Einwilligung',
  instagramHandleOverride: 'Instagram-Handle',
  cancelled: 'Abgesagt',
  cancelledDates: 'Abgesagte Termine',
};

const IMAGE_FIELDS = new Set(['imageUrl', 'imageThumbUrl', 'instagramImage']);

const STATUS_LABELS = {
  draft: 'Entwurf',
  pending: 'Im Review',
  approved: 'Genehmigt',
  trashed: 'Papierkorb',
};

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString('de-DE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatValue(field, value) {
  if (value === null || value === undefined || value === '') return '–';
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nein';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '–';
  if (typeof value === 'object') {
    if (field === 'organizer') {
      return [value.firstName, value.lastName, value.name].filter(Boolean).join(' ') || '–';
    }
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
  }
  return String(value);
}

function DiffText({ before, after }) {
  const segments = diffWords(before, after);
  return (
    <p className="event-history-diff">
      {segments.map((seg, i) =>
        seg.type === 'same' ? (
          <span key={i}>{seg.text}</span>
        ) : seg.type === 'del' ? (
          <del key={i}>{seg.text}</del>
        ) : (
          <ins key={i}>{seg.text}</ins>
        )
      )}
    </p>
  );
}

function ChangeRow({ field, change }) {
  const label = FIELD_LABELS[field] || field;
  let body;
  if (field === 'description') {
    body = <DiffText before={stripHtml(change.from || '')} after={stripHtml(change.to || '')} />;
  } else if (IMAGE_FIELDS.has(field)) {
    body = <p className="event-history-simple">Bild geändert</p>;
  } else {
    body = (
      <p className="event-history-simple">
        <del>{formatValue(field, change.from)}</del> → <ins>{formatValue(field, change.to)}</ins>
      </p>
    );
  }
  return (
    <li className="event-history-change" data-testid={`history-change-${field}`}>
      <span className="event-history-field">{label}</span>
      {body}
    </li>
  );
}

export function RevisionEntry({ revision }) {
  const { statusFrom, statusTo, changes = {} } = revision;
  const statusChanged = statusFrom !== statusTo && statusTo;
  const fields = Object.keys(changes);
  const who =
    revision.byRole === 'System'
      ? 'System'
      : `${revision.byName || 'Unbekannt'} (${revision.byRole === 'Admin' ? 'Admin' : 'Veranstalter'})`;
  return (
    <li className="event-history-entry" data-testid="history-entry">
      <div className="event-history-meta">
        <strong>{who}</strong>
        <span>{formatTime(revision.at)}</span>
      </div>
      {statusChanged && (
        <p className="event-history-status">
          Status: {STATUS_LABELS[statusFrom] || statusFrom || '–'} →{' '}
          <strong>{STATUS_LABELS[statusTo] || statusTo}</strong>
        </p>
      )}
      {fields.length > 0 && (
        <ul className="event-history-changes">
          {fields.map((field) => (
            <ChangeRow key={field} field={field} change={changes[field]} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function EventHistory({ eventId }) {
  const { revisions, loading } = useEventRevisions(eventId);

  return (
    <section className="event-history" data-testid="event-history" aria-label="Änderungsverlauf">
      <div className="event-history-header">
        <History size={20} />
        <h2>Änderungsverlauf</h2>
        <span className="event-history-hint">Nur für Admins sichtbar</span>
      </div>
      {loading ? null : revisions.length === 0 ? (
        <p className="event-history-empty">Noch keine Änderungen aufgezeichnet.</p>
      ) : (
        <ol className="event-history-list">
          {revisions.map((revision) => (
            <RevisionEntry key={revision.id} revision={revision} />
          ))}
        </ol>
      )}
    </section>
  );
}
