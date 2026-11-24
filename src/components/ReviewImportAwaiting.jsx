import { useMemo } from 'react';
import { Hourglass, ChevronDown } from 'lucide-react';
import { useLastOutreach } from '../hooks/useImportData';
import { CONSENT_LABELS } from '../utils/eventImport';

function toDate(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

/** What is known about the organizer's answer (German), from the organizer doc and the last mail. */
export function organizerStatusText(organizer, outreach) {
  if (!organizer) return 'Veranstalter nicht gefunden';
  if (organizer.syncMode === 'self_managed' && organizer.consent !== 'claimed') {
    return 'will die Events selbst verwalten, Zustimmung fehlt noch';
  }
  const sentAt = toDate(outreach?.sentAt);
  if (outreach && outreach.status === 'failed') return 'Mail konnte nicht gesendet werden';
  if (organizer.consent === 'asked' || (sentAt && organizer.consent === 'none')) {
    return sentAt
      ? `Mail gesendet am ${sentAt.toLocaleDateString('de-AT')}, noch keine Antwort`
      : 'angeschrieben, noch keine Antwort';
  }
  if (organizer.consent === 'claimed') return 'hat die Events übernommen, Zustimmung fehlt noch';
  return CONSENT_LABELS[organizer.consent] ?? 'noch nicht angeschrieben';
}

// Reads the last mail of one organizer: rendered for Super-Admins only (import_* rules).
function LiveStatus({ organizer }) {
  const outreach = useLastOutreach(organizer.id);
  return organizerStatusText(organizer, outreach);
}

/**
 * Imported events whose organizer has not consented yet, grouped by organizer. The team cannot
 * approve them (docs/event-import.md): they only wait for the answer to the one outreach mail.
 */
export default function ReviewImportAwaiting({
  events,
  organizers,
  isSuperAdmin,
  open,
  onToggle,
  renderRow,
}) {
  const groups = useMemo(() => {
    const byOrganizer = new Map();
    events.forEach((event) => {
      const key = event.curation?.organizerRef || 'unknown';
      if (!byOrganizer.has(key)) byOrganizer.set(key, []);
      byOrganizer.get(key).push(event);
    });
    return [...byOrganizer.entries()]
      .map(([id, items]) => ({ id, items, organizer: organizers?.[id] ?? null }))
      .sort((a, b) => (a.organizer?.name || '').localeCompare(b.organizer?.name || '', 'de'));
  }, [events, organizers]);

  return (
    <section
      className="review-section review-section--import"
      data-testid="review-section-import-awaiting"
    >
      <div className="review-section-header">
        <h2 className="review-section-title">
          <button
            type="button"
            className="review-toggle"
            aria-expanded={open}
            aria-controls="review-section-import-awaiting-body"
            onClick={onToggle}
            data-testid="review-toggle-import-awaiting"
          >
            <Hourglass size={20} aria-hidden="true" />
            <span>Import: wartet auf den Veranstalter</span>
            <span className="review-section-count" data-testid="review-section-import-count">
              {events.length}
            </span>
            <ChevronDown
              size={18}
              aria-hidden="true"
              className={`review-toggle-chevron${open ? ' is-open' : ''}`}
            />
          </button>
        </h2>
        <p className="review-section-hint">
          Importierte Events. Sie werden erst öffentlich, wenn der Veranstalter über den
          Vorschau-Link zugestimmt hat. Das Team muss hier nichts entscheiden.
        </p>
      </div>
      <div id="review-section-import-awaiting-body" hidden={!open}>
        {groups.map(({ id, items, organizer }) => (
          <div key={id} className="review-subsection" data-testid={`review-import-organizer-${id}`}>
            <h3 className="review-subsection-title">
              {organizer?.name || 'Importierter Veranstalter'}
              <span className="review-subsection-count">{items.length}</span>
            </h3>
            {isSuperAdmin && (
              <p className="review-subsection-hint" data-testid={`review-import-status-${id}`}>
                Stand:{' '}
                {organizer ? <LiveStatus organizer={organizer} /> : organizerStatusText(null)}
              </p>
            )}
            <div className="event-list-rows">{items.map((event) => renderRow(event))}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
